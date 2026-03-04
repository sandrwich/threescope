import type { RotatorDriver, RotatorMode, SerialProtocol } from '../rotator/protocol';
import type { BeamTrackingState } from './beam.svelte';

const PREFIX = 'satvisor_rotator_';

export type RotatorStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type ParkPreset = 'north' | 'south' | 'zenith' | 'custom';

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
  wsUrl = $state('ws://localhost:4533');
  updateIntervalMs = $state(500);
  parkPreset = $state<ParkPreset>('north');
  parkAz = $state(0);
  parkEl = $state(0);

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

  // Internals
  private driver: RotatorDriver | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private trackTimer: ReturnType<typeof setInterval> | null = null;
  private _wasSlewing = false;
  private _errHistory: number[] = [];
  private _highErrSince: number | null = null;
  private _prevAz: number | null = null;
  private _prevEl: number | null = null;
  private _prevTime: number | null = null;
  private _velocityBuf: number[] = [];

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
  }

  async goto(az: number, el: number): Promise<void> {
    if (!this.driver?.connected) return;
    this.targetAz = az;
    this.targetEl = el;
    try {
      await this.driver.setPosition(az, el);
    } catch (e: any) {
      this.error = `Command failed: ${e?.message}`;
    }
  }

  async stop(): Promise<void> {
    if (!this.driver?.connected) return;
    this.autoTrack = false;
    this.targetAz = null;
    this.targetEl = null;
    try {
      await this.driver.stop();
    } catch {}
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
    if (state.trackAz === null || state.trackEl === null) return;
    // Update target — actual commands are sent by the tracking timer
    this.targetAz = state.trackAz;
    this.targetEl = state.trackEl;
  }

  private startTimers(): void {
    // Poll position readback
    this.pollTimer = setInterval(async () => {
      if (!this.driver?.connected) return;
      try {
        const pos = await this.driver.getPosition();
        this.actualAz = pos.az;
        this.actualEl = pos.el;

        // Compute angular velocity (°/s)
        const now = performance.now();
        if (this._prevAz !== null && this._prevEl !== null && this._prevTime !== null) {
          const dt = (now - this._prevTime) / 1000;
          if (dt > 0.05) {
            const dAz = Math.abs(pos.az - this._prevAz);
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
          const maxErr = Math.max(Math.abs(pos.az - this.targetAz), Math.abs(pos.el - this.targetEl));
          this.isSlewing = this._wasSlewing ? maxErr > 0.5 : maxErr > 2;
          this._wasSlewing = this.isSlewing;

          // Warning: rotator can't keep up (error not decreasing)
          this._errHistory.push(maxErr);
          if (this._errHistory.length > 6) this._errHistory.shift();

          // Sustained: error stays >5° for 3+ seconds AND not shrinking
          const high = maxErr > 5;
          if (high) {
            if (this._highErrSince === null) this._highErrSince = Date.now();
          } else {
            this._highErrSince = null;
          }
          const sustainedHigh = this._highErrSince !== null && Date.now() - this._highErrSince > 3000;

          // Check if error is shrinking — if so, rotator is making progress, no warning
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
          const errAz = Math.abs(pos.az - this.targetAz);
          const errEl = Math.abs(pos.el - this.targetEl);
          if (errAz < 0.5 && errEl < 0.5) {
            this.targetAz = null;
            this.targetEl = null;
          }
        }
      } catch {}
    }, this.updateIntervalMs);

    // Send tracking commands at the update interval
    this.trackTimer = setInterval(async () => {
      if (!this.autoTrack || !this.driver?.connected) return;
      if (this.targetAz === null || this.targetEl === null) return;
      try {
        await this.driver.setPosition(this.targetAz, this.targetEl);
      } catch {}
    }, this.updateIntervalMs);
  }

  private stopTimers(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.trackTimer) { clearInterval(this.trackTimer); this.trackTimer = null; }
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
    // autoTrack and panelOpen are NOT restored — require explicit user action
  }

  private save(key: string, value: string | number | boolean): void {
    localStorage.setItem(PREFIX + key, String(value));
  }

  setMode(mode: RotatorMode): void {
    this.mode = mode;
    this.save('mode', mode);
  }

  setSerialProtocol(proto: SerialProtocol): void {
    this.serialProtocol = proto;
    this.save('serial_protocol', proto);
  }

  setBaudRate(rate: number): void {
    this.baudRate = rate;
    this.save('baud_rate', rate);
  }

  setWsUrl(url: string): void {
    this.wsUrl = url;
    this.save('ws_url', url);
  }

  setUpdateInterval(ms: number): void {
    this.updateIntervalMs = Math.max(100, Math.min(5000, ms));
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
  }
}

export const rotatorStore = new RotatorStore();
