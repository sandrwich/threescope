<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import MobileSheet from './shared/MobileSheet.svelte';
  import Select from './shared/Select.svelte';
  import Button from './shared/Button.svelte';
  import Input from './shared/Input.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { observerStore } from '../stores/observer.svelte';
  import { timeStore } from '../stores/time.svelte';
  import { ICON_DOPPLER } from './shared/icons';
  import { fmtDurationClock, formatDatetimeTz, formatFileDateTz } from '../format';
  import { settingsStore } from '../stores/settings.svelte';
  import { calculateDopplerShift, createSatrec } from '../astro/doppler';
  import { epochToUnix, epochToDate } from '../astro/epoch';
  import { satColorCss } from '../constants';
  import { palette } from './shared/theme';
  import { getTransmitters, type SatnogsTransmitter } from '../data/satnogs';
  import { formatFreqHz } from '../format';
  import { initHiDPICanvas } from './shared/canvas';
  import { chart } from './shared/touch-metrics';
  import { rigStore } from '../stores/rig.svelte';
  import { BAUD_RATES } from '../serial/transport';
  import { RADIO_MODES, satnogsModeToRadio, type RigSerialProtocol } from '../rig/protocol';
  import Checkbox from './shared/Checkbox.svelte';
  import Slider from './shared/Slider.svelte';
  import InfoTip from './shared/InfoTip.svelte';
  import ProtocolConsole from './shared/ProtocolConsole.svelte';

  let tab = $state<'chart' | 'setup' | 'console'>('chart');
  let bridgeTool = $state<'websockify' | 'websocat'>('websockify');

  const CANVAS_W = 400;
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
  let satnogsModeName = $state(''); // raw SatNOGS mode for display

  function applyTxMode(mode: string | null) {
    satnogsModeName = mode ?? '';
    const radioMode = satnogsModeToRadio(mode);
    rigStore.setRadioMode(radioMode);
  }

  function onTxSelect(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    if (val === 'custom') {
      selectedTxIdx = null;
    } else {
      const idx = Number(val);
      selectedTxIdx = idx;
      baseFreqMhzStr = freqToMhzStr(txList[idx].frequencyHz);
      cacheKey = '';
      applyTxMode(txList[idx].mode);
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

  // Auto-select next upcoming pass when window opens with none selected
  $effect(() => {
    if (!uiStore.dopplerWindowOpen) return;
    if (uiStore.selectedPassIdx >= 0) return;
    const passes = uiStore.activePassList;
    if (passes.length === 0) return;
    const epoch = timeStore.epoch;
    // Prefer active pass, then next upcoming
    for (let i = 0; i < passes.length; i++) {
      if (epoch >= passes[i].aosEpoch && epoch <= passes[i].losEpoch) {
        uiStore.selectedPassIdx = i;
        return;
      }
    }
    for (let i = 0; i < passes.length; i++) {
      if (passes[i].aosEpoch > epoch) {
        uiStore.selectedPassIdx = i;
        return;
      }
    }
    // Fallback: first pass
    uiStore.selectedPassIdx = 0;
  });

  function recomputeCurve() {
    const pass = selectedPass;
    if (!pass || !baseFreqHz || baseFreqHz <= 0) { cachedData = []; cacheKey = ''; return; }

    const key = `${uiStore.selectedPassIdx}:${pass.satNoradId}:${baseFreqHz}`;
    if (key === cacheKey) return;

    const tle = uiStore.getSatTLE?.(pass.satNoradId);
    if (!tle) { cachedData = []; cacheKey = ''; return; }

    const satrec = createSatrec(tle.line1, tle.line2, tle.omm);
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

    const satColor = satColorCss(pass.satColorIndex);
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
        ctx.arc(liveX, liveY, chart.dot, 0, 2 * Math.PI);
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
        ctx.arc(hoverX, hy, chart.dotSmall, 0, 2 * Math.PI);
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
    ctx.arc(gx + 4, 8, chart.dotSmall, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = palette.textMuted;
    ctx.fillText(pass.satName, gx + 12, 3);
    ctx.fillStyle = palette.textGhost;
    ctx.font = `9px ${font}`;
    ctx.fillText(formatDatetimeTz(epochToUnix(pass.aosEpoch), settingsStore.timezone) + ' ' + settingsStore.timezoneAbbr, gx + 12, 14);

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

  const formatDuration = fmtDurationClock;

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

  function scrubFromEvent(e: PointerEvent) {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const ep = xToEpoch(cssX);
    if (ep !== null) timeStore.epoch = ep;
  }

  function onWindowPointerMove(e: PointerEvent) {
    e.preventDefault();
    scrubFromEvent(e);
  }

  function onWindowPointerUp() {
    scrubbing = false;
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerUp);
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
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    const ep = xToEpoch(cssX);
    if (ep !== null) {
      timeStore.epoch = ep;
      timeStore.paused = true;
    }
    e.preventDefault();
  }

  function onCanvasPointerMove(e: PointerEvent) {
    if (!canvasEl || scrubbing) return;
    const rect = canvasEl.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    hoverX = cssX;
    // Cursor feedback
    const scaleX = CANVAS_W / rect.width;
    const lx = cssX * scaleX;
    canvasEl.style.cursor = (selectedPass && cachedData.length > 0 && lx >= G_LEFT && lx <= CANVAS_W - G_RIGHT) ? 'grab' : '';
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

    const satrec = createSatrec(tle.line1, tle.line2, tle.omm);
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
    const tz = settingsStore.timezone;
    const aosF = formatFileDateTz(epochToUnix(pass.aosEpoch), tz);
    const losF = formatFileDateTz(epochToUnix(pass.losEpoch), tz);
    const timeRange = `${aosF.time}-${losF.time}`;
    const freqLabel = baseFreqHz >= 1e6 ? `${(baseFreqHz / 1e6).toFixed(3)}MHz` : `${(baseFreqHz / 1e3).toFixed(1)}kHz`;
    const safeName = pass.satName.replace(/[^a-zA-Z0-9]/g, '-');
    const filename = `doppler_${safeName}_${aosF.date}_${timeRange}_${freqLabel}.csv`;

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
      applyTxMode(transmitters[0].mode);
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
      if (matchIdx >= 0) applyTxMode(txList[matchIdx].mode);
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

  // Push tracking params to rig store for live correction
  $effect(() => {
    const pass = selectedPass;
    if (!pass || !baseFreqHz || baseFreqHz <= 0) {
      rigStore.clearTracking();
      return;
    }
    const tle = uiStore.getSatTLE?.(pass.satNoradId);
    if (!tle) { rigStore.clearTracking(); return; }
    const satrec = createSatrec(tle.line1, tle.line2, tle.omm);
    rigStore.setTrackingParams(satrec, baseFreqHz);
  });

  const CIV_PRESETS: Record<string, { label: string; addr: number }> = {
    '0x94': { label: 'IC-7300', addr: 0x94 },
    '0xA4': { label: 'IC-705', addr: 0xA4 },
    '0xA2': { label: 'IC-9700', addr: 0xA2 },
    '0x88': { label: 'IC-7100', addr: 0x88 },
    '0x98': { label: 'IC-7610', addr: 0x98 },
    '0x96': { label: 'IC-R8600', addr: 0x96 },
  };

  let rigLocked = $derived(rigStore.status === 'connected' || rigStore.status === 'connecting');

  let rateDisplay = $derived(rigStore.updateIntervalMs >= 1000
    ? `${(rigStore.updateIntervalMs / 1000).toFixed(1)}s`
    : `${rigStore.updateIntervalMs}ms`);
</script>

{#snippet dopplerIcon()}<span class="title-icon">{@html ICON_DOPPLER}</span>{/snippet}
{#snippet headerExtra()}
  <div class="dw-header-extra">
    <Button size="xs" variant="ghost" active={tab === 'chart'} onclick={() => tab = 'chart'}>Chart</Button>
    <Button size="xs" variant="ghost" active={tab === 'console'} onclick={() => tab = 'console'}>Console</Button>
    <Button size="xs" variant="ghost" active={tab === 'setup'} onclick={() => tab = 'setup'}>Setup</Button>
  </div>
{/snippet}

{#snippet windowContent()}
  {#if tab === 'chart'}
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
      style="touch-action:none"
      onpointerdown={onCanvasPointerDown}
      onpointermove={onCanvasPointerMove}
      onpointerleave={onCanvasPointerLeave}
    ></canvas>
  </div>

  {:else if tab === 'setup'}
    <div class="setup-panel">
      <h4 class="section-header">Connection</h4>
      <div class="row">
        <label>Mode</label>
        <div class="rig-mode-btns">
          <Button size="xs" variant="ghost" active={rigStore.mode === 'serial'}
            disabled={rigLocked} onclick={() => rigStore.setMode('serial')}>serial</Button>
          <Button size="xs" variant="ghost" active={rigStore.mode === 'network'}
            disabled={rigLocked} onclick={() => rigStore.setMode('network')}>rigctld</Button>
        </div>
      </div>

      {#if rigStore.mode === 'serial'}
        <div class="row">
          <label>Protocol<InfoTip>CAT (Computer Aided Transceiver) serial protocol. Must match your radio manufacturer. Radios listed are common examples — any radio using the same protocol will work.
            <div class="tip-options">
              <div><b>Kenwood / Elecraft</b> — text, ; terminator, 11-digit Hz. e.g. TS-890, TS-590, K3, KX3, K4</div>
              <div><b>Yaesu (modern)</b> — text, ; terminator, 9-digit Hz. e.g. FT-991A, FT-710, FTDX101, FTDX10</div>
              <div><b>Yaesu (legacy)</b> — binary 5-byte, 10 Hz resolution, 2 stop bits. e.g. FT-817, FT-857, FT-897</div>
              <div><b>Icom CI-V</b> — binary, BCD frequency, configurable address. e.g. IC-7300, IC-705, IC-9700</div>
            </div>
          </InfoTip></label>
          <Select size="xs" value={rigStore.serialProtocol} disabled={rigLocked}
            onchange={(e) => rigStore.setSerialProtocol((e.target as HTMLSelectElement).value as RigSerialProtocol)}>
            <option value="kenwood">Kenwood / Elecraft</option>
            <option value="yaesu">Yaesu (modern)</option>
            <option value="yaesu-legacy">Yaesu (legacy)</option>
            <option value="civ">Icom CI-V</option>
          </Select>
        </div>
        <div class="row">
          <label>Baud</label>
          <Select size="xs" value={String(rigStore.baudRate)} disabled={rigLocked}
            onchange={(e) => rigStore.setBaudRate(Number((e.target as HTMLSelectElement).value))}>
            {#each BAUD_RATES as rate}
              <option value={String(rate)}>{rate}</option>
            {/each}
          </Select>
        </div>
        {#if rigStore.serialProtocol === 'civ'}
          <div class="row">
            <label>CI-V Address<InfoTip>Icom radio CI-V address. Check your radio's settings menu.</InfoTip></label>
            <Select size="xs" value={'0x' + rigStore.civAddress.toString(16).toUpperCase()} disabled={rigLocked}
              onchange={(e) => rigStore.setCivAddress(parseInt((e.target as HTMLSelectElement).value, 16))}>
              {#each Object.entries(CIV_PRESETS) as [hex, p]}
                <option value={hex}>{p.label} ({hex})</option>
              {/each}
            </Select>
          </div>
        {/if}
      {/if}

      {#if rigStore.mode === 'network'}
        <div class="row">
          <label>URL<InfoTip>WebSocket URL pointing to your TCP-to-WS bridge. The bridge forwards rigctld text commands (F, f, M) between the browser and the server.
            <div class="tip-options">
              <div><b>Hamlib rigctld</b> — default TCP port 4532</div>
              <div><b>GQRX</b> — remote control on TCP port 7356</div>
              <div><b>SDR++</b> — rigctld server module, configurable port</div>
              <div>The port in this URL is the bridge port (e.g. websockify listening port), not the server's TCP port.</div>
            </div>
          </InfoTip></label>
          <Input size="xs" class="rig-url" type="text" disabled={rigLocked}
            value={rigStore.wsUrl}
            onblur={(e) => rigStore.setWsUrl((e.currentTarget as HTMLInputElement).value)}
            onkeydown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        </div>
      {/if}

      <h4 class="section-header">Correction</h4>
      <Slider label="Update rate" display={rateDisplay}
        min={100} max={5000} step={100} value={rigStore.updateIntervalMs}
        oninput={(e) => rigStore.setUpdateInterval(Number((e.target as HTMLInputElement).value))} />

      <div class="row">
        <label>TX Offset<InfoTip>Fixed offset added to the corrected frequency. Use for split/duplex operation.</InfoTip></label>
        <div class="offset-row">
          <Input size="xs" class="rig-offset" type="number" step="100"
            value={rigStore.txOffsetHz}
            onblur={(e) => rigStore.setTxOffset(Number((e.currentTarget as HTMLInputElement).value))}
            onkeydown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
          <span class="unit">Hz</span>
        </div>
      </div>

      <details class="guide-details">
        <summary>Guide</summary>
        <div class="guide-body">
          {#if rigStore.mode === 'serial'}
            <ul>
              <li>Connect radio via USB or serial adapter</li>
              <li>Select matching protocol and baud rate</li>
              <li>Click Connect — browser will prompt for the serial port</li>
              {#if rigStore.serialProtocol === 'civ'}
                <li>Ensure <b>CI-V Transceive</b> is OFF in radio settings</li>
                <li>Verify the CI-V address matches your radio model</li>
              {:else if rigStore.serialProtocol === 'yaesu-legacy'}
                <li>FT-817/857/897 — uses 2 stop bits automatically</li>
                <li>Set <b>CAT Rate</b> in radio menu to match baud rate</li>
              {:else}
                <li>Enable <b>CAT</b> in radio menu, set matching baud rate</li>
              {/if}
            </ul>
          {:else}
            Browsers can't open raw TCP sockets, so you need a WebSocket-to-TCP bridge
            between the app and rigctld.
            <ol>
              <li>Start your rigctld-compatible server:
                <ul>
                  <li><b>Hamlib</b>: <code>rigctld -m 3085 -r /dev/ttyUSB0 -T 0.0.0.0</code></li>
                  <li><b>GQRX</b>: Enable remote control in settings (port 7356)</li>
                  <li><b>SDR++</b>: Enable rigctld server module</li>
                </ul>
              </li>
              <li>Install and run a bridge: <span class="bridge-btns"><Button size="xs" variant="ghost" active={bridgeTool === 'websockify'} onclick={() => bridgeTool = 'websockify'}>websockify</Button><Button size="xs" variant="ghost" active={bridgeTool === 'websocat'} onclick={() => bridgeTool = 'websocat'}>websocat</Button></span>
                <br>{#if bridgeTool === 'websockify'}
                  <code>pip install websockify</code><br>
                  <code>websockify 4541 localhost:4532</code>
                {:else}
                  <code>cargo install websocat</code><br>
                  <code>websocat --binary ws-l:0.0.0.0:4541 tcp:127.0.0.1:4532</code>
                {/if}
              </li>
              <li>Enter <code>ws://localhost:4541</code> as the URL above</li>
              <li>Click Connect</li>
            </ol>
          {/if}
          <span class="guide-note">Doppler correction is sent as absolute frequency. Radio should be in VFO mode.</span>
        </div>
      </details>
    </div>

  {:else if tab === 'console'}
    <div class="console-tab">
      <ProtocolConsole
        log={rigStore.commandLog}
        connected={rigStore.status === 'connected'}
        isBinary={rigStore.isBinaryProtocol}
        onSend={(cmd) => rigStore.sendRaw(cmd)}
        onSendBytes={(data) => rigStore.sendRawBytes(data)}
      />
    </div>
  {/if}
{/snippet}

{#snippet footer()}
  <div class="rig-status-bar">
    <div class="rig-status">
      <span class="rig-dot"
        class:ok={rigStore.status === 'connected'}
        class:loading={rigStore.status === 'connecting'}
        class:err={rigStore.status === 'error'}></span>
      <span class="rig-status-text">{rigStore.status}</span>
    </div>
    <Select size="xs" class="rig-mode-sel" value={rigStore.radioMode}
      onchange={(e) => {
        const v = (e.target as HTMLSelectElement).value;
        rigStore.setRadioMode(v);
        satnogsModeName = '';
        rigStore.sendRadioMode();
      }}>
      <option value="">—</option>
      {#each RADIO_MODES as m}
        {@const isMapped = satnogsModeName && satnogsModeName.toUpperCase() !== m && satnogsModeToRadio(satnogsModeName) === m}
        <option value={m}>{isMapped ? `${satnogsModeName} (${m})` : m}</option>
      {/each}
    </Select>
    {#if rigStore.status === 'connected'}
      {#if rigStore.liveCorrection && rigStore.lastSentHz}
        <span class="rig-freq">{formatFreq(rigStore.lastSentHz)}</span>
      {/if}
      <label class="rig-live-toggle">
        <Checkbox checked={rigStore.liveCorrection} onchange={() => rigStore.setLiveCorrection(!rigStore.liveCorrection)} />
        <span>Live</span>
      </label>
      <Button size="xs" onclick={() => rigStore.disconnect()}>Disconnect</Button>
    {:else}
      <Button size="xs" onclick={() => rigStore.connect()}
        disabled={rigStore.status === 'connecting'}>Connect</Button>
    {/if}
  </div>
  {#if rigStore.error}
    <div class="rig-error">{rigStore.error}</div>
  {/if}
{/snippet}

{#if uiStore.isMobile}
  <MobileSheet id="doppler" title="Doppler Shift" icon={dopplerIcon} {headerExtra} {footer}>
    {@render windowContent()}
  </MobileSheet>
{:else}
  <DraggableWindow id="doppler" title="Doppler Shift" icon={dopplerIcon} bind:open={uiStore.dopplerWindowOpen} focus={uiStore.dopplerWindowFocus} initialX={200} initialY={150} {headerExtra} {footer} footerPadding="8px 14px" noPad>
    {@render windowContent()}
  </DraggableWindow>
{/if}

<style>
  .dw { min-width: 400px; }
  @media (max-width: 767px) { .dw { min-width: unset; width: 100%; } }
  .dw canvas { display: block; }
  .controls {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 14px;
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

  /* ── Header tabs ── */
  .dw-header-extra {
    display: flex;
    align-items: center;
    gap: 1px;
    margin-left: auto;
    margin-right: 8px;
  }

  /* ── Rig status bar ── */
  .rig-status-bar {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .rig-status {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 1;
  }
  .rig-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-muted);
    flex-shrink: 0;
  }
  .rig-dot.ok { background: var(--live); }
  .rig-dot.loading { background: var(--warning); animation: rig-blink 0.8s infinite; }
  .rig-dot.err { background: var(--danger); }
  @keyframes rig-blink { 50% { opacity: 0.3; } }
  .rig-status-text {
    font-size: 10px;
    color: var(--text-dim);
    text-transform: capitalize;
  }
  :global(.rig-mode-sel) { max-width: 90px; }
  .rig-freq {
    font-size: 10px;
    color: var(--text-muted);
  }
  .rig-live-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: var(--text-dim);
    cursor: pointer;
  }

  /* ── Console tab ── */
  .console-tab {
    width: 100%;
    max-width: 400px;
    height: 240px;
  }

  /* ── Setup tab ── */
  .setup-panel {
    padding: 12px 14px;
    width: 100%;
    max-width: 400px;
    box-sizing: border-box;
  }
  .section-header {
    font-size: 11px;
    color: var(--text-ghost);
    font-weight: normal;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin: 10px 0 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--border);
  }
  .section-header:first-child { margin-top: 0; }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .row:last-child { margin-bottom: 0; }
  .row label { color: var(--text-dim); font-size: 12px; }
  @media (pointer: coarse) {
    .row { margin-bottom: 10px; min-height: 32px; }
    .section-header { margin: 14px 0 8px; }
  }
  .rig-mode-btns { display: flex; gap: 2px; }
  .offset-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  :global(.rig-url) { width: 160px; }
  :global(.rig-offset) { width: 80px; }
  .rig-error {
    font-size: 10px;
    color: var(--danger);
    margin-top: 6px;
    padding: 3px 6px;
    background: color-mix(in srgb, var(--danger) 8%, transparent);
    border: 1px solid var(--danger);
    border-radius: 2px;
    word-break: break-word;
    max-width: 400px;
  }
  .guide-details {
    margin-top: 8px;
  }
  .guide-details summary {
    font-size: 11px;
    color: var(--text-ghost);
    text-transform: uppercase;
    letter-spacing: 1px;
    cursor: pointer;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--border);
  }
  .guide-details summary:hover { color: var(--text-dim); }
  .guide-body {
    margin-top: 6px;
    font-size: 10px;
    color: var(--text-muted);
    line-height: 1.6;
    overflow-wrap: break-word;
  }
  .guide-body b { color: var(--text-dim); }
  .guide-body ul {
    margin: 4px 0;
    padding-left: 16px;
  }
  .guide-body ol {
    margin: 4px 0;
    padding-left: 22px;
    list-style-position: outside;
  }
  .guide-body li { margin-bottom: 4px; }
  .guide-body code {
    font-size: 9px;
    background: color-mix(in srgb, var(--text) 6%, transparent);
    padding: 1px 4px;
    border-radius: 2px;
  }
  .guide-note {
    font-size: 9px;
    color: var(--text-muted);
    display: block;
    margin-top: 4px;
  }
  .bridge-btns {
    display: inline-flex;
    gap: 1px;
    float: right;
  }
</style>
