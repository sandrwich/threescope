export interface FreqPreset {
  label: string;
  min: number;
  max: number;
}

export const FREQ_PRESETS: FreqPreset[] = [
  { label: 'VHF', min: 30, max: 300 },
  { label: '2m', min: 144, max: 146 },
  { label: 'UHF', min: 300, max: 1000 },
  { label: '70cm', min: 430, max: 440 },
  { label: 'L', min: 1000, max: 2000 },
  { label: '23cm', min: 1240, max: 1300 },
  { label: 'S', min: 2000, max: 4000 },
  { label: 'X', min: 8000, max: 12000 },
];
