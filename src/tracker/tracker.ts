/**
 * Satellite tracking engine.
 * Computes radar blips (az/el), lock tracking, and sky path for locked satellite.
 */

import type { Satellite } from '../types';
import type { SatellitePass } from '../passes/pass-types';
import type { SatRec } from 'satellite.js';
import { propagate } from 'satellite.js';
import { getAzEl, renderToEci } from '../astro/az-el';
import { epochToUnix, epochToGmst } from '../astro/epoch';
import { observerEci, slantRange } from '../astro/magnitude';
import { beamStore } from '../stores/beam.svelte';
import { uiStore } from '../stores/ui.svelte';

const DEG2RAD = Math.PI / 180;

/** Propagate a satrec to an epoch (Julian day fraction) and return standard ECI km. */
function propagateToEpoch(satrec: SatRec, epoch: number): { x: number; y: number; z: number } | null {
  const date = new Date(epochToUnix(epoch) * 1000);
  const result = propagate(satrec, date);
  if (!result.position || typeof result.position === 'boolean') return null;
  return result.position as { x: number; y: number; z: number };
}

const SKY_PATH_STEP = 10;       // seconds between sky path samples
const SKY_PATH_INTERVAL = 5000; // ms between sky path recomputes

/**
 * Compute the full above-horizon sky path for a satellite at the given epoch.
 * Walks backward to AOS, then forward to LOS.
 */
function computeSkyPath(
  satrec: SatRec, epoch: number,
  obsLat: number, obsLon: number, obsAlt: number,
): { az: number; el: number }[] {
  const stepDays = SKY_PATH_STEP / 86400;
  const maxSteps = 120; // ~20 min each direction

  const points: { az: number; el: number }[] = [];

  // Walk backward to AOS
  let t = epoch - stepDays;
  for (let i = 0; i < maxSteps; i++) {
    const pos = propagateToEpoch(satrec, t);
    if (!pos) break;
    const gmst = epochToGmst(t) * DEG2RAD;
    const { az, el } = getAzEl(pos.x, pos.y, pos.z, gmst, obsLat, obsLon, obsAlt);
    if (el < 0) break;
    points.push({ az, el });
    t -= stepDays;
  }
  points.reverse();

  // Current position
  const curPos = propagateToEpoch(satrec, epoch);
  if (curPos) {
    const gmst = epochToGmst(epoch) * DEG2RAD;
    const { az, el } = getAzEl(curPos.x, curPos.y, curPos.z, gmst, obsLat, obsLon, obsAlt);
    if (el >= 0) points.push({ az, el });
  }

  // Walk forward to LOS
  t = epoch + stepDays;
  for (let i = 0; i < maxSteps; i++) {
    const pos = propagateToEpoch(satrec, t);
    if (!pos) break;
    const gmst = epochToGmst(t) * DEG2RAD;
    const { az, el } = getAzEl(pos.x, pos.y, pos.z, gmst, obsLat, obsLon, obsAlt);
    if (el < 0) break;
    points.push({ az, el });
    t += stepDays;
  }

  return points;
}

/**
 * Find the best pass for a satellite in a list: active pass first, then next upcoming.
 * Returns the index or -1.
 */
function findPass(list: SatellitePass[], noradId: number, epoch: number): number {
  // Active pass (epoch falls within AOS-LOS)
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.satNoradId === noradId && epoch >= p.aosEpoch && epoch <= p.losEpoch) return i;
  }
  // Next upcoming pass
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.satNoradId === noradId && p.aosEpoch > epoch) return i;
  }
  return -1;
}

/**
 * Find and select the pass matching a locked satellite at the current epoch.
 * Searches both pass lists, switching tabs if needed.
 * Returns the LOS epoch of the selected pass, or 0 if none found.
 */
function autoSelectPass(noradId: number, epoch: number): number {
  // Try active tab first
  const activeList = uiStore.activePassList;
  const activeIdx = findPass(activeList, noradId, epoch);
  if (activeIdx >= 0) {
    uiStore.selectedPassIdx = activeIdx;
    uiStore.polarPlotOpen = true;
    return activeList[activeIdx].losEpoch;
  }
  // Try the other tab
  const otherTab = uiStore.passesTab === 'selected' ? 'nearby' : 'selected';
  const otherList = otherTab === 'selected' ? uiStore.passes : uiStore.nearbyPasses;
  const otherIdx = findPass(otherList, noradId, epoch);
  if (otherIdx >= 0) {
    uiStore.setPassesTab(otherTab);
    uiStore.selectedPassIdx = otherIdx;
    uiStore.polarPlotOpen = true;
    return otherList[otherIdx].losEpoch;
  }
  return 0;
}

export class Tracker {
  private _blipNextUpdate = 0;
  private _skyPathNextUpdate = 0;
  private _skyPathNoradId: number | null = null;
  private _passSelectedLos = 0; // LOS epoch of last auto-selected pass
  private _passAutoSelectNext = 0;

  /** Cached satellite lookup for lock tracking between blip scans. */
  private _lockedSat: Satellite | null = null;

  /**
   * Called each frame from App.update().
   * Lock tracking runs every frame (smooth cone); blip scan rate adapts to sim speed.
   */
  update(
    satellites: Satellite[],
    selectedSats: Set<Satellite>,
    epoch: number,
    gmstDeg: number,
    obsLat: number,
    obsLon: number,
    obsAlt: number,
    timeMultiplier = 1,
  ) {
    const now = performance.now();
    const gmstRad = gmstDeg * DEG2RAD;

    // ── Lock tracking (every frame for smooth cone) ──
    if (beamStore.locked && beamStore.lockedNoradId !== null) {
      // Resolve locked satellite reference + lock camera on first acquisition
      if (!this._lockedSat || this._lockedSat.noradId !== beamStore.lockedNoradId) {
        this._lockedSat = satellites.find(s => s.noradId === beamStore.lockedNoradId) ?? null;
        if (this._lockedSat) {
          uiStore.onLockCameraToSat?.(this._lockedSat.noradId);
          // Ensure passes are computed so polar plot can show the pass
          if (uiStore.activePassList.length === 0 && !uiStore.passesComputing) {
            uiStore.onRequestPasses?.();
          }
        }
      }

      const sat = this._lockedSat;
      if (sat && !sat.decayed) {
        const pos = sat.currentPos;
        if (pos.x !== 0 || pos.y !== 0 || pos.z !== 0) {
          const eci = renderToEci(pos.x, pos.y, pos.z);
          const { az, el } = getAzEl(eci.x, eci.y, eci.z, gmstRad, obsLat, obsLon, obsAlt);
          if (el >= 0) {
            beamStore.setAim(az, el);
            const obsEci_ = observerEci(obsLat, obsLon, obsAlt, gmstRad);
            const range = slantRange(eci, obsEci_);
            beamStore.updateTracking(az, el, range);

            // Compute/refresh sky path (throttled)
            if (now >= this._skyPathNextUpdate || this._skyPathNoradId !== sat.noradId) {
              this._skyPathNoradId = sat.noradId;
              this._skyPathNextUpdate = now + SKY_PATH_INTERVAL;
              beamStore.lockPath = computeSkyPath(sat.satrec, epoch, obsLat, obsLon, obsAlt);
            }

            // Auto-select matching pass (re-triggers when epoch moves past current pass)
            const needsReselect = epoch > this._passSelectedLos || this._passSelectedLos === 0;
            if (needsReselect && uiStore.activePassList.length > 0 && now >= this._passAutoSelectNext) {
              this._passAutoSelectNext = now + 1000;
              const los = autoSelectPass(sat.noradId, epoch);
              if (los > 0) this._passSelectedLos = los;
            }
          } else {
            beamStore.handleSatBelowHorizon();
          }
        }
      } else {
        beamStore.handleSatBelowHorizon();
      }
    } else {
      if (beamStore.lockPath.length > 0) beamStore.lockPath = [];
      this._lockedSat = null;
      this._skyPathNoradId = null;
      this._passSelectedLos = 0;
    }

    // ── Radar blips (adaptive rate: faster at high sim speeds) ──
    const absMulti = Math.abs(timeMultiplier);
    const interval = absMulti > 100 ? 16 : absMulti > 10 ? 33 : 80;
    if (now < this._blipNextUpdate) return;
    this._blipNextUpdate = now + interval;

    const blips = uiStore.radarBlips;
    let count = 0;

    for (let i = 0; i < satellites.length; i++) {
      const sat = satellites[i];
      if (sat.decayed) continue;
      const pos = sat.currentPos;
      if (pos.x === 0 && pos.y === 0 && pos.z === 0) continue;
      const eci = renderToEci(pos.x, pos.y, pos.z);
      const { az, el } = getAzEl(eci.x, eci.y, eci.z, gmstRad, obsLat, obsLon, obsAlt);
      if (el < 0) continue;
      const off = count * 4;
      blips[off] = az;
      blips[off + 1] = el;
      blips[off + 2] = i;
      blips[off + 3] = selectedSats.has(sat) ? 1 : 0;
      count++;
    }
    uiStore.radarBlipCount = count;
  }
}
