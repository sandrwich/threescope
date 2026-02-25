<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import Checkbox from './shared/Checkbox.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { ICON_VIEW } from './shared/icons';
  import { settingsStore } from '../stores/settings.svelte';
  import { findMatchingPreset, getPresetSettings } from '../graphics';
  import { defaultConfig } from '../config';

  function toggleRtx() {
    const currentPreset = findMatchingPreset(settingsStore.graphics);
    if (currentPreset) {
      const target = currentPreset === 'rtx' ? 'standard' : 'rtx';
      settingsStore.applyGraphics(getPresetSettings(target));
    } else {
      uiStore.settingsOpen = true;
    }
  }

  let rtxChecked = $derived(findMatchingPreset(settingsStore.graphics) === 'rtx');
  let isCustomized = $derived(findMatchingPreset(settingsStore.graphics) === null);
  let rtxTitle = $derived(isCustomized ? 'Open graphics settings' : (rtxChecked ? 'Switch to Standard' : 'Switch to RTX'));
</script>

{#snippet viewIcon()}<span class="title-icon">{@html ICON_VIEW}</span>{/snippet}
<DraggableWindow id="view" title="View" icon={viewIcon} bind:open={uiStore.viewWindowOpen} initialX={10} initialY={200}>
  <div class="view-content">
    <div class="section">
      <div class="section-header">Rendering</div>
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <label
        class="toggle-label"
        class:disabled={isCustomized}
        title={rtxTitle}
        onclick={(e) => { if (isCustomized) { e.preventDefault(); uiStore.settingsOpen = true; } }}
      >
        <Checkbox checked={rtxChecked} disabled={isCustomized} onchange={toggleRtx} />
        {isCustomized ? 'Customized' : 'RTX'}
      </label>
      <label class="toggle-label" title="Show star skybox background">
          <Checkbox bind:checked={uiStore.showSkybox}
            onchange={() => uiStore.setToggle('showSkybox', uiStore.showSkybox)} />
          Skybox
        </label>
      {#if uiStore.nightToggleVisible}
        <label class="toggle-label" title="Show city lights on dark side">
          <Checkbox bind:checked={uiStore.showNightLights}
            onchange={() => uiStore.setToggle('showNightLights', uiStore.showNightLights)} />
          Dark Side
        </label>
      {/if}
    </div>

    {#if uiStore.earthTogglesVisible}
      <div class="section">
        <div class="section-header">Earth</div>
        <label class="toggle-label" title="Show cloud layer on Earth">
          <Checkbox bind:checked={uiStore.showClouds}
            onchange={() => uiStore.setToggle('showClouds', uiStore.showClouds)} />
          Clouds
        </label>
        <label class="toggle-label" title="Show country border outlines">
          <Checkbox bind:checked={uiStore.showCountries}
            onchange={() => uiStore.setToggle('showCountries', uiStore.showCountries)} />
          Countries
        </label>
        <label class="toggle-label" title="Show latitude/longitude grid (15°)">
          <Checkbox bind:checked={uiStore.showGrid}
            onchange={() => uiStore.setToggle('showGrid', uiStore.showGrid)} />
          Grid
        </label>
      </div>
    {/if}

    {#if uiStore.earthTogglesVisible}
      <div class="section">
        <div class="section-header">Satellites</div>
        <label class="toggle-label" title="Focus on selected satellite only">
          <Checkbox bind:checked={uiStore.hideUnselected}
            onchange={() => uiStore.setToggle('hideUnselected', uiStore.hideUnselected)} />
          Spotlight
        </label>
        <label class="toggle-label" title="Show orbit trajectories for all satellites">
          <Checkbox bind:checked={uiStore.showOrbits}
            onchange={() => uiStore.setToggle('showOrbits', uiStore.showOrbits)} />
          Orbits
        </label>
      </div>

      <div class="section">
        <div class="section-header">Markers</div>
        {#each defaultConfig.markerGroups as group}
          <label class="toggle-label" title={group.label}>
            <Checkbox
              checked={uiStore.markerVisibility[group.id] ?? false}
              onchange={() => uiStore.setMarkerGroupVisible(group.id, !(uiStore.markerVisibility[group.id] ?? false))} />
            {group.label}
          </label>
        {/each}
      </div>
    {/if}
  </div>
</DraggableWindow>

<style>
  .view-content {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 140px;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .section-header {
    font-size: 10px;
    color: var(--text-ghost);
    text-transform: uppercase;
    letter-spacing: 0.8px;
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

</style>
