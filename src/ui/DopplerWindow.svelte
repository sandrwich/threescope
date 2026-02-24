<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { observerStore } from '../stores/observer.svelte';
  import { timeStore } from '../stores/time.svelte';
  import { ICON_DOPPLER } from './shared/icons';
  import { calculateDopplerShift, createSatrec } from '../astro/doppler';
  import { epochToDatetimeStr, epochToDate } from '../astro/epoch';
  import { SAT_COLORS } from '../constants';

  const CANVAS_W = 480;
  const CANVAS_H = 280;
  const G_LEFT = 72;
  const G_TOP = 32;
  const G_RIGHT = 16;
  const G_BOTTOM = 32;

  let baseFreqMhzStr = $state('137.625');
  let baseFreqHz = $derived(parseFloat(baseFreqMhzStr) * 1e6);

  // Export popover
  let exportOpen = $state(false);
  let csvResStr = $state('1');

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let ctx: CanvasRenderingContext2D | null = null;
  let animFrameId = 0;

  // Cache to avoid recomputing every frame
  let cacheKey = '';
  let cachedData: { tSec: number; freq: number; rangeRate: number }[] = [];
  let cachedMinF = 0;
  let cachedMaxF = 0;

  // Hover crosshair
  let hoverX = -1; // CSS-pixel x relative to canvas, -1 = not hovering

  let selectedPass = $derived(
    uiStore.selectedPassIdx >= 0 && uiStore.selectedPassIdx < uiStore.activePassList.length
      ? uiStore.activePassList[uiStore.selectedPassIdx]
      : null
  );

  function recomputeCurve() {
    const pass = selectedPass;
    if (!pass || !baseFreqHz || baseFreqHz <= 0) { cachedData = []; cacheKey = ''; return; }

    const key = `${uiStore.selectedPassIdx}:${pass.satName}:${baseFreqHz}`;
    if (key === cacheKey) return;

    const tle = uiStore.getSatTLE?.(pass.satName);
    if (!tle) { cachedData = []; cacheKey = ''; return; }

    const satrec = createSatrec(tle.line1, tle.line2);
    const obs = observerStore.location;
    const durSec = (pass.losEpoch - pass.aosEpoch) * 86400;
    const graphW = CANVAS_W - G_LEFT - G_RIGHT;
    const n = Math.max(10, graphW);

    const data: { tSec: number; freq: number; rangeRate: number }[] = [];
    let minF = Infinity, maxF = -Infinity;

    for (let k = 0; k <= n; k++) {
      const tSec = (k / n) * durSec;
      const ep = pass.aosEpoch + tSec / 86400;
      const r = calculateDopplerShift(satrec, ep, obs.lat, obs.lon, obs.alt, baseFreqHz);
      if (r) {
        data.push({ tSec, freq: r.frequency, rangeRate: r.rangeRateKmS });
        if (r.frequency < minF) minF = r.frequency;
        if (r.frequency > maxF) maxF = r.frequency;
      }
    }

    const pad = Math.max(1, (maxF - minF) * 0.1);
    cachedData = data;
    cachedMinF = minF - pad;
    cachedMaxF = maxF + pad;
    cacheKey = key;
  }

  function drawFrame() {
    if (!ctx || !canvasEl) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const font = '"Overpass Mono", monospace';
    const pass = selectedPass;

    if (!pass) {
      ctx.fillStyle = '#555';
      ctx.font = `12px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Select a pass to analyze', CANVAS_W / 2, CANVAS_H / 2);
      ctx.restore();
      if (uiStore.dopplerWindowOpen) animFrameId = requestAnimationFrame(drawFrame);
      return;
    }

    recomputeCurve();

    if (cachedData.length === 0) {
      ctx.fillStyle = '#555';
      ctx.font = `12px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Unable to compute Doppler curve', CANVAS_W / 2, CANVAS_H / 2);
      ctx.restore();
      if (uiStore.dopplerWindowOpen) animFrameId = requestAnimationFrame(drawFrame);
      return;
    }

    const gx = G_LEFT;
    const gy = G_TOP;
    const gw = CANVAS_W - G_LEFT - G_RIGHT;
    const gh = CANVAS_H - G_TOP - G_BOTTOM;
    const durSec = (pass.losEpoch - pass.aosEpoch) * 86400;
    const fRange = cachedMaxF - cachedMinF;

    // Graph border
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(gx, gy, gw, gh);

    // Y-axis labels
    ctx.fillStyle = '#777';
    ctx.font = `10px ${font}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(formatFreq(cachedMaxF), gx - 6, gy);
    ctx.textBaseline = 'bottom';
    ctx.fillText(formatFreq(cachedMinF), gx - 6, gy + gh);

    // Midpoint label
    const midF = (cachedMinF + cachedMaxF) / 2;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#444';
    ctx.fillText(formatFreq(midF), gx - 6, gy + gh / 2);

    // Horizontal grid at midpoint
    ctx.strokeStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.moveTo(gx, gy + gh / 2);
    ctx.lineTo(gx + gw, gy + gh / 2);
    ctx.stroke();

    // Base frequency reference line
    if (baseFreqHz > cachedMinF && baseFreqHz < cachedMaxF) {
      const baseY = gy + gh - ((baseFreqHz - cachedMinF) / fRange) * gh;
      ctx.strokeStyle = '#444';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(gx, baseY);
      ctx.lineTo(gx + gw, baseY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#555';
      ctx.font = `9px ${font}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('base', gx + 4, baseY - 2);
    }

    // X-axis labels
    ctx.fillStyle = '#777';
    ctx.font = `10px ${font}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('AOS', gx, gy + gh + 6);
    ctx.textAlign = 'center';
    ctx.fillText(formatDuration(durSec / 2), gx + gw / 2, gy + gh + 6);
    ctx.textAlign = 'right';
    ctx.fillText('LOS', gx + gw, gy + gh + 6);

    // Doppler curve (clipped to graph area)
    ctx.save();
    ctx.beginPath();
    ctx.rect(gx, gy, gw, gh);
    ctx.clip();

    const sc = SAT_COLORS[pass.satColorIndex % SAT_COLORS.length];
    const satColor = `rgb(${sc[0]},${sc[1]},${sc[2]})`;
    ctx.strokeStyle = satColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < cachedData.length; i++) {
      const px = gx + (cachedData[i].tSec / durSec) * gw;
      const py = gy + gh - ((cachedData[i].freq - cachedMinF) / fRange) * gh;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Live time marker during active pass (pulsating)
    const epoch = timeStore.epoch;
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 250);
    if (epoch >= pass.aosEpoch && epoch <= pass.losEpoch) {
      const liveTSec = (epoch - pass.aosEpoch) * 86400;
      const liveX = gx + (liveTSec / durSec) * gw;

      // Vertical line
      ctx.strokeStyle = '#44ff44';
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(liveX, gy);
      ctx.lineTo(liveX, gy + gh);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Dot on the curve — interpolate frequency
      const liveFreq = interpolateFreq(liveTSec);
      if (liveFreq !== null) {
        const liveY = gy + gh - ((liveFreq - cachedMinF) / fRange) * gh;
        ctx.fillStyle = '#44ff44';
        ctx.globalAlpha = 0.6 + pulse * 0.4;
        ctx.beginPath();
        ctx.arc(liveX, liveY, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Hover crosshair
    if (hoverX >= gx && hoverX <= gx + gw) {
      const hoverTSec = ((hoverX - gx) / gw) * durSec;
      const hoverFreq = interpolateFreq(hoverTSec);
      const hoverRR = interpolateRangeRate(hoverTSec);

      if (hoverFreq !== null) {
        const hy = gy + gh - ((hoverFreq - cachedMinF) / fRange) * gh;

        // Crosshair lines
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hoverX, gy);
        ctx.lineTo(hoverX, gy + gh);
        ctx.moveTo(gx, hy);
        ctx.lineTo(gx + gw, hy);
        ctx.stroke();

        // Dot on curve
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(hoverX, hy, 3, 0, 2 * Math.PI);
        ctx.fill();

        // Tooltip
        ctx.font = `9px ${font}`;
        const shift = hoverFreq - baseFreqHz;
        const lines = [
          `T+${formatDuration(hoverTSec)}`,
          formatFreq(hoverFreq),
          `\u0394f ${shift >= 0 ? '+' : ''}${formatFreq(shift)}`,
        ];
        if (hoverRR !== null) lines.push(`${hoverRR >= 0 ? '+' : ''}${hoverRR.toFixed(3)} km/s`);

        const lineH = 12;
        const tipW = Math.max(...lines.map(l => ctx.measureText(l).width)) + 10;
        const tipH = lines.length * lineH + 6;
        // Position tooltip to avoid going off-graph
        let tipX = hoverX + 10;
        let tipY = hy - tipH - 6;
        if (tipX + tipW > gx + gw) tipX = hoverX - tipW - 10;
        if (tipY < gy) tipY = hy + 10;

        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(tipX, tipY, tipW, tipH);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.strokeRect(tipX, tipY, tipW, tipH);
        ctx.fillStyle = '#ccc';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], tipX + 5, tipY + 3 + i * lineH);
        }
      }
    }

    ctx.restore();

    // Pass info in top-left
    ctx.font = `10px ${font}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = satColor;
    ctx.beginPath();
    ctx.arc(gx + 4, 15, 3.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#888';
    ctx.fillText(pass.satName, gx + 12, 10);
    ctx.fillStyle = '#555';
    ctx.fillText(epochToDatetimeStr(pass.aosEpoch), gx + 12 + ctx.measureText(pass.satName + '  ').width, 10);

    // Max shift info in top-right
    if (cachedData.length > 0) {
      const maxShift = Math.max(
        Math.abs(cachedData[0].freq - baseFreqHz),
        Math.abs(cachedData[cachedData.length - 1].freq - baseFreqHz)
      );
      ctx.fillStyle = '#555';
      ctx.textAlign = 'right';
      ctx.fillText(`\u0394f max \u2248 ${formatFreq(maxShift)}`, gx + gw, 10);
    }

    ctx.restore();
    if (uiStore.dopplerWindowOpen) animFrameId = requestAnimationFrame(drawFrame);
  }

  function formatFreq(hz: number): string {
    const abs = Math.abs(hz);
    if (abs >= 1e9) return (hz / 1e9).toFixed(3) + ' GHz';
    if (abs >= 1e6) return (hz / 1e6).toFixed(3) + ' MHz';
    if (abs >= 1e3) return (hz / 1e3).toFixed(1) + ' kHz';
    return hz.toFixed(0) + ' Hz';
  }

  function formatDuration(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /** Linearly interpolate frequency at tSec from cached data. */
  function interpolateFreq(tSec: number): number | null {
    if (cachedData.length === 0) return null;
    if (tSec <= cachedData[0].tSec) return cachedData[0].freq;
    if (tSec >= cachedData[cachedData.length - 1].tSec) return cachedData[cachedData.length - 1].freq;
    for (let i = 1; i < cachedData.length; i++) {
      if (cachedData[i].tSec >= tSec) {
        const t = (tSec - cachedData[i - 1].tSec) / (cachedData[i].tSec - cachedData[i - 1].tSec);
        return cachedData[i - 1].freq + t * (cachedData[i].freq - cachedData[i - 1].freq);
      }
    }
    return null;
  }

  /** Linearly interpolate range rate at tSec from cached data. */
  function interpolateRangeRate(tSec: number): number | null {
    if (cachedData.length === 0) return null;
    if (tSec <= cachedData[0].tSec) return cachedData[0].rangeRate;
    if (tSec >= cachedData[cachedData.length - 1].tSec) return cachedData[cachedData.length - 1].rangeRate;
    for (let i = 1; i < cachedData.length; i++) {
      if (cachedData[i].tSec >= tSec) {
        const t = (tSec - cachedData[i - 1].tSec) / (cachedData[i].tSec - cachedData[i - 1].tSec);
        return cachedData[i - 1].rangeRate + t * (cachedData[i].rangeRate - cachedData[i - 1].rangeRate);
      }
    }
    return null;
  }

  function onCanvasMouseMove(e: MouseEvent) {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    hoverX = e.clientX - rect.left;
  }

  function onCanvasMouseLeave() {
    hoverX = -1;
  }

  function exportCSV() {
    const pass = selectedPass;
    const res = parseFloat(csvResStr);
    if (!pass || !baseFreqHz || baseFreqHz <= 0 || !res || res <= 0) return;

    const tle = uiStore.getSatTLE?.(pass.satName);
    if (!tle) return;

    const satrec = createSatrec(tle.line1, tle.line2);
    const obs = observerStore.location;
    const durSec = (pass.losEpoch - pass.aosEpoch) * 86400;
    const aosUnixMs = epochToDate(pass.aosEpoch).getTime();
    const n = Math.floor(durSec * res);

    let csv = 'UTC,Unix(s),Time(s),Frequency(Hz),DopplerShift(Hz),RangeRate(km/s),Range(km)\n';
    for (let k = 0; k <= n; k++) {
      const tSec = k / res;
      const ep = pass.aosEpoch + tSec / 86400;
      const r = calculateDopplerShift(satrec, ep, obs.lat, obs.lon, obs.alt, baseFreqHz);
      if (r) {
        const unixMs = aosUnixMs + tSec * 1000;
        const utc = new Date(unixMs).toISOString();
        const unix = (unixMs / 1000).toFixed(3);
        const shift = r.frequency - baseFreqHz;
        csv += `${utc},${unix},${tSec.toFixed(3)},${r.frequency.toFixed(3)},${shift.toFixed(3)},${r.rangeRateKmS.toFixed(6)},${r.rangeKm.toFixed(3)}\n`;
      }
    }

    // Generate filename: doppler_NOAA-18_2026-02-23_2118-2133_137.625MHz.csv
    const d = epochToDate(pass.aosEpoch);
    const pad = (n: number) => String(n).padStart(2, '0');
    const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const dLos = epochToDate(pass.losEpoch);
    const timeRange = `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}-${pad(dLos.getUTCHours())}${pad(dLos.getUTCMinutes())}`;
    const freqLabel = baseFreqHz >= 1e6 ? `${(baseFreqHz / 1e6).toFixed(3)}MHz` : `${(baseFreqHz / 1e3).toFixed(1)}kHz`;
    const safeName = pass.satName.replace(/[^a-zA-Z0-9]/g, '-');
    const filename = `doppler_${safeName}_${date}_${timeRange}_${freqLabel}.csv`;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
    exportOpen = false;
  }

  function initCanvas() {
    if (!canvasEl) return;
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = CANVAS_W * dpr;
    canvasEl.height = CANVAS_H * dpr;
    canvasEl.style.width = CANVAS_W + 'px';
    canvasEl.style.height = CANVAS_H + 'px';
    ctx = canvasEl.getContext('2d');
  }

  // Invalidate cache when frequency input changes
  $effect(() => {
    void baseFreqMhzStr;
    cacheKey = '';
  });

  $effect(() => {
    if (canvasEl) {
      initCanvas();
      animFrameId = requestAnimationFrame(drawFrame);
      return () => cancelAnimationFrame(animFrameId);
    }
  });
</script>

{#snippet dopplerIcon()}<span class="title-icon">{@html ICON_DOPPLER}</span>{/snippet}
<DraggableWindow id="doppler" title="Doppler Shift" icon={dopplerIcon} bind:open={uiStore.dopplerWindowOpen} initialX={200} initialY={150}>
  <div class="dw">
    <div class="controls">
      <label>
        <span class="lbl">Freq</span>
        <input type="text" bind:value={baseFreqMhzStr} class="inp freq" />
        <span class="unit">MHz</span>
      </label>
      <div class="export-wrap">
        <button class="export-btn" onclick={() => exportOpen = !exportOpen}>Export CSV</button>
        {#if exportOpen}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="export-backdrop" onclick={() => exportOpen = false}></div>
          <div class="export-popover">
            <label>
              <span class="lbl">Resolution</span>
              <input type="text" bind:value={csvResStr} class="inp res" />
              <span class="unit">samples/s</span>
            </label>
            <button class="download-btn" onclick={exportCSV}>Download</button>
          </div>
        {/if}
      </div>
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <canvas bind:this={canvasEl} onmousemove={onCanvasMouseMove} onmouseleave={onCanvasMouseLeave}></canvas>
  </div>
</DraggableWindow>

<style>
  .dw { min-width: 480px; }
  .dw canvas { display: block; }
  .controls {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }
  .controls label {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .lbl {
    font-size: 10px;
    color: var(--text-ghost);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }
  .unit {
    font-size: 10px;
    color: var(--text-ghost);
  }
  .inp {
    background: var(--ui-bg);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 11px;
    font-family: inherit;
    padding: 3px 6px;
  }
  .inp.freq { width: 72px; }
  .inp.res { width: 40px; }
  .export-wrap {
    margin-left: auto;
    position: relative;
  }
  .export-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-size: 11px;
    font-family: inherit;
    padding: 3px 10px;
    cursor: pointer;
    white-space: nowrap;
  }
  .export-btn:hover { color: var(--text); }
  .export-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
  }
  .export-popover {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    background: var(--panel-bg, #1a1a1a);
    border: 1px solid var(--border);
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    z-index: 11;
    white-space: nowrap;
  }
  .download-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-size: 11px;
    font-family: inherit;
    padding: 3px 10px;
    cursor: pointer;
  }
  .download-btn:hover { color: var(--text); }
</style>
