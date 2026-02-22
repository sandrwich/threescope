<script lang="ts">
  import { uiStore } from '../stores/ui.svelte';
</script>

<div class="stats-panel">
  <div class="fps" style="color:{uiStore.fpsColor}">{uiStore.fpsDisplay} FPS</div>
  <div class="sat-count">{uiStore.satStatusText}</div>
</div>

<style>
  .stats-panel {
    position: absolute;
    top: 8px;
    right: 10px;
    text-align: right;
  }
  .fps {
    font-size: 14px;
    font-weight: bold;
  }
  .sat-count {
    color: var(--text-muted);
    font-size: 12px;
    margin-top: 1px;
  }
</style>
