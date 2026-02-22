<script lang="ts">
  import { onMount } from 'svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { TLE_SOURCES } from '../data/tle-sources';

  let customVisible = $state(false);
  let urlValue = $state('');
  let currentGroup = $state(localStorage.getItem('threescope_tle_group') || 'none');
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
    currentGroup = val;
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

<div class="tle-picker">
  <div class="planet-picker-row">
    <button class="planet-btn" title="Solar System Explorer" onclick={() => uiStore.onPlanetButtonClick?.()}>
      <canvas bind:this={canvasEl} width="56" height="56"></canvas>
    </button>
  </div>
  <div class="main-row">
    <button class="picker-btn" title="View" onclick={() => uiStore.viewWindowOpen = !uiStore.viewWindowOpen}>
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>
    </button>
    <button class="picker-btn" title="Time Control" onclick={() => uiStore.timeWindowOpen = !uiStore.timeWindowOpen}>
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><line x1="8" y1="4" x2="8" y2="8"/><line x1="8" y1="8" x2="11" y2="10"/></svg>
    </button>
    <button class="picker-btn" title="Settings" onclick={() => uiStore.settingsOpen = !uiStore.settingsOpen}>
      <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M7 1v1.17A5.02 5.02 0 0 0 4.17 4H3V3H1v2h1.17A5.02 5.02 0 0 0 4 7.83V9h1V7.83A5.02 5.02 0 0 0 7 6h0z" fill="none"/><path d="M8 3a5 5 0 1 0 0 10A5 5 0 0 0 8 3zm0 8.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" fill="none" stroke="currentColor" stroke-width="0"/><path d="M6.8.5h2.4l.3 1.8.8.3 1.5-1 1.7 1.7-1 1.5.3.8 1.8.3v2.4l-1.8.3-.3.8 1 1.5-1.7 1.7-1.5-1-.8.3-.3 1.8H6.8l-.3-1.8-.8-.3-1.5 1-1.7-1.7 1-1.5-.3-.8L1.4 9.2V6.8l1.8-.3.3-.8-1-1.5 1.7-1.7 1.5 1 .8-.3z"/><circle cx="8" cy="8" r="2.5" fill="var(--ui-bg)"/></svg>
    </button>
    <button class="picker-btn" onclick={() => uiStore.infoModalOpen = true}>
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M6 6.5a2 2 0 0 1 3.9.5c0 1.5-2 1.5-2 3" stroke-linecap="round"/><circle cx="8" cy="12" r="0.5" fill="currentColor" stroke="none"/></svg>
    </button>
    <select value={currentGroup} onchange={onSelectChange}>
      <option value="__custom__">Custom...</option>
      {#each TLE_SOURCES as src}
        <option value={src.group}>{src.name}</option>
      {/each}
    </select>
  </div>
  {#if customVisible}
    <div class="custom-row">
      <input type="text" class="url-input" placeholder="TLE URL..." bind:value={urlValue} onkeydown={onKeydown}>
      <button class="picker-btn" onclick={loadUrl}>Load</button>
      <button class="picker-btn" onclick={() => fileInput.click()}>File</button>
      <input type="file" bind:this={fileInput} accept=".tle,.txt,.3le" style="display:none" onchange={onFileChange}>
    </div>
  {/if}
</div>

<style>
  .tle-picker {
    position: absolute;
    bottom: 10px;
    right: 10px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
  }
  .planet-picker-row {
    display: flex;
    justify-content: flex-end;
    margin-right: 16px;
    margin-bottom: 16px;
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
  }
  .planet-btn canvas {
    width: 36px;
    height: 36px;
    transition: filter 0.15s;
    display: block;
  }
  .planet-btn:hover canvas { filter: brightness(1.4); }
  .main-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tle-picker select, .picker-btn, .url-input {
    background: var(--ui-bg);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 3px 6px;
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
  }
  .tle-picker select:hover, .picker-btn:hover, .url-input:hover {
    border-color: var(--border-hover);
  }
  .picker-btn { color: var(--text-faint); display: inline-flex; align-items: center; justify-content: center; width: 25px; height: 25px; padding: 0; }
  .picker-btn:hover { color: var(--text-dim); }
  .custom-row {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .url-input { width: 220px; cursor: text; }
  .url-input::placeholder { color: var(--text-ghost); }

  @media (max-width: 600px) {
    .tle-picker select, .picker-btn, .url-input { font-size: 13px; padding: 5px 8px; }
    .url-input { width: 130px; }
    .custom-row { flex-wrap: wrap; justify-content: flex-end; }
  }
</style>
