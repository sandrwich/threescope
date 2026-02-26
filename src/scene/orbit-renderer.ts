import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { Satellite } from '../types';
import { DRAW_SCALE, EARTH_RADIUS_KM, TWO_PI, MU, ORBIT_RECOMPUTE_INTERVAL_S, SAT_COLORS } from '../constants';
import { parseHexColor } from '../config';
import { calculatePosition, getCorrectedElements } from '../astro/propagator';
import { epochToUnix } from '../astro/epoch';
import { sunDirectionECI, earthShadowFactor, isSolarEclipsed, solarEclipsePossible } from '../astro/eclipse';
import { moonPositionECI } from '../astro/moon-observer';
import { uiStore } from '../stores/ui.svelte';
import { observerStore } from '../stores/observer.svelte';
import { latLonToSurface } from '../astro/coordinates';
import { palette } from '../ui/shared/theme';
import { createSquareTexture, createDiamondTexture } from './marker-manager';

// SAT_COLORS as 0–1 floats for WebGL
export const ORBIT_COLORS = SAT_COLORS.map(c => [c[0] / 255, c[1] / 255, c[2] / 255]);

// Default segment counts for orbit visualization
const SEGMENTS_NORMAL = 90;
const SEGMENTS_LARGE = 30;

export class OrbitRenderer {
  private scene: THREE.Scene;

  // Highlight orbits (SGP4 for accuracy — supports multiple selected sats)
  private highlightLine: THREE.LineSegments;
  private highlightBuffer: THREE.BufferAttribute;
  private highlightColorBuffer: THREE.BufferAttribute;
  private highlightMat: THREE.LineBasicMaterial;
  private maxHighlightVerts: number;
  private highlightSegmentsPerOrbit = 400;
  private maxHighlightOrbits = 20;

  // Nadir lines (fat, one per highlighted sat)
  private nadirLine: LineSegments2;
  private nadirGeo: LineSegmentsGeometry;
  private nadirMat: LineMaterial;

  // Observer lines (dashed, sat → observer ground position)
  private observerLine: LineSegments2;
  private observerGeo: LineSegmentsGeometry;
  private observerMat: LineMaterial;

  // Normal orbits (batched LineSegments)
  private normalLines: THREE.LineSegments;
  private normalBuffer: THREE.BufferAttribute;
  private normalMat: THREE.LineBasicMaterial;
  private maxNormalVerts: number;

  // Precomputed ECI orbit vertices (line-segment pairs)
  private precomputedAll: Float32Array | null = null;
  private precomputedSatCount = 0;
  private precomputedFloatsPerOrbit = 0;

  // Perifocal frame storage: (segs+1) sequential vertices per orbit, 2 floats each (xpf, ypf)
  // Shape depends only on (a, e) — constant under J2 secular perturbation
  private perifocalAll: Float32Array | null = null;
  private perifocalVertsPerOrbit = 0;

  // J2 recomputation tracking
  private lastRecomputeEpoch = 0;
  private lastRecomputeWallMs = 0;
  private lastPeriCheckEpoch = 0;
  private satellites: Satellite[] = [];
  private currentSegments = 0;

  // Configurable simulation parameters
  private configuredSegments = SEGMENTS_LARGE;
  private j2Enabled = true;
  private dragEnabled = true;
  private orbitMode: 'analytical' | 'sgp4' = 'analytical';
  private lastConfigEpoch = 0; // track epoch for rebuild after config change

  // Assembly state — only rebuild GPU buffer when visibility changes
  private lastActiveSat: Satellite | null | undefined = undefined; // undefined = never assembled
  private lastSelectedSatsVersion = -1;
  private lastSelectedSatsSize = -1;
  private lastFadedOut = false;
  private assembledVertFloats = 0;
  private selectedSatsVersion = 0; // bumped externally when selection changes
  showNormalOrbits = true;

  // Orbit scrub: cached time→position for dragging along orbit to change time
  orbitScrubPoints: { epoch: number; sx: number; sy: number; sz: number }[] = [];
  orbitScrubPeriod = 0; // orbital period in days (for wrap-around)

  // Fat pass arc (AOS → LOS thick line overlay)
  private passArcLine: Line2;
  private passArcMat: LineMaterial;
  private passArcGeo: LineGeometry;
  private lastPassArcKey = '';

  // Pass endpoint markers (AOS/LOS/TCA)
  private passAosMarker: THREE.Sprite;
  private passLosMarker: THREE.Sprite;
  private passTcaMarker: THREE.Sprite;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Pre-allocate highlight orbit buffer (LineSegments for multi-orbit support)
    // Each orbit uses segments line-segment pairs = segments * 2 verts
    this.maxHighlightVerts = this.highlightSegmentsPerOrbit * 2 * this.maxHighlightOrbits;
    const hlGeo = new THREE.BufferGeometry();
    this.highlightBuffer = new THREE.BufferAttribute(new Float32Array(this.maxHighlightVerts * 3), 3);
    this.highlightBuffer.setUsage(THREE.DynamicDrawUsage);
    this.highlightColorBuffer = new THREE.BufferAttribute(new Float32Array(this.maxHighlightVerts * 3), 3);
    this.highlightColorBuffer.setUsage(THREE.DynamicDrawUsage);
    hlGeo.setAttribute('position', this.highlightBuffer);
    hlGeo.setAttribute('color', this.highlightColorBuffer);
    hlGeo.setDrawRange(0, 0);
    this.highlightMat = new THREE.LineBasicMaterial({ transparent: true, vertexColors: true });
    this.highlightLine = new THREE.LineSegments(hlGeo, this.highlightMat);
    this.highlightLine.frustumCulled = false;
    this.highlightLine.visible = false;
    scene.add(this.highlightLine);

    // Fat nadir lines (sat → earth center, one segment per highlighted sat)
    this.nadirGeo = new LineSegmentsGeometry();
    this.nadirMat = new LineMaterial({ linewidth: 2, vertexColors: true, transparent: true });
    this.nadirLine = new LineSegments2(this.nadirGeo, this.nadirMat);
    this.nadirLine.frustumCulled = false;
    this.nadirLine.visible = false;
    scene.add(this.nadirLine);

    // Dashed observer lines (sat → observer ground position)
    this.observerGeo = new LineSegmentsGeometry();
    this.observerMat = new LineMaterial({ linewidth: 2, vertexColors: true, transparent: true, dashed: true, dashSize: 0.06, gapSize: 0.025 });
    this.observerLine = new LineSegments2(this.observerGeo, this.observerMat);
    this.observerLine.frustumCulled = false;
    this.observerLine.visible = false;
    scene.add(this.observerLine);

    // Pre-allocate normal orbits buffer — sized for configured segments
    this.maxNormalVerts = 15000 * this.configuredSegments * 2;
    const normGeo = new THREE.BufferGeometry();
    this.normalBuffer = new THREE.BufferAttribute(new Float32Array(this.maxNormalVerts * 3), 3);
    this.normalBuffer.setUsage(THREE.DynamicDrawUsage);
    normGeo.setAttribute('position', this.normalBuffer);
    normGeo.setDrawRange(0, 0);
    this.normalMat = new THREE.LineBasicMaterial({ transparent: true });
    this.normalLines = new THREE.LineSegments(normGeo, this.normalMat);
    this.normalLines.frustumCulled = false;
    this.normalLines.visible = false;
    scene.add(this.normalLines);

    // Fat pass arc
    this.passArcGeo = new LineGeometry();
    this.passArcMat = new LineMaterial({ linewidth: 3, vertexColors: true, transparent: true });
    this.passArcLine = new Line2(this.passArcGeo, this.passArcMat);
    this.passArcLine.frustumCulled = false;
    this.passArcLine.visible = false;
    scene.add(this.passArcLine);

    // Pass markers (AOS/LOS squares + TCA diamond, screen-space sized)
    const sqTex = createSquareTexture();
    const dmTex = createDiamondTexture();
    const markerOpts = { depthTest: false, transparent: true, alphaTest: 0.1, sizeAttenuation: false, toneMapped: false } as const;
    const MS = 0.012; // screen-space scale (~12px on 1080p)
    this.passAosMarker = new THREE.Sprite(new THREE.SpriteMaterial({ map: sqTex, ...markerOpts }));
    this.passAosMarker.scale.set(MS, MS, 1);
    this.passAosMarker.renderOrder = 999;
    this.passAosMarker.visible = false;
    scene.add(this.passAosMarker);
    this.passLosMarker = new THREE.Sprite(new THREE.SpriteMaterial({ map: sqTex, ...markerOpts }));
    this.passLosMarker.scale.set(MS, MS, 1);
    this.passLosMarker.renderOrder = 999;
    this.passLosMarker.visible = false;
    scene.add(this.passLosMarker);
    this.passTcaMarker = new THREE.Sprite(new THREE.SpriteMaterial({ map: dmTex, ...markerOpts }));
    this.passTcaMarker.scale.set(MS, MS, 1);
    this.passTcaMarker.renderOrder = 999;
    this.passTcaMarker.visible = false;
    scene.add(this.passTcaMarker);
  }

  /**
   * Precompute all orbit ellipses from Keplerian elements with J2 secular corrections.
   * Phase 1: compute perifocal vertices (shape only, depends on a,e).
   * Phase 2: rotate to ECI using J2-corrected RAAN and argPerigee.
   */
  precomputeOrbits(satellites: Satellite[], currentEpoch: number) {
    const satCount = satellites.length;
    const segs = this.configuredSegments;
    const floatsPerOrbit = segs * 6; // segs line segments × 2 verts × 3 components
    const periVertsPerOrbit = segs + 1;
    const periFloatsPerOrbit = periVertsPerOrbit * 2;

    // Allocate ECI buffer
    this.precomputedAll = new Float32Array(satCount * floatsPerOrbit);
    this.precomputedSatCount = satCount;
    this.precomputedFloatsPerOrbit = floatsPerOrbit;

    // Allocate perifocal buffer
    this.perifocalAll = new Float32Array(satCount * periFloatsPerOrbit);
    this.perifocalVertsPerOrbit = periVertsPerOrbit;
    this.currentSegments = segs;
    this.satellites = satellites;

    // Phase 1: Compute perifocal vertices (shape only)
    for (let s = 0; s < satCount; s++) {
      const sat = satellites[s];
      this.computePerifocalVertices(
        sat.semiMajorAxis, sat.eccentricity, segs,
        this.perifocalAll, s * periFloatsPerOrbit
      );
    }

    // Phase 2: Compute ECI positions
    if (this.orbitMode === 'sgp4') {
      this.computeSGP4Orbits(currentEpoch);
    } else {
      this.recomputeECI(currentEpoch);
    }

    this.lastRecomputeEpoch = currentEpoch;
    this.lastRecomputeWallMs = performance.now();
    this.lastPeriCheckEpoch = currentEpoch;
    this.lastConfigEpoch = currentEpoch;
    this.lastActiveSat = undefined; // force reassembly
  }

  /**
   * Compute perifocal-frame vertices for one orbit.
   * Depends only on (a, e) — constant under J2 secular perturbation.
   * Stores (segs+1) vertices as (xpf, ypf) pairs.
   */
  private computePerifocalVertices(
    a: number, e: number, segs: number, out: Float32Array, outOffset: number
  ) {
    const p = a * (1 - e * e);
    let idx = outOffset;
    for (let i = 0; i <= segs; i++) {
      const nu = (i / segs) * TWO_PI;
      const cosNu = Math.cos(nu);
      const r = p / (1 + e * cosNu);
      out[idx++] = r * cosNu;       // xpf
      out[idx++] = r * Math.sin(nu); // ypf
    }
  }

  /**
   * Recompute ECI positions for all orbits using J2-corrected RAAN and argPerigee.
   * Cost: ~6 trig calls per satellite + (segs+1) matrix multiplies.
   * For 10k sats at 30 segs: ~5ms.
   */
  private recomputeECI(currentEpoch: number) {
    if (!this.perifocalAll || !this.precomputedAll) return;

    const sats = this.satellites;
    const segs = this.currentSegments;
    const periVertsPerOrbit = this.perifocalVertsPerOrbit;
    const periFloatsPerOrbit = periVertsPerOrbit * 2;
    const eciFloatsPerOrbit = this.precomputedFloatsPerOrbit;

    for (let s = 0; s < sats.length; s++) {
      const sat = sats[s];

      // Orientation angles (with or without J2 secular correction)
      const corrected = this.j2Enabled ? getCorrectedElements(sat, currentEpoch) : null;
      const raan = corrected ? corrected.raan : sat.raan;
      const w = corrected ? corrected.argPerigee : sat.argPerigee;
      const inc = sat.inclination;

      // Build rotation matrix R = Rz(-Ω) · Rx(-i) · Rz(-ω)
      const cosO = Math.cos(raan), sinO = Math.sin(raan);
      const cosI = Math.cos(inc), sinI = Math.sin(inc);
      const cosW = Math.cos(w), sinW = Math.sin(w);

      const r11 = cosO * cosW - sinO * sinW * cosI;
      const r12 = -cosO * sinW - sinO * cosW * cosI;
      const r21 = sinO * cosW + cosO * sinW * cosI;
      const r22 = -sinO * sinW + cosO * cosW * cosI;
      const r31 = sinW * sinI;
      const r32 = cosW * sinI;

      // Read perifocal, write ECI line-segment pairs
      const periBase = s * periFloatsPerOrbit;
      let eciIdx = s * eciFloatsPerOrbit;
      let px = 0, py = 0, pz = 0;

      for (let i = 0; i <= segs; i++) {
        const pi = periBase + i * 2;
        const xpf = this.perifocalAll[pi];
        const ypf = this.perifocalAll[pi + 1];

        const xeci = r11 * xpf + r12 * ypf;
        const yeci = r21 * xpf + r22 * ypf;
        const zeci = r31 * xpf + r32 * ypf;

        // Render coords: x=eci.x, y=eci.z, z=-eci.y, divided by DRAW_SCALE
        const cx = xeci / DRAW_SCALE;
        const cy = zeci / DRAW_SCALE;
        const cz = -yeci / DRAW_SCALE;

        if (i > 0) {
          this.precomputedAll![eciIdx++] = px;
          this.precomputedAll![eciIdx++] = py;
          this.precomputedAll![eciIdx++] = pz;
          this.precomputedAll![eciIdx++] = cx;
          this.precomputedAll![eciIdx++] = cy;
          this.precomputedAll![eciIdx++] = cz;
        }
        px = cx; py = cy; pz = cz;
      }
    }

    // Force GPU buffer reassembly
    this.lastActiveSat = undefined;
  }

  /**
   * Check if ndot-driven semi-major axis decay requires perifocal rebuild.
   * Only checked every 6 hours of sim-time since drag is slow.
   */
  private checkPeifocalRebuild(currentEpoch: number) {
    if (!this.perifocalAll || !this.dragEnabled) return;

    const currentUnix = epochToUnix(currentEpoch);
    const lastCheckUnix = epochToUnix(this.lastPeriCheckEpoch);
    if (Math.abs(currentUnix - lastCheckUnix) < 21600) return; // 6 hours

    this.lastPeriCheckEpoch = currentEpoch;

    const sats = this.satellites;
    const segs = this.currentSegments;
    const periFloatsPerOrbit = this.perifocalVertsPerOrbit * 2;
    let needRebuild = false;

    for (let s = 0; s < sats.length; s++) {
      const sat = sats[s];
      if (Math.abs(sat.ndot) < 1e-15) continue;
      const deltaS = currentUnix - epochToUnix(sat.epochDays);
      const nNew = sat.meanMotion + sat.ndot * deltaS;
      if (nNew <= 0) continue;
      const aNew = Math.pow(MU / (nNew * nNew), 1.0 / 3.0);
      if (Math.abs(aNew - sat.semiMajorAxis) > 0.1) {
        needRebuild = true;
        break;
      }
    }

    if (needRebuild) {
      for (let s = 0; s < sats.length; s++) {
        const sat = sats[s];
        const deltaS = currentUnix - epochToUnix(sat.epochDays);
        const nNew = sat.meanMotion + sat.ndot * deltaS;
        const aNew = nNew > 0 ? Math.pow(MU / (nNew * nNew), 1.0 / 3.0) : sat.semiMajorAxis;
        this.computePerifocalVertices(
          aNew, sat.eccentricity, segs,
          this.perifocalAll, s * periFloatsPerOrbit
        );
      }
      // Force ECI recompute since perifocal changed
      this.recomputeECI(currentEpoch);
      this.lastRecomputeEpoch = currentEpoch;
      this.lastRecomputeWallMs = performance.now();
    }
  }

  update(
    satellites: Satellite[],
    currentEpoch: number,
    hoveredSat: Satellite | null,
    selectedSats: Set<Satellite>,
    selectedSatsVersion: number,
    unselectedFade: number,
    orbitsToDraw: number,
    colorConfig: { orbitNormal: string; orbitHighlighted: string },
    cameraPos?: THREE.Vector3,
    gmstDeg = 0,
    earthRotationOffset = 0,
  ) {
    // --- Periodic recomputation ---
    if (this.precomputedAll) {
      const now = performance.now();
      // Wall-clock guard: max ~30 Hz recompute rate
      if (now - this.lastRecomputeWallMs > 33) {
        const deltaSim = Math.abs(
          epochToUnix(currentEpoch) - epochToUnix(this.lastRecomputeEpoch)
        );
        if (deltaSim > ORBIT_RECOMPUTE_INTERVAL_S) {
          if (this.orbitMode === 'sgp4') {
            this.computeSGP4Orbits(currentEpoch);
          } else {
            this.recomputeECI(currentEpoch);
          }
          this.lastRecomputeEpoch = currentEpoch;
          this.lastRecomputeWallMs = now;
          this.lastConfigEpoch = currentEpoch;
        }
      }
      // ndot perifocal rebuild (rare, analytical mode only)
      if (this.orbitMode === 'analytical') {
        this.checkPeifocalRebuild(currentEpoch);
      }
    }

    const cHL = parseHexColor(colorConfig.orbitHighlighted);

    // --- Build set of all sats that need highlight orbits ---
    const highlightSats: Satellite[] = [];
    for (const sat of selectedSats) {
      if (highlightSats.length >= this.maxHighlightOrbits) break;
      highlightSats.push(sat);
    }
    // Add hovered sat if not already in set
    if (hoveredSat && !selectedSats.has(hoveredSat) && highlightSats.length < this.maxHighlightOrbits) {
      highlightSats.push(hoveredSat);
    }

    // --- Highlighted orbits (SGP4 for accuracy — one per active sat) ---
    // Always use rainbow palette for selected sat orbits

    if (highlightSats.length > 0) {
      const arr = this.highlightBuffer.array as Float32Array;
      const col = this.highlightColorBuffer.array as Float32Array;
      let vi = 0;

      // Sun direction in render-space (ECI→render: x=x, y=z, z=-y)
      const sunEci = sunDirectionECI(currentEpoch);
      const sunRX = sunEci.x, sunRY = sunEci.z, sunRZ = -sunEci.y;
      const sunRender = { x: sunRX, y: sunRY, z: sunRZ };
      // Moon position in render-space for solar eclipse check
      const moonEci = moonPositionECI(currentEpoch);
      const moonRender = { x: moonEci.x, y: moonEci.z, z: -moonEci.y };
      const checkSolarEclipse = solarEclipsePossible(moonRender, sunRender);
      const ECLIPSE_DIM = 0.3;
      const hiddenIds = uiStore.hiddenSelectedSats;

      // Cache orbit scrub points for the first highlighted sat only
      const scrubPts: { epoch: number; sx: number; sy: number; sz: number }[] = [];

      for (let si = 0; si < highlightSats.length; si++) {
        const sat = highlightSats[si];
        if (hiddenIds.has(sat.noradId)) continue;
        const [cr, cg, cb] = ORBIT_COLORS[si % ORBIT_COLORS.length];
        const segments = Math.min(this.highlightSegmentsPerOrbit, Math.max(90, Math.floor(400 * orbitsToDraw)));
        const periodDays = TWO_PI / sat.meanMotion / 86400.0;
        const timeStep = (periodDays * orbitsToDraw) / segments;

        // Compute orbit points with eclipse-aware coloring
        let px = 0, py = 0, pz = 0;
        let prevDim = 1.0;
        for (let i = 0; i <= segments; i++) {
          const t = currentEpoch + i * timeStep;
          const pos = calculatePosition(sat, t);
          // Cache scrub points for first visible highlighted sat (one orbit only)
          if ((si === 0 || (scrubPts.length === 0 && si > 0)) && t <= currentEpoch + periodDays) {
            scrubPts.push({ epoch: t, sx: pos.x / DRAW_SCALE, sy: pos.y / DRAW_SCALE, sz: pos.z / DRAW_SCALE });
          }
          // Eclipse check: Earth shadow (penumbra gradient) + Moon shadow (solar eclipse)
          let shadowFactor = earthShadowFactor(pos.x, pos.y, pos.z, sunRender);
          if (shadowFactor >= 1.0 && checkSolarEclipse) {
            // Per-vertex Moon position for accuracy over multi-hour orbits
            const me = moonPositionECI(t);
            if (isSolarEclipsed(pos.x, pos.y, pos.z, { x: me.x, y: me.z, z: -me.y }, sunRender)) shadowFactor = 0.0;
          }
          const dim = ECLIPSE_DIM + shadowFactor * (1.0 - ECLIPSE_DIM);
          const cx = pos.x / DRAW_SCALE;
          const cy = pos.y / DRAW_SCALE;
          const cz = pos.z / DRAW_SCALE;
          if (i > 0 && vi + 6 <= this.maxHighlightVerts * 3) {
            arr[vi] = px; arr[vi+1] = py; arr[vi+2] = pz;
            col[vi] = cr * prevDim; col[vi+1] = cg * prevDim; col[vi+2] = cb * prevDim;
            vi += 3;
            arr[vi] = cx; arr[vi+1] = cy; arr[vi+2] = cz;
            col[vi] = cr * dim; col[vi+1] = cg * dim; col[vi+2] = cb * dim;
            vi += 3;
          }
          px = cx; py = cy; pz = cz;
          prevDim = dim;
        }
      }

      this.orbitScrubPoints = scrubPts;
      if (highlightSats.length > 0) {
        this.orbitScrubPeriod = TWO_PI / highlightSats[0].meanMotion / 86400.0;
      }

      this.highlightBuffer.needsUpdate = true;
      this.highlightColorBuffer.needsUpdate = true;
      this.highlightLine.geometry.setDrawRange(0, vi / 3);
      this.highlightMat.color.setRGB(1, 1, 1); // vertex colors handle tinting
      this.highlightMat.opacity = cHL.a;
      this.highlightLine.visible = true;

      // Nadir lines (fat, one per highlighted sat: earth center → sat)
      {
        const ndPos: number[] = [];
        const ndCol: number[] = [];
        for (let si = 0; si < highlightSats.length; si++) {
          const sat = highlightSats[si];
          if (hiddenIds.has(sat.noradId)) continue;
          const [cr, cg, cb] = ORBIT_COLORS[si % ORBIT_COLORS.length];
          ndPos.push(0, 0, 0, sat.currentPos.x / DRAW_SCALE, sat.currentPos.y / DRAW_SCALE, sat.currentPos.z / DRAW_SCALE);
          ndCol.push(cr, cg, cb, cr, cg, cb);
        }
        if (ndPos.length > 0) {
          this.nadirGeo.dispose();
          this.nadirGeo = new LineSegmentsGeometry();
          this.nadirGeo.setPositions(ndPos);
          this.nadirGeo.setColors(ndCol);
          this.nadirLine.geometry = this.nadirGeo;
          this.nadirMat.resolution.set(window.innerWidth, window.innerHeight);
          this.nadirMat.opacity = cHL.a * 0.5;
          this.nadirLine.visible = true;
        } else {
          this.nadirLine.visible = false;
        }
      }

      // Observer lines (dashed, sat → observer ground position)
      {
        const obsLoc = observerStore.location;
        const obsPos = observerStore.isSet
          ? latLonToSurface(obsLoc.lat, obsLoc.lon, gmstDeg, earthRotationOffset)
          : null;
        if (obsPos) {
          const olPos: number[] = [];
          const olCol: number[] = [];
          for (let si = 0; si < highlightSats.length; si++) {
            const sat = highlightSats[si];
            if (hiddenIds.has(sat.noradId)) continue;
            const sx = sat.currentPos.x / DRAW_SCALE;
            const sy = sat.currentPos.y / DRAW_SCALE;
            const sz = sat.currentPos.z / DRAW_SCALE;
            // Skip if sat is below observer's horizon (line would go through Earth)
            const toSatX = sx - obsPos.x, toSatY = sy - obsPos.y, toSatZ = sz - obsPos.z;
            if (toSatX * obsPos.x + toSatY * obsPos.y + toSatZ * obsPos.z <= 0) continue;
            const [cr, cg, cb] = ORBIT_COLORS[si % ORBIT_COLORS.length];
            olPos.push(sx, sy, sz, obsPos.x, obsPos.y, obsPos.z);
            olCol.push(cr, cg, cb, cr, cg, cb);
          }
          if (olPos.length > 0) {
            this.observerGeo.dispose();
            this.observerGeo = new LineSegmentsGeometry();
            this.observerGeo.setPositions(olPos);
            this.observerGeo.setColors(olCol);
            this.observerLine.geometry = this.observerGeo;
            this.observerLine.computeLineDistances();
            this.observerMat.resolution.set(window.innerWidth, window.innerHeight);
            this.observerMat.opacity = cHL.a;
            this.observerLine.visible = true;
          } else {
            this.observerLine.visible = false;
          }
        } else {
          this.observerLine.visible = false;
        }
      }

      // --- Fat pass arc (AOS → LOS) ---
      const passIdx = uiStore.selectedPassIdx;
      const passList = uiStore.activePassList;
      if (passIdx >= 0 && passIdx < passList.length) {
        const pass = passList[passIdx];
        const arcKey = `${passIdx}:${pass.satNoradId}:${pass.aosEpoch}`;
        if (arcKey !== this.lastPassArcKey) {
          this.lastPassArcKey = arcKey;
          // Find matching satellite index in highlightSats
          let satIdx = -1;
          let arcSat: Satellite | null = null;
          for (let si = 0; si < highlightSats.length; si++) {
            if (highlightSats[si].noradId === pass.satNoradId) {
              satIdx = si;
              arcSat = highlightSats[si];
              break;
            }
          }
          if (arcSat && satIdx >= 0) {
            const [cr, cg, cb] = ORBIT_COLORS[satIdx % ORBIT_COLORS.length];
            const arcDuration = pass.losEpoch - pass.aosEpoch;
            const arcSteps = 60;
            const arcTimeStep = arcDuration / arcSteps;
            // Use Moon/Sun at pass midpoint (not current epoch) for consistent eclipse check
            const arcMidEpoch = (pass.aosEpoch + pass.losEpoch) / 2;
            const arcSunEci = sunDirectionECI(arcMidEpoch);
            const arcSunR = { x: arcSunEci.x, y: arcSunEci.z, z: -arcSunEci.y };
            const arcMoonEci = moonPositionECI(arcMidEpoch);
            const arcMoonR = { x: arcMoonEci.x, y: arcMoonEci.z, z: -arcMoonEci.y };
            const arcSolarEcl = solarEclipsePossible(arcMoonR, arcSunR);
            const positions: number[] = [];
            const colors: number[] = [];
            for (let i = 0; i <= arcSteps; i++) {
              const t = pass.aosEpoch + i * arcTimeStep;
              const pos = calculatePosition(arcSat, t);
              let arcShadow = earthShadowFactor(pos.x, pos.y, pos.z, arcSunR);
              if (arcShadow >= 1.0 && arcSolarEcl && isSolarEclipsed(pos.x, pos.y, pos.z, arcMoonR, arcSunR)) arcShadow = 0.0;
              const dim = ECLIPSE_DIM + arcShadow * (1.0 - ECLIPSE_DIM);
              positions.push(pos.x / DRAW_SCALE, pos.y / DRAW_SCALE, pos.z / DRAW_SCALE);
              colors.push(cr * dim, cg * dim, cb * dim);
            }
            this.passArcGeo.dispose();
            this.passArcGeo = new LineGeometry();
            this.passArcGeo.setPositions(positions);
            this.passArcGeo.setColors(colors);
            this.passArcLine.geometry = this.passArcGeo;

            // Position AOS/LOS markers at arc endpoints
            this.passAosMarker.position.set(positions[0], positions[1], positions[2]);
            this.passLosMarker.position.set(
              positions[positions.length - 3],
              positions[positions.length - 2],
              positions[positions.length - 1]
            );

            // TCA marker at max elevation point
            const tcaPos = calculatePosition(arcSat, pass.maxElEpoch);
            this.passTcaMarker.position.set(
              tcaPos.x / DRAW_SCALE, tcaPos.y / DRAW_SCALE, tcaPos.z / DRAW_SCALE
            );

            // Store draw-space positions for label projection
            uiStore.passAosDrawPos = { x: positions[0], y: positions[1], z: positions[2] };
            uiStore.passLosDrawPos = {
              x: positions[positions.length - 3],
              y: positions[positions.length - 2],
              z: positions[positions.length - 1],
            };
            uiStore.passTcaDrawPos = {
              x: tcaPos.x / DRAW_SCALE, y: tcaPos.y / DRAW_SCALE, z: tcaPos.z / DRAW_SCALE,
            };
            uiStore.passAosText = `AOS ${pass.aosAz.toFixed(0)}°`;
            uiStore.passLosText = `LOS ${pass.losAz.toFixed(0)}°`;
            uiStore.passTcaText = `TCA ${pass.maxEl.toFixed(0)}°`;
          } else {
            this.passArcLine.visible = false;
            this.passAosMarker.visible = false;
            this.passLosMarker.visible = false;
            this.passTcaMarker.visible = false;
          }
        }
        if (this.lastPassArcKey === arcKey && this.passArcLine.geometry.attributes.position) {
          this.passArcMat.resolution.set(window.innerWidth, window.innerHeight);
          this.passArcMat.opacity = cHL.a;
          this.passArcLine.visible = true;
          // Update marker colors from theme (clamped below bloom threshold)
          const setMarkerColor = (s: THREE.Sprite, c: string) => {
            const col = (s.material as THREE.SpriteMaterial).color.set(c);
            const m = Math.max(col.r, col.g, col.b);
            if (m > 0.9) col.multiplyScalar(0.9 / m);
          };
          setMarkerColor(this.passAosMarker, palette.markerAos || '#00ffcc');
          setMarkerColor(this.passLosMarker, palette.markerLos || '#666');
          setMarkerColor(this.passTcaMarker, palette.markerTca || '#ff66cc');
          // Earth occlusion: hide markers behind Earth
          const earthR = EARTH_RADIUS_KM / DRAW_SCALE;
          if (cameraPos) {
            this.passAosMarker.visible = !this.isOccludedByEarth(cameraPos, this.passAosMarker.position, earthR);
            this.passLosMarker.visible = !this.isOccludedByEarth(cameraPos, this.passLosMarker.position, earthR);
            this.passTcaMarker.visible = !this.isOccludedByEarth(cameraPos, this.passTcaMarker.position, earthR);
          } else {
            this.passAosMarker.visible = true;
            this.passLosMarker.visible = true;
            this.passTcaMarker.visible = true;
          }
        }
      } else {
        this.passArcLine.visible = false;
        this.passAosMarker.visible = false;
        this.passLosMarker.visible = false;
        this.passTcaMarker.visible = false;
        this.lastPassArcKey = '';
        uiStore.passAosDrawPos = null;
        uiStore.passLosDrawPos = null;
        uiStore.passTcaDrawPos = null;
      }
    } else {
      this.highlightLine.visible = false;
      this.nadirLine.visible = false;
      this.observerLine.visible = false;
      this.passArcLine.visible = false;
      this.passAosMarker.visible = false;
      this.passLosMarker.visible = false;
      this.passTcaMarker.visible = false;
      this.lastPassArcKey = '';
      uiStore.passAosDrawPos = null;
      uiStore.passLosDrawPos = null;
      uiStore.passTcaDrawPos = null;
    }

    // --- Normal orbits: assembled from precomputed analytical data ---
    const hasSelection = selectedSats.size > 0;
    if (!this.showNormalOrbits || !this.precomputedAll || this.precomputedSatCount !== satellites.length || (hasSelection && unselectedFade <= 0.01)) {
      this.normalLines.visible = false;
      return;
    }

    const fadedOut = hasSelection && unselectedFade <= 0.01;

    // Only reassemble GPU buffer when visibility state actually changes
    const needsAssemble = this.lastActiveSat !== hoveredSat
      || this.lastSelectedSatsVersion !== selectedSatsVersion
      || this.lastSelectedSatsSize !== selectedSats.size
      || this.lastFadedOut !== fadedOut;

    if (needsAssemble) {
      this.lastActiveSat = hoveredSat;
      this.lastSelectedSatsVersion = selectedSatsVersion;
      this.lastSelectedSatsSize = selectedSats.size;
      this.lastFadedOut = fadedOut;

      const arr = this.normalBuffer.array as Float32Array;
      const fpo = this.precomputedFloatsPerOrbit;
      let vertIdx = 0;

      if (!hoveredSat && !hasSelection) {
        // Fast path: no filtering needed — single memcpy of entire precomputed buffer
        const totalFloats = satellites.length * fpo;
        if (totalFloats <= this.maxNormalVerts * 3) {
          arr.set(this.precomputedAll.subarray(0, totalFloats));
          vertIdx = totalFloats;
        }
      } else {
        // Selective copy: skip highlighted sats (drawn separately), skip faded-out non-selected
        for (let i = 0; i < satellites.length; i++) {
          const sat = satellites[i];
          if (sat === hoveredSat || selectedSats.has(sat)) continue;
          if (hasSelection && unselectedFade <= 0.01) continue;
          if (vertIdx + fpo > this.maxNormalVerts * 3) break;

          const srcOffset = i * fpo;
          arr.set(this.precomputedAll.subarray(srcOffset, srcOffset + fpo), vertIdx);
          vertIdx += fpo;
        }
      }

      this.normalBuffer.needsUpdate = true;
      this.assembledVertFloats = vertIdx;
    }

    this.normalLines.geometry.setDrawRange(0, this.assembledVertFloats / 3);
    const cNorm = parseHexColor(colorConfig.orbitNormal);
    const alpha = cNorm.a * unselectedFade;
    this.normalMat.color.setRGB(cNorm.r, cNorm.g, cNorm.b);
    this.normalMat.opacity = alpha;
    this.normalLines.visible = this.assembledVertFloats > 0;
  }

  /**
   * Compute all background orbits using full SGP4 propagation.
   * Accurate but expensive — O(satCount × segments) SGP4 calls.
   */
  private computeSGP4Orbits(currentEpoch: number) {
    if (!this.precomputedAll) return;

    const sats = this.satellites;
    const segs = this.currentSegments;
    const eciFloatsPerOrbit = this.precomputedFloatsPerOrbit;

    for (let s = 0; s < sats.length; s++) {
      const sat = sats[s];
      const periodDays = TWO_PI / sat.meanMotion / 86400.0;
      const timeStep = periodDays / segs;
      let eciIdx = s * eciFloatsPerOrbit;
      let px = 0, py = 0, pz = 0;

      for (let i = 0; i <= segs; i++) {
        const t = currentEpoch + i * timeStep;
        const pos = calculatePosition(sat, t);
        const cx = pos.x / DRAW_SCALE;
        const cy = pos.y / DRAW_SCALE;
        const cz = pos.z / DRAW_SCALE;

        if (i > 0) {
          this.precomputedAll![eciIdx++] = px;
          this.precomputedAll![eciIdx++] = py;
          this.precomputedAll![eciIdx++] = pz;
          this.precomputedAll![eciIdx++] = cx;
          this.precomputedAll![eciIdx++] = cy;
          this.precomputedAll![eciIdx++] = cz;
        }
        px = cx; py = cy; pz = cz;
      }
    }

    this.lastActiveSat = undefined; // force GPU buffer reassembly
  }

  setOrbitSegments(n: number) {
    if (n === this.configuredSegments) return;
    this.configuredSegments = n;

    // Reallocate GPU buffer if new segment count needs more space
    const needed = 15000 * n * 2;
    if (needed > this.maxNormalVerts) {
      this.maxNormalVerts = needed;
      const newBuf = new THREE.BufferAttribute(new Float32Array(needed * 3), 3);
      newBuf.setUsage(THREE.DynamicDrawUsage);
      this.normalLines.geometry.setAttribute('position', newBuf);
      this.normalBuffer = newBuf;
    }

    if (this.satellites.length > 0) {
      this.precomputeOrbits(this.satellites, this.lastConfigEpoch);
    }
  }

  setJ2Enabled(v: boolean) {
    if (v === this.j2Enabled) return;
    this.j2Enabled = v;
    if (this.orbitMode === 'analytical' && this.perifocalAll) {
      this.recomputeECI(this.lastConfigEpoch);
    }
  }

  setDragEnabled(v: boolean) {
    this.dragEnabled = v;
  }

  setOrbitMode(mode: 'analytical' | 'sgp4') {
    if (mode === this.orbitMode) return;
    this.orbitMode = mode;
    if (this.satellites.length > 0) {
      this.precomputeOrbits(this.satellites, this.lastConfigEpoch);
    }
  }

  /**
   * Analytical orbit scrub: intersect a camera ray with the orbital plane,
   * find the closest true anomaly on the ellipse, and convert to epoch.
   * Returns null if no highlighted sat or ray doesn't come close to the orbit.
   */
  scrubOrbitFromRay(
    raycaster: THREE.Raycaster, camera: THREE.PerspectiveCamera,
    mousePos: THREE.Vector2, currentEpoch: number, hitThresholdPx: number,
    sat?: Satellite,
  ): { M: number; dist: number } | null {
    // Use provided sat, or fall back to the first satellite that has scrub points
    if (!sat) return null;

    // Get orbital plane orientation (J2-corrected)
    const corrected = this.j2Enabled ? getCorrectedElements(sat, currentEpoch) : null;
    const raan = corrected ? corrected.raan : sat.raan;
    const w = corrected ? corrected.argPerigee : sat.argPerigee;
    const inc = sat.inclination;
    const a = sat.semiMajorAxis;
    const e = sat.eccentricity;
    const p = a * (1 - e * e);

    // Rotation matrix: perifocal → ECI (standard, not render-space)
    const cosO = Math.cos(raan), sinO = Math.sin(raan);
    const cosI = Math.cos(inc), sinI = Math.sin(inc);
    const cosW = Math.cos(w), sinW = Math.sin(w);

    // Orbital plane normal in ECI = R * [0,0,1]
    const nxEci = sinO * sinI;
    const nyEci = -cosO * sinI;
    const nzEci = cosI;
    // Convert to render-space: x=eci.x, y=eci.z, z=-eci.y
    const nx = nxEci / DRAW_SCALE * DRAW_SCALE; // just nxEci
    const ny = nzEci;
    const nz = -nyEci;

    // Ray-plane intersection
    const ray = raycaster.ray;
    const denom = ray.direction.x * nx + ray.direction.y * ny + ray.direction.z * nz;
    if (Math.abs(denom) < 1e-10) return null;
    const t = -(ray.origin.x * nx + ray.origin.y * ny + ray.origin.z * nz) / denom;
    if (t < 0) return null;

    // Intersection point in render-space (draw-scale)
    const ix = ray.origin.x + t * ray.direction.x;
    const iy = ray.origin.y + t * ray.direction.y;
    const iz = ray.origin.z + t * ray.direction.z;

    // Convert to ECI (km): eci.x = render.x * DRAW_SCALE, eci.y = -render.z * DRAW_SCALE, eci.z = render.y * DRAW_SCALE
    const eciX = ix * DRAW_SCALE;
    const eciY = -iz * DRAW_SCALE;
    const eciZ = iy * DRAW_SCALE;

    // Project to perifocal frame: inverse of rotation matrix (= transpose)
    const r11 = cosO * cosW - sinO * sinW * cosI;
    const r12 = -cosO * sinW - sinO * cosW * cosI;
    const r21 = sinO * cosW + cosO * sinW * cosI;
    const r22 = -sinO * sinW + cosO * cosW * cosI;
    const r31 = sinW * sinI;
    const r32 = cosW * sinI;
    // Transpose: perifocal = R^T * eci
    const xpf = r11 * eciX + r21 * eciY + r31 * eciZ;
    const ypf = r12 * eciX + r22 * eciY + r32 * eciZ;

    // True anomaly from perifocal coordinates
    let nu = Math.atan2(ypf, xpf);
    if (nu < 0) nu += TWO_PI;

    // Closest point on the ellipse at this true anomaly
    const cosNu = Math.cos(nu);
    const rOrbit = p / (1 + e * cosNu);
    const exX = rOrbit * cosNu;
    const exY = rOrbit * Math.sin(nu);

    // Check screen-space distance between mouse and this ellipse point
    // Convert ellipse point back to render-space
    const exEciX = r11 * exX + r12 * exY;
    const exEciY = r21 * exX + r22 * exY;
    const exEciZ = r31 * exX + r32 * exY;
    const tmp = new THREE.Vector3(exEciX / DRAW_SCALE, exEciZ / DRAW_SCALE, -exEciY / DRAW_SCALE);
    tmp.project(camera);
    const sx = (tmp.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-tmp.y * 0.5 + 0.5) * window.innerHeight;
    const screenDist = Math.hypot(sx - mousePos.x, sy - mousePos.y);
    if (screenDist > hitThresholdPx) return null;

    // True anomaly → eccentric anomaly → mean anomaly
    const E = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(nu), e + cosNu);
    let M = E - e * Math.sin(E);
    if (M < 0) M += TWO_PI;

    return { M, dist: screenDist };
  }

  private isOccludedByEarth(camPos: THREE.Vector3, p: THREE.Vector3, earthR: number): boolean {
    const vx = p.x - camPos.x, vy = p.y - camPos.y, vz = p.z - camPos.z;
    const L = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (L === 0) return false;
    const dx = vx / L, dy = vy / L, dz = vz / L;
    const t = -(camPos.x * dx + camPos.y * dy + camPos.z * dz);
    if (t > 0 && t < L) {
      const cx = camPos.x + dx * t;
      const cy = camPos.y + dy * t;
      const cz = camPos.z + dz * t;
      if (Math.sqrt(cx * cx + cy * cy + cz * cz) < earthR * 0.99) return true;
    }
    return false;
  }

  clear() {
    this.highlightLine.visible = false;
    this.nadirLine.visible = false;
    this.observerLine.visible = false;
    this.normalLines.visible = false;
    this.passArcLine.visible = false;
    this.passAosMarker.visible = false;
    this.passLosMarker.visible = false;
    this.passTcaMarker.visible = false;
    this.lastPassArcKey = '';
  }
}
