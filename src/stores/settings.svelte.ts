import { type GraphicsSettings, getPresetSettings, DEFAULT_PRESET, findMatchingPreset } from '../graphics';
import { type SimulationSettings, getSimPresetSettings, DEFAULT_SIM_PRESET, findMatchingSimPreset } from '../simulation';

class SettingsStore {
  graphics = $state<GraphicsSettings>(getPresetSettings(DEFAULT_PRESET));
  simulation = $state<SimulationSettings>(getSimPresetSettings(DEFAULT_SIM_PRESET));
  fpsLimit = $state(-1); // -1=vsync, 0=unlocked, >0=cap
  fpsSliderValue = $state(0); // raw slider value (0=Vsync, 1-480=cap, >480=Unlocked)
  fov = $state(45); // camera field of view in degrees (10–120)
  timezone = $state(Intl.DateTimeFormat().resolvedOptions().timeZone); // IANA timezone ID

  // Callbacks registered by App during init
  onGraphicsChange: ((g: GraphicsSettings) => void) | null = null;
  onSimulationChange: ((s: SimulationSettings) => void) | null = null;
  onFpsLimitChange: ((limit: number) => void) | null = null;
  onFovChange: ((fov: number) => void) | null = null;

  get graphicsPreset(): string | null {
    return findMatchingPreset(this.graphics);
  }

  get simulationPreset(): string | null {
    return findMatchingSimPreset(this.simulation);
  }

  load() {
    const savedGfx = localStorage.getItem('satvisor_graphics');
    if (savedGfx) {
      try {
        this.graphics = { ...getPresetSettings(DEFAULT_PRESET), ...JSON.parse(savedGfx) };
      } catch { /* use default */ }
    }
    const savedSim = localStorage.getItem('satvisor_simulation');
    if (savedSim) {
      try {
        this.simulation = { ...getSimPresetSettings(DEFAULT_SIM_PRESET), ...JSON.parse(savedSim) };
      } catch { /* use default */ }
    }
    const savedFps = localStorage.getItem('satvisor_fps_limit');
    if (savedFps !== null) {
      const v = parseInt(savedFps, 10);
      this.fpsSliderValue = v;
      this.fpsLimit = v === 0 ? -1 : v > 480 ? 0 : v;
    }
    const savedFov = localStorage.getItem('satvisor_fov');
    if (savedFov !== null) this.fov = Math.max(10, Math.min(120, Number(savedFov)));

    const savedTz = localStorage.getItem('satvisor_timezone');
    if (savedTz) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: savedTz });
        this.timezone = savedTz;
      } catch {
        // Invalid stored timezone — reset to browser default
        localStorage.removeItem('satvisor_timezone');
      }
    }
  }

  applyGraphics(g: GraphicsSettings) {
    this.graphics = { ...g };
    localStorage.setItem('satvisor_graphics', JSON.stringify(g));
    this.onGraphicsChange?.(g);
  }

  applySimulation(s: SimulationSettings) {
    this.simulation = { ...s };
    localStorage.setItem('satvisor_simulation', JSON.stringify(s));
    this.onSimulationChange?.(s);
  }

  applyFpsLimit(sliderValue: number) {
    this.fpsSliderValue = sliderValue;
    this.fpsLimit = sliderValue === 0 ? -1 : sliderValue > 480 ? 0 : sliderValue;
    localStorage.setItem('satvisor_fps_limit', String(sliderValue));
    this.onFpsLimitChange?.(this.fpsLimit);
  }

  applyFov(value: number) {
    this.fov = Math.max(10, Math.min(120, value));
    localStorage.setItem('satvisor_fov', String(this.fov));
    this.onFovChange?.(this.fov);
  }

  applyTimezone(tz: string) {
    this.timezone = tz;
    localStorage.setItem('satvisor_timezone', tz);
  }

  /** Toggle between UTC and the user's local timezone. */
  toggleUtc() {
    if (this.timezone === 'UTC') {
      const prev = localStorage.getItem('satvisor_prev_timezone')
        ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      this.applyTimezone(prev);
    } else {
      localStorage.setItem('satvisor_prev_timezone', this.timezone);
      this.applyTimezone('UTC');
    }
  }

  get isUtc(): boolean {
    return this.timezone === 'UTC';
  }

  /** Short label for the current timezone, e.g. "EST", "UTC+2", or "UTC". */
  get timezoneAbbr(): string {
    if (this.timezone === 'UTC') return 'UTC';
    try {
      const fmt = new Intl.DateTimeFormat('en-US', { timeZone: this.timezone, timeZoneName: 'short' });
      const parts = fmt.formatToParts(new Date());
      return parts.find(p => p.type === 'timeZoneName')?.value ?? this.timezone;
    } catch {
      return this.timezone;
    }
  }
}

export const settingsStore = new SettingsStore();
