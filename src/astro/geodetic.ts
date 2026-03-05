/**
 * WGS-84 geodetic coordinate conversions.
 * Pure math — no THREE.js dependency. Usable in Web Workers.
 */

import { DEG2RAD, WGS84_A, WGS84_E2 } from '../constants';

/**
 * Convert geodetic coordinates to ECEF (Earth-Centered, Earth-Fixed) in km.
 * Uses the WGS-84 ellipsoid for accurate positioning.
 *
 * @param latDeg  Geodetic latitude (degrees)
 * @param lonDeg  Geodetic longitude (degrees)
 * @param altM    Altitude above ellipsoid (meters)
 */
export function geodeticToEcef(
  latDeg: number, lonDeg: number, altM: number,
): { x: number; y: number; z: number } {
  const latRad = latDeg * DEG2RAD;
  const lonRad = lonDeg * DEG2RAD;
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const altKm = altM / 1000;
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  return {
    x: (N + altKm) * cosLat * Math.cos(lonRad),
    y: (N + altKm) * cosLat * Math.sin(lonRad),
    z: (N * (1 - WGS84_E2) + altKm) * sinLat,
  };
}

/**
 * Convert geodetic coordinates to standard ECI (Earth-Centered Inertial) in km.
 * Rotates from ECEF by GMST to align with the vernal equinox frame.
 *
 * Standard ECI: x = vernal equinox, y = 90° ahead, z = north pole.
 *
 * @param latDeg   Geodetic latitude (degrees)
 * @param lonDeg   Geodetic longitude (degrees)
 * @param altM     Altitude above ellipsoid (meters)
 * @param gmstRad  Greenwich Mean Sidereal Time (radians)
 */
export function geodeticToEci(
  latDeg: number, lonDeg: number, altM: number, gmstRad: number,
): { x: number; y: number; z: number } {
  const latRad = latDeg * DEG2RAD;
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const altKm = altM / 1000;
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const theta = gmstRad + lonDeg * DEG2RAD;
  return {
    x: (N + altKm) * cosLat * Math.cos(theta),
    y: (N + altKm) * cosLat * Math.sin(theta),
    z: (N * (1 - WGS84_E2) + altKm) * sinLat,
  };
}
