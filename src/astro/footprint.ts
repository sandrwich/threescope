import * as THREE from 'three';
import { EARTH_RADIUS_KM, DRAW_SCALE, FP_RINGS, FP_PTS, TWO_PI } from '../constants';

/** Number of floats in one footprint fill mesh (FP_RINGS * FP_PTS * 2 triangles * 3 verts * 3 components). */
export const FP_FILL_FLOATS = FP_RINGS * FP_PTS * 6 * 3;

/** Number of floats in one footprint border ring (FP_PTS * 3 components). */
export const FP_BORDER_FLOATS = FP_PTS * 3;

// Reusable temporaries — avoid per-call allocations
const _sNorm = new THREE.Vector3();
const _up = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();

// Pre-computed sin/cos table for azimuth angles (FP_PTS points around circle)
const _cosAlpha = new Float32Array(FP_PTS + 1);
const _sinAlpha = new Float32Array(FP_PTS + 1);
for (let k = 0; k <= FP_PTS; k++) {
  const alpha = (TWO_PI * k) / FP_PTS;
  _cosAlpha[k] = Math.cos(alpha);
  _sinAlpha[k] = Math.sin(alpha);
}

// Scratch ring buffers: two adjacent rings (current and next), 3 floats per point
const _ring0 = new Float32Array(FP_PTS * 3);
const _ring1 = new Float32Array(FP_PTS * 3);

/**
 * Compute footprint fill triangles directly into a Float32Array.
 * Returns false if satellite is below Earth surface.
 */
export function computeFootprintFill(satPos: THREE.Vector3, out: Float32Array): boolean {
  const r = satPos.length();
  if (r <= EARTH_RADIUS_KM) return false;

  const theta = Math.acos(EARTH_RADIUS_KM / r);
  _sNorm.copy(satPos).normalize();

  // Build orthonormal basis
  if (Math.abs(_sNorm.y) > 0.99) _up.set(1, 0, 0); else _up.set(0, 1, 0);
  _u.crossVectors(_up, _sNorm).normalize();
  _v.crossVectors(_sNorm, _u);

  const s = 1.01 / DRAW_SCALE;
  const snx = _sNorm.x, sny = _sNorm.y, snz = _sNorm.z;
  const ux = _u.x, uy = _u.y, uz = _u.z;
  const vx = _v.x, vy = _v.y, vz = _v.z;

  // Compute ring 0
  const a0 = 0; // theta * 0/FP_RINGS
  const dPlane0 = EARTH_RADIUS_KM; // cos(0) = 1
  const rCircle0 = 0; // sin(0) = 0
  for (let k = 0; k < FP_PTS; k++) {
    _ring0[k * 3] = (snx * dPlane0 + ux * _cosAlpha[k] * rCircle0 + vx * _sinAlpha[k] * rCircle0) * s;
    _ring0[k * 3 + 1] = (sny * dPlane0 + uy * _cosAlpha[k] * rCircle0 + vy * _sinAlpha[k] * rCircle0) * s;
    _ring0[k * 3 + 2] = (snz * dPlane0 + uz * _cosAlpha[k] * rCircle0 + vz * _sinAlpha[k] * rCircle0) * s;
  }

  let wi = 0;
  for (let i = 0; i < FP_RINGS; i++) {
    const a1 = theta * ((i + 1) / FP_RINGS);
    const dPlane1 = EARTH_RADIUS_KM * Math.cos(a1);
    const rCircle1 = EARTH_RADIUS_KM * Math.sin(a1);

    // Compute next ring into _ring1
    for (let k = 0; k < FP_PTS; k++) {
      _ring1[k * 3] = (snx * dPlane1 + ux * _cosAlpha[k] * rCircle1 + vx * _sinAlpha[k] * rCircle1) * s;
      _ring1[k * 3 + 1] = (sny * dPlane1 + uy * _cosAlpha[k] * rCircle1 + vy * _sinAlpha[k] * rCircle1) * s;
      _ring1[k * 3 + 2] = (snz * dPlane1 + uz * _cosAlpha[k] * rCircle1 + vz * _sinAlpha[k] * rCircle1) * s;
    }

    for (let k = 0; k < FP_PTS; k++) {
      const next = (k + 1) % FP_PTS;
      const k3 = k * 3, n3 = next * 3;

      // Triangle 1: ring0[k], ring1[k], ring0[next]
      out[wi++] = _ring0[k3];     out[wi++] = _ring0[k3 + 1];     out[wi++] = _ring0[k3 + 2];
      out[wi++] = _ring1[k3];     out[wi++] = _ring1[k3 + 1];     out[wi++] = _ring1[k3 + 2];
      out[wi++] = _ring0[n3];     out[wi++] = _ring0[n3 + 1];     out[wi++] = _ring0[n3 + 2];

      // Triangle 2: ring0[next], ring1[k], ring1[next]
      out[wi++] = _ring0[n3];     out[wi++] = _ring0[n3 + 1];     out[wi++] = _ring0[n3 + 2];
      out[wi++] = _ring1[k3];     out[wi++] = _ring1[k3 + 1];     out[wi++] = _ring1[k3 + 2];
      out[wi++] = _ring1[n3];     out[wi++] = _ring1[n3 + 1];     out[wi++] = _ring1[n3 + 2];
    }

    // Swap rings: current next becomes current for next iteration
    _ring0.set(_ring1);
  }

  return true;
}

/**
 * Compute footprint border (outermost ring) directly into a Float32Array.
 * Returns false if satellite is below Earth surface.
 */
export function computeFootprintBorder(satPos: THREE.Vector3, out: Float32Array): boolean {
  const r = satPos.length();
  if (r <= EARTH_RADIUS_KM) return false;

  const theta = Math.acos(EARTH_RADIUS_KM / r);
  _sNorm.copy(satPos).normalize();

  if (Math.abs(_sNorm.y) > 0.99) _up.set(1, 0, 0); else _up.set(0, 1, 0);
  _u.crossVectors(_up, _sNorm).normalize();
  _v.crossVectors(_sNorm, _u);

  const s = 1.01 / DRAW_SCALE;
  const snx = _sNorm.x, sny = _sNorm.y, snz = _sNorm.z;
  const ux = _u.x, uy = _u.y, uz = _u.z;
  const vx = _v.x, vy = _v.y, vz = _v.z;

  // Outermost ring (i = FP_RINGS)
  const dPlane = EARTH_RADIUS_KM * Math.cos(theta);
  const rCircle = EARTH_RADIUS_KM * Math.sin(theta);

  for (let k = 0; k < FP_PTS; k++) {
    out[k * 3] = (snx * dPlane + ux * _cosAlpha[k] * rCircle + vx * _sinAlpha[k] * rCircle) * s;
    out[k * 3 + 1] = (sny * dPlane + uy * _cosAlpha[k] * rCircle + vy * _sinAlpha[k] * rCircle) * s;
    out[k * 3 + 2] = (snz * dPlane + uz * _cosAlpha[k] * rCircle + vz * _sinAlpha[k] * rCircle) * s;
  }

  return true;
}

/**
 * Generate footprint grid for 2D map projection.
 * Returns (FP_RINGS+1) × FP_PTS grid of {x, y, z} positions in km.
 * Reuses a module-level grid to avoid per-call allocations.
 */
const _grid: { x: number; y: number; z: number }[][] = Array.from({ length: FP_RINGS + 1 }, () =>
  Array.from({ length: FP_PTS }, () => ({ x: 0, y: 0, z: 0 }))
);

export function computeFootprintGrid(satPos: THREE.Vector3): typeof _grid | null {
  const r = satPos.length();
  if (r <= EARTH_RADIUS_KM) return null;

  const theta = Math.acos(EARTH_RADIUS_KM / r);
  _sNorm.copy(satPos).normalize();

  if (Math.abs(_sNorm.y) > 0.99) _up.set(1, 0, 0); else _up.set(0, 1, 0);
  _u.crossVectors(_up, _sNorm).normalize();
  _v.crossVectors(_sNorm, _u);

  const snx = _sNorm.x, sny = _sNorm.y, snz = _sNorm.z;
  const ux = _u.x, uy = _u.y, uz = _u.z;
  const vx = _v.x, vy = _v.y, vz = _v.z;

  for (let i = 0; i <= FP_RINGS; i++) {
    const a = theta * (i / FP_RINGS);
    const dPlane = EARTH_RADIUS_KM * Math.cos(a);
    const rCircle = EARTH_RADIUS_KM * Math.sin(a);
    const ring = _grid[i];
    for (let k = 0; k < FP_PTS; k++) {
      const pt = ring[k];
      pt.x = snx * dPlane + ux * _cosAlpha[k] * rCircle + vx * _sinAlpha[k] * rCircle;
      pt.y = sny * dPlane + uy * _cosAlpha[k] * rCircle + vy * _sinAlpha[k] * rCircle;
      pt.z = snz * dPlane + uz * _cosAlpha[k] * rCircle + vz * _sinAlpha[k] * rCircle;
    }
  }

  return _grid;
}
