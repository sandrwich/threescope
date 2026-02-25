/**
 * Web Worker for satellite pass prediction.
 * Runs SGP4 propagation and az/el computation off the main thread.
 */
import { twoline2satrec, propagate } from 'satellite.js';
import { normalizeEpoch, epochToUnix, epochToGmst } from '../astro/epoch';
import { getAzEl } from '../astro/az-el';
import { sunDirectionECI, isEclipsed, sunAltitude, solarElongation } from '../astro/eclipse';
import { computePhaseAngle, observerEci, slantRange, estimateVisualMagnitude } from '../astro/magnitude';
import type { PassRequest, PassResponse, PassPartial, SatellitePass, PassProgress } from './pass-types';

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

interface PassFilters {
  maxElevation: number;
  visibility: 'all' | 'observable' | 'visible';
  azFrom: number;
  azTo: number;
  horizonMask: { az: number; minEl: number }[];
  minDuration: number;
}

function interpolateHorizonMask(az: number, mask: { az: number; minEl: number }[]): number {
  if (mask.length === 0) return 0;
  const n = mask.length;
  let a = ((az % 360) + 360) % 360;
  for (let i = 0; i < n; i++) {
    const cur = mask[i];
    const nxt = mask[(i + 1) % n];
    const az0 = cur.az;
    let az1 = nxt.az;
    if (az1 <= az0) az1 += 360;
    let testAz = a;
    if (testAz < az0) testAz += 360;
    if (testAz >= az0 && testAz <= az1) {
      const frac = (az1 === az0) ? 0 : (testAz - az0) / (az1 - az0);
      return cur.minEl + frac * (nxt.minEl - cur.minEl);
    }
  }
  return 0;
}

function computePassesForSat(
  name: string, line1: string, line2: string, colorIndex: number,
  stdMag: number | null,
  obsLat: number, obsLon: number, obsAlt: number,
  startEpoch: number, durationDays: number, minEl: number,
  stepMinutes: number = 1,
  filters?: PassFilters,
): SatellitePass[] {
  const satrec = twoline2satrec(line1, line2);
  const passes: SatellitePass[] = [];
  const minuteStep = stepMinutes / 1440.0;
  const totalSteps = Math.round(durationDays * 1440 / stepMinutes);

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
  let currentMaxElAz = 0;
  let currentAosEpoch = 0;
  let currentAosAz = 0;
  let currentSkyPath: { az: number; el: number; t: number }[] = [];

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
        currentMaxElAz = az;
        currentAosAz = az;
        currentSkyPath = [{ az, el, t }];
      } else {
        currentSkyPath.push({ az, el, t });
      }
      if (el > currentMaxEl) {
        currentMaxEl = el;
        currentMaxElEpoch = t;
        currentMaxElAz = az;
      }
    } else {
      if (inPass) {
        inPass = false;
        const losEpoch = refineCrossing(satrec, t - minuteStep, t, obsLat, obsLon, obsAlt, false);

        if (currentMaxEl >= minEl) {
          // Re-sample sky path at ~10s intervals for accurate filtering
          {
            const subStep = 10 / 86400; // 10 seconds in days
            // Sun direction barely moves during a pass — compute once at midpoint
            const midEpoch = (currentAosEpoch + losEpoch) / 2;
            const passSunDir = sunDirectionECI(midEpoch);
            const refined: { az: number; el: number; t: number; eclipsed?: boolean }[] = [];
            for (let st = currentAosEpoch; st <= losEpoch; st += subStep) {
              const sp = propagateAtEpoch(satrec, st);
              if (sp) {
                const sg = epochToGmst(st) * DEG2RAD;
                const sae = getAzEl(sp.x, sp.y, sp.z, sg, obsLat, obsLon, obsAlt);
                refined.push({ az: sae.az, el: sae.el, t: st, eclipsed: isEclipsed(sp.x, sp.y, sp.z, passSunDir) });
              }
            }
            // Add exact LOS point
            const lp = propagateAtEpoch(satrec, losEpoch);
            if (lp) {
              const lg = epochToGmst(losEpoch) * DEG2RAD;
              const lae = getAzEl(lp.x, lp.y, lp.z, lg, obsLat, obsLon, obsAlt);
              refined.push({ az: lae.az, el: lae.el, t: losEpoch, eclipsed: isEclipsed(lp.x, lp.y, lp.z, passSunDir) });
            }
            currentSkyPath = refined;
          }
          // Max elevation filter (discard low-peak passes early, before expensive sun calcs)
          if (filters && filters.maxElevation < 90 && currentMaxEl < filters.maxElevation) {
            // pass doesn't reach the required peak — skip
          } else {

          // Azimuth/horizon spatial filter: does any skyPath point fall in the observable window?
          let spatialOk = true;
          if (filters) {
            const hasAz = !(filters.azFrom === 0 && filters.azTo === 360);
            const hasMask = filters.horizonMask.length > 0;
            if (hasAz || hasMask) {
              spatialOk = false;
              for (const p of currentSkyPath) {
                if (p.el < minEl) continue;
                if (hasMask && p.el < interpolateHorizonMask(p.az, filters.horizonMask)) continue;
                if (hasAz) {
                  const inAz = filters.azFrom <= filters.azTo
                    ? p.az >= filters.azFrom && p.az <= filters.azTo
                    : p.az >= filters.azFrom || p.az <= filters.azTo;
                  if (!inAz) continue;
                }
                spatialOk = true;
                break;
              }
            }
          }

          if (spatialOk) {

          // Get LOS azimuth
          const losPos = propagateAtEpoch(satrec, losEpoch);
          let losAz = az;
          if (losPos) {
            const losGmst = epochToGmst(losEpoch) * DEG2RAD;
            losAz = getAzEl(losPos.x, losPos.y, losPos.z, losGmst, obsLat, obsLon, obsAlt).az;
          }

          // Eclipse check, sun context, and magnitude estimation at max elevation
          let eclipsed = false;
          let peakMag: number | null = null;
          let sunAlt = 0;
          let elongation = 180;
          const maxElPos = propagateAtEpoch(satrec, currentMaxElEpoch);
          if (maxElPos) {
            const sunDir = sunDirectionECI(currentMaxElEpoch);
            const gmstMaxEl = epochToGmst(currentMaxElEpoch) * DEG2RAD;
            const obsPos = observerEci(obsLat, obsLon, obsAlt, gmstMaxEl);

            sunAlt = sunAltitude(currentMaxElEpoch, obsLat, obsLon, obsAlt, gmstMaxEl);
            eclipsed = isEclipsed(maxElPos.x, maxElPos.y, maxElPos.z, sunDir);
            elongation = solarElongation(maxElPos, sunDir, obsPos);

            if (!eclipsed && stdMag !== null) {
              const range = slantRange(maxElPos, obsPos);
              const phase = computePhaseAngle(maxElPos, sunDir, obsPos);
              peakMag = estimateVisualMagnitude(stdMag, range, phase, currentMaxEl);
            }
          }

          // Visibility filter (after sun/eclipse are computed)
          let visOk = true;
          if (filters && filters.visibility !== 'all') {
            const observable = sunAlt < -6 && !eclipsed;
            if (filters.visibility === 'observable') visOk = observable;
            else visOk = observable && peakMag !== null && peakMag <= 5;
          }

          // Duration filter
          let durOk = true;
          if (filters && filters.minDuration > 0) {
            // Count time within spatial constraints
            let inViewSec = 0;
            const hasAz = !(filters.azFrom === 0 && filters.azTo === 360);
            const hasMask = filters.horizonMask.length > 0;
            for (let si = 0; si < currentSkyPath.length - 1; si++) {
              const p = currentSkyPath[si];
              const pNext = currentSkyPath[si + 1];
              if (p.el < minEl) continue;
              if (hasMask && p.el < interpolateHorizonMask(p.az, filters.horizonMask)) continue;
              if (hasAz) {
                const inAz = filters.azFrom <= filters.azTo
                  ? p.az >= filters.azFrom && p.az <= filters.azTo
                  : p.az >= filters.azFrom || p.az <= filters.azTo;
                if (!inAz) continue;
              }
              inViewSec += (pNext.t - p.t) * 86400;
            }
            durOk = inViewSec >= filters.minDuration;
          }

          if (visOk && durOk) {
          passes.push({
            satName: name,
            satColorIndex: colorIndex,
            aosEpoch: currentAosEpoch,
            losEpoch,
            maxElEpoch: currentMaxElEpoch,
            maxEl: currentMaxEl,
            aosAz: currentAosAz,
            losAz,
            maxElAz: currentMaxElAz,
            durationSec: (losEpoch - currentAosEpoch) * 86400,
            skyPath: currentSkyPath,
            eclipsed,
            peakMag,
            sunAlt,
            elongation,
          });
          }

          } // spatialOk
          } // maxElevation
        }
      }
    }
    t += minuteStep;
  }
  return passes;
}

// Send partial results on a time interval, not per-satellite count
const PARTIAL_MS = 500;

// Worker message handler
self.onmessage = (e: MessageEvent<PassRequest>) => {
  const req = e.data;
  if (req.type !== 'compute') return;

  const step = req.stepMinutes ?? 1;
  const filters: PassFilters = {
    maxElevation: req.maxElevation ?? 90,
    visibility: req.visibility ?? 'all',
    azFrom: req.azFrom ?? 0,
    azTo: req.azTo ?? 360,
    horizonMask: req.horizonMask ?? [],
    minDuration: req.minDuration ?? 0,
  };
  const hasFilters = filters.maxElevation < 90 || filters.visibility !== 'all' ||
    filters.azFrom !== 0 || filters.azTo !== 360 ||
    filters.horizonMask.length > 0 || filters.minDuration > 0;
  const allPasses: SatellitePass[] = [];
  let lastPartialLen = 0;
  let lastFlush = performance.now();

  for (let i = 0; i < req.satellites.length; i++) {
    const sat = req.satellites[i];
    const passes = computePassesForSat(
      sat.name, sat.line1, sat.line2, sat.colorIndex,
      sat.stdMag,
      req.observerLat, req.observerLon, req.observerAlt,
      req.startEpoch, req.durationDays, req.minElevation,
      step,
      hasFilters ? filters : undefined,
    );
    allPasses.push(...passes);

    // Flush progress + partials on a time interval
    const now = performance.now();
    if (now - lastFlush >= PARTIAL_MS || i === req.satellites.length - 1) {
      lastFlush = now;
      self.postMessage({
        type: 'progress',
        percent: ((i + 1) / req.satellites.length) * 100,
      } as PassProgress);

      if (allPasses.length > lastPartialLen) {
        self.postMessage({ type: 'partial', passes: allPasses.slice(lastPartialLen) } as PassPartial);
        lastPartialLen = allPasses.length;
      }
    }
  }

  // Sort all passes by AOS time
  allPasses.sort((a, b) => a.aosEpoch - b.aosEpoch);

  self.postMessage({ type: 'result', passes: allPasses } as PassResponse);
};
