export type AntiAliasing = 'off' | 'smaa';

export interface GraphicsSettings {
  bloom: boolean;
  antiAliasing: AntiAliasing;
  atmosphereGlow: boolean;
  cloudShadows: boolean;
  oceanSpecular: boolean;
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
      antiAliasing: 'off',
      atmosphereGlow: true,
      cloudShadows: true,
      oceanSpecular: true,
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
      antiAliasing: 'smaa',
      atmosphereGlow: true,
      cloudShadows: true,
      oceanSpecular: true,
      bumpMapping: true,
      curvatureAO: true,
      surfaceRelief: 20,
      sphereDetail: 512,
    },
  },
];

export const DEFAULT_PRESET = 'rtx';

export function findMatchingPreset(current: GraphicsSettings): string | null {
  for (const preset of PRESETS) {
    const s = preset.settings;
    if (s.bloom === current.bloom &&
        s.antiAliasing === current.antiAliasing &&
        s.atmosphereGlow === current.atmosphereGlow &&
        s.cloudShadows === current.cloudShadows &&
        s.oceanSpecular === current.oceanSpecular &&
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
