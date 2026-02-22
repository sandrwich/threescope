<script lang="ts">
  import { onMount } from 'svelte';
  import { uiStore } from '../stores/ui.svelte';

  let el: HTMLDivElement;

  onMount(() => { uiStore.satInfoEl = el; });
</script>

<div class="sat-tooltip" bind:this={el} class:visible={uiStore.satInfoVisible}>
  <div class="sat-name" style="color:{uiStore.satInfoNameColor}">{uiStore.satInfoName}</div>
  <div class="sat-detail">{@html uiStore.satInfoDetail}</div>
  {#if uiStore.satInfoHint}
    <div class="sat-hint">{uiStore.satInfoHint}</div>
  {/if}
</div>

<style>
  .sat-tooltip {
    position: absolute;
    display: none;
    background: var(--card-bg);
    padding: 6px 10px;
    font-size: 12px;
    line-height: 1.4;
    pointer-events: none;
    border-left: 2px solid var(--border);
    z-index: 10;
  }
  .sat-tooltip.visible { display: block; }
  .sat-name { font-size: 13px; margin-bottom: 2px; }
  .sat-detail { color: var(--text-dim); }
  .sat-hint { color: var(--text-ghost); font-size: 11px; margin-top: 4px; }
</style>
