import {
  type ThemeDef, type ThemeVars,
  BUILTIN_THEMES, DEFAULT_THEME_ID,
} from '../themes';
import { refreshTheme } from '../ui/shared/theme';

const ACTIVE_KEY = 'threescope_theme_active';
const CUSTOM_KEY = 'threescope_themes_custom';

class ThemeStore {
  activeId = $state(DEFAULT_THEME_ID);
  customThemes = $state<ThemeDef[]>([]);

  // Callback registered by App during wireStores()
  onThemeChange: (() => void) | null = null;

  get allThemes(): ThemeDef[] {
    return [...BUILTIN_THEMES, ...this.customThemes];
  }

  get activeTheme(): ThemeDef {
    return this.allThemes.find(t => t.id === this.activeId) ?? BUILTIN_THEMES[0];
  }

  /** Called once at startup from wireStores(). Loads persisted state and applies. */
  load() {
    try {
      const raw = localStorage.getItem(CUSTOM_KEY);
      if (raw) this.customThemes = JSON.parse(raw);
    } catch { /* ignore corrupt data */ }

    const savedId = localStorage.getItem(ACTIVE_KEY);
    if (savedId && this.allThemes.some(t => t.id === savedId)) {
      this.activeId = savedId;
    }

    this.applyTheme(this.activeTheme);
  }

  /** Set all CSS variables on :root and refresh the canvas palette */
  applyTheme(theme: ThemeDef) {
    const root = document.documentElement;
    root.style.setProperty('color-scheme', theme.colorScheme);
    for (const [prop, value] of Object.entries(theme.vars)) {
      root.style.setProperty(prop, value);
    }
    refreshTheme();
    this.onThemeChange?.();
  }

  /** Switch to a theme by id */
  activate(id: string) {
    this.activeId = id;
    localStorage.setItem(ACTIVE_KEY, id);
    this.applyTheme(this.activeTheme);
  }

  /** Clone an existing theme into a new custom theme */
  cloneTheme(sourceId: string, newName: string): string {
    const source = this.allThemes.find(t => t.id === sourceId);
    if (!source) return sourceId;

    const id = 'custom:' + crypto.randomUUID();
    const clone: ThemeDef = {
      id,
      name: newName,
      builtin: false,
      colorScheme: source.colorScheme,
      vars: { ...source.vars },
    };
    this.customThemes = [...this.customThemes, clone];
    this.persistCustom();
    return id;
  }

  /** Update a single CSS variable in the active custom theme (live preview) */
  updateVar(varName: keyof ThemeVars, value: string) {
    const theme = this.activeTheme;
    if (theme.builtin) return;
    theme.vars[varName] = value;
    document.documentElement.style.setProperty(varName, value);
    refreshTheme();
    this.onThemeChange?.();
    this.persistCustom();
  }

  /** Update a custom theme's name */
  renameTheme(id: string, newName: string) {
    this.customThemes = this.customThemes.map(t =>
      t.id === id ? { ...t, name: newName } : t
    );
    this.persistCustom();
  }

  /** Update a custom theme's colorScheme */
  setColorScheme(id: string, scheme: 'dark' | 'light') {
    this.customThemes = this.customThemes.map(t =>
      t.id === id ? { ...t, colorScheme: scheme } : t
    );
    if (this.activeId === id) {
      document.documentElement.style.setProperty('color-scheme', scheme);
    }
    this.persistCustom();
  }

  /** Delete a custom theme. If it's active, fall back to Dark. */
  deleteTheme(id: string) {
    this.customThemes = this.customThemes.filter(t => t.id !== id);
    this.persistCustom();
    if (this.activeId === id) {
      this.activate(DEFAULT_THEME_ID);
    }
  }

  /** Export a theme as a JSON string */
  exportTheme(id: string): string {
    const theme = this.allThemes.find(t => t.id === id);
    if (!theme) return '';
    return JSON.stringify({
      name: theme.name,
      colorScheme: theme.colorScheme,
      vars: theme.vars,
    }, null, 2);
  }

  /** Import a theme from a JSON string. Returns the new theme id, or null on failure. */
  importTheme(json: string): string | null {
    try {
      const data = JSON.parse(json);
      if (!data.name || !data.vars) return null;

      const id = 'custom:' + crypto.randomUUID();
      const theme: ThemeDef = {
        id,
        name: data.name,
        builtin: false,
        colorScheme: data.colorScheme === 'light' ? 'light' : 'dark',
        vars: { ...BUILTIN_THEMES[0].vars, ...data.vars },
      };
      this.customThemes = [...this.customThemes, theme];
      this.persistCustom();
      return id;
    } catch {
      return null;
    }
  }

  private persistCustom() {
    try {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(this.customThemes));
    } catch { /* localStorage full */ }
  }
}

export const themeStore = new ThemeStore();
