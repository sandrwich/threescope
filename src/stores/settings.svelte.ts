import { type GraphicsSettings, getPresetSettings, DEFAULT_PRESET, findMatchingPreset } from '../graphics';
import { type SimulationSettings, getSimPresetSettings, DEFAULT_SIM_PRESET, findMatchingSimPreset } from '../simulation';

class SettingsStore {
  graphics = $state<GraphicsSettings>(getPresetSettings(DEFAULT_PRESET));
  simulation = $state<SimulationSettings>(getSimPresetSettings(DEFAULT_SIM_PRESET));
  fpsLimit = $state(-1); // -1=vsync, 0=unlocked, >0=cap
  fpsSliderValue = $state(0); // raw slider value (0=Vsync, 1-480=cap, >480=Unlocked)

  // Callbacks registered by App during init
  onGraphicsChange: ((g: GraphicsSettings) => void) | null = null;
  onSimulationChange: ((s: SimulationSettings) => void) | null = null;
  onFpsLimitChange: ((limit: number) => void) | null = null;

  get graphicsPreset(): string | null {
    return findMatchingPreset(this.graphics);
  }

  get simulationPreset(): string | null {
    return findMatchingSimPreset(this.simulation);
  }

  load() {
    const savedGfx = localStorage.getItem('threescope_graphics');
    if (savedGfx) {
      try {
        this.graphics = { ...getPresetSettings(DEFAULT_PRESET), ...JSON.parse(savedGfx) };
      } catch { /* use default */ }
    }
    const savedSim = localStorage.getItem('threescope_simulation');
    if (savedSim) {
      try {
        this.simulation = { ...getSimPresetSettings(DEFAULT_SIM_PRESET), ...JSON.parse(savedSim) };
      } catch { /* use default */ }
    }
    const savedFps = localStorage.getItem('threescope_fps_limit');
    if (savedFps !== null) {
      const v = parseInt(savedFps, 10);
      this.fpsSliderValue = v;
      this.fpsLimit = v === 0 ? -1 : v > 480 ? 0 : v;
    }
  }

  applyGraphics(g: GraphicsSettings) {
    this.graphics = { ...g };
    localStorage.setItem('threescope_graphics', JSON.stringify(g));
    this.onGraphicsChange?.(g);
  }

  applySimulation(s: SimulationSettings) {
    this.simulation = { ...s };
    localStorage.setItem('threescope_simulation', JSON.stringify(s));
    this.onSimulationChange?.(s);
  }

  applyFpsLimit(sliderValue: number) {
    this.fpsSliderValue = sliderValue;
    this.fpsLimit = sliderValue === 0 ? -1 : sliderValue > 480 ? 0 : sliderValue;
    localStorage.setItem('threescope_fps_limit', String(sliderValue));
    this.onFpsLimitChange?.(this.fpsLimit);
  }
}

export const settingsStore = new SettingsStore();
