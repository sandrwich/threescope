import type { Satellite, SelectedSatInfo } from '../types';
import type { SatellitePass } from '../passes/pass-types';
import { ViewMode } from '../types';

class UIStore {
  // Satellite state
  hoveredSat = $state<Satellite | null>(null);
  fpsDisplay = $state(0);
  fpsColor = $state('#00ff00');
  satStatusText = $state('');
  tleLoadState = $state<'fresh' | 'cached' | 'stale' | 'failed' | 'none'>('none');
  cursorLatLon = $state<{ lat: number; lon: number } | null>(null);

  // View
  viewMode = $state(ViewMode.VIEW_3D);
  orreryMode = $state(false);
  activePlanetId = $state<string | null>(null);

  // Toggles (persisted via localStorage)
  hideUnselected = $state(true);
  showOrbits = $state(true);
  showClouds = $state(true);
  showNightLights = $state(true);
  showSkybox = $state(true);
  showCountries = $state(false);
  showGrid = $state(false);

  // Marker group visibility (keyed by group id)
  markerVisibility = $state<Record<string, boolean>>({});

  // Window/modal visibility
  infoModalOpen = $state(false);
  settingsOpen = $state(false);
  timeWindowOpen = $state(true);
  viewWindowOpen = $state(true);
  commandPaletteOpen = $state(false);
  commandPaletteSatMode = $state(false);

  // Selection window
  selectionWindowOpen = $state(true);
  selectedSatData = $state<SelectedSatInfo[]>([]);

  // Pass predictor
  selectedSatCount = $state(0);
  passesWindowOpen = $state(false);
  polarPlotOpen = $state(false);
  dopplerWindowOpen = $state(false);
  passes = $state<SatellitePass[]>([]);
  passesComputing = $state(false);
  passesProgress = $state(0);
  selectedPassIdx = $state(-1);
  livePassAzEl = $state<{ az: number; el: number } | null>(null);

  // Nearby passes tab
  passesTab = $state<'selected' | 'nearby'>('selected');
  nearbyPasses = $state<SatellitePass[]>([]);
  nearbyComputing = $state(false);
  nearbyProgress = $state(0);
  nearbyPhase = $state<'idle' | 'quick' | 'full' | 'done'>('idle');
  nearbyFilteredCount = $state(0);
  nearbyTotalCount = $state(0);

  get activePassList(): SatellitePass[] {
    return this.passesTab === 'selected' ? this.passes : this.nearbyPasses;
  }

  // Hover tooltip — content set via store, position set via direct DOM
  satInfoVisible = $state(false);
  satInfoName = $state('');
  satInfoDetail = $state('');
  satInfoNameColor = $state('#ffff00');
  satInfoHint = $state('');

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

  // Data sources window
  dataSourcesOpen = $state(false);

  // Earth-specific toggles visibility (hidden in orrery/planet mode)
  earthTogglesVisible = $state(true);
  nightToggleVisible = $state(true);

  // Callbacks registered by App
  onToggleChange: ((key: string, value: boolean) => void) | null = null;
  onMarkerGroupChange: ((groupId: string, visible: boolean) => void) | null = null;
  onPlanetButtonClick: (() => void) | null = null;
  onNavigateTo: ((id: string) => void) | null = null;
  onDeselectAll: (() => void) | null = null;
  onDeselectSatelliteByName: ((name: string) => void) | null = null;
  onToggleViewMode: (() => void) | null = null;
  getSatelliteNames: (() => string[]) | null = null;
  getSelectedSatelliteNames: (() => string[]) | null = null;
  onSelectSatelliteByName: ((name: string) => void) | null = null;
  onRefreshTLE: (() => void) | null = null;
  onRequestPasses: (() => void) | null = null;
  onRequestNearbyPasses: (() => void) | null = null;
  onSelectSatFromNearbyPass: ((name: string) => void) | null = null;
  getSatTLE: ((name: string) => { line1: string; line2: string } | null) | null = null;

  loadToggles() {
    const load = (key: string, defaultVal: boolean): boolean => {
      const saved = localStorage.getItem(key);
      return saved !== null ? (defaultVal ? saved !== 'false' : saved === 'true') : defaultVal;
    };
    this.hideUnselected = load('threescope_spotlight', false);
    this.showOrbits = load('threescope_orbits', false);
    this.showClouds = load('threescope_clouds', true);
    this.showNightLights = load('threescope_night', true);
    this.showSkybox = load('threescope_skybox', true);
    this.showCountries = load('threescope_countries', false);
    this.showGrid = load('threescope_grid', false);
  }

  /** Initialize marker group visibility from config defaults + localStorage */
  loadMarkerGroups(groups: { id: string; defaultVisible: boolean }[]) {
    const vis: Record<string, boolean> = {};
    for (const g of groups) {
      const saved = localStorage.getItem(`threescope_markers_${g.id}`);
      vis[g.id] = saved !== null ? saved === 'true' : g.defaultVisible;
    }
    this.markerVisibility = vis;
  }

  setMarkerGroupVisible(groupId: string, visible: boolean) {
    this.markerVisibility = { ...this.markerVisibility, [groupId]: visible };
    localStorage.setItem(`threescope_markers_${groupId}`, String(visible));
    this.onMarkerGroupChange?.(groupId, visible);
  }

  setToggle(key: string, value: boolean) {
    switch (key) {
      case 'hideUnselected': this.hideUnselected = value; localStorage.setItem('threescope_spotlight', String(value)); break;
      case 'showOrbits': this.showOrbits = value; localStorage.setItem('threescope_orbits', String(value)); break;
      case 'showClouds': this.showClouds = value; localStorage.setItem('threescope_clouds', String(value)); break;
      case 'showNightLights': this.showNightLights = value; localStorage.setItem('threescope_night', String(value)); break;
      case 'showSkybox': this.showSkybox = value; localStorage.setItem('threescope_skybox', String(value)); break;
      case 'showCountries': this.showCountries = value; localStorage.setItem('threescope_countries', String(value)); break;
      case 'showGrid': this.showGrid = value; localStorage.setItem('threescope_grid', String(value)); break;
    }
    this.onToggleChange?.(key, value);
  }
}

export const uiStore = new UIStore();
