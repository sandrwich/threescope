import type { RotatorDriver, RotatorMode, SerialProtocol } from '../rotator/protocol';
import type { BeamTrackingState } from './beam.svelte';
import { beamStore } from './beam.svelte';
import { uiStore } from './ui.svelte';
import { timeStore } from './time.svelte';

const PREFIX = 'satvisor_rotator_';

/** Shortest angular distance between two azimuth values (0–360°), always positive. */
function azDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export type RotatorStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type ParkPreset = 'north' | 'south' | 'zenith' | 'custom';

export type PassEndAction = 'nothing' | 'park' | 'slew-next';

export interface AntennaPreset {
  label: string;
  beamWidth: number;
  tolerance: number;
  updateMs: number;
}

export const ANTENNA_PRESETS: Record<string, AntennaPreset> = {
  vhf:  { label: 'VHF Yagi',   beamWidth: 30, tolerance: 5,   updateMs: 5000 },
  dual: { label: 'Dual-band',  beamWidth: 20, tolerance: 3,   updateMs: 2000 },
  uhf:  { label: 'UHF Yagi',   beamWidth: 18, tolerance: 2,   updateMs: 2000 },
  dish: { label: 'Dish',       beamWidth: 5,  tolerance: 1,   updateMs: 500 },
};

export const PARK_PRESETS: Record<Exclude<ParkPreset, 'custom'>, { label: string; az: number; el: number }> = {
  north:  { label: 'North / Horizon', az: 0, el: 0 },
  south:  { label: 'South / Horizon', az: 180, el: 0 },
  zenith: { label: 'Zenith (Stowed)', az: 0, el: 90 },
};

class RotatorStore {
  // Persisted settings
  mode = $state<RotatorMode>('serial');
  serialProtocol = $state<SerialProtocol>('gs232');
  baudRate = $state(9600);
  wsUrl = $state('ws://localhost:4540');
  updateIntervalMs = $state(2000);
  tolerance = $state(3.0);
  parkPreset = $state<ParkPreset>('north');
  parkAz = $state(0);
  parkEl = $state(0);
  passEndAction = $state<PassEndAction>('nothing');
  settleDelaySec = $state(5);

  // Runtime state
  status = $state<RotatorStatus>('disconnected');
  error = $state<string | null>(null);
  panelOpen = $state(false);
  autoTrack = $state(false);

  // Position state
  actualAz = $state<number | null>(null);
  actualEl = $state<number | null>(null);
  targetAz = $state<number | null>(null);
  targetEl = $state<number | null>(null);

  // Slewing state with hysteresis (>2° to enter, <0.5° to leave)
  isSlewing = $state(false);
  // Warning: rotator can't keep up with target
  slewWarning = $state(false);
  // Rotator angular velocity (°/s), smoothed over recent polls
  velocityDegS = $state(0);
  // AOS epoch of the next pass we're waiting for (TLE epoch, 0 = not waiting)
  nextAosEpoch = $state(0);
  nextAosSatName = $state('');

  // Internals
  private driver: RotatorDriver | null = null;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _tickPhase: 'poll' | 'track' = 'poll';
  private _wasSlewing = false;
  private _errHistory: number[] = [];
  private _highErrSince: number | null = null;
  private _prevAz: number | null = null;
  private _prevEl: number | null = null;
  private _prevTime: number | null = null;
  private _velocityBuf: number[] = [];
  private _wasTracking = false;
  private _pollFailCount = 0;
  private _cmdFailCount = 0;
  private _lastSentAz: number | null = null;
  private _lastSentEl: number | null = null;

  async connect(): Promise<void> {
    if (this.status === 'connected' || this.status === 'connecting') return;
    this.status = 'connecting';
    this.error = null;

    try {
      let driver: RotatorDriver;

      if (this.mode === 'serial') {
        if (this.serialProtocol === 'gs232') {
          const { GS232Driver } = await import('../rotator/gs232');
          driver = new GS232Driver();
        } else {
          const { EasyCommDriver } = await import('../rotator/easycomm');
          driver = new EasyCommDriver();
        }
      } else {
        const { RotctldDriver } = await import('../rotator/rotctld');
        driver = new RotctldDriver();
      }

      if (!driver.isSupported()) {
        this.status = 'error';
        this.error = this.mode === 'serial'
          ? 'Web Serial API not supported in this browser'
          : 'WebSocket not supported';
        return;
      }

      driver.onDisconnect = () => {
        this.status = 'disconnected';
        this.error = 'Connection lost';
        this.stopTimers();
        this.driver = null;
      };

      await driver.connect({
        baudRate: this.baudRate,
        wsUrl: this.wsUrl,
      });

      this.driver = driver;
      this.status = 'connected';
      this.startTimers();
    } catch (e: any) {
      // User cancelled the serial picker — not an error
      if (e?.name === 'NotAllowedError') {
        this.status = 'disconnected';
        this.error = null;
        return;
      }
      this.status = 'error';
      this.error = e?.message ?? 'Connection failed';
    }
  }

  async disconnect(): Promise<void> {
    if (this._settleTimer) { clearTimeout(this._settleTimer); this._settleTimer = null; }
    this.stopTimers();
    if (this.driver) {
      await this.driver.disconnect().catch(() => {});
      this.driver = null;
    }
    this.status = 'disconnected';
    this.error = null;
    this.actualAz = null;
    this.actualEl = null;
    this.targetAz = null;
    this.targetEl = null;
    this.isSlewing = false;
    this.slewWarning = false;
    this.velocityDegS = 0;
    this._wasSlewing = false;
    this._errHistory.length = 0;
    this._highErrSince = null;
    this._prevAz = null;
    this._prevEl = null;
    this._prevTime = null;
    this._velocityBuf.length = 0;
    this._wasTracking = false;
    this._pollFailCount = 0;
    this._cmdFailCount = 0;
    this._lastSentAz = null;
    this._lastSentEl = null;
    this.nextAosEpoch = 0;
    this.nextAosSatName = '';
  }

  async goto(az: number, el: number): Promise<void> {
    if (!this.driver?.connected) return;
    this.targetAz = az;
    this.targetEl = el;
    this._lastSentAz = az;
    this._lastSentEl = el;
    try {
      await this.driver.setPosition(az, el);
    } catch (e: any) {
      this.error = `Command failed: ${e?.message ?? 'unknown error'}`;
    }
  }

  async stop(): Promise<void> {
    if (!this.driver?.connected) return;
    this.autoTrack = false;
    this.targetAz = null;
    this.targetEl = null;
    this._lastSentAz = null;
    this._lastSentEl = null;
    try {
      await this.driver.stop();
    } catch (e: any) {
      this.error = `Stop failed: ${e?.message ?? 'unknown error'}`;
    }
  }

  async park(): Promise<void> {
    if (this.parkPreset === 'custom') {
      await this.goto(this.parkAz, this.parkEl);
    } else {
      const p = PARK_PRESETS[this.parkPreset];
      await this.goto(p.az, p.el);
    }
  }

  /** Called by beamStore.onTrackingUpdate when auto-track is active. */
  handleTrackingUpdate(state: BeamTrackingState): void {
    if (!this.autoTrack || !this.driver?.connected) return;
    if (state.trackAz === null || state.trackEl === null) {
      // Only trigger pass-end if we were actively tracking (sat was above horizon)
      if (this._wasTracking) {
        this._wasTracking = false;
        this.handlePassEnd(state.lockedNoradId);
      }
      return;
    }
    this._wasTracking = true;
    this.nextAosEpoch = 0;
    this.nextAosSatName = '';
    // Update target — actual commands are sent by the tracking timer
    this.targetAz = state.trackAz;
    this.targetEl = state.trackEl;
  }

  private _settleTimer: ReturnType<typeof setTimeout> | null = null;

  private handlePassEnd(noradId: number | null): void {
    if (this._settleTimer) { clearTimeout(this._settleTimer); this._settleTimer = null; }
    const act = () => {
      if (this.passEndAction === 'slew-next' && noradId !== null) {
        // Find next pass for the same sat and pre-position to AOS
        const nextPass = this.findNextPass(noradId);
        if (nextPass) {
          this.goto(nextPass.aosAz, 0);
          this.nextAosEpoch = nextPass.aosEpoch;
          this.nextAosSatName = nextPass.satName;
          // Keep auto-track on so it picks up when sat rises
          return;
        }
      }
      this.autoTrack = false;
      this.targetAz = null;
      this.targetEl = null;
      if (this.passEndAction === 'park') {
        this.park();
      }
    };
    const delayMs = this.settleDelaySec * 1000;
    if (delayMs > 0 && this.passEndAction !== 'nothing') {
      this._settleTimer = setTimeout(act, delayMs);
    } else {
      act();
    }
  }

  private findNextPass(noradId: number) {
    const epoch = timeStore.epoch;
    // Search both pass lists for the next future pass of this satellite
    for (const list of [uiStore.passes, uiStore.nearbyPasses]) {
      for (const pass of list) {
        if (pass.satNoradId === noradId && pass.aosEpoch > epoch) {
          return pass;
        }
      }
    }
    return null;
  }

  /**
   * Single interleaved timer: alternates poll → track → poll → track.
   * - Adaptive polling: polls at updateIntervalMs while slewing/tracking,
   *   slows to 3× when idle (nothing moving, no target).
   * - Skip-if-unchanged: suppresses redundant track commands when target
   *   hasn't moved since the last send (within 0.05°).
   */
  private startTimers(): void {
    this._tickPhase = 'poll';
    this._lastSentAz = null;
    this._lastSentEl = null;
    this.scheduleTick();
  }

  private scheduleTick(): void {
    if (this._timer !== null) return;
    // Half the update interval per phase → full cycle = updateIntervalMs
    const halfInterval = this.updateIntervalMs / 2;
    // Adaptive poll rate based on rotator velocity:
    //   ≥2°/s (fast slew)  → halfInterval (fastest, configured rate)
    //   ~0°/s (stationary)  → 3s (slow idle poll)
    // Linear interpolation between them. Track phase always uses halfInterval.
    let delay = halfInterval;
    if (this._tickPhase === 'poll') {
      const idleDelay = Math.max(halfInterval, 3000);
      const t = Math.min(1, this.velocityDegS / 2);  // 0 = idle, 1 = fast
      delay = halfInterval + (idleDelay - halfInterval) * (1 - t);
    }
    this._timer = setTimeout(() => {
      this._timer = null;
      this.tick();
    }, delay);
  }

  private async tick(): Promise<void> {
    if (!this.driver?.connected) return;

    if (this._tickPhase === 'poll') {
      await this.tickPoll();
      // Next phase: track (only if auto-tracking, otherwise skip straight to poll)
      this._tickPhase = this.autoTrack ? 'track' : 'poll';
    } else {
      await this.tickTrack();
      this._tickPhase = 'poll';
    }

    if (this.driver?.connected) this.scheduleTick();
  }

  private async tickPoll(): Promise<void> {
    try {
      const pos = await this.driver!.getPosition();
      if (pos === null) {
        this._pollFailCount++;
        if (this._pollFailCount >= 5) this.error = 'Position readback lost';
        return;
      }
      // Decrement toward 0; clear error once recovered (avoids flicker on noisy links)
      if (this._pollFailCount > 0) {
        this._pollFailCount = Math.max(0, this._pollFailCount - 2);
        if (this._pollFailCount === 0 && this.error === 'Position readback lost') this.error = null;
      }

      this.actualAz = pos.az;
      this.actualEl = pos.el;

      // Compute angular velocity (°/s)
      const now = performance.now();
      if (this._prevAz !== null && this._prevEl !== null && this._prevTime !== null) {
        const dt = (now - this._prevTime) / 1000;
        if (dt > 0.05) {
          const dAz = azDist(pos.az, this._prevAz);
          const dEl = Math.abs(pos.el - this._prevEl);
          const rate = Math.sqrt(dAz * dAz + dEl * dEl) / dt;
          this._velocityBuf.push(rate);
          if (this._velocityBuf.length > 4) this._velocityBuf.shift();
          this.velocityDegS = this._velocityBuf.reduce((a, b) => a + b, 0) / this._velocityBuf.length;
        }
      }
      this._prevAz = pos.az;
      this._prevEl = pos.el;
      this._prevTime = now;

      // Compute slewing state with hysteresis
      if (this.targetAz !== null && this.targetEl !== null) {
        const maxErr = Math.max(azDist(pos.az, this.targetAz), Math.abs(pos.el - this.targetEl));
        this.isSlewing = this._wasSlewing ? maxErr > 0.5 : maxErr > 2;
        this._wasSlewing = this.isSlewing;

        // Warning: rotator can't keep up (error not decreasing)
        this._errHistory.push(maxErr);
        if (this._errHistory.length > 6) this._errHistory.shift();

        const high = maxErr > 5;
        if (high) {
          if (this._highErrSince === null) this._highErrSince = Date.now();
        } else {
          this._highErrSince = null;
        }
        const sustainedHigh = this._highErrSince !== null && Date.now() - this._highErrSince > 3000;

        let shrinking = false;
        if (this._errHistory.length >= 3) {
          const h = this._errHistory;
          shrinking = h[h.length - 1] < h[h.length - 2] - 0.3
                   && h[h.length - 2] < h[h.length - 3] - 0.3;
        }

        this.slewWarning = this.autoTrack && sustainedHigh && !shrinking;
      } else {
        this.isSlewing = false;
        this._wasSlewing = false;
        this.slewWarning = false;
        this._errHistory.length = 0;
        this._highErrSince = null;
      }

      // Clear target once arrived (manual slew only, not auto-track)
      if (!this.autoTrack && this.targetAz !== null && this.targetEl !== null) {
        const errAz = azDist(pos.az, this.targetAz);
        const errEl = Math.abs(pos.el - this.targetEl);
        if (errAz < 0.5 && errEl < 0.5) {
          this.targetAz = null;
          this.targetEl = null;
        }
      }
    } catch {
      this._pollFailCount++;
      if (this._pollFailCount >= 5) this.error = 'Position readback lost';
    }
  }

  private _nudgeTimer: ReturnType<typeof setTimeout> | null = null;

  /** Debounced immediate track command (e.g. after manual reticle move). */
  nudge(): void {
    if (!this.autoTrack || !this.driver?.connected || beamStore.locked) return;
    this.targetAz = beamStore.aimAz;
    this.targetEl = beamStore.aimEl;
    if (this._nudgeTimer) return; // already scheduled
    this._nudgeTimer = setTimeout(() => {
      this._nudgeTimer = null;
      this.targetAz = beamStore.aimAz;
      this.targetEl = beamStore.aimEl;
      this.tickTrack();
    }, 500);
  }

  private async tickTrack(): Promise<void> {
    if (!this.autoTrack || !this.driver?.connected) return;
    // When not locked to a target, follow the beam reticle for manual positioning
    if (!beamStore.locked && this.nextAosEpoch === 0) {
      this.targetAz = beamStore.aimAz;
      this.targetEl = beamStore.aimEl;
    }
    if (this.targetAz === null || this.targetEl === null) return;

    // Skip if target hasn't moved since last command (within 0.05°)
    if (this._lastSentAz !== null && this._lastSentEl !== null
      && azDist(this.targetAz, this._lastSentAz) < 0.05
      && Math.abs(this.targetEl - this._lastSentEl) < 0.05) {
      return;
    }

    // Tolerance: skip if rotator is already close enough to the target
    if (this.tolerance > 0 && this.actualAz !== null && this.actualEl !== null
      && azDist(this.actualAz, this.targetAz) < this.tolerance
      && Math.abs(this.actualEl - this.targetEl) < this.tolerance) {
      return;
    }

    try {
      await this.driver.setPosition(this.targetAz, this.targetEl);
      this._lastSentAz = this.targetAz;
      this._lastSentEl = this.targetEl;
      this._cmdFailCount = 0;
      if (this.error?.startsWith('Command failed')) this.error = null;
    } catch (e: any) {
      this._cmdFailCount++;
      this.error = `Command failed: ${e?.message ?? 'unknown error'}`;
      if (this._cmdFailCount >= 3) {
        this.autoTrack = false;
        this.error = 'Tracking stopped: repeated command errors';
      }
    }
  }

  private stopTimers(): void {
    if (this._timer !== null) { clearTimeout(this._timer); this._timer = null; }
  }

  // ── Persistence ──

  load(): void {
    const g = (k: string) => localStorage.getItem(PREFIX + k);
    const mode = g('mode');
    if (mode === 'serial' || mode === 'network') this.mode = mode;
    const proto = g('serial_protocol');
    if (proto === 'gs232' || proto === 'easycomm') this.serialProtocol = proto;
    const baud = g('baud_rate');
    if (baud) this.baudRate = Number(baud);
    const url = g('ws_url');
    if (url) this.wsUrl = url;
    const interval = g('update_interval');
    if (interval) this.updateIntervalMs = Number(interval);
    const preset = g('park_preset');
    if (preset === 'north' || preset === 'south' || preset === 'zenith' || preset === 'custom') this.parkPreset = preset;
    const pAz = g('park_az');
    if (pAz) this.parkAz = Number(pAz);
    const pEl = g('park_el');
    if (pEl) this.parkEl = Number(pEl);
    const endAction = g('pass_end_action');
    if (endAction === 'nothing' || endAction === 'park' || endAction === 'slew-next') this.passEndAction = endAction;
    const settle = g('settle_delay');
    if (settle) this.settleDelaySec = Number(settle);
    const tol = g('tolerance');
    if (tol) this.tolerance = Number(tol);
    // autoTrack and panelOpen are NOT restored — require explicit user action
  }

  private save(key: string, value: string | number | boolean): void {
    localStorage.setItem(PREFIX + key, String(value));
  }

  private clearError(): void {
    if (this.status === 'error') this.status = 'disconnected';
    if (this.status !== 'connected') this.error = null;
  }

  setMode(mode: RotatorMode): void {
    this.mode = mode;
    this.save('mode', mode);
    this.clearError();
  }

  setSerialProtocol(proto: SerialProtocol): void {
    this.serialProtocol = proto;
    this.save('serial_protocol', proto);
    this.clearError();
  }

  setBaudRate(rate: number): void {
    this.baudRate = rate;
    this.save('baud_rate', rate);
    this.clearError();
  }

  setWsUrl(url: string): void {
    this.wsUrl = url;
    this.save('ws_url', url);
    this.clearError();
  }

  setUpdateInterval(ms: number): void {
    this.updateIntervalMs = Math.max(100, Math.min(20000, ms));
    this.save('update_interval', this.updateIntervalMs);
    if (this.driver?.connected) {
      this.stopTimers();
      this.startTimers();
    }
  }

  setParkPreset(preset: ParkPreset): void {
    this.parkPreset = preset;
    this.save('park_preset', preset);
  }

  setParkPosition(az: number, el: number): void {
    this.parkAz = Math.max(0, Math.min(360, az));
    this.parkEl = Math.max(0, Math.min(90, el));
    this.save('park_az', this.parkAz);
    this.save('park_el', this.parkEl);
  }

  setAutoTrack(value: boolean): void {
    this.autoTrack = value;
    if (value) {
      this._cmdFailCount = 0;
      this._lastSentAz = null;
      this._lastSentEl = null;
      this._velocityBuf.length = 0;
      if (this.error?.startsWith('Tracking stopped') || this.error?.startsWith('Command failed')) {
        this.error = null;
      }
    }
  }

  setPassEndAction(action: PassEndAction): void {
    this.passEndAction = action;
    this.save('pass_end_action', action);
  }

  setSettleDelay(sec: number): void {
    this.settleDelaySec = Math.max(0, Math.min(30, sec));
    this.save('settle_delay', this.settleDelaySec);
  }

  setTolerance(deg: number): void {
    this.tolerance = Math.max(0, Math.min(10, deg));
    this.save('tolerance', this.tolerance);
  }
}

export const rotatorStore = new RotatorStore();
