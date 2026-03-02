<script lang="ts">
  import { uiStore } from '../stores/ui.svelte';

  const hash = __COMMIT_HASH__;
  const version = __COMMIT_DATE__ ? 'v' + __COMMIT_DATE__.slice(2, 10).replace(/-/g, '') : '';
</script>

<div class="bottom-panel">
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <span class="about-link" onclick={() => uiStore.infoModalOpen = true}>satvisor{#if version}<span class="dot">&middot;</span><span class="build">{version}</span>{/if}{#if hash}<span class="dot">&middot;</span><span class="build">{hash}</span>{/if}</span>
</div>

<style>
  .bottom-panel {
    position: absolute;
    bottom: 8px;
    left: 10px;
    font-size: 11px;
    line-height: 1.4;
    color: var(--scene-text-dim);
  }
  .about-link {
    cursor: pointer;
    pointer-events: auto;
  }
  .about-link:hover { color: var(--scene-text); }
  .dot { padding: 0 4px; }
  .build { opacity: 0.5; }
</style>
