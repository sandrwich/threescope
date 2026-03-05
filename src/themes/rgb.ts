import type { ThemeDef } from './types';

export const THEME_RGB: ThemeDef = {
  id: 'ggez',
  name: 'GGEZ',
  builtin: true,
  colorScheme: 'dark',
  themeStyle: 'rgb',
  css: `/* Single root animation drives all rainbow effects */
@property --rgb-angle {
  syntax: '<angle>';
  inherits: true;
  initial-value: 0deg;
}
html[data-theme-style="rgb"] {
  --accent: hsl(var(--rgb-angle) 100% 55%) !important;
  animation: rgb-rotate 4s linear infinite;
}
@keyframes rgb-rotate {
  to { --rgb-angle: 360deg; }
}
/* Rainbow gradient borders on windows */
html[data-theme-style="rgb"] .draggable-window {
  border: 2px solid;
  border-image: conic-gradient(
    from var(--rgb-angle, 0deg),
    #ff0000, #ff8800, #ffff00, #00ff00,
    #0088ff, #8800ff, #ff0088, #ff0000
  ) 1;
  box-shadow: 0 0 12px rgba(100,0,255,0.15), 0 0 30px rgba(0,100,255,0.08);
}
html[data-theme-style="rgb"] .draggable-window .window-titlebar {
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
html[data-theme-style="rgb"] .modal-overlay .draggable-window {
  box-shadow: 0 0 20px rgba(100,0,255,0.25), 0 0 50px rgba(0,100,255,0.12);
}
/* Rainbow border on active theme row */
html[data-theme-style="rgb"] .theme-row.active .theme-btn {
  border: 2px solid;
  border-image: conic-gradient(
    from var(--rgb-angle, 0deg),
    #ff0000, #ff8800, #ffff00, #00ff00,
    #0088ff, #8800ff, #ff0088, #ff0000
  ) 1;
}`,
  vars: {
    '--bg': '#050505',
    '--ui-bg': '#0a0a0a',
    '--border': '#222222',
    '--border-hover': '#ffffff',
    '--text': '#ffffff',
    '--text-dim': '#eeeeee',
    '--text-muted': '#bbbbbb',
    '--text-faint': '#888888',
    '--text-ghost': '#555555',
    '--card-bg': 'rgba(0,0,0,0.90)',
    '--modal-bg': '#0a0a0a',
    '--modal-overlay': 'rgba(0,0,0,0.85)',
    '--kbd-bg': '#1a1a1a',
    '--link': '#666666',
    '--link-hover': '#00ffff',
    '--attrib': '#444444',
    '--panel-bg': '#111111',
    '--tooltip-bg': '#0a0a0a',
    '--grid': '#222222',
    '--grid-subtle': '#111111',
    '--grid-dim': '#333333',
    '--row-border': 'rgba(255,255,255,0.02)',
    '--row-hover': 'rgba(255,255,255,0.04)',
    '--row-active': 'rgba(255,255,255,0.07)',
    '--row-highlight': 'rgba(255,255,255,0.06)',
    '--danger': '#ff2255',
    '--danger-bright': '#ff4477',
    '--warning': '#ff8800',
    '--warning-bright': '#ffaa33',
    '--live': '#00ff66',
    '--handle-el': '#ff6600',
    '--handle-az': '#00ccff',
    '--handle-hz': '#00ff66',
    '--handle-hz-active': '#66ff99',
    '--el-low': '#ff2255',
    '--el-mid': '#ffcc00',
    '--el-high': '#00ff66',
    '--mag-day': '#ffcc00',
    '--mag-twilight': '#ffdd44',
    '--marker-aos': '#00ffcc',
    '--marker-los': '#666666',
    '--marker-tca': '#ff44cc',
    '--apsis-peri': '#4488ff',
    '--apsis-apo': '#ff8800',
    '--marker-range': '#eeeeee',
    '--accent': '#00ffff',
    '--scene-text': 'rgba(255,255,255,0.80)',
    '--scene-text-dim': 'rgba(255,255,255,0.50)',
    '--scene-shadow': '#000000',
    '--snap-guide': 'rgba(0,255,255,0.3)',
    '--radar-bg': '#050505',
    '--radar-grid': '#0a3a0a',
    '--radar-blip': '#00ff66',
    '--radar-blip-dim': '#007733',
    '--radar-text': '#00cc44',
    '--radar-label': '#006622',
    '--radar-sweep': 'rgba(0,255,102,0.06)',
    '--beam-reticle': '#ffcc00',
    '--beam-reticle-locked': '#00ff66',
    '--beam-cone': '#ffcc00',
    '--beam-highlight': '#ffcc00',
    '--beam-arc': 'rgba(0,200,255,0.4)',
    '--rotator': '#ff44cc',
    '--heatmap-low': '#000030',
    '--heatmap-mid': '#0088ff',
    '--heatmap-high': '#ffff00',
    '--sky-grid': 'rgba(10,58,10,0.9)',
    '--sky-grid-label': '#00cc44',
  },
};
