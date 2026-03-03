<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import MobileSheet from './shared/MobileSheet.svelte';
  import Checkbox from './shared/Checkbox.svelte';
  import Button from './shared/Button.svelte';
  import Input from './shared/Input.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { sourcesStore, type TLESourceConfig, type SourceType } from '../stores/sources.svelte';
  import { getCacheAge } from '../data/tle-loader';
  import { ICON_DATA_SOURCES, ICON_DOWNLOAD, ICON_EDIT, ICON_CLOSE } from './shared/icons';

  let addingUrl = $state(false);
  let newName = $state('');
  let newUrl = $state('');
  let fileInput: HTMLInputElement | undefined = $state();
  let filterQuery = $state('');

  // TLE editor modal state
  let editOpen = $state(false);
  let editName = $state('');
  let editText = $state('');
  let editSourceId: string | null = $state(null);
  let editOriginalType: SourceType | null = $state(null);

  let builtinSources = $derived(sourcesStore.sources.filter(s => s.builtin));
  let filteredBuiltins = $derived.by(() => {
    if (!filterQuery) return builtinSources;
    const q = filterQuery.toLowerCase();
    return builtinSources.filter(s => s.name.toLowerCase().includes(q));
  });
  let customSources = $derived(sourcesStore.sources.filter(s => !s.builtin));
  let allSources = $derived(sourcesStore.sources);
  let enabledCount = $derived(sourcesStore.enabledIds.size);
  let allEnabled = $derived(enabledCount === allSources.length && allSources.length > 0);
  let someEnabled = $derived(enabledCount > 0 && !allEnabled);

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
      const name = file.name.replace(/\.(tle|txt|3le|json)$/i, '');
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
    const state = sourcesStore.loadStates.get(src.id);
    if (state?.status === 'loaded' && state.cacheAge != null) {
      return formatAge(state.cacheAge);
    }
    if (src.group) {
      const age = getCacheAge(src.group);
      if (age != null) return formatAge(age);
    }
    return null;
  }

  function openPasteModal() {
    editSourceId = null;
    editOriginalType = null;
    editName = '';
    editText = '';
    editOpen = true;
  }

  function openEditModal(src: TLESourceConfig) {
    const text = sourcesStore.getRawText(src);
    if (!text) return;
    editSourceId = src.id;
    editOriginalType = src.type;
    editName = src.type === 'celestrak' ? src.name + ' (copy)' : src.name;
    editText = text;
    editOpen = true;
  }

  function downloadSource(src: TLESourceConfig) {
    const text = sourcesStore.getRawText(src);
    if (!text) return;
    const isJson = text.trimStart()[0] === '[';
    const blob = new Blob([text], { type: isJson ? 'application/json' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = src.name.replace(/[^a-zA-Z0-9_-]/g, '_') + (isJson ? '.json' : '.tle');
    a.click();
    URL.revokeObjectURL(url);
  }

  function saveEdit() {
    const name = editName.trim();
    const text = editText.trim();
    if (!name || !text) return;

    if (!editSourceId) {
      // New paste
      sourcesStore.addCustomFile(name, text);
    } else if (editOriginalType === 'celestrak') {
      // Fork celestrak as new custom
      sourcesStore.addCustomFile(name, text);
    } else if (editOriginalType === 'url') {
      // Convert URL source to text
      sourcesStore.convertToText(editSourceId, text);
      if (name !== sourcesStore.sources.find(s => s.id === editSourceId)?.name) {
        sourcesStore.renameCustom(editSourceId, name);
      }
    } else {
      // Update existing text source
      sourcesStore.updateCustomText(editSourceId, text);
      if (name !== sourcesStore.sources.find(s => s.id === editSourceId)?.name) {
        sourcesStore.renameCustom(editSourceId, name);
      }
    }
    editOpen = false;
  }

  function hasCachedData(src: TLESourceConfig): boolean {
    // Check reactive load state first (triggers re-render after fetch completes)
    const state = sourcesStore.loadStates.get(src.id);
    if (state?.status === 'loaded') return true;
    // Fall back to localStorage for data cached in a previous session
    return sourcesStore.getRawText(src) != null;
  }
</script>

{#snippet dsIcon()}<span class="title-icon">{@html ICON_DATA_SOURCES}</span>{/snippet}
{#snippet windowContent()}
  <div class="ds-content">
    <div class="master-row">
      <Checkbox size="sm"
        checked={allEnabled}
        mixed={someEnabled}
        onchange={() => allEnabled ? sourcesStore.disableAllSources() : sourcesStore.enableAllSources(allSources.map(s => s.id))} />
      <span class="master-label">{enabledCount} / {allSources.length} enabled</span>
    </div>
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
            {#if hasCachedData(src)}
              <button class="action-btn" title="Download" onclick={(e) => { e.preventDefault(); downloadSource(src); }}>{@html ICON_DOWNLOAD}</button>
              <button class="action-btn" title="Edit as copy" onclick={(e) => { e.preventDefault(); openEditModal(src); }}>{@html ICON_EDIT}</button>
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
              {#if hasCachedData(src)}
                <button class="action-btn" title="Download" onclick={(e) => { e.preventDefault(); downloadSource(src); }}>{@html ICON_DOWNLOAD}</button>
                <button class="action-btn" title="Edit" onclick={(e) => { e.preventDefault(); openEditModal(src); }}>{@html ICON_EDIT}</button>
              {/if}
              <button class="delete-btn" title="Remove source" onclick={(e) => { e.preventDefault(); sourcesStore.removeCustom(src.id); }}>{@html ICON_CLOSE}</button>
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
            <Button variant="ghost" onclick={() => addingUrl = false}>Cancel</Button>
            <Button onclick={submitUrl}>Add</Button>
          </div>
        </div>
      {:else}
        <div class="add-row">
          <Button onclick={() => addingUrl = true}>+ URL</Button>
          <Button onclick={() => fileInput?.click()}>+ File</Button>
          <Button onclick={openPasteModal}>+ Paste</Button>
          <input type="file" bind:this={fileInput} accept=".tle,.txt,.3le,.json" style="display:none" onchange={onFileChange}>
        </div>
      {/if}
    </div>
  </div>
{/snippet}

{#if uiStore.isMobile}
  <MobileSheet id="sources" title="Data Sources" icon={dsIcon}>
    {@render windowContent()}
  </MobileSheet>
{:else}
  <DraggableWindow id="data-sources" title="Data Sources" icon={dsIcon} bind:open={uiStore.dataSourcesOpen} initialX={10} initialY={260}>
    {@render windowContent()}
  </DraggableWindow>
{/if}

<DraggableWindow title={editSourceId ? 'Edit Source' : 'Paste OMM / TLE Data'} modal bind:open={editOpen}>
  <div class="tle-editor">
    <Input
      class="tle-name-input"
      type="text"
      placeholder="Source name"
      bind:value={editName}
      spellcheck="false"
      autocomplete="off"
    />
    <textarea
      class="tle-textarea"
      placeholder={'Paste OMM JSON or TLE data...\n\nOMM JSON:\n[{"OBJECT_NAME":"ISS","NORAD_CAT_ID":25544,...}]\n\nTLE:\nISS (ZARYA)\n1 25544U 98067A   24001.00000000 ...\n2 25544  51.6400 100.0000 ...'}
      bind:value={editText}
      spellcheck="false"
    ></textarea>
    <div class="tle-editor-actions">
      <Button variant="ghost" onclick={() => editOpen = false}>Cancel</Button>
      <Button onclick={saveEdit}>Save</Button>
    </div>
  </div>
</DraggableWindow>

<style>
  .ds-content {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 300px;
  }
  @media (max-width: 767px) {
    .ds-content { width: 100%; }
  }
  .master-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .master-label {
    font-size: 11px;
    color: var(--text-muted);
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
  .action-btn {
    background: none;
    border: none;
    color: var(--text-ghost);
    cursor: pointer;
    padding: 0 1px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    width: 14px;
    height: 14px;
  }
  .action-btn :global(svg) { width: 12px; height: 12px; }
  .action-btn:hover { color: var(--text); }

  .delete-btn {
    background: none;
    border: none;
    color: var(--text-ghost);
    cursor: pointer;
    padding: 0 1px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    width: 14px;
    height: 14px;
  }
  .delete-btn :global(svg) { width: 10px; height: 10px; }
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


  /* TLE editor modal — override modal-window sizing */
  :global(.modal-window:has(.tle-editor)) {
    max-width: 640px;
    height: 80vh;
    max-height: 700px;
    display: flex;
    flex-direction: column;
  }
  :global(.modal-window:has(.tle-editor) .window-body) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .tle-editor {
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1;
    min-height: 0;
  }
  :global(.tle-name-input) { width: 100%; }
  .tle-textarea {
    width: 100%;
    flex: 1;
    min-height: 120px;
    resize: none;
    background: var(--ui-bg);
    color: var(--text);
    border: 1px solid var(--border);
    font-family: 'Overpass Mono', monospace;
    font-size: 11px;
    padding: 10px;
    line-height: 1.4;
  }
  .tle-textarea::placeholder { color: var(--text-ghost); }
  .tle-textarea:focus { outline: 1px solid var(--text-faint); }
  .tle-editor-actions {
    display: flex;
    gap: 4px;
    justify-content: flex-end;
  }
</style>
