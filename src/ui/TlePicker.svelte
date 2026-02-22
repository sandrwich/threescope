<script lang="ts">
  import { onMount } from 'svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { TLE_SOURCES } from '../data/tle-sources';
  import { ICON_SEARCH, ICON_COMMAND, ICON_SELECTION, ICON_VIEW, ICON_TIME, ICON_SETTINGS, ICON_HELP, ICON_2D, ICON_3D, ICON_PASSES } from './shared/icons';
  import { ViewMode } from '../types';

  let customVisible = $state(false);
  let urlValue = $state('');
  let fileInput: HTMLInputElement | undefined = $state();
  let canvasEl: HTMLCanvasElement | undefined = $state();

  onMount(() => { uiStore.planetCanvasEl = canvasEl; });

  async function onSelectChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    if (val === '__custom__') {
      customVisible = true;
      return;
    }
    customVisible = false;
    uiStore.currentTleGroup = val;
    localStorage.setItem('threescope_tle_group', val);
    await uiStore.onTLEGroupChange?.(val);
  }

  async function loadUrl() {
    const url = urlValue.trim();
    if (!url) return;
    await uiStore.onCustomTLEUrl?.(url);
  }

  function onFileChange() {
    const file = fileInput?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      uiStore.onCustomTLELoad?.(reader.result as string, file.name);
    };
    reader.readAsText(file);
    fileInput.value = '';
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') loadUrl();
  }
</script>

<div class="toolbar">
  <button class="planet-btn" title="Solar System Explorer" onclick={() => uiStore.onPlanetButtonClick?.()}>
    <canvas bind:this={canvasEl} width="56" height="56"></canvas>
  </button>

  <div class="toolbar-row">
    <!-- Data group -->
    <div class="btn-group">
      <select value={uiStore.currentTleGroup} onchange={onSelectChange}>
        <option value="__custom__">Custom...</option>
        {#each TLE_SOURCES as src}
          <option value={src.group}>{src.name}</option>
        {/each}
      </select>
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

  {#if customVisible}
    <div class="custom-row">
      <input type="text" class="url-input" placeholder="TLE URL..." bind:value={urlValue} onkeydown={onKeydown}>
      <button class="icon-btn text-btn" onclick={loadUrl}>Load</button>
      <button class="icon-btn text-btn" onclick={() => fileInput.click()}>File</button>
      <input type="file" bind:this={fileInput} accept=".tle,.txt,.3le" style="display:none" onchange={onFileChange}>
    </div>
  {/if}
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
  .text-btn {
    width: auto;
    padding: 0 6px;
    font-size: 12px;
    font-family: inherit;
  }

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

  .toolbar select {
    background: transparent;
    color: var(--text-faint);
    border: 1px solid transparent;
    padding: 2px 4px;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    height: 25px;
  }
  .toolbar select:hover { color: var(--text-dim); border-color: var(--border); }
  .toolbar select option {
    background: var(--modal-bg);
    color: var(--text);
  }

  .custom-row {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .url-input {
    background: var(--ui-bg);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 3px 6px;
    font-size: 12px;
    font-family: inherit;
    width: 220px;
    cursor: text;
  }
  .url-input:hover { border-color: var(--border-hover); }
  .url-input::placeholder { color: var(--text-ghost); }

  @media (max-width: 600px) {
    .url-input { width: 130px; }
    .custom-row { flex-wrap: wrap; justify-content: flex-end; }
  }
</style>
