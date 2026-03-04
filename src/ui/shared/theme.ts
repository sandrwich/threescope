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
    radarText: r('--radar-text'), radarLabel: r('--radar-label'), radarSweep: r('--radar-sweep'),
    heatmapLow: r('--heatmap-low'), heatmapMid: r('--heatmap-mid'), heatmapHigh: r('--heatmap-high'),
    beamReticle: r('--beam-reticle'), beamReticleLocked: r('--beam-reticle-locked'),
    beamCone: r('--beam-cone'), beamHighlight: r('--beam-highlight'), beamArc: r('--beam-arc'),
    rotator: r('--rotator'),
    skyGrid: r('--sky-grid'), skyGridLabel: r('--sky-grid-label'),
  };
}

export function refreshTheme() { initTheme(); }

/** Parse a CSS color string (hex, rgb, rgba) into [r, g, b] 0-1 and alpha. */
let _parseCtx: CanvasRenderingContext2D | null = null;
export function parseRgba(css: string): { r: number; g: number; b: number; a: number } {
  const ctx = _parseCtx ??= (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    return c.getContext('2d')!;
  })();
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return { r: r / 255, g: g / 255, b: b / 255, a: a / 255 };
}
