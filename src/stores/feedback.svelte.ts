import { FeedbackEvent, FEEDBACK_MAP, CONTINUOUS_EVENTS, type FeedbackEffect } from '../feedback/types';
import type { HapticTarget } from '../feedback/target-haptic';
import type { AudioTarget } from '../feedback/target-audio';

const PREFIX = 'satvisor_feedback_';

class FeedbackStore {
  // Persisted toggles
  hapticEnabled = $state(false);
  audioEnabled = $state(false);
  buttplugEnabled = $state(false);
  audioVolume = $state(0.5);

  // Runtime state (not persisted)
  hapticUnsupported = $state(false);
  audioUnsupported = $state(false);
  buttplugStatus = $state<'disconnected' | 'loading' | 'connected' | 'error'>('disconnected');
  buttplugError = $state<'no-bluetooth' | 'init-failed' | null>(null);
  buttplugDevices = $state<{ name: string; index: number; battery: number | null }[]>([]);
  dynamicIntensity = $state(0);

  // Targets (lazily instantiated)
  private hapticTarget: HapticTarget | null = null;
  private audioTarget: AudioTarget | null = null;
  private buttplugTarget: any = null;

  // Throttling
  private lastContinuousFire = 0;
  private lastDynamicFire = 0;
  private readonly CONTINUOUS_THROTTLE_MS = 80;
  private readonly DYNAMIC_THROTTLE_MS = 200;

  /** Main API — fire a named feedback event. Non-blocking, no-throw. */
  fire(event: FeedbackEvent): void {
    if (!this.hapticEnabled && !this.audioEnabled && !this.buttplugEnabled) return;

    const effect = FEEDBACK_MAP[event];
    if (!effect) return;

    // Throttle continuous events
    if (CONTINUOUS_EVENTS.has(event)) {
      const now = performance.now();
      if (now - this.lastContinuousFire < this.CONTINUOUS_THROTTLE_MS) return;
      this.lastContinuousFire = now;
    }

    this.dispatch(effect);
  }

  /**
   * Fire feedback with dynamic intensity (0..1). Throttled for continuous use.
   * Use for tracking (elevation-based), time scrub (speed-based), etc.
   * Passing 0 stops any ongoing output.
   */
  fireDynamic(intensity: number): void {
    if (!this.hapticEnabled && !this.audioEnabled && !this.buttplugEnabled) return;

    if (intensity <= 0) {
      this.dynamicIntensity = 0;
      if (this.buttplugEnabled && this.buttplugTarget) {
        try { this.buttplugTarget.fire({ buttplug: { intensity: 0 } }); } catch {}
      }
      if (this.audioEnabled && this.audioTarget) {
        try { this.audioTarget.setDynamic(0); } catch {}
      }
      return;
    }

    const now = performance.now();
    if (now - this.lastDynamicFire < this.DYNAMIC_THROTTLE_MS) return;
    this.lastDynamicFire = now;

    intensity = Math.min(1, intensity);
    this.dynamicIntensity = intensity;

    // Audio: sustained oscillator that ramps pitch with intensity (no throttle needed, smooth)
    if (this.audioEnabled && this.audioTarget) {
      try { this.audioTarget.setDynamic(intensity); } catch {}
    }

    const effect: FeedbackEffect = {
      haptic: [Math.round(5 + intensity * 25)],
      buttplug: { intensity, durationMs: this.DYNAMIC_THROTTLE_MS + 100 },
    };
    this.dispatch(effect);
  }

  private dispatch(effect: FeedbackEffect): void {
    if (this.hapticEnabled && this.hapticTarget) {
      try { this.hapticTarget.fire(effect); } catch {}
    }
    if (this.audioEnabled && this.audioTarget) {
      try { this.audioTarget.fire(effect); } catch {}
    }
    if (this.buttplugEnabled && this.buttplugTarget) {
      try { this.buttplugTarget.fire(effect); } catch {}
    }
  }

  // --- Target enable/disable ---

  async setHapticEnabled(value: boolean): Promise<void> {
    this.hapticEnabled = value;
    localStorage.setItem(PREFIX + 'haptic', String(value));
    if (value && !this.hapticTarget) {
      const { HapticTarget } = await import('../feedback/target-haptic');
      if (!this.hapticEnabled) return; // toggled off during import
      const target = new HapticTarget();
      if (!target.isSupported()) {
        this.hapticEnabled = false;
        this.hapticUnsupported = true;
        localStorage.setItem(PREFIX + 'haptic', 'false');
        return;
      }
      await target.init();
      if (!this.hapticEnabled) { target.dispose(); return; }
      this.hapticTarget = target;
    }
    if (!value && this.hapticTarget) {
      this.hapticTarget.dispose();
      this.hapticTarget = null;
    }
  }

  async setAudioEnabled(value: boolean): Promise<void> {
    this.audioEnabled = value;
    localStorage.setItem(PREFIX + 'audio', String(value));
    if (value && !this.audioTarget) {
      const { AudioTarget } = await import('../feedback/target-audio');
      if (!this.audioEnabled) return; // toggled off during import
      const target = new AudioTarget();
      if (!target.isSupported()) {
        this.audioEnabled = false;
        this.audioUnsupported = true;
        localStorage.setItem(PREFIX + 'audio', 'false');
        return;
      }
      await target.init();
      if (!this.audioEnabled) { target.dispose(); return; }
      target.setVolume(this.audioVolume);
      this.audioTarget = target;
    }
    if (!value && this.audioTarget) {
      this.audioTarget.dispose();
      this.audioTarget = null;
    }
  }

  setAudioVolume(v: number): void {
    this.audioVolume = Math.max(0, Math.min(1, v));
    localStorage.setItem(PREFIX + 'audio_volume', String(this.audioVolume));
    if (this.audioTarget) this.audioTarget.setVolume(this.audioVolume);
  }

  async setButtplugEnabled(value: boolean): Promise<void> {
    if (!__FEEDBACK_TOYS__) return;
    this.buttplugEnabled = value;
    localStorage.setItem(PREFIX + 'buttplug', String(value));
    if (value && !this.buttplugTarget) {
      this.buttplugStatus = 'loading';
      this.buttplugError = null;
      try {
        const { ButtplugTarget } = await import('../feedback/target-buttplug');
        const target = new ButtplugTarget();
        if (!target.isSupported()) {
          this.buttplugStatus = 'error';
          this.buttplugError = 'no-bluetooth';
          this.buttplugEnabled = false;
          localStorage.setItem(PREFIX + 'buttplug', 'false');
          return;
        }
        target.onStatusChange = (s: string) => { this.buttplugStatus = s as any; };
        target.onDevicesChange = (devices: { name: string; index: number; battery: number | null }[]) => { this.buttplugDevices = devices; };
        await target.init();
        if (!this.buttplugEnabled) { await target.dispose(); return; }
        this.buttplugTarget = target;
        this.buttplugStatus = 'connected';
      } catch (e) {
        console.error('Buttplug init failed:', e);
        this.buttplugStatus = 'error';
        this.buttplugError = 'init-failed';
        this.buttplugEnabled = false;
        localStorage.setItem(PREFIX + 'buttplug', 'false');
      }
    }
    if (!value && this.buttplugTarget) {
      await this.buttplugTarget.dispose();
      this.buttplugTarget = null;
      this.buttplugStatus = 'disconnected';
      this.buttplugError = null;
      this.buttplugDevices = [];
    }
  }

  async startButtplugScan(): Promise<void> {
    if (this.buttplugTarget) await this.buttplugTarget.startScanning();
  }

  private _testTimer: ReturnType<typeof setTimeout> | null = null;

  testButtplug(): void {
    if (!this.buttplugTarget) return;
    if (this._testTimer) clearTimeout(this._testTimer);
    this.dynamicIntensity = 0.5;
    this.buttplugTarget.fire({ buttplug: { intensity: 0.5, durationMs: 1000 } });
    this._testTimer = setTimeout(() => {
      this._testTimer = null;
      if (this.dynamicIntensity === 0.5) this.dynamicIntensity = 0;
    }, 1000);
  }

  /** Emergency stop — kill all dynamic output across all targets. */
  forceStop(): void {
    this.dynamicIntensity = 0;
    if (this.buttplugTarget) {
      try { this.buttplugTarget.fire({ buttplug: { intensity: 0 } }); } catch {}
    }
    if (this.audioTarget) {
      try { this.audioTarget.setDynamic(0); } catch {}
    }
    if (this.hapticTarget) {
      try { this.hapticTarget.fire({ haptic: [0] }); } catch {}
    }
  }

  /** Load persisted settings. Called in app.ts wireStores(). */
  load(): void {
    const g = (k: string) => localStorage.getItem(PREFIX + k);
    const vol = g('audio_volume');
    if (vol !== null) this.audioVolume = Number(vol);

    const hapticPref = g('haptic');
    if (hapticPref === 'true') {
      this.setHapticEnabled(true);
    } else if (hapticPref === null && 'ontouchstart' in window && 'vibrate' in navigator) {
      // Auto-enable haptic on mobile if user hasn't explicitly set a preference
      this.setHapticEnabled(true);
    }

    if (g('audio') === 'true') this.setAudioEnabled(true);
    // Buttplug intentionally NOT auto-loaded — requires user gesture for WebBluetooth
  }

  /** Global DOM listeners for automatic feedback on all buttons, checkboxes, sliders. */
  installGlobalListeners(): void {
    document.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest('button, input[type="checkbox"]');
      if (el && !(el as HTMLButtonElement).disabled) {
        this.fire(FeedbackEvent.ToggleChanged);
      }
    }, true);

    document.addEventListener('input', (e) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'range') {
        this.fire(FeedbackEvent.OrbitScrub);
      }
    }, true);
  }
}

export const feedbackStore = new FeedbackStore();
