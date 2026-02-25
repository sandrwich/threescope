<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import Select from './shared/Select.svelte';
  import Button from './shared/Button.svelte';
  import Input from './shared/Input.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { observerStore } from '../stores/observer.svelte';
  import { timeStore } from '../stores/time.svelte';
  import { ICON_DOPPLER } from './shared/icons';
  import { calculateDopplerShift, createSatrec } from '../astro/doppler';
  import { epochToDatetimeStr, epochToDate } from '../astro/epoch';
  import { SAT_COLORS } from '../constants';
  import { palette } from './shared/theme';
  import { getTransmitters, type SatnogsTransmitter } from '../data/satnogs';
  import { formatFreqHz } from '../format';
  import { initHiDPICanvas } from './shared/canvas';

  const CANVAS_W = 380;
  const CANVAS_H = 200;
  const G_LEFT = 80;
  const G_TOP = 24;
  const G_RIGHT = 12;
  const G_BOTTOM = 24;

  function freqToMhzStr(hz: number): string {
    const mhz = hz / 1e6;
    return mhz % 1 === 0 ? String(mhz) : mhz.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  }

  let baseFreqMhzStr = $state('137.625');
  let baseFreqHz = $derived(parseFloat(baseFreqMhzStr) * 1e6);
  let txList = $state<SatnogsTransmitter[]>([]);
  let selectedTxIdx = $state<number | null>(null); // null = custom

  function onTxSelect(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    if (val === 'custom') {
      selectedTxIdx = null;
    } else {
      const idx = Number(val);
      selectedTxIdx = idx;
      baseFreqMhzStr = freqToMhzStr(txList[idx].frequencyHz);
      cacheKey = '';
    }
  }

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

    const key = `${uiStore.selectedPassIdx}:${pass.satNoradId}:${baseFreqHz}`;
    if (key === cacheKey) return;

    const tle = uiStore.getSatTLE?.(pass.satNoradId);
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
      ctx.fillStyle = palette.textGhost;
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
      ctx.fillStyle = palette.textGhost;
      ctx.font = `12px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const msg = (!baseFreqHz || baseFreqHz <= 0) ? 'Enter a base frequency' : 'Unable to compute Doppler curve';
      ctx.fillText(msg, CANVAS_W / 2, CANVAS_H / 2);
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
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    ctx.strokeRect(gx, gy, gw, gh);

    // Y-axis labels
    ctx.fillStyle = palette.textFaint;
    ctx.font = `10px ${font}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(formatFreq(cachedMaxF), gx - 6, gy);
    ctx.textBaseline = 'bottom';
    ctx.fillText(formatFreq(cachedMinF), gx - 6, gy + gh);

    // Midpoint label
    const midF = (cachedMinF + cachedMaxF) / 2;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = palette.gridDim;
    ctx.fillText(formatFreq(midF), gx - 6, gy + gh / 2);

    // Horizontal grid at midpoint
    ctx.strokeStyle = palette.gridSubtle;
    ctx.beginPath();
    ctx.moveTo(gx, gy + gh / 2);
    ctx.lineTo(gx + gw, gy + gh / 2);
    ctx.stroke();

    // Base frequency reference line
    if (baseFreqHz > cachedMinF && baseFreqHz < cachedMaxF) {
      const baseY = gy + gh - ((baseFreqHz - cachedMinF) / fRange) * gh;
      ctx.strokeStyle = palette.gridDim;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(gx, baseY);
      ctx.lineTo(gx + gw, baseY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = palette.textGhost;
      ctx.font = `9px ${font}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('base', gx + 4, baseY - 2);
    }

    // X-axis labels
    ctx.fillStyle = palette.textFaint;
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
      ctx.strokeStyle = palette.live;
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
        ctx.fillStyle = palette.live;
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
        ctx.fillStyle = palette.text;
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

        ctx.fillStyle = palette.cardBg;
        ctx.fillRect(tipX, tipY, tipW, tipH);
        ctx.strokeStyle = palette.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(tipX, tipY, tipW, tipH);
        ctx.fillStyle = palette.textDim;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], tipX + 5, tipY + 3 + i * lineH);
        }
      }
    }

    ctx.restore();

    // Pass info — top-left: name, top-right: date + delta-f
    ctx.font = `10px ${font}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = satColor;
    ctx.beginPath();
    ctx.arc(gx + 4, 8, 3.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = palette.textMuted;
    ctx.fillText(pass.satName, gx + 12, 3);
    ctx.fillStyle = palette.textGhost;
    ctx.font = `9px ${font}`;
    ctx.fillText(epochToDatetimeStr(pass.aosEpoch), gx + 12, 14);

    // Max shift info in top-right
    if (cachedData.length > 0) {
      const maxShift = Math.max(
        Math.abs(cachedData[0].freq - baseFreqHz),
        Math.abs(cachedData[cachedData.length - 1].freq - baseFreqHz)
      );
      ctx.fillStyle = palette.textGhost;
      ctx.font = `9px ${font}`;
      ctx.textAlign = 'right';
      ctx.fillText(`\u0394f max \u2248 ${formatFreq(maxShift)}`, gx + gw, 14);
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

  // ── Time scrubbing via pointer interaction on the chart ──

  let scrubbing = false;

  function xToEpoch(cssX: number): number | null {
    const pass = selectedPass;
    if (!pass) return null;
    const gx = G_LEFT;
    const gw = CANVAS_W - G_LEFT - G_RIGHT;
    const scaleX = CANVAS_W / (canvasEl?.getBoundingClientRect().width ?? CANVAS_W);
    const lx = cssX * scaleX;
    const t = Math.max(0, Math.min(1, (lx - gx) / gw));
    return pass.aosEpoch + t * (pass.losEpoch - pass.aosEpoch);
  }

  function onCanvasPointerDown(e: PointerEvent) {
    if (e.button !== 0 || !selectedPass || cachedData.length === 0) return;
    const rect = canvasEl!.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const scaleX = CANVAS_W / rect.width;
    const lx = cssX * scaleX;
    // Only start scrubbing if clicking within the graph area
    if (lx < G_LEFT || lx > CANVAS_W - G_RIGHT) return;
    scrubbing = true;
    canvasEl!.setPointerCapture(e.pointerId);
    const ep = xToEpoch(cssX);
    if (ep !== null) {
      timeStore.epoch = ep;
      timeStore.paused = true;
    }
    e.preventDefault();
  }

  function onCanvasPointerMove(e: PointerEvent) {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    if (scrubbing) {
      const ep = xToEpoch(cssX);
      if (ep !== null) timeStore.epoch = ep;
    }
    hoverX = cssX;
    // Cursor feedback
    const scaleX = CANVAS_W / rect.width;
    const lx = cssX * scaleX;
    canvasEl.style.cursor = (selectedPass && cachedData.length > 0 && lx >= G_LEFT && lx <= CANVAS_W - G_RIGHT) ? 'grab' : '';
  }

  function onCanvasPointerUp() {
    scrubbing = false;
  }

  function onCanvasPointerLeave() {
    hoverX = -1;
  }

  function exportCSV() {
    const pass = selectedPass;
    const res = parseFloat(csvResStr);
    if (!pass || !baseFreqHz || baseFreqHz <= 0 || !res || res <= 0) return;

    const tle = uiStore.getSatTLE?.(pass.satNoradId);
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
    ctx = initHiDPICanvas(canvasEl, CANVAS_W, CANVAS_H);
  }

  // Invalidate cache when frequency input changes
  $effect(() => {
    void baseFreqMhzStr;
    cacheKey = '';
  });

  // Reset prefill + cache when window opens/focuses so pass is always re-evaluated
  $effect(() => {
    void uiStore.dopplerWindowFocus;
    if (uiStore.dopplerWindowOpen) {
      prevPrefillKey = '';
      cacheKey = '';
    }
  });

  // Auto-prefill frequency from bundled SatNOGS data when pass changes
  let prevPrefillKey = '';
  $effect(() => {
    const pass = selectedPass;
    if (!pass) return;
    const key = `${pass.satNoradId}:${pass.aosEpoch}`;
    if (key === prevPrefillKey) return;
    prevPrefillKey = key;

    const transmitters = getTransmitters(pass.satNoradId);
    txList = transmitters;
    if (transmitters.length) {
      selectedTxIdx = 0;
      baseFreqMhzStr = freqToMhzStr(transmitters[0].frequencyHz);
      cacheKey = '';
    } else {
      selectedTxIdx = null;
      baseFreqMhzStr = '';
      cacheKey = '';
    }
  });

  // Manual prefill from SatDatabaseWindow "Use" button
  $effect(() => {
    if (uiStore.dopplerPrefillHz > 0) {
      const hz = uiStore.dopplerPrefillHz;
      baseFreqMhzStr = freqToMhzStr(hz);
      // Try to match to a transmitter in the current list
      const matchIdx = txList.findIndex(tx => tx.frequencyHz === hz);
      selectedTxIdx = matchIdx >= 0 ? matchIdx : null;
      cacheKey = '';
      uiStore.dopplerPrefillHz = 0;
    }
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
<DraggableWindow id="doppler" title="Doppler Shift" icon={dopplerIcon} bind:open={uiStore.dopplerWindowOpen} focus={uiStore.dopplerWindowFocus} initialX={200} initialY={150}>
  <div class="dw">
    <div class="controls">
      <div class="freq-row">
        <span class="lbl">Freq</span>
        {#if txList.length > 0}
          <Select class="tx-select" value={String(selectedTxIdx ?? 'custom')} onchange={onTxSelect}>
            {#each txList as tx, i}
              <option value={String(i)}>{formatFreqHz(tx.frequencyHz)} — {tx.description}{tx.mode ? ` (${tx.mode})` : ''}</option>
            {/each}
            <option value="custom">Custom</option>
          </Select>
        {/if}
        {#if selectedTxIdx === null}
          <Input class="dw-freq" type="text" bind:value={baseFreqMhzStr} />
        {/if}
        <span class="unit">MHz</span>
      </div>
      <div class="export-wrap">
        <Button onclick={() => exportOpen = !exportOpen}>Export CSV</Button>
        {#if exportOpen}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="export-backdrop" onclick={() => exportOpen = false}></div>
          <div class="export-popover">
            <label>
              <span class="lbl">Resolution</span>
              <Input class="dw-res" type="text" bind:value={csvResStr} />
              <span class="unit">samples/s</span>
            </label>
            <Button onclick={exportCSV}>Download</Button>
          </div>
        {/if}
      </div>
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <canvas
      bind:this={canvasEl}
      onpointerdown={onCanvasPointerDown}
      onpointermove={onCanvasPointerMove}
      onpointerup={onCanvasPointerUp}
      onpointerleave={onCanvasPointerLeave}
    ></canvas>
  </div>
</DraggableWindow>

<style>
  .dw { min-width: 380px; }
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
  .freq-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  :global(.tx-select) { max-width: 160px; text-overflow: ellipsis; }
  :global(.dw-freq) { width: 72px; }
  :global(.dw-res) { width: 40px; }
  .export-wrap {
    margin-left: auto;
    position: relative;
  }
  .export-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
  }
  .export-popover {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    background: var(--panel-bg);
    border: 1px solid var(--border);
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    z-index: 11;
    white-space: nowrap;
  }
</style>
