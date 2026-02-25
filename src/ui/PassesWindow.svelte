<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { observerStore } from '../stores/observer.svelte';
  import { timeStore } from '../stores/time.svelte';
  import { ICON_PASSES, ICON_DOPPLER, ICON_ECLIPSE, ICON_SUN, ICON_FILTER } from './shared/icons';
  import { SAT_COLORS } from '../constants';
  import { epochToDate } from '../astro/epoch';
  import type { SatellitePass } from '../passes/pass-types';

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function dayKey(epoch: number): string {
    const d = epochToDate(epoch);
    return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  }

  function dayLabel(epoch: number): string {
    const d = epochToDate(epoch);
    const now = epochToDate(uiStore.passListEpoch);
    const todayKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
    const tomorrow = new Date(now.getTime() + 86400000);
    const tomorrowKey = `${tomorrow.getUTCFullYear()}-${tomorrow.getUTCMonth()}-${tomorrow.getUTCDate()}`;
    const key = dayKey(epoch);
    const weekday = WEEKDAYS[d.getUTCDay()];
    const dateStr = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
    if (key === todayKey) return `Today \u2014 ${weekday} ${dateStr}`;
    if (key === tomorrowKey) return `Tomorrow \u2014 ${weekday} ${dateStr}`;
    return `${weekday} ${dateStr}`;
  }

  function formatTime(epoch: number): string {
    const dayFrac = epoch % 1000.0;
    const frac = dayFrac - Math.floor(dayFrac);
    const hours = frac * 24;
    const h = Math.floor(hours);
    const minutes = (hours - h) * 60;
    const m = Math.floor(minutes);
    const s = Math.round((minutes - m) * 60);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function formatDuration(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}m${String(s).padStart(2, '0')}s`;
  }

  function elClass(maxEl: number): string {
    if (maxEl < 10) return 'el-low';
    if (maxEl < 30) return 'el-mid';
    return 'el-high';
  }

  function magClass(pass: SatellitePass): string {
    if (pass.sunAlt > 0) return 'mag-daylight';
    if (pass.sunAlt > -6 && !pass.eclipsed) return 'mag-twilight';
    if (pass.eclipsed) return 'mag-eclipsed';
    if (pass.peakMag === null) return 'mag-unknown';
    if (pass.elongation < 20) return 'mag-nearsun';
    if (pass.peakMag < 2) return 'mag-bright';
    if (pass.peakMag <= 5) return 'mag-mid';
    return 'mag-faint';
  }

  function sunLabel(alt: number): string {
    if (alt > 0) return 'Daylight';
    if (alt > -6) return 'Civil twilight';
    if (alt > -12) return 'Nautical twilight';
    if (alt > -18) return 'Astronomical twilight';
    return 'Night';
  }

  function magTooltip(pass: SatellitePass): string {
    let tip = `Sun: ${pass.sunAlt.toFixed(1)}\u00b0 (${sunLabel(pass.sunAlt)})`;
    tip += `\nFrom sun: ${pass.elongation.toFixed(0)}\u00b0`;
    if (pass.sunAlt > 0) tip += '\nSky too bright for observation';
    else if (pass.eclipsed) tip += '\nSatellite in Earth\u2019s shadow';
    else if (pass.peakMag !== null) tip += `\nMagnitude: ${pass.peakMag.toFixed(2)}`;
    if (!pass.eclipsed && pass.elongation < 20) tip += '\nClose to sun \u2014 observation difficult';
    return tip;
  }

  function isActive(pass: SatellitePass): boolean {
    return uiStore.passListEpoch >= pass.aosEpoch && uiStore.passListEpoch <= pass.losEpoch;
  }

  function progress(pass: SatellitePass): number {
    if (uiStore.passListEpoch < pass.aosEpoch) return 0;
    if (uiStore.passListEpoch > pass.losEpoch) return 1;
    return (uiStore.passListEpoch - pass.aosEpoch) / (pass.losEpoch - pass.aosEpoch);
  }

  function autoSelect(pass: SatellitePass) {
    if (uiStore.passesTab === 'nearby') {
      uiStore.onSelectSatFromNearbyPass?.(pass.satNoradId);
    }
  }

  function openPolar(pass: SatellitePass, idx: number) {
    autoSelect(pass);
    uiStore.selectedPassIdx = idx;
    uiStore.polarPlotOpen = true;
  }

  function skipTo(pass: SatellitePass, idx: number) {
    autoSelect(pass);
    const target = pass.aosEpoch - (30 / 86400);
    timeStore.warpToEpoch(target);
    uiStore.selectedPassIdx = idx;
    uiStore.polarPlotOpen = true;
  }

  function openDoppler(pass: SatellitePass, idx: number) {
    autoSelect(pass);
    uiStore.selectedPassIdx = idx;
    uiStore.dopplerWindowOpen = true;
  }

  function openObserver() {
    uiStore.observerWindowOpen = true;
  }

  function satColor(colorIndex: number): string {
    const c = SAT_COLORS[colorIndex % SAT_COLORS.length];
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  function switchTab(tab: 'selected' | 'nearby') {
    uiStore.passesTab = tab;
    uiStore.selectedPassIdx = -1;
    tableScrollTop = 0;
    if (tab === 'nearby' && uiStore.nearbyPhase === 'idle') {
      uiStore.onRequestNearbyPasses?.();
    }
    if (tab === 'selected') {
      uiStore.onRequestPasses?.();
    }
  }

  function fmtMs(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  // --- Filter summary for inline bar ---
  let filterSummary = $derived.by(() => {
    const parts: string[] = [];
    if (uiStore.passMinEl > 0 || uiStore.passMaxEl < 90) {
      parts.push(`El ${uiStore.passMinEl}–${uiStore.passMaxEl}°`);
    }
    if (uiStore.passAzFrom !== 0 || uiStore.passAzTo !== 360) {
      parts.push(`Az ${uiStore.passAzFrom}–${uiStore.passAzTo}°`);
    }
    if (uiStore.passHorizonMask.length > 0) {
      const maxH = Math.max(...uiStore.passHorizonMask.map(p => p.minEl));
      parts.push(`Horizon ≤${maxH}°`);
    }
    if (uiStore.passMinDuration > 0) parts.push(`≥${uiStore.passMinDuration}s`);
    if (uiStore.passHiddenSats.size > 0) parts.push(`${uiStore.passHiddenSats.size} hidden`);
    return parts.join(' · ');
  });

  // --- Filtered pass lists (worker handles most filters; client only hides per-sat) ---
  let filteredSelectedPasses = $derived.by(() => filterBySat(uiStore.passes));
  let filteredNearbyPasses = $derived.by(() => filterBySat(uiStore.nearbyPasses));

  function filterBySat(list: SatellitePass[]): SatellitePass[] {
    if (uiStore.passHiddenSats.size === 0) return list;
    return list.filter(pass => !uiStore.passHiddenSats.has(pass.satNoradId));
  }

  let hasSelectedSats = $derived(uiStore.selectedSatCount > 0);
  let rawPassCount = $derived(uiStore.passes.length);
  let rawNearbyCount = $derived(uiStore.nearbyPasses.length);
  let passCount = $derived(filteredSelectedPasses.length);
  let nearbyCount = $derived(filteredNearbyPasses.length);
  let isNearby = $derived(uiStore.passesTab === 'nearby');
  let computing = $derived((isNearby && uiStore.nearbyComputing) || (!isNearby && uiStore.passesComputing));

  // Live elapsed time during computation
  let elapsedMs = $state(0);
  let elapsedTimer: ReturnType<typeof setInterval> | null = null;
  $effect(() => {
    if (computing) {
      const start = performance.now();
      elapsedMs = 0;
      elapsedTimer = setInterval(() => { elapsedMs = performance.now() - start; }, 200);
      return () => { if (elapsedTimer) clearInterval(elapsedTimer); };
    }
  });
  let displayTime = $derived(computing ? elapsedMs : (isNearby ? uiStore.nearbyComputeTime : uiStore.passesComputeTime));
  let headerEl: HTMLDivElement | undefined = $state();
  let headerH = $derived(headerEl?.offsetHeight ?? 0);

  // Render cap: only mount a limited number of pass rows, expand on scroll
  // Virtual window: only render rows visible in the viewport + buffer.
  // Spacers above and below keep the scrollbar proportional.
  const ROW_HEIGHT = 27; // approximate px per pass row
  const BUFFER = 30;     // extra rows above/below viewport
  let tableScrollTop = $state(0);

  function onTableScroll(e: Event) {
    tableScrollTop = (e.target as HTMLElement).scrollTop;
  }
</script>

{#snippet passesIcon()}<span class="title-icon">{@html ICON_PASSES}</span>{/snippet}

{#snippet filterBar()}
  <div class="filter-bar">
    <div class="filter-bar-row">
      <select class="filter-select" value={uiStore.passVisibility}
        onchange={(e) => uiStore.setPassVisibility((e.target as HTMLSelectElement).value as 'all' | 'observable' | 'visible')}>
        <option value="all">All passes</option>
        <option value="observable">Observable</option>
        <option value="visible">Visible (mag ≤ 5)</option>
      </select>
      {#if filterSummary}
        <span class="filter-summary" title={filterSummary}>{filterSummary}</span>
      {/if}
      <button class="filter-window-btn" class:active={uiStore.passFilterWindowOpen} onclick={() => uiStore.passFilterWindowOpen = !uiStore.passFilterWindowOpen}>{@html ICON_FILTER} Filters</button>
    </div>
  </div>
{/snippet}

{#snippet passTable(passes: SatellitePass[])}
  {@const winStart = Math.max(0, Math.floor(tableScrollTop / ROW_HEIGHT) - BUFFER)}
  {@const winEnd = Math.min(passes.length, winStart + Math.ceil(370 / ROW_HEIGHT) + 2 * BUFFER)}
  <div class="table-wrap" onscroll={onTableScroll}>
    <div class="table-header" bind:this={headerEl}>
      <span class="th th-sat">Satellite</span>
      <span class="th th-time">Time</span>
      <span class="th th-dur">Dur</span>
      <span class="th th-el">Max El</span>
      <span class="th th-mag">Mag</span>
      <span class="th th-actions"></span>
    </div>
    {#if winStart > 0}<div style="height:{winStart * ROW_HEIGHT}px"></div>{/if}
    {#each passes.slice(winStart, winEnd) as pass, j (winStart + j)}
      {@const i = winStart + j}
      {#if j === 0 || dayKey(pass.aosEpoch) !== dayKey(passes[i - 1].aosEpoch)}
        <div class="day-header" style="top:{headerH}px">{dayLabel(pass.aosEpoch)}</div>
      {/if}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
      <div class="pass-row" class:active={isActive(pass)} onclick={() => openPolar(pass, i)}>
        <span class="td td-sat">
          <svg class="color-dot" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="{satColor(pass.satColorIndex)}"/></svg>
          <span class="sat-name" title={pass.satName}>{pass.satName}</span>
        </span>
        <span class="td td-time">{formatTime(pass.aosEpoch)} <span class="arrow">&rarr;</span> {formatTime(pass.losEpoch)}</span>
        <span class="td td-dur">{formatDuration(pass.durationSec)}</span>
        <span class="td td-el {elClass(pass.maxEl)}">{pass.maxEl.toFixed(1)}&deg;</span>
        <span class="td td-mag {magClass(pass)}" title={magTooltip(pass)}>{#if pass.sunAlt > 0 && !pass.eclipsed}<span class="sun-icon">{@html ICON_SUN}</span>{/if}{#if pass.eclipsed}<span class="eclipse-icon">{@html ICON_ECLIPSE}</span>{:else if pass.peakMag !== null}{pass.peakMag.toFixed(1)}{:else}?{/if}</span>
        <span class="td td-actions">
          <button class="action-icon" onclick={(e) => { e.stopPropagation(); openDoppler(pass, i); }} title="Doppler analysis">{@html ICON_DOPPLER}</button>
          <button class="action-icon" onclick={(e) => { e.stopPropagation(); skipTo(pass, i); }} title="Skip to pass">&#9654;</button>
        </span>
        {#if isActive(pass)}
          <div class="pass-progress" style="width:{progress(pass) * 100}%"></div>
        {/if}
      </div>
    {/each}
    {#if winEnd < passes.length}<div style="height:{(passes.length - winEnd) * ROW_HEIGHT}px"></div>{/if}
  </div>
{/snippet}

{#snippet headerTabs()}
  {#if observerStore.isSet}
    <div class="tab-bar">
      <button class="tab-btn" class:active={!isNearby} onclick={() => switchTab('selected')}>Selected</button>
      <button class="tab-btn" class:active={isNearby} onclick={() => switchTab('nearby')}>All Nearby</button>
    </div>
  {/if}
{/snippet}

{#snippet passStats()}
  {@const count = isNearby ? nearbyCount : passCount}
  {@const rawCount = isNearby ? rawNearbyCount : rawPassCount}
  {@const hasData = computing || count > 0 || rawCount > 0}
  {#if hasData}
    <span class="top-stats">
      {#if computing}
        {@const pct = isNearby ? uiStore.nearbyProgress : uiStore.passesProgress}
        <span class="stats-progress"><span class="stats-progress-fill" style="width:{pct}%"></span></span>
      {/if}
      <span class="stats-label">{fmtMs(displayTime)} · {count}{count !== rawCount ? ` of ${rawCount}` : ''} passes</span>
    </span>
  {/if}
{/snippet}

<DraggableWindow id="passes" title="Passes" icon={passesIcon} headerExtra={headerTabs} bind:open={uiStore.passesWindowOpen} initialX={9999} initialY={450}>
  <div class="pw">
    {#if !observerStore.isSet}
      <div class="prompt">
        <p>Set your observer location to predict satellite passes.</p>
        <button class="action-btn" onclick={openObserver}>Set Location</button>
      </div>
    {:else if !isNearby}
        <!-- Selected tab -->
        {#if !hasSelectedSats}
          <div class="prompt"><p>Select satellites to predict passes.</p></div>
        {:else if uiStore.passesComputing && rawPassCount === 0}
          <div class="prompt"><p>Computing passes...</p></div>
        {:else if rawPassCount === 0}
          <div class="prompt"><p>No passes in the next 3 days.</p></div>
        {:else}
          <div class="top-bar">
            <span class="observer-loc">
              {observerStore.displayName}{#if observerStore.location.alt > 0}, {observerStore.location.alt}m{/if}
              <button class="edit-btn" onclick={openObserver} title="Edit observer">&#9998;</button>
            </span>
            {@render passStats()}
          </div>
          {@render filterBar()}
          {#if passCount > 0}
            {@render passTable(filteredSelectedPasses)}
          {:else}
            <div class="prompt"><p>All passes filtered out.</p></div>
          {/if}
        {/if}

      {:else}
        <!-- All Nearby tab -->
        {#if uiStore.nearbyPhase === 'idle'}
          <div class="prompt"><p>Loading...</p></div>
        {:else}
          <div class="top-bar">
            <span class="observer-loc">
              {observerStore.displayName}{#if observerStore.location.alt > 0}, {observerStore.location.alt}m{/if}
              <button class="edit-btn" onclick={openObserver} title="Edit observer">&#9998;</button>
            </span>
            {@render passStats()}
          </div>
          {@render filterBar()}
          {#if nearbyCount > 0}
            {@render passTable(filteredNearbyPasses)}
          {:else if !uiStore.nearbyComputing && rawNearbyCount > 0}
            <div class="prompt"><p>All passes filtered out.</p></div>
          {:else if !uiStore.nearbyComputing}
            <div class="prompt">
              <p>No nearby passes in the next 24 hours.</p>
              <span class="filter-info">{uiStore.nearbyFilteredCount} of {uiStore.nearbyTotalCount} satellites scanned</span>
            </div>
          {/if}
        {/if}
      {/if}
  </div>
</DraggableWindow>

<style>
  .pw {
    min-width: 400px;
    max-width: 520px;
  }

  /* Tab bar (lives in titlebar via headerExtra) */
  .tab-bar {
    display: flex;
    align-items: center;
    gap: 1px;
    margin-left: auto;
    margin-right: 8px;
  }
  .tab-btn {
    background: none;
    border: none;
    color: var(--text-ghost);
    font-size: 10px;
    font-family: inherit;
    padding: 1px 6px;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    opacity: 0.5;
  }
  .tab-btn:hover { opacity: 0.8; }
  .tab-btn.active {
    color: var(--accent);
    opacity: 1;
  }

  /* Empty-state prompts */
  .prompt {
    color: var(--text-ghost);
    font-size: 12px;
    text-align: center;
    padding: 12px 8px;
  }
  .prompt p { margin: 0 0 10px 0; }
  .action-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-size: 11px;
    font-family: inherit;
    padding: 4px 12px;
    cursor: pointer;
  }
  .action-btn:hover { border-color: var(--border-hover); color: var(--text); }

  /* Inline pass stats (right side of top-bar) */
  .top-stats {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
  }
  .stats-label {
    font-size: 10px;
    color: var(--text-ghost);
    white-space: nowrap;
  }
  .stats-progress {
    width: 40px;
    height: 2px;
    background: var(--row-highlight);
    border-radius: 1px;
    overflow: hidden;
  }
  .stats-progress-fill {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.4s ease-out;
  }
  .filter-info {
    font-size: 10px;
    color: var(--text-ghost);
    display: block;
    margin-top: 4px;
  }
  .phase-label {
    animation: pulse-dim 1.5s ease-in-out infinite;
  }
  @keyframes pulse-dim {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }

  /* Top bar: observer + count */
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .observer-loc {
    font-size: 11px;
    color: var(--text-ghost);
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .edit-btn {
    background: none;
    border: none;
    color: var(--text-ghost);
    cursor: pointer;
    font-size: 12px;
    padding: 0 2px;
  }
  .edit-btn:hover { color: var(--text-dim); }
  .pass-count {
    font-size: 10px;
    color: var(--text-ghost);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  /* Filter bar (compact inline) */
  .filter-bar {
    margin-bottom: 8px;
  }
  .filter-bar-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .filter-select {
    background: var(--ui-bg);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 11px;
    font-family: inherit;
    padding: 2px 4px;
    flex-shrink: 0;
  }
  .filter-select:focus { border-color: var(--border-hover); outline: none; }
  .filter-summary {
    font-size: 10px;
    color: var(--text-ghost);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex: 1;
  }
  .filter-window-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-ghost);
    font-size: 10px;
    font-family: inherit;
    padding: 1px 6px;
    cursor: pointer;
    flex-shrink: 0;
    white-space: nowrap;
    margin-left: auto;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .filter-window-btn :global(svg) { width: 10px; height: 10px; }
  .filter-window-btn:hover { border-color: var(--border-hover); color: var(--text-dim); }
  .filter-window-btn.active { border-color: var(--accent); color: var(--text-muted); }

  /* Table layout */
  .table-wrap {
    border: 1px solid var(--border);
    max-height: 370px;
    overflow-y: auto;
  }
  .table-header {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
    background: var(--ui-bg);
    position: sticky;
    top: 0;
    z-index: 2;
  }
  .th {
    font-size: 10px;
    color: var(--text-ghost);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }

  /* Day group headers */
  .day-header {
    font-size: 10px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 5px 8px 4px;
    background: var(--ui-bg);
    border-bottom: 1px solid var(--border);
    position: sticky;
    z-index: 1;
  }

  /* Column widths — shared between header and body */
  .th-sat, .td-sat { flex: 1; min-width: 0; }
  .th-time, .td-time { width: 140px; text-align: center; flex-shrink: 0; }
  .th-dur, .td-dur { width: 52px; text-align: right; flex-shrink: 0; }
  .th-el,  .td-el  { width: 48px; text-align: right; flex-shrink: 0; }
  .th-mag, .td-mag { width: 46px; text-align: right; flex-shrink: 0; }
  .th-actions, .td-actions { width: 38px; text-align: center; flex-shrink: 0; display: flex; gap: 2px; justify-content: flex-end; }

  .arrow {
    color: var(--text-ghost);
    font-size: 10px;
    margin: 0 1px;
  }

  /* Rows */
  .pass-row {
    display: flex;
    align-items: center;
    padding: 5px 8px;
    font-size: 11px;
    cursor: pointer;
    position: relative;
    border-bottom: 1px solid var(--row-border);
  }
  .pass-row:last-child { border-bottom: none; }
  .pass-row:hover { background: var(--row-hover); }
  .pass-row.active { background: var(--row-active); }

  .td {
    color: var(--text-muted);
    white-space: nowrap;
  }
  .td-sat {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .color-dot {
    display: block;
    width: 7px;
    height: 7px;
    flex-shrink: 0;
  }
  .sat-name {
    color: var(--text-dim);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .eclipse-icon {
    color: var(--border-hover);
  }

  .el-low { color: var(--el-low); }
  .el-mid { color: var(--el-mid); }
  .el-high { color: var(--el-high); }

  .mag-bright { color: var(--text); text-shadow: 0 0 6px rgba(255, 255, 255, 0.9), 0 0 12px rgba(255, 255, 255, 0.4); }
  .mag-mid { color: var(--text-muted); }
  .mag-faint { color: var(--text-ghost); }
  .mag-unknown { color: var(--text-ghost); opacity: 0.5; }
  .mag-eclipsed { color: var(--text-ghost); opacity: 0.35; }
  .mag-daylight { color: var(--mag-day); opacity: 0.35; }
  .mag-twilight { color: var(--mag-twilight); opacity: 0.7; }
  .mag-nearsun { color: var(--text-muted); font-style: italic; }
  .td-mag .eclipse-icon { display: inline-flex; align-items: center; }
  .td-mag .eclipse-icon :global(svg) { width: 10px; height: 10px; display: block; opacity: 0.35; }
  .td-mag .sun-icon { display: inline-flex; align-items: center; margin-right: 2px; }
  .td-mag .sun-icon :global(svg) { width: 9px; height: 9px; display: block; }

  .action-icon {
    background: none;
    border: none;
    color: var(--text-ghost);
    cursor: pointer;
    font-size: 9px;
    padding: 2px 3px;
    display: flex;
    align-items: center;
  }
  .action-icon:hover { color: var(--text-dim); }
  .action-icon :global(svg) { width: 11px; height: 11px; }

  .pass-progress {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    background: var(--live);
    pointer-events: none;
  }

</style>
