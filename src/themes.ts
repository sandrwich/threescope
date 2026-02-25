/** All CSS custom properties that constitute a theme */
export interface ThemeVars {
  '--bg': string;
  '--ui-bg': string;
  '--border': string;
  '--border-hover': string;
  '--text': string;
  '--text-dim': string;
  '--text-muted': string;
  '--text-faint': string;
  '--text-ghost': string;
  '--card-bg': string;
  '--modal-bg': string;
  '--modal-overlay': string;
  '--kbd-bg': string;
  '--link': string;
  '--link-hover': string;
  '--attrib': string;
  '--panel-bg': string;
  '--tooltip-bg': string;
  '--grid': string;
  '--grid-subtle': string;
  '--grid-dim': string;
  '--row-border': string;
  '--row-hover': string;
  '--row-active': string;
  '--row-highlight': string;
  '--danger': string;
  '--danger-bright': string;
  '--warning': string;
  '--warning-bright': string;
  '--live': string;
  '--handle-el': string;
  '--handle-az': string;
  '--handle-hz': string;
  '--handle-hz-active': string;
  '--el-low': string;
  '--el-mid': string;
  '--el-high': string;
  '--mag-day': string;
  '--mag-twilight': string;
  '--marker-aos': string;
  '--marker-los': string;
  '--apsis-peri': string;
  '--apsis-apo': string;
  '--accent': string;
  '--scene-text': string;
  '--scene-text-dim': string;
  '--snap-guide': string;
}

export interface ThemeDef {
  id: string;
  name: string;
  builtin: boolean;
  colorScheme: 'dark' | 'light';
  vars: ThemeVars;
}

export interface VarGroup {
  label: string;
  vars: { key: keyof ThemeVars; label: string }[];
}

export const VAR_GROUPS: VarGroup[] = [
  {
    label: 'Background & Surfaces',
    vars: [
      { key: '--bg', label: 'Background' },
      { key: '--ui-bg', label: 'UI Background' },
      { key: '--panel-bg', label: 'Panel' },
      { key: '--tooltip-bg', label: 'Tooltip' },
      { key: '--card-bg', label: 'Card' },
      { key: '--modal-bg', label: 'Modal' },
      { key: '--modal-overlay', label: 'Modal Overlay' },
      { key: '--kbd-bg', label: 'Keyboard Badge' },
    ],
  },
  {
    label: 'Text',
    vars: [
      { key: '--text', label: 'Primary' },
      { key: '--text-dim', label: 'Dim' },
      { key: '--text-muted', label: 'Muted' },
      { key: '--text-faint', label: 'Faint' },
      { key: '--text-ghost', label: 'Ghost' },
    ],
  },
  {
    label: 'Borders & Links',
    vars: [
      { key: '--border', label: 'Border' },
      { key: '--border-hover', label: 'Border Hover' },
      { key: '--accent', label: 'Accent' },
      { key: '--scene-text', label: 'Scene Text' },
      { key: '--scene-text-dim', label: 'Scene Text Dim' },
      { key: '--link', label: 'Link' },
      { key: '--link-hover', label: 'Link Hover' },
      { key: '--attrib', label: 'Attribution' },
    ],
  },
  {
    label: 'Rows & Grid',
    vars: [
      { key: '--row-border', label: 'Row Border' },
      { key: '--row-hover', label: 'Row Hover' },
      { key: '--row-active', label: 'Row Active' },
      { key: '--row-highlight', label: 'Row Highlight' },
      { key: '--grid', label: 'Grid' },
      { key: '--grid-subtle', label: 'Grid Subtle' },
      { key: '--grid-dim', label: 'Grid Dim' },
    ],
  },
  {
    label: 'State Colors',
    vars: [
      { key: '--danger', label: 'Danger' },
      { key: '--danger-bright', label: 'Danger Bright' },
      { key: '--warning', label: 'Warning' },
      { key: '--warning-bright', label: 'Warning Bright' },
      { key: '--live', label: 'Live / Active' },
    ],
  },
  {
    label: 'Elevation & Filters',
    vars: [
      { key: '--el-low', label: 'Elevation Low' },
      { key: '--el-mid', label: 'Elevation Mid' },
      { key: '--el-high', label: 'Elevation High' },
      { key: '--handle-el', label: 'Handle: Elevation' },
      { key: '--handle-az', label: 'Handle: Azimuth' },
      { key: '--handle-hz', label: 'Handle: Horizon' },
      { key: '--handle-hz-active', label: 'Handle: Horizon Active' },
    ],
  },
  {
    label: 'Domain Colors',
    vars: [
      { key: '--mag-day', label: 'Magnitude: Day' },
      { key: '--mag-twilight', label: 'Magnitude: Twilight' },
      { key: '--marker-aos', label: 'Marker: AOS' },
      { key: '--marker-los', label: 'Marker: LOS' },
      { key: '--apsis-peri', label: 'Apsis: Perigee' },
      { key: '--apsis-apo', label: 'Apsis: Apogee' },
      { key: '--snap-guide', label: 'Snap Guide' },
    ],
  },
];

export const THEME_DARK: ThemeDef = {
  id: 'dark',
  name: 'Dark',
  builtin: true,
  colorScheme: 'dark',
  vars: {
    '--bg': '#000000',
    '--ui-bg': '#0a0a0a',
    '--border': '#555555',
    '--border-hover': '#aaaaaa',
    '--text': '#ffffff',
    '--text-dim': '#eeeeee',
    '--text-muted': '#bbbbbb',
    '--text-faint': '#999999',
    '--text-ghost': '#777777',
    '--card-bg': 'rgba(0,0,0,0.85)',
    '--modal-bg': '#0a0a0a',
    '--modal-overlay': 'rgba(0,0,0,0.8)',
    '--kbd-bg': '#222222',
    '--link': '#666666',
    '--link-hover': '#aaaaaa',
    '--attrib': '#555555',
    '--panel-bg': '#1a1a1a',
    '--tooltip-bg': '#111111',
    '--grid': '#333333',
    '--grid-subtle': '#1a1a1a',
    '--grid-dim': '#444444',
    '--row-border': 'rgba(255,255,255,0.02)',
    '--row-hover': 'rgba(255,255,255,0.03)',
    '--row-active': 'rgba(255,255,255,0.05)',
    '--row-highlight': 'rgba(255,255,255,0.06)',
    '--danger': '#cc4444',
    '--danger-bright': '#ff6666',
    '--warning': '#cc6633',
    '--warning-bright': '#ff9944',
    '--live': '#44ff44',
    '--handle-el': '#ff8800',
    '--handle-az': '#00aaff',
    '--handle-hz': '#44cc44',
    '--handle-hz-active': '#88ff88',
    '--el-low': '#ff4444',
    '--el-mid': '#ffaa00',
    '--el-high': '#44ff44',
    '--mag-day': '#ffaa00',
    '--mag-twilight': '#ffcc44',
    '--marker-aos': '#00ffcc',
    '--marker-los': '#666666',
    '--apsis-peri': '#87ceeb',
    '--apsis-apo': '#ffa500',
    '--accent': '#66aaff',
    '--scene-text': 'rgba(255,255,255,0.75)',
    '--scene-text-dim': 'rgba(255,255,255,0.45)',
    '--snap-guide': 'rgba(100,150,255,0.3)',
  },
};

export const THEME_HIGH_CONTRAST: ThemeDef = {
  id: 'high-contrast',
  name: 'High Contrast',
  builtin: true,
  colorScheme: 'dark',
  vars: {
    '--bg': '#000000',
    '--ui-bg': '#000000',
    '--border': '#888888',
    '--border-hover': '#ffffff',
    '--text': '#ffffff',
    '--text-dim': '#ffffff',
    '--text-muted': '#dddddd',
    '--text-faint': '#bbbbbb',
    '--text-ghost': '#999999',
    '--card-bg': 'rgba(0,0,0,0.95)',
    '--modal-bg': '#000000',
    '--modal-overlay': 'rgba(0,0,0,0.9)',
    '--kbd-bg': '#111111',
    '--link': '#aaaaaa',
    '--link-hover': '#ffffff',
    '--attrib': '#888888',
    '--panel-bg': '#0a0a0a',
    '--tooltip-bg': '#000000',
    '--grid': '#555555',
    '--grid-subtle': '#222222',
    '--grid-dim': '#666666',
    '--row-border': 'rgba(255,255,255,0.06)',
    '--row-hover': 'rgba(255,255,255,0.08)',
    '--row-active': 'rgba(255,255,255,0.12)',
    '--row-highlight': 'rgba(255,255,255,0.14)',
    '--danger': '#ff4444',
    '--danger-bright': '#ff6666',
    '--warning': '#ff8800',
    '--warning-bright': '#ffaa44',
    '--live': '#44ff44',
    '--handle-el': '#ffaa00',
    '--handle-az': '#22ccff',
    '--handle-hz': '#44ff44',
    '--handle-hz-active': '#88ff88',
    '--el-low': '#ff4444',
    '--el-mid': '#ffcc00',
    '--el-high': '#44ff44',
    '--mag-day': '#ffcc00',
    '--mag-twilight': '#ffdd44',
    '--marker-aos': '#00ffcc',
    '--marker-los': '#888888',
    '--apsis-peri': '#aaddff',
    '--apsis-apo': '#ffbb33',
    '--accent': '#88bbff',
    '--scene-text': 'rgba(255,255,255,0.9)',
    '--scene-text-dim': 'rgba(255,255,255,0.6)',
    '--snap-guide': 'rgba(100,150,255,0.5)',
  },
};

export const THEME_LIGHT: ThemeDef = {
  id: 'light',
  name: 'Light',
  builtin: true,
  colorScheme: 'light',
  vars: {
    '--bg': '#e8e8e8',
    '--ui-bg': '#dcdcdc',
    '--border': '#aaaaaa',
    '--border-hover': '#555555',
    '--text': '#0a0a0a',
    '--text-dim': '#1a1a1a',
    '--text-muted': '#444444',
    '--text-faint': '#666666',
    '--text-ghost': '#888888',
    '--card-bg': 'rgba(240,240,240,0.92)',
    '--modal-bg': '#e0e0e0',
    '--modal-overlay': 'rgba(200,200,200,0.7)',
    '--kbd-bg': '#cccccc',
    '--link': '#777777',
    '--link-hover': '#333333',
    '--attrib': '#888888',
    '--panel-bg': '#d0d0d0',
    '--tooltip-bg': '#dcdcdc',
    '--grid': '#bbbbbb',
    '--grid-subtle': '#d0d0d0',
    '--grid-dim': '#999999',
    '--row-border': 'rgba(0,0,0,0.04)',
    '--row-hover': 'rgba(0,0,0,0.05)',
    '--row-active': 'rgba(0,0,0,0.08)',
    '--row-highlight': 'rgba(0,0,0,0.10)',
    '--danger': '#cc3333',
    '--danger-bright': '#ee4444',
    '--warning': '#cc6600',
    '--warning-bright': '#ee8800',
    '--live': '#22aa22',
    '--handle-el': '#dd7700',
    '--handle-az': '#0077cc',
    '--handle-hz': '#228822',
    '--handle-hz-active': '#44bb44',
    '--el-low': '#dd3333',
    '--el-mid': '#cc8800',
    '--el-high': '#22aa22',
    '--mag-day': '#cc8800',
    '--mag-twilight': '#ddaa22',
    '--marker-aos': '#009988',
    '--marker-los': '#888888',
    '--apsis-peri': '#4488aa',
    '--apsis-apo': '#cc7700',
    '--accent': '#3388cc',
    '--scene-text': 'rgba(255,255,255,0.75)',
    '--scene-text-dim': 'rgba(255,255,255,0.45)',
    '--snap-guide': 'rgba(50,100,200,0.3)',
  },
};

export const THEME_LAVENDER: ThemeDef = {
  id: 'lavender',
  name: 'Lavender',
  builtin: true,
  colorScheme: 'dark',
  vars: {
    '--bg': '#0e0b14',
    '--ui-bg': '#13101a',
    '--border': '#4a4060',
    '--border-hover': '#9080b0',
    '--text': '#e8e0f0',
    '--text-dim': '#d0c8e0',
    '--text-muted': '#a898c0',
    '--text-faint': '#8878a0',
    '--text-ghost': '#685880',
    '--card-bg': 'rgba(14,11,20,0.88)',
    '--modal-bg': '#13101a',
    '--modal-overlay': 'rgba(10,8,16,0.8)',
    '--kbd-bg': '#1e1828',
    '--link': '#685880',
    '--link-hover': '#a898c0',
    '--attrib': '#4a4060',
    '--panel-bg': '#1a1524',
    '--tooltip-bg': '#161220',
    '--grid': '#2a2240',
    '--grid-subtle': '#1a1524',
    '--grid-dim': '#3a3050',
    '--row-border': 'rgba(180,160,220,0.03)',
    '--row-hover': 'rgba(180,160,220,0.05)',
    '--row-active': 'rgba(180,160,220,0.08)',
    '--row-highlight': 'rgba(180,160,220,0.10)',
    '--danger': '#cc4466',
    '--danger-bright': '#ff6688',
    '--warning': '#cc8844',
    '--warning-bright': '#ffaa66',
    '--live': '#66dd88',
    '--handle-el': '#ee8844',
    '--handle-az': '#6699ee',
    '--handle-hz': '#55bb77',
    '--handle-hz-active': '#88eebb',
    '--el-low': '#ee5566',
    '--el-mid': '#ddaa44',
    '--el-high': '#66dd88',
    '--mag-day': '#ddaa44',
    '--mag-twilight': '#eecc66',
    '--marker-aos': '#55ddcc',
    '--marker-los': '#685880',
    '--apsis-peri': '#88bbee',
    '--apsis-apo': '#eeaa44',
    '--accent': '#9977dd',
    '--scene-text': 'rgba(232,224,240,0.75)',
    '--scene-text-dim': 'rgba(232,224,240,0.45)',
    '--snap-guide': 'rgba(140,120,220,0.35)',
  },
};

export const THEME_TLESCOPE: ThemeDef = {
  id: 'tlescope',
  name: 'TLEscope',
  builtin: true,
  colorScheme: 'dark',
  vars: {
    '--bg': '#101010',
    '--ui-bg': '#202020',
    '--border': '#404040',
    '--border-hover': '#66ff66',
    '--text': '#ffffff',
    '--text-dim': '#d3d3d3',
    '--text-muted': '#d3d3d3',
    '--text-faint': '#909090',
    '--text-ghost': '#606060',
    '--card-bg': 'rgba(0,0,0,0.80)',
    '--modal-bg': '#202020',
    '--modal-overlay': 'rgba(0,0,0,0.59)',
    '--kbd-bg': '#202020',
    '--link': '#909090',
    '--link-hover': '#66ff66',
    '--attrib': '#606060',
    '--panel-bg': '#202020',
    '--tooltip-bg': '#101010',
    '--grid': '#404040',
    '--grid-subtle': '#202020',
    '--grid-dim': '#505050',
    '--row-border': 'rgba(255,255,255,0.03)',
    '--row-hover': 'rgba(255,255,255,0.05)',
    '--row-active': 'rgba(102,255,102,0.10)',
    '--row-highlight': 'rgba(102,255,102,0.08)',
    '--danger': '#e62937',
    '--danger-bright': '#ff4455',
    '--warning': '#ffa500',
    '--warning-bright': '#ffbb33',
    '--live': '#66ff66',
    '--handle-el': '#ffa500',
    '--handle-az': '#00ffff',
    '--handle-hz': '#66ff66',
    '--handle-hz-active': '#99ff99',
    '--el-low': '#e62937',
    '--el-mid': '#ffa500',
    '--el-high': '#66ff66',
    '--mag-day': '#ffa500',
    '--mag-twilight': '#ffcc44',
    '--marker-aos': '#00ffff',
    '--marker-los': '#606060',
    '--apsis-peri': '#87ceeb',
    '--apsis-apo': '#ffa500',
    '--accent': '#66ff66',
    '--scene-text': 'rgba(255,255,255,0.75)',
    '--scene-text-dim': 'rgba(255,255,255,0.45)',
    '--snap-guide': 'rgba(102,255,102,0.3)',
  },
};

export const THEME_SOLARIZED: ThemeDef = {
  id: 'solarized',
  name: 'Solarized',
  builtin: true,
  colorScheme: 'dark',
  vars: {
    '--bg': '#002b36',
    '--ui-bg': '#073642',
    '--border': '#586e75',
    '--border-hover': '#93a1a1',
    '--text': '#e8e4d8',
    '--text-dim': '#d4d0c4',
    '--text-muted': '#93a1a1',
    '--text-faint': '#839496',
    '--text-ghost': '#657b83',
    '--card-bg': 'rgba(0,43,54,0.90)',
    '--modal-bg': '#073642',
    '--modal-overlay': 'rgba(0,30,40,0.8)',
    '--kbd-bg': '#073642',
    '--link': '#657b83',
    '--link-hover': '#93a1a1',
    '--attrib': '#586e75',
    '--panel-bg': '#073642',
    '--tooltip-bg': '#002b36',
    '--grid': '#2a4a53',
    '--grid-subtle': '#073642',
    '--grid-dim': '#3a5a63',
    '--row-border': 'rgba(147,161,161,0.04)',
    '--row-hover': 'rgba(147,161,161,0.06)',
    '--row-active': 'rgba(147,161,161,0.10)',
    '--row-highlight': 'rgba(147,161,161,0.08)',
    '--danger': '#dc322f',
    '--danger-bright': '#ff4444',
    '--warning': '#cb4b16',
    '--warning-bright': '#ee6633',
    '--live': '#859900',
    '--handle-el': '#cb4b16',
    '--handle-az': '#268bd2',
    '--handle-hz': '#859900',
    '--handle-hz-active': '#b5c900',
    '--el-low': '#dc322f',
    '--el-mid': '#b58900',
    '--el-high': '#859900',
    '--mag-day': '#b58900',
    '--mag-twilight': '#d5a900',
    '--marker-aos': '#2aa198',
    '--marker-los': '#657b83',
    '--apsis-peri': '#268bd2',
    '--apsis-apo': '#cb4b16',
    '--accent': '#2aa198',
    '--scene-text': 'rgba(232,228,216,0.75)',
    '--scene-text-dim': 'rgba(232,228,216,0.45)',
    '--snap-guide': 'rgba(42,161,152,0.3)',
  },
};

export const THEME_GRUVBOX: ThemeDef = {
  id: 'gruvbox',
  name: 'Gruvbox',
  builtin: true,
  colorScheme: 'dark',
  vars: {
    '--bg': '#282828',
    '--ui-bg': '#3c3836',
    '--border': '#665c54',
    '--border-hover': '#bdae93',
    '--text': '#fbf1c7',
    '--text-dim': '#ebdbb2',
    '--text-muted': '#d5c4a1',
    '--text-faint': '#a89984',
    '--text-ghost': '#7c6f64',
    '--card-bg': 'rgba(40,40,40,0.90)',
    '--modal-bg': '#3c3836',
    '--modal-overlay': 'rgba(28,28,28,0.8)',
    '--kbd-bg': '#3c3836',
    '--link': '#7c6f64',
    '--link-hover': '#bdae93',
    '--attrib': '#665c54',
    '--panel-bg': '#3c3836',
    '--tooltip-bg': '#282828',
    '--grid': '#504945',
    '--grid-subtle': '#3c3836',
    '--grid-dim': '#665c54',
    '--row-border': 'rgba(235,219,178,0.03)',
    '--row-hover': 'rgba(235,219,178,0.05)',
    '--row-active': 'rgba(235,219,178,0.08)',
    '--row-highlight': 'rgba(235,219,178,0.06)',
    '--danger': '#cc241d',
    '--danger-bright': '#fb4934',
    '--warning': '#d65d0e',
    '--warning-bright': '#fe8019',
    '--live': '#b8bb26',
    '--handle-el': '#fe8019',
    '--handle-az': '#83a598',
    '--handle-hz': '#b8bb26',
    '--handle-hz-active': '#d8db46',
    '--el-low': '#fb4934',
    '--el-mid': '#fabd2f',
    '--el-high': '#b8bb26',
    '--mag-day': '#fabd2f',
    '--mag-twilight': '#fadd4f',
    '--marker-aos': '#8ec07c',
    '--marker-los': '#7c6f64',
    '--apsis-peri': '#83a598',
    '--apsis-apo': '#fe8019',
    '--accent': '#fabd2f',
    '--scene-text': 'rgba(251,241,199,0.75)',
    '--scene-text-dim': 'rgba(251,241,199,0.45)',
    '--snap-guide': 'rgba(250,189,47,0.3)',
  },
};

export const THEME_NORD: ThemeDef = {
  id: 'nord',
  name: 'Nord',
  builtin: true,
  colorScheme: 'dark',
  vars: {
    '--bg': '#1a1e27',
    '--ui-bg': '#242933',
    '--border': '#4c566a',
    '--border-hover': '#d8dee9',
    '--text': '#eceff4',
    '--text-dim': '#e5e9f0',
    '--text-muted': '#c8ceda',
    '--text-faint': '#8890a0',
    '--text-ghost': '#5d6678',
    '--card-bg': 'rgba(26,30,39,0.90)',
    '--modal-bg': '#242933',
    '--modal-overlay': 'rgba(20,24,32,0.8)',
    '--kbd-bg': '#2e3440',
    '--link': '#5d6678',
    '--link-hover': '#c8ceda',
    '--attrib': '#4c566a',
    '--panel-bg': '#2e3440',
    '--tooltip-bg': '#1a1e27',
    '--grid': '#3b4252',
    '--grid-subtle': '#2e3440',
    '--grid-dim': '#4c566a',
    '--row-border': 'rgba(216,222,233,0.03)',
    '--row-hover': 'rgba(216,222,233,0.05)',
    '--row-active': 'rgba(216,222,233,0.08)',
    '--row-highlight': 'rgba(216,222,233,0.06)',
    '--danger': '#bf616a',
    '--danger-bright': '#d08770',
    '--warning': '#d08770',
    '--warning-bright': '#ebcb8b',
    '--live': '#a3be8c',
    '--handle-el': '#d08770',
    '--handle-az': '#81a1c1',
    '--handle-hz': '#a3be8c',
    '--handle-hz-active': '#c3deac',
    '--el-low': '#bf616a',
    '--el-mid': '#ebcb8b',
    '--el-high': '#a3be8c',
    '--mag-day': '#ebcb8b',
    '--mag-twilight': '#f0d8a8',
    '--marker-aos': '#88c0d0',
    '--marker-los': '#6a7588',
    '--apsis-peri': '#81a1c1',
    '--apsis-apo': '#d08770',
    '--accent': '#88c0d0',
    '--scene-text': 'rgba(236,239,244,0.75)',
    '--scene-text-dim': 'rgba(236,239,244,0.45)',
    '--snap-guide': 'rgba(136,192,208,0.3)',
  },
};

export const THEME_CATPPUCCIN: ThemeDef = {
  id: 'catppuccin',
  name: 'Catppuccin',
  builtin: true,
  colorScheme: 'dark',
  vars: {
    '--bg': '#1e1e2e',
    '--ui-bg': '#313244',
    '--border': '#585b70',
    '--border-hover': '#bac2de',
    '--text': '#cdd6f4',
    '--text-dim': '#bac2de',
    '--text-muted': '#a6adc8',
    '--text-faint': '#7f849c',
    '--text-ghost': '#6c7086',
    '--card-bg': 'rgba(30,30,46,0.90)',
    '--modal-bg': '#313244',
    '--modal-overlay': 'rgba(24,24,37,0.8)',
    '--kbd-bg': '#313244',
    '--link': '#6c7086',
    '--link-hover': '#bac2de',
    '--attrib': '#585b70',
    '--panel-bg': '#313244',
    '--tooltip-bg': '#1e1e2e',
    '--grid': '#45475a',
    '--grid-subtle': '#313244',
    '--grid-dim': '#585b70',
    '--row-border': 'rgba(205,214,244,0.03)',
    '--row-hover': 'rgba(205,214,244,0.05)',
    '--row-active': 'rgba(205,214,244,0.08)',
    '--row-highlight': 'rgba(205,214,244,0.06)',
    '--danger': '#f38ba8',
    '--danger-bright': '#f5a0b8',
    '--warning': '#fab387',
    '--warning-bright': '#fcc5a0',
    '--live': '#a6e3a1',
    '--handle-el': '#fab387',
    '--handle-az': '#89b4fa',
    '--handle-hz': '#a6e3a1',
    '--handle-hz-active': '#c6f3c1',
    '--el-low': '#f38ba8',
    '--el-mid': '#f9e2af',
    '--el-high': '#a6e3a1',
    '--mag-day': '#f9e2af',
    '--mag-twilight': '#fbe8c0',
    '--marker-aos': '#94e2d5',
    '--marker-los': '#6c7086',
    '--apsis-peri': '#89b4fa',
    '--apsis-apo': '#fab387',
    '--accent': '#cba6f7',
    '--scene-text': 'rgba(205,214,244,0.75)',
    '--scene-text-dim': 'rgba(205,214,244,0.45)',
    '--snap-guide': 'rgba(203,166,247,0.3)',
  },
};

export const BUILTIN_THEMES: ThemeDef[] = [THEME_DARK, THEME_HIGH_CONTRAST, THEME_LIGHT, THEME_TLESCOPE, THEME_GRUVBOX, THEME_SOLARIZED, THEME_NORD, THEME_CATPPUCCIN, THEME_LAVENDER];
export const DEFAULT_THEME_ID = 'dark';

/** Extract an opaque hex color from any CSS color string for use with <input type="color"> */
export function cssColorToHex(value: string): string {
  const rgba = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgba) {
    const r = Number(rgba[1]).toString(16).padStart(2, '0');
    const g = Number(rgba[2]).toString(16).padStart(2, '0');
    const b = Number(rgba[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  // Handle short hex (#abc -> #aabbcc)
  const short = value.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  // Handle hex with alpha (#rrggbbaa -> #rrggbb)
  if (value.match(/^#[0-9a-fA-F]{8}$/)) return value.slice(0, 7);
  // Already a 6-digit hex or close enough
  if (value.match(/^#[0-9a-fA-F]{6}$/)) return value;
  return '#000000';
}
