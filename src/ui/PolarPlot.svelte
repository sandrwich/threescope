<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { timeStore } from '../stores/time.svelte';
  import { ICON_POLAR } from './shared/icons';
  import { SAT_COLORS } from '../constants';

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
    ctx.fillStyle = '#444';
    ctx.font = `9px ${font}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('60°', CX + 3, CY - R_MAX * 0.333 + 2);
    ctx.fillText('30°', CX + 3, CY - R_MAX * 0.666 + 2);

    if (selectedPass) {
      const pass = selectedPass;
      const c = SAT_COLORS[pass.satColorIndex % SAT_COLORS.length];
      const cssColor = `rgb(${c[0]},${c[1]},${c[2]})`;

      // Sky track
      if (pass.skyPath.length > 1) {
        ctx.strokeStyle = cssColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        for (let i = 0; i < pass.skyPath.length; i++) {
          const { x, y } = azElToXY(pass.skyPath[i].az, pass.skyPath[i].el);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;

        // AOS marker (cyan square)
        const aos = azElToXY(pass.skyPath[0].az, pass.skyPath[0].el);
        ctx.fillStyle = '#00ffcc';
        ctx.fillRect(aos.x - 3, aos.y - 3, 6, 6);

        // LOS marker (gray square)
        const los = azElToXY(pass.skyPath[pass.skyPath.length - 1].az, pass.skyPath[pass.skyPath.length - 1].el);
        ctx.fillStyle = '#666666';
        ctx.fillRect(los.x - 3, los.y - 3, 6, 6);
      }

      // Live dot during active pass (pulsating)
      const epoch = timeStore.epoch;
      const live = uiStore.livePassAzEl;
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 250);
      if (epoch >= pass.aosEpoch && epoch <= pass.losEpoch && live) {
        const { x, y } = azElToXY(live.az, live.el);
        ctx.fillStyle = '#44ff44';
        ctx.globalAlpha = 0.6 + pulse * 0.4;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Legend (top-left)
      ctx.font = `9px ${font}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let ly = 8;
      ctx.fillStyle = '#00ffcc';
      ctx.fillRect(6, ly, 5, 5);
      ctx.fillStyle = '#666';
      ctx.fillText('AOS', 14, ly + 3);
      ly += 10;
      ctx.fillStyle = '#666666';
      ctx.fillRect(6, ly, 5, 5);
      ctx.fillStyle = '#666';
      ctx.fillText('LOS', 14, ly + 3);
      if (epoch >= pass.aosEpoch && epoch <= pass.losEpoch) {
        ly += 10;
        ctx.fillStyle = '#44ff44';
        ctx.beginPath();
        ctx.arc(8, ly + 3, 3, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#666';
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
      ctx.fillStyle = '#999';
      ctx.textAlign = 'left';
      ctx.fillText(pass.satName, 20, infoY);
      ctx.fillStyle = '#666';
      ctx.textAlign = 'right';
      ctx.fillText(`Max ${pass.maxEl.toFixed(0)}\u00B0`, SIZE - 8, infoY);

      // Row 2: status + live az/el
      const row2Y = infoY + 16;
      ctx.textAlign = 'left';

      if (epoch >= pass.aosEpoch && epoch <= pass.losEpoch) {
        const secToLos = (pass.losEpoch - epoch) * 86400;
        const m = Math.floor(secToLos / 60);
        const s = Math.round(secToLos % 60);
        ctx.fillStyle = '#44ff44';
        ctx.fillText(`LIVE`, 8, row2Y);
        ctx.fillStyle = '#777';
        ctx.fillText(`LOS ${m}:${String(s).padStart(2, '0')}`, 42, row2Y);
        if (live) {
          ctx.textAlign = 'right';
          ctx.fillStyle = '#999';
          ctx.fillText(`${live.az.toFixed(1)}\u00B0 az  ${live.el.toFixed(1)}\u00B0 el`, SIZE - 8, row2Y);
        }
      } else if (epoch < pass.aosEpoch) {
        const sec = (pass.aosEpoch - epoch) * 86400;
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.round(sec % 60);
        ctx.fillStyle = '#777';
        ctx.fillText(`AOS in ${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`, 8, row2Y);
      } else {
        ctx.fillStyle = '#555';
        ctx.fillText('Pass complete', 8, row2Y);
      }
    } else {
      ctx.fillStyle = '#555';
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
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = SIZE * dpr;
    canvasEl.height = (SIZE + 48) * dpr;
    canvasEl.style.width = SIZE + 'px';
    canvasEl.style.height = (SIZE + 48) + 'px';
    ctx = canvasEl.getContext('2d');
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
<DraggableWindow title="Polar Plot" icon={polarIcon} bind:open={uiStore.polarPlotOpen} initialX={9999} initialY={100}>
  <div class="pp">
    <canvas bind:this={canvasEl}></canvas>
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
