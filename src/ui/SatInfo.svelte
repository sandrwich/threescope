<script lang="ts">
  import { onMount } from 'svelte';
  import { uiStore } from '../stores/ui.svelte';

  let el: HTMLDivElement;

  onMount(() => { uiStore.satInfoEl = el; });
</script>

<div class="sat-info" bind:this={el} class:visible={uiStore.satInfoVisible}>
  <div class="sat-name" style="color:{uiStore.satInfoNameColor}">{uiStore.satInfoName}</div>
  <div class="sat-detail">{@html uiStore.satInfoDetail}</div>
</div>

<style>
  .sat-info {
    position: absolute;
    display: none;
    background: var(--card-bg);
    padding: 8px 12px;
    font-size: 13px;
    line-height: 1.4;
    min-width: 200px;
    pointer-events: none;
    border-left: 2px solid var(--border);
    z-index: 10;
  }
  .sat-info.visible { display: block; }
  .sat-name { font-size: 14px; margin-bottom: 4px; }
  .sat-detail { color: var(--text-dim); }
</style>
