/**
 * Solar ephemeris — Meeus, "Astronomical Algorithms" Ch. 25.
 * Computes apparent ecliptic longitude, apparent obliquity, and distance.
 * Accurate to ~0.01°.
 * No THREE.js dependency — safe for Web Workers.
 */
import { DEG2RAD } from '../constants';
import { epochToJulianDateTT, normalizeEpoch } from './epoch';

export interface SunEcliptic {
  /** Apparent ecliptic longitude (radians), includes nutation + aberration */
  lambdaApp: number;
  /** Apparent obliquity of the ecliptic (radians), includes nutation */
  epsilonApp: number;
  /** Distance from Earth (AU) */
  rAU: number;
}

export function computeSunEcliptic(epoch: number): SunEcliptic {
  epoch = normalizeEpoch(epoch);
  const jd = epochToJulianDateTT(epoch);
  const T = (jd - 2451545.0) / 36525.0; // Julian centuries from J2000.0
  const T2 = T * T;
  const T3 = T2 * T;

  // Geometric mean longitude of the Sun (degrees) — Meeus eq. 25.2
  let L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T2;
  L0 = ((L0 % 360) + 360) % 360;

  // Mean anomaly of the Sun (degrees) — Meeus eq. 25.3
  let M = 357.52911 + 35999.05029 * T - 0.0001537 * T2;
  M = ((M % 360) + 360) % 360;
  const Mrad = M * DEG2RAD;

  // Eccentricity of Earth's orbit — Meeus eq. 25.4
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T2;

  // Sun's equation of center (degrees) — Meeus p. 164
  const C = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(Mrad)
          + (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad)
          + 0.000289 * Math.sin(3 * Mrad);

  // Sun's true longitude and true anomaly (degrees)
  const theta = L0 + C;
  const nu = M + C;
  const nuRad = nu * DEG2RAD;

  // Sun's radius vector in AU — Meeus eq. 25.5
  const rAU = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(nuRad));

  // Longitude of the ascending node of the Moon's mean orbit (degrees)
  // Used for nutation correction — Meeus eq. 25.8 (low-precision nutation)
  const omega = 125.04 - 1934.136 * T;
  const omegaRad = omega * DEG2RAD;

  // Apparent longitude (degrees) — corrected for nutation and aberration
  // Meeus eq. 25.8: -0.00569° for aberration, -0.00478°·sin(Ω) for nutation
  const lambdaApp = (theta - 0.00569 - 0.00478 * Math.sin(omegaRad)) * DEG2RAD;

  // Mean obliquity of the ecliptic — Meeus eq. 22.2 (in degrees)
  // 23°26'21.448" = 23.4392911°
  const eps0 = 23.4392911 - (46.8150 / 3600) * T - (0.00059 / 3600) * T2 + (0.001813 / 3600) * T3;

  // Apparent obliquity (corrected for nutation) — Meeus eq. 25.8
  const epsilonApp = (eps0 + 0.00256 * Math.cos(omegaRad)) * DEG2RAD;

  return { lambdaApp, epsilonApp, rAU };
}

/**
 * Compute unit sun direction in **standard ECI** (Earth-Centered Inertial) coordinates.
 * NOT render coords — use calculateSunPosition() from sun.ts for render coords.
 * No THREE.js dependency — safe for Web Workers.
 */
export function sunDirectionECI(epoch: number): { x: number; y: number; z: number } {
  const { lambdaApp, epsilonApp } = computeSunEcliptic(epoch);

  // Ecliptic to equatorial (ECI). Sun's ecliptic latitude β ≈ 0.
  const cosLam = Math.cos(lambdaApp);
  const sinLam = Math.sin(lambdaApp);
  const cosEps = Math.cos(epsilonApp);
  const sinEps = Math.sin(epsilonApp);

  const x = cosLam;
  const y = sinLam * cosEps;
  const z = sinLam * sinEps;

  const len = Math.sqrt(x * x + y * y + z * z);
  return { x: x / len, y: y / len, z: z / len };
}
