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
  observerWindowOpen = $state(false);
  timeWindowOpen = $state(true);
  viewWindowOpen = $state(true);
  commandPaletteOpen = $state(false);
  commandPaletteSatMode = $state(false);

  // Selection window
  selectionWindowOpen = $state(true);
  selectedSatData = $state<SelectedSatInfo[]>([]);
  hiddenSelectedSats = $state(new Set<number>());

  toggleSatVisibility(noradId: number) {
    const next = new Set(this.hiddenSelectedSats);
    if (next.has(noradId)) next.delete(noradId);
    else next.add(noradId);
    this.hiddenSelectedSats = next;
  }

  // Pass predictor
  selectedSatCount = $state(0);
  private _passesWindowOpen = $state(false);
  private _filterWasOpen = false;
  get passesWindowOpen() { return this._passesWindowOpen; }
  set passesWindowOpen(v: boolean) {
    this._passesWindowOpen = v;
    if (!v) {
      this._filterWasOpen = this.passFilterWindowOpen;
      this.passFilterWindowOpen = false;
    } else if (this._filterWasOpen) {
      this.passFilterWindowOpen = true;
    }
  }
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
  nearbyPhase = $state<'idle' | 'computing' | 'done'>('idle');
  // Computation timing (ms)
  passesComputeTime = $state(0);
  nearbyComputeTime = $state(0);
  nearbyFilteredCount = $state(0);
  nearbyTotalCount = $state(0);
  passListEpoch = $state(0);

  // Pass filters (persisted to localStorage)
  passMinEl = $state(0);         // degrees, sent to worker on change
  passMaxEl = $state(90);        // degrees, client-side
  passAzFrom = $state(0);       // degrees 0-360, supports wrap-around
  passAzTo = $state(360);       // degrees 0-360
  passVisibility = $state<'all' | 'observable' | 'visible'>('all');
  passMinDuration = $state(0);  // seconds within observable window
  passHiddenSats = $state(new Set<number>());
  // Horizon mask: min elevation at 8 azimuths (N/NE/E/SE/S/SW/W/NW)
  passHorizonMask = $state<{ az: number; minEl: number }[]>([]);
  passFilterWindowOpen = $state(false);
  passFilterInteracting = $state(false); // true while pointer held on filter controls

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

  // Theme editor
  themeEditorOpen = $state(false);

  // Earth-specific toggles visibility (hidden in orrery/planet mode)
  earthTogglesVisible = $state(true);
  nightToggleVisible = $state(true);

  // Callbacks registered by App
  onToggleChange: ((key: string, value: boolean) => void) | null = null;
  onMarkerGroupChange: ((groupId: string, visible: boolean) => void) | null = null;
  onPlanetButtonClick: (() => void) | null = null;
  onNavigateTo: ((id: string) => void) | null = null;
  onDeselectAll: (() => void) | null = null;
  onDeselectSatellite: ((noradId: number) => void) | null = null;
  onToggleViewMode: (() => void) | null = null;
  getSatelliteList: (() => { noradId: number; name: string }[]) | null = null;
  getSelectedSatelliteList: (() => { noradId: number; name: string }[]) | null = null;
  onSelectSatellite: ((noradId: number) => void) | null = null;
  onRefreshTLE: (() => void) | null = null;
  onRequestPasses: (() => void) | null = null;
  onRequestNearbyPasses: (() => void) | null = null;
  onSelectSatFromNearbyPass: ((noradId: number) => void) | null = null;
  getSatTLE: ((noradId: number) => { line1: string; line2: string } | null) | null = null;
  onFiltersChanged: (() => void) | null = null;
  onFilterInteractionEnd: (() => void) | null = null;

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

  loadPassFilters() {
    const num = (key: string, def: number): number => {
      const v = localStorage.getItem(key);
      return v !== null ? Number(v) : def;
    };
    this.passMinEl = num('threescope_pass_min_el', 0);
    this.passMaxEl = num('threescope_pass_max_el', 90);
    this.passAzFrom = num('threescope_pass_az_from', 0);
    this.passAzTo = num('threescope_pass_az_to', 360);
    this.passMinDuration = num('threescope_pass_min_dur', 0);
    const vis = localStorage.getItem('threescope_pass_visibility');
    if (vis === 'observable' || vis === 'visible') this.passVisibility = vis;
    const mask = localStorage.getItem('threescope_pass_horizon_mask');
    if (mask) {
      try { this.passHorizonMask = JSON.parse(mask); } catch { /* use default */ }
    }
  }

  savePassFilter(key: string, value: string | number) {
    localStorage.setItem(`threescope_pass_${key}`, String(value));
  }

  setPassMinEl(v: number) {
    if (v === this.passMinEl) return;
    this.passMinEl = v;
    this.savePassFilter('min_el', v);
    this.onFiltersChanged?.();
  }

  setPassMaxEl(v: number) {
    if (v === this.passMaxEl) return;
    this.passMaxEl = v;
    this.savePassFilter('max_el', v);
    this.onFiltersChanged?.();
  }

  setPassAzRange(from: number, to: number) {
    if (from === this.passAzFrom && to === this.passAzTo) return;
    this.passAzFrom = from;
    this.passAzTo = to;
    this.savePassFilter('az_from', from);
    this.savePassFilter('az_to', to);
    this.onFiltersChanged?.();
  }

  setPassVisibility(v: 'all' | 'observable' | 'visible') {
    if (v === this.passVisibility) return;
    this.passVisibility = v;
    this.savePassFilter('visibility', v);
    this.onFiltersChanged?.();
  }

  setPassMinDuration(v: number) {
    if (v === this.passMinDuration) return;
    this.passMinDuration = v;
    this.savePassFilter('min_dur', v);
    this.onFiltersChanged?.();
  }

  setPassHorizonMask(mask: { az: number; minEl: number }[]) {
    const same = mask.length === this.passHorizonMask.length &&
      mask.every((m, i) => m.az === this.passHorizonMask[i].az && m.minEl === this.passHorizonMask[i].minEl);
    if (same) return;
    this.passHorizonMask = mask;
    localStorage.setItem('threescope_pass_horizon_mask', JSON.stringify(mask));
    this.onFiltersChanged?.();
  }

  get hasActivePassFilters(): boolean {
    return this.passMinEl > 0 || this.passMaxEl < 90 ||
      this.passAzFrom !== 0 || this.passAzTo !== 360 ||
      this.passVisibility !== 'all' || this.passMinDuration > 0 ||
      this.passHiddenSats.size > 0 || this.passHorizonMask.length > 0;
  }

  resetPassFilters() {
    this.passMinEl = 0; this.passMaxEl = 90;
    this.passAzFrom = 0; this.passAzTo = 360;
    this.passVisibility = 'all';
    this.passMinDuration = 0;
    this.passHiddenSats = new Set();
    this.passHorizonMask = [];
    for (const k of ['min_el', 'max_el', 'az_from', 'az_to', 'visibility', 'min_dur', 'horizon_mask']) {
      localStorage.removeItem(`threescope_pass_${k}`);
    }
    this.onFiltersChanged?.();
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
