import type { ThemeDef } from './types';

export const THEME_NEON: ThemeDef = {
  id: 'neon',
  name: 'Neon',
  builtin: true,
  colorScheme: 'dark',
  themeStyle: 'neon',
  css: `/* Neon glow windows — spinning pink/cyan border */
@property --neon-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
html[data-theme-style="neon"] .draggable-window {
  border: 2px solid;
  border-image: linear-gradient(
    var(--neon-angle, 0deg),
    #ff00b4, #00ccff, #ff00b4
  ) 1;
  box-shadow:
    0 0 12px rgba(255,0,180,0.35),
    0 0 30px rgba(0,200,255,0.2),
    0 0 60px rgba(255,0,180,0.1),
    inset 0 0 15px rgba(0,200,255,0.05);
  animation: neon-spin 4s linear infinite;
}
html[data-theme-style="neon"] .draggable-window .window-titlebar {
  border-bottom: 1px solid rgba(255,0,180,0.2);
  text-shadow: 0 0 8px rgba(255,0,180,0.7), 0 0 20px rgba(255,0,180,0.3);
}
html[data-theme-style="neon"] .modal-overlay .draggable-window {
  box-shadow:
    0 0 20px rgba(255,0,180,0.5),
    0 0 60px rgba(0,200,255,0.25),
    0 0 100px rgba(255,0,180,0.15),
    inset 0 0 20px rgba(0,200,255,0.06);
}
@keyframes neon-spin {
  to { --neon-angle: 360deg; }
}
/* Neon glowing buttons */
html[data-theme-style="neon"] button {
  transition: text-shadow 0.2s, box-shadow 0.2s;
}
html[data-theme-style="neon"] button:hover {
  text-shadow: 0 0 8px rgba(0,200,255,0.8), 0 0 16px rgba(0,200,255,0.3);
}
/* Neon text glow on all window text */
html[data-theme-style="neon"] .draggable-window {
  text-shadow: 0 0 2px rgba(200,150,255,0.15);
}
/* Neon scrollbar */
html[data-theme-style="neon"] ::-webkit-scrollbar-thumb {
  background: rgba(255,0,180,0.35) !important;
  box-shadow: 0 0 6px rgba(255,0,180,0.4);
}
html[data-theme-style="neon"] ::-webkit-scrollbar-thumb:hover {
  background: rgba(0,200,255,0.45) !important;
  box-shadow: 0 0 8px rgba(0,200,255,0.5);
}
/* Neon inputs */
html[data-theme-style="neon"] input:focus,
html[data-theme-style="neon"] select:focus {
  border-color: rgba(255,0,180,0.6) !important;
  box-shadow: 0 0 8px rgba(255,0,180,0.4), 0 0 16px rgba(255,0,180,0.15);
}
/* Neon checkboxes */
html[data-theme-style="neon"] input[type="checkbox"]:checked {
  box-shadow: 0 0 6px rgba(0,200,255,0.5);
}
/* Neon active row glow */
html[data-theme-style="neon"] .sat-row:hover {
  box-shadow: inset 0 0 20px rgba(0,200,255,0.08);
}
/* Neon range sliders */
html[data-theme-style="neon"] input[type="range"]::-webkit-slider-thumb {
  box-shadow: 0 0 6px rgba(255,0,180,0.6);
}`,
  vars: {
    '--bg': '#06000a',
    '--ui-bg': '#0a0012',
    '--border': '#1a2244',
    '--border-hover': '#00ccff',
    '--text': '#eeddff',
    '--text-dim': '#ccbbee',
    '--text-muted': '#9977bb',
    '--text-faint': '#775599',
    '--text-ghost': '#553377',
    '--card-bg': 'rgba(6,0,10,0.92)',
    '--modal-bg': '#0a0012',
    '--modal-overlay': 'rgba(3,0,6,0.88)',
    '--kbd-bg': '#150022',
    '--link': '#775599',
    '--link-hover': '#00ccff',
    '--attrib': '#44225a',
    '--panel-bg': '#0d0018',
    '--tooltip-bg': '#08000e',
    '--grid': '#1a1844',
    '--grid-subtle': '#0d0e22',
    '--grid-dim': '#2a2055',
    '--row-border': 'rgba(255,0,180,0.04)',
    '--row-hover': 'rgba(0,200,255,0.06)',
    '--row-active': 'rgba(255,0,180,0.10)',
    '--row-highlight': 'rgba(0,200,255,0.08)',
    '--danger': '#ff2266',
    '--danger-bright': '#ff4488',
    '--warning': '#ff8800',
    '--warning-bright': '#ffaa33',
    '--live': '#00ffcc',
    '--handle-el': '#ff6600',
    '--handle-az': '#00ccff',
    '--handle-hz': '#00ff88',
    '--handle-hz-active': '#66ffaa',
    '--el-low': '#ff2266',
    '--el-mid': '#ffcc00',
    '--el-high': '#00ff88',
    '--mag-day': '#ffcc00',
    '--mag-twilight': '#ffdd44',
    '--marker-aos': '#00ffcc',
    '--marker-los': '#553377',
    '--marker-tca': '#ff00b4',
    '--apsis-peri': '#00ccff',
    '--apsis-apo': '#ff6600',
    '--marker-range': '#ccbbee',
    '--accent': '#ff00b4',
    '--scene-text': 'rgba(238,221,255,0.80)',
    '--scene-text-dim': 'rgba(238,221,255,0.50)',
    '--scene-shadow': '#000000',
    '--snap-guide': 'rgba(0,200,255,0.3)',
    '--radar-bg': '#02050a',
    '--radar-grid': '#0a2233',
    '--radar-blip': '#00ccff',
    '--radar-blip-dim': '#006688',
    '--radar-text': '#00aadd',
    '--radar-label': '#005566',
    '--radar-sweep': 'rgba(0,200,255,0.06)',
    '--beam-reticle': '#00ccff',
    '--beam-reticle-locked': '#00ff88',
    '--beam-cone': '#00ccff',
    '--beam-highlight': '#00ccff',
    '--beam-arc': 'rgba(255,0,180,0.4)',
    '--rotator': '#ff00b4',
    '--heatmap-low': '#06000a',
    '--heatmap-mid': '#ff00b4',
    '--heatmap-high': '#00ccff',
    '--sky-grid': 'rgba(0,20,40,0.9)',
    '--sky-grid-label': '#00aacc',
  },
};
