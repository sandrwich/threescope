<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import { timeStore } from '../stores/time.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { epochToUnix, unixToEpoch } from '../astro/epoch';
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

  // Epoch input row
  let epochExpanded = $state(false);
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
      const dt = timeStore.displayDatetime;
      const m = dt.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
      if (m) {
        year = parseInt(m[1]);
        month = parseInt(m[2]);
        day = parseInt(m[3]);
        hour = parseInt(m[4]);
        min = parseInt(m[5]);
        sec = parseInt(m[6]);
      }
    }
  });

  function nudge(field: string, delta: number) {
    const date = new Date(Date.UTC(year, month - 1, day, hour, min, sec));
    switch (field) {
      case 'year':  date.setUTCFullYear(date.getUTCFullYear() + delta); break;
      case 'month': date.setUTCMonth(date.getUTCMonth() + delta); break;
      case 'day':   date.setUTCDate(date.getUTCDate() + delta); break;
      case 'hour':  date.setUTCHours(date.getUTCHours() + delta); break;
      case 'min':   date.setUTCMinutes(date.getUTCMinutes() + delta); break;
      case 'sec':   date.setUTCSeconds(date.getUTCSeconds() + delta); break;
    }
    timeStore.setEpochFromDate(date);
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
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.min, parts.sec));
    timeStore.setEpochFromDate(date);
  }

  function onEditKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      commitEdit();
    } else if (e.key === 'Escape') {
      editField = null;
    }
  }

  const pad = (n: number, w = 2) => String(n).padStart(w, '0');

  const upArrow = '<svg viewBox="0 0 10 6" width="10" height="6" fill="currentColor"><polygon points="5,0 10,6 0,6"/></svg>';
  const downArrow = '<svg viewBox="0 0 10 6" width="10" height="6" fill="currentColor"><polygon points="0,0 10,0 5,6"/></svg>';
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
<DraggableWindow title="Time Control" icon={timeIcon} bind:open={uiStore.timeWindowOpen} initialX={10} initialY={34}>
  <div class="tc">
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

    <div class="nudge-row">
      {@render nudgeGroup('year', year, 'yr', true)}
      {@render nudgeGroup('month', month, 'mo')}
      {@render nudgeGroup('day', day, 'dy')}
      <span class="sep"></span>
      {@render nudgeGroup('hour', hour, 'hr')}
      {@render nudgeGroup('min', min, 'mn')}
      {@render nudgeGroup('sec', sec, 'sc')}
      <span class="utc-label">UTC</span>
    </div>

    {#if timeStore.tleWarning}
      <div class="warning">{timeStore.tleWarning}</div>
    {/if}
  </div>

  <div class="epoch-footer">
    <button class="expand-chevron" onclick={() => epochExpanded = !epochExpanded} title="Unix epoch">
      <svg viewBox="0 0 10 6" width="10" height="6" fill="currentColor">
        {#if epochExpanded}
          <polygon points="5,0 10,6 0,6"/>
        {:else}
          <polygon points="0,0 10,0 5,6"/>
        {/if}
      </svg>
    </button>
    {#if epochExpanded}
      <div class="epoch-row">
        <span class="epoch-label">epoch</span>
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
      </div>
    {/if}
  </div>
</DraggableWindow>

<style>
  .tc {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 240px;
  }
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
  .speed.paused { color: #ff6666; }
  .speed.negative { color: #ff9944; }
  .rt-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #4f4;
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
  .epoch-footer {
    border-top: 1px solid var(--border);
    margin: 0 -14px -12px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .expand-chevron {
    background: none;
    border: none;
    color: var(--text-ghost);
    cursor: pointer;
    padding: 4px 0;
    line-height: 0;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.5;
  }
  .expand-chevron:hover { opacity: 1; }
  .epoch-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px 8px;
    width: 100%;
    box-sizing: border-box;
  }
  .epoch-label {
    font-size: 10px;
    color: var(--text-ghost);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    flex-shrink: 0;
  }
  .epoch-value, .epoch-input {
    font-size: 13px;
    color: var(--text-dim);
    font-family: inherit;
    background: none;
    border: 1px solid transparent;
    padding: 1px 4px;
    flex: 1;
    min-width: 0;
  }
  .epoch-value { cursor: text; }
  .epoch-value:hover { color: var(--text); }
  .epoch-input {
    border-color: var(--border-hover);
    background: var(--ui-bg);
    color: var(--text);
    outline: none;
  }
  .warning {
    font-size: 11px;
    color: #cc6633;
  }
</style>
