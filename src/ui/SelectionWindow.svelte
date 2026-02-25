<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import Checkbox from './shared/Checkbox.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { ICON_SELECTION, ICON_PASSES } from './shared/icons';

  let expandedSats = $state(new Set<string>());
  let searchQuery = $state('');
  let searchFocused = $state(false);
  let searchResults = $derived.by(() => {
    if (!searchFocused) return [] as string[];
    const names = uiStore.getSatelliteNames?.() ?? [];
    const selected = new Set(uiStore.selectedSatData.map(s => s.name));
    if (!searchQuery) {
      const results: string[] = [];
      for (const name of names) {
        if (!selected.has(name)) {
          results.push(name);
          if (results.length >= 10) break;
        }
      }
      return results;
    }
    const q = searchQuery.toLowerCase();
    const matches: string[] = [];
    for (const name of names) {
      if (!selected.has(name) && name.toLowerCase().includes(q)) {
        matches.push(name);
        if (matches.length >= 10) break;
      }
    }
    return matches;
  });
  let searchSelectedIdx = $state(0);

  function selectFromSearch(name: string) {
    uiStore.onSelectSatelliteByName?.(name);
    searchQuery = '';
    searchSelectedIdx = 0;
  }

  function onSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      searchSelectedIdx = Math.min(searchSelectedIdx + 1, searchResults.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      searchSelectedIdx = Math.max(searchSelectedIdx - 1, 0);
    } else if (e.key === 'Enter' && searchResults[searchSelectedIdx]) {
      e.preventDefault();
      selectFromSearch(searchResults[searchSelectedIdx]);
    } else if (e.key === 'Escape') {
      searchQuery = '';
      searchSelectedIdx = 0;
    }
  }

  function onSearchInput() {
    searchSelectedIdx = 0;
  }

  function toggle(name: string) {
    const next = new Set(expandedSats);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    expandedSats = next;
  }

  function deselect(name: string) {
    expandedSats.delete(name);
    uiStore.onDeselectSatelliteByName?.(name);
  }

  function clearAll() {
    expandedSats = new Set();
    uiStore.onDeselectAll?.();
  }

  let someHidden = $derived(uiStore.hiddenSelectedSats.size > 0);

  function showAll() {
    uiStore.hiddenSelectedSats = new Set();
  }

  function hideAll() {
    uiStore.hiddenSelectedSats = new Set(uiStore.selectedSatData.map(s => s.name));
  }

  function togglePasses() {
    uiStore.passesWindowOpen = !uiStore.passesWindowOpen;
    if (uiStore.passesWindowOpen) uiStore.onRequestPasses?.();
  }

  function colorRgb(c: [number, number, number]) {
    return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
  }

  const fmt = (n: number, d = 1) => n.toFixed(d);
</script>

{#snippet selIcon()}<span class="title-icon">{@html ICON_SELECTION}</span>{/snippet}
<DraggableWindow id="selection" title="Selection" icon={selIcon} bind:open={uiStore.selectionWindowOpen} initialX={9999} initialY={200}>
  <div class="sw">
    <div class="search-box">
      <input
        class="search-input"
        type="text"
        placeholder="Add satellite..."
        bind:value={searchQuery}
        oninput={onSearchInput}
        onkeydown={onSearchKeydown}
        onfocus={() => searchFocused = true}
        onblur={() => setTimeout(() => searchFocused = false, 150)}
        spellcheck="false"
        autocomplete="off"
      />
      {#if searchFocused && searchResults.length > 0}
        <div class="search-results">
          {#each searchResults as name, i}
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <div
              class="search-item"
              class:selected={i === searchSelectedIdx}
              onclick={() => selectFromSearch(name)}
              onmouseenter={() => searchSelectedIdx = i}
            >{name}</div>
          {/each}
        </div>
      {:else if searchFocused && searchQuery}
        <div class="search-results">
          <div class="search-empty">No matches</div>
        </div>
      {/if}
    </div>
    {#if uiStore.selectedSatData.length === 0}
      {#if (uiStore.getSatelliteNames?.() ?? []).length === 0}
        <div class="empty empty-warn">No sources loaded</div>
      {:else}
        <div class="empty">Click a satellite to select</div>
      {/if}
    {:else}
      <div class="header-row">
        <Checkbox size="sm" class="master-cb"
          checked={!someHidden}
          mixed={someHidden && uiStore.hiddenSelectedSats.size < uiStore.selectedSatData.length}
          onchange={() => someHidden ? showAll() : hideAll()} />
        <span class="count">{uiStore.selectedSatData.length} selected</span>
        <button class="passes-btn" onclick={togglePasses} title="Predict passes">{@html ICON_PASSES} Passes</button>
        <button class="clear-btn" onclick={clearAll}>Clear</button>
      </div>
      <div class="sat-list">
        {#each uiStore.selectedSatData as sat}
          {@const hidden = uiStore.hiddenSelectedSats.has(sat.name)}
          <div class="sat-row" class:sat-hidden={hidden}>
            <div class="sat-compact">
              <Checkbox size="sm" color={colorRgb(sat.color)}
                checked={!hidden}
                onchange={() => uiStore.toggleSatVisibility(sat.name)} />
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <span class="sat-name" onclick={() => toggle(sat.name)}>{sat.name}</span>
              <span class="pill">{fmt(sat.altKm, 0)} km</span>
              <span class="pill">{fmt(sat.speedKmS, 2)} km/s</span>
              <button class="expand-btn" onclick={() => toggle(sat.name)} title={expandedSats.has(sat.name) ? 'Collapse' : 'Expand'}>
                <svg viewBox="0 0 10 6" width="8" height="5" fill="currentColor" class:rotated={expandedSats.has(sat.name)}>
                  <polygon points="0,0 10,0 5,6"/>
                </svg>
              </button>
              <button class="deselect-btn" onclick={() => deselect(sat.name)} title="Deselect">&times;</button>
            </div>
            {#if expandedSats.has(sat.name)}
              <div class="sat-detail">
                <div class="detail-grid">
                  <span class="dl">Inclination</span><span class="dv">{fmt(sat.incDeg, 2)}&deg;</span>
                  <span class="dl">Eccentricity</span><span class="dv">{sat.eccen.toFixed(5)}</span>
                  <span class="dl">RAAN</span><span class="dv">{fmt(sat.raanDeg, 2)}&deg;</span>
                  <span class="dl">Period</span><span class="dv">{fmt(sat.periodMin, 1)} min</span>
                  <span class="dl">Latitude</span><span class="dv">{fmt(sat.latDeg, 2)}&deg;</span>
                  <span class="dl">Longitude</span><span class="dv">{fmt(sat.lonDeg, 2)}&deg;</span>
                  {#if sat.magStr !== null}
                    <span class="dl">Magnitude</span><span class="dv">{sat.magStr}</span>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</DraggableWindow>

<style>
  .sw {
    min-width: 220px;
    max-width: 320px;
  }
  .search-box {
    position: relative;
    margin-bottom: 6px;
  }
  .search-input {
    width: 100%;
    background: var(--ui-bg);
    border: 1px solid var(--border);
    color: var(--text);
    font-size: 12px;
    font-family: inherit;
    padding: 4px 8px;
    outline: none;
    box-sizing: border-box;
  }
  .search-input:focus { border-color: var(--border-hover); }
  .search-input::placeholder { color: var(--text-ghost); }
  .search-results {
    position: absolute;
    left: 0; right: 0;
    top: 100%;
    background: var(--modal-bg);
    border: 1px solid var(--border);
    border-top: none;
    z-index: 10;
    max-height: 180px;
    overflow-y: auto;
  }
  .search-item {
    padding: 4px 8px;
    font-size: 12px;
    color: var(--text-dim);
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .search-item:hover, .search-item.selected {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text);
  }
  .search-empty {
    padding: 6px 8px;
    font-size: 11px;
    color: var(--text-ghost);
  }
  .empty {
    color: var(--text-ghost);
    font-size: 12px;
    padding: 4px 0;
  }
  .empty-warn {
    color: #c44;
  }
  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .count {
    font-size: 11px;
    color: var(--text-ghost);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .clear-btn {
    margin-left: 6px;
    background: none;
    border: 1px solid var(--border);
    color: var(--text-ghost);
    font-size: 10px;
    font-family: inherit;
    padding: 1px 6px;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .passes-btn {
    margin-left: auto;
    background: none;
    border: 1px solid var(--border);
    color: var(--text-ghost);
    font-size: 10px;
    font-family: inherit;
    padding: 1px 6px;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .passes-btn:hover { color: var(--text-dim); border-color: var(--border-hover); }
  .passes-btn :global(svg) { width: 10px; height: 10px; }
  .clear-btn:hover { color: var(--text-dim); border-color: var(--border-hover); }

  .sat-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 300px;
    overflow-y: auto;
  }
  .sat-row {
    border-left: 2px solid transparent;
  }
  .sat-compact {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 0;
  }
  .sat-hidden .sat-name,
  .sat-hidden .pill { opacity: 0.35; }
  .header-row :global(.master-cb) { margin-left: 2px; margin-right: 4px; opacity: 0.45; }
  .header-row :global(.master-cb:hover) { opacity: 0.7; }
  .sat-name {
    font-size: 12px;
    color: var(--text);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }
  .sat-name:hover { color: var(--text-muted); }
  .pill {
    font-size: 10px;
    color: var(--text-faint);
    background: var(--ui-bg);
    padding: 1px 4px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .expand-btn {
    background: none;
    border: none;
    color: var(--text-ghost);
    cursor: pointer;
    padding: 2px 3px;
    line-height: 0;
    flex-shrink: 0;
  }
  .expand-btn:hover { color: var(--text-dim); }
  .expand-btn svg {
    transition: transform 0.15s;
  }
  .expand-btn svg.rotated {
    transform: rotate(180deg);
  }
  .deselect-btn {
    background: none;
    border: none;
    color: var(--text-ghost);
    cursor: pointer;
    font-size: 14px;
    padding: 0 2px;
    line-height: 1;
    flex-shrink: 0;
  }
  .deselect-btn:hover { color: #ff6666; }

  .sat-detail {
    padding: 2px 0 4px 14px;
  }
  .detail-grid {
    display: grid;
    grid-template-columns: auto 1fr auto 1fr;
    gap: 1px 8px;
    font-size: 11px;
  }
  .dl {
    color: var(--text-ghost);
  }
  .dv {
    color: var(--text-dim);
  }
</style>
