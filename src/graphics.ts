export interface GraphicsSettings {
  bloom: boolean;
  atmosphereGlow: boolean;
  bumpMapping: boolean;
  curvatureAO: boolean;
  surfaceRelief: number; // 0–100 raw slider value (÷10 = multiplier)
  sphereDetail: number;  // segment count: 32, 64, 128, 256
}

export interface GraphicsPreset {
  id: string;
  name: string;
  settings: GraphicsSettings;
}

export const PRESETS: GraphicsPreset[] = [
  {
    id: 'standard',
    name: 'Standard',
    settings: {
      bloom: false,
      atmosphereGlow: false,
      bumpMapping: false,
      curvatureAO: false,
      surfaceRelief: 10,
      sphereDetail: 64,
    },
  },
  {
    id: 'rtx',
    name: 'RTX',
    settings: {
      bloom: true,
      atmosphereGlow: true,
      bumpMapping: true,
      curvatureAO: true,
      surfaceRelief: 40,
      sphereDetail: 512,
    },
  },
];

export const DEFAULT_PRESET = 'rtx';

export function findMatchingPreset(current: GraphicsSettings): string | null {
  for (const preset of PRESETS) {
    const s = preset.settings;
    if (s.bloom === current.bloom &&
        s.atmosphereGlow === current.atmosphereGlow &&
        s.bumpMapping === current.bumpMapping &&
        s.curvatureAO === current.curvatureAO &&
        s.surfaceRelief === current.surfaceRelief &&
        s.sphereDetail === current.sphereDetail) {
      return preset.id;
    }
  }
  return null;
}

export function getPresetSettings(id: string): GraphicsSettings {
  const preset = PRESETS.find(p => p.id === id);
  if (!preset) return { ...PRESETS.find(p => p.id === DEFAULT_PRESET)!.settings };
  return { ...preset.settings };
}
