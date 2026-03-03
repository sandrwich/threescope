import * as satellite from 'satellite.js';
import * as THREE from 'three';
import type { Satellite } from '../types';
import { normalizeEpoch, epochToUnix } from './epoch';
import { J2, EARTH_RADIUS_EQ_KM, MU } from '../constants';
import { getStdmag } from '../data/catalog';

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

const TWO_PI = 2.0 * Math.PI;
const NDOT_CONV = TWO_PI / (86400.0 * 86400.0); // rev/day² → rad/s²

/** Build a Satellite from an initialized satrec. */
function satrecToSatellite(
  satrec: satellite.SatRec, name: string,
  extra?: { tleLine1?: string; tleLine2?: string; omm?: Record<string, unknown> },
): Satellite | null {
  try {
    const sr = satrec as any;
    const noradId = Number(sr.satnum);
    const epochDays = sr.epochyr * 1000 + sr.epochdays;
    const inclination: number = sr.inclo;       // rad
    const raan: number = sr.nodeo;              // rad
    const eccentricity: number = sr.ecco;
    const argPerigee: number = sr.argpo;        // rad
    const meanAnomaly: number = sr.mo;          // rad
    const meanMotion = sr.no / 60;              // rad/min → rad/s
    const semiMajorAxis = sr.a * EARTH_RADIUS_EQ_KM; // earth radii → km

    // ndot: satrec stores raw TLE value (rev/day²/2), convert to rad/s²
    const ndot = 2.0 * sr.ndot * NDOT_CONV;

    const { raanRate, argPerigeeRate } = computeJ2Rates(
      meanMotion, semiMajorAxis, eccentricity, inclination
    );

    return {
      noradId,
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
      tleLine1: extra?.tleLine1,
      tleLine2: extra?.tleLine2,
      omm: extra?.omm,
      raanRate,
      argPerigeeRate,
      ndot,
      stdMag: getStdmag(noradId),
      visualMag: null,
      decayed: false,
    };
  } catch {
    return null;
  }
}

export function parseTLE(name: string, line1: string, line2: string): Satellite | null {
  try {
    const satrec = satellite.twoline2satrec(line1, line2);
    return satrecToSatellite(satrec, name, { tleLine1: line1, tleLine2: line2 });
  } catch {
    return null;
  }
}

/** Parse an OMM JSON record directly via satellite.js json2satrec. */
export function parseOMM(omm: Record<string, unknown>): Satellite | null {
  try {
    const satrec = satellite.json2satrec(omm as any);
    const name = (omm.OBJECT_NAME as string) || String(omm.NORAD_CAT_ID);
    return satrecToSatellite(satrec, name, { omm });
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

export function calculatePosition(sat: Satellite, currentEpoch: number, target?: THREE.Vector3): THREE.Vector3 {
  currentEpoch = normalizeEpoch(currentEpoch);
  const out = target ?? new THREE.Vector3();

  // Convert epoch to Date for satellite.js
  const yy = Math.floor(currentEpoch / 1000.0);
  const day = currentEpoch % 1000.0;
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  const jan1 = Date.UTC(year, 0, 1);
  const dateMs = jan1 + (day - 1.0) * 86400000;
  const date = new Date(dateMs);

  const result = satellite.propagate(sat.satrec, date);

  if (!result) {
    return out.set(0, 0, 0);
  }

  const eci = result.position;

  // ECI to render coords: x=eci.x, y=eci.z, z=-eci.y
  return out.set(eci.x, eci.z, -eci.y);
}
