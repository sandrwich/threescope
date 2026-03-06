import type { RigDriver, RigMode, RigSerialProtocol } from '../rig/protocol';
import type { SatRec } from 'satellite.js';
import { calculateDopplerShift } from '../astro/doppler';
import { observerStore } from './observer.svelte';
import { timeStore } from './time.svelte';

const PREFIX = 'satvisor_rig_';

export type RigStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

class RigStore {
  // Persisted settings
  mode = $state<RigMode>('serial');
  serialProtocol = $state<RigSerialProtocol>('kenwood');
  baudRate = $state(9600);
  wsUrl = $state('ws://localhost:4541');
  civAddress = $state(0x94);
  updateIntervalMs = $state(1000);
  txOffsetHz = $state(0);
  liveCorrection = $state(false);
  radioMode = $state('');

  // Runtime state
  status = $state<RigStatus>('disconnected');
  error = $state<string | null>(null);
  lastSentHz = $state<number | null>(null);
  currentHz = $state<number | null>(null);

  // Tracking params (pushed by DopplerWindow)
  private _satrec: SatRec | null = null;
  private _baseFreqHz = 0;

  private driver: RigDriver | null = null;
  private _timer: ReturnType<typeof setTimeout> | null = null;

  setTrackingParams(satrec: SatRec, baseFreqHz: number): void {
    this._satrec = satrec;
    this._baseFreqHz = baseFreqHz;
  }

  clearTracking(): void {
    this._satrec = null;
    this._baseFreqHz = 0;
  }

  async connect(): Promise<void> {
    if (this.status === 'connected' || this.status === 'connecting') return;
    this.status = 'connecting';
    this.error = null;

    try {
      let driver: RigDriver;

      if (this.mode === 'serial') {
        switch (this.serialProtocol) {
          case 'kenwood': {
            const { KenwoodDriver } = await import('../rig/kenwood');
            driver = new KenwoodDriver();
            break;
          }
          case 'yaesu': {
            const { YaesuDriver } = await import('../rig/yaesu');
            driver = new YaesuDriver();
            break;
          }
          case 'yaesu-legacy': {
            const { YaesuLegacyDriver } = await import('../rig/yaesu-legacy');
            driver = new YaesuLegacyDriver();
            break;
          }
          case 'civ': {
            const { CivDriver } = await import('../rig/civ');
            driver = new CivDriver();
            break;
          }
          default:
            throw new Error(`Unknown protocol: ${this.serialProtocol}`);
        }
      } else {
        const { RigctldDriver } = await import('../rig/rigctld');
        driver = new RigctldDriver();
      }

      if (!driver!.isSupported()) {
        this.status = 'error';
        this.error = this.mode === 'serial'
          ? 'Web Serial API not supported in this browser'
          : 'WebSocket not supported';
        return;
      }

      driver!.onDisconnect = () => {
        this.status = 'disconnected';
        this.error = 'Connection lost';
        this.stopTimer();
        this.driver = null;
      };

      await driver!.connect({
        baudRate: this.baudRate,
        wsUrl: this.wsUrl,
        civAddress: this.civAddress,
      });

      this.driver = driver!;
      this.status = 'connected';
      this.startTimer();
    } catch (e: any) {
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
    this.stopTimer();
    if (this.driver) {
      await this.driver.disconnect().catch(() => {});
      this.driver = null;
    }
    this.status = 'disconnected';
    this.error = null;
    this.lastSentHz = null;
    this.currentHz = null;
  }

  private startTimer(): void {
    this.scheduleTick();
  }

  private scheduleTick(): void {
    if (this._timer !== null) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this.tick();
    }, this.updateIntervalMs);
  }

  private async tick(): Promise<void> {
    if (!this.driver?.connected) return;

    // Read back current frequency
    try {
      const hz = await this.driver.getFrequency();
      if (hz !== null) this.currentHz = hz;
    } catch {}

    // Send Doppler-corrected frequency if live correction is active
    if (this.liveCorrection && this.driver?.connected && this._satrec && this._baseFreqHz > 0) {
      const obs = observerStore.location;
      const result = calculateDopplerShift(
        this._satrec, timeStore.epoch,
        obs.lat, obs.lon, obs.alt, this._baseFreqHz,
      );
      if (result) {
        const targetHz = Math.round(result.frequency + this.txOffsetHz);
        // Skip if frequency hasn't changed by more than 1 Hz
        if (this.lastSentHz === null || Math.abs(targetHz - this.lastSentHz) > 1) {
          try {
            await this.driver.setFrequency(targetHz);
            this.lastSentHz = targetHz;
          } catch (e: any) {
            this.error = `Set freq failed: ${e?.message ?? 'unknown'}`;
          }
        }
      }
    }

    if (this.driver?.connected) this.scheduleTick();
  }

  private stopTimer(): void {
    if (this._timer !== null) { clearTimeout(this._timer); this._timer = null; }
  }

  // ── Persistence ──

  load(): void {
    const g = (k: string) => localStorage.getItem(PREFIX + k);
    const mode = g('mode');
    if (mode === 'serial' || mode === 'network') this.mode = mode;
    const proto = g('serial_protocol');
    if (proto === 'kenwood' || proto === 'yaesu' || proto === 'yaesu-legacy' || proto === 'civ') this.serialProtocol = proto;
    const baud = g('baud_rate');
    if (baud) this.baudRate = Number(baud);
    const url = g('ws_url');
    if (url) this.wsUrl = url;
    const civ = g('civ_address');
    if (civ) this.civAddress = Number(civ);
    const interval = g('update_interval');
    if (interval) this.updateIntervalMs = Number(interval);
    const offset = g('tx_offset');
    if (offset) this.txOffsetHz = Number(offset);
  }

  private save(key: string, value: string | number | boolean): void {
    localStorage.setItem(PREFIX + key, String(value));
  }

  private clearError(): void {
    if (this.status === 'error') this.status = 'disconnected';
    if (this.status !== 'connected') this.error = null;
  }

  setMode(mode: RigMode): void {
    this.mode = mode;
    this.save('mode', mode);
    this.clearError();
  }

  setSerialProtocol(proto: RigSerialProtocol): void {
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

  setCivAddress(addr: number): void {
    this.civAddress = addr;
    this.save('civ_address', addr);
    this.clearError();
  }

  setUpdateInterval(ms: number): void {
    this.updateIntervalMs = Math.max(100, Math.min(10000, ms));
    this.save('update_interval', this.updateIntervalMs);
    if (this.driver?.connected) {
      this.stopTimer();
      this.startTimer();
    }
  }

  setTxOffset(hz: number): void {
    this.txOffsetHz = hz;
    this.save('tx_offset', hz);
  }

  setLiveCorrection(on: boolean): void {
    this.liveCorrection = on;
    if (!on) {
      this.lastSentHz = null;
    }
  }

  setRadioMode(mode: string): void {
    this.radioMode = mode;
  }

  /** Send radio mode to rig if connected and mode is set. */
  async sendRadioMode(): Promise<void> {
    if (!this.driver?.connected || !this.radioMode) return;
    try {
      await this.driver.setMode?.(this.radioMode);
    } catch (e: any) {
      this.error = `Set mode failed: ${e?.message ?? 'unknown'}`;
    }
  }
}

export const rigStore = new RigStore();
