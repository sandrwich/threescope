<script lang="ts">
  import { uiStore } from '../stores/ui.svelte';
  import { rotatorStore } from '../stores/rotator.svelte';
  import { ViewMode } from '../types';

  const fmt = (n: number, d = 1) => n.toFixed(d);

  let visible = $derived(uiStore.viewMode === ViewMode.VIEW_SKY && uiStore.skyRotator.visible);
  let r = $derived(uiStore.skyRotator);
  let aAz = $derived(rotatorStore.actualAz);
  let aEl = $derived(rotatorStore.actualEl);

  // Scale diamond with beam radius so it stays proportional when zooming
  let br = $derived(Math.max(uiStore.skyReticle.radius, 10));
  let sz = $derived(Math.max(14, br * 2));
  let labelOff = $derived(br + 6);
</script>

{#if visible}
  <div class="sky-rotator" style="left:{r.x}px; top:{r.y}px">
    <svg class="diamond" style="width:{sz}px; height:{sz}px" viewBox="0 0 16 16">
      <polygon points="8,1 15,8 8,15 1,8" fill="none" vector-effect="non-scaling-stroke" stroke-width="1.5" class="diamond-shape" />
    </svg>
    <div class="label" style="right:calc(50% + {labelOff}px)">
      <div>Az {fmt(aAz ?? 0)}&deg;</div>
      <div>El {fmt(aEl ?? 0)}&deg;</div>
      <div>{fmt(rotatorStore.velocityDegS, 2)}&deg;/s</div>
    </div>
  </div>
{/if}

<style>
  .sky-rotator {
    position: absolute;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 5;
  }
  .diamond {
    display: block;
    margin: 0 auto;
  }
  .diamond-shape {
    stroke: var(--rotator);
    opacity: 0.8;
  }
  .label {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    font-size: 10px;
    font-family: 'Overpass Mono', monospace;
    color: var(--rotator);
    white-space: nowrap;
    text-align: right;
    line-height: 1.3;
    text-shadow: 0 0 3px var(--scene-shadow);
  }
</style>
