/**
 * Satellite eclipse (Earth shadow) detection.
 * Uses a cylindrical shadow model — accurate enough for LEO/MEO pass prediction.
 * No Three.js dependency so it can run in the pass Web Worker.
 */
import { DEG2RAD, RAD2DEG, EARTH_RADIUS_KM } from '../constants';
import { epochToJulianDate, normalizeEpoch } from './epoch';
import { getAzEl } from './az-el';

/**
 * Compute unit sun direction in standard ECI (Earth-Centered Inertial) coordinates.
 * Same low-precision solar ephemeris as sun.ts but returns plain {x,y,z}
 * instead of THREE.Vector3 for Web Worker compatibility.
 *
 * Reference: Meeus, "Astronomical Algorithms" — low-precision solar position.
 */
export function sunDirectionECI(epoch: number): { x: number; y: number; z: number } {
  epoch = normalizeEpoch(epoch);
  const jd = epochToJulianDate(epoch);

  // Days since J2000.0 epoch (2000-01-01 12:00 TT)
  const n = jd - 2451545.0;

  // Mean longitude of the Sun (degrees), moves ~0.986°/day
  let L = (280.460 + 0.9856474 * n) % 360.0;
  if (L < 0) L += 360.0;

  // Mean anomaly of the Sun (degrees), ~0.986°/day from perihelion
  let g = (357.528 + 0.9856003 * n) % 360.0;
  if (g < 0) g += 360.0;

  // Ecliptic longitude: mean longitude + equation of center (1st & 2nd harmonic)
  // 1.915° and 0.020° are amplitudes of Earth's orbital eccentricity correction
  const lambda = L + 1.915 * Math.sin(g * DEG2RAD) + 0.020 * Math.sin(2.0 * g * DEG2RAD);

  // Obliquity of the ecliptic (axial tilt), ~23.44° with slow drift
  const epsilon = 23.439 - 0.0000004 * n;

  // Ecliptic to ECI rotation (sun is at distance 1 AU, we only need direction)
  const xEcl = Math.cos(lambda * DEG2RAD);
  const yEcl = Math.sin(lambda * DEG2RAD);

  // Rotate from ecliptic plane to equatorial (ECI) by obliquity angle
  const x = xEcl;
  const y = yEcl * Math.cos(epsilon * DEG2RAD);
  const z = yEcl * Math.sin(epsilon * DEG2RAD);

  const len = Math.sqrt(x * x + y * y + z * z);
  return { x: x / len, y: y / len, z: z / len };
}

/**
 * Check if a satellite at ECI position (km) is in Earth's cylindrical shadow.
 * Returns true if eclipsed (in shadow), false if sunlit.
 *
 * Cylindrical model: treats Earth's shadow as an infinite cylinder with
 * radius = EARTH_RADIUS_KM extending away from the Sun. This ignores
 * the penumbra/umbra cone geometry but is accurate to within ~1% for
 * LEO satellites where the shadow boundary is nearly parallel.
 */
export function isEclipsed(
  satX: number, satY: number, satZ: number,
  sunDir: { x: number; y: number; z: number },
): boolean {
  // Project satellite position onto the Sun direction vector.
  // dot > 0 means the satellite is on the sunward side of Earth — always lit.
  // dot < 0 means it's on the anti-sun side — potentially in shadow.
  const dot = satX * sunDir.x + satY * sunDir.y + satZ * sunDir.z;
  if (dot > 0) return false;

  // Compute perpendicular distance from the Earth–Sun axis.
  // Subtract the parallel component to get only the perpendicular part.
  const projX = satX - dot * sunDir.x;
  const projY = satY - dot * sunDir.y;
  const projZ = satZ - dot * sunDir.z;
  const perpDist = Math.sqrt(projX * projX + projY * projY + projZ * projZ);

  // If the satellite is closer to the axis than Earth's radius, it's in shadow.
  return perpDist < EARTH_RADIUS_KM;
}

/**
 * Compute Sun elevation angle (degrees) at the observer's location.
 * Positive = above horizon, negative = below.
 *
 * Uses the same low-precision ephemeris as sunDirectionECI(), scaled to a
 * large distance so getAzEl()'s range math works correctly.
 */
export function sunAltitude(
  epoch: number,
  obsLatDeg: number, obsLonDeg: number, obsAltM: number,
  gmstRad: number,
): number {
  const sunDir = sunDirectionECI(epoch);
  // Sun at "infinity" — scale to 1e6 km
  const { el } = getAzEl(
    sunDir.x * 1e6, sunDir.y * 1e6, sunDir.z * 1e6,
    gmstRad, obsLatDeg, obsLonDeg, obsAltM,
  );
  return el;
}

/**
 * Compute solar elongation — angular distance (degrees) between the Sun
 * and a satellite as seen from the observer. Low elongation (< ~20°) means
 * the satellite is near the Sun in the sky, making observation difficult
 * even during twilight.
 *
 * All positions in standard ECI (km). sunDir is a unit vector.
 */
export function solarElongation(
  satEci: { x: number; y: number; z: number },
  sunDir: { x: number; y: number; z: number },
  obsEci: { x: number; y: number; z: number },
): number {
  // Vector from observer to satellite
  const toSatX = satEci.x - obsEci.x;
  const toSatY = satEci.y - obsEci.y;
  const toSatZ = satEci.z - obsEci.z;
  const toSatLen = Math.sqrt(toSatX * toSatX + toSatY * toSatY + toSatZ * toSatZ);
  if (toSatLen === 0) return 0;

  // cos(elongation) = dot(obsToSat_unit, sunDir_unit)
  const dot = (toSatX / toSatLen) * sunDir.x
            + (toSatY / toSatLen) * sunDir.y
            + (toSatZ / toSatLen) * sunDir.z;
  return Math.acos(Math.max(-1, Math.min(1, dot))) * RAD2DEG;
}

export function sunLabel(alt: number): string {
  if (alt > 0) return 'Daylight';
  if (alt > -6) return 'Civil twilight';
  if (alt > -12) return 'Nautical twilight';
  if (alt > -18) return 'Astronomical twilight';
  return 'Night';
}
