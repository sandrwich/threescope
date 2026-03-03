/**
 * Web Worker for parallel satellite data parsing.
 * Supports both TLE text (twoline2satrec) and OMM JSON (json2satrec).
 */
import { twoline2satrec, json2satrec } from 'satellite.js';
import { J2, EARTH_RADIUS_EQ_KM } from '../constants';

const TWO_PI = 2.0 * Math.PI;
const NDOT_CONV = TWO_PI / (86400.0 * 86400.0);

function computeJ2Rates(n: number, a: number, e: number, inc: number) {
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

function satrecToResult(satrec: any, name: string, extra?: { tleLine1?: string; tleLine2?: string; omm?: Record<string, unknown> }) {
  const sr = satrec as any;
  const noradId = Number(sr.satnum);
  const meanMotion = sr.no / 60;
  const semiMajorAxis = sr.a * EARTH_RADIUS_EQ_KM;
  const inclination: number = sr.inclo;
  const eccentricity: number = sr.ecco;
  const { raanRate, argPerigeeRate } = computeJ2Rates(
    meanMotion, semiMajorAxis, eccentricity, inclination
  );

  return {
    noradId,
    name: name.trim(),
    epochDays: sr.epochyr * 1000 + sr.epochdays,
    inclination,
    raan: sr.nodeo,
    eccentricity,
    argPerigee: sr.argpo,
    meanAnomaly: sr.mo,
    meanMotion,
    semiMajorAxis,
    satrec,
    tleLine1: extra?.tleLine1,
    tleLine2: extra?.tleLine2,
    omm: extra?.omm,
    raanRate,
    argPerigeeRate,
    ndot: 2.0 * sr.ndot * NDOT_CONV,
    stdMag: null,
    visualMag: null,
    decayed: false,
  };
}

// Signal that module compilation is complete and worker is ready
postMessage({ ready: true });

interface WorkerMessage {
  id: number;
  entries?: [string, string, string][];
  ommRecords?: Record<string, unknown>[];
}

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { entries, ommRecords, id } = e.data;
  const results: any[] = [];

  if (ommRecords) {
    for (const omm of ommRecords) {
      try {
        const satrec = json2satrec(omm as any);
        const name = (omm.OBJECT_NAME as string) || String(omm.NORAD_CAT_ID);
        results.push(satrecToResult(satrec, name, { omm }));
      } catch {
        // Skip invalid OMM records
      }
    }
  } else if (entries) {
    for (const [name, line1, line2] of entries) {
      try {
        const satrec = twoline2satrec(line1, line2);
        results.push(satrecToResult(satrec, name, { tleLine1: line1, tleLine2: line2 }));
      } catch {
        // Skip invalid TLE entries
      }
    }
  }

  postMessage({ results, id });
};
