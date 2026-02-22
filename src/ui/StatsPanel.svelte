<script lang="ts">
  import { uiStore } from '../stores/ui.svelte';

  function formatCoord(val: number, pos: string, neg: string): string {
    const dir = val >= 0 ? pos : neg;
    return `${Math.abs(val).toFixed(1)}°${dir}`;
  }

  let showButton = $derived(uiStore.tleLoadState === 'cached' || uiStore.tleLoadState === 'stale' || uiStore.tleLoadState === 'failed');
  let buttonTitle = $derived(uiStore.tleLoadState === 'failed' ? 'Retry TLE fetch' : 'Refresh TLE data');
</script>

<div class="stats-panel">
  <div class="row main-row">
    <span class="fps" style="color:{uiStore.fpsColor}">{uiStore.fpsDisplay} FPS</span>
    <span class="sep">&middot;</span>
    <span class="sats">{uiStore.satStatusText}</span>
    {#if showButton}
      <button class="refresh-btn" title={buttonTitle} onclick={() => uiStore.onRefreshTLE?.()}>↻</button>
    {/if}
  </div>
  <div class="coords" class:visible={uiStore.cursorLatLon !== null}>
    {#if uiStore.cursorLatLon}
      {formatCoord(uiStore.cursorLatLon.lat, 'N', 'S')}, {formatCoord(uiStore.cursorLatLon.lon, 'E', 'W')}
    {:else}
      &nbsp;
    {/if}
  </div>
</div>

<style>
  .stats-panel {
    position: absolute;
    top: 8px;
    right: 10px;
    text-align: right;
  }
  .main-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
  }
  .fps {
    font-size: 14px;
    font-weight: bold;
  }
  .sep {
    color: var(--text-ghost);
    font-size: 13px;
  }
  .sats {
    color: var(--text-muted);
    font-size: 12px;
  }
  .refresh-btn {
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    font-size: 14px;
    padding: 0 2px;
    line-height: 1;
  }
  .refresh-btn:hover {
    color: var(--text);
  }
  .coords {
    color: var(--text-muted);
    font-size: 12px;
    margin-top: 1px;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .coords.visible {
    opacity: 1;
  }
</style>
