import * as THREE from 'three';
import type { Satellite } from '../types';
import { DRAW_SCALE, TWO_PI } from '../constants';
import { parseHexColor } from '../config';
import { calculatePosition } from '../astro/propagator';

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

  // Precomputed analytical Keplerian orbits
  // All orbit ellipses stored contiguously: [sat0_seg0_v0, sat0_seg0_v1, ..., sat1_seg0_v0, ...]
  private precomputedAll: Float32Array | null = null;
  private precomputedSatCount = 0;
  private precomputedFloatsPerOrbit = 0;

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
   * Precompute all orbit ellipses analytically from Keplerian elements.
   * Called once when TLE data loads — no SGP4 involved.
   * Each orbit is a closed ellipse in 3D defined by (a, e, i, Ω, ω).
   */
  precomputeOrbits(satellites: Satellite[]) {
    const satCount = satellites.length;
    const segs = satCount > 500 ? SEGMENTS_LARGE : SEGMENTS_NORMAL;
    const floatsPerOrbit = segs * 6; // segs line segments × 2 verts × 3 components

    this.precomputedAll = new Float32Array(satCount * floatsPerOrbit);
    this.precomputedSatCount = satCount;
    this.precomputedFloatsPerOrbit = floatsPerOrbit;

    for (let s = 0; s < satCount; s++) {
      this.computeKeplerianOrbit(satellites[s], segs, this.precomputedAll, s * floatsPerOrbit);
    }

    // Force reassembly on next update
    this.lastActiveSat = undefined;
  }

  /**
   * Compute a single orbit ellipse analytically from Keplerian elements.
   * Uses the perifocal-to-ECI rotation matrix — just trig and matrix multiply.
   * ~100x faster than SGP4 per point.
   */
  private computeKeplerianOrbit(
    sat: Satellite, segs: number, out: Float32Array, outOffset: number
  ) {
    const { semiMajorAxis: a, eccentricity: e, inclination: inc, raan, argPerigee: w } = sat;

    // Semi-latus rectum
    const p = a * (1 - e * e);

    // Perifocal-to-ECI rotation matrix (computed once per satellite)
    const cosO = Math.cos(raan), sinO = Math.sin(raan);
    const cosI = Math.cos(inc), sinI = Math.sin(inc);
    const cosW = Math.cos(w), sinW = Math.sin(w);

    // R = Rz(-Ω) · Rx(-i) · Rz(-ω)
    // Only need columns 1-2 since z_perifocal = 0
    const r11 = cosO * cosW - sinO * sinW * cosI;
    const r12 = -cosO * sinW - sinO * cosW * cosI;
    const r21 = sinO * cosW + cosO * sinW * cosI;
    const r22 = -sinO * sinW + cosO * cosW * cosI;
    const r31 = sinW * sinI;
    const r32 = cosW * sinI;

    let px = 0, py = 0, pz = 0;
    let idx = outOffset;

    for (let i = 0; i <= segs; i++) {
      const nu = (i / segs) * TWO_PI;
      const cosNu = Math.cos(nu);
      const sinNu = Math.sin(nu);
      const r = p / (1 + e * cosNu);

      // Perifocal position
      const xpf = r * cosNu;
      const ypf = r * sinNu;

      // ECI position via rotation matrix (z_pf = 0, so only 2 columns needed)
      const xeci = r11 * xpf + r12 * ypf;
      const yeci = r21 * xpf + r22 * ypf;
      const zeci = r31 * xpf + r32 * ypf;

      // Render coords: x=eci.x, y=eci.z, z=-eci.y, divided by DRAW_SCALE
      const cx = xeci / DRAW_SCALE;
      const cy = zeci / DRAW_SCALE;
      const cz = -yeci / DRAW_SCALE;

      if (i > 0) {
        out[idx++] = px; out[idx++] = py; out[idx++] = pz;
        out[idx++] = cx; out[idx++] = cy; out[idx++] = cz;
      }
      px = cx; py = cy; pz = cz;
    }
  }

  update(
    satellites: Satellite[],
    currentEpoch: number,
    hoveredSat: Satellite | null,
    selectedSat: Satellite | null,
    unselectedFade: number,
    orbitsToDraw: number,
    colorConfig: { orbitNormal: string; orbitHighlighted: string },
    _dt: number
  ) {
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
    if (unselectedFade <= 0.01 || !this.precomputedAll || this.precomputedSatCount !== satellites.length) {
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
    const isUnselected = selectedSat !== null;
    const alpha = isUnselected ? cNorm.a * unselectedFade : cNorm.a;
    this.normalMat.color.setRGB(cNorm.r, cNorm.g, cNorm.b);
    this.normalMat.opacity = alpha;
    this.normalLines.visible = this.assembledVertFloats > 0;
  }

  invalidateCache() {
    this.lastActiveSat = undefined; // force reassembly on next update
  }

  clear() {
    this.highlightLine.visible = false;
    this.nadirLine.visible = false;
    this.normalLines.visible = false;
  }
}
