<script lang="ts">
  import { onMount } from 'svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { sourcesStore } from '../stores/sources.svelte';
  import { ICON_SEARCH, ICON_COMMAND, ICON_SELECTION, ICON_VIEW, ICON_TIME, ICON_SETTINGS, ICON_HELP, ICON_2D, ICON_3D, ICON_PASSES, ICON_DATA_SOURCES } from './shared/icons';
  import { ViewMode } from '../types';

  let canvasEl: HTMLCanvasElement | undefined = $state();

  onMount(() => { uiStore.planetCanvasEl = canvasEl; });

  let sourceLabel = $derived.by(() => {
    const n = sourcesStore.enabledSources.length;
    if (n === 0) return 'No sources';
    if (n === 1) return sourcesStore.enabledSources[0].name;
    return `${n} sources`;
  });
</script>

<div class="toolbar">
  <button class="planet-btn" title="Solar System Explorer" onclick={() => uiStore.onPlanetButtonClick?.()}>
    <canvas bind:this={canvasEl} width="56" height="56"></canvas>
  </button>

  <div class="toolbar-row">
    <!-- Data sources -->
    <div class="btn-group">
      <button class="source-btn" title="Data Sources (D)" onclick={() => uiStore.dataSourcesOpen = !uiStore.dataSourcesOpen}>
        <span class="source-icon">{@html ICON_DATA_SOURCES}</span>
        <span class="source-label">{sourceLabel}</span>
      </button>
    </div>

    <div class="separator"></div>

    <!-- Search group -->
    <div class="btn-group">
      <button class="icon-btn" title="Search Satellite (Ctrl+F)" onclick={() => { uiStore.commandPaletteSatMode = true; uiStore.commandPaletteOpen = true; }}>
        {@html ICON_SEARCH}
      </button>
      <button class="icon-btn" title="Command Palette (Ctrl+K)" onclick={() => uiStore.commandPaletteOpen = true}>
        {@html ICON_COMMAND}
      </button>
    </div>

    <div class="separator"></div>

    <!-- View toggle -->
    <div class="btn-group">
      <button class="icon-btn" title="Toggle 2D / 3D (M)" disabled={uiStore.orreryMode} onclick={() => uiStore.onToggleViewMode?.()}>
        {@html uiStore.viewMode === ViewMode.VIEW_3D ? ICON_2D : ICON_3D}
      </button>
    </div>

    <div class="separator"></div>

    <!-- Windows group -->
    <div class="btn-group">
      <button class="icon-btn" title="Selection" onclick={() => uiStore.selectionWindowOpen = !uiStore.selectionWindowOpen}>
        {@html ICON_SELECTION}
      </button>
      <button class="icon-btn" title="Passes (P)" onclick={() => uiStore.passesWindowOpen = !uiStore.passesWindowOpen}>
        {@html ICON_PASSES}
      </button>
      <button class="icon-btn" title="View" onclick={() => uiStore.viewWindowOpen = !uiStore.viewWindowOpen}>
        {@html ICON_VIEW}
      </button>
      <button class="icon-btn" title="Time Control" onclick={() => uiStore.timeWindowOpen = !uiStore.timeWindowOpen}>
        {@html ICON_TIME}
      </button>
      <button class="icon-btn" title="Settings" onclick={() => uiStore.settingsOpen = !uiStore.settingsOpen}>
        {@html ICON_SETTINGS}
      </button>
      <button class="icon-btn" title="Help" onclick={() => uiStore.infoModalOpen = true}>
        {@html ICON_HELP}
      </button>
    </div>
  </div>
</div>

<style>
  .toolbar {
    position: absolute;
    bottom: 10px;
    right: 10px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
  }
  .toolbar-row {
    display: flex;
    align-items: center;
    gap: 2px;
    background: var(--ui-bg);
    border: 1px solid var(--border);
    padding: 3px;
  }
  .btn-group {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .separator {
    width: 1px;
    height: 18px;
    background: var(--border);
    margin: 0 3px;
  }

  .icon-btn {
    background: none;
    border: 1px solid transparent;
    color: var(--text-faint);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 25px;
    height: 25px;
    padding: 0;
    cursor: pointer;
  }
  .icon-btn:hover { color: var(--text-dim); border-color: var(--border); }
  .icon-btn:disabled { color: var(--text-ghost); cursor: default; opacity: 0.4; }
  .icon-btn:disabled:hover { color: var(--text-ghost); border-color: transparent; }
  .icon-btn :global(svg) { width: 13px; height: 13px; }

  .source-btn {
    background: none;
    border: 1px solid transparent;
    color: var(--text-faint);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 25px;
    padding: 0 6px;
    cursor: pointer;
    font-size: 12px;
    font-family: inherit;
  }
  .source-btn:hover { color: var(--text-dim); border-color: var(--border); }
  .source-icon { display: flex; align-items: center; }
  .source-icon :global(svg) { width: 13px; height: 13px; }
  .source-label { white-space: nowrap; }

  .planet-btn {
    background: none;
    border: none;
    width: 36px;
    height: 36px;
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    align-self: flex-end;
    margin-right: 6px;
    margin-bottom: 14px;
  }
  .planet-btn canvas {
    width: 36px;
    height: 36px;
    transition: filter 0.15s;
    display: block;
  }
  .planet-btn:hover canvas { filter: brightness(1.4); }

  @media (max-width: 600px) {
    .source-label { display: none; }
  }
</style>
