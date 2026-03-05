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
  '--marker-tca': string;
  '--apsis-peri': string;
  '--apsis-apo': string;
  '--marker-range': string;
  '--accent': string;
  '--scene-text': string;
  '--scene-text-dim': string;
  '--snap-guide': string;
  '--radar-bg': string;
  '--radar-grid': string;
  '--radar-blip': string;
  '--radar-blip-dim': string;
  '--radar-text': string;
  '--radar-label': string;
  '--radar-sweep': string;
  '--beam-reticle': string;
  '--beam-reticle-locked': string;
  '--beam-cone': string;
  '--beam-highlight': string;
  '--beam-arc': string;
  '--rotator': string;
  '--heatmap-low': string;
  '--heatmap-mid': string;
  '--heatmap-high': string;
  '--scene-shadow': string;
  '--sky-grid': string;
  '--sky-grid-label': string;
}

export interface ThemeDef {
  id: string;
  name: string;
  builtin: boolean;
  colorScheme: 'dark' | 'light';
  vars: ThemeVars;
  themeStyle?: string;
  css?: string;
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
      { key: '--scene-shadow', label: 'Scene Shadow' },
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
      { key: '--marker-tca', label: 'Marker: TCA' },
      { key: '--apsis-peri', label: 'Apsis: Perigee' },
      { key: '--apsis-apo', label: 'Apsis: Apogee' },
      { key: '--marker-range', label: 'Range Label' },
      { key: '--snap-guide', label: 'Snap Guide' },
    ],
  },
  {
    label: 'Radar',
    vars: [
      { key: '--radar-bg', label: 'Background' },
      { key: '--radar-grid', label: 'Grid' },
      { key: '--radar-blip', label: 'Blip' },
      { key: '--radar-blip-dim', label: 'Blip Dim' },
      { key: '--radar-text', label: 'Text' },
      { key: '--radar-label', label: 'Label' },
      { key: '--radar-sweep', label: 'Sweep' },
    ],
  },
  {
    label: 'Beam & Rotator',
    vars: [
      { key: '--beam-reticle', label: 'Reticle' },
      { key: '--beam-reticle-locked', label: 'Reticle Locked' },
      { key: '--beam-cone', label: 'Cone' },
      { key: '--beam-highlight', label: 'Highlight' },
      { key: '--beam-arc', label: 'Arc' },
      { key: '--rotator', label: 'Rotator' },
    ],
  },
  {
    label: 'Sky Grid',
    vars: [
      { key: '--sky-grid', label: 'Grid' },
      { key: '--sky-grid-label', label: 'Label' },
    ],
  },
  {
    label: 'Heatmap',
    vars: [
      { key: '--heatmap-low', label: 'Low' },
      { key: '--heatmap-mid', label: 'Mid' },
      { key: '--heatmap-high', label: 'High' },
    ],
  },
];

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
