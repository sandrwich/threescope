/**
 * Satellite eclipse (Earth shadow) detection.
 * Uses a cylindrical shadow model — accurate enough for LEO/MEO pass prediction.
 * No Three.js dependency so it can run in the pass Web Worker.
 */
import { DEG2RAD, RAD2DEG, EARTH_RADIUS_KM, MOON_RADIUS_KM } from '../constants';
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

// Sun angular radius as seen from Earth (radians)
const SUN_DISTANCE_KM = 149597870.7;
const SUN_RADIUS_KM = 696000;
// Half-angles of umbra and penumbra cones
const UMBRA_HALF = Math.asin((SUN_RADIUS_KM - EARTH_RADIUS_KM) / SUN_DISTANCE_KM);
const PENUMBRA_HALF = Math.asin((SUN_RADIUS_KM + EARTH_RADIUS_KM) / SUN_DISTANCE_KM);

/**
 * Compute Earth shadow factor for a satellite at ECI position (km).
 * Returns 1.0 = fully sunlit, 0.0 = fully in umbra, intermediate = penumbra.
 *
 * Conical model: umbra narrows, penumbra widens with distance from Earth.
 * At distance d along the anti-sun axis:
 *   umbra radius   = R_earth - d * tan(umbraHalf)
 *   penumbra radius = R_earth + d * tan(penumbraHalf)
 */
export function earthShadowFactor(
  satX: number, satY: number, satZ: number,
  sunDir: { x: number; y: number; z: number },
): number {
  // Project satellite position onto the Sun direction vector.
  const dot = satX * sunDir.x + satY * sunDir.y + satZ * sunDir.z;
  if (dot > 0) return 1.0; // sunward side — always lit

  // Distance along shadow axis (positive into shadow)
  const d = -dot;

  // Perpendicular distance from the Earth–Sun axis
  const projX = satX - dot * sunDir.x;
  const projY = satY - dot * sunDir.y;
  const projZ = satZ - dot * sunDir.z;
  const perpDist = Math.sqrt(projX * projX + projY * projY + projZ * projZ);

  // Conical shadow radii at this distance
  const umbraR = EARTH_RADIUS_KM - d * Math.tan(UMBRA_HALF);
  const penumbraR = EARTH_RADIUS_KM + d * Math.tan(PENUMBRA_HALF);

  if (umbraR > 0 && perpDist < umbraR) return 0.0; // fully in umbra
  if (perpDist >= penumbraR) return 1.0; // fully sunlit

  // Penumbra: smooth gradient between umbra edge and penumbra edge
  const innerR = Math.max(umbraR, 0);
  return (perpDist - innerR) / (penumbraR - innerR);
}

/**
 * Boolean eclipse check (backward-compatible wrapper).
 * Returns true if satellite is in umbra OR penumbra (any shadow).
 */
export function isEclipsed(
  satX: number, satY: number, satZ: number,
  sunDir: { x: number; y: number; z: number },
): boolean {
  return earthShadowFactor(satX, satY, satZ, sunDir) < 1.0;
}

const SUN_ANG_RADIUS = 0.00465; // radians (~0.267°)

/**
 * Check if a point in space is in the Moon's shadow (solar eclipse).
 * Returns true if the Moon partially or totally blocks the Sun as seen from the point.
 * All positions must be in the same coordinate system (ECI or render-space).
 */
export function isSolarEclipsed(
  px: number, py: number, pz: number,
  moonPos: { x: number; y: number; z: number },
  sunDir: { x: number; y: number; z: number },
): boolean {
  const toMoonX = moonPos.x - px, toMoonY = moonPos.y - py, toMoonZ = moonPos.z - pz;
  const moonDist = Math.sqrt(toMoonX * toMoonX + toMoonY * toMoonY + toMoonZ * toMoonZ);
  if (moonDist === 0) return false;
  const dot = (toMoonX / moonDist) * sunDir.x + (toMoonY / moonDist) * sunDir.y + (toMoonZ / moonDist) * sunDir.z;
  const sep = Math.acos(Math.max(-1, Math.min(1, dot)));
  const moonAngR = Math.atan(MOON_RADIUS_KM / moonDist);
  return sep < moonAngR + SUN_ANG_RADIUS;
}

/**
 * Quick check: is a solar eclipse geometrically possible anywhere near Earth?
 * Use as an early exit to skip per-vertex isSolarEclipsed calls.
 */
export function solarEclipsePossible(
  moonPos: { x: number; y: number; z: number },
  sunDir: { x: number; y: number; z: number },
): boolean {
  const dist = Math.sqrt(moonPos.x * moonPos.x + moonPos.y * moonPos.y + moonPos.z * moonPos.z);
  if (dist === 0) return false;
  const dot = (moonPos.x / dist) * sunDir.x + (moonPos.y / dist) * sunDir.y + (moonPos.z / dist) * sunDir.z;
  const sep = Math.acos(Math.max(-1, Math.min(1, dot)));
  // Moon angular radius from Earth center + Sun angular radius + parallax margin (~0.02 rad)
  return sep < Math.atan(MOON_RADIUS_KM / dist) + SUN_ANG_RADIUS + 0.02;
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
