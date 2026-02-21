import * as THREE from 'three';
import { EARTH_RADIUS_KM, FP_RINGS, FP_PTS, TWO_PI } from '../constants';

/**
 * Generate footprint grid: concentric rings of the satellite's LOS cone on Earth surface.
 * Returns array[FP_RINGS+1][FP_PTS] of Vector3 positions in km (render coords).
 */
export function computeFootprintGrid(satPos: THREE.Vector3): THREE.Vector3[][] | null {
  const r = satPos.length();
  if (r <= EARTH_RADIUS_KM) return null;

  const theta = Math.acos(EARTH_RADIUS_KM / r);
  const sNorm = satPos.clone().normalize();

  // Build orthonormal basis
  const up = Math.abs(sNorm.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(up, sNorm).normalize();
  const v = new THREE.Vector3().crossVectors(sNorm, u);

  const grid: THREE.Vector3[][] = [];

  for (let i = 0; i <= FP_RINGS; i++) {
    const a = theta * (i / FP_RINGS);
    const dPlane = EARTH_RADIUS_KM * Math.cos(a);
    const rCircle = EARTH_RADIUS_KM * Math.sin(a);
    const ring: THREE.Vector3[] = [];

    for (let k = 0; k < FP_PTS; k++) {
      const alpha = (TWO_PI * k) / FP_PTS;
      const pt = sNorm.clone().multiplyScalar(dPlane)
        .add(u.clone().multiplyScalar(Math.cos(alpha) * rCircle))
        .add(v.clone().multiplyScalar(Math.sin(alpha) * rCircle));
      ring.push(pt);
    }
    grid.push(ring);
  }

  return grid;
}
