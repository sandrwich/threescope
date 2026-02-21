import * as THREE from 'three';
import { DEG2RAD } from '../constants';
import { epochToJulianDate, normalizeEpoch } from './epoch';

export function calculateSunPosition(currentEpoch: number): THREE.Vector3 {
  currentEpoch = normalizeEpoch(currentEpoch);
  const jd = epochToJulianDate(currentEpoch);
  const n = jd - 2451545.0;

  let L = (280.460 + 0.9856474 * n) % 360.0;
  if (L < 0) L += 360.0;

  let g = (357.528 + 0.9856003 * n) % 360.0;
  if (g < 0) g += 360.0;

  const lambda = L + 1.915 * Math.sin(g * DEG2RAD) + 0.020 * Math.sin(2.0 * g * DEG2RAD);
  const epsilon = 23.439 - 0.0000004 * n;

  const xEcl = Math.cos(lambda * DEG2RAD);
  const yEcl = Math.sin(lambda * DEG2RAD);

  const xEci = xEcl;
  const yEci = yEcl * Math.cos(epsilon * DEG2RAD);
  const zEci = yEcl * Math.sin(epsilon * DEG2RAD);

  // ECI to render coords: x=eci.x, y=eci.z, z=-eci.y
  return new THREE.Vector3(xEci, zEci, -yEci).normalize();
}
