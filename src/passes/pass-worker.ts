/**
 * Web Worker for satellite pass prediction.
 * Runs SGP4 propagation and az/el computation off the main thread.
 */
import { twoline2satrec, propagate } from 'satellite.js';
import { normalizeEpoch, epochToUnix, epochToGmst } from '../astro/epoch';
import { getAzEl } from '../astro/az-el';
import type { PassRequest, PassResponse, SatellitePass, PassSkyPoint, PassProgress } from './pass-types';

const DEG2RAD = Math.PI / 180;

/**
 * Propagate satellite to a given TLE epoch and return standard ECI position (km).
 * Returns null on propagation error.
 */
function propagateAtEpoch(satrec: ReturnType<typeof twoline2satrec>, epoch: number): { x: number; y: number; z: number } | null {
  const unix = epochToUnix(epoch);
  const date = new Date(unix * 1000);
  const result = propagate(satrec, date);
  if (!result.position || typeof result.position === 'boolean') return null;
  const p = result.position as { x: number; y: number; z: number };
  // satellite.js returns standard ECI (x, y, z) in km — no coord swap needed
  return p;
}

/**
 * Binary search to refine the horizon crossing time.
 * 12 iterations gives ~0.06 second precision on a 1-minute bracket.
 */
function refineCrossing(
  satrec: ReturnType<typeof twoline2satrec>,
  tLow: number, tHigh: number,
  obsLat: number, obsLon: number, obsAlt: number,
  findRising: boolean,
): number {
  for (let i = 0; i < 12; i++) {
    const tMid = (tLow + tHigh) / 2;
    const pos = propagateAtEpoch(satrec, tMid);
    if (!pos) break;
    const gmst = epochToGmst(tMid) * DEG2RAD;
    const { el } = getAzEl(pos.x, pos.y, pos.z, gmst, obsLat, obsLon, obsAlt);
    if (findRising) {
      if (el >= 0) tHigh = tMid; else tLow = tMid;
    } else {
      if (el < 0) tHigh = tMid; else tLow = tMid;
    }
  }
  return findRising ? tHigh : tLow;
}

function computePassesForSat(
  name: string, line1: string, line2: string, colorIndex: number,
  obsLat: number, obsLon: number, obsAlt: number,
  startEpoch: number, durationDays: number, minEl: number,
): SatellitePass[] {
  const satrec = twoline2satrec(line1, line2);
  const passes: SatellitePass[] = [];
  const minuteStep = 1.0 / 1440.0; // 1 minute in epoch days
  const totalSteps = Math.round(durationDays * 1440);

  let t = startEpoch;

  // If currently in a pass, back up to find the true AOS
  {
    const pos = propagateAtEpoch(satrec, t);
    if (pos) {
      const gmst = epochToGmst(t) * DEG2RAD;
      let { el } = getAzEl(pos.x, pos.y, pos.z, gmst, obsLat, obsLon, obsAlt);
      if (el > 0) {
        for (let i = 0; i < 30 && el > 0; i++) {
          t -= minuteStep;
          const p2 = propagateAtEpoch(satrec, t);
          if (!p2) break;
          const g2 = epochToGmst(t) * DEG2RAD;
          ({ el } = getAzEl(p2.x, p2.y, p2.z, g2, obsLat, obsLon, obsAlt));
        }
      }
    }
  }

  let inPass = false;
  let currentMaxEl = -90;
  let currentMaxElEpoch = t;
  let currentAosEpoch = 0;
  let currentAosAz = 0;

  for (let i = 0; i < totalSteps; i++) {
    const pos = propagateAtEpoch(satrec, t);
    if (!pos) { t += minuteStep; continue; }

    const gmstRad = epochToGmst(t) * DEG2RAD;
    const { az, el } = getAzEl(pos.x, pos.y, pos.z, gmstRad, obsLat, obsLon, obsAlt);

    if (el >= 0) {
      if (!inPass) {
        inPass = true;
        const aosEpoch = refineCrossing(satrec, t - minuteStep, t, obsLat, obsLon, obsAlt, true);
        currentAosEpoch = aosEpoch;
        currentMaxEl = el;
        currentMaxElEpoch = t;
        currentAosAz = az;
      }
      if (el > currentMaxEl) {
        currentMaxEl = el;
        currentMaxElEpoch = t;
      }
    } else {
      if (inPass) {
        inPass = false;
        const losEpoch = refineCrossing(satrec, t - minuteStep, t, obsLat, obsLon, obsAlt, false);

        if (currentMaxEl >= minEl) {
          // Build sky path (100 points)
          const skyPath: PassSkyPoint[] = [];
          const step = (losEpoch - currentAosEpoch) / 99;
          if (step > 0) {
            for (let k = 0; k < 100; k++) {
              const pt = currentAosEpoch + k * step;
              const pp = propagateAtEpoch(satrec, pt);
              if (!pp) continue;
              const pg = epochToGmst(pt) * DEG2RAD;
              const pae = getAzEl(pp.x, pp.y, pp.z, pg, obsLat, obsLon, obsAlt);
              skyPath.push({ az: pae.az, el: pae.el, t: pt });
            }
          }

          // Get LOS azimuth
          const losPos = propagateAtEpoch(satrec, losEpoch);
          let losAz = az;
          if (losPos) {
            const losGmst = epochToGmst(losEpoch) * DEG2RAD;
            losAz = getAzEl(losPos.x, losPos.y, losPos.z, losGmst, obsLat, obsLon, obsAlt).az;
          }

          passes.push({
            satName: name,
            satColorIndex: colorIndex,
            aosEpoch: currentAosEpoch,
            losEpoch,
            maxElEpoch: currentMaxElEpoch,
            maxEl: currentMaxEl,
            aosAz: currentAosAz,
            losAz,
            durationSec: (losEpoch - currentAosEpoch) * 86400,
            skyPath,
          });
        }
      }
    }
    t += minuteStep;
  }
  return passes;
}

// Worker message handler
self.onmessage = (e: MessageEvent<PassRequest>) => {
  const req = e.data;
  if (req.type !== 'compute') return;

  const allPasses: SatellitePass[] = [];

  for (let i = 0; i < req.satellites.length; i++) {
    const sat = req.satellites[i];
    const passes = computePassesForSat(
      sat.name, sat.line1, sat.line2, sat.colorIndex,
      req.observerLat, req.observerLon, req.observerAlt,
      req.startEpoch, req.durationDays, req.minElevation,
    );
    allPasses.push(...passes);

    self.postMessage({
      type: 'progress',
      percent: ((i + 1) / req.satellites.length) * 100,
    } as PassProgress);
  }

  // Sort all passes by AOS time
  allPasses.sort((a, b) => a.aosEpoch - b.aosEpoch);

  self.postMessage({ type: 'result', passes: allPasses } as PassResponse);
};
