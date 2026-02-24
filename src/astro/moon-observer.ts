/**
 * Moon position and illumination for observer-facing UI.
 * No THREE.js dependency — returns plain objects.
 */
import { DEG2RAD } from '../constants';
import { epochToJulianDate, normalizeEpoch } from './epoch';
import { sunDirectionECI } from './eclipse';

/**
 * Compute Moon position in standard ECI (km).
 * Same simplified lunar theory as moon.ts but returns plain {x,y,z}.
 */
export function moonPositionECI(epoch: number): { x: number; y: number; z: number } {
  epoch = normalizeEpoch(epoch);
  const jd = epochToJulianDate(epoch);
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
  return {
    x: xEcl,
    y: yEcl * Math.cos(eps) - zEcl * Math.sin(eps),
    z: yEcl * Math.sin(eps) + zEcl * Math.cos(eps),
  };
}

/**
 * Compute Moon illumination percentage (0–100).
 * Uses the elongation angle between Sun and Moon as seen from Earth.
 */
export function moonIllumination(epoch: number): number {
  const moonEci = moonPositionECI(epoch);
  const sunDir = sunDirectionECI(epoch);

  // Moon direction from Earth (normalize)
  const moonDist = Math.sqrt(moonEci.x * moonEci.x + moonEci.y * moonEci.y + moonEci.z * moonEci.z);
  if (moonDist === 0) return 0;
  const mx = moonEci.x / moonDist;
  const my = moonEci.y / moonDist;
  const mz = moonEci.z / moonDist;

  // Elongation = angle between sun direction and moon direction
  const dot = mx * sunDir.x + my * sunDir.y + mz * sunDir.z;
  const elongation = Math.acos(Math.max(-1, Math.min(1, dot)));

  // Illumination fraction: (1 - cos(elongation)) / 2
  return ((1 - Math.cos(elongation)) / 2) * 100;
}
