import * as THREE from 'three';
import type { Satellite } from '../types';
import { DRAW_SCALE, EARTH_RADIUS_KM } from '../constants';
import { parseHexColor } from '../config';
import { calculatePosition } from '../astro/propagator';
import { satColorGl } from '../constants';
import { uiStore } from '../stores/ui.svelte';
import { earthShadowFactor } from '../astro/eclipse';
import { estimateVisualMagnitude, computePhaseAngle, slantRange } from '../astro/magnitude';
import { getSpriteIndex, REST_ANGLE } from './sprite-config';

export class SatelliteManager {
  points: THREE.Points;
  private posAttr: THREE.BufferAttribute;
  private colorAttr: THREE.BufferAttribute;
  private alphaAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;
  private spriteAttr: THREE.BufferAttribute;
  private maxSats: number;
  private updateFrame = 0;
  private _tmpPos = new THREE.Vector3();

  // Dirty tracking — skip buffer uploads when data hasn't changed
  private _prevHoveredSat: Satellite | null = null;
  private _prevSelectedVersion = -1;
  private _prevBloomEnabled = false;
  private _prevHiddenVersion = -1;
  private _prevCamX = NaN;
  private _prevCamY = NaN;
  private _prevCamZ = NaN;
  private _prevFade = NaN;
  private _magBloomTimer = 0;

  constructor(satTexture: THREE.Texture, spriteCount: number, maxSats = 25000) {
    this.maxSats = maxSats;
    const positions = new Float32Array(maxSats * 3);
    const colors = new Float32Array(maxSats * 3);
    const alphas = new Float32Array(maxSats);
    const sizes = new Float32Array(maxSats).fill(1.0);
    const sprites = new Float32Array(maxSats);

    const geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(positions, 3);
    this.colorAttr = new THREE.BufferAttribute(colors, 3);
    this.alphaAttr = new THREE.BufferAttribute(alphas, 1);
    this.sizeAttr = new THREE.BufferAttribute(sizes, 1);
    this.spriteAttr = new THREE.BufferAttribute(sprites, 1);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.spriteAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.posAttr);
    geometry.setAttribute('color', this.colorAttr);
    geometry.setAttribute('alpha', this.alphaAttr);
    geometry.setAttribute('sizeScale', this.sizeAttr);
    geometry.setAttribute('spriteIndex', this.spriteAttr);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        pointTexture: { value: satTexture },
        pointSize: { value: 16.0 * window.devicePixelRatio },
        spriteCount: { value: spriteCount },
        restAngle: { value: REST_ANGLE },
      },
      vertexShader: /* glsl */ `
        attribute float alpha;
        attribute float sizeScale;
        attribute float spriteIndex;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vAngle;
        varying float vSpriteIndex;
        uniform float pointSize;
        uniform float restAngle;

        void main() {
          vColor = color;
          vAlpha = alpha;
          vSpriteIndex = spriteIndex;

          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);

          // Earth-pointing rotation: compute screen-space angle from satellite to Earth center.
          // Use the actual sat→Earth vector in view space (not -mvPos, which includes
          // the full camera distance in z and breaks the confidence ratio from far away).
          // Negate y to convert from view space (y-up) to gl_PointCoord space (y-down).
          //
          // When the sat→Earth direction is mostly along the view axis (z-dominant),
          // the screen projection is degenerate (e.g. top-down polar view). Fade
          // rotation toward 0 based on how much of the 3D direction is in-screen.
          vec4 earthMV = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vec3 toEarth3 = earthMV.xyz - mvPos.xyz;
          vec2 toEarth = toEarth3.xy;
          float screenLen = length(toEarth);
          float confidence = screenLen / (length(toEarth3) + 0.0001);
          float fade = smoothstep(0.15, 0.4, confidence);
          if (screenLen > 0.0001) {
            float screenAngle = atan(-(toEarth.y), toEarth.x);
            vAngle = (restAngle - screenAngle) * fade;
          } else {
            vAngle = 0.0;
          }

          gl_PointSize = pointSize * sizeScale;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D pointTexture;
        uniform float spriteCount;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vAngle;
        varying float vSpriteIndex;

        // Sample the sprite atlas at a local UV (0-1 within the sprite cell).
        // Returns 0.0 alpha for out-of-bounds UVs (prevents atlas bleed between sprites).
        float sampleAlpha(vec2 localUV) {
          if (localUV.x < 0.0 || localUV.x > 1.0 || localUV.y < 0.0 || localUV.y > 1.0) return 0.0;
          vec2 atlasUV = vec2((vSpriteIndex + localUV.x) / spriteCount, localUV.y);
          return texture2D(pointTexture, atlasUV).a;
        }

        vec4 sampleColor(vec2 localUV) {
          vec2 atlasUV = vec2((vSpriteIndex + localUV.x) / spriteCount, localUV.y);
          return texture2D(pointTexture, atlasUV);
        }

        void main() {
          // Rotate gl_PointCoord around center to point antenna toward Earth
          vec2 uv = gl_PointCoord - 0.5;
          float ca = cos(vAngle);
          float sa = sin(vAngle);
          vec2 rotUV = vec2(uv.x * ca - uv.y * sa, uv.x * sa + uv.y * ca) + 0.5;

          // Bounds check — rotated UV may fall outside the sprite cell
          if (rotUV.x < 0.0 || rotUV.x > 1.0 || rotUV.y < 0.0 || rotUV.y > 1.0) discard;

          vec4 texel = sampleColor(rotUV);
          if (texel.a > 0.3) {
            gl_FragColor = vec4(vColor * texel.rgb, vAlpha);
            return;
          }

          // Dark outline: 8-tap single-radius border (cardinal + diagonal)
          float s = 0.05;
          float d = s * 0.707;
          float na = max(
            max(max(sampleAlpha(rotUV + vec2(s, 0.0)),
                    sampleAlpha(rotUV - vec2(s, 0.0))),
                max(sampleAlpha(rotUV + vec2(0.0, s)),
                    sampleAlpha(rotUV - vec2(0.0, s)))),
            max(max(sampleAlpha(rotUV + vec2(d, d)),
                    sampleAlpha(rotUV - vec2(d, d))),
                max(sampleAlpha(rotUV + vec2(d, -d)),
                    sampleAlpha(rotUV - vec2(d, -d))))
          );
          if (na > 0.3) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, vAlpha);
            return;
          }
          discard;
        }
      `,
      transparent: true,
      depthTest: false,
      vertexColors: true,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 998;
  }

  setVisible(visible: boolean) {
    this.points.visible = visible;
  }

  /**
   * Batched SGP4 position propagation — view-independent.
   * Call once per frame before the 3D/2D render branch.
   * Mutates sat.currentPos in place.
   */
  propagatePositions(
    satellites: Satellite[],
    currentEpoch: number,
    hoveredSat: Satellite | null,
    selectedSats: Set<Satellite>,
    timeMultiplier: number,
    dt: number,
    maxBatch: number,
  ) {
    // Delta-based SGP4 batching: only propagate 1/N satellites per frame.
    // N is derived from sim-time per frame to keep max position staleness under ~1s
    // of sim-time. At 1s staleness, LEO error ≈ 7.5km ≈ 2px at maximum zoom.
    //
    // batchCount = floor(1s / simTimePerFrame), clamped to [1, 64]
    //   1x @ 60fps  → simDt=0.016s → batch 62→capped by maxBatch setting
    //   10x @ 60fps → simDt=0.16s  → batch 6
    //   100x @ 60fps→ simDt=1.6s   → batch 1 → all sats every frame
    //
    // Adapts to both speed AND framerate: lower FPS means fewer but larger batches.
    // Hovered/selected satellites always update for responsive interaction.
    const simDtPerFrame = dt * Math.abs(timeMultiplier);
    const batchCount = Math.max(1, Math.min(maxBatch, Math.floor(1.0 / Math.max(simDtPerFrame, 0.001))));
    const batch = this.updateFrame++ % batchCount;
    const count = Math.min(satellites.length, this.maxSats);

    for (let i = 0; i < count; i++) {
      const sat = satellites[i];
      if (i % batchCount === batch || sat === hoveredSat || selectedSats.has(sat)) {
        calculatePosition(sat, currentEpoch, this._tmpPos);
        const r2 = this._tmpPos.x * this._tmpPos.x + this._tmpPos.y * this._tmpPos.y + this._tmpPos.z * this._tmpPos.z;
        if (r2 > EARTH_RADIUS_KM * EARTH_RADIUS_KM) {
          sat.currentPos.copy(this._tmpPos);
          sat.decayed = false;
        } else {
          sat.decayed = true;
        }
      }
    }
  }

  /**
   * Update 3D point cloud visuals (geometry, colors, alpha, occlusion).
   * All positions (cameraPos, sunDir, obsPos, sat.currentPos) are in render coords
   * (x=eci.x, y=eci.z, z=-eci.y) — NOT standard ECI.
   */
  update(
    satellites: Satellite[],
    cameraPos: THREE.Vector3,
    hoveredSat: Satellite | null,
    selectedSats: Set<Satellite>,
    selectedSatsVersion: number,
    unselectedFade: number,
    hideUnselected: boolean,
    colorConfig: { normal: string; highlighted: string; selected: string },
    bloomEnabled = false,
    fadingInSats: Set<Satellite> = new Set(),
    /** Sun direction in render coords (from calculateSunPosition) */
    sunDir: { x: number; y: number; z: number } | null = null,
    /** Observer position in render coords (ECI→render converted) */
    obsPos: { x: number; y: number; z: number } | null = null,
    dt = 0,
  ) {
    const count = Math.min(satellites.length, this.maxSats);
    this.points.geometry.drawRange.count = count;

    // --- Dirty checks: skip buffer uploads when data hasn't changed ---
    const hiddenVersion = uiStore.hiddenSelectedSatsVersion;
    // Refresh magnitude-based brightness every ~0.5s (triggers bloom when enabled,
    // but also provides visual brightness differentiation without bloom)
    this._magBloomTimer += dt;
    const magBloomTick = sunDir && obsPos && this._magBloomTimer >= 0.5;
    if (magBloomTick) this._magBloomTimer = 0;
    const colorSizeDirty = hoveredSat !== this._prevHoveredSat
      || selectedSatsVersion !== this._prevSelectedVersion
      || bloomEnabled !== this._prevBloomEnabled
      || hiddenVersion !== this._prevHiddenVersion
      || magBloomTick;

    const cameraMoved = cameraPos.x !== this._prevCamX
      || cameraPos.y !== this._prevCamY
      || cameraPos.z !== this._prevCamZ;

    const fadeStable = unselectedFade === 0 || unselectedFade === 1;
    const alphaDirty = colorSizeDirty || cameraMoved || unselectedFade !== this._prevFade;

    this._prevHoveredSat = hoveredSat;
    this._prevSelectedVersion = selectedSatsVersion;
    this._prevBloomEnabled = bloomEnabled;
    this._prevHiddenVersion = hiddenVersion;
    this._prevCamX = cameraPos.x;
    this._prevCamY = cameraPos.y;
    this._prevCamZ = cameraPos.z;
    this._prevFade = unselectedFade;

    // --- Position + sprite index: always update (propagation changes positions every frame) ---
    for (let i = 0; i < count; i++) {
      const sat = satellites[i];
      if (sat.decayed) continue;
      this.posAttr.array[i * 3] = sat.currentPos.x / DRAW_SCALE;
      this.posAttr.array[i * 3 + 1] = sat.currentPos.y / DRAW_SCALE;
      this.posAttr.array[i * 3 + 2] = sat.currentPos.z / DRAW_SCALE;
      this.spriteAttr.array[i] = getSpriteIndex(sat);
    }
    this.posAttr.needsUpdate = true;
    this.spriteAttr.needsUpdate = true;

    // --- Color + Size: only when hover/selection state changes ---
    if (colorSizeDirty) {
      const cNormal = parseHexColor(colorConfig.normal);
      const cSelected = parseHexColor(colorConfig.selected);
      const bloomBoost = bloomEnabled ? 2.0 : 1.0;

      const hiddenIds = uiStore.hiddenSelectedSats;
      const selectedColorMap = new Map<Satellite, number[]>();
      let selIdx = 0;
      for (const s of selectedSats) {
        if (!hiddenIds.has(s.noradId)) {
          selectedColorMap.set(s, satColorGl(selIdx) as unknown as number[]);
        }
        selIdx++;
      }

      for (let i = 0; i < count; i++) {
        const sat = satellites[i];
        if (sat.decayed) continue;

        const isHovered = sat === hoveredSat;
        const rainbow = selectedColorMap.get(sat);
        if (rainbow) {
          const b = bloomBoost * (isHovered ? 1.5 : 1.0);
          this.colorAttr.array[i * 3] = rainbow[0] * b;
          this.colorAttr.array[i * 3 + 1] = rainbow[1] * b;
          this.colorAttr.array[i * 3 + 2] = rainbow[2] * b;
        } else if (isHovered) {
          const nextIdx = selectedSats.size;
          const rc = satColorGl(nextIdx);
          this.colorAttr.array[i * 3] = rc[0] * 0.9;
          this.colorAttr.array[i * 3 + 1] = rc[1] * 0.9;
          this.colorAttr.array[i * 3 + 2] = rc[2] * 0.9;
        } else {
          let br = cNormal.r, bg = cNormal.g, bb = cNormal.b;
          let magBoost = 1.0;
          // Magnitude-based bloom: sunlit sats with known stdMag get brightness
          // boost proportional to visual magnitude (brighter sat → more bloom).
          // All positions are in render coords (consistent space for dot products / distances).
          if (sunDir && obsPos && sat.stdMag !== null) {
            const sf = earthShadowFactor(sat.currentPos.x, sat.currentPos.y, sat.currentPos.z, sunDir);
            if (sf > 0) {
              const range = slantRange(sat.currentPos, obsPos);
              const phase = computePhaseAngle(sat.currentPos, sunDir, obsPos);
              const mag = estimateVisualMagnitude(sat.stdMag, range, phase, 45);
              // Scale: mag -2 → full boost, mag 5 → no boost
              if (mag < 5) {
                const t = Math.max(0, Math.min(1, (5 - mag) / 7));
                magBoost = 1.0 + t * 4.0; // 1.0 … 5.0
                br *= magBoost; bg *= magBoost; bb *= magBoost;
              }
            }
          }
          this.colorAttr.array[i * 3] = br;
          this.colorAttr.array[i * 3 + 1] = bg;
          this.colorAttr.array[i * 3 + 2] = bb;
        }

        this.sizeAttr.array[i] = (selectedSats.has(sat) || isHovered) ? 1.5 : 1.0;
      }

      this.colorAttr.needsUpdate = true;
      this.sizeAttr.needsUpdate = true;
    }

    // --- Alpha + occlusion: only when camera moved, fade changed, or color/size dirty ---
    if (alphaDirty) {
      const earthRadius = EARTH_RADIUS_KM / DRAW_SCALE;
      const cNormal = parseHexColor(colorConfig.normal);
      const cSelected = parseHexColor(colorConfig.selected);

      for (let i = 0; i < count; i++) {
        const sat = satellites[i];
        if (sat.decayed) {
          this.alphaAttr.array[i] = 0;
          continue;
        }

        const isSelected = selectedSats.has(sat);
        const c = isSelected ? cSelected : cNormal;
        let alpha = c.a;
        if (!isSelected && sat !== hoveredSat && !fadingInSats.has(sat)) {
          alpha *= unselectedFade;
        }
        if (alpha <= 0) {
          this.alphaAttr.array[i] = 0;
          continue;
        }

        const dx = this.posAttr.array[i * 3];
        const dy = this.posAttr.array[i * 3 + 1];
        const dz = this.posAttr.array[i * 3 + 2];
        if (this.isOccludedByEarth(cameraPos, dx, dy, dz, earthRadius)) {
          alpha = 0;
        }

        this.alphaAttr.array[i] = alpha;
      }

      this.alphaAttr.needsUpdate = true;
    }
  }

  private isOccludedByEarth(camPos: THREE.Vector3, tx: number, ty: number, tz: number, earthRadius: number): boolean {
    const vx = tx - camPos.x, vy = ty - camPos.y, vz = tz - camPos.z;
    const L = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (L === 0) return false;
    const dx = vx / L, dy = vy / L, dz = vz / L;
    const t = -(camPos.x * dx + camPos.y * dy + camPos.z * dz);
    if (t > 0 && t < L) {
      const cx = camPos.x + dx * t;
      const cy = camPos.y + dy * t;
      const cz = camPos.z + dz * t;
      if (Math.sqrt(cx * cx + cy * cy + cz * cz) < earthRadius * 0.99) return true;
    }
    return false;
  }
}
