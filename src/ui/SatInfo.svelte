<script lang="ts">
  import { onMount } from 'svelte';
  import { uiStore } from '../stores/ui.svelte';

  let el: HTMLDivElement;

  onMount(() => { uiStore.satInfoEl = el; });
</script>

<div class="sat-info" bind:this={el} class:visible={uiStore.satInfoVisible}>
  {#if uiStore.satInfoName}
    <div class="sat-name" style="color:{uiStore.satInfoNameColor}">{uiStore.satInfoName}</div>
    <div class="sat-detail">{@html uiStore.satInfoDetail}</div>
  {/if}
  {#if uiStore.satInfoSelectedNames.length > 0}
    <div class="selected-list" class:has-detail={!!uiStore.satInfoName}>
      <div class="selected-header">Selected ({uiStore.satInfoSelectedNames.length})</div>
      {#each uiStore.satInfoSelectedNames as name}
        <div class="selected-name" class:focused={name === uiStore.satInfoName}>{name}</div>
      {/each}
    </div>
  {/if}
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
  .selected-list { font-size: 12px; }
  .selected-list.has-detail { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border); }
  .selected-header { color: var(--text-ghost); margin-bottom: 2px; }
  .selected-name { color: #00ff00; line-height: 1.4; }
  .selected-name.focused { color: #ffff00; }
</style>
