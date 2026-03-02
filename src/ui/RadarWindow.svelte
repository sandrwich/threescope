<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import MobileSheet from './shared/MobileSheet.svelte';
  import Button from './shared/Button.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { beamStore, isInsideBeam } from '../stores/beam.svelte';
  import { ICON_RADAR } from './shared/icons';
  import { palette } from './shared/theme';
  import { initHiDPICanvas } from './shared/canvas';

  const SIZE = 400;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R_MAX = (SIZE - 60) / 2;  // 170px radius
  const INFO_H = 24;              // info bar height below circle

  const font = "'Overpass Mono', monospace";

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let ctx: CanvasRenderingContext2D | null = null;
  let animFrameId = 0;

  // Sweep line animation
  let sweepAngle = 0;

  // Hover state
  let hoverIdx = -1;
  let mouseX = -1;
  let mouseY = -1;

  // Reticle drag state
  let draggingReticle = false;
  let reticlePointerId = -1;

  // Zoom + pan (zoom-to-cursor: point under mouse stays fixed)
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);

  // VFX: sweep line + phosphor afterglow (persisted via uiStore)
  let vfx = $derived(uiStore.radarVfx);

  // Inputs: track store live, but don't override while user is typing
  let inputAz = $state(beamStore.aimAz.toFixed(2));
  let inputEl = $state(beamStore.aimEl.toFixed(2));
  let inputBW = $state(beamStore.beamWidth.toFixed(1));
  let editingAim = $state(false);
  let editingBW = $state(false);

  $effect(() => {
    if (!editingAim) {
      inputAz = beamStore.aimAz.toFixed(2);
      inputEl = beamStore.aimEl.toFixed(2);
    }
    if (!editingBW) inputBW = beamStore.beamWidth.toFixed(1);
  });

  function applyAim() {
    const az = parseFloat(inputAz);
    const el = parseFloat(inputEl);
    if (!isNaN(az) && !isNaN(el)) {
      beamStore.setAim(az, el);
      if (beamStore.locked) beamStore.unlock();
    }
    editingAim = false;
  }

  function applyBW() {
    const bw = parseFloat(inputBW);
    if (!isNaN(bw)) beamStore.setBeamWidth(bw);
    editingBW = false;
  }

  function azElToXY(az: number, el: number): { x: number; y: number } {
    const r = R_MAX * (90 - Math.max(0, el)) / 90;
    const azRad = az * Math.PI / 180;
    return {
      x: (r * Math.sin(azRad)) * zoom + CX + panX,
      y: (-r * Math.cos(azRad)) * zoom + CY + panY,
    };
  }

  function xyToAzEl(x: number, y: number): { az: number; el: number } {
    const dx = (x - CX - panX) / zoom;
    const dy = -((y - CY - panY) / zoom);
    const r = Math.sqrt(dx * dx + dy * dy);
    const el = Math.max(0, Math.min(90, 90 * (1 - r / R_MAX)));
    let az = Math.atan2(dx, dy) * 180 / Math.PI;
    if (az < 0) az += 360;
    return { az, el };
  }

  function canvasToLogical(clientX: number, clientY: number): { x: number; y: number } {
    if (!canvasEl) return { x: 0, y: 0 };
    const rect = canvasEl.getBoundingClientRect();
    const scaleX = SIZE / rect.width;
    const scaleY = (SIZE + INFO_H) / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function onCanvasPointerMove(e: PointerEvent) {
    const p = canvasToLogical(e.clientX, e.clientY);
    mouseX = p.x;
    mouseY = p.y;

    if (draggingReticle) {
      const { az, el } = xyToAzEl(p.x, p.y);
      beamStore.setAim(az, el);
      if (beamStore.locked) beamStore.unlock();
      return;
    }

    // Find nearest blip for hover
    const blips = uiStore.radarBlips;
    const count = uiStore.radarBlipCount;
    let bestDist = 20;
    let bestIdx = -1;
    for (let i = 0; i < count; i++) {
      const off = i * 4;
      const { x, y } = azElToXY(blips[off], blips[off + 1]);
      const dx = x - mouseX;
      const dy = y - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    hoverIdx = bestIdx;
  }

  function onCanvasPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const p = canvasToLogical(e.clientX, e.clientY);
    const { az, el } = xyToAzEl(p.x, p.y);

    // Click near a blip → select it + lock beam to it
    if (hoverIdx >= 0) {
      const blips = uiStore.radarBlips;
      const satAz = blips[hoverIdx * 4];
      const satEl = blips[hoverIdx * 4 + 1];
      const satIdx = blips[hoverIdx * 4 + 2];
      const sat = uiStore.getSatelliteByIndex?.(satIdx);
      if (sat) {
        uiStore.onSelectSatellite?.(sat.noradId);
        beamStore.lockToSatellite(sat.noradId, sat.name);
        beamStore.setAim(satAz, satEl);
      }
    } else {
      // Click empty space → move reticle, unlock
      beamStore.setAim(az, el);
      if (beamStore.locked) beamStore.unlock();
    }

    draggingReticle = true;
    canvasEl!.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onCanvasPointerUp(_e: PointerEvent) {
    draggingReticle = false;
  }

  function onCanvasLostCapture(_e: PointerEvent) {
    draggingReticle = false;
  }

  function onCanvasWheel(e: WheelEvent) {
    e.preventDefault();
    const p = canvasToLogical(e.clientX, e.clientY);
    const oldZoom = zoom;
    const newZoom = Math.max(1, Math.min(8, oldZoom * (e.deltaY > 0 ? 0.9 : 1 / 0.9)));
    const ratio = newZoom / oldZoom;
    panX = (p.x - CX) * (1 - ratio) + panX * ratio;
    panY = (p.y - CY) * (1 - ratio) + panY * ratio;
    zoom = newZoom;
    if (zoom <= 1.01) { panX = 0; panY = 0; zoom = 1; }
  }

  function drawFrame() {
    if (!ctx || !canvasEl) { animFrameId = requestAnimationFrame(drawFrame); return; }

    const dpr = window.devicePixelRatio || 1;
    const W = SIZE;
    const H = SIZE + INFO_H;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    // ── Background ──
    ctx.fillStyle = palette.radarBg;
    ctx.fillRect(0, 0, W, H);

    // Clip to circle for grid + sweep + blips
    ctx.save();
    ctx.beginPath();
    ctx.arc(CX, CY, R_MAX + 1, 0, 2 * Math.PI);
    ctx.clip();

    // ── Sweep line (VFX only) ──
    const zCX = CX + panX, zCY = CY + panY;  // zenith in screen coords
    const sweepLen = R_MAX * zoom + 1;
    if (vfx) {
      sweepAngle += 0.02;
      if (sweepAngle > 2 * Math.PI) sweepAngle -= 2 * Math.PI;
      for (let i = 0; i < 30; i++) {
        const a = sweepAngle - i * 0.02;
        const alpha = (1 - i / 30) * 0.12;
        ctx.strokeStyle = `rgba(68, 255, 68, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(zCX, zCY);
        ctx.lineTo(zCX + sweepLen * Math.sin(a), zCY - sweepLen * Math.cos(a));
        ctx.stroke();
      }
    }

    // ── Grid rings (adaptive to zoom, centered on zenith) ──
    ctx.strokeStyle = palette.radarGrid;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    const visRange = 90 / zoom;
    const ringStep = visRange > 60 ? 30 : visRange > 25 ? 10 : visRange > 10 ? 5 : visRange > 4 ? 2 : 1;
    const panDist = Math.sqrt(panX * panX + panY * panY);
    for (let elDeg = 0; elDeg < 90; elDeg += ringStep) {
      const r = R_MAX * zoom * (90 - elDeg) / 90;
      if (r - panDist > R_MAX + 5) continue;  // entirely outside clip
      ctx.beginPath();
      ctx.arc(zCX, zCY, r, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // ── Crosshairs (through zenith) ──
    ctx.beginPath();
    ctx.moveTo(zCX - sweepLen, zCY); ctx.lineTo(zCX + sweepLen, zCY);
    ctx.moveTo(zCX, zCY - sweepLen); ctx.lineTo(zCX, zCY + sweepLen);
    ctx.stroke();

    // ── Satellite blips ──
    const blips = uiStore.radarBlips;
    const count = uiStore.radarBlipCount;
    const bAz = beamStore.aimAz, bEl = beamStore.aimEl, bW = beamStore.beamWidth;

    for (let i = 0; i < count; i++) {
      const off = i * 4;
      const az = blips[off];
      const el = blips[off + 1];
      const flags = blips[off + 3];
      const isSelected = (flags & 1) !== 0;
      const isHover = i === hoverIdx;
      const inBeam = isInsideBeam(az, el, bAz, bEl, bW);
      const { x, y } = azElToXY(az, el);

      // Sweep afterglow: blips flash when swept, then decay (VFX only)
      const fade = vfx ? Math.pow(1 - (((sweepAngle - az * Math.PI / 180) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI), 2) : 1;

      if (isSelected) {
        if (vfx) ctx.globalAlpha = 0.7 + fade * 0.3;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(68, 255, 68, 0.15)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, 2 * Math.PI);
        ctx.fillStyle = palette.radarBlip;
        ctx.fill();
      } else if (isHover) {
        if (vfx) ctx.globalAlpha = 0.7 + fade * 0.3;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fillStyle = palette.radarBlip;
        ctx.fill();
      } else if (inBeam) {
        if (vfx) ctx.globalAlpha = 0.25 + fade * 0.75;
        ctx.beginPath();
        ctx.arc(x, y, vfx ? 2 + fade : 2.5, 0, 2 * Math.PI);
        ctx.fillStyle = palette.beamHighlight;
        ctx.fill();
      } else {
        if (vfx) ctx.globalAlpha = 0.06 + fade * 0.94;
        ctx.beginPath();
        ctx.arc(x, y, vfx ? 1.2 + fade * 1.5 : 1.5, 0, 2 * Math.PI);
        ctx.fillStyle = vfx ? palette.radarBlip : palette.radarBlipDim;
        ctx.fill();
      }
      if (vfx) ctx.globalAlpha = 1;
    }

    // ── Locked satellite orbit arc ──
    if (beamStore.locked && beamStore.lockPath.length > 1) {
      ctx.strokeStyle = palette.beamArc;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const p0 = azElToXY(beamStore.lockPath[0].az, beamStore.lockPath[0].el);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < beamStore.lockPath.length; i++) {
        const p = azElToXY(beamStore.lockPath[i].az, beamStore.lockPath[i].el);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // ── Beam reticle + cone circle ──
    {
      const { x: bx, y: by } = azElToXY(bAz, bEl);
      const reticleColor = beamStore.locked ? palette.beamReticleLocked : palette.beamReticle;

      // Beam width circle
      const beamRadiusPx = R_MAX * zoom * (bW / 2) / 90;  // zoom scales angular size
      ctx.strokeStyle = reticleColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(bx, by, beamRadiusPx, 0, 2 * Math.PI);
      ctx.stroke();

      // Reticle tick marks — 4 subtle strips outside the beam circle
      const gap = beamRadiusPx + 3;  // start just outside the circle
      const tick = 5;                 // tick length
      ctx.strokeStyle = beamStore.locked ? 'rgba(68, 255, 68, 0.35)' : 'rgba(255, 204, 51, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx - gap, by); ctx.lineTo(bx - gap - tick, by);
      ctx.moveTo(bx + gap, by); ctx.lineTo(bx + gap + tick, by);
      ctx.moveTo(bx, by - gap); ctx.lineTo(bx, by - gap - tick);
      ctx.moveTo(bx, by + gap); ctx.lineTo(bx, by + gap + tick);
      ctx.stroke();
    }

    ctx.restore();  // unclip

    // ── Outer ring ──
    ctx.strokeStyle = palette.radarGrid;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(CX, CY, R_MAX, 0, 2 * Math.PI);
    ctx.stroke();

    // ── Cardinal labels ──
    ctx.fillStyle = palette.radarText;
    ctx.font = `11px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom'; ctx.fillText('N', CX, CY - R_MAX - 6);
    ctx.textBaseline = 'top'; ctx.fillText('S', CX, CY + R_MAX + 6);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right'; ctx.fillText('W', CX - R_MAX - 8, CY);
    ctx.textAlign = 'left'; ctx.fillText('E', CX + R_MAX + 8, CY);

    // ── Elevation labels (on north axis, positioned relative to zenith) ──
    ctx.fillStyle = palette.radarGrid;
    ctx.font = `8px ${font}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (const frac of [1 / 3, 2 / 3]) {
      const elDeg = Math.round((90 - visRange + visRange * frac) / ringStep) * ringStep;
      if (elDeg <= 0 || elDeg >= 90) continue;
      const ly = zCY - R_MAX * zoom * (90 - elDeg) / 90;
      if (ly < CY - R_MAX + 5 || ly > CY + R_MAX - 5) continue;  // outside clip
      ctx.fillText(`${elDeg}°`, zCX + 3, ly + 2);
    }

    // ── Hover tooltip ──
    if (hoverIdx >= 0) {
      const off = hoverIdx * 4;
      const az = blips[off];
      const el = blips[off + 1];
      const satIdx = blips[off + 2];
      const sat = uiStore.getSatelliteByIndex?.(satIdx);
      const { x, y } = azElToXY(az, el);

      if (sat) {
        const label = sat.name;
        const detail = `Az ${az.toFixed(1)}°  El ${el.toFixed(1)}°`;

        ctx.font = `10px ${font}`;
        const nameW = ctx.measureText(label).width;
        const detailW = ctx.measureText(detail).width;
        const boxW = Math.max(nameW, detailW) + 12;
        const boxH = 30;

        let tx = x + 10;
        let ty = y - boxH - 4;
        if (tx + boxW > SIZE) tx = x - boxW - 10;
        if (ty < 0) ty = y + 10;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(tx, ty, boxW, boxH);
        ctx.strokeStyle = palette.radarGrid;
        ctx.lineWidth = 1;
        ctx.strokeRect(tx, ty, boxW, boxH);

        ctx.fillStyle = palette.radarBlip;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(label, tx + 6, ty + 3);
        ctx.fillStyle = palette.radarText;
        ctx.fillText(detail, tx + 6, ty + 16);
      }
    }

    // ── Info bar ──
    const infoY = SIZE + 4;
    ctx.fillStyle = palette.radarText;
    ctx.font = `10px ${font}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const countLabel = zoom > 1.05 ? `${count} vis  ${zoom.toFixed(1)}×` : `${count} above horizon`;
    ctx.fillText(countLabel, 8, infoY);

    if (beamStore.locked) {
      ctx.textAlign = 'right';
      ctx.fillStyle = palette.beamReticleLocked;
      ctx.fillText(`TRACKING ${beamStore.lockedSatName}`, SIZE - 8, infoY);
    } else if (hoverIdx >= 0) {
      const satIdx = blips[hoverIdx * 4 + 2];
      const sat = uiStore.getSatelliteByIndex?.(satIdx);
      if (sat) {
        ctx.textAlign = 'right';
        ctx.fillText(`${sat.noradId}`, SIZE - 8, infoY);
      }
    }

    ctx.restore();

    if (uiStore.radarOpen) {
      animFrameId = requestAnimationFrame(drawFrame);
    }
  }

  function initCanvas() {
    if (!canvasEl) return;
    ctx = initHiDPICanvas(canvasEl, SIZE, SIZE + INFO_H);
  }

  $effect(() => {
    if (canvasEl) {
      initCanvas();
      canvasEl.addEventListener('wheel', onCanvasWheel, { passive: false });
      animFrameId = requestAnimationFrame(drawFrame);
      return () => {
        cancelAnimationFrame(animFrameId);
        canvasEl!.removeEventListener('wheel', onCanvasWheel);
      };
    }
  });
</script>

{#snippet radarIcon()}<span class="title-icon">{@html ICON_RADAR}</span>{/snippet}
{#snippet headerExtra()}
  <div class="radar-header-extra">
    <Button size="xs" variant="ghost" active={beamStore.coneVisible} onclick={() => beamStore.setConeVisible(!beamStore.coneVisible)}>Cone</Button>
    <Button size="xs" variant="ghost" active={vfx} onclick={() => uiStore.setToggle('radarVfx', !uiStore.radarVfx)}>VFX</Button>
  </div>
{/snippet}

{#snippet windowContent()}
  <div class="radar">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <canvas
      bind:this={canvasEl}
      width={SIZE} height={SIZE + INFO_H}
      style="touch-action:none; cursor:{draggingReticle ? 'none' : 'crosshair'}; width:{SIZE}px; height:{SIZE + INFO_H}px"
      onpointermove={onCanvasPointerMove}
      onpointerdown={onCanvasPointerDown}
      onpointerup={onCanvasPointerUp}
      onpointercancel={onCanvasPointerUp}
      onlostpointercapture={onCanvasLostCapture}
    ></canvas>
  </div>
  <div class="radar-controls">
    <label>Azimuth</label>
    <input class="radar-input" type="number" min="0" max="360" step="0.01"
      bind:value={inputAz}
      onfocus={() => editingAim = true}
      onblur={applyAim}
      onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    <span class="radar-unit">°</span>
    <label>Elevation</label>
    <input class="radar-input" type="number" min="0" max="90" step="0.01"
      bind:value={inputEl}
      onfocus={() => editingAim = true}
      onblur={applyAim}
      onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    <span class="radar-unit">°</span>
    <label>Beam Width</label>
    <input class="radar-input" type="number" min="0" step="0.1"
      bind:value={inputBW}
      onfocus={() => editingBW = true}
      onblur={applyBW}
      onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    <span class="radar-unit">°</span>
  </div>
{/snippet}

{#if uiStore.isMobile}
  <MobileSheet id="radar" title="Radar" icon={radarIcon}>
    {@render windowContent()}
  </MobileSheet>
{:else}
  <DraggableWindow id="radar" title="Radar" icon={radarIcon} {headerExtra} bind:open={uiStore.radarOpen} initialX={9999} initialY={300} noPad>
    {@render windowContent()}
  </DraggableWindow>
{/if}

<style>
  .radar-header-extra {
    display: flex;
    align-items: center;
    margin-left: auto;
    margin-right: 8px;
  }
  .radar {
    display: flex;
    justify-content: center;
  }
  .radar canvas {
    display: block;
  }
  .radar-controls {
    padding: 8px 8px;
    display: flex;
    align-items: center;
    gap: 4px;
    border-top: 1px solid var(--border);
  }
  .radar-controls label {
    font-size: 10px;
    color: var(--text-ghost);
    flex-shrink: 0;
    margin-left: 4px;
  }
  .radar-controls label:first-child {
    margin-left: 0;
  }
  .radar-unit {
    font-size: 10px;
    color: var(--text-ghost);
  }
  .radar-input {
    width: 58px;
    font-size: 10px;
    font-family: 'Overpass Mono', monospace;
    background: var(--ui-bg);
    border: 1px solid var(--border);
    color: var(--text-dim);
    padding: 1px 3px;
    box-sizing: border-box;
  }
  .radar-input:hover { border-color: var(--border-hover); }
  .radar-input:focus { border-color: var(--border-hover); outline: none; color: var(--text); }
  .radar-input::-webkit-inner-spin-button { display: none; }
</style>
