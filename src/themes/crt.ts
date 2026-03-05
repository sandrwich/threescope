import type { ThemeDef } from './types';

export const THEME_CRT: ThemeDef = {
  id: 'crt',
  name: 'CRT',
  builtin: true,
  colorScheme: 'dark',
  themeStyle: 'crt',
  css: `/* CRT scanlines overlay on windows */
html[data-theme-style="crt"] .draggable-window::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    0deg,
    transparent 0px,
    transparent 2px,
    rgba(0,0,0,0.15) 2px,
    rgba(0,0,0,0.15) 4px
  );
  z-index: 100;
  border-radius: inherit;
}
/* Phosphor text glow */
html[data-theme-style="crt"] .draggable-window {
  text-shadow: 0 0 4px rgba(50,255,100,0.3);
  border: 1px solid rgba(50,255,100,0.2);
  box-shadow:
    0 0 8px rgba(50,255,100,0.1),
    inset 0 0 40px rgba(0,0,0,0.3);
  border-radius: 3px;
}
html[data-theme-style="crt"] .draggable-window .window-titlebar {
  border-bottom: 1px solid rgba(50,255,100,0.1);
  text-shadow: 0 0 6px rgba(50,255,100,0.5), 0 0 12px rgba(50,255,100,0.2);
}
/* Vignette on windows */
html[data-theme-style="crt"] .draggable-window::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.4) 100%);
  z-index: 99;
  border-radius: inherit;
}
/* Modal glow */
html[data-theme-style="crt"] .modal-overlay .draggable-window {
  box-shadow:
    0 0 15px rgba(50,255,100,0.15),
    inset 0 0 50px rgba(0,0,0,0.3);
}
/* Subtle flicker */
html[data-theme-style="crt"] .draggable-window {
  animation: crt-flicker 0.1s infinite;
}
@keyframes crt-flicker {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.985; }
}
/* Phosphor glow on buttons */
html[data-theme-style="crt"] button:hover {
  text-shadow: 0 0 6px rgba(50,255,100,0.6), 0 0 12px rgba(50,255,100,0.2);
}
/* Glowing scrollbar */
html[data-theme-style="crt"] ::-webkit-scrollbar-thumb {
  background: rgba(50,255,100,0.2) !important;
  box-shadow: 0 0 4px rgba(50,255,100,0.2);
}
html[data-theme-style="crt"] ::-webkit-scrollbar-thumb:hover {
  background: rgba(50,255,100,0.3) !important;
}
/* Glowing inputs */
html[data-theme-style="crt"] input:focus,
html[data-theme-style="crt"] select:focus {
  border-color: rgba(50,255,100,0.4) !important;
  box-shadow: 0 0 6px rgba(50,255,100,0.2);
}`,
  vars: {
    '--bg': '#020a02',
    '--ui-bg': '#051005',
    '--border': '#0e2a0e',
    '--border-hover': '#33cc55',
    '--text': '#44dd66',
    '--text-dim': '#33cc55',
    '--text-muted': '#22aa44',
    '--text-faint': '#188833',
    '--text-ghost': '#0e5520',
    '--card-bg': 'rgba(2,10,2,0.92)',
    '--modal-bg': '#051005',
    '--modal-overlay': 'rgba(0,4,0,0.88)',
    '--kbd-bg': '#081808',
    '--link': '#188833',
    '--link-hover': '#44dd66',
    '--attrib': '#0e5520',
    '--panel-bg': '#061206',
    '--tooltip-bg': '#030c03',
    '--grid': '#0e2a0e',
    '--grid-subtle': '#081808',
    '--grid-dim': '#144014',
    '--row-border': 'rgba(50,255,100,0.04)',
    '--row-hover': 'rgba(50,255,100,0.06)',
    '--row-active': 'rgba(50,255,100,0.10)',
    '--row-highlight': 'rgba(50,255,100,0.08)',
    '--danger': '#cc4433',
    '--danger-bright': '#ee5544',
    '--warning': '#ccaa22',
    '--warning-bright': '#ddcc44',
    '--live': '#44dd66',
    '--handle-el': '#ccaa22',
    '--handle-az': '#33cc55',
    '--handle-hz': '#44dd66',
    '--handle-hz-active': '#66ee88',
    '--el-low': '#cc4433',
    '--el-mid': '#ccaa22',
    '--el-high': '#44dd66',
    '--mag-day': '#ccaa22',
    '--mag-twilight': '#ddcc44',
    '--marker-aos': '#33cc55',
    '--marker-los': '#0e5520',
    '--marker-tca': '#ccaa22',
    '--apsis-peri': '#22aa88',
    '--apsis-apo': '#ccaa22',
    '--marker-range': '#33cc55',
    '--accent': '#44dd66',
    '--scene-text': 'rgba(68,221,102,0.80)',
    '--scene-text-dim': 'rgba(68,221,102,0.50)',
    '--scene-shadow': '#000000',
    '--snap-guide': 'rgba(50,255,100,0.3)',
    '--radar-bg': '#010801',
    '--radar-grid': '#0a2a0a',
    '--radar-blip': '#44dd66',
    '--radar-blip-dim': '#1a6a2a',
    '--radar-text': '#33bb55',
    '--radar-label': '#0e5520',
    '--radar-sweep': 'rgba(50,255,100,0.06)',
    '--beam-reticle': '#ccaa22',
    '--beam-reticle-locked': '#44dd66',
    '--beam-cone': '#ccaa22',
    '--beam-highlight': '#ccaa22',
    '--beam-arc': 'rgba(50,200,100,0.4)',
    '--rotator': '#33cc55',
    '--heatmap-low': '#020a02',
    '--heatmap-mid': '#22aa44',
    '--heatmap-high': '#ccaa22',
    '--sky-grid': 'rgba(10,40,10,0.9)',
    '--sky-grid-label': '#33bb55',
  },
};
