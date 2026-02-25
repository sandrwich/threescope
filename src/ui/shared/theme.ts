/**
 * Cached CSS custom property palette for canvas rendering code.
 * Reads :root variables once at init; call refreshTheme() to re-read.
 */

export let palette: Record<string, string> = {};

export function initTheme() {
  const r = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  palette = {
    bg: r('--bg'),
    text: r('--text'), textDim: r('--text-dim'), textMuted: r('--text-muted'),
    textFaint: r('--text-faint'), textGhost: r('--text-ghost'),
    grid: r('--grid'), gridSubtle: r('--grid-subtle'), gridDim: r('--grid-dim'),
    cardBg: r('--card-bg'), tooltipBg: r('--tooltip-bg'), border: r('--border'),
    danger: r('--danger'), dangerBright: r('--danger-bright'),
    warning: r('--warning'), warningBright: r('--warning-bright'),
    live: r('--live'),
    handleEl: r('--handle-el'), handleAz: r('--handle-az'),
    handleHz: r('--handle-hz'), handleHzActive: r('--handle-hz-active'),
    elLow: r('--el-low'), elMid: r('--el-mid'), elHigh: r('--el-high'),
    magDay: r('--mag-day'), magTwilight: r('--mag-twilight'),
    markerAos: r('--marker-aos'), markerLos: r('--marker-los'),
    apsisPeri: r('--apsis-peri'), apsisApo: r('--apsis-apo'),
  };
}

export function refreshTheme() { initTheme(); }
