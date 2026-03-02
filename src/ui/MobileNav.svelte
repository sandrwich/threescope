<script lang="ts">
  import { uiStore } from '../stores/ui.svelte';
  import MobileSheet from './shared/MobileSheet.svelte';
  import {
    ICON_DATA_SOURCES, ICON_SELECTION, ICON_PASSES, ICON_TIME, ICON_MORE,
    ICON_OBSERVER, ICON_VIEW, ICON_SETTINGS, ICON_DATABASE, ICON_HELP, ICON_RADAR,
  } from './shared/icons';

  const tabs: { id: string; label: string; icon: string }[] = [
    { id: 'sources', label: 'Sources', icon: ICON_DATA_SOURCES },
    { id: 'selection', label: 'Sats', icon: ICON_SELECTION },
    { id: 'passes', label: 'Passes', icon: ICON_PASSES },
    { id: 'time', label: 'Time', icon: ICON_TIME },
    { id: 'more', label: 'More', icon: ICON_MORE },
  ];

  const moreItems: { id: string; label: string; icon: string }[] = [
    { id: 'sat-database', label: 'SatNOGS Database', icon: ICON_DATABASE },
    { id: 'radar', label: 'Radar', icon: ICON_RADAR },
    { id: 'observer', label: 'Observer', icon: ICON_OBSERVER },
    { id: 'view', label: 'View', icon: ICON_VIEW },
  ];

  // Map sub-sheets to their parent tab so the tab stays highlighted
  const childToTab: Record<string, string> = {
    'pass-filters': 'passes', 'polar-plot': 'passes', 'doppler': 'passes',
  };

  function isTabActive(tabId: string): boolean {
    const sheet = uiStore.activeMobileSheet;
    if (!sheet) return false;
    if (sheet === tabId) return true;
    // "More" highlights when active sheet isn't any direct tab or mapped to one
    if (tabId === 'more') {
      const resolved = childToTab[sheet] ?? sheet;
      return !tabs.some(t => t.id === resolved);
    }
    return childToTab[sheet] === tabId;
  }

  function onMoreItem(id: string) {
    uiStore.openMobileSheet(id);
  }
</script>

<nav class="mobile-nav">
  {#each tabs as tab}
    <button
      class="nav-tab"
      class:active={isTabActive(tab.id)}
      onclick={() => uiStore.switchMobileSheet(tab.id)}
    >
      <span class="nav-icon">{@html tab.icon}</span>
      <span class="nav-label">{tab.label}</span>
    </button>
  {/each}
</nav>

<MobileSheet id="more" title="More">
  <div class="more-menu">
    {#each moreItems as item}
      <button class="more-item" onclick={() => onMoreItem(item.id)}>
        <span class="more-icon">{@html item.icon}</span>
        <span class="more-label">{item.label}</span>
      </button>
    {/each}
    <button class="more-item" onclick={() => { uiStore.closeMobileSheet(); uiStore.onPlanetButtonClick?.(); }}>
      <span class="more-icon">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="5.5"/><ellipse cx="8" cy="8" rx="5.5" ry="2" transform="rotate(-20 8 8)"/></svg>
      </span>
      <span class="more-label">Solar System</span>
    </button>
    <button class="more-item" onclick={() => onMoreItem('settings')}>
      <span class="more-icon">{@html ICON_SETTINGS}</span>
      <span class="more-label">Settings</span>
    </button>
    <button class="more-item" onclick={() => { uiStore.closeMobileSheet(); uiStore.infoModalOpen = true; }}>
      <span class="more-icon">{@html ICON_HELP}</span>
      <span class="more-label">Help</span>
    </button>
  </div>
</MobileSheet>

<style>
  .mobile-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 56px;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    z-index: 501;
    background: var(--ui-bg);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: stretch;
  }
  .nav-tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    background: none;
    border: none;
    color: var(--text-faint);
    cursor: pointer;
    padding: 6px 0;
    min-width: 0;
  }
  .nav-tab.active { color: var(--accent); }
  .nav-tab:hover:not(.active) { color: var(--text-dim); }
  .nav-icon { display: flex; align-items: center; justify-content: center; }
  .nav-icon :global(svg) { width: 20px; height: 20px; }
  .nav-label { font-size: 10px; letter-spacing: 0.3px; }

  .more-menu {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .more-item {
    display: flex;
    align-items: center;
    gap: 12px;
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    padding: 12px 8px;
    font-size: 14px;
    font-family: inherit;
    width: 100%;
    text-align: left;
  }
  .more-item:hover { color: var(--text); background: var(--row-highlight); }
  .more-icon { display: flex; align-items: center; flex-shrink: 0; }
  .more-icon :global(svg) { width: 18px; height: 18px; }
  .more-label { flex: 1; }
</style>
