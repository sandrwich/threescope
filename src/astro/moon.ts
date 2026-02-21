import * as THREE from 'three';
import { DEG2RAD } from '../constants';
import { epochToJulianDate, normalizeEpoch } from './epoch';

export function calculateMoonPosition(currentEpoch: number): THREE.Vector3 {
  currentEpoch = normalizeEpoch(currentEpoch);
  const jd = epochToJulianDate(currentEpoch);
  const D = jd - 2451545.0;

  const L = ((218.316 + 13.176396 * D) % 360.0) * DEG2RAD;
  const M = ((134.963 + 13.064993 * D) % 360.0) * DEG2RAD;
  const F = ((93.272 + 13.229350 * D) % 360.0) * DEG2RAD;

  const lambda = L + 6.289 * DEG2RAD * Math.sin(M);
  const beta = 5.128 * DEG2RAD * Math.sin(F);
  const distKm = 385000.0 - 20905.0 * Math.cos(M);

  const xEcl = distKm * Math.cos(beta) * Math.cos(lambda);
  const yEcl = distKm * Math.cos(beta) * Math.sin(lambda);
  const zEcl = distKm * Math.sin(beta);

  const eps = 23.439 * DEG2RAD;
  const xEci = xEcl;
  const yEci = yEcl * Math.cos(eps) - zEcl * Math.sin(eps);
  const zEci = yEcl * Math.sin(eps) + zEcl * Math.cos(eps);

  // ECI to render: x=eci.x, y=eci.z, z=-eci.y
  return new THREE.Vector3(xEci, zEci, -yEci);
}
