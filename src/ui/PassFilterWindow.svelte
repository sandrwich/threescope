<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { ICON_FILTER } from './shared/icons';

  const SIZE = 300;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R_MAX = (SIZE - 90) / 2;
  const HANDLE_R = 10;

  const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
  const DIR_AZ = [0, 45, 90, 135, 180, 225, 270, 315];

  const AZ_PRESETS: { label: string; from: number; to: number }[] = [
    { label: 'N', from: 315, to: 45 },
    { label: 'E', from: 45, to: 135 },
    { label: 'S', from: 135, to: 225 },
    { label: 'W', from: 225, to: 315 },
    { label: 'All', from: 0, to: 360 },
  ];

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let ctx: CanvasRenderingContext2D | null = null;

  // Local working copies synced to store on change
  let azFrom = $state(uiStore.passAzFrom);
  let azTo = $state(uiStore.passAzTo);
  let minEl = $state(uiStore.passMinEl);
  let maxEl = $state(uiStore.passMaxEl);
  let horizonMask = $state<number[]>(
    uiStore.passHorizonMask.length === 8
      ? uiStore.passHorizonMask.map(p => p.minEl)
      : [0, 0, 0, 0, 0, 0, 0, 0]
  );

  function syncToStore() {
    uiStore.setPassAzRange(azFrom, azTo);
    if (minEl !== uiStore.passMinEl) uiStore.setPassMinEl(minEl);
    uiStore.setPassMaxEl(maxEl);
    const mask = horizonMask.some(v => v > 0)
      ? DIR_AZ.map((az, i) => ({ az, minEl: horizonMask[i] }))
      : [];
    uiStore.setPassHorizonMask(mask);
  }

  // Sync from store when window opens or store values change externally
  $effect(() => {
    if (uiStore.passFilterWindowOpen) {
      azFrom = uiStore.passAzFrom;
      azTo = uiStore.passAzTo;
      minEl = uiStore.passMinEl;
      maxEl = uiStore.passMaxEl;
      horizonMask = uiStore.passHorizonMask.length === 8
        ? uiStore.passHorizonMask.map(p => p.minEl)
        : [0, 0, 0, 0, 0, 0, 0, 0];
    }
  });

  // Coordinate helpers
  function azElToXY(az: number, el: number): { x: number; y: number } {
    const r = R_MAX * (90 - Math.max(0, el)) / 90;
    const rad = az * Math.PI / 180;
    return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
  }

  function xyToAzEl(x: number, y: number): { az: number; el: number } {
    const dx = x - CX, dy = -(y - CY);
    const r = Math.sqrt(dx * dx + dy * dy);
    const el = Math.max(0, Math.min(90, 90 * (1 - r / R_MAX)));
    let az = Math.atan2(dx, dy) * 180 / Math.PI;
    if (az < 0) az += 360;
    return { az, el };
  }

  function elToR(el: number): number {
    return R_MAX * (90 - Math.max(0, Math.min(90, el))) / 90;
  }

  // Azimuth handle position: just outside the ring
  const AZ_HANDLE_R = R_MAX + HANDLE_R + 4;
  function azHandleXY(az: number): { x: number; y: number } {
    const rad = az * Math.PI / 180;
    return { x: CX + AZ_HANDLE_R * Math.sin(rad), y: CY - AZ_HANDLE_R * Math.cos(rad) };
  }

  // Elevation handle position: on 157° axis (between S and SE) to avoid horizon dots
  const EL_HANDLE_RAD = 157 * Math.PI / 180;
  function elHandleXY(el: number): { x: number; y: number } {
    const r = elToR(el);
    return { x: CX + r * Math.sin(EL_HANDLE_RAD), y: CY - r * Math.cos(EL_HANDLE_RAD) };
  }

  // Drag state
  type DragTarget = 'azFrom' | 'azTo' | 'minEl' | 'maxEl' | `horizon${number}`;
  let dragging: DragTarget | null = $state(null);

  function hitTest(mx: number, my: number): DragTarget | null {
    const azFromPt = azHandleXY(azFrom);
    if (Math.hypot(mx - azFromPt.x, my - azFromPt.y) < HANDLE_R + 4) return 'azFrom';
    const azToPt = azHandleXY(azTo === 360 ? 0 : azTo);
    if (Math.hypot(mx - azToPt.x, my - azToPt.y) < HANDLE_R + 4) return 'azTo';
    for (let i = 0; i < 8; i++) {
      const p = azElToXY(DIR_AZ[i], horizonMask[i]);
      if (Math.hypot(mx - p.x, my - p.y) < HANDLE_R + 3) return `horizon${i}`;
    }
    const minElPt = elHandleXY(minEl);
    if (Math.hypot(mx - minElPt.x, my - minElPt.y) < HANDLE_R + 3) return 'minEl';
    const maxElPt = elHandleXY(maxEl);
    if (Math.hypot(mx - maxElPt.x, my - maxElPt.y) < HANDLE_R + 3) return 'maxEl';
    return null;
  }

  function onPointerDown(e: PointerEvent) {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const mx = (e.clientX - rect.left) * (canvasEl.width / dpr) / rect.width;
    const my = (e.clientY - rect.top) * (canvasEl.height / dpr) / rect.height;
    const target = hitTest(mx, my);
    if (target) {
      dragging = target;
      uiStore.passFilterInteracting = true;
      canvasEl.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging || !canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const mx = (e.clientX - rect.left) * (canvasEl.width / dpr) / rect.width;
    const my = (e.clientY - rect.top) * (canvasEl.height / dpr) / rect.height;
    const { az, el } = xyToAzEl(mx, my);

    if (dragging === 'azFrom') {
      azFrom = Math.round(az);
      syncToStore();
    } else if (dragging === 'azTo') {
      azTo = Math.round(az);
      syncToStore();
    } else if (dragging === 'minEl') {
      minEl = Math.round(Math.max(0, Math.min(maxEl - 1, el)));
      syncToStore();
    } else if (dragging === 'maxEl') {
      maxEl = Math.round(Math.max(minEl + 1, Math.min(90, el)));
      syncToStore();
    } else if (dragging.startsWith('horizon')) {
      const idx = parseInt(dragging.slice(7));
      horizonMask[idx] = Math.round(Math.max(0, Math.min(80, el)));
      horizonMask = [...horizonMask];
      syncToStore();
    }
  }

  function onPointerUp() {
    dragging = null;
    if (uiStore.passFilterInteracting) {
      uiStore.passFilterInteracting = false;
      uiStore.onFilterInteractionEnd?.();
    }
  }

  let passes = $derived(uiStore.passesTab === 'selected' ? uiStore.passes : uiStore.nearbyPasses);

  // Precomputed heatmap offscreen canvas — rebuilt only when passes/filters change
  let heatmapCanvas = $state<HTMLCanvasElement | null>(null);

  function rebuildHeatmap() {
    const AZ_BINS = 72;  // 5° each
    const EL_BINS = 18;  // 5° each
    const AZ_STEP = 360 / AZ_BINS;
    const EL_STEP = 90 / EL_BINS;
    const bins = new Float32Array(AZ_BINS * EL_BINS);
    let peak = 0;
    const hasAz = !(azFrom === 0 && azTo === 360);
    for (const pass of passes) {
      for (const p of pass.skyPath) {
        if (p.el < minEl || p.el > maxEl) continue;
        if (p.el < interpolateHorizon(p.az)) continue;
        if (hasAz) {
          const inAz = azFrom <= azTo
            ? p.az >= azFrom && p.az <= azTo
            : p.az >= azFrom || p.az <= azTo;
          if (!inAz) continue;
        }
        const ai = Math.min(AZ_BINS - 1, Math.floor(p.az / AZ_STEP));
        const ei = Math.min(EL_BINS - 1, Math.floor(p.el / EL_STEP));
        // Weight by sin(el) to counteract the bias toward low-elevation bins
        const w = Math.sin((p.el + EL_STEP * 0.5) * Math.PI / 180);
        const v = (bins[ai * EL_BINS + ei] += w);
        if (v > peak) peak = v;
      }
    }
    if (peak === 0) { heatmapCanvas = null; return; }
    const dpr = window.devicePixelRatio || 1;
    const offscreen = document.createElement('canvas');
    offscreen.width = SIZE * dpr;
    offscreen.height = SIZE * dpr;
    const oc = offscreen.getContext('2d')!;
    oc.scale(dpr, dpr);
    for (let ai = 0; ai < AZ_BINS; ai++) {
      for (let ei = 0; ei < EL_BINS; ei++) {
        const count = bins[ai * EL_BINS + ei];
        if (count === 0) continue;
        const t = count / peak;
        const r = Math.round(t < 0.5 ? 0 : (t - 0.5) * 2 * 255);
        const g = Math.round(t < 0.5 ? t * 2 * 200 : 200 + (t - 0.5) * 2 * 55);
        const b = Math.round(t < 0.5 ? 80 + t * 2 * 175 : 255 - (t - 0.5) * 2 * 200);
        const alpha = 0.15 + t * 0.5;
        oc.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        const az0 = ai * AZ_STEP;
        const az1 = az0 + AZ_STEP;
        const el0 = ei * EL_STEP;
        const el1 = el0 + EL_STEP;
        const rOuter = elToR(el0);
        const rInner = elToR(el1);
        const startAngle = (az0 - 90) * Math.PI / 180;
        const endAngle = (az1 - 90) * Math.PI / 180;
        oc.beginPath();
        oc.arc(CX, CY, rOuter, startAngle, endAngle);
        oc.arc(CX, CY, rInner, endAngle, startAngle, true);
        oc.closePath();
        oc.fill();
      }
    }
    heatmapCanvas = offscreen;
  }

  // Rebuild heatmap when passes or filter values change (skip during computation or drag)
  let computing = $derived(uiStore.passesComputing || uiStore.nearbyComputing);
  $effect(() => {
    // Touch reactive deps
    void passes; void azFrom; void azTo; void minEl; void maxEl; void horizonMask;
    if (!computing && !dragging) rebuildHeatmap();
  });

  // Drawing
  function drawFrame() {
    if (!ctx || !canvasEl) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const font = '"Overpass Mono", monospace';

    // Grid rings
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (const frac of [1, 0.666, 0.333]) {
      ctx.beginPath();
      ctx.arc(CX, CY, R_MAX * frac, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // Cross-hairs
    ctx.beginPath();
    ctx.moveTo(CX - R_MAX, CY); ctx.lineTo(CX + R_MAX, CY);
    ctx.moveTo(CX, CY - R_MAX); ctx.lineTo(CX, CY + R_MAX);
    ctx.stroke();

    // Cardinal labels
    ctx.fillStyle = '#777';
    ctx.font = `11px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom'; ctx.fillText('N', CX, CY - R_MAX - 28);
    ctx.textBaseline = 'top'; ctx.fillText('S', CX, CY + R_MAX + 28);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left'; ctx.fillText('E', CX + R_MAX + 30, CY);
    ctx.textAlign = 'right'; ctx.fillText('W', CX - R_MAX - 30, CY);

    // Elevation labels
    ctx.fillStyle = '#444';
    ctx.font = `8px ${font}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('60°', CX + 3, CY - R_MAX * 0.333 + 2);
    ctx.fillText('30°', CX + 3, CY - R_MAX * 0.666 + 2);

    // Observable region shading
    drawObservableRegion();

    // Pass density heatmap (precomputed offscreen)
    if (heatmapCanvas) {
      ctx.drawImage(heatmapCanvas, 0, 0, SIZE, SIZE);
    }

    // Horizon mask handles (drawn first so azimuth dots paint on top)
    {
      const hasMask = horizonMask.some(v => v > 0);
      if (hasMask) {
        ctx.strokeStyle = '#44cc44';
        ctx.fillStyle = 'rgba(68, 204, 68, 0.08)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        for (let a = 0; a <= 360; a += 2) {
          const el = interpolateHorizon(a);
          const { x, y } = azElToXY(a, el);
          if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
      for (let i = 0; i < 8; i++) {
        const { x, y } = azElToXY(DIR_AZ[i], horizonMask[i]);
        const isActive = dragging === `horizon${i}`;
        ctx.globalAlpha = (hasMask || isActive) ? 1 : 0.3;
        ctx.fillStyle = isActive ? '#88ff88' : '#44cc44';
        ctx.beginPath();
        ctx.arc(x, y, HANDLE_R, 0, 2 * Math.PI);
        ctx.fill();
        if (horizonMask[i] > 0) {
          ctx.fillStyle = '#000';
          ctx.font = `bold 9px ${font}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${horizonMask[i]}`, x, y + 1);
        }
        ctx.globalAlpha = 1;
      }
    }

    // Elevation rings
    {
      const minElDefault = minEl === 0;
      const maxElDefault = maxEl === 90;
      ctx.strokeStyle = '#ff8800';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.globalAlpha = minElDefault ? 0.25 : 1;
      ctx.beginPath();
      ctx.arc(CX, CY, elToR(minEl), 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
      {
        const { x: hx, y: hy } = elHandleXY(minEl);
        ctx.globalAlpha = minElDefault ? 0.25 : 1;
        ctx.fillStyle = '#ff8800';
        ctx.beginPath(); ctx.arc(hx, hy, HANDLE_R, 0, 2 * Math.PI); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = `bold 9px ${font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${minEl}`, hx, hy + 1);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ff8800';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.globalAlpha = maxElDefault ? 0.25 : 1;
      ctx.beginPath();
      ctx.arc(CX, CY, elToR(maxEl), 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
      {
        const { x: hx, y: hy } = elHandleXY(maxEl);
        ctx.globalAlpha = maxElDefault ? 0.25 : 1;
        ctx.fillStyle = '#ff8800';
        ctx.beginPath(); ctx.arc(hx, hy, HANDLE_R, 0, 2 * Math.PI); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = `bold 9px ${font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${maxEl}`, hx, hy + 1);
      }
      ctx.globalAlpha = 1;
    }

    // Azimuth wedge lines — extend past ring, handles outside
    {
      const isDefault = azFrom === 0 && azTo === 360;
      ctx.globalAlpha = isDefault ? 0.3 : 1;
      ctx.strokeStyle = '#00aaff';
      ctx.lineWidth = isDefault ? 1 : 2;
      ctx.setLineDash([]);
      const fromHandle = azHandleXY(azFrom);
      ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(fromHandle.x, fromHandle.y); ctx.stroke();
      const toHandle = azHandleXY(azTo === 360 ? 0 : azTo);
      ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(toHandle.x, toHandle.y); ctx.stroke();
      ctx.fillStyle = '#00aaff';
      ctx.beginPath(); ctx.arc(fromHandle.x, fromHandle.y, HANDLE_R, 0, 2 * Math.PI); ctx.fill();
      ctx.beginPath(); ctx.arc(toHandle.x, toHandle.y, HANDLE_R, 0, 2 * Math.PI); ctx.fill();
      if (!isDefault) {
        ctx.fillStyle = '#000';
        ctx.font = `bold 9px ${font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${azFrom}`, fromHandle.x, fromHandle.y + 1);
        ctx.fillText(`${azTo === 360 ? 0 : azTo}`, toHandle.x, toHandle.y + 1);
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function interpolateHorizon(az: number): number {
    if (!horizonMask.some(v => v > 0)) return 0;
    for (let i = 0; i < 8; i++) {
      const next = (i + 1) % 8;
      let a0 = DIR_AZ[i], a1 = DIR_AZ[next];
      if (a1 <= a0) a1 += 360;
      let a = az;
      if (a < a0) a += 360;
      if (a >= a0 && a <= a1) {
        const frac = a1 === a0 ? 0 : (a - a0) / (a1 - a0);
        return horizonMask[i] + frac * (horizonMask[next] - horizonMask[i]);
      }
    }
    return horizonMask[0];
  }

  function drawObservableRegion() {
    if (!ctx) return;
    ctx.fillStyle = 'rgba(0, 170, 255, 0.06)';
    const hasAz = !(azFrom === 0 && azTo === 360);
    const startAz = hasAz ? azFrom : 0;
    const endAz = hasAz ? azTo : 360;
    const step = 2;
    const outerPoints: { x: number; y: number }[] = [];
    const innerPoints: { x: number; y: number }[] = [];
    const totalDeg = hasAz ? (endAz >= startAz ? endAz - startAz : 360 - startAz + endAz) : 360;
    for (let d = 0; d <= totalDeg; d += step) {
      const a = (startAz + d) % 360;
      const hEl = interpolateHorizon(a);
      const effectiveMinEl = Math.max(minEl, hEl);
      outerPoints.push(azElToXY(a, effectiveMinEl));
      innerPoints.push(azElToXY(a, maxEl));
    }
    if (outerPoints.length > 1) {
      ctx.beginPath();
      ctx.moveTo(outerPoints[0].x, outerPoints[0].y);
      for (let i = 1; i < outerPoints.length; i++) ctx.lineTo(outerPoints[i].x, outerPoints[i].y);
      for (let i = innerPoints.length - 1; i >= 0; i--) ctx.lineTo(innerPoints[i].x, innerPoints[i].y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function applyAzPreset(p: { from: number; to: number }) {
    azFrom = p.from;
    azTo = p.to;
    syncToStore();
  }

  function reset() {
    azFrom = 0; azTo = 360;
    minEl = 0; maxEl = 90;
    horizonMask = [0, 0, 0, 0, 0, 0, 0, 0];
    uiStore.setPassVisibility('all');
    uiStore.setPassMinDuration(0);
    uiStore.passHiddenSats = new Set();
    syncToStore();
  }

  function initCanvas() {
    if (!canvasEl) return;
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = SIZE * dpr;
    canvasEl.height = SIZE * dpr;
    canvasEl.style.width = SIZE + 'px';
    canvasEl.style.height = SIZE + 'px';
    ctx = canvasEl.getContext('2d');
  }

  // Clear interaction flag on any global pointerup (safety net if pointer leaves element)
  function onGlobalPointerUp() {
    if (uiStore.passFilterInteracting) {
      uiStore.passFilterInteracting = false;
      uiStore.onFilterInteractionEnd?.();
    }
  }

  $effect(() => {
    if (uiStore.passFilterWindowOpen) {
      window.addEventListener('pointerup', onGlobalPointerUp);
      return () => window.removeEventListener('pointerup', onGlobalPointerUp);
    }
  });

  // Init canvas when window opens
  $effect(() => {
    if (canvasEl && uiStore.passFilterWindowOpen) {
      initCanvas();
    }
  });

  // Redraw when any visual state changes
  $effect(() => {
    // Touch all reactive deps that affect the canvas
    void azFrom; void azTo; void minEl; void maxEl; void horizonMask;
    void dragging; void heatmapCanvas;
    if (ctx && uiStore.passFilterWindowOpen) drawFrame();
  });
</script>

{#snippet headerExtra()}
  {#if uiStore.hasActivePassFilters}
    <button class="pf-reset" onclick={reset}>Reset</button>
  {/if}
{/snippet}

{#snippet pfIcon()}<span class="title-icon">{@html ICON_FILTER}</span>{/snippet}

<DraggableWindow id="pass-filters" title="Pass Filters" icon={pfIcon} {headerExtra} bind:open={uiStore.passFilterWindowOpen} initialX={9999} initialY={150}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="pf"
    onpointerdown={() => { uiStore.passFilterInteracting = true; }}
    onpointerup={() => { uiStore.passFilterInteracting = false; uiStore.onFilterInteractionEnd?.(); }}
    onpointercancel={() => { uiStore.passFilterInteracting = false; uiStore.onFilterInteractionEnd?.(); }}>
    <div class="pf-row pf-row-top">
      <span class="pf-label">Show</span>
      <select class="pf-select" value={uiStore.passVisibility}
        onchange={(e) => uiStore.setPassVisibility((e.target as HTMLSelectElement).value as 'all' | 'observable' | 'visible')}>
        <option value="all">All passes</option>
        <option value="observable">Observable</option>
        <option value="visible">Visible (mag ≤ 5)</option>
      </select>
      <span class="pf-label" style="margin-left:6px">Min view</span>
      <input class="pf-num" type="number" min="0" max="3600" value={uiStore.passMinDuration}
        onchange={(e) => uiStore.setPassMinDuration(Math.max(0, parseInt((e.target as HTMLInputElement).value) || 0))} />
      <span class="pf-unit">s</span>
    </div>

    <div class="pf-canvas-wrap">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <canvas bind:this={canvasEl}
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerUp}></canvas>
    </div>

    <div class="pf-controls">
      <div class="pf-row">
        <span class="pf-label"><span class="pf-dot" style="background:#ff8800"></span>Elevation</span>
        <input class="pf-num" type="number" min="0" max="90" bind:value={minEl}
          onchange={() => syncToStore()} />
        <span class="pf-sep">&mdash;</span>
        <input class="pf-num" type="number" min="0" max="90" bind:value={maxEl}
          onchange={() => syncToStore()} />
        <span class="pf-unit">°</span>
      </div>

      <div class="pf-row">
        <span class="pf-label"><span class="pf-dot" style="background:#00aaff"></span>Azimuth</span>
        <input class="pf-num" type="number" min="0" max="360" bind:value={azFrom}
          onchange={() => syncToStore()} />
        <span class="pf-sep">&mdash;</span>
        <input class="pf-num" type="number" min="0" max="360" bind:value={azTo}
          onchange={() => syncToStore()} />
        <span class="pf-unit">°</span>
        <div class="pf-presets">
          {#each AZ_PRESETS as p}
            <button class="pf-preset" class:active={azFrom === p.from && azTo === p.to} onclick={() => applyAzPreset(p)}>{p.label}</button>
          {/each}
        </div>
      </div>

      <div class="pf-row pf-row-hz">
        <span class="pf-label"><span class="pf-dot" style="background:#44cc44"></span>Horizon</span>
        <div class="pf-horizon">
          {#each DIRS as dir, i}
            <div class="pf-hz-cell">
              <span class="pf-dir">{dir}</span>
              <input class="pf-num pf-num-hz" type="number" min="0" max="80" bind:value={horizonMask[i]}
                onchange={() => { horizonMask = [...horizonMask]; syncToStore(); }} />
              <span class="pf-unit">°</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
</DraggableWindow>

<style>
  .pf {
    width: 330px;
  }
  .pf-row-top {
    margin-bottom: 8px;
  }
  .pf-canvas-wrap {
    display: flex;
    justify-content: center;
    margin-bottom: 10px;
  }
  .pf-canvas-wrap canvas {
    display: block;
    cursor: crosshair;
    touch-action: none;
  }

  .pf-controls {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .pf-row {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  .pf-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-right: 4px;
    vertical-align: middle;
  }
  .pf-label {
    font-size: 10px;
    color: var(--text-ghost);
    min-width: 48px;
    flex-shrink: 0;
  }
  .pf-num {
    width: 56px;
    background: var(--ui-bg);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 11px;
    font-family: inherit;
    padding: 2px 3px;
    text-align: center;
  }
  .pf-num:focus { border-color: var(--border-hover); outline: none; }
  .pf-num-sm { width: 30px; font-size: 10px; }
  .pf-sep { color: var(--text-ghost); font-size: 10px; }
  .pf-unit { color: var(--text-ghost); font-size: 10px; }
  .pf-select {
    background: var(--ui-bg);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 11px;
    font-family: inherit;
    padding: 2px 4px;
  }
  .pf-select:focus { border-color: var(--border-hover); outline: none; }

  .pf-presets {
    display: flex;
    gap: 1px;
    margin-left: 2px;
  }
  .pf-preset {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-ghost);
    font-size: 9px;
    font-family: inherit;
    padding: 1px 5px;
    cursor: pointer;
  }
  .pf-preset:hover { color: var(--text-dim); border-color: var(--border-hover); }
  .pf-preset.active { color: var(--text-muted); border-color: var(--text-ghost); }

  .pf-row-hz { align-items: flex-start; }
  .pf-horizon {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 3px 6px;
  }
  .pf-hz-cell {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .pf-dir {
    font-size: 9px;
    color: var(--text-ghost);
    min-width: 16px;
    text-align: right;
  }
  .pf-num-hz {
    width: 46px;
    font-size: 10px;
  }

  .pf-reset {
    margin-left: auto;
    margin-right: 6px;
    background: none;
    border: none;
    color: var(--text-ghost);
    font-size: 9px;
    font-family: inherit;
    padding: 0;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    cursor: pointer;
  }
  .pf-reset:hover { color: var(--text-dim); border-color: var(--border-hover); }
</style>
