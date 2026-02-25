<script lang="ts">
  import DraggableWindow from './shared/DraggableWindow.svelte';
  import { uiStore } from '../stores/ui.svelte';
  import { themeStore } from '../stores/theme.svelte';
  import { VAR_GROUPS, BUILTIN_THEMES, cssColorToHex, type ThemeVars } from '../themes';
  import { ICON_THEME } from './shared/icons';

  let expandedGroups = $state<Set<number>>(new Set([0, 1]));
  let fileInput: HTMLInputElement | undefined = $state();

  let isCustomActive = $derived(!themeStore.activeTheme.builtin);

  function toggleGroup(idx: number) {
    const next = new Set(expandedGroups);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    expandedGroups = next;
  }

  function onClone() {
    const source = themeStore.activeTheme;
    const newId = themeStore.cloneTheme(source.id, source.name + ' Copy');
    themeStore.activate(newId);
  }

  function onExport() {
    const json = themeStore.exportTheme(themeStore.activeId);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${themeStore.activeTheme.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onImportClick() {
    fileInput?.click();
  }

  function onImportFile() {
    const file = fileInput?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const id = themeStore.importTheme(reader.result as string);
      if (id) themeStore.activate(id);
    };
    reader.readAsText(file);
    if (fileInput) fileInput.value = '';
  }

  function onColorPick(varName: keyof ThemeVars, e: Event) {
    const hex = (e.target as HTMLInputElement).value;
    const current = themeStore.activeTheme.vars[varName];
    // Preserve alpha for rgba values
    const rgbaMatch = current.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/);
    if (rgbaMatch) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      themeStore.updateVar(varName, `rgba(${r},${g},${b},${rgbaMatch[1]})`);
    } else {
      themeStore.updateVar(varName, hex);
    }
  }

  function onTextInput(varName: keyof ThemeVars, e: Event) {
    const value = (e.target as HTMLInputElement).value.trim();
    if (value) themeStore.updateVar(varName, value);
  }

  function onNameInput(e: Event) {
    const name = (e.target as HTMLInputElement).value.trim();
    if (name) themeStore.renameTheme(themeStore.activeId, name);
  }

  function onSchemeChange(e: Event) {
    const scheme = (e.target as HTMLSelectElement).value as 'dark' | 'light';
    themeStore.setColorScheme(themeStore.activeId, scheme);
  }

  function resetToDefaults() {
    if (themeStore.activeTheme.builtin) return;
    const dark = BUILTIN_THEMES[0];
    for (const [key, value] of Object.entries(dark.vars)) {
      themeStore.updateVar(key as keyof ThemeVars, value);
    }
  }
</script>

{#snippet themeIcon()}<span class="title-icon">{@html ICON_THEME}</span>{/snippet}
<DraggableWindow id="theme-editor" title="Theme Editor" icon={themeIcon} bind:open={uiStore.themeEditorOpen} initialX={300} initialY={200}>
  <div class="te-content">
    <div class="theme-list">
      {#each themeStore.allThemes as theme}
        <div class="theme-row" class:active={theme.id === themeStore.activeId}>
          <button class="theme-btn" onclick={() => themeStore.activate(theme.id)}>
            <span class="theme-swatch" style:background={theme.vars['--bg']} style:border-color={theme.vars['--border']}><svg viewBox="0 0 10 10" fill={theme.vars['--accent']}><text x="5" y="8.5" font-size="10" font-weight="bold" font-family="sans-serif" text-anchor="middle">A</text></svg></span>
            <span class="theme-name">{theme.name}</span>
            {#if theme.id === themeStore.activeId}<span class="theme-active-mark"><svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,5.5 4.5,8 8,2.5"/></svg></span>{/if}
          </button>
          {#if !theme.builtin}
            <button class="theme-delete" onclick={() => themeStore.deleteTheme(theme.id)} title="Delete theme">&times;</button>
          {/if}
        </div>
      {/each}
    </div>

    <div class="action-row">
      <button class="action-btn" onclick={onClone}>Clone Active</button>
      <button class="action-btn" onclick={onImportClick}>Import</button>
      <input bind:this={fileInput} type="file" accept=".json" style="display:none" onchange={onImportFile}>
    </div>

    {#if isCustomActive}
      <div class="editor-section">
        <div class="editor-meta">
          <div class="meta-row">
            <label>Name</label>
            <input type="text" class="name-input" value={themeStore.activeTheme.name} onchange={onNameInput}>
          </div>
          <div class="meta-row">
            <label>Scheme</label>
            <select value={themeStore.activeTheme.colorScheme} onchange={onSchemeChange}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
        </div>

        <div class="var-groups">
          {#each VAR_GROUPS as group, idx}
            <button class="group-header" onclick={() => toggleGroup(idx)}>
              <span class="group-arrow">{expandedGroups.has(idx) ? '\u25BE' : '\u25B8'}</span>
              {group.label}
            </button>
            {#if expandedGroups.has(idx)}
              <div class="group-vars">
                {#each group.vars as v}
                  <div class="var-row">
                    <span class="var-label">{v.label}</span>
                    <div class="var-controls">
                      <input type="color" class="color-swatch" value={cssColorToHex(themeStore.activeTheme.vars[v.key])} oninput={(e) => onColorPick(v.key, e)}>
                      <input type="text" class="color-text" value={themeStore.activeTheme.vars[v.key]} onchange={(e) => onTextInput(v.key, e)}>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          {/each}
        </div>

        <div class="editor-footer">
          <button class="action-btn" onclick={onExport}>Export</button>
          <button class="action-btn danger" onclick={resetToDefaults}>Reset</button>
        </div>
      </div>
    {:else}
      <div class="builtin-note">Clone a theme to customize colors</div>
    {/if}
  </div>
</DraggableWindow>

<style>
  .te-content {
    width: 340px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .theme-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 160px;
    overflow-y: auto;
  }

  .theme-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .theme-btn {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    background: none;
    border: 1px solid transparent;
    color: var(--text-dim);
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }
  .theme-btn:hover { border-color: var(--border); }
  .theme-row.active .theme-btn { border-color: var(--accent); color: var(--text); }

  .theme-swatch {
    width: 16px;
    height: 16px;
    border: 1px solid;
    border-radius: 3px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .theme-swatch svg {
    width: 10px;
    height: 10px;
  }

  .theme-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .theme-active-mark {
    color: var(--accent);
    display: flex;
  }
  .theme-active-mark svg {
    width: 10px;
    height: 10px;
  }

  .theme-delete {
    background: none;
    border: none;
    color: var(--text-ghost);
    font-size: 16px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }
  .theme-delete:hover { color: var(--danger-bright); }

  .action-row {
    display: flex;
    gap: 6px;
    padding-top: 4px;
    border-top: 1px solid var(--border);
  }

  .action-btn {
    background: var(--ui-bg);
    border: 1px solid var(--border);
    color: var(--text-dim);
    padding: 3px 8px;
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
  }
  .action-btn:hover { border-color: var(--border-hover); color: var(--text); }
  .action-btn.danger:hover { color: var(--danger-bright); border-color: var(--danger); }

  .editor-section {
    border-top: 1px solid var(--border);
    padding-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .editor-meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .meta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .meta-row label { color: var(--text-dim); font-size: 12px; }

  .name-input {
    width: 160px;
    background: var(--ui-bg);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 2px 6px;
    font-size: 12px;
    font-family: inherit;
  }
  .name-input:focus { border-color: var(--border-hover); outline: none; }

  .meta-row select {
    background: var(--ui-bg);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 2px 6px;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
  }
  .meta-row select:hover { border-color: var(--border-hover); }

  .var-groups {
    max-height: 320px;
    overflow-y: auto;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    background: none;
    border: none;
    color: var(--text-ghost);
    font-size: 11px;
    font-family: inherit;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 6px 0 4px;
    cursor: pointer;
    border-bottom: 1px solid var(--border);
  }
  .group-header:hover { color: var(--text-faint); }

  .group-arrow {
    font-size: 10px;
    width: 10px;
  }

  .group-vars {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 0;
  }

  .var-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .var-label {
    font-size: 11px;
    color: var(--text-muted);
    flex-shrink: 0;
    min-width: 80px;
  }

  .var-controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .color-swatch {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 50%;
    cursor: pointer;
    flex-shrink: 0;
    background: none;
    overflow: hidden;
  }
  .color-swatch::-webkit-color-swatch-wrapper { padding: 1px; border-radius: 50%; }
  .color-swatch::-webkit-color-swatch { border: none; border-radius: 50%; }
  .color-swatch::-moz-color-swatch { border: none; border-radius: 50%; }

  .color-text {
    width: 130px;
    background: var(--ui-bg);
    border: 1px solid var(--border);
    color: var(--text-faint);
    padding: 1px 4px;
    font-size: 10px;
    font-family: inherit;
  }
  .color-text:focus { border-color: var(--border-hover); color: var(--text); outline: none; }

  .editor-footer {
    display: flex;
    gap: 6px;
    padding-top: 4px;
    border-top: 1px solid var(--border);
  }

  .builtin-note {
    color: var(--text-ghost);
    font-size: 11px;
    padding: 8px 0;
    text-align: center;
    border-top: 1px solid var(--border);
  }
</style>
