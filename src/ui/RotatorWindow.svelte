<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import MobileSheet from './shared/MobileSheet.svelte';
  import Button from './shared/Button.svelte';
  import Checkbox from './shared/Checkbox.svelte';
  import Slider from './shared/Slider.svelte';
  import Select from './shared/Select.svelte';
  import Input from './shared/Input.svelte';
  import InfoTip from './shared/InfoTip.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { beamStore, isInsideBeam } from '../stores/beam.svelte';
  import { rotatorStore, PARK_PRESETS, ANTENNA_PRESETS, type ParkPreset, type PassEndAction } from '../stores/rotator.svelte';
  import { timeStore } from '../stores/time.svelte';
  import { satColorRgba } from '../constants';
  import { ViewMode } from '../types';
  import { chart, pointerHitRadius } from './shared/touch-metrics';
  import { fmtCountdown } from '../format';

  let parkPos = $derived.by(() => {
    if (rotatorStore.parkPreset === 'custom') return { az: rotatorStore.parkAz, el: rotatorStore.parkEl };
    return PARK_PRESETS[rotatorStore.parkPreset];
  });
  import { ICON_RADAR } from './shared/icons';
  import { palette, parseRgba } from './shared/theme';
  import { initHiDPICanvas } from './shared/canvas';

  // Sweep line animation — phosphor sim runs at fixed tick rate
  // All original values (0.014 sweep, 0.028 decay) were tuned at 240fps
  const PHOSPHOR_HZ = 200;
  const PHOSPHOR_TICK = 1 / PHOSPHOR_HZ;
  const PHOSPHOR_MAX_TICKS = Math.ceil(PHOSPHOR_HZ / 15);
  const SWEEP_PER_TICK = 0.014 * (240 / PHOSPHOR_HZ);
  const DECAY_ALPHA = 1 - Math.pow(1 - 0.028, 240 / PHOSPHOR_HZ);

  // ── CRT phosphor palette (derived from theme radar colors) ──
  // Rebuilt when CRT canvases init or theme changes; avoids per-frame parsing
  let crt = {
    decayFill: `rgba(5,10,5,${DECAY_ALPHA})`,
    sweepLine: 'rgba(60,200,60,0.2)',
    sweepTrail: 'rgba(50,180,50,0.07)',
    flashSelected: 'rgba(200,255,200,0.95)',
    flashBeam: 'rgba(180,255,130,0.9)',
    flashNormal: 'rgba(100,255,100,0.85)',
    bloomBright: 'rgba(68,255,68,0.25)',
    bloomDim: 'rgba(68,255,68,0.15)',
    glowRing: 'rgba(68,255,68,0.15)',
    tickLocked: 'rgba(68,255,68,0.35)',
    tickUnlocked: 'rgba(255,204,51,0.35)',
    rotatorDash: 'rgba(255,102,204,0.3)',
    tooltipBg: 'rgba(0,0,0,0.85)',
    scanline: 'rgba(0,0,0,0.05)',
    vignetteA: 'rgba(0,0,0,0)',
    vignetteB: 'rgba(0,0,0,0.3)',
    vignetteC: 'rgba(0,0,0,0.7)',
  };

  function buildCrtPalette() {
    const blip = parseRgba(palette.radarBlip);
    const bg = parseRgba(palette.radarBg);
    const reticle = parseRgba(palette.beamReticle);
    const rot = parseRgba(palette.rotator);
    const br = Math.round(blip.r * 255), bg_ = Math.round(blip.g * 255), bb = Math.round(blip.b * 255);
    const bgr = Math.round(bg.r * 255), bgg = Math.round(bg.g * 255), bgb = Math.round(bg.b * 255);
    const rr = Math.round(reticle.r * 255), rg = Math.round(reticle.g * 255), rb = Math.round(reticle.b * 255);
    const rotr = Math.round(rot.r * 255), rotg = Math.round(rot.g * 255), rotb = Math.round(rot.b * 255);
    // Bright version of blip for flash highlights
    const hr = Math.min(255, br + Math.round((255 - br) * 0.6));
    const hg = Math.min(255, bg_ + Math.round((255 - bg_) * 0.6));
    const hb = Math.min(255, bb + Math.round((255 - bb) * 0.6));
    crt = {
      decayFill: `rgba(${bgr},${bgg},${bgb},${DECAY_ALPHA})`,
      sweepLine: `rgba(${br},${bg_},${bb},0.2)`,
      sweepTrail: `rgba(${br},${bg_},${bb},0.07)`,
      flashSelected: `rgba(${hr},${hg},${hb},0.95)`,
      flashBeam: `rgba(${Math.round((br + hr) / 2)},${Math.round((bg_ + hg) / 2)},${Math.round((bb + hb) / 2)},0.9)`,
      flashNormal: `rgba(${br},${bg_},${bb},0.85)`,
      bloomBright: `rgba(${br},${bg_},${bb},0.25)`,
      bloomDim: `rgba(${br},${bg_},${bb},0.15)`,
      glowRing: `rgba(${br},${bg_},${bb},0.15)`,
      tickLocked: `rgba(${br},${bg_},${bb},0.35)`,
      tickUnlocked: `rgba(${rr},${rg},${rb},0.35)`,
      rotatorDash: `rgba(${rotr},${rotg},${rotb},0.3)`,
      tooltipBg: `rgba(${bgr},${bgg},${bgb},0.85)`,
      scanline: `rgba(${bgr},${bgg},${bgb},0.08)`,
      vignetteA: `rgba(${bgr},${bgg},${bgb},0)`,
      vignetteB: `rgba(${bgr},${bgg},${bgb},0.35)`,
      vignetteC: `rgba(${bgr},${bgg},${bgb},0.75)`,
    };
  }

  let tab = $state<'radar' | 'setup'>('radar');
  let rateDisplay = $derived(`${(rotatorStore.updateIntervalMs / 1000).toFixed(1)}s`);
  let tolDisplay = $derived(`${rotatorStore.tolerance.toFixed(1)}°`);

  let activeAntennaPreset = $derived.by(() => {
    for (const [key, p] of Object.entries(ANTENNA_PRESETS)) {
      if (beamStore.beamWidth === p.beamWidth && rotatorStore.tolerance === p.tolerance && rotatorStore.updateIntervalMs === p.updateMs)
        return key;
    }
    return null;
  });

  function applyAntennaPreset(key: string) {
    const p = ANTENNA_PRESETS[key];
    if (!p) return;
    beamStore.setBeamWidth(p.beamWidth);
    rotatorStore.setTolerance(p.tolerance);
    rotatorStore.setUpdateInterval(p.updateMs);
  }

  // In sky view, rotate the radar so the viewer's look direction is at the top
  let headingRad = $derived(uiStore.viewMode === ViewMode.VIEW_SKY ? uiStore.skyHeading : 0);

  const SIZE = 400;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R_MAX = (SIZE - 60) / 2;
  const INFO_H = 20;
  const font = "'Overpass Mono', monospace";

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let ctx: CanvasRenderingContext2D | null = null;
  let animFrameId = 0;

  let sweepAngle = 0;
  let lastFrameTime = 0;
  let phosphorAccum = 0;

  // Info bar state (HTML overlay)
  let infoCount = $state(0);
  let infoHoverLabel = $state('');

  // Hover state (-1 = none, >= 0 = satellite blip index, HOVER_SUN/HOVER_MOON = celestial)
  const HOVER_SUN = -2;
  const HOVER_MOON = -3;
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

  // VFX: CRT radar simulation (persisted via uiStore)
  let vfx = $derived(uiStore.radarVfx);

  // CRT phosphor buffer — persistent offscreen canvas that slowly fades
  let phosphorCanvas: HTMLCanvasElement | null = null;
  let phosphorCtx: CanvasRenderingContext2D | null = null;
  let scanlineCanvas: HTMLCanvasElement | null = null;
  let vignetteCanvas: HTMLCanvasElement | null = null;
  let prevSweepAngle = 0;
  let prevPaletteKey = '';

  function buildPhosphor() {
    const c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    const pc = c.getContext('2d')!;
    // Start with dark background
    pc.fillStyle = palette.radarBg;
    pc.fillRect(0, 0, SIZE, SIZE);
    phosphorCanvas = c;
    phosphorCtx = pc;
  }

  function buildScanlines() {
    const c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    const sc = c.getContext('2d')!;
    sc.strokeStyle = crt.scanline;
    sc.lineWidth = 1;
    for (let y = 0; y < SIZE; y += 2) {
      sc.beginPath();
      sc.moveTo(0, y + 0.5);
      sc.lineTo(SIZE, y + 0.5);
      sc.stroke();
    }
    scanlineCanvas = c;
  }

  function buildVignette() {
    const c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    const vc = c.getContext('2d')!;
    const grad = vc.createRadialGradient(CX, CY, 0, CX, CY, R_MAX);
    grad.addColorStop(0, crt.vignetteA);
    grad.addColorStop(0.55, crt.vignetteA);
    grad.addColorStop(0.85, crt.vignetteB);
    grad.addColorStop(1.0, crt.vignetteC);
    vc.fillStyle = grad;
    vc.beginPath();
    vc.arc(CX, CY, R_MAX, 0, 2 * Math.PI);
    vc.fill();
    vignetteCanvas = c;
  }

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
    const azRad = az * Math.PI / 180 - headingRad;
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
    let az = Math.atan2(dx, dy) * 180 / Math.PI + headingRad * 180 / Math.PI;
    if (az < 0) az += 360;
    if (az >= 360) az -= 360;
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
      return;
    }

    // Find nearest blip for hover (satellites + celestial bodies)
    const blips = uiStore.radarBlips;
    const count = uiStore.radarBlipCount;
    let bestDist = pointerHitRadius(e);
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
    // Check sun/moon markers
    const showCelestial = uiStore.radarShowCelestial || beamStore.lockedBodyType !== 'satellite';
    if (showCelestial) {
      const sunAE = uiStore.radarSunAzEl;
      if (sunAE) {
        const { x, y } = azElToXY(sunAE.az, sunAE.el);
        const dist = Math.sqrt((x - mouseX) ** 2 + (y - mouseY) ** 2);
        if (dist < bestDist) { bestDist = dist; bestIdx = HOVER_SUN; }
      }
      const moonAE = uiStore.radarMoonAzEl;
      if (moonAE) {
        const { x, y } = azElToXY(moonAE.az, moonAE.el);
        const dist = Math.sqrt((x - mouseX) ** 2 + (y - mouseY) ** 2);
        if (dist < bestDist) { bestDist = dist; bestIdx = HOVER_MOON; }
      }
    }
    hoverIdx = bestIdx;
    if (canvasEl && !draggingReticle) canvasEl.style.cursor = bestIdx !== -1 ? 'pointer' : beamStore.locked ? 'default' : 'crosshair';
  }

  function onCanvasPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const p = canvasToLogical(e.clientX, e.clientY);
    const { az, el } = xyToAzEl(p.x, p.y);

    // Click near a blip → toggle track (click again to unlock)
    if (hoverIdx === HOVER_SUN) {
      if (beamStore.locked && beamStore.lockedBodyType === 'sun') beamStore.unlock();
      else beamStore.lockToBody('sun');
      e.preventDefault();
      return;
    }
    if (hoverIdx === HOVER_MOON) {
      if (beamStore.locked && beamStore.lockedBodyType === 'moon') beamStore.unlock();
      else beamStore.lockToBody('moon');
      e.preventDefault();
      return;
    }
    if (hoverIdx >= 0) {
      const blips = uiStore.radarBlips;
      const satAz = blips[hoverIdx * 4];
      const satEl = blips[hoverIdx * 4 + 1];
      const satIdx = blips[hoverIdx * 4 + 2];
      const sat = uiStore.getSatelliteByIndex?.(satIdx);
      if (sat) {
        if (beamStore.locked && beamStore.lockedNoradId === sat.noradId) {
          beamStore.unlock();
        } else {
          uiStore.onSelectSatellite?.(sat.noradId);
          beamStore.lockToSatellite(sat.noradId, sat.name);
          beamStore.setAim(satAz, satEl);
        }
      }
      e.preventDefault();
      return;
    }

    // Click empty space → move reticle + start drag (only when not locked)
    if (beamStore.locked) return;
    beamStore.setAim(az, el);
    rotatorStore.nudge();
    draggingReticle = true;
    if (canvasEl) canvasEl.style.cursor = 'none';
    canvasEl!.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onCanvasPointerUp(_e: PointerEvent) {
    if (draggingReticle) rotatorStore.nudge();
    draggingReticle = false;
    if (canvasEl) canvasEl.style.cursor = hoverIdx !== -1 ? 'pointer' : beamStore.locked ? 'default' : 'crosshair';
  }

  function onCanvasLostCapture(_e: PointerEvent) {
    draggingReticle = false;
    if (canvasEl) canvasEl.style.cursor = beamStore.locked ? 'default' : 'crosshair';
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

  function drawFrame(now: number) {
    if (!ctx || !canvasEl) { animFrameId = requestAnimationFrame(drawFrame); return; }
    const dt = lastFrameTime ? (now - lastFrameTime) / 1000 : 0;
    lastFrameTime = now;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    // Rebuild CRT palette + canvases on theme change
    const pKey = palette.radarBg + palette.radarBlip;
    if (pKey !== prevPaletteKey) {
      prevPaletteKey = pKey;
      buildCrtPalette();
      if (vfx && phosphorCtx) {
        buildPhosphor();
        buildScanlines();
        buildVignette();
      }
    }

    // ── Background ──
    ctx.fillStyle = palette.radarBg;
    ctx.fillRect(0, 0, SIZE, SIZE + INFO_H);

    // Clip to circle for grid + sweep + blips
    ctx.save();
    ctx.beginPath();
    ctx.arc(CX, CY, R_MAX + 1, 0, 2 * Math.PI);
    ctx.clip();

    const zCX = CX + panX, zCY = CY + panY;
    const sweepLen = R_MAX * zoom + 1;
    const TWO_PI = 2 * Math.PI;
    const visRange = 90 / zoom;
    const ringStep = visRange > 60 ? 30 : visRange > 25 ? 10 : visRange > 10 ? 5 : visRange > 4 ? 2 : 1;
    const panDist = Math.sqrt(panX * panX + panY * panY);
    const blips = uiStore.radarBlips;
    const count = uiStore.radarBlipCount;
    const bAz = beamStore.aimAz, bEl = beamStore.aimEl, bW = beamStore.beamWidth;

    // ═══ VFX: phosphor buffer approach (fixed 60Hz tick) ═══
    if (vfx && phosphorCtx && phosphorCanvas) {
      const pc = phosphorCtx;

      // Run phosphor simulation at fixed 60Hz — accumulate real time, consume in ticks
      phosphorAccum = Math.min(phosphorAccum + dt, PHOSPHOR_MAX_TICKS * PHOSPHOR_TICK);
      let ticks = Math.floor(phosphorAccum / PHOSPHOR_TICK);
      phosphorAccum -= ticks * PHOSPHOR_TICK;

      for (let t = 0; t < ticks; t++) {
        // Advance sweep
        // Advance sweep
        sweepAngle += SWEEP_PER_TICK;
        if (sweepAngle > TWO_PI) sweepAngle -= TWO_PI;

        // Fade the phosphor buffer — this creates the persistence decay
        pc.fillStyle = crt.decayFill;
        pc.fillRect(0, 0, SIZE, SIZE);

        // Draw bright sweep line onto phosphor
        const edgeA = sweepAngle - Math.PI / 2;
        const sx = CX + sweepLen * Math.cos(edgeA);
        const sy = CY + sweepLen * Math.sin(edgeA);
        pc.strokeStyle = crt.sweepLine;
        pc.lineWidth = 1.5;
        pc.beginPath();
        pc.moveTo(CX, CY);
        pc.lineTo(sx, sy);
        pc.stroke();
        // Dimmer trailing line
        const trailA = sweepAngle - 0.04 - Math.PI / 2;
        pc.strokeStyle = crt.sweepTrail;
        pc.lineWidth = 1;
        pc.beginPath();
        pc.moveTo(CX, CY);
        pc.lineTo(CX + sweepLen * Math.cos(trailA), CY + sweepLen * Math.sin(trailA));
        pc.stroke();

        // Draw blips onto phosphor ONLY when sweep passes them
        for (let i = 0; i < count; i++) {
          const off = i * 4;
          const az = blips[off];
          const el = blips[off + 1];
          const flags = blips[off + 3];
          const isSelected = (flags & 1) !== 0;
          const inBeam = isInsideBeam(az, el, bAz, bEl, bW);

          // How far behind the sweep is this blip?
          const blipAngle = az * Math.PI / 180 - headingRad;
          const angDist = ((sweepAngle - blipAngle) % TWO_PI + TWO_PI) % TWO_PI;
          // Only paint when sweep is within ~3° of the blip
          if (angDist < 0.06 || angDist > TWO_PI - 0.02) {
            const r = R_MAX * (90 - Math.max(0, el)) / 90;
            const bx = r * Math.sin(blipAngle) + CX;
            const by = -r * Math.cos(blipAngle) + CY;
            const radius = isSelected ? 4 : inBeam ? 3 : 2.5;

            // Bright white-green flash
            pc.fillStyle = isSelected ? crt.flashSelected
                         : inBeam    ? crt.flashBeam
                         :             crt.flashNormal;
            pc.beginPath();
            pc.arc(bx, by, radius, 0, TWO_PI);
            pc.fill();

            // Bloom glow
            if (isSelected || inBeam) {
              pc.fillStyle = isSelected ? crt.bloomBright : crt.bloomDim;
              pc.beginPath();
              pc.arc(bx, by, radius + 4, 0, TWO_PI);
              pc.fill();
            }
          }
        }
      }

      // Composite phosphor buffer onto main canvas
      ctx.drawImage(phosphorCanvas, 0, 0);

      // Dim static blips so satellites are always faintly visible
      for (let i = 0; i < count; i++) {
        const off = i * 4;
        const { x, y } = azElToXY(blips[off], blips[off + 1]);
        const flags = blips[off + 3];
        const isSelected = (flags & 1) !== 0;
        const inBeam = isInsideBeam(blips[off], blips[off + 1], bAz, bEl, bW);
        ctx.fillStyle = inBeam ? palette.beamHighlight : palette.radarBlipDim;
        ctx.globalAlpha = isSelected ? 0.6 : 0.4;
        ctx.beginPath();
        ctx.arc(x, y, isSelected ? 2.5 : 1.5, 0, TWO_PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Draw grid ON TOP of phosphor (so it's always crisp, not decaying)
      ctx.strokeStyle = palette.radarGrid;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      for (let elDeg = 0; elDeg < 90; elDeg += ringStep) {
        const r = R_MAX * zoom * (90 - elDeg) / 90;
        if (r - panDist > R_MAX + 5) continue;
        ctx.beginPath();
        ctx.arc(zCX, zCY, r, 0, TWO_PI);
        ctx.stroke();
      }
      // N-S / E-W crosshair (rotated by heading)
      const nsX = -sweepLen * Math.sin(headingRad);
      const nsY = -sweepLen * Math.cos(headingRad);
      const ewX = sweepLen * Math.cos(headingRad);
      const ewY = -sweepLen * Math.sin(headingRad);
      ctx.beginPath();
      ctx.moveTo(zCX - nsX, zCY - nsY); ctx.lineTo(zCX + nsX, zCY + nsY);
      ctx.moveTo(zCX - ewX, zCY - ewY); ctx.lineTo(zCX + ewX, zCY + ewY);
      ctx.stroke();

      // Draw hover ring on main canvas (interactive, not on phosphor)
      if (hoverIdx >= 0) {
        const hOff = hoverIdx * 4;
        const { x: hx, y: hy } = azElToXY(blips[hOff], blips[hOff + 1]);
        ctx.strokeStyle = palette.radarBlip;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(hx, hy, chart.dotLarge, 0, TWO_PI);
        ctx.stroke();
      } else if (hoverIdx === HOVER_SUN && uiStore.radarSunAzEl) {
        const { x: hx, y: hy } = azElToXY(uiStore.radarSunAzEl.az, uiStore.radarSunAzEl.el);
        ctx.strokeStyle = 'rgba(255,200,50,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(hx, hy, chart.dotLarge, 0, TWO_PI);
        ctx.stroke();
      } else if (hoverIdx === HOVER_MOON && uiStore.radarMoonAzEl) {
        const { x: hx, y: hy } = azElToXY(uiStore.radarMoonAzEl.az, uiStore.radarMoonAzEl.el);
        ctx.strokeStyle = 'rgba(200,200,220,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(hx, hy, chart.dotLarge, 0, TWO_PI);
        ctx.stroke();
      }

    } else {
      // ═══ Non-VFX: standard clear-and-redraw ═══

      // Grid rings
      ctx.strokeStyle = palette.radarGrid;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      for (let elDeg = 0; elDeg < 90; elDeg += ringStep) {
        const r = R_MAX * zoom * (90 - elDeg) / 90;
        if (r - panDist > R_MAX + 5) continue;
        ctx.beginPath();
        ctx.arc(zCX, zCY, r, 0, TWO_PI);
        ctx.stroke();
      }
      // N-S / E-W crosshair (rotated by heading)
      {
        const nsX = -sweepLen * Math.sin(headingRad);
        const nsY = -sweepLen * Math.cos(headingRad);
        const ewX = sweepLen * Math.cos(headingRad);
        const ewY = -sweepLen * Math.sin(headingRad);
        ctx.beginPath();
        ctx.moveTo(zCX - nsX, zCY - nsY); ctx.lineTo(zCX + nsX, zCY + nsY);
        ctx.moveTo(zCX - ewX, zCY - ewY); ctx.lineTo(zCX + ewX, zCY + ewY);
        ctx.stroke();
      }

      // Blips
      for (let i = 0; i < count; i++) {
        const off = i * 4;
        const az = blips[off];
        const el = blips[off + 1];
        const flags = blips[off + 3];
        const isSelected = (flags & 1) !== 0;
        const isHover = i === hoverIdx;
        const inBeam = isInsideBeam(az, el, bAz, bEl, bW);
        const { x, y } = azElToXY(az, el);

        if (isSelected) {
          ctx.beginPath();
          ctx.arc(x, y, chart.dotLarge + 2, 0, TWO_PI);
          ctx.fillStyle = crt.glowRing;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x, y, chart.dotSmall + 0.5, 0, TWO_PI);
          ctx.fillStyle = palette.radarBlip;
          ctx.fill();
        } else if (isHover) {
          ctx.beginPath();
          ctx.arc(x, y, chart.dotSmall, 0, TWO_PI);
          ctx.fillStyle = palette.radarBlip;
          ctx.fill();
        } else if (inBeam) {
          ctx.beginPath();
          ctx.arc(x, y, chart.dotSmall - 0.5, 0, TWO_PI);
          ctx.fillStyle = palette.beamHighlight;
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, chart.dotSmall - 1.5, 0, TWO_PI);
          ctx.fillStyle = palette.radarBlipDim;
          ctx.fill();
        }
      }
    }

    // ── Sun/Moon celestial markers ──
    {
      const showCelestial = uiStore.radarShowCelestial || beamStore.lockedBodyType !== 'satellite';
      if (showCelestial) {
        const sunAE = uiStore.radarSunAzEl;
        if (sunAE) {
          const { x: sx, y: sy } = azElToXY(sunAE.az, sunAE.el);
          const isTracked = beamStore.locked && beamStore.lockedBodyType === 'sun';
          const r = isTracked ? 5 : 4;
          // Sun: golden filled circle with rays
          ctx.fillStyle = 'rgba(255,200,50,0.85)';
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, 2 * Math.PI);
          ctx.fill();
          if (isTracked) {
            ctx.strokeStyle = 'rgba(255,200,50,0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(sx, sy, r + 3, 0, 2 * Math.PI);
            ctx.stroke();
          }
          ctx.fillStyle = 'rgba(255,200,50,0.7)';
          ctx.font = `8px ${font}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText('☀', sx + r + 3, sy);
        }
        const moonAE = uiStore.radarMoonAzEl;
        if (moonAE) {
          const { x: mx, y: my } = azElToXY(moonAE.az, moonAE.el);
          const isTracked = beamStore.locked && beamStore.lockedBodyType === 'moon';
          const r = isTracked ? 5 : 4;
          // Moon: silver filled circle
          ctx.fillStyle = 'rgba(200,200,220,0.85)';
          ctx.beginPath();
          ctx.arc(mx, my, r, 0, 2 * Math.PI);
          ctx.fill();
          if (isTracked) {
            ctx.strokeStyle = 'rgba(200,200,220,0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(mx, my, r + 3, 0, 2 * Math.PI);
            ctx.stroke();
          }
          ctx.fillStyle = 'rgba(200,200,220,0.7)';
          ctx.font = `8px ${font}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText('☽', mx + r + 3, my);
        }
      }
    }

    // ── Locked satellite orbit arc ──
    if (beamStore.locked && beamStore.lockPath.length > 1) {
      const satInfo = uiStore.selectedSatData.find(s => s.noradId === beamStore.lockedNoradId);
      ctx.strokeStyle = satInfo ? satColorRgba(satInfo.colorIndex, 0.6) : palette.beamArc;
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

      const beamRadiusPx = R_MAX * zoom * (bW / 2) / 90;
      ctx.strokeStyle = reticleColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(bx, by, beamRadiusPx, 0, 2 * Math.PI);
      ctx.stroke();

      const gap = beamRadiusPx + 3;
      const tick = 5;
      ctx.strokeStyle = beamStore.locked ? crt.tickLocked : crt.tickUnlocked;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx - gap, by); ctx.lineTo(bx - gap - tick, by);
      ctx.moveTo(bx + gap, by); ctx.lineTo(bx + gap + tick, by);
      ctx.moveTo(bx, by - gap); ctx.lineTo(bx, by - gap - tick);
      ctx.moveTo(bx, by + gap); ctx.lineTo(bx, by + gap + tick);
      ctx.stroke();
    }

    // ── Rotator actual position marker ──
    if (rotatorStore.status === 'connected' && rotatorStore.actualAz !== null && rotatorStore.actualEl !== null) {
      const { x: rx, y: ry } = azElToXY(rotatorStore.actualAz, rotatorStore.actualEl);

      const s = 5;
      ctx.strokeStyle = palette.rotator;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rx, ry - s);
      ctx.lineTo(rx + s, ry);
      ctx.lineTo(rx, ry + s);
      ctx.lineTo(rx - s, ry);
      ctx.closePath();
      ctx.stroke();

      if (rotatorStore.targetAz !== null && rotatorStore.targetEl !== null) {
        const { x: tx, y: ty } = azElToXY(rotatorStore.targetAz, rotatorStore.targetEl);
        ctx.strokeStyle = crt.rotatorDash;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // ── CRT overlays (inside clip) ──
    if (vfx) {
      if (scanlineCanvas) ctx.drawImage(scanlineCanvas, 0, 0);
      if (vignetteCanvas) ctx.drawImage(vignetteCanvas, 0, 0);
    }

    ctx.restore();  // unclip

    // ── Outer ring ──
    ctx.strokeStyle = palette.radarGrid;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(CX, CY, R_MAX, 0, 2 * Math.PI);
    ctx.stroke();

    // ── Cardinal labels (rotate with heading) ──
    ctx.fillStyle = palette.radarText;
    ctx.font = `11px ${font}`;
    const cardinals: [string, number][] = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
    const labelR = R_MAX + 10;
    for (const [label, deg] of cardinals) {
      const a = (deg * Math.PI / 180) - headingRad;
      const lx = CX + labelR * Math.sin(a);
      const ly = CY - labelR * Math.cos(a);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx, ly);
    }

    // ── Elevation labels (along north axis, rotated by heading) ──
    ctx.fillStyle = palette.radarLabel;
    ctx.font = `8px ${font}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (const frac of [1 / 3, 2 / 3]) {
      const elDeg = Math.round((90 - visRange + visRange * frac) / ringStep) * ringStep;
      if (elDeg <= 0 || elDeg >= 90) continue;
      const elR = R_MAX * zoom * (90 - elDeg) / 90;
      const lx = zCX + elR * Math.sin(-headingRad) + 3 * Math.cos(headingRad);
      const ly = zCY - elR * Math.cos(-headingRad) + 3 * Math.sin(headingRad);
      const dist = Math.sqrt((lx - CX) ** 2 + (ly - CY) ** 2);
      if (dist > R_MAX - 5) continue;
      ctx.fillText(`${elDeg}°`, lx, ly);
    }

    // ── Hover tooltip ──
    {
      let tooltipLabel: string | null = null;
      let tooltipDetail = '';
      let tooltipAction = '';
      let tooltipX = 0, tooltipY = 0;
      let tooltipColor = palette.radarBlip;

      if (hoverIdx === HOVER_SUN && uiStore.radarSunAzEl) {
        const ae = uiStore.radarSunAzEl;
        ({ x: tooltipX, y: tooltipY } = azElToXY(ae.az, ae.el));
        tooltipLabel = 'Sun';
        tooltipDetail = `Az ${ae.az.toFixed(1)}°  El ${ae.el.toFixed(1)}°`;
        tooltipColor = 'rgba(255,200,50,0.9)';
        tooltipAction = beamStore.locked && beamStore.lockedBodyType === 'sun' ? 'Click to untrack' : 'Click to track';
      } else if (hoverIdx === HOVER_MOON && uiStore.radarMoonAzEl) {
        const ae = uiStore.radarMoonAzEl;
        ({ x: tooltipX, y: tooltipY } = azElToXY(ae.az, ae.el));
        tooltipLabel = 'Moon';
        tooltipDetail = `Az ${ae.az.toFixed(1)}°  El ${ae.el.toFixed(1)}°`;
        tooltipColor = 'rgba(200,200,220,0.9)';
        tooltipAction = beamStore.locked && beamStore.lockedBodyType === 'moon' ? 'Click to untrack' : 'Click to track';
      } else if (hoverIdx >= 0) {
        const off = hoverIdx * 4;
        const az = blips[off];
        const el = blips[off + 1];
        const satIdx = blips[off + 2];
        const sat = uiStore.getSatelliteByIndex?.(satIdx);
        if (sat) {
          ({ x: tooltipX, y: tooltipY } = azElToXY(az, el));
          tooltipLabel = sat.name;
          tooltipDetail = `Az ${az.toFixed(1)}°  El ${el.toFixed(1)}°`;
          tooltipAction = beamStore.locked && beamStore.lockedNoradId === sat.noradId ? 'Click to untrack' : 'Click to track';
        }
      }

      if (tooltipLabel) {
        ctx.font = `10px ${font}`;
        const nameW = ctx.measureText(tooltipLabel).width;
        const detailW = ctx.measureText(tooltipDetail).width;
        ctx.font = `9px ${font}`;
        const actionW = tooltipAction ? ctx.measureText(tooltipAction).width : 0;
        const boxW = Math.max(nameW, detailW, actionW) + 12;
        const boxH = tooltipAction ? 42 : 30;

        let tx = tooltipX + 10;
        let ty = tooltipY - boxH - 4;
        if (tx + boxW > SIZE) tx = tooltipX - boxW - 10;
        if (ty < 0) ty = tooltipY + 10;

        ctx.fillStyle = crt.tooltipBg;
        ctx.fillRect(tx, ty, boxW, boxH);
        ctx.strokeStyle = palette.radarGrid;
        ctx.lineWidth = 1;
        ctx.strokeRect(tx, ty, boxW, boxH);

        ctx.font = `10px ${font}`;
        ctx.fillStyle = tooltipColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(tooltipLabel, tx + 6, ty + 3);
        ctx.fillStyle = palette.radarText;
        ctx.fillText(tooltipDetail, tx + 6, ty + 16);
        if (tooltipAction) {
          ctx.font = `9px ${font}`;
          ctx.fillStyle = palette.textGhost;
          ctx.fillText(tooltipAction, tx + 6, ty + 29);
        }
      }
    }

    // ── Update info bar state (HTML overlay) ──
    infoCount = count;
    if (beamStore.locked) {
      infoHoverLabel = beamStore.lockedSatName ?? '';
    } else if (hoverIdx === HOVER_SUN) {
      infoHoverLabel = 'Sun';
    } else if (hoverIdx === HOVER_MOON) {
      infoHoverLabel = 'Moon';
    } else if (hoverIdx >= 0) {
      const satIdx = blips[hoverIdx * 4 + 2];
      const sat = uiStore.getSatelliteByIndex?.(satIdx);
      infoHoverLabel = sat ? `${sat.noradId}` : '';
    } else {
      infoHoverLabel = '';
    }

    ctx.restore();

    if (uiStore.rotatorOpen) {
      animFrameId = requestAnimationFrame(drawFrame);
    }
  }

  function initCanvas() {
    if (!canvasEl) return;
    ctx = initHiDPICanvas(canvasEl, SIZE, SIZE + INFO_H);
  }

  function initCrtCanvases() {
    buildCrtPalette();
    buildPhosphor();
    buildScanlines();
    buildVignette();
  }

  function destroyCrtCanvases() {
    phosphorCanvas = phosphorCtx = scanlineCanvas = vignetteCanvas = null;
  }

  $effect(() => {
    if (vfx && canvasEl) {
      initCrtCanvases();
    } else {
      destroyCrtCanvases();
    }
  });

  $effect(() => {
    if (canvasEl) {
      initCanvas();
      lastFrameTime = 0;
      phosphorAccum = 0;
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
    <Button size="xs" variant="ghost" active={tab === 'radar'} onclick={() => tab = 'radar'}>Radar</Button>
    <Button size="xs" variant="ghost" active={tab === 'setup'} onclick={() => tab = 'setup'}>Setup</Button>
  </div>
{/snippet}

{#snippet windowContent()}
  {#if tab === 'radar'}
    <div class="radar-tab">
    <div class="radar">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <canvas
        bind:this={canvasEl}
        width={SIZE} height={SIZE + INFO_H}
        style="touch-action:none; cursor:crosshair; width:{SIZE}px; height:{SIZE + INFO_H}px"
        onpointermove={onCanvasPointerMove}
        onpointerdown={onCanvasPointerDown}
        onpointerup={onCanvasPointerUp}
        onpointercancel={onCanvasPointerUp}
        onlostpointercapture={onCanvasLostCapture}
      ></canvas>
      <div class="radar-info">
        <span class="info-left">{zoom > 1.05 ? `${infoCount} vis  ${zoom.toFixed(1)}×` : `${infoCount} visible`}</span>
        <span class="info-center">
          {#if rotatorStore.status === 'connected'}
            <svg class="legend-icon" viewBox="0 0 8 8" width="7" height="7"><polygon points="4,0 8,4 4,8 0,4" fill="none" stroke="var(--rotator)" stroke-width="1.2"/></svg><span class="legend-label" style="color: var(--rotator)">Rotator</span>
          {/if}
          <svg class="legend-icon" viewBox="0 0 8 8" width="7" height="7"><line x1="0" y1="4" x2="8" y2="4" stroke="var(--beam-reticle)" stroke-width="1.2"/><line x1="4" y1="0" x2="4" y2="8" stroke="var(--beam-reticle)" stroke-width="1.2"/></svg><span class="legend-label" style="color: var(--beam-reticle)">Target</span>
        </span>
        <span class="info-right" class:info-locked={beamStore.locked}>{infoHoverLabel}</span>
      </div>
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

    <div class="rot-panel">
      <div class="rot-row">
        <div class="rot-status">
          <span class="rot-dot"
            class:ok={rotatorStore.status === 'connected'}
            class:loading={rotatorStore.status === 'connecting'}
            class:err={rotatorStore.status === 'error'}></span>
          <span class="rot-status-text">{rotatorStore.status}</span>
        </div>
        {#if rotatorStore.status === 'connected'}
          <Button size="xs" title="Disconnect from rotator" onclick={() => rotatorStore.disconnect()}>Disconnect</Button>
        {:else}
          <Button size="xs" title="Connect to rotator" onclick={() => rotatorStore.connect()}
            disabled={rotatorStore.status === 'connecting'}>Connect</Button>
        {/if}
      </div>

      {#if rotatorStore.error}
        <div class="rot-error">{rotatorStore.error}</div>
      {/if}

      {#if rotatorStore.status === 'connected'}
        {@const aAz = rotatorStore.actualAz}
        {@const aEl = rotatorStore.actualEl}
        {@const tAz = rotatorStore.targetAz}
        {@const tEl = rotatorStore.targetEl}
        {@const hasActual = aAz !== null && aEl !== null}
        {@const hasTarget = tAz !== null && tEl !== null}
        {@const errAz = hasActual && hasTarget ? Math.abs(aAz! - tAz!) : null}
        {@const errEl = hasActual && hasTarget ? Math.abs(aEl! - tEl!) : null}
        {@const offTarget = errAz !== null && errEl !== null && (errAz > rotatorStore.tolerance || errEl > rotatorStore.tolerance)}

        <div class="rot-pos">
          <span class="rot-pos-label">Az</span>
          <span class="rot-pos-val">{aAz?.toFixed(1) ?? '—'}°</span>
          <span class="rot-pos-label">El</span>
          <span class="rot-pos-val">{aEl?.toFixed(1) ?? '—'}°</span>
          <span class="rot-pos-label">Rate</span>
          <span class="rot-pos-val">{rotatorStore.velocityDegS.toFixed(2)}°/s</span>
          {#if rotatorStore.slewWarning}
            <span class="rot-pos-warn">CAN'T KEEP UP</span>
          {:else if rotatorStore.nextAosEpoch > 0}
            {@const secToAos = (rotatorStore.nextAosEpoch - timeStore.epoch) * 86400}
            <span class="rot-pos-wait">AOS in {fmtCountdown(secToAos)}</span>
          {:else if offTarget}
            <span class="rot-pos-err">&Delta; {errAz?.toFixed(1)}° / {errEl?.toFixed(1)}°</span>
          {:else if hasActual && hasTarget}
            <span class="rot-pos-ok">{beamStore.locked ? `ON ${beamStore.lockedSatName}` : 'ON TARGET'}</span>
          {:else if hasActual}
            <span class="rot-pos-idle">IDLE</span>
          {/if}
        </div>

        <div class="rot-actions">
          <label class="rot-autotrack">
            <Checkbox checked={rotatorStore.autoTrack} onchange={() => rotatorStore.setAutoTrack(!rotatorStore.autoTrack)} />
            Auto slew<InfoTip>Continuously slew the rotator to follow the beam reticle. When tracking a satellite, sun, or moon, the rotator follows the target automatically. When unlocked, it follows manual reticle placement.</InfoTip>
          </label>
          <div class="rot-btns">
            <Button size="xs" title="Slew to beam reticle position ({beamStore.aimAz.toFixed(1)}° / {beamStore.aimEl.toFixed(1)}°)" disabled={rotatorStore.autoTrack} onclick={() => rotatorStore.goto(beamStore.aimAz, beamStore.aimEl)}>Slew</Button>
            <Button size="xs" title="Park at {parkPos.az.toFixed(1)}° / {parkPos.el.toFixed(1)}°" onclick={() => rotatorStore.park()}>Park</Button>
            <Button size="xs" title="Stop movement and disable auto slew" onclick={() => rotatorStore.stop()}>Stop</Button>
          </div>
        </div>
      {/if}
    </div>
    </div>

  {:else}
    <div class="setup-panel">
      <h4 class="section-header">Antenna</h4>
      <div class="row">
        <label>Preset<InfoTip>Sets beam width, tolerance, and update rate for common antenna types.</InfoTip></label>
        <div class="antenna-presets">
          {#each Object.entries(ANTENNA_PRESETS) as [key, p]}
            <Button size="xs" active={activeAntennaPreset === key} onclick={() => applyAntennaPreset(key)}>{p.label}</Button>
          {/each}
        </div>
      </div>
      <div class="row antenna-summary">
        <span>Beam {beamStore.beamWidth}°</span>
        <span>Tolerance {rotatorStore.tolerance}°</span>
        <span>Rate {rateDisplay}</span>
      </div>

      <h4 class="section-header">Connection</h4>
      <div class="row">
        <label>Mode</label>
        <div class="rot-mode-btns">
          <Button size="xs" variant="ghost" active={rotatorStore.mode === 'serial'}
            onclick={() => rotatorStore.setMode('serial')}>Serial</Button>
          <Button size="xs" variant="ghost" active={rotatorStore.mode === 'network'}
            onclick={() => rotatorStore.setMode('network')}>Network</Button>
        </div>
      </div>

      {#if rotatorStore.mode === 'serial'}
        <div class="row">
          <label>Protocol</label>
          <Select size="xs" value={rotatorStore.serialProtocol}
            onchange={(e) => rotatorStore.setSerialProtocol((e.target as HTMLSelectElement).value as any)}>
            <option value="gs232">GS-232</option>
            <option value="easycomm">EasyComm II</option>
          </Select>
        </div>
        <div class="row">
          <label>Baud</label>
          <Select size="xs" value={String(rotatorStore.baudRate)}
            onchange={(e) => rotatorStore.setBaudRate(Number((e.target as HTMLSelectElement).value))}>
            <option value="4800">4800</option>
            <option value="9600">9600</option>
            <option value="19200">19200</option>
          </Select>
        </div>
      {/if}

      {#if rotatorStore.mode === 'network'}
        <div class="row">
          <label>URL</label>
          <Input size="xs" class="rot-url" type="text"
            value={rotatorStore.wsUrl}
            onblur={(e) => rotatorStore.setWsUrl((e.currentTarget as HTMLInputElement).value)}
            onkeydown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        </div>
      {/if}

      <Slider label="Update rate" display={rateDisplay}
        min={100} max={20000} step={100} value={rotatorStore.updateIntervalMs}
        oninput={(e) => rotatorStore.setUpdateInterval(Number((e.target as HTMLInputElement).value))} />

      {#snippet tolTip()}<InfoTip>Minimum error before sending a new position command. Reduces wear on the rotator gears. Set to 0 for continuous tracking.</InfoTip>{/snippet}
      <Slider label="Tolerance" display={tolDisplay} tip={tolTip}
        min={0} max={10} step={0.5} value={rotatorStore.tolerance}
        oninput={(e) => rotatorStore.setTolerance(Number((e.target as HTMLInputElement).value))} />

      <div class="row">
        <label>Park Position</label>
        <Select size="xs" value={rotatorStore.parkPreset}
          onchange={(e) => rotatorStore.setParkPreset((e.target as HTMLSelectElement).value as ParkPreset)}>
          {#each Object.entries(PARK_PRESETS) as [key, p]}
            <option value={key}>{p.label}</option>
          {/each}
          <option value="custom">Custom</option>
        </Select>
      </div>
      {#if rotatorStore.parkPreset === 'custom'}
        <div class="row">
          <label>Park Az / El</label>
          <div class="park-custom">
            <Input size="xs" type="number" min="0" max="360" step="0.1"
              value={rotatorStore.parkAz}
              onblur={(e) => rotatorStore.setParkPosition(Number((e.currentTarget as HTMLInputElement).value), rotatorStore.parkEl)}
              onkeydown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            <span class="unit">°</span>
            <Input size="xs" type="number" min="0" max="90" step="0.1"
              value={rotatorStore.parkEl}
              onblur={(e) => rotatorStore.setParkPosition(rotatorStore.parkAz, Number((e.currentTarget as HTMLInputElement).value))}
              onkeydown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            <span class="unit">°</span>
          </div>
        </div>
      {/if}

      <div class="row">
        <label>After Pass<InfoTip>Action when a tracked satellite goes below the horizon. Disables auto-slew automatically.</InfoTip></label>
        <Select size="xs" value={rotatorStore.passEndAction}
          onchange={(e) => rotatorStore.setPassEndAction((e.target as HTMLSelectElement).value as PassEndAction)}>
          <option value="nothing">Do nothing</option>
          <option value="park">Park</option>
          <option value="slew-next">Slew to next AOS</option>
        </Select>
      </div>
      {#if rotatorStore.passEndAction !== 'nothing'}
        {#snippet settleTip()}<InfoTip>Wait this many seconds after LOS before parking or slewing. Lets large antennas stop wobbling.</InfoTip>{/snippet}
        <Slider label="Settle Delay" display="{rotatorStore.settleDelaySec}s" tip={settleTip}
          min={0} max={30} step={1} value={rotatorStore.settleDelaySec}
          oninput={(e) => rotatorStore.setSettleDelay(Number((e.target as HTMLInputElement).value))} />
      {/if}

      <h4 class="section-header">Visual</h4>
      <div class="row">
        <label>Cone Without Rotator<InfoTip>Show the beam cone in the 3D view when no rotator is connected. The cone always follows the rotator when connected.</InfoTip></label>
        <Checkbox checked={beamStore.coneVisible} onchange={() => beamStore.setConeVisible(!beamStore.coneVisible)} />
      </div>
      <div class="row">
        <label>Radar VFX<InfoTip>Sweep line and phosphor afterglow effect on satellite blips.</InfoTip></label>
        <Checkbox checked={uiStore.radarVfx} onchange={() => uiStore.setToggle('radarVfx', !uiStore.radarVfx)} />
      </div>
      <div class="row">
        <label>Sun / Moon<InfoTip>Show sun and moon positions on the radar. Always shown when tracking a celestial body.</InfoTip></label>
        <Checkbox checked={uiStore.radarShowCelestial || beamStore.lockedBodyType !== 'satellite'}
          disabled={beamStore.lockedBodyType !== 'satellite'}
          onchange={() => uiStore.setToggle('radarShowCelestial', !uiStore.radarShowCelestial)} />
      </div>

      <details class="guide-details">
        <summary>Guide</summary>
        <div class="guide-body">
          {#if rotatorStore.mode === 'serial'}
            Connect your rotator controller via USB-serial adapter. Select protocol
            (GS-232 for Yaesu-type, EasyComm for K3NG/Hamlib-compatible controllers)
            and baud rate above. Then switch to the Radar tab and click Connect — the
            browser will show a serial port picker.
            <br><br>
            <b>Supported controllers</b>
            <ul>
              <li><b>GS-232A/B</b> — Yaesu, Kenpro, and compatible rotators</li>
              <li><b>EasyComm II</b> — K3NG Arduino controller, SatNOGS, Hamlib-compatible</li>
            </ul>
            <span class="guide-note">Requires Chrome or Edge desktop. Web Serial is not available in Firefox or Safari.</span>
          {:else}
            Browsers can't open raw TCP sockets, so you need a WebSocket-to-TCP bridge
            between the browser and rotctld:
            <ol>
              <li>Start rotctld:<br><code>rotctld -m 603 -r /dev/ttyUSB0 -s 9600 -T 0.0.0.0</code></li>
              <li>Install a bridge (pick one):<br>
                <code>pip install websockify</code><br>
                <code>cargo install websocat</code>
              </li>
              <li>Run the bridge:<br>
                <code>websockify 4540 localhost:4533</code><br>
                <code>websocat --binary ws-l:0.0.0.0:4540 tcp:127.0.0.1:4533</code>
              </li>
              <li>Enter <code>ws://localhost:4540</code> as the URL above</li>
              <li>Switch to the Radar tab and click Connect</li>
            </ol>
          {/if}
        </div>
      </details>
    </div>
  {/if}
{/snippet}

{#if uiStore.isMobile}
  <MobileSheet id="rotator" title="Rotator" icon={radarIcon}>
    {@render windowContent()}
  </MobileSheet>
{:else}
  <DraggableWindow id="rotator" title="Rotator" icon={radarIcon} {headerExtra} bind:open={uiStore.rotatorOpen} initialX={9999} initialY={300} noPad>
    {@render windowContent()}
  </DraggableWindow>
{/if}

<style>
  .radar-header-extra {
    display: flex;
    align-items: center;
    gap: 1px;
    margin-left: auto;
    margin-right: 8px;
  }
  .radar-tab {
    width: 400px;
  }
  .radar {
    position: relative;
    display: flex;
    justify-content: center;
  }
  .radar canvas {
    display: block;
  }
  .radar-info {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    height: 20px;
    font-size: 10px;
    padding: 0 8px;
    pointer-events: none;
  }
  .info-left {
    color: var(--radar-text);
    white-space: nowrap;
  }
  .info-center {
    text-align: center;
    white-space: nowrap;
  }
  .legend-icon {
    vertical-align: -1px;
    margin-right: 3px;
  }
  .legend-label {
    font-size: 10px;
    margin-right: 6px;
  }
  .legend-label:last-child {
    margin-right: 0;
  }
  .info-right {
    color: var(--radar-text);
    white-space: nowrap;
    text-align: right;
  }
  .info-right.info-locked {
    color: var(--beam-reticle-locked);
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

  /* ── Rotator control panel ── */
  .rot-panel {
    padding: 8px;
    border-top: 1px solid var(--border);
  }
  .rot-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .rot-row:last-child { margin-bottom: 0; }
  .rot-row label {
    font-size: 10px;
    color: var(--text-ghost);
    flex-shrink: 0;
  }
  .rot-mode-btns {
    display: flex;
    gap: 2px;
  }
  .park-custom {
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .rot-status {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 1;
  }
  .rot-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--text-muted);
    flex-shrink: 0;
  }
  .rot-dot.ok { background: var(--rotator); }
  .rot-dot.loading { background: var(--warning); animation: rot-blink 0.8s infinite; }
  .rot-dot.err { background: var(--danger); }
  @keyframes rot-blink { 50% { opacity: 0.3; } }
  .rot-status-text {
    font-size: 10px;
    color: var(--text-dim);
    text-transform: capitalize;
  }
  .rot-error {
    font-size: 10px;
    color: var(--danger);
    margin-bottom: 6px;
    padding: 3px 6px;
    background: color-mix(in srgb, var(--danger) 8%, transparent);
    border: 1px solid var(--danger);
    border-radius: 2px;
    word-break: break-word;
  }
  .rot-pos {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 6px;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  .rot-pos-label {
    font-size: 9px;
    color: var(--text-ghost);
  }
  .rot-pos-val { color: var(--text); }
  .rot-pos-err {
    color: var(--warning);
    margin-left: auto;
    font-size: 9px;
  }
  .rot-pos-ok {
    color: var(--live);
    margin-left: auto;
    font-size: 9px;
    letter-spacing: 0.5px;
  }
  .rot-pos-idle {
    color: var(--text-ghost);
    margin-left: auto;
    font-size: 9px;
    letter-spacing: 0.5px;
  }
  .rot-pos-wait {
    color: var(--text-faint);
    margin-left: auto;
    font-size: 9px;
    letter-spacing: 0.5px;
  }
  .rot-pos-warn {
    color: var(--danger-bright);
    margin-left: auto;
    font-size: 9px;
    letter-spacing: 0.5px;
  }
  .rot-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .rot-autotrack {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: var(--text-ghost);
    cursor: pointer;
  }
  .rot-autotrack :global(.info-tip) {
    vertical-align: middle;
    margin-left: 2px;
  }
  .rot-btns {
    display: flex;
    gap: 4px;
  }

  /* ── Antenna presets ── */
  .antenna-presets {
    display: flex;
    gap: 2px;
  }
  .antenna-summary.row {
    gap: 10px;
    justify-content: flex-start;
    font-size: 9px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  /* ── Setup tab ── */
  .setup-panel {
    padding: 8px;
    width: 400px;
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
  .unit { color: var(--text-ghost); font-size: 11px; }
  :global(.rot-url) { width: 160px; }
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
  .guide-body ul, .guide-body ol {
    margin: 4px 0;
    padding-left: 16px;
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
</style>
