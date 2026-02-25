import * as satellite from 'satellite.js';
import * as THREE from 'three';
import type { Satellite } from '../types';
import { normalizeEpoch, epochToUnix } from './epoch';
import { J2, EARTH_RADIUS_EQ_KM } from '../constants';
import stdmagData from '../data/stdmag.json';

/**
 * Compute J2 secular perturbation rates for RAAN and argument of perigee.
 *
 * dΩ/dt = -1.5 · n · J2 · (Re/p)² · cos(i)
 * dω/dt =  1.5 · n · J2 · (Re/p)² · (2 - 2.5·sin²(i))
 */
function computeJ2Rates(
  n: number, a: number, e: number, inc: number
): { raanRate: number; argPerigeeRate: number } {
  const p = a * (1 - e * e);
  const ReOverP = EARTH_RADIUS_EQ_KM / p;
  const factor = 1.5 * n * J2 * ReOverP * ReOverP;
  const cosI = Math.cos(inc);
  const sinI = Math.sin(inc);
  return {
    raanRate: -factor * cosI,
    argPerigeeRate: factor * (2.0 - 2.5 * sinI * sinI),
  };
}

// Pre-index stdmag data for fast numeric lookup
const stdmagLookup = stdmagData as Record<string, number>;

export function parseTLE(name: string, line1: string, line2: string): Satellite | null {
  try {
    const satrec = satellite.twoline2satrec(line1, line2);

    // Extract NORAD catalog number from TLE line 1 (columns 3-7, 1-indexed)
    const noradId = parseInt(line1.substring(2, 7).trim(), 10);

    // Extract orbital elements from TLE lines
    const epochDays = parseFloat(line1.substring(18, 32));
    const inclination = parseFloat(line2.substring(8, 16)) * (Math.PI / 180);
    const raan = parseFloat(line2.substring(17, 25)) * (Math.PI / 180);
    const eccentricity = parseFloat('0.' + line2.substring(26, 33).trim());
    const argPerigee = parseFloat(line2.substring(34, 42)) * (Math.PI / 180);
    const meanAnomaly = parseFloat(line2.substring(43, 51)) * (Math.PI / 180);
    const revsPerDay = parseFloat(line2.substring(52, 63));
    const meanMotion = (revsPerDay * 2.0 * Math.PI) / 86400.0; // rad/s
    const MU = 398600.4418;
    const semiMajorAxis = Math.pow(MU / (meanMotion * meanMotion), 1.0 / 3.0);

    // Parse ndot (first derivative of mean motion / 2) from TLE line 1 cols 33-43
    // Format: " .NNNNNNNN" in rev/day², multiply by 2 to get full ndot
    // Convert to rad/s²: rev/day² → rad/s² = * 2π / 86400²
    const ndotHalf = parseFloat(line1.substring(33, 43).trim());
    const ndot = 2.0 * ndotHalf * (2.0 * Math.PI) / (86400.0 * 86400.0);

    // Compute J2 secular rates
    const { raanRate, argPerigeeRate } = computeJ2Rates(
      meanMotion, semiMajorAxis, eccentricity, inclination
    );

    return {
      noradId: isNaN(noradId) ? 0 : noradId,
      name: name.trim(),
      epochDays,
      inclination,
      raan,
      eccentricity,
      argPerigee,
      meanAnomaly,
      meanMotion,
      semiMajorAxis,
      currentPos: new THREE.Vector3(),
      satrec,
      tleLine1: line1,
      tleLine2: line2,
      raanRate,
      argPerigeeRate,
      ndot,
      stdMag: !isNaN(noradId) && String(noradId) in stdmagLookup
        ? stdmagLookup[String(noradId)]
        : null,
    };
  } catch {
    return null;
  }
}

/**
 * Return J2-corrected RAAN and argument of perigee at the given epoch.
 * Uses precomputed secular rates on the Satellite object.
 */
export function getCorrectedElements(sat: Satellite, currentEpoch: number): { raan: number; argPerigee: number } {
  const deltaS = epochToUnix(currentEpoch) - epochToUnix(sat.epochDays);
  return {
    raan: sat.raan + sat.raanRate * deltaS,
    argPerigee: sat.argPerigee + sat.argPerigeeRate * deltaS,
  };
}

export function calculatePosition(sat: Satellite, currentEpoch: number): THREE.Vector3 {
  currentEpoch = normalizeEpoch(currentEpoch);

  // Convert epoch to Date for satellite.js
  const yy = Math.floor(currentEpoch / 1000.0);
  const day = currentEpoch % 1000.0;
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  const jan1 = Date.UTC(year, 0, 1);
  const dateMs = jan1 + (day - 1.0) * 86400000;
  const date = new Date(dateMs);

  const result = satellite.propagate(sat.satrec, date);

  if (!result.position || typeof result.position === 'boolean') {
    return new THREE.Vector3(0, 0, 0);
  }

  const eci = result.position as satellite.EciVec3<number>;

  // ECI to render coords: x=eci.x, y=eci.z, z=-eci.y
  return new THREE.Vector3(eci.x, eci.z, -eci.y);
}
