import type { Satellite, SelectedSatInfo } from '../types';
import type { SatellitePass } from '../passes/pass-types';
import { ViewMode } from '../types';
import { MOBILE_BREAKPOINT } from '../constants';

export class SceneLabel {
  visible = $state(false);
  text = $state('');
  el = $state<HTMLDivElement | null>(null);
  drawPos: { x: number; y: number; z: number } | null = null;
  readonly color: string;
  readonly fontSize: number;
  readonly centered: boolean;

  constructor(color: string, fontSize = 12, centered = false) {
    this.color = color;
    this.fontSize = fontSize;
    this.centered = centered;
  }

  show(text: string, sx: number, sy: number, rotDeg?: number) {
    this.text = text;
    this.visible = true;
    if (this.el) {
      this.el.dataset.sx = String(sx);
      this.el.dataset.sy = String(sy);
      const extra = (this.centered ? ' translate(-50%, -50%)' : '')
                   + (rotDeg != null ? ` rotate(${rotDeg}deg)` : '');
      this.el.dataset.transformExtra = extra;
      this.el.style.transform = `translate(${sx}px,${sy}px)${extra}`;
    }
  }

  hide() {
    this.visible = false;
  }
}

class UIStore {
  // Satellite state
  hoveredSat = $state<Satellite | null>(null);
  fpsDisplay = $state(0);
  fpsColor = $state('#00ff00');
  satCount = $state(0);
  satStatusExtra = $state('');
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
  showSkyGrid = $state(true);
  radarVfx = $state(false);

  // Marker group visibility (keyed by group id)
  markerVisibility = $state<Record<string, boolean>>({});

  // Sky reticle (projected beam position for HUD overlay)
  skyReticle = $state<{ x: number; y: number; radius: number; visible: boolean }>({ x: 0, y: 0, radius: 0, visible: false });

  // Camera lock
  lockTarget = $state<string>('Earth');

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
  selectionWindowFocus = $state(0);
  lastAddedSatNoradId = $state<number | null>(null);
  singleSelectMode = $state(false);
  selectedSatData = $state<SelectedSatInfo[]>([]);
  hiddenSelectedSats = $state(new Set<number>());
  hiddenSelectedSatsVersion = $state(0);

  toggleSatVisibility(noradId: number) {
    const next = new Set(this.hiddenSelectedSats);
    if (next.has(noradId)) next.delete(noradId);
    else next.add(noradId);
    this.hiddenSelectedSats = next;
    this.hiddenSelectedSatsVersion++;
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
  /** True when passes UI is visible (desktop window or mobile sheet). */
  get passesVisible(): boolean {
    return this._passesWindowOpen || this.activeMobileSheet === 'passes';
  }

  polarPlotOpen = $state(false);
  radarOpen = $state(false);
  dopplerWindowOpen = $state(false);
  dopplerWindowFocus = $state(0);
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
  passFreqMinMHz = $state(0);   // 0 = no filter
  passFreqMaxMHz = $state(0);   // 0 = no filter
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

  // Scene labels (apsis, pass markers, range)
  labels = {
    peri:  new SceneLabel('var(--apsis-peri)'),
    apo:   new SceneLabel('var(--apsis-apo)'),
    aos:   new SceneLabel('var(--marker-aos)'),
    los:   new SceneLabel('var(--marker-los)'),
    tca:   new SceneLabel('var(--marker-tca)'),
    range: new SceneLabel('var(--marker-range)', 11, true),
  };

  // DOM refs — set by components, read by App for direct positioning
  satInfoEl: HTMLDivElement | null = null;
  planetCanvasEl: HTMLCanvasElement | null = null;

  // Data sources window
  dataSourcesOpen = $state(false);

  // Theme editor
  themeEditorOpen = $state(false);

  // SatNOGS database window
  satDatabaseOpen = $state(false);
  satDatabaseNoradId = $state<number | null>(null);

  // Doppler frequency prefill (set by SatDatabaseWindow, consumed by DopplerWindow)
  dopplerPrefillHz = $state(0);

  // Radar — packed [az, el, satIndex, flags] per blip, written by app.ts
  radarBlips = new Float32Array(25000 * 4);
  radarBlipCount = $state(0);

  // Earth-specific toggles visibility (hidden in orrery/planet mode)
  earthTogglesVisible = $state(true);
  // Satellite + observer toggles (visible in both 3D and sky view)
  satTogglesVisible = $state(true);
  nightToggleVisible = $state(true);

  // Mobile
  isMobile = $state(false);
  activeMobileSheet = $state<string | null>(null);
  private _mobileSheetStack: string[] = [];
  /** When true, sheet transitions should be instant (sheet-to-sheet swap) */
  skipSheetTransition = $state(false);

  updateMobileState() {
    this.isMobile = window.innerWidth < MOBILE_BREAKPOINT;
    if (!this.isMobile) { this.activeMobileSheet = null; this._mobileSheetStack = []; }
  }

  /** Nav tabs use this — clears stack, toggles sheet */
  switchMobileSheet(id: string) {
    const isSwap = this.activeMobileSheet !== null && this.activeMobileSheet !== id;
    this.skipSheetTransition = isSwap;
    this._mobileSheetStack = [];
    this.activeMobileSheet = this.activeMobileSheet === id ? null : id;
  }

  /** Programmatic opens — preserves stack for back navigation */
  openMobileSheet(id: string) {
    this.skipSheetTransition = this.activeMobileSheet !== null;
    if (this.activeMobileSheet && this.activeMobileSheet !== id) {
      this._mobileSheetStack.push(this.activeMobileSheet);
    }
    this.activeMobileSheet = id;
  }

  /** Whether closing the current sheet will navigate back (vs fully close) */
  get canGoBack() { return this._mobileSheetStack.length > 0; }

  /** Close/swipe-dismiss — pops stack (returns to previous sheet) */
  closeMobileSheet() {
    this.skipSheetTransition = this._mobileSheetStack.length > 0;
    this.activeMobileSheet = this._mobileSheetStack.pop() ?? null;
  }

  // Callbacks registered by App
  onToggleChange: ((key: string, value: boolean) => void) | null = null;
  onMarkerGroupChange: ((groupId: string, visible: boolean) => void) | null = null;
  onPlanetButtonClick: (() => void) | null = null;
  onNavigateTo: ((id: string) => void) | null = null;
  onDeselectAll: (() => void) | null = null;
  onDeselectSatellite: ((noradId: number) => void) | null = null;
  onToggleViewMode: (() => void) | null = null;
  onToggleSkyView: (() => void) | null = null;
  getSatelliteList: (() => { noradId: number; name: string }[]) | null = null;
  getSatelliteByIndex: ((index: number) => { name: string; noradId: number } | null) | null = null;
  getSelectedSatelliteList: (() => { noradId: number; name: string }[]) | null = null;
  onSelectSatellite: ((noradId: number) => void) | null = null;
  onLockCameraToSat: ((noradId: number) => void) | null = null;
  onRefreshTLE: (() => void) | null = null;
  onRequestPasses: (() => void) | null = null;
  onRequestNearbyPasses: (() => void) | null = null;
  onSelectSatFromNearbyPass: ((noradId: number) => void) | null = null;
  getSatTLE: ((noradId: number) => { line1?: string; line2?: string; omm?: Record<string, unknown> } | null) | null = null;
  onFiltersChanged: (() => void) | null = null;
  onFilterInteractionEnd: (() => void) | null = null;

  loadToggles() {
    const load = (key: string, defaultVal: boolean): boolean => {
      const saved = localStorage.getItem(key);
      return saved !== null ? (defaultVal ? saved !== 'false' : saved === 'true') : defaultVal;
    };
    this.hideUnselected = load('satvisor_spotlight', false);
    this.showOrbits = load('satvisor_orbits', false);
    this.showClouds = load('satvisor_clouds', true);
    this.showNightLights = load('satvisor_night', true);
    this.showSkybox = load('satvisor_skybox', true);
    this.showCountries = load('satvisor_countries', false);
    this.showGrid = load('satvisor_grid', false);
    this.showSkyGrid = load('satvisor_skygrid', true);
    this.radarVfx = load('satvisor_radar_vfx', false);
    this.singleSelectMode = load('satvisor_single_select', this.isMobile);
    const savedTab = localStorage.getItem('satvisor_passes_tab');
    if (savedTab === 'selected' || savedTab === 'nearby') this.passesTab = savedTab;
  }

  setSingleSelectMode(value: boolean) {
    this.singleSelectMode = value;
    localStorage.setItem('satvisor_single_select', String(value));
  }

  setPassesTab(tab: 'selected' | 'nearby') {
    this.passesTab = tab;
    localStorage.setItem('satvisor_passes_tab', tab);
  }

  /** Initialize marker group visibility from config defaults + localStorage */
  loadMarkerGroups(groups: { id: string; defaultVisible: boolean }[]) {
    const vis: Record<string, boolean> = {};
    for (const g of groups) {
      const saved = localStorage.getItem(`satvisor_markers_${g.id}`);
      vis[g.id] = saved !== null ? saved === 'true' : g.defaultVisible;
    }
    this.markerVisibility = vis;
  }

  setMarkerGroupVisible(groupId: string, visible: boolean) {
    this.markerVisibility = { ...this.markerVisibility, [groupId]: visible };
    localStorage.setItem(`satvisor_markers_${groupId}`, String(visible));
    this.onMarkerGroupChange?.(groupId, visible);
  }

  loadPassFilters() {
    const num = (key: string, def: number): number => {
      const v = localStorage.getItem(key);
      return v !== null ? Number(v) : def;
    };
    this.passMinEl = num('satvisor_pass_min_el', 0);
    this.passMaxEl = num('satvisor_pass_max_el', 90);
    this.passAzFrom = num('satvisor_pass_az_from', 0);
    this.passAzTo = num('satvisor_pass_az_to', 360);
    this.passMinDuration = num('satvisor_pass_min_dur', 0);
    const vis = localStorage.getItem('satvisor_pass_visibility');
    if (vis === 'observable' || vis === 'visible') this.passVisibility = vis;
    this.passFreqMinMHz = num('satvisor_pass_freq_min_mhz', 0);
    this.passFreqMaxMHz = num('satvisor_pass_freq_max_mhz', 0);
    const mask = localStorage.getItem('satvisor_pass_horizon_mask');
    if (mask) {
      try { this.passHorizonMask = JSON.parse(mask); } catch { /* use default */ }
    }
  }

  savePassFilter(key: string, value: string | number) {
    localStorage.setItem(`satvisor_pass_${key}`, String(value));
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

  setPassFreqRange(minMHz: number, maxMHz: number) {
    if (minMHz === this.passFreqMinMHz && maxMHz === this.passFreqMaxMHz) return;
    this.passFreqMinMHz = minMHz;
    this.passFreqMaxMHz = maxMHz;
    this.savePassFilter('freq_min_mhz', minMHz);
    this.savePassFilter('freq_max_mhz', maxMHz);
    this.onFiltersChanged?.();
  }

  setPassHorizonMask(mask: { az: number; minEl: number }[]) {
    const same = mask.length === this.passHorizonMask.length &&
      mask.every((m, i) => m.az === this.passHorizonMask[i].az && m.minEl === this.passHorizonMask[i].minEl);
    if (same) return;
    this.passHorizonMask = mask;
    localStorage.setItem('satvisor_pass_horizon_mask', JSON.stringify(mask));
    this.onFiltersChanged?.();
  }

  get hasActivePassFilters(): boolean {
    return this.passMinEl > 0 || this.passMaxEl < 90 ||
      this.passAzFrom !== 0 || this.passAzTo !== 360 ||
      this.passVisibility !== 'all' || this.passMinDuration > 0 ||
      this.passHiddenSats.size > 0 || this.passHorizonMask.length > 0 ||
      this.passFreqMinMHz > 0 || this.passFreqMaxMHz > 0;
  }

  resetPassFilters() {
    this.passMinEl = 0; this.passMaxEl = 90;
    this.passAzFrom = 0; this.passAzTo = 360;
    this.passVisibility = 'all';
    this.passMinDuration = 0;
    this.passHiddenSats = new Set();
    this.passHorizonMask = [];
    this.passFreqMinMHz = 0; this.passFreqMaxMHz = 0;
    for (const k of ['min_el', 'max_el', 'az_from', 'az_to', 'visibility', 'min_dur', 'horizon_mask', 'freq_min_mhz', 'freq_max_mhz']) {
      localStorage.removeItem(`satvisor_pass_${k}`);
    }
    this.onFiltersChanged?.();
  }

  setToggle(key: string, value: boolean) {
    switch (key) {
      case 'hideUnselected': this.hideUnselected = value; localStorage.setItem('satvisor_spotlight', String(value)); break;
      case 'showOrbits': this.showOrbits = value; localStorage.setItem('satvisor_orbits', String(value)); break;
      case 'showClouds': this.showClouds = value; localStorage.setItem('satvisor_clouds', String(value)); break;
      case 'showNightLights': this.showNightLights = value; localStorage.setItem('satvisor_night', String(value)); break;
      case 'showSkybox': this.showSkybox = value; localStorage.setItem('satvisor_skybox', String(value)); break;
      case 'showCountries': this.showCountries = value; localStorage.setItem('satvisor_countries', String(value)); break;
      case 'showGrid': this.showGrid = value; localStorage.setItem('satvisor_grid', String(value)); break;
      case 'showSkyGrid': this.showSkyGrid = value; localStorage.setItem('satvisor_skygrid', String(value)); break;
      case 'radarVfx': this.radarVfx = value; localStorage.setItem('satvisor_radar_vfx', String(value)); break;
      case 'radarOpen': this.radarOpen = value; break; // persisted by DraggableWindow
    }
    this.onToggleChange?.(key, value);
  }
}

export const uiStore = new UIStore();
