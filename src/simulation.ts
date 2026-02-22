export interface SimulationSettings {
  orbitMode: 'analytical' | 'sgp4';
  orbitSegments: number;   // 16, 30, 60, 90
  j2Precession: boolean;
  atmosphericDrag: boolean;
  updateQuality: number;   // 8, 16, 32, 64
}

export interface SimulationPreset {
  id: string;
  name: string;
  settings: SimulationSettings;
}

export const SIM_PRESETS: SimulationPreset[] = [
  {
    id: 'approximate',
    name: 'Approximate',
    settings: {
      orbitMode: 'analytical',
      orbitSegments: 60,
      j2Precession: true,
      atmosphericDrag: true,
      updateQuality: 16,
    },
  },
  {
    id: 'accurate',
    name: 'Accurate',
    settings: {
      orbitMode: 'sgp4',
      orbitSegments: 90,
      j2Precession: true,
      atmosphericDrag: true,
      updateQuality: 8,
    },
  },
];

export const DEFAULT_SIM_PRESET = 'accurate';

export function findMatchingSimPreset(current: SimulationSettings): string | null {
  for (const preset of SIM_PRESETS) {
    const s = preset.settings;
    if (s.orbitMode === current.orbitMode &&
        s.orbitSegments === current.orbitSegments &&
        s.j2Precession === current.j2Precession &&
        s.atmosphericDrag === current.atmosphericDrag &&
        s.updateQuality === current.updateQuality) {
      return preset.id;
    }
  }
  return null;
}

export function getSimPresetSettings(id: string): SimulationSettings {
  const preset = SIM_PRESETS.find(p => p.id === id);
  if (!preset) return { ...SIM_PRESETS.find(p => p.id === DEFAULT_SIM_PRESET)!.settings };
  return { ...preset.settings };
}
