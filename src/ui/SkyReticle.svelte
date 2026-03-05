<script lang="ts">
  import { uiStore } from '../stores/ui.svelte';
  import { beamStore } from '../stores/beam.svelte';
  import { ViewMode } from '../types';

  const fmt = (n: number, d = 1) => n.toFixed(d);

  let visible = $derived(uiStore.viewMode === ViewMode.VIEW_SKY && uiStore.skyReticle.visible);
  let r = $derived(uiStore.skyReticle);
  let locked = $derived(beamStore.locked);
  let br = $derived(Math.max(r.radius, 10)); // beam radius in px (min 10)
  let gap = $derived(br + 3);   // tick start (outside circle)
  let labelOff = $derived(br + 6); // label offset from center
  const tick = 6;
</script>

{#if visible}
  <div class="sky-reticle" style="left:{r.x}px; top:{r.y}px; pointer-events:none" class:locked>
    <!-- Beam circle -->
    <svg class="beam-circle" style="width:{br * 2}px; height:{br * 2}px">
      <circle cx="50%" cy="50%" r={br - 1} fill="none" stroke-width="1" class="beam-ring" />
    </svg>
    <!-- Tick marks outside beam circle -->
    <div class="tick" style="left:calc(50% - {gap + tick}px); top:50%; width:{tick}px; height:1px; transform:translateY(-50%)"></div>
    <div class="tick" style="left:calc(50% + {gap}px); top:50%; width:{tick}px; height:1px; transform:translateY(-50%)"></div>
    <div class="tick" style="left:50%; top:calc(50% - {gap + tick}px); width:1px; height:{tick}px; transform:translateX(-50%)"></div>
    <div class="tick" style="left:50%; top:calc(50% + {gap}px); width:1px; height:{tick}px; transform:translateX(-50%)"></div>
    <div class="dot"></div>
    <!-- Labels — offset from beam circle edge -->
    <div class="label label-info" style="left:calc(50% + {labelOff}px); top:calc(50% - 18px)">
      Az {fmt(beamStore.aimAz, 1)}&deg;
    </div>
    <div class="label label-info" style="left:calc(50% + {labelOff}px); top:calc(50% - 6px)">
      El {fmt(beamStore.aimEl, 1)}&deg;
    </div>
    <div class="label label-info" style="left:calc(50% + {labelOff}px); top:calc(50% + 6px)">
      BW {fmt(beamStore.beamWidth, 1)}&deg;
    </div>
    {#if locked && beamStore.trackRange !== null}
      <div class="label label-track" style="top:calc(50% + {br + 8}px)">
        {beamStore.lockedSatName} &middot; {fmt(beamStore.trackRange, 0)} km
      </div>
    {/if}
  </div>
{/if}

<style>
  .sky-reticle {
    position: absolute;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 6;
  }
  .beam-circle {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    overflow: visible;
  }
  .beam-ring {
    stroke: var(--beam-reticle);
    opacity: 0.6;
  }
  .locked .beam-ring {
    stroke: var(--beam-reticle-locked);
    opacity: 0.8;
  }
  .tick {
    position: absolute;
    background: var(--beam-reticle);
    opacity: 0.35;
  }
  .locked .tick {
    background: var(--beam-reticle-locked);
    opacity: 0.5;
  }
  .dot {
    position: absolute;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--beam-reticle);
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }
  .locked .dot {
    background: var(--beam-reticle-locked);
  }
  .label {
    position: absolute;
    font-size: 10px;
    font-family: 'Overpass Mono', monospace;
    color: var(--beam-reticle);
    white-space: nowrap;
    text-shadow: 0 0 3px var(--scene-shadow);
  }
  .locked .label {
    color: var(--beam-reticle-locked);
  }
  .label-info {
    /* positioned via inline style */
  }
  .label-track {
    left: 50%;
    transform: translateX(-50%);
    font-size: 11px;
  }
</style>
