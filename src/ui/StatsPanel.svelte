<script lang="ts">
  import { uiStore } from '../stores/ui.svelte';
  import { ViewMode } from '../types';
  import { ICON_2D, ICON_3D, ICON_SKY, ICON_RTX } from './shared/icons';
  import { getElevation, isElevationLoaded } from '../astro/elevation';
  import { settingsStore } from '../stores/settings.svelte';
  import { findMatchingPreset, getPresetSettings } from '../graphics';

  let rtxOn = $derived(findMatchingPreset(settingsStore.graphics) === 'rtx');

  function toggleRtx() {
    settingsStore.applyGraphics(getPresetSettings(rtxOn ? 'standard' : 'rtx'));
  }

  function formatCoord(val: number, pos: string, neg: string): string {
    const dir = val >= 0 ? pos : neg;
    return `${Math.abs(val).toFixed(1)}°${dir}`;
  }

  let showButton = $derived(uiStore.tleLoadState === 'cached' || uiStore.tleLoadState === 'stale' || uiStore.tleLoadState === 'failed');
  let buttonTitle = $derived(uiStore.tleLoadState === 'failed' ? 'Retry TLE fetch' : 'Refresh TLE data');
  let cursorElev = $derived(
    uiStore.cursorLatLon && isElevationLoaded()
      ? getElevation(uiStore.cursorLatLon.lat, uiStore.cursorLatLon.lon)
      : null
  );
</script>

<div class="stats-panel">
  <span class="hud-line">
    <span class="fps" style="color:{uiStore.fpsColor}">{uiStore.fpsDisplay} FPS</span>
    <span class="sep">&middot;</span>
    <span class="sats">{uiStore.satCount < 0 ? 'Loading...' : `${uiStore.satCount} sats`}{#if !uiStore.isMobile && uiStore.satStatusExtra}&nbsp;({uiStore.satStatusExtra}){/if}</span>
    {#if showButton}
      <button class="refresh-btn" title={buttonTitle} onclick={() => uiStore.onRefreshTLE?.()}>↻</button>
    {/if}
  </span>
  {#if uiStore.isMobile}
    <button class="mode-toggle" disabled={uiStore.viewMode === ViewMode.VIEW_SKY} onclick={() => uiStore.onToggleViewMode?.()}>
      {@html uiStore.viewMode === ViewMode.VIEW_SKY ? ICON_SKY : uiStore.viewMode === ViewMode.VIEW_3D ? ICON_2D : ICON_3D}
    </button>
  {/if}
  <div class="coords" class:visible={uiStore.cursorLatLon !== null}>
    {#if uiStore.cursorLatLon}
      {formatCoord(uiStore.cursorLatLon.lat, 'N', 'S')}, {formatCoord(uiStore.cursorLatLon.lon, 'E', 'W')}{#if cursorElev !== null}, {cursorElev}m{/if}
    {:else}
      &nbsp;
    {/if}
  </div>
</div>

{#if uiStore.isMobile && uiStore.viewMode === ViewMode.VIEW_3D}
  <button class="rtx-toggle" class:active={rtxOn} onclick={toggleRtx}>{@html ICON_RTX}</button>
{/if}

<style>
  .stats-panel {
    position: absolute;
    top: 7px;
    right: 10px;
    text-align: right;
  }
  .hud-line {
    font-size: 12px;
    color: var(--scene-text);
    white-space: nowrap;
  }
  .fps {
    font-size: 12px;
    font-weight: bold;
  }
  .sep {
    color: var(--scene-text-dim);
    font-size: 12px;
  }
  .sats {
    color: var(--scene-text);
    font-size: 12px;
  }
  .refresh-btn {
    background: none;
    border: none;
    color: var(--scene-text);
    cursor: pointer;
    font-size: 14px;
    padding: 0 2px;
    line-height: 1;
  }
  .refresh-btn:hover {
    color: var(--text);
  }
  .coords {
    color: var(--scene-text);
    font-size: 12px;
    margin-top: 1px;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .coords.visible {
    opacity: 1;
  }
  .mode-toggle {
    background: var(--ui-bg);
    border: 1px solid var(--border);
    color: var(--text-faint);
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    margin-left: auto;
    margin-top: 9px;
  }
  .mode-toggle:hover { color: var(--text-dim); border-color: var(--border-hover); }
  .mode-toggle :global(svg) { width: 16px; height: 16px; }
  .rtx-toggle {
    position: fixed;
    top: 36px;
    left: 10px;
    background: var(--ui-bg);
    border: 1px solid var(--border);
    color: var(--text-ghost);
    font-family: inherit;
    font-size: 11px;
    font-weight: bold;
    letter-spacing: 0.5px;
    width: 36px;
    height: 36px;
    padding: 0;
    cursor: pointer;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .rtx-toggle :global(svg) { width: 24px; height: 16px; }
  .rtx-toggle:hover { color: var(--text-dim); border-color: var(--border-hover); }
  .rtx-toggle.active { color: var(--accent); border-color: var(--accent); }
  @media (max-width: 767px) {
    .coords { display: none; }
  }
</style>
