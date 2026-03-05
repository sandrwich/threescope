<script lang="ts">
  import { timeStore } from '../stores/time.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { settingsStore } from '../stores/settings.svelte';

  let compactDatetime = $derived(() => {
    const dt = timeStore.displayDatetime;
    // Strip seconds: "2026-02-22 15:57:05" → "2026-02-22 15:57 TZ"
    return dt.replace(/:\d{2}$/, '') + ' ' + settingsStore.timezoneAbbr;
  });

  let speedText = $derived(() => {
    if (timeStore.warping) return 'WARP';
    if (timeStore.paused) return 'PAUSED';
    return timeStore.displaySpeed;
  });

  let isPausedOrWarp = $derived(timeStore.paused || timeStore.warping);
</script>

<div class="top-panel">
  <span class="hud-line" class:alert={isPausedOrWarp}>
    {compactDatetime()} ·
    {#if timeStore.paused && uiStore.isMobile}
      <svg class="pause-icon" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="1" width="4" height="14"/><rect x="10" y="1" width="4" height="14"/></svg>
    {:else}
      {speedText()}
    {/if}
  </span>
</div>

<style>
  .top-panel {
    position: absolute;
    top: 7px;
    left: 10px;
  }
  .hud-line {
    font-size: 12px;
    color: var(--scene-text);
    white-space: nowrap;
  }
  .hud-line.alert { color: var(--danger-bright); }
  .pause-icon { width: 10px; height: 10px; vertical-align: -1px; }
</style>
