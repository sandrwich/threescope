<script lang="ts">
  import { uiStore } from '../stores/ui.svelte';
  import { rotatorStore } from '../stores/rotator.svelte';
  import { beamStore } from '../stores/beam.svelte';

  const hash = __COMMIT_HASH__;
  const version = __COMMIT_DATE__ ? 'v' + __COMMIT_DATE__.slice(2, 10).replace(/-/g, '') : '';

  let showRotator = $derived(
    rotatorStore.status === 'connected' && !uiStore.rotatorOpen
  );

  let rotatorState = $derived.by(() => {
    if (!showRotator) return null;
    const aAz = rotatorStore.actualAz;
    const aEl = rotatorStore.actualEl;
    const hasActual = aAz !== null && aEl !== null;
    const hasTarget = rotatorStore.targetAz !== null && rotatorStore.targetEl !== null;
    return { aAz, aEl, hasActual, hasTarget, isSlewing: rotatorStore.isSlewing };
  });
</script>

<div class="bottom-panel">
  {#if showRotator && rotatorState}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <span class="rot-line" onclick={() => { uiStore.rotatorOpen = true; }}>
      <span class="rot-dot"></span>
      {#if rotatorState.hasActual}
        <span>Az {rotatorState.aAz?.toFixed(1)}° El {rotatorState.aEl?.toFixed(1)}°</span>
        <span>{rotatorStore.velocityDegS.toFixed(1)}°/s</span>
      {/if}
      {#if rotatorStore.slewWarning}
        <span class="rot-state warning">CAN'T KEEP UP</span>
      {:else if rotatorState.isSlewing}
        <span class="rot-state slewing">SLEWING</span>
      {:else if rotatorState.hasActual && rotatorState.hasTarget}
        <span class="rot-state on-target">{beamStore.locked ? beamStore.lockedSatName : 'ON TARGET'}</span>
      {:else if rotatorState.hasActual}
        <span class="rot-state idle">IDLE</span>
      {/if}
    </span>
  {:else}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <span class="about-link" onclick={() => uiStore.infoModalOpen = true}>satvisor{#if version}<span class="dot">&middot;</span><span class="build">{version}</span>{/if}{#if hash}<span class="dot">&middot;</span><span class="build">{hash}</span>{/if}</span>
  {/if}
</div>

<style>
  .bottom-panel {
    position: absolute;
    bottom: 8px;
    left: 10px;
    font-size: 11px;
    line-height: 1.4;
    color: var(--scene-text-dim);
  }
  .about-link {
    cursor: pointer;
    pointer-events: auto;
  }
  .about-link:hover { color: var(--scene-text); }
  .dot { padding: 0 4px; }
  .build { opacity: 0.5; }

  .rot-line {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    pointer-events: auto;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--scene-text-dim);
  }
  .rot-line:hover { color: var(--scene-text); }
  .rot-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--rotator);
    flex-shrink: 0;
  }
  .rot-state {
    letter-spacing: 0.5px;
  }
  .rot-state.warning { color: var(--danger-bright); }
  .rot-state.slewing { color: var(--warning); }
  .rot-state.on-target { color: var(--live); }
  .rot-state.idle { opacity: 0.5; }
</style>
