import type { ThemeDef } from './types';

export const THEME_LEGACY: ThemeDef = {
  id: 'legacy',
  name: 'Legacy',
  builtin: true,
  colorScheme: 'light',
  themeStyle: 'legacy',
  css: `/* Win95/98 beveled surfaces */
html[data-theme-style="legacy"] .draggable-window {
  border: none;
  padding: 2px;
  box-shadow:
    inset 1px 1px 0 0 #ffffff,
    inset -1px -1px 0 0 #000000,
    inset 2px 2px 0 0 #dfdfdf,
    inset -2px -2px 0 0 #808080;
}
html[data-theme-style="legacy"] .window-titlebar {
  background: linear-gradient(90deg, #000080, #1084d0);
  border-bottom: none;
  padding: 2px 3px;
}
html[data-theme-style="legacy"] .window-title {
  color: #ffffff;
  font-weight: bold;
  letter-spacing: 0;
  text-transform: none;
  font-size: 12px;
}
html[data-theme-style="legacy"] .window-title .title-icon svg {
  filter: brightness(0) invert(1);
}
html[data-theme-style="legacy"] .window-close,
html[data-theme-style="legacy"] .window-collapse {
  background: #c0c0c0;
  color: #000000;
  width: 16px;
  height: 16px;
  justify-content: center;
  box-shadow:
    inset 1px 1px 0 0 #ffffff,
    inset -1px -1px 0 0 #000000;
}
html[data-theme-style="legacy"] .window-close:hover,
html[data-theme-style="legacy"] .window-collapse:hover { color: #000000; }
html[data-theme-style="legacy"] .window-close:active,
html[data-theme-style="legacy"] .window-collapse:active {
  box-shadow:
    inset 1px 1px 0 0 #000000,
    inset -1px -1px 0 0 #ffffff;
}
/* Titlebar ghost buttons (tabs, mode toggles) */
html[data-theme-style="legacy"] .window-titlebar .btn-ghost {
  color: rgba(255,255,255,0.7);
}
html[data-theme-style="legacy"] .window-titlebar .btn-ghost:hover {
  color: #ffffff;
}
html[data-theme-style="legacy"] .window-titlebar .btn-ghost.active {
  color: #ffffff;
  font-weight: bold;
}
html[data-theme-style="legacy"] .window-footer {
  border-top: none;
  box-shadow: inset 0 1px 0 0 #808080;
}
/* Raised buttons */
html[data-theme-style="legacy"] .btn-default,
html[data-theme-style="legacy"] .btn-danger {
  background: #c0c0c0;
  border: none;
  color: #000000;
  box-shadow:
    inset 1px 1px 0 0 #ffffff,
    inset -1px -1px 0 0 #000000,
    inset 2px 2px 0 0 #dfdfdf,
    inset -2px -2px 0 0 #808080;
}
html[data-theme-style="legacy"] .btn-default:hover,
html[data-theme-style="legacy"] .btn-danger:hover { border: none; color: #000000; }
html[data-theme-style="legacy"] .btn-default:active,
html[data-theme-style="legacy"] .btn-danger:active {
  box-shadow:
    inset 1px 1px 0 0 #000000,
    inset -1px -1px 0 0 #ffffff,
    inset 2px 2px 0 0 #808080,
    inset -2px -2px 0 0 #dfdfdf;
}
html[data-theme-style="legacy"] .btn-default.active {
  box-shadow:
    inset 1px 1px 0 0 #000000,
    inset -1px -1px 0 0 #ffffff;
  color: #000000;
  border: none;
}
html[data-theme-style="legacy"] .btn-ghost { color: #000000; }
html[data-theme-style="legacy"] .btn-ghost:hover { color: #000080; }
/* Sunken inputs */
html[data-theme-style="legacy"] .inp,
html[data-theme-style="legacy"] .sel {
  background: #ffffff;
  border: none;
  color: #000000;
  box-shadow:
    inset 1px 1px 0 0 #808080,
    inset -1px -1px 0 0 #ffffff,
    inset 2px 2px 0 0 #000000,
    inset -2px -2px 0 0 #dfdfdf;
}
html[data-theme-style="legacy"] .inp:hover,
html[data-theme-style="legacy"] .sel:hover,
html[data-theme-style="legacy"] .inp:focus,
html[data-theme-style="legacy"] .sel:focus { border: none; }
html[data-theme-style="legacy"] .inp::placeholder { color: #808080; }
/* Sunken checkboxes */
html[data-theme-style="legacy"] .cb {
  background: #ffffff;
  border: none;
  box-shadow:
    inset 1px 1px 0 0 #808080,
    inset -1px -1px 0 0 #ffffff,
    inset 2px 2px 0 0 #000000,
    inset -2px -2px 0 0 #dfdfdf;
}
html[data-theme-style="legacy"] .cb:hover { border: none; }
html[data-theme-style="legacy"] .cb:checked::after {
  background: none;
  top: 0px;
  left: 3px;
  right: auto;
  bottom: auto;
  width: 4px;
  height: 8px;
  border: solid #000000;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
/* Win95 toolbar */
html[data-theme-style="legacy"] .toolbar-row {
  background: #c0c0c0;
  border: none;
  box-shadow:
    inset 1px 1px 0 0 #ffffff,
    inset -1px -1px 0 0 #000000,
    inset 2px 2px 0 0 #dfdfdf,
    inset -2px -2px 0 0 #808080;
  padding: 3px 4px;
}
html[data-theme-style="legacy"] .toolbar-row .separator {
  background: #808080;
  box-shadow: 1px 0 0 0 #ffffff;
}
html[data-theme-style="legacy"] .toolbar-row .icon-btn {
  color: #000000;
  border: none;
  box-shadow:
    inset 1px 1px 0 0 #ffffff,
    inset -1px -1px 0 0 #000000;
}
html[data-theme-style="legacy"] .toolbar-row .icon-btn:hover {
  color: #000000;
  border: none;
}
html[data-theme-style="legacy"] .toolbar-row .icon-btn:active {
  box-shadow:
    inset 1px 1px 0 0 #000000,
    inset -1px -1px 0 0 #ffffff;
}
html[data-theme-style="legacy"] .toolbar-row .icon-btn.active {
  box-shadow:
    inset 1px 1px 0 0 #000000,
    inset -1px -1px 0 0 #ffffff;
  color: #000000;
}
html[data-theme-style="legacy"] .toolbar-row .icon-btn.active::after {
  display: none;
}
html[data-theme-style="legacy"] .toolbar-row .source-btn {
  color: #000000;
  border: none;
  box-shadow:
    inset 1px 1px 0 0 #ffffff,
    inset -1px -1px 0 0 #000000;
}
html[data-theme-style="legacy"] .toolbar-row .source-btn:hover {
  color: #000000;
  border: none;
}
html[data-theme-style="legacy"] .toolbar-row .source-btn:active {
  box-shadow:
    inset 1px 1px 0 0 #000000,
    inset -1px -1px 0 0 #ffffff;
}
html[data-theme-style="legacy"] .toolbar-row .source-btn.active {
  box-shadow:
    inset 1px 1px 0 0 #000000,
    inset -1px -1px 0 0 #ffffff;
  color: #000000;
}
html[data-theme-style="legacy"] .toolbar-row .source-btn.active::after {
  display: none;
}
/* Win95 sliders — sunken track, raised thumb */
html[data-theme-style="legacy"] .slider {
  background: transparent;
  box-shadow:
    inset 1px 1px 0 0 #808080,
    inset -1px -1px 0 0 #ffffff,
    inset 2px 2px 0 0 #000000,
    inset -2px -2px 0 0 #dfdfdf;
  margin: 6px 0;
}
html[data-theme-style="legacy"] .slider:hover::-webkit-slider-thumb { background: #c0c0c0; }
html[data-theme-style="legacy"] .slider:hover::-moz-range-thumb { background: #c0c0c0; }
/* xs */
html[data-theme-style="legacy"] .slider-xs::-webkit-slider-thumb {
  -webkit-appearance: none; width: 8px; height: 14px; background: #c0c0c0; border: none; cursor: pointer;
  box-shadow: inset 1px 1px 0 0 #ffffff, inset -1px -1px 0 0 #000000;
}
html[data-theme-style="legacy"] .slider-xs::-moz-range-thumb {
  width: 8px; height: 14px; background: #c0c0c0; border: none; border-radius: 0; cursor: pointer;
  box-shadow: inset 1px 1px 0 0 #ffffff, inset -1px -1px 0 0 #000000;
}
/* sm */
html[data-theme-style="legacy"] .slider-sm::-webkit-slider-thumb {
  -webkit-appearance: none; width: 11px; height: 20px; background: #c0c0c0; border: none; cursor: pointer;
  box-shadow: inset 1px 1px 0 0 #ffffff, inset -1px -1px 0 0 #000000, inset 2px 2px 0 0 #dfdfdf, inset -2px -2px 0 0 #808080;
}
html[data-theme-style="legacy"] .slider-sm::-moz-range-thumb {
  width: 11px; height: 20px; background: #c0c0c0; border: none; border-radius: 0; cursor: pointer;
  box-shadow: inset 1px 1px 0 0 #ffffff, inset -1px -1px 0 0 #000000, inset 2px 2px 0 0 #dfdfdf, inset -2px -2px 0 0 #808080;
}
/* md */
html[data-theme-style="legacy"] .slider-md::-webkit-slider-thumb {
  -webkit-appearance: none; width: 14px; height: 24px; background: #c0c0c0; border: none; cursor: pointer;
  box-shadow: inset 1px 1px 0 0 #ffffff, inset -1px -1px 0 0 #000000, inset 2px 2px 0 0 #dfdfdf, inset -2px -2px 0 0 #808080;
}
html[data-theme-style="legacy"] .slider-md::-moz-range-thumb {
  width: 14px; height: 24px; background: #c0c0c0; border: none; border-radius: 0; cursor: pointer;
  box-shadow: inset 1px 1px 0 0 #ffffff, inset -1px -1px 0 0 #000000, inset 2px 2px 0 0 #dfdfdf, inset -2px -2px 0 0 #808080;
}
/* active (all sizes) */
html[data-theme-style="legacy"] .slider::-webkit-slider-thumb:active {
  box-shadow: inset 1px 1px 0 0 #000000, inset -1px -1px 0 0 #ffffff;
}
html[data-theme-style="legacy"] .slider::-moz-range-thumb:active {
  box-shadow: inset 1px 1px 0 0 #000000, inset -1px -1px 0 0 #ffffff;
}
/* Win95 scrollbars */
/* Status labels — plain text, no fancy badges */
html[data-theme-style="legacy"] .sdb-item-status,
html[data-theme-style="legacy"] .sat-status {
  border: none;
  background: none;
  box-shadow: none;
  padding: 0;
  color: #444444;
}
html[data-theme-style="legacy"] .sdb-item-status.alive,
html[data-theme-style="legacy"] .sat-status.alive { color: #008000; }
html[data-theme-style="legacy"] .sdb-item-status.dead,
html[data-theme-style="legacy"] .sat-status.dead { color: #cc0000; }
html[data-theme-style="legacy"] .sdb-item-tle {
  border: none;
  background: none;
  box-shadow: none;
  padding: 0;
  color: #008000;
  font-weight: bold;
}
html[data-theme-style="legacy"] .sdb-item-band {
  background: none;
  box-shadow: none;
  color: #444444;
}
/* Satellite list — sunken white listbox with navy selection */
html[data-theme-style="legacy"] .sdb-list {
  background: #ffffff;
  box-shadow:
    inset 1px 1px 0 0 #808080,
    inset -1px -1px 0 0 #ffffff,
    inset 2px 2px 0 0 #000000,
    inset -2px -2px 0 0 #dfdfdf;
}
html[data-theme-style="legacy"] .sdb-list-item {
  color: #000000;
}
html[data-theme-style="legacy"] .sdb-list-item:hover {
  background: #000080;
  color: #ffffff;
}
html[data-theme-style="legacy"] .sdb-list-item:hover,
html[data-theme-style="legacy"] .sdb-list-item:hover * {
  color: #ffffff;
}
html[data-theme-style="legacy"] .sdb-list-item.active {
  background: #000080;
}
html[data-theme-style="legacy"] .sdb-list-item.active,
html[data-theme-style="legacy"] .sdb-list-item.active * {
  color: #ffffff;
}
/* Passes table — sunken listbox */
html[data-theme-style="legacy"] .table-wrap {
  background: #ffffff;
  border: none;
  box-shadow:
    inset 1px 1px 0 0 #808080,
    inset -1px -1px 0 0 #ffffff,
    inset 2px 2px 0 0 #000000,
    inset -2px -2px 0 0 #dfdfdf;
}
html[data-theme-style="legacy"] .table-header {
  background: #c0c0c0;
  border-bottom: none;
  box-shadow:
    inset 1px 1px 0 0 #ffffff,
    inset -1px -1px 0 0 #000000;
}
html[data-theme-style="legacy"] .pass-row {
  color: #000000;
  border-bottom: none;
}
html[data-theme-style="legacy"] .pass-row.active {
  background: rgba(0,0,128,0.08);
}
html[data-theme-style="legacy"] .pass-row.selected {
  background: #000080;
}
html[data-theme-style="legacy"] .pass-row.selected,
html[data-theme-style="legacy"] .pass-row.selected * {
  color: #ffffff;
}
html[data-theme-style="legacy"] .pass-row:hover,
html[data-theme-style="legacy"] .pass-row.active:hover {
  background: #000080;
}
html[data-theme-style="legacy"] .pass-row:hover,
html[data-theme-style="legacy"] .pass-row:hover * {
  color: #ffffff;
}
/* Theme editor list */
html[data-theme-style="legacy"] .theme-list {
  border: none;
  box-shadow:
    inset 1px 1px 0 0 #808080,
    inset -1px -1px 0 0 #ffffff,
    inset 2px 2px 0 0 #000000,
    inset -2px -2px 0 0 #dfdfdf;
  padding: 2px;
  background: #ffffff;
}
html[data-theme-style="legacy"] .theme-btn {
  color: #000000;
  border: none;
}
html[data-theme-style="legacy"] .theme-btn:hover {
  background: #000080;
  color: #ffffff;
  border: none;
}
html[data-theme-style="legacy"] .theme-row.active .theme-btn {
  background: #000080;
  color: #ffffff;
  border: none;
}
html[data-theme-style="legacy"] .theme-row.active .theme-active-mark {
  color: #ffffff;
}
html[data-theme-style="legacy"] .theme-swatch {
  border-radius: 0;
}
html[data-theme-style="legacy"] .theme-delete {
  color: #000000;
}
html[data-theme-style="legacy"] .theme-delete:hover {
  color: #cc0000;
}
html[data-theme-style="legacy"] .color-swatch {
  border-radius: 0;
  border: none;
  box-shadow:
    inset 1px 1px 0 0 #808080,
    inset -1px -1px 0 0 #ffffff;
}
html[data-theme-style="legacy"] .color-swatch::-webkit-color-swatch-wrapper { border-radius: 0; }
html[data-theme-style="legacy"] .color-swatch::-webkit-color-swatch { border-radius: 0; }
html[data-theme-style="legacy"] .color-swatch::-moz-color-swatch { border-radius: 0; }
html[data-theme-style="legacy"] .color-text {
  background: #ffffff;
  border: none;
  color: #000000;
  box-shadow:
    inset 1px 1px 0 0 #808080,
    inset -1px -1px 0 0 #ffffff,
    inset 2px 2px 0 0 #000000,
    inset -2px -2px 0 0 #dfdfdf;
}
html[data-theme-style="legacy"] .color-text:focus {
  border: none;
  color: #000000;
}
html[data-theme-style="legacy"] .group-header {
  color: #000000;
  border-bottom: 1px solid #808080;
  box-shadow: 0 1px 0 0 #ffffff;
}
html[data-theme-style="legacy"] .group-header:hover {
  color: #000000;
}
html[data-theme-style="legacy"] .action-row {
  border-top: 1px solid #808080;
  box-shadow: 0 -1px 0 0 #ffffff;
}
html[data-theme-style="legacy"] .css-textarea {
  background: #ffffff;
  border: none;
  color: #000000;
  box-shadow:
    inset 1px 1px 0 0 #808080,
    inset -1px -1px 0 0 #ffffff,
    inset 2px 2px 0 0 #000000,
    inset -2px -2px 0 0 #dfdfdf;
}
html[data-theme-style="legacy"] .css-textarea:focus {
  border: none;
  color: #000000;
}
/* Time control window */
html[data-theme-style="legacy"] .tb {
  background: #c0c0c0;
  border: none;
  color: #000000;
  box-shadow:
    inset 1px 1px 0 0 #ffffff,
    inset -1px -1px 0 0 #000000,
    inset 2px 2px 0 0 #dfdfdf,
    inset -2px -2px 0 0 #808080;
}
html[data-theme-style="legacy"] .tb:hover {
  border: none;
  color: #000000;
}
html[data-theme-style="legacy"] .tb:active {
  box-shadow:
    inset 1px 1px 0 0 #000000,
    inset -1px -1px 0 0 #ffffff,
    inset 2px 2px 0 0 #808080,
    inset -2px -2px 0 0 #dfdfdf;
}
html[data-theme-style="legacy"] .now-btn {
  background: #c0c0c0;
  border: none;
  color: #000000;
  box-shadow:
    inset 1px 1px 0 0 #ffffff,
    inset -1px -1px 0 0 #000000,
    inset 2px 2px 0 0 #dfdfdf,
    inset -2px -2px 0 0 #808080;
}
html[data-theme-style="legacy"] .now-btn:hover {
  border: none;
  color: #000000;
}
html[data-theme-style="legacy"] .now-btn:active {
  box-shadow:
    inset 1px 1px 0 0 #000000,
    inset -1px -1px 0 0 #ffffff,
    inset 2px 2px 0 0 #808080,
    inset -2px -2px 0 0 #dfdfdf;
}
html[data-theme-style="legacy"] .nb {
  color: #000000;
}
html[data-theme-style="legacy"] .nb:hover {
  color: #000080;
}
html[data-theme-style="legacy"] .nv-input {
  background: #ffffff;
  border: none;
  color: #000000;
  box-shadow:
    inset 1px 1px 0 0 #808080,
    inset -1px -1px 0 0 #ffffff,
    inset 2px 2px 0 0 #000000,
    inset -2px -2px 0 0 #dfdfdf;
}
html[data-theme-style="legacy"] .scrub-track {
  background: #ffffff;
  border: none;
  box-shadow:
    inset 1px 1px 0 0 #808080,
    inset -1px -1px 0 0 #ffffff,
    inset 2px 2px 0 0 #000000,
    inset -2px -2px 0 0 #dfdfdf;
}
html[data-theme-style="legacy"] .scrub-center-line {
  background: #808080;
}
html[data-theme-style="legacy"] .scrub-fill {
  background: #000080;
  opacity: 0.5;
}
html[data-theme-style="legacy"] .scrub-fill.reverse {
  background: #cc6600;
}
html[data-theme-style="legacy"] .epoch-input {
  background: #ffffff;
  border: none;
  color: #000000;
  box-shadow:
    inset 1px 1px 0 0 #808080,
    inset -1px -1px 0 0 #ffffff,
    inset 2px 2px 0 0 #000000,
    inset -2px -2px 0 0 #dfdfdf;
}
html[data-theme-style="legacy"] .mobile-datetime {
  background: #ffffff;
  border: none;
  color: #000000;
  box-shadow:
    inset 1px 1px 0 0 #808080,
    inset -1px -1px 0 0 #ffffff,
    inset 2px 2px 0 0 #000000,
    inset -2px -2px 0 0 #dfdfdf;
}
html[data-theme-style="legacy"] .mobile-datetime:active {
  border: none;
}
/* Feedback window */
html[data-theme-style="legacy"] .toys-panel {
  background: #ffffff;
  border: none;
  border-radius: 0;
  box-shadow:
    inset 1px 1px 0 0 #808080,
    inset -1px -1px 0 0 #ffffff,
    inset 2px 2px 0 0 #000000,
    inset -2px -2px 0 0 #dfdfdf;
}
/* Feedback intensity bar */
html[data-theme-style="legacy"] .intensity-bar {
  background: #ffffff;
  border: none;
  border-radius: 0;
  box-shadow:
    inset 1px 1px 0 0 #808080,
    inset -1px -1px 0 0 #ffffff,
    inset 2px 2px 0 0 #000000,
    inset -2px -2px 0 0 #dfdfdf;
}
html[data-theme-style="legacy"] .intensity-bar:hover {
  border: none;
}
html[data-theme-style="legacy"] .intensity-bar.active {
  border: none;
}
html[data-theme-style="legacy"] .intensity-fill {
  background: #000080;
  opacity: 0.5;
}
html[data-theme-style="legacy"] .intensity-bar.active .intensity-fill {
  background: #008000;
  opacity: 0.5;
}
html[data-theme-style="legacy"] {
  scrollbar-width: auto;
}
html[data-theme-style="legacy"] ::-webkit-scrollbar {
  width: 16px;
  height: 16px;
}
html[data-theme-style="legacy"] ::-webkit-scrollbar-track {
  background: repeating-conic-gradient(#c0c0c0 0% 25%, #ffffff 0% 50%) 50% / 2px 2px;
}
html[data-theme-style="legacy"] ::-webkit-scrollbar-thumb {
  background: #c0c0c0;
  box-shadow:
    inset 1px 1px 0 0 #ffffff,
    inset -1px -1px 0 0 #000000,
    inset 2px 2px 0 0 #dfdfdf,
    inset -2px -2px 0 0 #808080;
}
html[data-theme-style="legacy"] ::-webkit-scrollbar-thumb:active {
  box-shadow:
    inset 1px 1px 0 0 #808080,
    inset -1px -1px 0 0 #dfdfdf;
}
html[data-theme-style="legacy"] ::-webkit-scrollbar-button {
  background: #c0c0c0;
  box-shadow:
    inset 1px 1px 0 0 #ffffff,
    inset -1px -1px 0 0 #000000;
  display: block;
  height: 16px;
  width: 16px;
}
html[data-theme-style="legacy"] ::-webkit-scrollbar-button:active {
  box-shadow:
    inset 1px 1px 0 0 #000000,
    inset -1px -1px 0 0 #ffffff;
}
html[data-theme-style="legacy"] ::-webkit-scrollbar-corner {
  background: #c0c0c0;
}`,
  vars: {
    '--bg': '#c0c0c0',
    '--ui-bg': '#c0c0c0',
    '--border': '#808080',
    '--border-hover': '#000000',
    '--text': '#000000',
    '--text-dim': '#111111',
    '--text-muted': '#222222',
    '--text-faint': '#444444',
    '--text-ghost': '#555555',
    '--card-bg': 'rgba(192,192,192,0.95)',
    '--modal-bg': '#c0c0c0',
    '--modal-overlay': 'rgba(192,192,192,0.7)',
    '--kbd-bg': '#dfdfdf',
    '--link': '#0000ff',
    '--link-hover': '#000080',
    '--attrib': '#808080',
    '--panel-bg': '#c0c0c0',
    '--tooltip-bg': '#ffffe1',
    '--grid': '#a0a0a0',
    '--grid-subtle': '#b0b0b0',
    '--grid-dim': '#909090',
    '--row-border': 'rgba(0,0,0,0.06)',
    '--row-hover': 'rgba(0,0,128,0.08)',
    '--row-active': 'rgba(0,0,128,0.15)',
    '--row-highlight': 'rgba(0,0,128,0.12)',
    '--danger': '#cc0000',
    '--danger-bright': '#ff0000',
    '--warning': '#cc6600',
    '--warning-bright': '#ff8800',
    '--live': '#008000',
    '--handle-el': '#ff8800',
    '--handle-az': '#0000cc',
    '--handle-hz': '#008000',
    '--handle-hz-active': '#00cc00',
    '--el-low': '#cc0000',
    '--el-mid': '#cc8800',
    '--el-high': '#008000',
    '--mag-day': '#cc8800',
    '--mag-twilight': '#ddaa22',
    '--marker-aos': '#008080',
    '--marker-los': '#808080',
    '--marker-tca': '#800080',
    '--apsis-peri': '#0000cc',
    '--apsis-apo': '#cc6600',
    '--marker-range': '#000000',
    '--accent': '#000080',
    '--scene-text': 'rgba(255,255,255,0.75)',
    '--scene-text-dim': 'rgba(255,255,255,0.45)',
    '--scene-shadow': '#000000',
    '--snap-guide': 'rgba(0,0,128,0.3)',
    '--radar-bg': '#0a100a',
    '--radar-grid': '#1a3a1a',
    '--radar-blip': '#33ff33',
    '--radar-blip-dim': '#1a6a1a',
    '--radar-text': '#22cc22',
    '--radar-label': '#1a5a1a',
    '--radar-sweep': 'rgba(51,255,51,0.06)',
    '--beam-reticle': '#cc8800',
    '--beam-reticle-locked': '#008000',
    '--beam-cone': '#cc8800',
    '--beam-highlight': '#cc8800',
    '--beam-arc': 'rgba(0,0,204,0.3)',
    '--rotator': '#800080',
    '--heatmap-low': '#c0c0c0',
    '--heatmap-mid': '#0000cc',
    '--heatmap-high': '#cc0000',
    '--sky-grid': 'rgba(128,128,128,0.4)',
    '--sky-grid-label': '#333333',
  },
};
