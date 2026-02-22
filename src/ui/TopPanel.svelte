<script lang="ts">
  import { timeStore } from '../stores/time.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { settingsStore } from '../stores/settings.svelte';
  import { findMatchingPreset, getPresetSettings } from '../graphics';

  function toggleRtx() {
    const currentPreset = findMatchingPreset(settingsStore.graphics);
    if (currentPreset) {
      // Toggle between standard and rtx
      const target = currentPreset === 'rtx' ? 'standard' : 'rtx';
      settingsStore.applyGraphics(getPresetSettings(target));
    } else {
      // Customized — open settings
      uiStore.settingsOpen = true;
    }
  }

  let rtxChecked = $derived(findMatchingPreset(settingsStore.graphics) === 'rtx');
  let isCustomized = $derived(findMatchingPreset(settingsStore.graphics) === null);
  let rtxLabel = $derived(isCustomized ? 'Customized' : 'RTX');
  let rtxTitle = $derived(isCustomized ? 'Open graphics settings' : (rtxChecked ? 'Switch to Standard' : 'Switch to RTX'));
</script>

<div class="top-panel">
  <div class="status-line">{timeStore.displayDatetime}</div>
  <div class="speed-line" class:paused={timeStore.paused}>
    Speed: {timeStore.displaySpeed}{timeStore.paused ? ' PAUSED' : ''}
  </div>
  <div class="toggle-row">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <label
      class="toggle-label"
      class:disabled={isCustomized}
      title={rtxTitle}
      onclick={(e) => { if (isCustomized) { e.preventDefault(); uiStore.settingsOpen = true; } }}
    >
      <input
        type="checkbox"
        checked={rtxChecked}
        disabled={isCustomized}
        onchange={toggleRtx}
      > {rtxLabel}
    </label>
    {#if uiStore.earthTogglesVisible}
      <label class="toggle-label" title="Hide all satellites except selected">
        <input type="checkbox" bind:checked={uiStore.hideUnselected}
          onchange={() => uiStore.setToggle('hideUnselected', uiStore.hideUnselected)}
        > Spotlight
      </label>
      <label class="toggle-label" title="Show cloud layer on Earth">
        <input type="checkbox" bind:checked={uiStore.showClouds}
          onchange={() => uiStore.setToggle('showClouds', uiStore.showClouds)}
        > Clouds
      </label>
      <label class="toggle-label" title="Show launch site markers">
        <input type="checkbox" bind:checked={uiStore.showMarkers}
          onchange={() => uiStore.setToggle('showMarkers', uiStore.showMarkers)}
        > Markers
      </label>
    {/if}
    {#if uiStore.nightToggleVisible}
      <label class="toggle-label" title="Show city lights on night side">
        <input type="checkbox" bind:checked={uiStore.showNightLights}
          onchange={() => uiStore.setToggle('showNightLights', uiStore.showNightLights)}
        > Night
      </label>
    {/if}
  </div>
</div>

<style>
  .top-panel {
    position: absolute;
    top: 8px;
    left: 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .status-line {
    font-size: 13px;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .speed-line {
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .speed-line.paused { color: #ff6666; }
  .toggle-row {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 4px;
  }
  .toggle-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    cursor: pointer;
    color: var(--text-dim);
    line-height: 18px;
  }
  .toggle-label:hover { color: var(--text); }
  .toggle-label.disabled { color: var(--text-dim); opacity: 0.6; cursor: default; }

  .toggle-label input[type="checkbox"] {
    appearance: none;
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border: 2px solid var(--border-hover);
    background: transparent;
    cursor: pointer;
    position: relative;
    flex-shrink: 0;
  }
  .toggle-label input[type="checkbox"]:hover { border-color: var(--text); }
  .toggle-label input[type="checkbox"]:checked::after {
    content: '';
    position: absolute;
    top: 2px; left: 2px; right: 2px; bottom: 2px;
    background: var(--text);
  }
  .toggle-label input[type="checkbox"]:disabled {
    border-color: var(--text-dim);
    opacity: 0.4;
    cursor: default;
  }
</style>
