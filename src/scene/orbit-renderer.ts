import * as THREE from 'three';
import type { Satellite } from '../types';
import { DRAW_SCALE, TWO_PI, MU, ORBIT_RECOMPUTE_INTERVAL_S, SAT_COLORS } from '../constants';
import { parseHexColor } from '../config';
import { calculatePosition, getCorrectedElements } from '../astro/propagator';
import { epochToUnix } from '../astro/epoch';

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

  // Nadir lines (one per highlighted sat)
  private nadirLine: THREE.LineSegments;
  private nadirBuffer: THREE.BufferAttribute;
  private nadirColorBuffer: THREE.BufferAttribute;
  private nadirMat: THREE.LineBasicMaterial;

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

    // Pre-allocate nadir line buffer (one line segment per highlighted sat)
    const ndGeo = new THREE.BufferGeometry();
    this.nadirBuffer = new THREE.BufferAttribute(new Float32Array(this.maxHighlightOrbits * 2 * 3), 3);
    this.nadirBuffer.setUsage(THREE.DynamicDrawUsage);
    this.nadirColorBuffer = new THREE.BufferAttribute(new Float32Array(this.maxHighlightOrbits * 2 * 3), 3);
    this.nadirColorBuffer.setUsage(THREE.DynamicDrawUsage);
    ndGeo.setAttribute('position', this.nadirBuffer);
    ndGeo.setAttribute('color', this.nadirColorBuffer);
    ndGeo.setDrawRange(0, 0);
    this.nadirMat = new THREE.LineBasicMaterial({ transparent: true, vertexColors: true });
    this.nadirLine = new THREE.LineSegments(ndGeo, this.nadirMat);
    this.nadirLine.frustumCulled = false;
    this.nadirLine.visible = false;
    scene.add(this.nadirLine);

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
    colorConfig: { orbitNormal: string; orbitHighlighted: string }
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

      for (let si = 0; si < highlightSats.length; si++) {
        const sat = highlightSats[si];
        const [cr, cg, cb] = ORBIT_COLORS[si % ORBIT_COLORS.length];
        const segments = Math.min(this.highlightSegmentsPerOrbit, Math.max(90, Math.floor(400 * orbitsToDraw)));
        const periodDays = TWO_PI / sat.meanMotion / 86400.0;
        const timeStep = (periodDays * orbitsToDraw) / segments;

        // Compute orbit points, then emit as line-segment pairs
        let px = 0, py = 0, pz = 0;
        for (let i = 0; i <= segments; i++) {
          const t = currentEpoch + i * timeStep;
          const pos = calculatePosition(sat, t);
          const cx = pos.x / DRAW_SCALE;
          const cy = pos.y / DRAW_SCALE;
          const cz = pos.z / DRAW_SCALE;
          if (i > 0 && vi + 6 <= this.maxHighlightVerts * 3) {
            arr[vi] = px; arr[vi+1] = py; arr[vi+2] = pz;
            col[vi] = cr; col[vi+1] = cg; col[vi+2] = cb;
            vi += 3;
            arr[vi] = cx; arr[vi+1] = cy; arr[vi+2] = cz;
            col[vi] = cr; col[vi+1] = cg; col[vi+2] = cb;
            vi += 3;
          }
          px = cx; py = cy; pz = cz;
        }
      }

      this.highlightBuffer.needsUpdate = true;
      this.highlightColorBuffer.needsUpdate = true;
      this.highlightLine.geometry.setDrawRange(0, vi / 3);
      this.highlightMat.color.setRGB(1, 1, 1); // vertex colors handle tinting
      this.highlightMat.opacity = cHL.a;
      this.highlightLine.visible = true;

      // Nadir lines (one per highlighted sat)
      const nd = this.nadirBuffer.array as Float32Array;
      const ndCol = this.nadirColorBuffer.array as Float32Array;
      let ni = 0;
      for (let si = 0; si < highlightSats.length; si++) {
        const sat = highlightSats[si];
        const [cr, cg, cb] = ORBIT_COLORS[si % ORBIT_COLORS.length];
        if (ni + 6 > this.maxHighlightOrbits * 6) break;
        nd[ni] = 0; nd[ni+1] = 0; nd[ni+2] = 0;
        ndCol[ni] = cr; ndCol[ni+1] = cg; ndCol[ni+2] = cb;
        ni += 3;
        nd[ni] = sat.currentPos.x / DRAW_SCALE;
        nd[ni+1] = sat.currentPos.y / DRAW_SCALE;
        nd[ni+2] = sat.currentPos.z / DRAW_SCALE;
        ndCol[ni] = cr; ndCol[ni+1] = cg; ndCol[ni+2] = cb;
        ni += 3;
      }
      this.nadirBuffer.needsUpdate = true;
      this.nadirColorBuffer.needsUpdate = true;
      this.nadirLine.geometry.setDrawRange(0, ni / 3);
      this.nadirMat.color.setRGB(1, 1, 1);
      this.nadirMat.opacity = cHL.a * 0.5;
      this.nadirLine.visible = true;
    } else {
      this.highlightLine.visible = false;
      this.nadirLine.visible = false;
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

  clear() {
    this.highlightLine.visible = false;
    this.nadirLine.visible = false;
    this.normalLines.visible = false;
  }
}
