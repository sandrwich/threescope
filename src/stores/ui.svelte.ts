import type { Satellite } from '../types';
import { ViewMode } from '../types';

class UIStore {
  // Satellite state
  hoveredSat = $state<Satellite | null>(null);
  selectedSat = $state<Satellite | null>(null);
  fpsDisplay = $state(0);
  fpsColor = $state('#00ff00');
  satStatusText = $state('');

  // View
  viewMode = $state(ViewMode.VIEW_3D);
  orreryMode = $state(false);
  activePlanetId = $state<string | null>(null);

  // Toggles (persisted via localStorage)
  hideUnselected = $state(true);
  showClouds = $state(true);
  showNightLights = $state(true);
  showMarkers = $state(false);

  // Window/modal visibility
  infoModalOpen = $state(false);
  settingsOpen = $state(false);
  timeWindowOpen = $state(true);

  // Sat info tooltip — content set via store, position set via direct DOM
  satInfoVisible = $state(false);
  satInfoName = $state('');
  satInfoDetail = $state('');
  satInfoNameColor = $state('#00ff00');

  // Apsis labels
  periVisible = $state(false);
  periText = $state('');
  apoVisible = $state(false);
  apoText = $state('');

  // DOM refs — set by components, read by App for direct positioning
  satInfoEl: HTMLDivElement | null = null;
  periLabelEl: HTMLDivElement | null = null;
  apoLabelEl: HTMLDivElement | null = null;
  planetCanvasEl: HTMLCanvasElement | null = null;

  // Earth-specific toggles visibility (hidden in orrery/planet mode)
  earthTogglesVisible = $state(true);
  nightToggleVisible = $state(true);

  // Callbacks registered by App
  onToggleChange: ((key: string, value: boolean) => void) | null = null;
  onTLEGroupChange: ((group: string) => Promise<void>) | null = null;
  onCustomTLELoad: ((text: string, name: string) => void) | null = null;
  onCustomTLEUrl: ((url: string) => Promise<void>) | null = null;
  onPlanetButtonClick: (() => void) | null = null;

  loadToggles() {
    const load = (key: string, defaultVal: boolean): boolean => {
      const saved = localStorage.getItem(key);
      return saved !== null ? (defaultVal ? saved !== 'false' : saved === 'true') : defaultVal;
    };
    this.hideUnselected = load('threescope_spotlight', true);
    this.showClouds = load('threescope_clouds', true);
    this.showNightLights = load('threescope_night', true);
    this.showMarkers = load('threescope_markers', false);
  }

  setToggle(key: string, value: boolean) {
    switch (key) {
      case 'hideUnselected': this.hideUnselected = value; localStorage.setItem('threescope_spotlight', String(value)); break;
      case 'showClouds': this.showClouds = value; localStorage.setItem('threescope_clouds', String(value)); break;
      case 'showNightLights': this.showNightLights = value; localStorage.setItem('threescope_night', String(value)); break;
      case 'showMarkers': this.showMarkers = value; localStorage.setItem('threescope_markers', String(value)); break;
    }
    this.onToggleChange?.(key, value);
  }
}

export const uiStore = new UIStore();
