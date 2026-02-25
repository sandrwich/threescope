<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { sourcesStore } from '../stores/sources.svelte';
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
</script>

{#snippet dsIcon()}<span class="title-icon">{@html ICON_DATA_SOURCES}</span>{/snippet}
<DraggableWindow id="data-sources" title="Data Sources" icon={dsIcon} bind:open={uiStore.dataSourcesOpen} initialX={10} initialY={260}>
  <div class="ds-content">
    <input
      class="filter-input"
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
          <label class="source-row">
            <input type="checkbox"
              checked={sourcesStore.enabledIds.has(src.id)}
              onchange={() => sourcesStore.toggleSource(src.id)}>
            <span class="source-name">{src.name}</span>
            {#if sourcesStore.enabledIds.has(src.id)}
              <span class="source-count">{getStatus(src.id)}</span>
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
              <input type="checkbox"
                checked={sourcesStore.enabledIds.has(src.id)}
                onchange={() => sourcesStore.toggleSource(src.id)}>
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
          <input type="text" class="add-input" placeholder="Name" bind:value={newName} onkeydown={onUrlKeydown}>
          <input type="text" class="add-input url-input" placeholder="URL" bind:value={newUrl} onkeydown={onUrlKeydown}>
          <div class="add-actions">
            <button class="small-btn" onclick={submitUrl}>Add</button>
            <button class="small-btn cancel-btn" onclick={() => addingUrl = false}>Cancel</button>
          </div>
        </div>
      {:else}
        <div class="add-row">
          <button class="small-btn" onclick={() => addingUrl = true}>+ URL</button>
          <button class="small-btn" onclick={() => fileInput?.click()}>+ File</button>
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
  .filter-input {
    width: 100%;
    background: var(--ui-bg);
    border: 1px solid var(--border);
    color: var(--text);
    font-size: 12px;
    font-family: inherit;
    padding: 4px 8px;
    outline: none;
    box-sizing: border-box;
  }
  .filter-input:focus { border-color: var(--border-hover); }
  .filter-input::placeholder { color: var(--text-ghost); }
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

  .source-row input[type="checkbox"] {
    appearance: none;
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border: 2px solid var(--border-hover);
    background: transparent;
    cursor: pointer;
    position: relative;
    flex-shrink: 0;
  }
  .source-row input[type="checkbox"]:hover { border-color: var(--text); }
  .source-row input[type="checkbox"]:checked::after {
    content: '';
    position: absolute;
    top: 1px; left: 1px; right: 1px; bottom: 1px;
    background: var(--text);
  }

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
  .delete-btn:hover { color: #f55; }

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
  .add-input {
    background: var(--ui-bg);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 3px 6px;
    font-size: 11px;
    font-family: inherit;
    width: 100%;
  }
  .add-input:focus { border-color: var(--border-hover); outline: none; }
  .add-input::placeholder { color: var(--text-ghost); }

  .add-actions {
    display: flex;
    gap: 4px;
  }

  .small-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-dim);
    padding: 2px 8px;
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
  }
  .small-btn:hover { color: var(--text); border-color: var(--border-hover); }
  .cancel-btn { border-color: transparent; }
  .cancel-btn:hover { border-color: var(--border); }

  .footer {
    border-top: 1px solid var(--border);
    padding-top: 6px;
  }
  .footer-text {
    font-size: 11px;
    color: var(--text-ghost);
  }
</style>
