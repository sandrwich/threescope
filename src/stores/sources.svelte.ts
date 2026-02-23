import { TLE_SOURCES } from '../data/tle-sources';

export type SourceType = 'celestrak' | 'url' | 'text';

export interface TLESourceConfig {
  id: string;
  name: string;
  type: SourceType;
  group?: string;   // CelesTrak group slug
  url?: string;     // fetch URL (type='url')
  builtin: boolean; // true = CelesTrak, can't delete
}

export interface SourceLoadState {
  satCount: number;
  status: 'idle' | 'loading' | 'loaded' | 'error';
  cacheAge?: number;
  error?: string;
}

interface CustomSourceDef {
  id: string;
  name: string;
  type: 'url' | 'text';
  url?: string;
}

const ENABLED_KEY = 'threescope_sources_enabled';
const CUSTOM_KEY = 'threescope_sources_custom';
const TEXT_KEY_PREFIX = 'threescope_source_text_';
const LEGACY_GROUP_KEY = 'threescope_tle_group';

class SourcesStore {
  sources = $state<TLESourceConfig[]>([]);
  enabledIds = $state<Set<string>>(new Set());
  loadStates = $state<Map<string, SourceLoadState>>(new Map());
  totalSats = $state(0);
  dupsRemoved = $state(0);
  loading = $state(false);

  onSourcesChange: (() => Promise<void>) | null = null;

  get enabledSources(): TLESourceConfig[] {
    return this.sources.filter(s => this.enabledIds.has(s.id));
  }

  load() {
    // Build builtin CelesTrak sources
    const builtins: TLESourceConfig[] = TLE_SOURCES
      .filter(s => s.group !== 'none')
      .map(s => ({
        id: `celestrak:${s.group}`,
        name: s.name,
        type: 'celestrak' as SourceType,
        group: s.group,
        builtin: true,
      }));

    // Load custom sources from localStorage
    let customs: TLESourceConfig[] = [];
    try {
      const raw = localStorage.getItem(CUSTOM_KEY);
      if (raw) {
        const defs: CustomSourceDef[] = JSON.parse(raw);
        customs = defs.map(d => ({
          id: d.id,
          name: d.name,
          type: d.type as SourceType,
          url: d.url,
          builtin: false,
        }));
      }
    } catch { /* ignore */ }

    this.sources = [...builtins, ...customs];

    // Load enabled set
    let migrated = false;
    try {
      const raw = localStorage.getItem(ENABLED_KEY);
      if (raw) {
        const ids: string[] = JSON.parse(raw);
        this.enabledIds = new Set(ids);
        return;
      }
    } catch { /* ignore */ }

    // Try legacy migration
    try {
      const oldGroup = localStorage.getItem(LEGACY_GROUP_KEY);
      if (oldGroup && oldGroup !== 'none' && oldGroup !== '__custom__') {
        this.enabledIds = new Set([`celestrak:${oldGroup}`]);
        this.persistEnabled();
        localStorage.removeItem(LEGACY_GROUP_KEY);
        migrated = true;
      }
    } catch { /* ignore */ }

    // Default if nothing saved and no migration
    if (!migrated) {
      this.enabledIds = new Set(['celestrak:visual']);
      this.persistEnabled();
    }
  }

  toggleSource(id: string) {
    const next = new Set(this.enabledIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.enabledIds = next;
    this.persistEnabled();
    this.onSourcesChange?.();
  }

  addCustomUrl(name: string, url: string): string {
    const id = 'custom:' + crypto.randomUUID();
    this.sources = [...this.sources, {
      id, name, type: 'url', url, builtin: false,
    }];
    this.persistCustom();
    // Enable it
    const next = new Set(this.enabledIds);
    next.add(id);
    this.enabledIds = next;
    this.persistEnabled();
    this.onSourcesChange?.();
    return id;
  }

  addCustomFile(name: string, text: string): string {
    const id = 'custom:' + crypto.randomUUID();
    try {
      localStorage.setItem(TEXT_KEY_PREFIX + id, text);
    } catch { /* localStorage full */ }
    this.sources = [...this.sources, {
      id, name, type: 'text', builtin: false,
    }];
    this.persistCustom();
    const next = new Set(this.enabledIds);
    next.add(id);
    this.enabledIds = next;
    this.persistEnabled();
    this.onSourcesChange?.();
    return id;
  }

  removeCustom(id: string) {
    this.sources = this.sources.filter(s => s.id !== id);
    const next = new Set(this.enabledIds);
    next.delete(id);
    this.enabledIds = next;
    this.persistCustom();
    this.persistEnabled();
    // Clean up localStorage
    try {
      localStorage.removeItem(TEXT_KEY_PREFIX + id);
      localStorage.removeItem('tlescope_tle_custom_' + id);
    } catch { /* ignore */ }
    this.onSourcesChange?.();
  }

  renameCustom(id: string, newName: string) {
    this.sources = this.sources.map(s =>
      s.id === id ? { ...s, name: newName } : s
    );
    this.persistCustom();
  }

  setLoadState(id: string, state: SourceLoadState) {
    const next = new Map(this.loadStates);
    next.set(id, state);
    this.loadStates = next;
  }

  /** Get raw TLE text for a text-type custom source */
  getCustomText(id: string): string {
    try {
      return localStorage.getItem(TEXT_KEY_PREFIX + id) ?? '';
    } catch { return ''; }
  }

  private persistEnabled() {
    try {
      localStorage.setItem(ENABLED_KEY, JSON.stringify([...this.enabledIds]));
    } catch { /* ignore */ }
  }

  private persistCustom() {
    const defs: CustomSourceDef[] = this.sources
      .filter(s => !s.builtin)
      .map(s => ({ id: s.id, name: s.name, type: s.type as 'url' | 'text', url: s.url }));
    try {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(defs));
    } catch { /* ignore */ }
  }
}

export const sourcesStore = new SourcesStore();
