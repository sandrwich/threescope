import { getCurrentRealTimeEpoch, epochToDatetimeStr, epochToUnix, unixToEpoch } from '../astro/epoch';

/**
 * Port of the C version's StepTimeMultiplier.
 * Progression: ... -4, -2, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 2, 4, ...
 */
export function stepTimeMultiplier(current: number, increase: boolean): number {
  if (increase) {
    if (current === 0) return 0.25;
    if (current >= 0.25) return current * 2;
    if (current <= -0.25) {
      if (current === -0.25) return 0;
      return current / 2;
    }
  } else {
    if (current === 0) return -0.25;
    if (current <= -0.25) return current * 2;
    if (current >= 0.25) {
      if (current === 0.25) return 0;
      return current / 2;
    }
  }
  return current;
}

function formatSpeed(m: number): string {
  if (m === 0) return '0x';
  const abs = Math.abs(m);
  const sign = m < 0 ? '-' : '';
  if (abs >= 10) return `${sign}${abs.toFixed(0)}x`;
  if (abs >= 1) return `${sign}${abs}x`;
  return `${sign}${abs}x`;
}

/** Convert a Date to TLE epoch (yyddd.fraction) */
function dateToEpoch(date: Date): number {
  const year = date.getUTCFullYear();
  const yy = year % 100;
  const startOfYear = Date.UTC(year, 0, 1);
  const dayOfYear = (date.getTime() - startOfYear) / 86400000 + 1;
  return yy * 1000 + dayOfYear;
}

class TimeStore {
  // Raw values — written every frame by App
  epoch = $state(getCurrentRealTimeEpoch());
  multiplier = $state(1);
  paused = $state(false);

  // Display values — updated at ~4Hz
  displayDatetime = $state('');
  displaySpeed = $state('1x');
  isRealtime = $state(false);

  // TLE staleness warning
  tleWarning = $state('');

  // Warp state — interpolation in Unix seconds (linear)
  warping = $state(false);
  private warpTargetEpoch = 0;
  private warpStartUnix = 0;     // start position in unix seconds
  private warpTargetUnix = 0;    // target position in unix seconds
  private warpStartTime = 0;     // performance.now() at warp start
  private warpDuration = 0;      // wall-clock duration in seconds
  private preWarpMultiplier = 1; // restore after warp
  private preWarpPaused = false;

  private lastDisplayUpdate = 0;

  /** Called by App every frame in normal (non-warp) mode */
  syncFromEngine(epoch: number, multiplier: number, paused: boolean) {
    this.epoch = epoch;
    this.multiplier = multiplier;
    this.paused = paused;

    const now = performance.now();
    if (now - this.lastDisplayUpdate > 250) {
      this.lastDisplayUpdate = now;
      this.displayDatetime = epochToDatetimeStr(epoch);
      this.displaySpeed = formatSpeed(multiplier);

      const wallEpoch = getCurrentRealTimeEpoch();
      const wallUnix = epochToUnix(wallEpoch);
      const simUnix = epochToUnix(epoch);
      const diffSeconds = Math.abs(simUnix - wallUnix);
      this.isRealtime = diffSeconds < 5 && Math.abs(multiplier - 1) < 0.01 && !paused;

      // TLE staleness warning
      const diffDays = diffSeconds / 86400;
      const weeks = Math.floor(diffDays / 7);
      const direction = simUnix > wallUnix ? 'ahead' : 'behind';
      if (diffDays > 56) { // ~8 weeks
        if (diffDays > 365) {
          const years = (diffDays / 365.25).toFixed(1);
          this.tleWarning = `TLE data unreliable (${years}y ${direction})`;
        } else {
          this.tleWarning = `TLE data unreliable (${weeks}w ${direction})`;
        }
      } else if (diffDays > 14) {
        this.tleWarning = `TLE accuracy degraded (${weeks}w ${direction})`;
      } else if (diffDays > 3) {
        this.tleWarning = `TLE accuracy reduced (${Math.floor(diffDays)}d)`;
      } else {
        this.tleWarning = '';
      }
    }
  }

  /** Called by App every frame during warp — interpolates in unix time, converts back to epoch */
  tickWarp() {
    const elapsed = (performance.now() - this.warpStartTime) / 1000;
    const t = Math.min(1, elapsed / this.warpDuration);

    // Smooth S-curve (ease-in-out)
    const progress = t * t * (3 - 2 * t);

    // Interpolate in linear unix seconds, then convert back to TLE epoch
    const currentUnix = this.warpStartUnix + (this.warpTargetUnix - this.warpStartUnix) * progress;
    this.epoch = unixToEpoch(currentUnix);
    this.displayDatetime = epochToDatetimeStr(this.epoch);
    this.displaySpeed = 'WARP';
    this.isRealtime = false;

    if (t >= 1) {
      // Land exactly on target
      this.epoch = this.warpTargetEpoch;
      this.multiplier = this.preWarpMultiplier;
      this.paused = this.preWarpPaused;
      this.warping = false;
      this.displayDatetime = epochToDatetimeStr(this.epoch);
      this.displaySpeed = formatSpeed(this.multiplier);
    }
  }

  /** Start an animated time warp to the target epoch.
   *  Animates for jumps up to 30 days, snaps instantly beyond that. */
  warpToEpoch(target: number) {
    const startUnix = epochToUnix(this.epoch);
    const targetUnix = epochToUnix(target);
    const deltaSec = Math.abs(targetUnix - startUnix);
    const absDays = deltaSec / 86400;

    // Tiny jumps (< 1 minute) or large jumps (> 30 days): snap
    if (deltaSec < 60 || absDays > 30) {
      this.epoch = target;
      return;
    }

    this.warping = true;
    this.warpTargetEpoch = target;
    this.warpStartUnix = startUnix;
    this.warpTargetUnix = targetUnix;
    this.warpStartTime = performance.now();
    this.preWarpMultiplier = this.multiplier;
    this.preWarpPaused = this.paused;

    // Duration scales with magnitude: ~1.2s for small jumps, ~3s for large ones
    this.warpDuration = Math.min(3.0, Math.max(1.2, 0.5 + 0.6 * Math.log10(absDays + 1)));
  }

  togglePause() {
    if (this.warping) { this.cancelWarp(); return; }
    this.paused = !this.paused;
  }

  stepForward() {
    if (this.warping) this.cancelWarp();
    this.multiplier = stepTimeMultiplier(this.multiplier, true);
  }

  stepBackward() {
    if (this.warping) this.cancelWarp();
    this.multiplier = stepTimeMultiplier(this.multiplier, false);
  }

  resetSpeed() {
    if (this.warping) this.cancelWarp();
    this.multiplier = 1;
  }

  jumpToNow() {
    this.warpToEpoch(getCurrentRealTimeEpoch());
    // After warp, restore to 1x unpaused
    this.preWarpMultiplier = 1;
    this.preWarpPaused = false;
  }

  setEpochFromDate(date: Date) {
    this.warpToEpoch(dateToEpoch(date));
  }

  private cancelWarp() {
    if (!this.warping) return;
    this.warping = false;
    this.multiplier = this.preWarpMultiplier;
    this.paused = this.preWarpPaused;
  }
}

export const timeStore = new TimeStore();
