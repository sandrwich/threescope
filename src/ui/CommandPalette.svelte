<script lang="ts">
  import { uiStore } from '../stores/ui.svelte';
  import { timeStore } from '../stores/time.svelte';
  import { settingsStore } from '../stores/settings.svelte';
  import { getPresetSettings } from '../graphics';
  import { getSimPresetSettings } from '../simulation';
  import { TLE_SOURCES } from '../data/tle-sources';
  import { PLANETS } from '../bodies';
  import { defaultConfig } from '../config';
  import { tick } from 'svelte';

  interface PaletteAction {
    id: string;
    category: string;
    label: string;
    keywords?: string;
    shortcut?: string;
    execute: () => void;
  }

  let query = $state('');
  let selectedIndex = $state(0);
  let satMode = $state(false);
  let inputEl: HTMLInputElement | undefined = $state();
  let listEl: HTMLDivElement | undefined = $state();

  function close() {
    uiStore.commandPaletteOpen = false;
    query = '';
    selectedIndex = 0;
    satMode = false;
  }

  // Build static action list
  function buildActions(): PaletteAction[] {
    const actions: PaletteAction[] = [];

    // Satellite
    actions.push({ id: 'sat-search', category: 'Satellite', label: 'Search Satellite...', shortcut: 'Ctrl+F', execute: () => { satMode = true; query = ''; selectedIndex = 0; } });
    actions.push({ id: 'sat-deselect-all', category: 'Satellite', label: 'Deselect All', keywords: 'clear unselect', execute: () => { uiStore.onDeselectAll?.(); close(); } });

    // Time
    actions.push({ id: 'time-pause', category: 'Time', label: 'Play / Pause', shortcut: 'Space', execute: () => { timeStore.togglePause(); close(); } });
    actions.push({ id: 'time-faster', category: 'Time', label: 'Speed Up', shortcut: '.', execute: () => { timeStore.stepForward(); close(); } });
    actions.push({ id: 'time-slower', category: 'Time', label: 'Slow Down', shortcut: ',', execute: () => { timeStore.stepBackward(); close(); } });
    actions.push({ id: 'time-reset', category: 'Time', label: 'Reset Speed', shortcut: '/', execute: () => { timeStore.resetSpeed(); close(); } });
    actions.push({ id: 'time-now', category: 'Time', label: 'Jump to Now', execute: () => { timeStore.jumpToNow(); close(); } });

    // View toggles
    actions.push({ id: 'view-spotlight', category: 'View', label: 'Toggle Spotlight', keywords: 'hide unselected focus', execute: () => { uiStore.setToggle('hideUnselected', !uiStore.hideUnselected); close(); } });
    actions.push({ id: 'view-orbits', category: 'View', label: 'Toggle Orbits', keywords: 'trajectories paths', execute: () => { uiStore.setToggle('showOrbits', !uiStore.showOrbits); close(); } });
    actions.push({ id: 'view-clouds', category: 'View', label: 'Toggle Clouds', execute: () => { uiStore.setToggle('showClouds', !uiStore.showClouds); close(); } });
    actions.push({ id: 'view-night', category: 'View', label: 'Toggle Dark Side', keywords: 'night lights cities', execute: () => { uiStore.setToggle('showNightLights', !uiStore.showNightLights); close(); } });
    if (!uiStore.orreryMode) {
      actions.push({ id: 'view-2d3d', category: 'View', label: 'Toggle 2D / 3D', shortcut: 'M', keywords: 'map globe', execute: () => { uiStore.onToggleViewMode?.(); close(); } });
    }

    // Marker groups
    for (const group of defaultConfig.markerGroups) {
      actions.push({
        id: `markers-${group.id}`,
        category: 'View',
        label: `Toggle ${group.label}`,
        keywords: 'markers',
        execute: () => { uiStore.setMarkerGroupVisible(group.id, !(uiStore.markerVisibility[group.id] ?? false)); close(); },
      });
    }

    // Navigation
    actions.push({ id: 'nav-earth', category: 'Navigate', label: 'Earth', execute: () => { uiStore.onNavigateTo?.('earth'); close(); } });
    actions.push({ id: 'nav-moon', category: 'Navigate', label: 'Moon', execute: () => { uiStore.onNavigateTo?.('moon'); close(); } });
    actions.push({ id: 'nav-solar', category: 'Navigate', label: 'Solar System', keywords: 'orrery planets', execute: () => { uiStore.onNavigateTo?.('solar-system'); close(); } });
    for (const planet of PLANETS) {
      actions.push({
        id: `nav-${planet.id}`,
        category: 'Navigate',
        label: planet.name,
        execute: () => { uiStore.onNavigateTo?.(planet.id); close(); },
      });
    }

    // Data (TLE groups)
    for (const src of TLE_SOURCES) {
      actions.push({
        id: `data-${src.group}`,
        category: 'Data',
        label: `Load ${src.name}`,
        keywords: 'tle satellite group',
        execute: () => { uiStore.currentTleGroup = src.group; localStorage.setItem('threescope_tle_group', src.group); uiStore.onTLEGroupChange?.(src.group); close(); },
      });
    }

    // Graphics presets
    actions.push({ id: 'gfx-standard', category: 'Graphics', label: 'Apply Standard', keywords: 'preset low', execute: () => { settingsStore.applyGraphics(getPresetSettings('standard')); close(); } });
    actions.push({ id: 'gfx-rtx', category: 'Graphics', label: 'Apply RTX', keywords: 'preset high bloom', execute: () => { settingsStore.applyGraphics(getPresetSettings('rtx')); close(); } });

    // Simulation presets
    actions.push({ id: 'sim-approx', category: 'Simulation', label: 'Apply Approximate', keywords: 'preset analytical fast', execute: () => { settingsStore.applySimulation(getSimPresetSettings('approximate')); close(); } });
    actions.push({ id: 'sim-accurate', category: 'Simulation', label: 'Apply Accurate', keywords: 'preset sgp4 precise', execute: () => { settingsStore.applySimulation(getSimPresetSettings('accurate')); close(); } });

    // Windows
    actions.push({ id: 'win-time', category: 'Window', label: 'Toggle Time Control', execute: () => { uiStore.timeWindowOpen = !uiStore.timeWindowOpen; close(); } });
    actions.push({ id: 'win-view', category: 'Window', label: 'Toggle View', execute: () => { uiStore.viewWindowOpen = !uiStore.viewWindowOpen; close(); } });
    actions.push({ id: 'win-settings', category: 'Window', label: 'Toggle Settings', execute: () => { uiStore.settingsOpen = !uiStore.settingsOpen; close(); } });
    actions.push({ id: 'win-selection', category: 'Window', label: 'Toggle Selection', keywords: 'selected satellites panel', execute: () => { uiStore.selectionWindowOpen = !uiStore.selectionWindowOpen; close(); } });
    actions.push({ id: 'win-passes', category: 'Window', label: 'Toggle Passes', shortcut: 'P', keywords: 'pass predictor observer satellite', execute: () => { uiStore.passesWindowOpen = !uiStore.passesWindowOpen; close(); } });
    actions.push({ id: 'win-polar', category: 'Window', label: 'Toggle Polar Plot', keywords: 'azimuth elevation tracking', execute: () => { uiStore.polarPlotOpen = !uiStore.polarPlotOpen; close(); } });
    actions.push({ id: 'win-help', category: 'Window', label: 'Show Help', keywords: 'info controls keyboard', execute: () => { uiStore.infoModalOpen = true; close(); } });

    return actions;
  }

  const staticActions = buildActions();

  // Build full action list (static + dynamic per-selected-sat deselect, grouped with Satellite category)
  let allActions = $derived.by(() => {
    const selectedNames = uiStore.selectedSatData.map(s => s.name);
    if (selectedNames.length === 0) return staticActions;
    const dynamicActions: PaletteAction[] = selectedNames.map(name => ({
      id: `sat-deselect-${name}`,
      category: 'Satellite',
      label: `Deselect ${name}`,
      keywords: 'remove unselect',
      execute: () => { uiStore.onDeselectSatelliteByName?.(name); close(); },
    }));
    // Insert after last Satellite action so they're grouped together
    const lastSatIdx = staticActions.findLastIndex(a => a.category === 'Satellite');
    const result = [...staticActions];
    result.splice(lastSatIdx + 1, 0, ...dynamicActions);
    return result;
  });

  // Filter actions by query
  let filteredActions = $derived.by(() => {
    if (satMode) return [];
    if (!query) return allActions;
    const q = query.toLowerCase();
    return allActions.filter(a => {
      const searchable = `${a.category} ${a.label} ${a.keywords ?? ''}`.toLowerCase();
      return searchable.includes(q);
    });
  });

  // Satellite search results
  let satResults = $derived.by(() => {
    if (!satMode) return [];
    const names = uiStore.getSatelliteNames?.() ?? [];
    if (!query) return names.slice(0, 20);
    const q = query.toLowerCase();
    const matches: string[] = [];
    for (const name of names) {
      if (name.toLowerCase().includes(q)) {
        matches.push(name);
        if (matches.length >= 20) break;
      }
    }
    return matches;
  });

  let totalResults = $derived(satMode ? satResults.length : filteredActions.length);

  // Clamp selected index when results change
  $effect(() => {
    if (selectedIndex >= totalResults) {
      selectedIndex = Math.max(0, totalResults - 1);
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (!uiStore.commandPaletteOpen) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (satMode) {
        satMode = false;
        query = '';
        selectedIndex = 0;
      } else {
        close();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, totalResults - 1);
      scrollToSelected();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      scrollToSelected();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (satMode) {
        if (satResults[selectedIndex]) {
          uiStore.onSelectSatelliteByName?.(satResults[selectedIndex]);
          close();
        }
      } else {
        if (filteredActions[selectedIndex]) {
          filteredActions[selectedIndex].execute();
        }
      }
      return;
    }
  }

  function scrollToSelected() {
    tick().then(() => {
      const item = listEl?.querySelector('.selected');
      item?.scrollIntoView({ block: 'nearest' });
    });
  }

  function onOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  // Auto-focus input when palette opens; enter sat mode if requested
  $effect(() => {
    if (uiStore.commandPaletteOpen) {
      if (uiStore.commandPaletteSatMode) {
        satMode = true;
        uiStore.commandPaletteSatMode = false;
      }
      tick().then(() => inputEl?.focus());
    }
  });

  function onInput() {
    selectedIndex = 0;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if uiStore.commandPaletteOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="palette-overlay" onclick={onOverlayClick}>
    <div class="palette">
      <div class="palette-input-row">
        {#if satMode}
          <button class="back-btn" onclick={() => { satMode = false; query = ''; selectedIndex = 0; }}>&larr;</button>
        {/if}
        <input
          bind:this={inputEl}
          bind:value={query}
          oninput={onInput}
          class="palette-input"
          type="text"
          placeholder={satMode ? 'Search satellites...' : 'Search actions...'}
          spellcheck="false"
          autocomplete="off"
        />
      </div>
      <div class="palette-list" bind:this={listEl}>
        {#if satMode}
          {#if satResults.length === 0}
            <div class="palette-empty">{query ? 'No matching satellites' : 'No satellites loaded'}</div>
          {:else}
            {#each satResults as name, i}
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div
                class="palette-item"
                class:selected={i === selectedIndex}
                onclick={() => { uiStore.onSelectSatelliteByName?.(name); close(); }}
                onmouseenter={() => selectedIndex = i}
              >
                <span class="item-category">Satellite</span>
                <span class="item-label">{name}</span>
              </div>
            {/each}
          {/if}
        {:else}
          {#if filteredActions.length === 0}
            <div class="palette-empty">No matching actions</div>
          {:else}
            {#each filteredActions as action, i}
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div
                class="palette-item"
                class:selected={i === selectedIndex}
                onclick={() => action.execute()}
                onmouseenter={() => selectedIndex = i}
              >
                <span class="item-category">{action.category}</span>
                <span class="item-label">{action.label}</span>
                {#if action.shortcut}
                  <span class="item-shortcut">{action.shortcut}</span>
                {/if}
              </div>
            {/each}
          {/if}
        {/if}
      </div>
      <div class="palette-footer">
        <span><kbd>&uarr;</kbd><kbd>&darr;</kbd> navigate</span>
        <span><kbd>Enter</kbd> select</span>
        <span><kbd>Esc</kbd> {satMode ? 'back' : 'close'}</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .palette-overlay {
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    z-index: 1000;
    display: flex;
    justify-content: center;
    padding-top: 15vh;
    background: var(--modal-overlay);
  }

  .palette {
    background: var(--modal-bg);
    border: 1px solid var(--border);
    width: 90%;
    max-width: 480px;
    max-height: 400px;
    display: flex;
    flex-direction: column;
    align-self: flex-start;
  }

  .palette-input-row {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--border);
  }

  .back-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 16px;
    padding: 8px 4px 8px 12px;
    cursor: pointer;
    font-family: inherit;
  }
  .back-btn:hover { color: var(--text); }

  .palette-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text);
    font-size: 14px;
    font-family: inherit;
    padding: 10px 12px;
  }
  .palette-input::placeholder { color: var(--text-ghost); }

  .palette-list {
    overflow-y: auto;
    flex: 1;
  }

  .palette-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-dim);
  }
  .palette-item:hover,
  .palette-item.selected {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text);
  }

  .item-category {
    color: var(--text-ghost);
    font-size: 11px;
    min-width: 70px;
    flex-shrink: 0;
  }

  .item-label {
    flex: 1;
  }

  .item-shortcut {
    color: var(--text-ghost);
    font-size: 11px;
    background: var(--kbd-bg);
    padding: 1px 5px;
    border: 1px solid var(--border);
  }

  .palette-empty {
    padding: 16px 12px;
    color: var(--text-ghost);
    font-size: 13px;
    text-align: center;
  }

  .palette-footer {
    display: flex;
    gap: 12px;
    padding: 6px 12px;
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--text-ghost);
  }
  .palette-footer kbd {
    background: var(--kbd-bg);
    border: 1px solid var(--border);
    padding: 0 3px;
    font-family: inherit;
    font-size: 10px;
    color: var(--text-faint);
  }
</style>
