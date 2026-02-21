import * as THREE from 'three';
import type { Satellite } from '../types';
import { DRAW_SCALE, TWO_PI, MU, ORBIT_RECOMPUTE_INTERVAL_S } from '../constants';
import { parseHexColor } from '../config';
import { calculatePosition } from '../astro/propagator';
import { epochToUnix } from '../astro/epoch';

// Segment counts for orbit visualization
const SEGMENTS_NORMAL = 90;
const SEGMENTS_LARGE = 30;

export class OrbitRenderer {
  private scene: THREE.Scene;

  // Reusable highlight orbit (SGP4 for accuracy on single satellite)
  private highlightLine: THREE.Line;
  private highlightBuffer: THREE.BufferAttribute;
  private highlightMat: THREE.LineBasicMaterial;
  private maxHighlightPts = 4001;

  // Reusable nadir line
  private nadirLine: THREE.Line;
  private nadirBuffer: THREE.BufferAttribute;
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

  // Assembly state — only rebuild GPU buffer when visibility changes
  private lastActiveSat: Satellite | null | undefined = undefined; // undefined = never assembled
  private lastSelectedSat: Satellite | null | undefined = undefined;
  private lastFadedOut = false;
  private assembledVertFloats = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Pre-allocate highlight orbit buffer
    const hlGeo = new THREE.BufferGeometry();
    this.highlightBuffer = new THREE.BufferAttribute(new Float32Array(this.maxHighlightPts * 3), 3);
    this.highlightBuffer.setUsage(THREE.DynamicDrawUsage);
    hlGeo.setAttribute('position', this.highlightBuffer);
    hlGeo.setDrawRange(0, 0);
    this.highlightMat = new THREE.LineBasicMaterial({ transparent: true });
    this.highlightLine = new THREE.Line(hlGeo, this.highlightMat);
    this.highlightLine.frustumCulled = false;
    this.highlightLine.visible = false;
    scene.add(this.highlightLine);

    // Pre-allocate nadir line buffer
    const ndGeo = new THREE.BufferGeometry();
    this.nadirBuffer = new THREE.BufferAttribute(new Float32Array(6), 3);
    this.nadirBuffer.setUsage(THREE.DynamicDrawUsage);
    ndGeo.setAttribute('position', this.nadirBuffer);
    this.nadirMat = new THREE.LineBasicMaterial({ transparent: true });
    this.nadirLine = new THREE.Line(ndGeo, this.nadirMat);
    this.nadirLine.frustumCulled = false;
    this.nadirLine.visible = false;
    scene.add(this.nadirLine);

    // Pre-allocate normal orbits buffer — sized for up to 15000 sats * 30 segments * 2 verts
    this.maxNormalVerts = 15000 * SEGMENTS_LARGE * 2;
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
    const segs = satCount > 500 ? SEGMENTS_LARGE : SEGMENTS_NORMAL;
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

    // Phase 2: Rotate perifocal → ECI using J2-corrected elements
    this.recomputeECI(currentEpoch);

    this.lastRecomputeEpoch = currentEpoch;
    this.lastRecomputeWallMs = performance.now();
    this.lastPeriCheckEpoch = currentEpoch;
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
    const currentUnix = epochToUnix(currentEpoch);

    for (let s = 0; s < sats.length; s++) {
      const sat = sats[s];

      // Time delta from TLE epoch (seconds)
      const deltaS = currentUnix - epochToUnix(sat.epochDays);

      // J2-corrected orientation angles
      const raan = sat.raan + sat.raanRate * deltaS;
      const w = sat.argPerigee + sat.argPerigeeRate * deltaS;
      const inc = sat.inclination; // no secular J2 change

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
    if (!this.perifocalAll) return;

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
    selectedSat: Satellite | null,
    unselectedFade: number,
    orbitsToDraw: number,
    colorConfig: { orbitNormal: string; orbitHighlighted: string }
  ) {
    // --- J2 periodic recomputation ---
    if (this.precomputedAll && this.perifocalAll) {
      const now = performance.now();
      // Wall-clock guard: max ~30 Hz recompute rate
      if (now - this.lastRecomputeWallMs > 33) {
        const deltaSim = Math.abs(
          epochToUnix(currentEpoch) - epochToUnix(this.lastRecomputeEpoch)
        );
        if (deltaSim > ORBIT_RECOMPUTE_INTERVAL_S) {
          this.recomputeECI(currentEpoch);
          this.lastRecomputeEpoch = currentEpoch;
          this.lastRecomputeWallMs = now;
        }
      }
      // ndot perifocal rebuild (rare)
      this.checkPeifocalRebuild(currentEpoch);
    }

    const activeSat = hoveredSat ?? selectedSat;
    const cHL = parseHexColor(colorConfig.orbitHighlighted);

    // --- Highlighted orbit (SGP4 for accuracy — shows perturbation over multiple orbits) ---
    if (activeSat) {
      const segments = Math.min(this.maxHighlightPts - 1, Math.max(90, Math.floor(400 * orbitsToDraw)));
      const periodDays = TWO_PI / activeSat.meanMotion / 86400.0;
      const timeStep = (periodDays * orbitsToDraw) / segments;
      const arr = this.highlightBuffer.array as Float32Array;

      for (let i = 0; i <= segments; i++) {
        const t = currentEpoch + i * timeStep;
        const pos = calculatePosition(activeSat, t);
        arr[i * 3] = pos.x / DRAW_SCALE;
        arr[i * 3 + 1] = pos.y / DRAW_SCALE;
        arr[i * 3 + 2] = pos.z / DRAW_SCALE;
      }

      this.highlightBuffer.needsUpdate = true;
      this.highlightLine.geometry.setDrawRange(0, segments + 1);
      this.highlightMat.color.setRGB(cHL.r, cHL.g, cHL.b);
      this.highlightMat.opacity = cHL.a;
      this.highlightLine.visible = true;

      // Nadir line
      const nd = this.nadirBuffer.array as Float32Array;
      nd[0] = 0; nd[1] = 0; nd[2] = 0;
      nd[3] = activeSat.currentPos.x / DRAW_SCALE;
      nd[4] = activeSat.currentPos.y / DRAW_SCALE;
      nd[5] = activeSat.currentPos.z / DRAW_SCALE;
      this.nadirBuffer.needsUpdate = true;
      this.nadirMat.color.setRGB(cHL.r, cHL.g, cHL.b);
      this.nadirMat.opacity = cHL.a * 0.5;
      this.nadirLine.visible = true;
    } else {
      this.highlightLine.visible = false;
      this.nadirLine.visible = false;
    }

    // --- Normal orbits: assembled from precomputed analytical data ---
    if ((selectedSat !== null && unselectedFade <= 0.01) || !this.precomputedAll || this.precomputedSatCount !== satellites.length) {
      this.normalLines.visible = false;
      return;
    }

    const fadedOut = selectedSat !== null && unselectedFade <= 0.01;

    // Only reassemble GPU buffer when visibility state actually changes
    const needsAssemble = this.lastActiveSat !== activeSat
      || this.lastSelectedSat !== selectedSat
      || this.lastFadedOut !== fadedOut;

    if (needsAssemble) {
      this.lastActiveSat = activeSat;
      this.lastSelectedSat = selectedSat;
      this.lastFadedOut = fadedOut;

      const arr = this.normalBuffer.array as Float32Array;
      const fpo = this.precomputedFloatsPerOrbit;
      let vertIdx = 0;

      if (!activeSat && !selectedSat) {
        // Fast path: no filtering needed — single memcpy of entire precomputed buffer
        const totalFloats = satellites.length * fpo;
        if (totalFloats <= this.maxNormalVerts * 3) {
          arr.set(this.precomputedAll.subarray(0, totalFloats));
          vertIdx = totalFloats;
        }
      } else {
        // Selective copy, skipping active satellite
        for (let i = 0; i < satellites.length; i++) {
          if (satellites[i] === activeSat) continue;
          if (selectedSat && satellites[i] !== selectedSat && unselectedFade <= 0.01) continue;
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

  clear() {
    this.highlightLine.visible = false;
    this.nadirLine.visible = false;
    this.normalLines.visible = false;
  }
}
