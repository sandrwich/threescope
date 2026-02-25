<script lang="ts">
  import { timeStore } from '../stores/time.svelte';

  let compactDatetime = $derived(() => {
    const dt = timeStore.displayDatetime;
    // Strip seconds: "2026-02-22 15:57:05 UTC" → "2026-02-22 15:57 UTC"
    return dt.replace(/:\d{2}\s+UTC/, ' UTC');
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
    {compactDatetime()} · {speedText()}
  </span>
</div>

<style>
  .top-panel {
    position: absolute;
    top: 8px;
    left: 10px;
  }
  .hud-line {
    font-size: 13px;
    color: var(--scene-text);
    white-space: nowrap;
  }
  .hud-line.alert { color: var(--danger-bright); }
</style>
