<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import VirtualList from './shared/VirtualList.svelte';
  import Button from './shared/Button.svelte';
  import Input from './shared/Input.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { sourcesStore } from '../stores/sources.svelte';
  import { ICON_DATABASE } from './shared/icons';
  import {
    getSatnogsData,
    getSatnogsSearchIndex,
    getSatellitesByFreqRange,
    satnogsImageUrl,
    satnogsPageUrl,
    type SatnogsSearchEntry,
  } from '../data/satnogs';
  import { cachedTleHasNorad, cachedTleSatCount } from '../data/tle-loader';
  import { formatFreqHz } from '../format';
  import { FREQ_PRESETS } from '../data/freq-presets';

  function truncUrl(url: string): string {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '');
      const path = u.pathname === '/' ? '' : u.pathname.slice(0, 20);
      return host + path + (u.pathname.length > 20 ? '...' : '');
    } catch {
      return url.slice(0, 30);
    }
  }

  // ─── Search & filters ───────────────────────────────────────

  let searchQuery = $state('');
  let filterTle = $state(false);
  let filterStatuses = $state<Set<string>>(new Set());
  let filterService = $state<string | null>(null);
  let freqMin = $state(0);
  let freqMax = $state(0);

  const STATUSES = ['alive', 'dead', 're-entered', 'future'] as const;
  const STATUS_LABELS: Record<string, string> = {
    'alive': 'Alive',
    'dead': 'Dead',
    're-entered': 'Re-entered',
    'future': 'Future',
  };

  function toggleStatus(status: string) {
    const next = new Set(filterStatuses);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    filterStatuses = next;
  }

  function toggleService(svc: string) {
    filterService = filterService === svc ? null : svc;
  }

  function applyFreqPreset(p: { min: number; max: number }) {
    if (freqMin === p.min && freqMax === p.max) {
      freqMin = 0; freqMax = 0;
    } else {
      freqMin = p.min; freqMax = p.max;
    }
  }

  let hasAnyFilter = $derived(filterTle || filterStatuses.size > 0 || filterService !== null || freqMin > 0 || freqMax > 0);

  // Precompute frequency-matching NORAD IDs when range is set
  let freqMatchSet = $derived.by(() => {
    if (freqMin <= 0 && freqMax <= 0) return null;
    return getSatellitesByFreqRange(
      (freqMin || 0) * 1e6,
      (freqMax || 50000) * 1e6,
    );
  });

  let searchResults = $derived.by((): (SatnogsSearchEntry & { inTle: boolean })[] => {
    void sourcesStore.totalSats; // re-evaluate when sources reload
    const index = getSatnogsSearchIndex();
    const tleSet = new Set((uiStore.getSatelliteList?.() ?? []).map(s => s.noradId));
    const q = searchQuery ? searchQuery.toLowerCase() : '';
    const matches: (SatnogsSearchEntry & { inTle: boolean })[] = [];
    for (const s of index) {
      if (q && !s.name.toLowerCase().includes(q) && !String(s.noradId).includes(q)) continue;
      const inTle = tleSet.has(s.noradId);
      if (filterTle && !inTle) continue;
      if (filterStatuses.size > 0 && (!s.status || !filterStatuses.has(s.status))) continue;
      if (filterService && !s.services.includes(filterService)) continue;
      if (freqMatchSet && !freqMatchSet.has(s.noradId)) continue;
      matches.push({ ...s, inTle });
    }
    return matches;
  });

  function clearFilters() {
    filterTle = false;
    filterStatuses = new Set();
    filterService = null;
    freqMin = 0;
    freqMax = 0;
  }

  // ─── Selection ─────────────────────────────────────────────

  let selectedId = $state<number | null>(null);

  // When opened from SelectionWindow with a noradId, auto-select it
  $effect(() => {
    const id = uiStore.satDatabaseNoradId;
    if (id) selectedId = id;
  });

  function selectItem(noradId: number) {
    selectedId = noradId;
    uiStore.satDatabaseNoradId = noradId;
  }

  function addToSelection(noradId: number) {
    uiStore.onSelectSatellite?.(noradId);
    uiStore.selectionWindowOpen = true;
    uiStore.selectionWindowFocus++;
  }

  // ─── Detail view ────────────────────────────────────────────

  let entry = $derived(selectedId ? getSatnogsData(selectedId) : null);

  let activeTx = $derived(entry?.transmitters ?? []);

  let isInTle = $derived.by(() => {
    if (!selectedId) return false;
    void sourcesStore.totalSats; // re-evaluate when sources reload
    const list = uiStore.getSatelliteList?.() ?? [];
    return list.some(s => s.noradId === selectedId);
  });

  let isSelected = $derived.by(() => {
    if (!selectedId) return false;
    void sourcesStore.totalSats;
    const list = uiStore.getSelectedSatelliteList?.() ?? [];
    return list.some(s => s.noradId === selectedId);
  });

  // Find disabled TLE sources that have this satellite cached
  let availableSources = $derived.by(() => {
    if (!selectedId || isInTle) return [];
    const results: { id: string; name: string; satCount: number }[] = [];
    for (const src of sourcesStore.sources) {
      if (sourcesStore.enabledIds.has(src.id)) continue;
      let cacheKey: string;
      let isJson = true;
      if (src.type === 'celestrak' && src.group) {
        cacheKey = 'tlescope_tle_' + src.group;
      } else if (src.type === 'url') {
        cacheKey = 'tlescope_tle_custom_' + src.id;
      } else if (src.type === 'text') {
        cacheKey = 'threescope_source_text_' + src.id;
        isJson = false;
      } else {
        continue;
      }
      if (cachedTleHasNorad(cacheKey, selectedId, isJson)) {
        const count = cachedTleSatCount(cacheKey, isJson);
        results.push({ id: src.id, name: src.name, satCount: count });
      }
    }
    results.sort((a, b) => a.satCount - b.satCount);
    return results;
  });

  function enableSource(sourceId: string) {
    sourcesStore.toggleSource(sourceId);
  }

  function useDoppler(freqHz: number) {
    uiStore.dopplerPrefillHz = freqHz;
    uiStore.dopplerWindowOpen = true;
  }

  // ─── Keyboard navigation in list ───────────────────────────

  function onSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = searchResults.findIndex(r => r.noradId === selectedId);
      const next = Math.min(idx + 1, searchResults.length - 1);
      if (searchResults[next]) selectItem(searchResults[next].noradId);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = searchResults.findIndex(r => r.noradId === selectedId);
      const prev = Math.max(idx - 1, 0);
      if (searchResults[prev]) selectItem(searchResults[prev].noradId);
    } else if (e.key === 'Escape') {
      searchQuery = '';
    }
  }
</script>

{#snippet dbIcon()}<span class="title-icon">{@html ICON_DATABASE}</span>{/snippet}
{#snippet headerExtra()}
  {#if hasAnyFilter}
    <Button class="sdb-reset" size="xs" variant="ghost" onclick={clearFilters}>Reset</Button>
  {/if}
{/snippet}
<DraggableWindow id="sat-database" title="SatNOGS Database" icon={dbIcon} {headerExtra} bind:open={uiStore.satDatabaseOpen} initialX={200} initialY={100}>
  <div class="sdb">
    <!-- Search -->
    <div class="sdb-search-row">
      <Input
        class="sdb-search"
        size="lg"
        type="text"
        placeholder="Search satellites..."
        bind:value={searchQuery}
        onkeydown={onSearchKeydown}
        spellcheck="false"
        autocomplete="off"
      />
    </div>

    <!-- Filters -->
    <div class="sdb-filters">
      <div class="sdb-frow">
        <span class="sdb-flabel">status</span>
        {#each STATUSES as status}
          <Button size="xs" active={filterStatuses.has(status)} onclick={() => toggleStatus(status)}>{STATUS_LABELS[status]}</Button>
        {/each}
        <span class="sdb-flabel">service</span>
        <Button size="xs" active={filterService === 'Amateur'} onclick={() => toggleService('Amateur')}>Amateur</Button>
        <Button size="xs" active={filterService === 'Meteorological'} onclick={() => toggleService('Meteorological')}>Meteo</Button>
        <span class="sdb-flabel">data</span>
        <Button size="xs" active={filterTle} onclick={() => filterTle = !filterTle}>Loaded TLE</Button>
      </div>
      <div class="sdb-frow">
        <span class="sdb-flabel">freq</span>
        <Input class="sdb-fnum" size="xs" type="number" min="0" max="50000" bind:value={freqMin} placeholder="Min" />
        <span class="sdb-fsep-dash">&mdash;</span>
        <Input class="sdb-fnum" size="xs" type="number" min="0" max="50000" bind:value={freqMax} placeholder="Max" />
        <span class="sdb-funit">MHz</span>
        {#each FREQ_PRESETS as p}
          <Button size="xs" active={freqMin === p.min && freqMax === p.max} onclick={() => applyFreqPreset(p)}>{p.label}</Button>
        {/each}
      </div>
    </div>

    <!-- Split: list + detail -->
    <div class="sdb-split">
      <!-- Left: scrollable list -->
      <div class="sdb-list">
        <VirtualList items={searchResults} rowHeight={34} maxHeight={400} buffer={15}>
          {#snippet row(sr)}
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <div class="sdb-list-item" class:active={sr.noradId === selectedId} onclick={() => selectItem(sr.noradId)}>
              <div class="sdb-item-name">{sr.name}</div>
              <div class="sdb-item-meta">
                <span class="sdb-item-norad">#{sr.noradId}</span>
                {#if sr.inTle}<span class="sdb-item-tle">TLE</span>{/if}
                {#if sr.status}<span class="sdb-item-status" class:alive={sr.status === 'alive'} class:dead={sr.status === 'dead'}>{sr.status}</span>{/if}
                {#each sr.bands as band}<span class="sdb-item-band">{band}</span>{/each}
              </div>
            </div>
          {/snippet}
          {#snippet footer()}
            <div class="sdb-count">{searchResults.length} results</div>
          {/snippet}
        </VirtualList>
      </div>

      <!-- Right: detail panel -->
      <div class="sdb-detail">
        {#if !selectedId}
          <div class="sdb-detail-empty">Select a satellite</div>
        {:else if !entry}
          <div class="sdb-detail-empty">No SatNOGS data for #{selectedId}</div>
        {:else}
          {@const sat = entry.satellite}
          <div class="sdb-detail-content">
            {#if sat}
              <div class="sat-header">
                {#if sat.image}
                  <img class="sat-img" src={satnogsImageUrl(sat.image)} alt=""
                    onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                {/if}
                <div class="sat-meta">
                  {#if sat.name}
                    <div class="sat-name">{sat.name}</div>
                  {/if}
                  {#if sat.names}
                    <div class="sat-aliases">{sat.names}</div>
                  {/if}
                  <div class="sat-id-status">
                    <span class="sat-norad">#{selectedId}</span>
                    {#if sat.status}
                      <span class="sat-status" class:alive={sat.status === 'alive'} class:dead={sat.status === 'dead'}>{sat.status}</span>
                    {/if}
                  </div>
                </div>
              </div>

              <div class="info-grid">
                {#if sat.launched}
                  <span class="il">Launched</span><span class="iv">{sat.launched}</span>
                {/if}
                {#if sat.countries}
                  <span class="il">{sat.countries.includes(',') ? 'Countries' : 'Country'}</span><span class="iv">{sat.countries}</span>
                {/if}
                {#if sat.operator}
                  <span class="il">Operator</span><span class="iv">{sat.operator}</span>
                {/if}
                {#if sat.website}
                  <span class="il">Website</span><span class="iv"><a href={sat.website} target="_blank" rel="noopener" class="ext-link">{truncUrl(sat.website)}</a></span>
                {/if}
              </div>
            {/if}

            {#if activeTx.length > 0}
              <div class="section-label">TRANSMITTERS ({activeTx.length})</div>
              <div class="tx-list">
                {#each activeTx as tx}
                  <div class="tx-row">
                    <span class="tx-freq">{formatFreqHz(tx.frequencyHz)}</span>
                    {#if tx.mode}<span class="tx-pill">{tx.mode}</span>{/if}
                    <span class="tx-desc">{tx.description}</span>
                    <Button size="xs" onclick={() => useDoppler(tx.frequencyHz)} title="Use in Doppler analysis">Use</Button>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="sdb-detail-empty">No active transmitters</div>
            {/if}

            {#if sat?.satId}
              <a class="satnogs-link" href={satnogsPageUrl(sat.satId)} target="_blank" rel="noopener">View on SatNOGS &rarr;</a>
            {/if}
          </div>

          <div class="sdb-detail-footer">
            {#if !isInTle && availableSources.length > 0}
              <div class="sdb-source-hint">
                <span class="sdb-hint-text">Available in:</span>
                {#each availableSources as src}
                  <Button size="xs" class={src.satCount >= 1000 ? 'sdb-hint-large' : ''} onclick={() => enableSource(src.id)} title="{src.name} ({src.satCount} sats){src.satCount >= 1000 ? ' — large source' : ''}">
                    {#if src.satCount >= 1000}<svg class="sdb-warn-icon" viewBox="0 0 12 12"><path d="M6 1L1 11h10z" fill="none" stroke="currentColor" stroke-width="1.2"/><text x="6" y="9.5" text-anchor="middle" fill="currentColor" font-size="7" font-weight="bold">!</text></svg>{/if}
                    {src.name}
                  </Button>
                {/each}
              </div>
            {/if}
            {#if isInTle && !isSelected}
              <Button class="select-btn" onclick={() => addToSelection(selectedId!)}>Select Satellite</Button>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
</DraggableWindow>

<style>
  .sdb {
    width: 560px;
  }

  /* ── Search ────────────────────────────────────────── */

  .sdb-search-row {
    margin-bottom: 6px;
  }
  :global(.sdb-search) { width: 100%; }

  /* ── Filter rows (matching PassFilterWindow pattern) ── */

  .sdb-filters {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: 6px;
  }
  .sdb-frow {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-wrap: wrap;
  }
  :global(.sdb-fnum) { width: 48px; }
  .sdb-flabel {
    font-size: 8px;
    color: var(--text-ghost);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 2px;
  }
  .sdb-fsep { width: 6px; }
  .sdb-fsep-dash { color: var(--text-ghost); font-size: 10px; }
  .sdb-funit { color: var(--text-ghost); font-size: 10px; margin: 0 4px 0 2px; }

  :global(.sdb-reset) {
    margin-left: auto;
    margin-right: 6px;
  }

  /* ── Split layout ─────────────────────────────────────── */

  .sdb-split {
    display: flex;
    min-height: 300px;
  }

  /* ── Left list ────────────────────────────────────────── */

  .sdb-list {
    width: 200px;
    flex-shrink: 0;
    border-right: 1px solid var(--border);
  }
  .sdb-list-item {
    padding: 4px 6px;
    cursor: pointer;
  }
  .sdb-list-item:hover { background: var(--row-highlight); }
  .sdb-list-item.active { background: var(--row-highlight); }

  .sdb-item-name {
    font-size: 11px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sdb-item-meta {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-wrap: wrap;
    margin-top: 1px;
  }
  .sdb-item-norad {
    font-size: 9px;
    color: var(--text-ghost);
  }
  .sdb-item-tle {
    font-size: 7px;
    color: var(--live);
    border: 1px solid var(--live);
    padding: 0 2px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .sdb-item-status {
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    padding: 0 3px;
    border: 1px solid var(--border);
    color: var(--text-ghost);
  }
  .sdb-item-status.alive { color: var(--live); border-color: var(--live); }
  .sdb-item-status.dead { color: var(--danger); border-color: var(--danger); }

  .sdb-item-band {
    font-size: 8px;
    color: var(--text-faint);
    background: var(--ui-bg);
    padding: 0 3px;
  }
  .sdb-count {
    font-size: 9px;
    color: var(--text-ghost);
    padding: 4px 6px;
  }

  /* ── Right detail ─────────────────────────────────────── */

  .sdb-detail {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    max-height: 400px;
    padding-left: 8px;
  }
  .sdb-detail-content {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }
  .sdb-detail-footer {
    flex-shrink: 0;
    margin-top: auto;
    padding-top: 6px;
  }
  .sdb-detail-empty {
    color: var(--text-ghost);
    font-size: 11px;
    padding: 8px 0;
  }

  /* Header: image + meta */
  .sat-header {
    display: flex;
    gap: 10px;
    margin-bottom: 8px;
  }
  .sat-img {
    width: 64px;
    height: 64px;
    object-fit: cover;
    border: 1px solid var(--border);
    flex-shrink: 0;
  }
  .sat-meta { min-width: 0; }
  .sat-name { font-size: 13px; color: var(--text); }
  .sat-aliases {
    font-size: 10px;
    color: var(--text-ghost);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 260px;
  }
  .sat-id-status {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
  }
  .sat-norad { font-size: 11px; color: var(--text-faint); }
  .sat-status {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 0 4px;
    border: 1px solid var(--border);
    color: var(--text-ghost);
  }
  .sat-status.alive { color: var(--live); border-color: var(--live); }
  .sat-status.dead { color: var(--danger); border-color: var(--danger); }

  .sdb-source-hint {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    margin-bottom: 4px;
  }
  .sdb-hint-text {
    font-size: 9px;
    color: var(--text-ghost);
  }
  :global(.sdb-hint-large) { color: var(--warning); border-color: var(--warning); }
  :global(.sdb-hint-large:hover) { color: var(--warning-bright); border-color: var(--warning-bright); }
  :global(.select-btn) { display: flex; width: 100%; justify-content: center; }
  .sdb-warn-icon {
    width: 10px;
    height: 10px;
    vertical-align: -1px;
    margin-right: 1px;
  }

  /* Info grid */
  .info-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1px 8px;
    font-size: 11px;
    margin-bottom: 8px;
  }
  .il { color: var(--text-ghost); }
  .iv { color: var(--text-dim); }
  .ext-link { color: var(--text-dim); text-decoration: none; }
  .ext-link:hover { color: var(--text); text-decoration: underline; }

  /* Section label */
  .section-label {
    font-size: 9px;
    color: var(--text-ghost);
    text-transform: uppercase;
    letter-spacing: 1px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 2px;
    margin-bottom: 4px;
  }

  /* Transmitter list */
  .tx-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 200px;
    overflow-y: auto;
  }
  .tx-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    padding: 2px 0;
  }
  .tx-freq { color: var(--text-muted); white-space: nowrap; min-width: 90px; }
  .tx-pill {
    font-size: 9px;
    color: var(--text-faint);
    background: var(--ui-bg);
    padding: 0 4px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .tx-desc {
    color: var(--text-ghost);
    font-size: 10px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .satnogs-link {
    display: block;
    margin-top: 8px;
    font-size: 10px;
    color: var(--text-ghost);
    text-decoration: none;
  }
  .satnogs-link:hover { color: var(--text-dim); text-decoration: underline; }
</style>
