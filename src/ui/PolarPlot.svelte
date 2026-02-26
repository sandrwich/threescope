<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { timeStore } from '../stores/time.svelte';
  import { ICON_POLAR } from './shared/icons';
  import { SAT_COLORS, DEG2RAD, MOON_RADIUS_KM } from '../constants';
  import { palette } from './shared/theme';
  import { initHiDPICanvas } from './shared/canvas';
  import { moonPositionECI } from '../astro/moon-observer';
  import { sunDirectionECI } from '../astro/eclipse';
  import { getAzEl } from '../astro/az-el';
  import { epochToGmst } from '../astro/epoch';
  import { observerStore } from '../stores/observer.svelte';

  const SIZE = 280;
  const CX = SIZE / 2;
  const CY = SIZE / 2 + 12;
  const R_MAX = (SIZE - 50) / 2;

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let ctx: CanvasRenderingContext2D | null = null;
  let animFrameId = 0;

  let selectedPass = $derived(
    uiStore.selectedPassIdx >= 0 && uiStore.selectedPassIdx < uiStore.activePassList.length
      ? uiStore.activePassList[uiStore.selectedPassIdx]
      : null
  );

  function azElToXY(az: number, el: number): { x: number; y: number } {
    const r = R_MAX * (90 - Math.max(0, el)) / 90;
    const azRad = az * Math.PI / 180;
    return {
      x: CX + r * Math.sin(azRad),
      y: CY - r * Math.cos(azRad),
    };
  }

  function angularSeparation(az1: number, el1: number, az2: number, el2: number): number {
    const toRad = Math.PI / 180;
    const dAz = (az2 - az1) * toRad;
    const lat1 = el1 * toRad, lat2 = el2 * toRad;
    const a = Math.sin((lat2 - lat1) / 2) ** 2 +
              Math.cos(lat1) * Math.cos(lat2) * Math.sin(dAz / 2) ** 2;
    return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) / toRad;
  }

  // ── Time scrubbing via pointer interaction on the track ──

  let scrubbing = false;

  function canvasToLogical(e: PointerEvent): { lx: number; ly: number } {
    const rect = canvasEl!.getBoundingClientRect();
    const scaleX = SIZE / rect.width;
    const scaleY = (SIZE + 48) / rect.height;
    return { lx: (e.clientX - rect.left) * scaleX, ly: (e.clientY - rect.top) * scaleY };
  }

  function findNearestSkyPoint(lx: number, ly: number): { idx: number; dist: number } | null {
    const pass = selectedPass;
    if (!pass || pass.skyPath.length === 0) return null;
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < pass.skyPath.length; i++) {
      const { x, y } = azElToXY(pass.skyPath[i].az, pass.skyPath[i].el);
      const d = Math.hypot(x - lx, y - ly);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return { idx: bestIdx, dist: bestDist };
  }

  function scrubToPoint(lx: number, ly: number) {
    const hit = findNearestSkyPoint(lx, ly);
    if (!hit) return;
    const pass = selectedPass!;
    timeStore.epoch = pass.skyPath[hit.idx].t;
    timeStore.paused = true;
  }

  function onCanvasPointerDown(e: PointerEvent) {
    if (e.button !== 0 || !selectedPass || selectedPass.skyPath.length === 0) return;
    const { lx, ly } = canvasToLogical(e);
    const hit = findNearestSkyPoint(lx, ly);
    if (!hit || hit.dist > 20) return;
    scrubbing = true;
    canvasEl!.setPointerCapture(e.pointerId);
    scrubToPoint(lx, ly);
    e.preventDefault();
  }

  function onCanvasPointerMove(e: PointerEvent) {
    if (!canvasEl) return;
    if (scrubbing) {
      const { lx, ly } = canvasToLogical(e);
      scrubToPoint(lx, ly);
    } else if (selectedPass && selectedPass.skyPath.length > 0) {
      // Hover cursor feedback
      const { lx, ly } = canvasToLogical(e);
      const hit = findNearestSkyPoint(lx, ly);
      canvasEl.style.cursor = hit && hit.dist < 20 ? 'grab' : '';
    }
  }

  function onCanvasPointerUp() {
    scrubbing = false;
  }

  function drawFrame() {
    if (!ctx || !canvasEl) return;
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const font = '"Overpass Mono", monospace';

    // Grid rings
    ctx.strokeStyle = palette.grid;
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
    ctx.fillStyle = palette.textFaint;
    ctx.font = `12px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('N', CX, CY - R_MAX - 4);
    ctx.textBaseline = 'top';
    ctx.fillText('S', CX, CY + R_MAX + 4);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('E', CX + R_MAX + 6, CY);
    ctx.textAlign = 'right';
    ctx.fillText('W', CX - R_MAX - 6, CY);

    // Elevation labels
    ctx.fillStyle = palette.gridDim;
    ctx.font = `9px ${font}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('60°', CX + 3, CY - R_MAX * 0.333 + 2);
    ctx.fillText('30°', CX + 3, CY - R_MAX * 0.666 + 2);

    if (selectedPass) {
      const pass = selectedPass;
      const c = SAT_COLORS[pass.satColorIndex % SAT_COLORS.length];
      const cssColor = `rgb(${c[0]},${c[1]},${c[2]})`;

      // Sky track — per-segment shadow + magnitude bloom via shadowBlur
      if (pass.skyPath.length > 1) {
        const isDarkSky = pass.sunAlt < -6;

        // Main colored line with magnitude bloom
        ctx.lineWidth = 2;
        for (let i = 1; i < pass.skyPath.length; i++) {
          const prev = pass.skyPath[i - 1];
          const cur = pass.skyPath[i];
          const p0 = azElToXY(prev.az, prev.el);
          const p1 = azElToXY(cur.az, cur.el);
          const sf = cur.shadowFactor ?? 1.0;
          const alpha = 0.15 + sf * 0.85;
          const boost = 1.0 + sf * 0.3;
          const r = Math.min(255, Math.round(c[0] * boost));
          const g = Math.min(255, Math.round(c[1] * boost));
          const b = Math.min(255, Math.round(c[2] * boost));
          if (isDarkSky && sf > 0 && cur.mag !== undefined) {
            const brightness = Math.max(0, Math.min(1, (7 - cur.mag) / 9));
            ctx.shadowColor = 'rgba(255,255,255,0.9)';
            ctx.shadowBlur = brightness * sf * 16;
          } else {
            ctx.shadowBlur = 0;
          }
          ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;

        // AOS marker (cyan square)
        const aos = azElToXY(pass.skyPath[0].az, pass.skyPath[0].el);
        ctx.fillStyle = palette.markerAos;
        ctx.fillRect(aos.x - 3, aos.y - 3, 6, 6);

        // LOS marker (gray square)
        const los = azElToXY(pass.skyPath[pass.skyPath.length - 1].az, pass.skyPath[pass.skyPath.length - 1].el);
        ctx.fillStyle = palette.markerLos;
        ctx.fillRect(los.x - 3, los.y - 3, 6, 6);

        // TCA marker (diamond at max elevation)
        const tca = azElToXY(pass.maxElAz, pass.maxEl);
        ctx.fillStyle = palette.markerTca;
        ctx.beginPath();
        ctx.moveTo(tca.x, tca.y - 4);
        ctx.lineTo(tca.x + 4, tca.y);
        ctx.lineTo(tca.x, tca.y + 4);
        ctx.lineTo(tca.x - 4, tca.y);
        ctx.closePath();
        ctx.fill();
      }

      // Live dot during active pass (pulsating)
      const epoch = timeStore.epoch;
      const live = uiStore.livePassAzEl;
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 250);
      if (epoch >= pass.aosEpoch && epoch <= pass.losEpoch && live) {
        const { x, y } = azElToXY(live.az, live.el);
        ctx.fillStyle = palette.live;
        ctx.globalAlpha = 0.6 + pulse * 0.4;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Solar eclipse overlay (Sun + Moon discs)
      if (observerStore.isSet) {
        const ep = epoch;
        const gmstRad = epochToGmst(ep) * DEG2RAD;
        const obs = observerStore.location;
        const sunDir = sunDirectionECI(ep);
        const sunAzEl = getAzEl(sunDir.x * 1e6, sunDir.y * 1e6, sunDir.z * 1e6, gmstRad, obs.lat, obs.lon, obs.alt);
        if (sunAzEl.el > 0) {
          const moonEci = moonPositionECI(ep);
          const moonAzEl = getAzEl(moonEci.x, moonEci.y, moonEci.z, gmstRad, obs.lat, obs.lon, obs.alt);
          if (moonAzEl.el > 0) {
            const sepDeg = angularSeparation(sunAzEl.az, sunAzEl.el, moonAzEl.az, moonAzEl.el);
            const moonDistKm = Math.sqrt(moonEci.x ** 2 + moonEci.y ** 2 + moonEci.z ** 2);
            const moonAngDeg = (MOON_RADIUS_KM / moonDistKm) * (180 / Math.PI);
            const sunAngDeg = 0.267;
            if (sepDeg < moonAngDeg + sunAngDeg + 2.0) {
              const degPerPx = 90 / R_MAX;
              const sunXY = azElToXY(sunAzEl.az, sunAzEl.el);
              const moonXY = azElToXY(moonAzEl.az, moonAzEl.el);
              const sunRPx = Math.max(sunAngDeg / degPerPx, 4);
              const moonRPx = Math.max(moonAngDeg / degPerPx, 3.5);
              ctx.globalAlpha = 0.4;
              ctx.fillStyle = '#ffcc00';
              ctx.beginPath();
              ctx.arc(sunXY.x, sunXY.y, sunRPx, 0, 2 * Math.PI);
              ctx.fill();
              ctx.fillStyle = '#111';
              ctx.globalAlpha = 0.9;
              ctx.beginPath();
              ctx.arc(moonXY.x, moonXY.y, moonRPx, 0, 2 * Math.PI);
              ctx.fill();
              ctx.globalAlpha = 1;
            }
          }
        }
      }

      // Legend (top-left)
      ctx.font = `9px ${font}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let ly = 8;
      ctx.fillStyle = palette.markerAos;
      ctx.fillRect(6, ly, 5, 5);
      ctx.fillStyle = palette.textGhost;
      ctx.fillText('AOS', 14, ly + 3);
      ly += 10;
      ctx.fillStyle = palette.markerLos;
      ctx.fillRect(6, ly, 5, 5);
      ctx.fillStyle = palette.textGhost;
      ctx.fillText('LOS', 14, ly + 3);
      ly += 10;
      ctx.fillStyle = palette.markerTca;
      const dlx = 8.5, dly = ly + 2.5, dr = 2.5;
      ctx.beginPath();
      ctx.moveTo(dlx, dly - dr);
      ctx.lineTo(dlx + dr, dly);
      ctx.lineTo(dlx, dly + dr);
      ctx.lineTo(dlx - dr, dly);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = palette.textGhost;
      ctx.fillText('TCA', 14, ly + 3);

      // Sunlit / eclipsed legend (top-right, only if pass has mixed segments)
      const hasEcl = pass.skyPath.some(p => (p.shadowFactor ?? 1.0) < 1.0);
      const hasSun = pass.skyPath.some(p => (p.shadowFactor ?? 1.0) > 0.0);
      if (hasEcl) {
        ctx.textAlign = 'right';
        let ry = 8;
        ctx.strokeStyle = cssColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.moveTo(SIZE - 6, ry + 3); ctx.lineTo(SIZE - 11, ry + 3); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = palette.textGhost;
        ctx.fillText('Sunlit', SIZE - 14, ry + 3);
        ry += 10;
        ctx.strokeStyle = cssColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.25;
        ctx.beginPath(); ctx.moveTo(SIZE - 6, ry + 3); ctx.lineTo(SIZE - 11, ry + 3); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = palette.textGhost;
        ctx.fillText('Eclipsed', SIZE - 14, ry + 3);
        ctx.textAlign = 'left';
      }

      if (epoch >= pass.aosEpoch && epoch <= pass.losEpoch) {
        ly += 10;
        ctx.fillStyle = palette.live;
        ctx.beginPath();
        ctx.arc(8, ly + 3, 3, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = palette.textGhost;
        ctx.fillText('Live', 14, ly + 3);
      }

      // --- Info panel below plot ---
      const infoY = CY + R_MAX + 14;
      ctx.textBaseline = 'top';
      ctx.font = `11px ${font}`;

      // Row 1: sat name (left) + max el (right)
      ctx.fillStyle = cssColor;
      ctx.beginPath();
      ctx.arc(12, infoY + 4, 3.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = palette.textMuted;
      ctx.textAlign = 'left';
      ctx.fillText(pass.satName, 20, infoY);
      ctx.fillStyle = palette.textGhost;
      ctx.textAlign = 'right';
      ctx.fillText(`Max ${pass.maxEl.toFixed(0)}\u00B0`, SIZE - 8, infoY);

      // Row 2: status + live az/el
      const row2Y = infoY + 16;
      ctx.textAlign = 'left';

      if (epoch >= pass.aosEpoch && epoch <= pass.losEpoch) {
        const secToLos = (pass.losEpoch - epoch) * 86400;
        const m = Math.floor(secToLos / 60);
        const s = Math.round(secToLos % 60);
        ctx.fillStyle = palette.live;
        ctx.fillText(`LIVE`, 8, row2Y);
        ctx.fillStyle = palette.textFaint;
        ctx.fillText(`LOS ${m}:${String(s).padStart(2, '0')}`, 42, row2Y);
        if (live) {
          ctx.textAlign = 'right';
          ctx.fillStyle = palette.textMuted;
          ctx.fillText(`${live.az.toFixed(1)}\u00B0 az  ${live.el.toFixed(1)}\u00B0 el`, SIZE - 8, row2Y);
        }
        // Row 3: range + magnitude at current time
        const row3Y = row2Y + 14;
        const nearest = pass.skyPath.reduce((best, p) =>
          Math.abs(p.t - epoch) < Math.abs(best.t - epoch) ? p : best
        );
        ctx.textAlign = 'left';
        if (nearest.rangeKm !== undefined) {
          ctx.fillStyle = palette.textFaint;
          ctx.fillText(`Range ${Math.round(nearest.rangeKm)} km`, 8, row3Y);
        }
        if (nearest.mag !== undefined) {
          ctx.textAlign = 'right';
          ctx.fillStyle = palette.textMuted;
          ctx.fillText(`mag ${nearest.mag.toFixed(1)}`, SIZE - 8, row3Y);
        } else if ((nearest.shadowFactor ?? 1) < 1) {
          ctx.textAlign = 'right';
          ctx.fillStyle = palette.textGhost;
          ctx.fillText('eclipsed', SIZE - 8, row3Y);
        }
      } else if (epoch < pass.aosEpoch) {
        const sec = (pass.aosEpoch - epoch) * 86400;
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.round(sec % 60);
        ctx.fillStyle = palette.textFaint;
        ctx.fillText(`AOS in ${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`, 8, row2Y);
      } else {
        ctx.fillStyle = palette.textGhost;
        ctx.fillText('Pass complete', 8, row2Y);
      }
    } else {
      ctx.fillStyle = palette.textGhost;
      ctx.font = `11px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Select a pass', CX, CY);
    }

    ctx.restore();

    if (uiStore.polarPlotOpen) {
      animFrameId = requestAnimationFrame(drawFrame);
    }
  }

  function initCanvas() {
    if (!canvasEl) return;
    ctx = initHiDPICanvas(canvasEl, SIZE, SIZE + 48);
  }

  $effect(() => {
    if (canvasEl) {
      initCanvas();
      animFrameId = requestAnimationFrame(drawFrame);
      return () => cancelAnimationFrame(animFrameId);
    }
  });
</script>

{#snippet polarIcon()}<span class="title-icon">{@html ICON_POLAR}</span>{/snippet}
<DraggableWindow id="polar-plot" title="Polar Plot" icon={polarIcon} bind:open={uiStore.polarPlotOpen} initialX={9999} initialY={100}>
  <div class="pp">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <canvas
      bind:this={canvasEl}
      onpointerdown={onCanvasPointerDown}
      onpointermove={onCanvasPointerMove}
      onpointerup={onCanvasPointerUp}
    ></canvas>
  </div>
</DraggableWindow>

<style>
  .pp {
    display: flex;
    justify-content: center;
  }
  .pp canvas {
    display: block;
  }
</style>
