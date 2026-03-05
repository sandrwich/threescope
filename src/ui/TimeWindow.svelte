<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import MobileSheet from './shared/MobileSheet.svelte';
  import Button from './shared/Button.svelte';
  import { timeStore, scrubMultiplierFromOffset } from '../stores/time.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { settingsStore } from '../stores/settings.svelte';
  import { epochToUnix, unixToEpoch } from '../astro/epoch';
  import { getDateComponentsTz } from '../format';
  import { ICON_TIME } from './shared/icons';

  // Parsed display values — synced from store at ~4Hz
  let year = $state(0);
  let month = $state(0);
  let day = $state(0);
  let hour = $state(0);
  let min = $state(0);
  let sec = $state(0);

  // Which field is being edited (null = none)
  let editField = $state<string | null>(null);
  let editValue = $state('');

  // Epoch input
  let epochEditing = $state(false);
  let epochInputValue = $state('');
  let epochInputEl: HTMLInputElement | undefined = $state();

  let displayUnix = $derived(Math.floor(epochToUnix(timeStore.epoch)));

  function startEpochEdit() {
    epochEditing = true;
    epochInputValue = String(displayUnix);
    requestAnimationFrame(() => epochInputEl?.select());
  }

  function commitEpochEdit() {
    if (!epochEditing) return;
    epochEditing = false;
    const val = parseInt(epochInputValue);
    if (!isNaN(val)) {
      timeStore.warpToEpoch(unixToEpoch(val));
    }
  }

  function onEpochKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') commitEpochEdit();
    else if (e.key === 'Escape') epochEditing = false;
  }

  $effect(() => {
    if (!editField) {
      // Re-derive when epoch or timezone changes
      void timeStore.displayDatetime;
      const c = getDateComponentsTz(epochToUnix(timeStore.epoch), settingsStore.timezone);
      year = c.year;
      month = c.month;
      day = c.day;
      hour = c.hour;
      min = c.minute;
      sec = c.second;
    }
  });

  function nudge(field: string, delta: number) {
    const date = tzToDate(year, month, day, hour, min, sec);
    switch (field) {
      case 'year':  date.setUTCFullYear(date.getUTCFullYear() + delta); break;
      case 'month': date.setUTCMonth(date.getUTCMonth() + delta); break;
      case 'day':   date.setUTCDate(date.getUTCDate() + delta); break;
      case 'hour':  date.setUTCHours(date.getUTCHours() + delta); break;
      case 'min':   date.setUTCMinutes(date.getUTCMinutes() + delta); break;
      case 'sec':   date.setUTCSeconds(date.getUTCSeconds() + delta); break;
    }
    timeStore.snapToDate(date);
  }

  /** Convert displayed tz-local components back to a UTC Date for the engine. */
  function tzToDate(y: number, mo: number, d: number, h: number, mi: number, s: number): Date {
    const tz = settingsStore.timezone;
    if (tz === 'UTC') return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
    // Build an ISO string and parse as if it were in the target timezone
    // by computing the offset between UTC and the target tz at this approximate time
    const approx = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
    const utcStr = approx.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = approx.toLocaleString('en-US', { timeZone: tz });
    const utcMs = new Date(utcStr).getTime();
    const tzMs = new Date(tzStr).getTime();
    const offsetMs = utcMs - tzMs;
    return new Date(approx.getTime() + offsetMs);
  }

  function startEdit(field: string, currentVal: number, w = 2) {
    editField = field;
    editValue = String(currentVal).padStart(w, '0');
    // Focus the input after Svelte renders it
    requestAnimationFrame(() => {
      const el = document.querySelector('.nv-input') as HTMLInputElement;
      el?.select();
    });
  }

  function commitEdit() {
    if (!editField) return;
    const val = parseInt(editValue) || 0;
    const field = editField;
    editField = null;

    // Build date with the edited field replaced
    const parts = { year, month, day, hour, min, sec, [field]: val };
    const date = tzToDate(parts.year, parts.month, parts.day, parts.hour, parts.min, parts.sec);
    timeStore.snapToDate(date);
  }

  function onEditKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      commitEdit();
    } else if (e.key === 'Escape') {
      editField = null;
    }
  }

  const pad = (n: number, w = 2) => String(n).padStart(w, '0');

  // ─── Time scrub strip ───────────────────────────────────────
  let scrubStripEl: HTMLDivElement | undefined = $state();

  function scrubSpeedLabel(offset: number): string {
    const mult = scrubMultiplierFromOffset(offset);
    if (mult === 0) return '1x';
    const sign = mult < 0 ? '-' : '';
    return `${sign}${Math.round(Math.abs(mult))}x`;
  }

  function onScrubStart(e: PointerEvent) {
    if (!scrubStripEl) return;
    e.preventDefault();
    timeStore.startMouseScrub();
    updateScrubFromPointer(e.clientX);
    window.addEventListener('pointermove', onScrubMove);
    window.addEventListener('pointerup', onScrubEnd);
  }

  function onScrubMove(e: PointerEvent) {
    e.preventDefault();
    updateScrubFromPointer(e.clientX);
  }

  function updateScrubFromPointer(clientX: number) {
    if (!scrubStripEl) return;
    const rect = scrubStripEl.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const halfWidth = rect.width / 2;
    const offset = Math.max(-1, Math.min(1, (clientX - center) / halfWidth));
    timeStore.updateMouseScrub(offset);
  }

  function onScrubEnd() {
    timeStore.stopMouseScrub();
    window.removeEventListener('pointermove', onScrubMove);
    window.removeEventListener('pointerup', onScrubEnd);
  }

  // ─── Native datetime picker (mobile) ──────────────────────
  let datePickerEl: HTMLInputElement | undefined = $state();

  function datePickerValue(): string {
    // Format as YYYY-MM-DDTHH:MM:SS for datetime-local input
    return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(min)}:${pad(sec)}`;
  }

  function onDatePickerChange(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    if (!val) return;
    // datetime-local gives YYYY-MM-DDTHH:MM or YYYY-MM-DDTHH:MM:SS
    // Parse the components and interpret in the configured timezone
    const m = val.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return;
    const date = tzToDate(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0));
    if (!isNaN(date.getTime())) {
      timeStore.setEpochFromDate(date);
    }
  }

  function openDatePicker() {
    if (datePickerEl) {
      datePickerEl.value = datePickerValue();
      try { datePickerEl.showPicker(); } catch { datePickerEl.click(); }
    }
  }
</script>

{#snippet nudgeGroup(field: string, value: number, label: string, wide?: boolean)}
  <div class="ng" class:wide>
    <button class="nb" onclick={() => nudge(field, 1)}>
      <svg viewBox="0 0 10 6" width="10" height="6" fill="currentColor"><polygon points="5,0 10,6 0,6"/></svg>
    </button>
    {#if editField === field}
      <input
        class="nv-input"
        type="text"
        bind:value={editValue}
        onblur={commitEdit}
        onkeydown={onEditKeydown}
        maxlength={wide ? 4 : 2}
      >
    {:else}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <span class="nv" onclick={() => startEdit(field, value, wide ? 4 : 2)}>{pad(value, wide ? 4 : 2)}</span>
    {/if}
    <button class="nb" onclick={() => nudge(field, -1)}>
      <svg viewBox="0 0 10 6" width="10" height="6" fill="currentColor"><polygon points="0,0 10,0 5,6"/></svg>
    </button>
    <span class="nl">{label}</span>
  </div>
{/snippet}

{#snippet timeIcon()}<span class="title-icon">{@html ICON_TIME}</span>{/snippet}

{#snippet transportRow()}
  <div class="transport-row">
    <button class="tb" title="Slower (,)" onclick={() => timeStore.stepBackward()}>
      <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><polygon points="8,2 1,8 8,14"/><polygon points="15,2 8,8 15,14"/></svg>
    </button>
    <button class="tb play" title="Play/Pause (Space)" onclick={() => timeStore.togglePause()}>
      {#if timeStore.paused}
        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><polygon points="3,1 14,8 3,15"/></svg>
      {:else}
        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><rect x="2" y="1" width="4" height="14"/><rect x="10" y="1" width="4" height="14"/></svg>
      {/if}
    </button>
    <button class="tb" title="Reset speed (/)" onclick={() => timeStore.resetSpeed()}>
      <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><rect x="2" y="2" width="12" height="12"/></svg>
    </button>
    <button class="tb" title="Faster (.)" onclick={() => timeStore.stepForward()}>
      <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><polygon points="1,2 8,8 1,14"/><polygon points="8,2 15,8 8,14"/></svg>
    </button>
    <span class="speed" class:negative={timeStore.multiplier < 0} class:paused={timeStore.paused}>
      {timeStore.displaySpeed}
    </span>
    {#if timeStore.isRealtime}
      <span class="rt-dot" title="Real time"></span>
    {/if}
    <button class="now-btn" onclick={() => timeStore.jumpToNow()}>Now</button>
  </div>
{/snippet}

{#snippet scrubStrip()}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="scrub-strip" bind:this={scrubStripEl} onpointerdown={onScrubStart} style="touch-action:none">
    <div class="scrub-track">
      <div class="scrub-center-line"></div>
      {#if timeStore.scrubActive}
        <div
          class="scrub-fill"
          class:reverse={timeStore.scrubOffset < 0}
          style="left:{timeStore.scrubOffset < 0 ? (50 + timeStore.scrubOffset * 50) : 50}%; width:{Math.abs(timeStore.scrubOffset) * 50}%"
        ></div>
      {/if}
    </div>
    <div class="scrub-labels">
      <span class="scrub-hint">&#9664; REW</span>
      {#if timeStore.scrubActive}
        <span class="scrub-speed">{scrubSpeedLabel(timeStore.scrubOffset)}</span>
      {:else}
        <span class="scrub-speed-idle">drag to scrub</span>
      {/if}
      <span class="scrub-hint">FF &#9654;</span>
    </div>
  </div>
{/snippet}

{#snippet mobileContent()}
  <div class="tc tc-mobile">
    {@render transportRow()}

    {#if uiStore.timeTab === 'datetime'}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="mobile-datetime" onclick={openDatePicker}>
        <span class="mobile-date">{year}-{pad(month)}-{pad(day)}</span>
        <span class="mobile-time">{pad(hour)}:{pad(min)}:{pad(sec)}</span>
        <span class="mobile-utc">{settingsStore.timezoneAbbr}</span>
      </div>
      <input
        bind:this={datePickerEl}
        type="datetime-local"
        step="1"
        class="date-picker-hidden"
        onchange={onDatePickerChange}
      >
    {:else}
      <div class="epoch-panel">
        <span class="epoch-label">Unix Timestamp</span>
        {#if epochEditing}
          <input
            class="epoch-input"
            type="text"
            bind:this={epochInputEl}
            bind:value={epochInputValue}
            onblur={commitEpochEdit}
            onkeydown={onEpochKeydown}
          >
        {:else}
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <span class="epoch-value" onclick={startEpochEdit}>{displayUnix}</span>
        {/if}
        <span class="epoch-hint">Tap to edit</span>
      </div>
    {/if}

    {@render scrubStrip()}

    {#if timeStore.tleWarning}
      <div class="warning">{timeStore.tleWarning}</div>
    {/if}
  </div>
{/snippet}

{#snippet headerTabs()}
  <div class="tab-bar">
    <Button size="xs" variant="ghost" active={uiStore.timeTab === 'datetime'} onclick={() => uiStore.setTimeTab('datetime')}>Date</Button>
    <Button size="xs" variant="ghost" active={uiStore.timeTab === 'epoch'} onclick={() => uiStore.setTimeTab('epoch')}>Epoch</Button>
  </div>
{/snippet}

{#snippet desktopContent()}
  <div class="tc">
    {@render transportRow()}

    {#if uiStore.timeTab === 'datetime'}
      <div class="nudge-row">
        {@render nudgeGroup('year', year, 'yr', true)}
        {@render nudgeGroup('month', month, 'mo')}
        {@render nudgeGroup('day', day, 'dy')}
        <span class="sep"></span>
        {@render nudgeGroup('hour', hour, 'hr')}
        {@render nudgeGroup('min', min, 'mn')}
        {@render nudgeGroup('sec', sec, 'sc')}
        <span class="utc-label">{settingsStore.timezoneAbbr}</span>
      </div>
    {:else}
      <div class="epoch-panel">
        <span class="epoch-label">Unix Timestamp</span>
        {#if epochEditing}
          <input
            class="epoch-input"
            type="text"
            bind:this={epochInputEl}
            bind:value={epochInputValue}
            onblur={commitEpochEdit}
            onkeydown={onEpochKeydown}
          >
        {:else}
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <span class="epoch-value" onclick={startEpochEdit}>{displayUnix}</span>
        {/if}
        <span class="epoch-hint">Click to edit</span>
      </div>
    {/if}

    {@render scrubStrip()}

    {#if timeStore.tleWarning}
      <div class="warning">{timeStore.tleWarning}</div>
    {/if}
  </div>
{/snippet}

{#if uiStore.isMobile}
  <MobileSheet id="time" title="Time Control" icon={timeIcon} headerExtra={headerTabs}>
    {@render mobileContent()}
  </MobileSheet>
{:else}
  <DraggableWindow id="time-control" title="Time Control" icon={timeIcon} headerExtra={headerTabs} bind:open={uiStore.timeWindowOpen} initialX={10} initialY={34}>
    {@render desktopContent()}
  </DraggableWindow>
{/if}

<style>
  .tc {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 240px;

  }
  .tc-mobile { min-width: unset; }
  .transport-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .tb {
    background: var(--ui-bg);
    border: 1px solid var(--border);
    color: var(--text-dim);
    padding: 4px 7px;
    cursor: pointer;
    line-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .tb:hover { border-color: var(--border-hover); color: var(--text); }
  .tb.play { min-width: 30px; }
  .speed {
    font-size: 13px;
    color: var(--text-muted);
    margin-left: 4px;
  }
  .speed.paused { color: var(--danger-bright); }
  .speed.negative { color: var(--warning-bright); }
  .rt-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--live);
    animation: pulse 2s ease-in-out infinite;
    flex-shrink: 0;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
  .now-btn {
    background: var(--ui-bg);
    border: 1px solid var(--border);
    color: var(--text-faint);
    font-size: 11px;
    font-family: inherit;
    padding: 3px 8px;
    cursor: pointer;
    margin-left: auto;
  }
  .now-btn:hover { border-color: var(--border-hover); color: var(--text-dim); }

  /* ─── Desktop nudge row ─── */
  .nudge-row {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    gap: 3px;
  }
  .sep { width: 10px; }
  .utc-label { color: var(--text-ghost); font-size: 10px; margin-left: 2px; padding-top: 26px; }
  .ng {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    padding-top: 4px;
  }
  .nb {
    background: none;
    border: none;
    color: var(--text-ghost);
    cursor: pointer;
    padding: 6px 6px;
    line-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .nb:hover { color: var(--text-dim); }
  .nv, .nv-input {
    display: block;
    font-size: 14px;
    color: var(--text);
    text-align: center;
    width: 2.2em;
    line-height: 18px;
    height: 20px;
    border: 1px solid transparent;
    background: none;
    font-family: inherit;
    padding: 0;
    margin: 2px 0 0;
    box-sizing: border-box;
  }
  .nv { cursor: text; }
  .nv:hover { color: var(--border-hover); }
  .nv-input {
    border-color: var(--border-hover);
    background: var(--ui-bg);
    outline: none;
  }
  .ng.wide .nv, .ng.wide .nv-input { width: 3.2em; }
  .nl {
    font-size: 9px;
    color: var(--text-ghost);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 1px;
    margin-bottom: 6px;
  }

  /* ─── Tab bar ─── */
  .tab-bar {
    display: flex;
    align-items: center;
    gap: 1px;
    margin-left: auto;
    margin-right: 8px;
  }

  /* ─── Epoch panel ─── */
  .epoch-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px 0;
  }
  .epoch-label {
    font-size: 10px;
    color: var(--text-ghost);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .epoch-value, .epoch-input {
    font-size: 18px;
    color: var(--text);
    font-family: inherit;
    background: none;
    border: 1px solid transparent;
    padding: 2px 8px;
    text-align: center;
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
  }
  .epoch-value { cursor: text; }
  .epoch-value:hover { color: var(--border-hover); }
  .epoch-input {
    border-color: var(--border-hover);
    background: var(--ui-bg);
    color: var(--text);
    outline: none;
  }
  .epoch-hint {
    font-size: 9px;
    color: var(--text-ghost);
  }
  .warning {
    font-size: 11px;
    color: var(--warning);
    margin-top: -2px;
  }

  /* ─── Mobile datetime display ─── */
  .mobile-datetime {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 8px;
    padding: 4px 0;
    cursor: pointer;
    border: 1px solid var(--border);
    background: var(--ui-bg);
  }
  .mobile-datetime:active { border-color: var(--border-hover); }
  .mobile-date {
    font-size: 15px;
    color: var(--text);
    letter-spacing: 0.5px;
  }
  .mobile-time {
    font-size: 15px;
    color: var(--text-dim);
  }
  .mobile-utc {
    font-size: 10px;
    color: var(--text-ghost);
    letter-spacing: 0.5px;
  }
  .date-picker-hidden {
    position: absolute;
    opacity: 0;
    pointer-events: none;
    width: 0;
    height: 0;
  }

  /* ─── Time scrub strip ─── */
  .scrub-strip {
    cursor: ew-resize;
    user-select: none;
  }
  .scrub-track {
    position: relative;
    height: 24px;
    background: var(--ui-bg);
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .scrub-center-line {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--text-ghost);
  }
  .scrub-fill {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--accent);
    opacity: 0.3;
  }
  .scrub-fill.reverse {
    background: var(--warning-bright);
  }
  .scrub-labels {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 3px 2px 0;
  }
  .scrub-hint {
    font-size: 9px;
    color: var(--text-ghost);
    letter-spacing: 0.5px;
  }
  .scrub-speed {
    font-size: 11px;
    color: var(--text);
    font-weight: bold;
  }
  .scrub-speed-idle {
    font-size: 9px;
    color: var(--text-ghost);
    letter-spacing: 0.5px;
  }
</style>
