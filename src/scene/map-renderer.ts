import * as THREE from 'three';
import type { Satellite } from '../types';
import type { AppConfig, MarkerGroup } from '../types';
import { parseHexColor } from '../config';
import { MAP_W, MAP_H, TWO_PI, FP_RINGS, FP_PTS, DEG2RAD } from '../constants';
import { ORBIT_COLORS } from './orbit-renderer';
import { computeFootprintGrid } from '../astro/footprint';
import { getMapCoordinates } from '../astro/coordinates';
import { calculatePosition } from '../astro/propagator';
import { epochToGmst } from '../astro/epoch';
import { calculateSunPosition } from '../astro/sun';
import { computeApsis2D } from '../astro/apsis';
import { uiStore } from '../stores/ui.svelte';

export interface MapRendererInit {
  dayTex: THREE.Texture;
  nightTex: THREE.Texture;
  satTex: THREE.Texture;
  smallmarkTex: THREE.Texture;
  markerGroups: MarkerGroup[];
  overlay: HTMLElement;
  cfg: AppConfig;
}

export interface MapUpdateParams {
  epoch: number;
  gmstDeg: number;
  cfg: AppConfig;
  satellites: Satellite[];
  hoveredSat: Satellite | null;
  selectedSats: Set<Satellite>;
  cam2dZoom: number;
  camera2d: THREE.OrthographicCamera;
}

export class MapRenderer {
  // 2D scene objects
  mapPlane!: THREE.Mesh;
  mapMaterial!: THREE.ShaderMaterial;
  // Pre-allocated 2D buffers
  private satPoints2d!: THREE.Points;
  private satPosBuffer2d!: THREE.BufferAttribute;
  private satColorBuffer2d!: THREE.BufferAttribute;
  private maxSatVerts2d = 15000 * 3; // 3 offsets per sat
  private hlTrack2d!: THREE.LineSegments;
  private hlTrackBuffer2d!: THREE.BufferAttribute;
  private hlTrackColorBuffer2d!: THREE.BufferAttribute;
  private maxTrackVerts2d = 4001 * 3 * 2 * 20; // 3 offsets, 2 verts per segment, 20 sats
  // 2D footprint
  private footprint2dMesh!: THREE.Mesh;
  private footprint2dPosBuffer!: THREE.BufferAttribute;
  private footprint2dColorBuffer!: THREE.BufferAttribute;
  private footprint2dBorder!: THREE.LineSegments;
  private footprint2dBorderBuffer!: THREE.BufferAttribute;
  private footprint2dBorderColorBuffer!: THREE.BufferAttribute;
  // 2D markers
  private markerPoints2d!: THREE.Points;
  private markerPosBuffer2d!: THREE.BufferAttribute;
  private markerColorBuffer2d!: THREE.BufferAttribute;
  private markerLabels2d: { div: HTMLDivElement; groupId: string; mapX: number; mapY: number }[] = [];
  private markerData2d: { groupId: string; mapX: number; mapY: number; color: THREE.Color }[] = [];
  // 2D apsis
  private apsisPoints2d!: THREE.Points;
  private apsisPosBuffer2d!: THREE.BufferAttribute;
  private apsisColorBuffer2d!: THREE.BufferAttribute;

  constructor(scene2d: THREE.Scene, init: MapRendererInit) {
    const { dayTex, nightTex, satTex, smallmarkTex, markerGroups, overlay, cfg } = init;

    // 2D map plane
    this.mapMaterial = new THREE.ShaderMaterial({
      uniforms: {
        dayTexture: { value: dayTex },
        nightTexture: { value: nightTex },
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
        showNight: { value: 1.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D dayTexture;
        uniform sampler2D nightTexture;
        uniform vec3 sunDir;
        uniform float showNight;
        varying vec2 vUv;
        void main() {
          vec4 day = texture2D(dayTexture, vUv);
          if (showNight < 0.5) {
            gl_FragColor = day;
            return;
          }
          vec4 night = texture2D(nightTexture, vUv);
          float theta = (vUv.x - 0.5) * 6.28318530718;
          float phi = vUv.y * 3.14159265359;
          vec3 normal = vec3(cos(theta)*sin(phi), cos(phi), -sin(theta)*sin(phi));
          float intensity = dot(normal, sunDir);
          float blend = smoothstep(-0.15, 0.15, intensity);
          gl_FragColor = mix(night, day, blend);
        }
      `,
      side: THREE.DoubleSide,
    });

    const planeGeo = new THREE.PlaneGeometry(MAP_W, MAP_H);
    // Flip V coords to compensate for flipY=false on textures
    const planeUv = planeGeo.getAttribute('uv') as THREE.BufferAttribute;
    const planeUvArr = planeUv.array as Float32Array;
    for (let i = 1; i < planeUvArr.length; i += 2) {
      planeUvArr[i] = 1.0 - planeUvArr[i];
    }
    planeUv.needsUpdate = true;
    this.mapPlane = new THREE.Mesh(planeGeo, this.mapMaterial);
    scene2d.add(this.mapPlane);

    // Pre-allocate 2D satellite points buffer
    const satGeo2d = new THREE.BufferGeometry();
    this.satPosBuffer2d = new THREE.BufferAttribute(new Float32Array(this.maxSatVerts2d * 3), 3);
    this.satPosBuffer2d.setUsage(THREE.DynamicDrawUsage);
    this.satColorBuffer2d = new THREE.BufferAttribute(new Float32Array(this.maxSatVerts2d * 3), 3);
    this.satColorBuffer2d.setUsage(THREE.DynamicDrawUsage);
    satGeo2d.setAttribute('position', this.satPosBuffer2d);
    satGeo2d.setAttribute('color', this.satColorBuffer2d);
    satGeo2d.setDrawRange(0, 0);
    this.satPoints2d = new THREE.Points(satGeo2d, new THREE.ShaderMaterial({
      uniforms: { pointTexture: { value: satTex } },
      vertexShader: `
        varying vec3 vColor;
        void main() {
          vColor = color;
          gl_PointSize = 14.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D pointTexture;
        varying vec3 vColor;
        void main() {
          vec4 texel = texture2D(pointTexture, gl_PointCoord);
          if (texel.a > 0.1) {
            gl_FragColor = vec4(vColor * texel.rgb, texel.a);
            return;
          }
          float s = 0.06;
          float na = max(
            max(texture2D(pointTexture, gl_PointCoord + vec2(s, 0.0)).a,
                texture2D(pointTexture, gl_PointCoord - vec2(s, 0.0)).a),
            max(texture2D(pointTexture, gl_PointCoord + vec2(0.0, s)).a,
                texture2D(pointTexture, gl_PointCoord - vec2(0.0, s)).a)
          );
          na = max(na, max(
            max(texture2D(pointTexture, gl_PointCoord + vec2(s, s) * 0.707).a,
                texture2D(pointTexture, gl_PointCoord - vec2(s, s) * 0.707).a),
            max(texture2D(pointTexture, gl_PointCoord + vec2(s, -s) * 0.707).a,
                texture2D(pointTexture, gl_PointCoord - vec2(s, -s) * 0.707).a)
          ));
          if (na > 0.1) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 0.7);
            return;
          }
          discard;
        }
      `,
      transparent: true, depthTest: false, vertexColors: true,
    }));
    this.satPoints2d.frustumCulled = false;
    scene2d.add(this.satPoints2d);

    // Pre-allocate 2D highlight track buffer
    const hlGeo2d = new THREE.BufferGeometry();
    this.hlTrackBuffer2d = new THREE.BufferAttribute(new Float32Array(this.maxTrackVerts2d * 3), 3);
    this.hlTrackBuffer2d.setUsage(THREE.DynamicDrawUsage);
    this.hlTrackColorBuffer2d = new THREE.BufferAttribute(new Float32Array(this.maxTrackVerts2d * 3), 3);
    this.hlTrackColorBuffer2d.setUsage(THREE.DynamicDrawUsage);
    hlGeo2d.setAttribute('position', this.hlTrackBuffer2d);
    hlGeo2d.setAttribute('color', this.hlTrackColorBuffer2d);
    hlGeo2d.setDrawRange(0, 0);
    this.hlTrack2d = new THREE.LineSegments(hlGeo2d, new THREE.LineBasicMaterial({ transparent: true, vertexColors: true }));
    this.hlTrack2d.frustumCulled = false;
    scene2d.add(this.hlTrack2d);

    // 2D footprint mesh (dynamic triangle fill + border, per-vertex color)
    const maxFpVerts = FP_RINGS * FP_PTS * 6 * 3 * 20; // 20 footprints × 3 offsets
    const fpGeo = new THREE.BufferGeometry();
    this.footprint2dPosBuffer = new THREE.BufferAttribute(new Float32Array(maxFpVerts * 3), 3);
    this.footprint2dPosBuffer.setUsage(THREE.DynamicDrawUsage);
    this.footprint2dColorBuffer = new THREE.BufferAttribute(new Float32Array(maxFpVerts * 3), 3);
    this.footprint2dColorBuffer.setUsage(THREE.DynamicDrawUsage);
    fpGeo.setAttribute('position', this.footprint2dPosBuffer);
    fpGeo.setAttribute('color', this.footprint2dColorBuffer);
    fpGeo.setDrawRange(0, 0);
    const cFpFill = parseHexColor(cfg.footprintBg);
    this.footprint2dMesh = new THREE.Mesh(fpGeo, new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true, opacity: cFpFill.a, side: THREE.DoubleSide, depthWrite: false,
    }));
    this.footprint2dMesh.frustumCulled = false;
    scene2d.add(this.footprint2dMesh);

    const maxFpBorderVerts = FP_PTS * 2 * 3 * 20;
    const fpBorderGeo = new THREE.BufferGeometry();
    this.footprint2dBorderBuffer = new THREE.BufferAttribute(new Float32Array(maxFpBorderVerts * 3), 3);
    this.footprint2dBorderBuffer.setUsage(THREE.DynamicDrawUsage);
    this.footprint2dBorderColorBuffer = new THREE.BufferAttribute(new Float32Array(maxFpBorderVerts * 3), 3);
    this.footprint2dBorderColorBuffer.setUsage(THREE.DynamicDrawUsage);
    fpBorderGeo.setAttribute('position', this.footprint2dBorderBuffer);
    fpBorderGeo.setAttribute('color', this.footprint2dBorderColorBuffer);
    fpBorderGeo.setDrawRange(0, 0);
    const cFpBorder = parseHexColor(cfg.footprintBorder);
    this.footprint2dBorder = new THREE.LineSegments(fpBorderGeo, new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true, opacity: cFpBorder.a,
    }));
    this.footprint2dBorder.frustumCulled = false;
    scene2d.add(this.footprint2dBorder);

    // 2D markers (pre-compute map positions from lat/lon)
    const allMarkers: { groupId: string; mapX: number; mapY: number; color: THREE.Color }[] = [];
    for (const group of markerGroups) {
      const color = new THREE.Color(group.color);
      for (const m of group.markers) {
        const mapX = (m.lon / 360.0) * MAP_W;
        const mapY = -(m.lat / 180.0) * MAP_H;
        allMarkers.push({ groupId: group.id, mapX, mapY, color });

        const label = document.createElement('div');
        label.style.cssText = `position:absolute;font-size:11px;color:${group.color};pointer-events:none;white-space:nowrap;display:none;`;
        label.textContent = m.name;
        overlay.appendChild(label);
        this.markerLabels2d.push({ div: label, groupId: group.id, mapX, mapY });
      }
    }
    this.markerData2d = allMarkers;

    const maxMarkerVerts = allMarkers.length * 3; // 3 offsets per marker
    const mGeo2d = new THREE.BufferGeometry();
    this.markerPosBuffer2d = new THREE.BufferAttribute(new Float32Array(maxMarkerVerts * 3), 3);
    this.markerPosBuffer2d.setUsage(THREE.DynamicDrawUsage);
    this.markerColorBuffer2d = new THREE.BufferAttribute(new Float32Array(maxMarkerVerts * 3), 3);
    this.markerColorBuffer2d.setUsage(THREE.DynamicDrawUsage);
    mGeo2d.setAttribute('position', this.markerPosBuffer2d);
    mGeo2d.setAttribute('color', this.markerColorBuffer2d);
    mGeo2d.setDrawRange(0, 0);
    this.markerPoints2d = new THREE.Points(mGeo2d, new THREE.PointsMaterial({
      size: 8, sizeAttenuation: false, vertexColors: true, transparent: true, depthTest: false,
    }));
    this.markerPoints2d.frustumCulled = false;
    scene2d.add(this.markerPoints2d);

    // 2D apsis points (peri/apo markers on map)
    const maxApsisVerts = 20 * 2 * 3; // 20 sats × 2 apsis × 3 offsets
    const apsisGeo2d = new THREE.BufferGeometry();
    this.apsisPosBuffer2d = new THREE.BufferAttribute(new Float32Array(maxApsisVerts * 3), 3);
    this.apsisPosBuffer2d.setUsage(THREE.DynamicDrawUsage);
    this.apsisColorBuffer2d = new THREE.BufferAttribute(new Float32Array(maxApsisVerts * 3), 3);
    this.apsisColorBuffer2d.setUsage(THREE.DynamicDrawUsage);
    apsisGeo2d.setAttribute('position', this.apsisPosBuffer2d);
    apsisGeo2d.setAttribute('color', this.apsisColorBuffer2d);
    apsisGeo2d.setDrawRange(0, 0);
    this.apsisPoints2d = new THREE.Points(apsisGeo2d, new THREE.PointsMaterial({
      size: 10, sizeAttenuation: false, vertexColors: true, transparent: true, depthTest: false,
    }));
    this.apsisPoints2d.frustumCulled = false;
    scene2d.add(this.apsisPoints2d);
  }

  hideMarkerLabels() {
    for (const ml of this.markerLabels2d) ml.div.style.display = 'none';
  }

  detectHover(
    mousePos: THREE.Vector2,
    camera2d: THREE.OrthographicCamera,
    satellites: Satellite[],
    gmstDeg: number,
    cfg: AppConfig,
    hideUnselected: boolean,
    selectedSats: Set<Satellite>,
    cam2dZoom: number,
    touchCount: number,
  ): Satellite | null {
    // Convert mouse position to world 2D coords (screen Y is inverted vs Three.js Y)
    const mouseWorldX = camera2d.left + (mousePos.x / window.innerWidth) * (camera2d.right - camera2d.left);
    const mouseWorldY = camera2d.top + (mousePos.y / window.innerHeight) * (camera2d.bottom - camera2d.top);

    const touchScale = touchCount > 0 || ('ontouchstart' in window) ? 3.0 : 1.0;
    const hitRadius = 12.0 * 1.0 * touchScale / cam2dZoom;
    let closestDist = 9999;
    let hoveredSat: Satellite | null = null;

    for (const sat of satellites) {
      if (hideUnselected && selectedSats.size > 0 && !selectedSats.has(sat)) continue;

      const mc = getMapCoordinates(sat.currentPos, gmstDeg, cfg.earthRotationOffset);
      // Check all 3 x-offsets for wrap-around
      for (const off of [-MAP_W, 0, MAP_W]) {
        const dx = (mc.x + off) - mouseWorldX;
        const dy = -mc.y - mouseWorldY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < hitRadius && dist < closestDist) {
          closestDist = dist;
          hoveredSat = sat;
        }
      }
    }

    return hoveredSat;
  }

  update(params: MapUpdateParams) {
    const { epoch, gmstDeg, cfg, satellites, hoveredSat, selectedSats, cam2dZoom, camera2d } = params;

    // Update map shader sun direction
    this.mapMaterial.uniforms.showNight.value = cfg.showNightLights ? 1.0 : 0.0;
    const sunEci = calculateSunPosition(epoch);
    const earthRotRad = (gmstDeg + cfg.earthRotationOffset) * DEG2RAD;
    const sunEcef = sunEci.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -earthRotRad);
    this.mapMaterial.uniforms.sunDir.value.copy(sunEcef);

    // Build set of sats needing highlight (ground track, footprint, apsis)
    const hlSats: Satellite[] = [];
    for (const sat of selectedSats) {
      if (hlSats.length >= 20) break;
      hlSats.push(sat);
    }
    if (hoveredSat && !selectedSats.has(hoveredSat) && hlSats.length < 20) {
      hlSats.push(hoveredSat);
    }

    const cHL = parseHexColor(cfg.orbitHighlighted);

    // Ground tracks for all highlighted sats (rainbow colors)
    if (hlSats.length > 0) {
      const arr = this.hlTrackBuffer2d.array as Float32Array;
      const col = this.hlTrackColorBuffer2d.array as Float32Array;
      let vi = 0;

      for (let si = 0; si < hlSats.length; si++) {
        const sat = hlSats[si];
        const [cr, cg, cb] = ORBIT_COLORS[si % ORBIT_COLORS.length];
        const segments = Math.min(4000, Math.max(50, Math.floor(400 * cfg.orbitsToDraw)));
        const periodDays = TWO_PI / sat.meanMotion / 86400.0;
        const timeStep = (periodDays * cfg.orbitsToDraw) / segments;

        const trackPts: { x: number; y: number }[] = [];
        for (let j = 0; j <= segments; j++) {
          const t = epoch + j * timeStep;
          const pos = calculatePosition(sat, t);
          const gm = epochToGmst(t);
          trackPts.push(getMapCoordinates(pos, gm, cfg.earthRotationOffset));
        }

        for (let off = -1; off <= 1; off++) {
          const xOff = off * MAP_W;
          for (let j = 1; j <= segments; j++) {
            if (vi + 6 > this.maxTrackVerts2d * 3) break;
            if (Math.abs(trackPts[j].x - trackPts[j - 1].x) < MAP_W * 0.6) {
              arr[vi] = trackPts[j - 1].x + xOff; arr[vi+1] = -trackPts[j - 1].y; arr[vi+2] = 0.02;
              col[vi] = cr; col[vi+1] = cg; col[vi+2] = cb;
              vi += 3;
              arr[vi] = trackPts[j].x + xOff; arr[vi+1] = -trackPts[j].y; arr[vi+2] = 0.02;
              col[vi] = cr; col[vi+1] = cg; col[vi+2] = cb;
              vi += 3;
            }
          }
        }
      }

      this.hlTrackBuffer2d.needsUpdate = true;
      this.hlTrackColorBuffer2d.needsUpdate = true;
      this.hlTrack2d.geometry.setDrawRange(0, vi / 3);
      const mat = this.hlTrack2d.material as THREE.LineBasicMaterial;
      mat.color.setRGB(1, 1, 1); // vertex colors handle tinting
      mat.opacity = cHL.a;
      this.hlTrack2d.visible = vi > 0;
    } else {
      this.hlTrack2d.visible = false;
    }

    // 2D footprints for highlighted sats (per-sat orbit color)
    {
      const fpArr = this.footprint2dPosBuffer.array as Float32Array;
      const fpCol = this.footprint2dColorBuffer.array as Float32Array;
      const bArr = this.footprint2dBorderBuffer.array as Float32Array;
      const bCol = this.footprint2dBorderColorBuffer.array as Float32Array;
      let fvi = 0, bvi = 0;

      for (let si = 0; si < hlSats.length; si++) {
        const sat = hlSats[si];
        const [cr, cg, cb] = ORBIT_COLORS[si % ORBIT_COLORS.length];
        const grid3d = computeFootprintGrid(sat.currentPos);
        if (!grid3d) continue;

        // Project grid to 2D map coords
        const grid2d: { x: number; y: number }[][] = [];
        for (let i = 0; i <= FP_RINGS; i++) {
          const ring: { x: number; y: number }[] = [];
          for (let k = 0; k < FP_PTS; k++) {
            ring.push(getMapCoordinates(grid3d[i][k], gmstDeg, cfg.earthRotationOffset));
          }
          grid2d.push(ring);
        }

        for (let off = -1; off <= 1; off++) {
          const xOff = off * MAP_W;

          // Fill triangles
          for (let i = 0; i < FP_RINGS; i++) {
            for (let k = 0; k < FP_PTS; k++) {
              const next = (k + 1) % FP_PTS;
              const p1 = grid2d[i][k], p2 = grid2d[i][next];
              const p3 = grid2d[i + 1][k], p4 = grid2d[i + 1][next];

              // Skip quads that cross antimeridian
              if (Math.abs(p1.x - p2.x) > MAP_W * 0.4 ||
                  Math.abs(p1.x - p3.x) > MAP_W * 0.4 ||
                  Math.abs(p2.x - p4.x) > MAP_W * 0.4) continue;

              if (fvi + 18 > fpArr.length) break;
              fpArr[fvi] = p1.x + xOff; fpArr[fvi+1] = -p1.y; fpArr[fvi+2] = 0.01;
              fpCol[fvi] = cr; fpCol[fvi+1] = cg; fpCol[fvi+2] = cb; fvi += 3;
              fpArr[fvi] = p3.x + xOff; fpArr[fvi+1] = -p3.y; fpArr[fvi+2] = 0.01;
              fpCol[fvi] = cr; fpCol[fvi+1] = cg; fpCol[fvi+2] = cb; fvi += 3;
              fpArr[fvi] = p2.x + xOff; fpArr[fvi+1] = -p2.y; fpArr[fvi+2] = 0.01;
              fpCol[fvi] = cr; fpCol[fvi+1] = cg; fpCol[fvi+2] = cb; fvi += 3;

              fpArr[fvi] = p2.x + xOff; fpArr[fvi+1] = -p2.y; fpArr[fvi+2] = 0.01;
              fpCol[fvi] = cr; fpCol[fvi+1] = cg; fpCol[fvi+2] = cb; fvi += 3;
              fpArr[fvi] = p3.x + xOff; fpArr[fvi+1] = -p3.y; fpArr[fvi+2] = 0.01;
              fpCol[fvi] = cr; fpCol[fvi+1] = cg; fpCol[fvi+2] = cb; fvi += 3;
              fpArr[fvi] = p4.x + xOff; fpArr[fvi+1] = -p4.y; fpArr[fvi+2] = 0.01;
              fpCol[fvi] = cr; fpCol[fvi+1] = cg; fpCol[fvi+2] = cb; fvi += 3;
            }
          }

          // Border ring (outermost)
          const outerRing = grid2d[FP_RINGS];
          for (let k = 0; k < FP_PTS; k++) {
            const next = (k + 1) % FP_PTS;
            if (Math.abs(outerRing[k].x - outerRing[next].x) > MAP_W * 0.4) continue;
            if (bvi + 6 > bArr.length) break;
            bArr[bvi] = outerRing[k].x + xOff; bArr[bvi+1] = -outerRing[k].y; bArr[bvi+2] = 0.015;
            bCol[bvi] = cr; bCol[bvi+1] = cg; bCol[bvi+2] = cb; bvi += 3;
            bArr[bvi] = outerRing[next].x + xOff; bArr[bvi+1] = -outerRing[next].y; bArr[bvi+2] = 0.015;
            bCol[bvi] = cr; bCol[bvi+1] = cg; bCol[bvi+2] = cb; bvi += 3;
          }
        }
      }

      this.footprint2dPosBuffer.needsUpdate = true;
      this.footprint2dColorBuffer.needsUpdate = true;
      this.footprint2dMesh.geometry.setDrawRange(0, fvi / 3);
      this.footprint2dMesh.visible = fvi > 0;

      this.footprint2dBorderBuffer.needsUpdate = true;
      this.footprint2dBorderColorBuffer.needsUpdate = true;
      this.footprint2dBorder.geometry.setDrawRange(0, bvi / 3);
      this.footprint2dBorder.visible = bvi > 0;
    }

    // 2D markers
    {
      const mPos = this.markerPosBuffer2d.array as Float32Array;
      const mCol = this.markerColorBuffer2d.array as Float32Array;
      let mi = 0;

      for (const md of this.markerData2d) {
        const visible = uiStore.markerVisibility[md.groupId] ?? false;
        if (!visible) continue;
        for (let off = -1; off <= 1; off++) {
          if (mi + 3 > mPos.length) break;
          mPos[mi] = md.mapX + off * MAP_W; mPos[mi + 1] = md.mapY; mPos[mi + 2] = 0.04;
          mCol[mi] = md.color.r; mCol[mi + 1] = md.color.g; mCol[mi + 2] = md.color.b;
          mi += 3;
        }
      }

      this.markerPosBuffer2d.needsUpdate = true;
      this.markerColorBuffer2d.needsUpdate = true;
      this.markerPoints2d.geometry.setDrawRange(0, mi / 3);

      // Position marker labels
      const showLabels = cam2dZoom > 0.5;
      const camL = camera2d.left, camR = camera2d.right;
      const camT = camera2d.top, camB = camera2d.bottom;
      const vw = window.innerWidth, vh = window.innerHeight;
      for (const ml of this.markerLabels2d) {
        const visible = (uiStore.markerVisibility[ml.groupId] ?? false) && showLabels;
        if (!visible) {
          ml.div.style.display = 'none';
          continue;
        }
        // Find best x-offset for this marker relative to camera center
        const camCenterX = (camL + camR) / 2;
        let bestX = ml.mapX;
        for (const off of [-MAP_W, 0, MAP_W]) {
          if (Math.abs(ml.mapX + off - camCenterX) < Math.abs(bestX - camCenterX)) bestX = ml.mapX + off;
        }
        const nx = (bestX - camL) / (camR - camL);
        const ny = (ml.mapY - camT) / (camB - camT);
        if (nx < -0.1 || nx > 1.1 || ny < -0.1 || ny > 1.1) {
          ml.div.style.display = 'none';
          continue;
        }
        ml.div.style.display = 'block';
        ml.div.style.left = `${nx * vw + 8}px`;
        ml.div.style.top = `${ny * vh - 6}px`;
      }
    }

    // 2D apsis markers (peri/apo dots on map)
    {
      const aPos = this.apsisPosBuffer2d.array as Float32Array;
      const aCol = this.apsisColorBuffer2d.array as Float32Array;
      let ai = 0;
      const periColor = { r: 0.529, g: 0.808, b: 0.922 }; // #87ceeb
      const apoColor = { r: 1.0, g: 0.647, b: 0.0 };       // #ffa500

      for (const sat of hlSats) {
        const peri = computeApsis2D(sat, epoch, false, cfg.earthRotationOffset);
        const apo = computeApsis2D(sat, epoch, true, cfg.earthRotationOffset);

        for (let off = -1; off <= 1; off++) {
          if (ai + 6 > aPos.length) break;
          aPos[ai] = peri.x + off * MAP_W; aPos[ai + 1] = -peri.y; aPos[ai + 2] = 0.03;
          aCol[ai] = periColor.r; aCol[ai + 1] = periColor.g; aCol[ai + 2] = periColor.b;
          ai += 3;
          aPos[ai] = apo.x + off * MAP_W; aPos[ai + 1] = -apo.y; aPos[ai + 2] = 0.03;
          aCol[ai] = apoColor.r; aCol[ai + 1] = apoColor.g; aCol[ai + 2] = apoColor.b;
          ai += 3;
        }
      }

      this.apsisPosBuffer2d.needsUpdate = true;
      this.apsisColorBuffer2d.needsUpdate = true;
      this.apsisPoints2d.geometry.setDrawRange(0, ai / 3);
    }

    // Satellite dots on map (rainbow colors for selected, hover = brighter)
    const cNorm = parseHexColor(cfg.satNormal);

    // Build rainbow map for selected sats (index matches orbit color)
    const selColorMap2d = new Map<Satellite, number[]>();
    let selIdx2d = 0;
    for (const s of selectedSats) {
      selColorMap2d.set(s, ORBIT_COLORS[selIdx2d % ORBIT_COLORS.length]);
      selIdx2d++;
    }

    const posArr = this.satPosBuffer2d.array as Float32Array;
    const colArr = this.satColorBuffer2d.array as Float32Array;
    let si = 0;
    for (const sat of satellites) {
      if (si + 9 > this.maxSatVerts2d * 3) break;
      const mc = getMapCoordinates(sat.currentPos, gmstDeg, cfg.earthRotationOffset);
      const rainbow = selColorMap2d.get(sat);
      const isHov = sat === hoveredSat;
      let cr: number, cg: number, cb: number;
      if (rainbow) {
        const b = isHov ? 1.5 : 1.0;
        cr = rainbow[0] * b; cg = rainbow[1] * b; cb = rainbow[2] * b;
      } else if (isHov) {
        const rc = ORBIT_COLORS[selectedSats.size % ORBIT_COLORS.length];
        cr = rc[0] * 0.9; cg = rc[1] * 0.9; cb = rc[2] * 0.9;
      } else {
        cr = cNorm.r; cg = cNorm.g; cb = cNorm.b;
      }

      for (let off = -1; off <= 1; off++) {
        posArr[si] = mc.x + off * MAP_W; posArr[si + 1] = -mc.y; posArr[si + 2] = 0.05;
        colArr[si] = cr; colArr[si + 1] = cg; colArr[si + 2] = cb;
        si += 3;
      }
    }

    this.satPosBuffer2d.needsUpdate = true;
    this.satColorBuffer2d.needsUpdate = true;
    this.satPoints2d.geometry.setDrawRange(0, si / 3);
  }
}
