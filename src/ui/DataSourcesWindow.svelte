<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import Checkbox from './shared/Checkbox.svelte';
  import Button from './shared/Button.svelte';
  import Input from './shared/Input.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { sourcesStore } from '../stores/sources.svelte';
  import { getCacheAge } from '../data/tle-loader';
  import { ICON_DATA_SOURCES } from './shared/icons';

  let addingUrl = $state(false);
  let newName = $state('');
  let newUrl = $state('');
  let fileInput: HTMLInputElement | undefined = $state();
  let filterQuery = $state('');

  let builtinSources = $derived(sourcesStore.sources.filter(s => s.builtin));
  let filteredBuiltins = $derived.by(() => {
    if (!filterQuery) return builtinSources;
    const q = filterQuery.toLowerCase();
    return builtinSources.filter(s => s.name.toLowerCase().includes(q));
  });
  let customSources = $derived(sourcesStore.sources.filter(s => !s.builtin));

  function submitUrl() {
    const name = newName.trim();
    const url = newUrl.trim();
    if (!name || !url) return;
    sourcesStore.addCustomUrl(name, url);
    newName = '';
    newUrl = '';
    addingUrl = false;
  }

  function onUrlKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') submitUrl();
    if (e.key === 'Escape') addingUrl = false;
  }

  function onFileChange() {
    const file = fileInput?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const name = file.name.replace(/\.(tle|txt|3le)$/i, '');
      sourcesStore.addCustomFile(name, reader.result as string);
    };
    reader.readAsText(file);
    if (fileInput) fileInput.value = '';
  }

  function getStatus(id: string): string {
    const state = sourcesStore.loadStates.get(id);
    if (!state) return '';
    if (state.status === 'loading') return '...';
    if (state.status === 'error') return 'err';
    if (state.status === 'loaded') return `${state.satCount}`;
    return '';
  }

  function formatAge(ms: number): string {
    const min = Math.floor(ms / 60_000);
    if (min < 1) return '<1m';
    if (min < 60) return `${min}m`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  }

  function getCacheInfo(src: { id: string; group?: string; type: string }): string | null {
    // For enabled sources, use load state cache age
    const state = sourcesStore.loadStates.get(src.id);
    if (state?.status === 'loaded' && state.cacheAge != null) {
      return formatAge(state.cacheAge);
    }
    // For disabled CelesTrak sources, peek at localStorage cache
    if (src.group) {
      const age = getCacheAge(src.group);
      if (age != null) return formatAge(age);
    }
    return null;
  }
</script>

{#snippet dsIcon()}<span class="title-icon">{@html ICON_DATA_SOURCES}</span>{/snippet}
<DraggableWindow id="data-sources" title="Data Sources" icon={dsIcon} bind:open={uiStore.dataSourcesOpen} initialX={10} initialY={260}>
  <div class="ds-content">
    <Input
      class="filter-input"
      size="lg"
      type="text"
      placeholder="Filter sources..."
      bind:value={filterQuery}
      spellcheck="false"
      autocomplete="off"
    />

    <div class="section">
      <div class="section-header">CelesTrak{#if filterQuery} <span class="filter-count">({filteredBuiltins.length})</span>{/if}</div>
      <div class="source-list">
        {#each filteredBuiltins as src}
          {@const cached = getCacheInfo(src)}
          {@const enabled = sourcesStore.enabledIds.has(src.id)}
          <label class="source-row">
            <Checkbox size="sm"
              checked={enabled}
              onchange={() => sourcesStore.toggleSource(src.id)} />
            <span class="source-name">{src.name}</span>
            {#if enabled}
              <span class="source-count">{getStatus(src.id)}</span>
            {/if}
            {#if cached}
              <span class="cache-age" title="Cached {cached} ago">{cached}</span>
            {/if}
          </label>
        {/each}
      </div>
    </div>

    <div class="section">
      <div class="section-header">Custom</div>
      {#if customSources.length > 0}
        <div class="source-list custom-list">
          {#each customSources as src}
            <label class="source-row">
              <Checkbox size="sm"
                checked={sourcesStore.enabledIds.has(src.id)}
                onchange={() => sourcesStore.toggleSource(src.id)} />
              <span class="source-name">{src.name}</span>
              {#if sourcesStore.enabledIds.has(src.id)}
                <span class="source-count">{getStatus(src.id)}</span>
              {/if}
              <button class="delete-btn" title="Remove source" onclick={(e) => { e.preventDefault(); sourcesStore.removeCustom(src.id); }}>×</button>
            </label>
          {/each}
        </div>
      {:else}
        <div class="empty-hint">No custom sources</div>
      {/if}

      {#if addingUrl}
        <div class="add-form">
          <Input class="add-input" type="text" placeholder="Name" bind:value={newName} onkeydown={onUrlKeydown} />
          <Input class="add-input" type="text" placeholder="URL" bind:value={newUrl} onkeydown={onUrlKeydown} />
          <div class="add-actions">
            <Button onclick={submitUrl}>Add</Button>
            <Button variant="ghost" onclick={() => addingUrl = false}>Cancel</Button>
          </div>
        </div>
      {:else}
        <div class="add-row">
          <Button onclick={() => addingUrl = true}>+ URL</Button>
          <Button onclick={() => fileInput?.click()}>+ File</Button>
          <input type="file" bind:this={fileInput} accept=".tle,.txt,.3le" style="display:none" onchange={onFileChange}>
        </div>
      {/if}
    </div>

    <div class="footer">
      {#if sourcesStore.loading}
        <span class="footer-text">Loading...</span>
      {:else}
        <span class="footer-text">
          {sourcesStore.totalSats} sats loaded{#if sourcesStore.dupsRemoved > 0} ({sourcesStore.dupsRemoved} dups removed){/if}
        </span>
      {/if}
    </div>
  </div>
</DraggableWindow>

<style>
  .ds-content {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 260px;
  }
  :global(.filter-input) { width: 100%; }
  .filter-count { color: var(--text-faint); font-size: 10px; }
  .section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .section-header {
    font-size: 10px;
    color: var(--text-ghost);
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }
  .source-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 140px;
    overflow-y: auto;
    padding-right: 10px;
  }
  .custom-list {
    max-height: 120px;
  }
  .source-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    cursor: pointer;
    color: var(--text-dim);
    line-height: 20px;
    padding: 1px 0;
  }
  .source-row:hover { color: var(--text); }


  .source-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .source-count {
    font-size: 11px;
    color: var(--text-ghost);
    flex-shrink: 0;
  }
  .cache-age {
    font-size: 10px;
    color: var(--text-faint);
    flex-shrink: 0;
  }
  .delete-btn {
    background: none;
    border: none;
    color: var(--text-ghost);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 0 2px;
    flex-shrink: 0;
  }
  .delete-btn:hover { color: var(--danger-bright); }

  .empty-hint {
    font-size: 11px;
    color: var(--text-ghost);
    font-style: italic;
  }

  .add-row {
    display: flex;
    gap: 4px;
    margin-top: 2px;
  }
  .add-form {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 2px;
  }
  :global(.add-input) { width: 100%; }

  .add-actions {
    display: flex;
    gap: 4px;
  }


  .footer {
    border-top: 1px solid var(--border);
    padding-top: 6px;
  }
  .footer-text {
    font-size: 11px;
    color: var(--text-ghost);
  }
</style>
