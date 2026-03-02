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
    markerAos: r('--marker-aos'), markerLos: r('--marker-los'), markerTca: r('--marker-tca'),
    apsisPeri: r('--apsis-peri'), apsisApo: r('--apsis-apo'),
    radarBg: r('--radar-bg'), radarGrid: r('--radar-grid'),
    radarBlip: r('--radar-blip'), radarBlipDim: r('--radar-blip-dim'),
    radarText: r('--radar-text'), radarSweep: r('--radar-sweep'),
    heatmapLow: r('--heatmap-low'), heatmapMid: r('--heatmap-mid'), heatmapHigh: r('--heatmap-high'),
    beamReticle: r('--beam-reticle'), beamReticleLocked: r('--beam-reticle-locked'),
    beamCone: r('--beam-cone'), beamHighlight: r('--beam-highlight'), beamArc: r('--beam-arc'),
  };
}

export function refreshTheme() { initTheme(); }
