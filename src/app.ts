import * as THREE from 'three';
import type { Satellite } from './types';
import { TargetLock, ViewMode } from './types';
import { defaultConfig } from './config';
import { DRAW_SCALE, EARTH_RADIUS_KM, MOON_RADIUS_KM, DEG2RAD, RAD2DEG, MAP_W, MAP_H } from './constants';
import { TimeSystem } from './simulation/time-system';
import { Earth } from './scene/earth';
import { CloudLayer } from './scene/cloud-layer';
import { MoonScene } from './scene/moon-scene';
import { SunScene } from './scene/sun-scene';
import { SatelliteManager } from './scene/satellite-manager';
import { OrbitRenderer, ORBIT_COLORS } from './scene/orbit-renderer';
import { FootprintRenderer, type FootprintEntry } from './scene/footprint-renderer';
import { MarkerManager, createDiamondTexture } from './scene/marker-manager';
import { PostProcessing } from './scene/post-processing';
import { getMinZoom, BODIES, PLANETS, type PlanetDef } from './bodies';
import { type GraphicsSettings, DEFAULT_PRESET, getPresetSettings } from './graphics';
import { type SimulationSettings, DEFAULT_SIM_PRESET, getSimPresetSettings } from './simulation';
import { Atmosphere } from './scene/atmosphere';
import { MapRenderer } from './scene/map-renderer';
import { CameraController } from './interaction/camera-controller';
import { InputHandler } from './interaction/input-handler';
import { OrreryController } from './scene/orrery-controller';
import { getMapCoordinates, latLonToSurface } from './astro/coordinates';
import { calculateSunPosition } from './astro/sun';
import { fetchTLEData, parseTLEText } from './data/tle-loader';
import { sourcesStore, type TLESourceConfig } from './stores/sources.svelte';
import { timeStore } from './stores/time.svelte';
import { uiStore } from './stores/ui.svelte';
import { settingsStore } from './stores/settings.svelte';
import { observerStore } from './stores/observer.svelte';
import { themeStore } from './stores/theme.svelte';
import { UIUpdater } from './ui/ui-updater';
import { GeoOverlay } from './scene/geo-overlay';
import { PassPredictor } from './passes/pass-predictor';
import { getAzEl } from './astro/az-el';
import { propagate } from 'satellite.js';
import { epochToUnix, epochToGmst } from './astro/epoch';
import { loadElevation, getElevation, isElevationLoaded } from './astro/elevation';
import { palette } from './ui/shared/theme';

function formatAge(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export class App {
  private renderer!: THREE.WebGLRenderer;
  private scene3d!: THREE.Scene;
  private camera3d!: THREE.PerspectiveCamera;
  private scene2d!: THREE.Scene;
  private camera2d!: THREE.OrthographicCamera;

  private timeSystem = new TimeSystem();
  private earth!: Earth;
  private cloudLayer!: CloudLayer;
  private moonScene!: MoonScene;
  private sunScene!: SunScene;
  private satManager!: SatelliteManager;
  private orbitRenderer!: OrbitRenderer;
  private footprintRenderer!: FootprintRenderer;
  private markerManager!: MarkerManager;
  private postProcessing!: PostProcessing;
  private atmosphere!: Atmosphere;
  private gfx: GraphicsSettings = getPresetSettings(DEFAULT_PRESET);
  private sim: SimulationSettings = getSimPresetSettings(DEFAULT_SIM_PRESET);
  private bloomEnabled = true;
  private atmosphereGlowEnabled = true;
  private lastSphereDetail = 0;
  private starTex!: THREE.Texture;

  private orreryCtrl!: OrreryController;

  private satellites: Satellite[] = [];
  private satByNorad = new Map<number, Satellite>();
  private hoveredSat: Satellite | null = null;
  private selectedSats = new Set<Satellite>();
  private selectedSatsVersion = 0;
  private activeLock = TargetLock.EARTH;
  private viewMode = ViewMode.VIEW_3D;
  private hideUnselected = false;
  private unselectedFade = 1.0;
  private fadingInSats = new Set<Satellite>();
  private prevSelectedSats = new Set<Satellite>();
  private cfg = { ...defaultConfig };
  private passPredictor = new PassPredictor();
  private nearbyPredictor = new PassPredictor();
  private lastPassSatsVersion = -1;
  private overlayEl!: HTMLElement;

  // Reusable temp objects (avoid per-frame allocations)
  private raycaster = new THREE.Raycaster();
  private tmpVec3 = new THREE.Vector3();
  private tmpSphere = new THREE.Sphere();

  // Camera state (3D orbital + 2D orthographic)
  private camera!: CameraController;

  // 2D map renderer
  private mapRenderer!: MapRenderer;
  // 3D apsis sprites
  private periSprite3d!: THREE.Sprite;
  private apoSprite3d!: THREE.Sprite;

  // Input handler (mouse/touch/keyboard events)
  private input!: InputHandler;

  // Geographic overlays (country outlines + lat/lon grid)
  private geoOverlay!: GeoOverlay;

  // UI updater (selection window, hover tooltip, apsis labels)
  private uiUpdater = new UIUpdater();

  // FPS tracking
  private fpsFrames = 0;
  private fpsTime = 0;
  private fpsDisplay = 0;
  private clock = new THREE.Clock();

  // UI elements
  private loadingScreen!: HTMLElement;
  private loadingBar!: HTMLElement;
  private loadingMsg!: HTMLElement;

  async init() {
    this.loadingScreen = document.getElementById('loading-screen')!;
    this.loadingBar = document.getElementById('loading-bar')!;
    this.loadingMsg = document.getElementById('loading-msg')!;

    this.setLoading(0.1, 'Creating renderer...');

    // Renderer — insert canvas before the Svelte UI overlay
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    document.getElementById('svelte-ui')!.before(this.renderer.domElement);

    // Cameras
    this.camera3d = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 10000);
    this.scene3d = new THREE.Scene();
    this.scene3d.background = new THREE.Color(palette.bg);

    // Post-processing (bloom + tone mapping)
    this.postProcessing = new PostProcessing(this.renderer, this.scene3d, this.camera3d);
    this.postProcessing.setPixelRatio(window.devicePixelRatio);

    const aspect = window.innerWidth / window.innerHeight;
    const halfH = MAP_H / 2;
    const halfW = halfH * aspect;
    this.camera2d = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, -10, 10);
    this.camera2d.position.set(0, 0, 5);
    this.camera2d.lookAt(0, 0, 0);
    this.camera = new CameraController(this.camera3d, this.camera2d);
    this.scene2d = new THREE.Scene();
    this.scene2d.background = new THREE.Color(palette.bg);

    this.setLoading(0.2, 'Loading textures...');
    await this.loadTextures();

    // Orrery controller (after scene + camera + textures are ready)
    this.orreryCtrl = new OrreryController(this.scene3d, this.camera3d, this.camera, {
      setEarthVisible: (v) => this.setEarthVisible(v),
      clearSatSelection: () => { this.selectedSats.clear(); this.selectedSatsVersion++; this.hoveredSat = null; },
      setViewMode3D: () => { this.viewMode = ViewMode.VIEW_3D; uiStore.viewMode = ViewMode.VIEW_3D; },
      setActiveLock: (lock) => { this.activeLock = lock; },
      onMoonClicked: () => {
        this.activeLock = TargetLock.MOON;
        this.camera.snapTarget3d(this.moonScene.drawPos);
        this.camera.snapDistance(3.0);
      },
    });

    sourcesStore.load();
    this.setLoading(0.6, 'Fetching satellite data...');
    await this.loadSources();

    this.setLoading(0.9, 'Setting up...');
    this.wireStores();
    this.input = new InputHandler(this.renderer.domElement, this.renderer, this.camera, this.camera3d, this.postProcessing, {
      getViewMode: () => this.viewMode,
      getOrreryMode: () => this.orreryCtrl.isOrreryMode,
      getActiveLock: () => this.activeLock,
      getMinZoom: () => getMinZoom(this.activeLock),
      clearTargetLock: () => { this.activeLock = TargetLock.NONE; },
      onSelect: () => this.handleClick(),
      onDoubleClick3D: () => this.handleDoubleClickLock(),
      onDoubleClick2D: () => { this.activeLock = TargetLock.EARTH; },
      onOrreryClick: () => this.orreryCtrl.handleClick(this.raycaster, this.input.mouseNDC),
      onToggleViewMode: () => {
        if (!this.orreryCtrl.isOrreryMode) {
          this.viewMode = this.viewMode === ViewMode.VIEW_3D ? ViewMode.VIEW_2D : ViewMode.VIEW_3D;
          uiStore.viewMode = this.viewMode;
        }
      },
      onResize: () => {},
      tryStartObserverDrag: () => this.tryStartObserverDrag(),
      onObserverDrag: () => this.handleObserverDrag(),
    });

    this.setLoading(1.0, 'Ready!');
    setTimeout(() => { this.loadingScreen.style.display = 'none'; }, 300);

    this.mcChannel.port1.onmessage = () => this.animate();
    this.clock.start();
    this.animate();
  }

  private setLoading(progress: number, msg: string) {
    this.loadingBar.style.width = `${progress * 100}%`;
    this.loadingMsg.textContent = msg;
  }

  private async loadTextures() {
    const loader = new THREE.TextureLoader();
    const load = (url: string) => new Promise<THREE.Texture>((resolve) => {
      loader.load(url, resolve, undefined, () => resolve(new THREE.Texture()));
    });

    const [dayTex, nightTex, cloudTex, moonTex, satTex, starTex] = await Promise.all([
      load('/textures/earth/color.webp'),
      load('/textures/earth/night.webp'),
      load('/textures/earth/clouds.webp'),
      load('/textures/moon/color.webp'),
      load('/textures/ui/sat_icon.png'),
      load('/textures/stars.webp'),
    ]);

    for (const tex of [dayTex, nightTex, cloudTex, moonTex]) {
      tex.flipY = false;
      tex.colorSpace = THREE.NoColorSpace;
    }

    // Star background (equirectangular -> 3D skybox)
    starTex.mapping = THREE.EquirectangularReflectionMapping;
    starTex.colorSpace = THREE.SRGBColorSpace;
    this.starTex = starTex;
    this.scene3d.background = starTex;

    this.setLoading(0.4, 'Building scene...');

    // Earth
    this.earth = new Earth(dayTex, nightTex);
    this.scene3d.add(this.earth.mesh);

    // Atmosphere (Fresnel rim glow, rendered before clouds)
    this.atmosphere = new Atmosphere();
    this.scene3d.add(this.atmosphere.mesh);

    // Clouds
    this.cloudLayer = new CloudLayer(cloudTex);
    this.scene3d.add(this.cloudLayer.mesh);

    // Moon
    this.moonScene = new MoonScene(moonTex);
    this.scene3d.add(this.moonScene.mesh);

    // Sun
    this.sunScene = new SunScene();
    this.scene3d.add(this.sunScene.disc);

    // Satellites
    this.satManager = new SatelliteManager(satTex);
    this.scene3d.add(this.satManager.points);

    // Orbits + Footprint
    this.orbitRenderer = new OrbitRenderer(this.scene3d);
    this.footprintRenderer = new FootprintRenderer(this.scene3d);

    // Markers
    const overlay = this.overlayEl = document.getElementById('svelte-ui')!;
    this.markerManager = new MarkerManager(this.scene3d, this.cfg.markerGroups, overlay);

    // Geographic overlays (country outlines + lat/lon grid)
    this.geoOverlay = new GeoOverlay(this.scene3d, this.scene2d);
    this.geoOverlay.setCountriesUrl('/data/countries-110m.json');

    this.mapRenderer = new MapRenderer(this.scene2d, {
      dayTex, nightTex, satTex,
      markerGroups: this.cfg.markerGroups,
      overlay,
      cfg: this.cfg,
    });

    // 3D apsis sprites (diamond icons at periapsis/apoapsis)
    const diamondTex = createDiamondTexture();
    const periMat = new THREE.SpriteMaterial({ map: diamondTex, color: 0x87ceeb, depthTest: false, transparent: true, alphaTest: 0.1 });
    this.periSprite3d = new THREE.Sprite(periMat);
    this.periSprite3d.scale.set(0.03, 0.03, 1);
    this.periSprite3d.visible = false;
    this.scene3d.add(this.periSprite3d);

    const apoMat = new THREE.SpriteMaterial({ map: diamondTex, color: 0xffa500, depthTest: false, transparent: true, alphaTest: 0.1 });
    this.apoSprite3d = new THREE.Sprite(apoMat);
    this.apoSprite3d.scale.set(0.03, 0.03, 1);
    this.apoSprite3d.visible = false;
    this.scene3d.add(this.apoSprite3d);
  }

  private sourceData = new Map<string, Satellite[]>();

  async loadSources() {
    const enabled = sourcesStore.enabledSources;
    const enabledIdSet = new Set(enabled.map(s => s.id));

    // Remove cached data for disabled sources
    for (const id of this.sourceData.keys()) {
      if (!enabledIdSet.has(id)) this.sourceData.delete(id);
    }

    if (enabled.length === 0) {
      this.satellites = [];
      this.selectedSats.clear(); this.selectedSatsVersion++;
      this.hoveredSat = null;
      this.orbitRenderer.precomputeOrbits([], this.timeSystem.currentEpoch);
      sourcesStore.totalSats = 0;
      sourcesStore.dupsRemoved = 0;
      uiStore.satStatusText = '0 sats';
      uiStore.tleLoadState = 'none';
      return;
    }

    // Fetch sources not yet loaded
    const toFetch = enabled.filter(s => !this.sourceData.has(s.id));
    if (toFetch.length > 0) {
      sourcesStore.loading = true;
      uiStore.satStatusText = 'Loading...';

      const fetches = toFetch.map(src => this.fetchSource(src));
      await Promise.allSettled(fetches);
      sourcesStore.loading = false;
    }

    this.mergeAndApply(enabledIdSet);
  }

  private async fetchSource(src: TLESourceConfig) {
    sourcesStore.setLoadState(src.id, { satCount: 0, status: 'loading' });
    try {
      let satellites: Satellite[];
      if (src.type === 'celestrak') {
        const result = await fetchTLEData(src.group!);
        satellites = result.satellites;
        const age = result.cacheAge;
        sourcesStore.setLoadState(src.id, { satCount: satellites.length, status: 'loaded', cacheAge: age });
      } else if (src.type === 'url') {
        const resp = await fetch(src.url!);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        satellites = parseTLEText(text);
        try {
          localStorage.setItem('tlescope_tle_custom_' + src.id, JSON.stringify({ ts: Date.now(), data: text }));
        } catch { /* localStorage full */ }
        sourcesStore.setLoadState(src.id, { satCount: satellites.length, status: 'loaded' });
      } else {
        const text = sourcesStore.getCustomText(src.id);
        satellites = parseTLEText(text);
        sourcesStore.setLoadState(src.id, { satCount: satellites.length, status: 'loaded' });
      }
      this.sourceData.set(src.id, satellites);
    } catch (e) {
      console.error(`Failed to load source "${src.name}":`, e);
      sourcesStore.setLoadState(src.id, { satCount: 0, status: 'error', error: String(e) });
    }
  }

  private mergeAndApply(enabledIds: Set<string>) {
    const byNorad = new Map<number, Satellite>();
    let total = 0;

    for (const id of enabledIds) {
      const sats = this.sourceData.get(id) ?? [];
      for (const sat of sats) {
        total++;
        const existing = byNorad.get(sat.noradId);
        if (!existing || sat.epochDays > existing.epochDays) {
          byNorad.set(sat.noradId, sat);
        }
      }
    }

    const deduped = Array.from(byNorad.values());
    const dupsRemoved = total - deduped.length;

    // Preserve selection by NORAD ID
    const oldSelectedNorads = new Set<number>();
    for (const sat of this.selectedSats) {
      oldSelectedNorads.add(sat.noradId);
    }
    this.selectedSats.clear();
    for (const sat of deduped) {
      if (oldSelectedNorads.has(sat.noradId)) {
        this.selectedSats.add(sat);
      }
    }
    this.selectedSatsVersion++;
    this.hoveredSat = null;

    this.satellites = deduped;
    this.satByNorad = byNorad;
    this.orbitRenderer.precomputeOrbits(this.satellites, this.timeSystem.currentEpoch);

    // Invalidate nearby passes when satellite data changes
    uiStore.nearbyPasses = [];
    uiStore.nearbyPhase = 'idle';
    uiStore.nearbyComputing = false;
    this.nearbyPredictor.dispose();
    // Auto-recompute if nearby tab is active
    if (uiStore.passesWindowOpen && uiStore.passesTab === 'nearby') {
      this.requestNearbyPasses();
    }

    sourcesStore.totalSats = deduped.length;
    sourcesStore.dupsRemoved = dupsRemoved;
    let statusText = `${deduped.length} sats`;
    if (dupsRemoved > 0) statusText += ` (${dupsRemoved} dups)`;
    uiStore.satStatusText = statusText;

    // Set load state for StatsPanel refresh button visibility
    // Show refresh button whenever we have CelesTrak sources loaded
    const hasCelestrak = [...enabledIds].some(id => id.startsWith('celestrak:'));
    if (deduped.length === 0) {
      const hasError = [...enabledIds].some(id => sourcesStore.loadStates.get(id)?.status === 'error');
      uiStore.tleLoadState = hasError ? 'failed' : 'none';
    } else {
      uiStore.tleLoadState = hasCelestrak ? 'cached' : 'fresh';
    }
  }


  private setEarthVisible(visible: boolean) {
    this.earth.mesh.visible = visible;
    this.atmosphere.mesh.visible = visible;
    this.cloudLayer.mesh.visible = visible;
    this.moonScene.mesh.visible = visible;
    this.sunScene.setVisible(visible);
    this.satManager.setVisible(visible);
    this.orbitRenderer.clear();
    this.footprintRenderer.clear();
    this.markerManager.hide();
  }

  /** Wire Svelte stores <-> App communication */
  private wireStores() {
    const earthDrawR = EARTH_RADIUS_KM / DRAW_SCALE;

    // --- Load persisted settings from localStorage ---
    themeStore.load();
    themeStore.onThemeChange = () => {
      if (!uiStore.showSkybox) this.scene3d.background = new THREE.Color(palette.bg);
      this.scene2d.background = new THREE.Color(palette.bg);
    };
    settingsStore.load();
    uiStore.loadToggles();
    uiStore.loadPassFilters();
    uiStore.loadMarkerGroups(this.cfg.markerGroups);

    // Apply initial toggle values
    this.hideUnselected = uiStore.hideUnselected;
    this.orbitRenderer.showNormalOrbits = uiStore.showOrbits;
    this.cfg.showClouds = uiStore.showClouds;
    this.cfg.showNightLights = uiStore.showNightLights;
    this.moonScene.setShowNight(uiStore.showNightLights);
    if (!uiStore.showSkybox) this.scene3d.background = new THREE.Color(palette.bg);
    this.geoOverlay.setCountriesVisible(uiStore.showCountries);
    this.geoOverlay.setGridVisible(uiStore.showGrid);

    // Apply initial marker visibility
    for (const g of this.cfg.markerGroups) {
      this.markerManager.setGroupVisible(g.id, uiStore.markerVisibility[g.id] ?? g.defaultVisible);
    }

    // Apply initial graphics
    this.applyGraphics(settingsStore.graphics);

    // Apply initial simulation
    this.applySimulation(settingsStore.simulation);

    // Apply initial FPS limit
    this.fpsLimit = settingsStore.fpsLimit;

    // --- Register callbacks from Svelte -> App ---

    // Toggle changes from Svelte checkboxes
    uiStore.onToggleChange = (key: string, value: boolean) => {
      switch (key) {
        case 'hideUnselected': this.hideUnselected = value; break;
        case 'showOrbits': this.orbitRenderer.showNormalOrbits = value; break;
        case 'showClouds': this.cfg.showClouds = value; break;
        case 'showNightLights':
          this.cfg.showNightLights = value;
          this.moonScene.setShowNight(value);
          break;
        case 'showSkybox':
          this.scene3d.background = value ? this.starTex : new THREE.Color(palette.bg);
          break;
        case 'showCountries':
          this.geoOverlay.setCountriesVisible(value);
          break;
        case 'showGrid':
          this.geoOverlay.setGridVisible(value);
          break;
      }
    };

    // Marker group visibility
    uiStore.onMarkerGroupChange = (groupId: string, visible: boolean) => {
      this.markerManager.setGroupVisible(groupId, visible);
    };

    // Graphics settings changed from SettingsWindow
    settingsStore.onGraphicsChange = (g: GraphicsSettings) => {
      this.applyGraphics(g);
    };

    // Simulation settings changed from SettingsWindow
    settingsStore.onSimulationChange = (s: SimulationSettings) => {
      this.applySimulation(s);
    };

    // FPS limit changed from SettingsWindow
    settingsStore.onFpsLimitChange = (limit: number) => {
      this.fpsLimit = limit;
    };

    // Multi-source loading
    sourcesStore.onSourcesChange = async () => {
      await this.loadSources();
    };

    // Planet button clicked
    uiStore.onPlanetButtonClick = () => {
      if (this.orreryCtrl.currentPromotedPlanet) {
        this.orreryCtrl.unpromoteToOrrery();
      } else if (this.orreryCtrl.isOrreryMode) {
        this.orreryCtrl.exitOrrery();
        this.orreryCtrl.navigateToEarth();
      } else {
        this.orreryCtrl.enterOrrery();
      }
    };

    // Command palette: navigate to body by id
    uiStore.onNavigateTo = (id: string) => {
      if (id === 'earth') {
        if (this.orreryCtrl.isOrreryMode) this.orreryCtrl.navigateToEarth();
        else { this.activeLock = TargetLock.EARTH; this.camera.setTarget3dXYZ(0, 0, 0); }
      } else if (id === 'moon') {
        if (this.orreryCtrl.isOrreryMode) this.orreryCtrl.navigateToEarth();
        this.activeLock = TargetLock.MOON;
      } else if (id === 'solar-system') {
        if (!this.orreryCtrl.isOrreryMode) this.orreryCtrl.enterOrrery();
      } else {
        // Planet — enter orrery if not in it, then promote
        const planet = PLANETS.find(p => p.id === id);
        if (!planet) return;
        if (!this.orreryCtrl.isOrreryMode) this.orreryCtrl.enterOrrery();
        // Wait a frame for orrery to initialize
        requestAnimationFrame(() => this.orreryCtrl.promoteToPlanetView(planet));
      }
    };

    // Command palette: deselect all satellites
    uiStore.onDeselectAll = () => {
      this.selectedSats.clear(); this.selectedSatsVersion++;
      uiStore.hiddenSelectedSats = new Set();
    };

    // Command palette: deselect satellite by NORAD ID
    uiStore.onDeselectSatellite = (noradId: number) => {
      const sat = this.satByNorad.get(noradId);
      if (sat && this.selectedSats.has(sat)) {
        this.selectedSats.delete(sat);
        this.selectedSatsVersion++;
        if (uiStore.hiddenSelectedSats.has(noradId)) {
          const next = new Set(uiStore.hiddenSelectedSats);
          next.delete(noradId);
          uiStore.hiddenSelectedSats = next;
        }
      }
    };

    // Command palette: toggle 2D/3D
    uiStore.onToggleViewMode = () => {
      if (this.orreryCtrl.isOrreryMode) return;
      this.viewMode = this.viewMode === ViewMode.VIEW_3D ? ViewMode.VIEW_2D : ViewMode.VIEW_3D;
      uiStore.viewMode = this.viewMode;
    };

    // Command palette: get satellite list for search
    uiStore.getSatelliteList = () => {
      return this.satellites.map(s => ({ noradId: s.noradId, name: s.name }));
    };

    // Command palette: get selected satellite list
    uiStore.getSelectedSatelliteList = () => {
      return [...this.selectedSats].map(s => ({ noradId: s.noradId, name: s.name }));
    };

    // Command palette: select satellite by NORAD ID (adds to selection)
    uiStore.onSelectSatellite = (noradId: number) => {
      const sat = this.satByNorad.get(noradId);
      if (sat) {
        this.selectedSats.add(sat);
        this.selectedSatsVersion++;
      }
    };

    // Doppler: get TLE lines by NORAD ID
    uiStore.getSatTLE = (noradId: number) => {
      const sat = this.satByNorad.get(noradId);
      return sat ? { line1: sat.tleLine1, line2: sat.tleLine2 } : null;
    };

    // TLE refresh/retry
    uiStore.onRefreshTLE = async () => {
      // Force refetch all enabled CelesTrak sources
      for (const src of sourcesStore.enabledSources) {
        if (src.type === 'celestrak') this.sourceData.delete(src.id);
      }
      await this.loadSources();
    };

    // Pass predictor
    observerStore.load();
    this.passPredictor.onResult = (passes) => {
      uiStore.passes = passes;
      uiStore.passesComputing = false;
      uiStore.passesProgress = 0;
      uiStore.passesComputeTime = performance.now() - this.passStartTime;
    };
    this.passPredictor.onProgress = (pct) => {
      uiStore.passesProgress = pct;
    };
    uiStore.onRequestPasses = () => this.requestPasses();

    // Nearby pass predictor
    this.nearbyPredictor.onPartial = (passes) => {
      uiStore.nearbyPasses = passes;
    };
    this.nearbyPredictor.onResult = (passes) => {
      uiStore.nearbyPasses = passes;
      uiStore.nearbyComputing = false;
      uiStore.nearbyPhase = 'done';
      uiStore.nearbyProgress = 0;
      uiStore.nearbyComputeTime = performance.now() - this.nearbyStartTime;
    };
    this.nearbyPredictor.onProgress = (pct) => {
      uiStore.nearbyProgress = pct;
    };
    uiStore.onRequestNearbyPasses = () => this.requestNearbyPasses();
    let filterDebounce: ReturnType<typeof setTimeout> | null = null;
    let filterDirty = false;
    const fireFilterRecompute = () => {
      filterDirty = false;
      if (filterDebounce) clearTimeout(filterDebounce);
      filterDebounce = null;
      if (uiStore.passesTab === 'nearby') this.requestNearbyPasses();
      else this.requestPasses();
    };
    uiStore.onFiltersChanged = () => {
      if (!uiStore.passesWindowOpen) return;
      if (uiStore.passFilterInteracting) {
        // Pointer held — just mark dirty, recompute on release
        filterDirty = true;
        if (filterDebounce) clearTimeout(filterDebounce);
        filterDebounce = null;
        return;
      }
      filterDirty = false;
      if (filterDebounce) clearTimeout(filterDebounce);
      filterDebounce = setTimeout(fireFilterRecompute, 500);
    };
    uiStore.onFilterInteractionEnd = () => {
      if (filterDirty) {
        if (filterDebounce) clearTimeout(filterDebounce);
        filterDebounce = setTimeout(fireFilterRecompute, 500);
      }
    };
    uiStore.onSelectSatFromNearbyPass = (noradId: number) => {
      const sat = this.satByNorad.get(noradId);
      if (sat && !this.selectedSats.has(sat)) {
        this.selectedSats.add(sat);
        this.selectedSatsVersion++;
      }
    };

    observerStore.onLocationChange = () => {
      if (uiStore.passesWindowOpen && uiStore.passesTab === 'selected') this.requestPasses();
      if (uiStore.passesWindowOpen && uiStore.passesTab === 'nearby') this.requestNearbyPasses();
      this.updateObserverMarker();
    };
    // Load elevation grid in background
    loadElevation();
    this.updateObserverMarker();

    // Mini planet renderer — wait for Svelte to mount the canvas
    this.orreryCtrl.initMiniRenderer();

    this.orreryCtrl.updatePlanetPickerUI();
  }

  private applyGraphics(s: GraphicsSettings) {
    this.gfx = s;
    this.bloomEnabled = s.bloom;
    this.earth.setNightEmission(s.bloom ? 1.5 : 1.0);
    this.sunScene.setBloomEnabled(s.bloom);
    this.atmosphereGlowEnabled = s.atmosphereGlow;
    this.earth.setBumpEnabled(s.bumpMapping);
    this.moonScene.setBumpEnabled(s.bumpMapping);
    this.earth.setAOEnabled(s.curvatureAO);
    this.moonScene.setAOEnabled(s.curvatureAO);
    const mult = s.surfaceRelief / 10;
    this.earth.setDisplacementScale(0.007 * mult);
    this.moonScene.setDisplacementScale(0.006 * mult);
    const maxDisp = 0.007 * mult;
    const earthDrawR = EARTH_RADIUS_KM / DRAW_SCALE;
    const atmoGap = 80.0 / DRAW_SCALE;
    const atmoScale = maxDisp > atmoGap ? (earthDrawR + maxDisp) / (earthDrawR + atmoGap) : 1.0;
    this.atmosphere.setScale(atmoScale);
    if (s.sphereDetail !== this.lastSphereDetail) {
      this.lastSphereDetail = s.sphereDetail;
      this.earth.setSphereDetail(s.sphereDetail);
      this.moonScene.setSphereDetail(s.sphereDetail);
    }
  }

  private applySimulation(s: SimulationSettings) {
    this.sim = s;
    this.cfg.orbitsToDraw = s.orbitsToDraw;
    this.orbitRenderer.setOrbitMode(s.orbitMode);
    this.orbitRenderer.setOrbitSegments(s.orbitSegments);
    this.orbitRenderer.setJ2Enabled(s.j2Precession);
    this.orbitRenderer.setDragEnabled(s.atmosphericDrag);
    this.maxBatch = s.updateQuality;
  }

  private passFilterParams() {
    return {
      maxElevation: uiStore.passMaxEl < 90 ? uiStore.passMaxEl : undefined,
      visibility: uiStore.passVisibility !== 'all' ? uiStore.passVisibility : undefined,
      azFrom: uiStore.passAzFrom !== 0 ? uiStore.passAzFrom : undefined,
      azTo: uiStore.passAzTo !== 360 ? uiStore.passAzTo : undefined,
      horizonMask: uiStore.passHorizonMask.length > 0 ? uiStore.passHorizonMask.map(m => ({ az: m.az, minEl: m.minEl })) : undefined,
      minDuration: uiStore.passMinDuration > 0 ? uiStore.passMinDuration : undefined,
    };
  }

  private passStartTime = 0;
  private nearbyStartTime = 0;

  private requestPasses() {
    if (!observerStore.isSet || this.selectedSats.size === 0) {
      uiStore.passes = [];
      uiStore.passesComputing = false;
      return;
    }
    this.passStartTime = performance.now();
    const sats: { noradId: number; name: string; line1: string; line2: string; colorIndex: number; stdMag: number | null }[] = [];
    let idx = 0;
    for (const sat of this.selectedSats) {
      sats.push({ noradId: sat.noradId, name: sat.name, line1: sat.tleLine1, line2: sat.tleLine2, colorIndex: idx, stdMag: sat.stdMag });
      idx++;
    }
    uiStore.passesComputing = true;
    uiStore.passesProgress = 0;
    this.passPredictor.compute({
      type: 'compute',
      satellites: sats,
      observerLat: observerStore.location.lat,
      observerLon: observerStore.location.lon,
      observerAlt: observerStore.location.alt,
      startEpoch: timeStore.epoch,
      durationDays: 3,
      minElevation: uiStore.passMinEl,
      ...this.passFilterParams(),
    });
    this.lastPassSatsVersion = this.selectedSatsVersion;
  }

  private filterByInclination(sats: Satellite[], observerLatDeg: number): Satellite[] {
    const obsLatRad = Math.abs(observerLatDeg) * DEG2RAD;
    return sats.filter(sat => {
      // Use apogee distance for conservative bound (satellite is highest → largest footprint)
      const apogee = sat.semiMajorAxis * (1 + sat.eccentricity);
      const reachAngle = Math.acos(Math.min(1, EARTH_RADIUS_KM / apogee));
      return sat.inclination + reachAngle >= obsLatRad;
    });
  }

  private requestNearbyPasses() {
    if (!observerStore.isSet || this.satellites.length === 0) {
      uiStore.nearbyPasses = [];
      uiStore.nearbyComputing = false;
      uiStore.nearbyPhase = 'idle';
      return;
    }
    this.nearbyStartTime = performance.now();

    const filtered = this.filterByInclination(this.satellites, observerStore.location.lat);
    uiStore.nearbyFilteredCount = filtered.length;
    uiStore.nearbyTotalCount = this.satellites.length;

    if (filtered.length === 0) {
      uiStore.nearbyPasses = [];
      uiStore.nearbyComputing = false;
      uiStore.nearbyPhase = 'done';
      return;
    }

    const sats = filtered.map((sat, idx) => ({
      noradId: sat.noradId, name: sat.name, line1: sat.tleLine1, line2: sat.tleLine2, colorIndex: idx, stdMag: sat.stdMag,
    }));

    // Keep old results visible until new ones arrive
    uiStore.nearbyComputing = true;
    uiStore.nearbyProgress = 0;
    uiStore.nearbyPhase = 'computing';

    this.nearbyPredictor.compute({
      type: 'compute',
      satellites: sats,
      observerLat: observerStore.location.lat,
      observerLon: observerStore.location.lon,
      observerAlt: observerStore.location.alt,
      startEpoch: timeStore.epoch,
      durationDays: 1,
      minElevation: uiStore.passMinEl,
      stepMinutes: 3,
      ...this.passFilterParams(),
    });
  }

  private updateObserverMarker() {
    if (!observerStore.isSet) {
      this.markerManager.updateGroupMarkers('observer', []);
      this.mapRenderer.updateGroupMarkers('observer', [], '#ff8800', this.overlayEl);
      return;
    }
    const loc = observerStore.location;
    const name = observerStore.displayName;
    const markers = [{ name, lat: loc.lat, lon: loc.lon }];
    this.markerManager.updateGroupMarkers('observer', markers);
    this.mapRenderer.updateGroupMarkers('observer', markers, '#ff8800', this.overlayEl);
  }

  private getObserverScreenPos(): { x: number; y: number } | null {
    if (!observerStore.isSet || !(uiStore.markerVisibility['observer'] ?? false)) return null;
    const loc = observerStore.location;
    if (this.viewMode === ViewMode.VIEW_3D) {
      const gmstDeg = this.timeSystem.getGmstDeg();
      const pos = latLonToSurface(loc.lat, loc.lon, gmstDeg, this.cfg.earthRotationOffset);
      const projected = pos.project(this.camera3d);
      return {
        x: (projected.x * 0.5 + 0.5) * window.innerWidth,
        y: (-projected.y * 0.5 + 0.5) * window.innerHeight,
      };
    } else {
      const mapX = (loc.lon / 360.0) * MAP_W;
      const mapY = (loc.lat / 180.0) * MAP_H;
      const cam = this.camera2d;
      return {
        x: ((mapX - cam.left) / (cam.right - cam.left)) * window.innerWidth,
        y: ((mapY - cam.top) / (cam.bottom - cam.top)) * window.innerHeight,
      };
    }
  }

  private hitTestObserver(): boolean {
    const sp = this.getObserverScreenPos();
    if (!sp) return false;
    const dx = Math.abs(this.input.mousePos.x - sp.x);
    const dy = sp.y - this.input.mousePos.y; // positive = mouse above tip
    return dx < 16 && dy > -8 && dy < 28;
  }

  private tryStartObserverDrag(): boolean {
    return this.hitTestObserver();
  }

  private handleObserverDrag() {
    const ll = uiStore.cursorLatLon;
    if (!ll) return;
    const elev = isElevationLoaded() ? getElevation(ll.lat, ll.lon) : 0;
    observerStore.setFromLatLon(ll.lat, ll.lon, elev);
    this.updateObserverMarker();
  }

  /** Handle click/tap satellite selection */
  private handleClick() {
    if (this.hoveredSat) {
      if (this.selectedSats.has(this.hoveredSat)) {
        this.selectedSats.delete(this.hoveredSat);
      } else {
        this.selectedSats.add(this.hoveredSat);
      }
      this.selectedSatsVersion++;
    }
  }

  private fpsLimit = -1; // -1 = vsync (rAF), 0 = unlocked, >0 = FPS cap
  private maxBatch = 16;
  private passListFrame = 0;
  private mcChannel = new MessageChannel();
  private lastFrameTime = 0;

  private scheduleNextFrame() {
    if (this.fpsLimit === 0) {
      this.mcChannel.port2.postMessage(null);
    } else if (this.fpsLimit < 0) {
      requestAnimationFrame(() => this.animate());
    } else {
      const remaining = this.lastFrameTime + (1000 / this.fpsLimit) - performance.now();
      if (remaining > 4) {
        setTimeout(() => this.animate(), remaining - 1);
      } else {
        this.mcChannel.port2.postMessage(null);
      }
    }
  }

  private animate() {
    // Gate: skip if fired too early (MessageChannel precision phase)
    if (this.fpsLimit > 0) {
      const target = this.lastFrameTime + (1000 / this.fpsLimit);
      if (performance.now() < target) {
        this.scheduleNextFrame();
        return;
      }
      const interval = 1000 / this.fpsLimit;
      this.lastFrameTime += interval;
      if (performance.now() - this.lastFrameTime > interval) this.lastFrameTime = performance.now();
    } else {
      this.lastFrameTime = performance.now();
    }
    this.scheduleNextFrame();

    const dt = this.clock.getDelta();

    if (timeStore.warping) {
      timeStore.tickWarp();
      this.timeSystem.currentEpoch = timeStore.epoch;
      this.timeSystem.timeMultiplier = 1;
      this.timeSystem.paused = false;
    } else {
      this.timeSystem.timeMultiplier = timeStore.multiplier;
      this.timeSystem.paused = timeStore.paused;
      this.timeSystem.currentEpoch = timeStore.epoch;
      this.timeSystem.update(dt);
      timeStore.syncFromEngine(
        this.timeSystem.currentEpoch,
        this.timeSystem.timeMultiplier,
        this.timeSystem.paused
      );
    }

    // FPS counter
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fpsDisplay = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
      uiStore.fpsDisplay = this.fpsDisplay;
      uiStore.fpsColor = this.fpsDisplay >= 30
        ? '#00ff00'
        : `rgb(255,${Math.round(255 * Math.max(0, this.fpsDisplay / 30))},0)`;
    }

    const epoch = this.timeSystem.currentEpoch;
    const gmstDeg = this.timeSystem.getGmstDeg();

    // Unselected fade
    const shouldHide = this.hideUnselected && this.selectedSats.size > 0;
    if (shouldHide) {
      this.unselectedFade -= 3.0 * dt;
      if (this.unselectedFade < 0) this.unselectedFade = 0;
      this.fadingInSats.clear();
    } else {
      if (this.prevSelectedSats.size > 0 && this.selectedSats.size === 0 && this.unselectedFade < 1.0) {
        this.fadingInSats = new Set(this.prevSelectedSats);
      }
      this.unselectedFade += 3.0 * dt;
      if (this.unselectedFade > 1) {
        this.unselectedFade = 1;
        this.fadingInSats.clear();
      }
    }
    this.prevSelectedSats = new Set(this.selectedSats);

    // Target lock
    if (this.activeLock === TargetLock.EARTH) {
      if (this.viewMode === ViewMode.VIEW_2D) this.camera.setTarget2dXY(0, 0);
      else this.camera.setTarget3dXYZ(0, 0, 0);
    } else if (this.activeLock === TargetLock.MOON) {
      if (this.viewMode === ViewMode.VIEW_2D) {
        const mc = getMapCoordinates(this.moonScene.drawPos.clone().multiplyScalar(DRAW_SCALE), gmstDeg, this.cfg.earthRotationOffset);
        this.camera.setTarget2dXY(mc.x, mc.y);
      } else {
        this.camera.setTarget3d(this.moonScene.drawPos);
      }
    } else if (this.activeLock === TargetLock.SUN) {
      if (this.viewMode === ViewMode.VIEW_3D) {
        this.camera.setTarget3d(this.sunScene.disc.position);
      }
    } else if (this.activeLock === TargetLock.PLANET && this.orreryCtrl.currentPromotedPlanet) {
      const pos = this.orreryCtrl.getPromotedBodyPosition();
      if (pos) this.camera.setTarget3d(pos);
    }

    // Smooth camera lerp + update camera transforms
    const earthRotRad = (gmstDeg + this.cfg.earthRotationOffset) * DEG2RAD;
    const isOrreryOrPlanet = this.activeLock === TargetLock.PLANET || this.orreryCtrl.isOrreryMode;
    this.camera.updateFrame(dt, earthRotRad, isOrreryOrPlanet);

    // Hover detection (skip when pointer is over UI or in planet/orrery view)
    this.hoveredSat = null;
    if (this.input.isOverUI) {
      this.renderer.domElement.style.cursor = '';
    } else if (this.orreryCtrl.isOrreryMode) {
      const hovered = this.orreryCtrl.updateHover(this.raycaster, this.input.mouseNDC);
      this.renderer.domElement.style.cursor = hovered ? 'pointer' : '';
    } else if (this.activeLock !== TargetLock.PLANET && this.activeLock !== TargetLock.MOON) {
      if (this.viewMode === ViewMode.VIEW_3D) {
        this.detectHover3D();
      } else {
        this.hoveredSat = this.mapRenderer.detectHover(this.input.mousePos, this.camera2d, this.satellites, this.timeSystem.getGmstDeg(), this.cfg, this.hideUnselected, this.selectedSats, this.camera.zoom2d, this.input.touchCount);
      }
    }

    // Observer drag cursor
    if (this.input.isDraggingObserver) {
      this.renderer.domElement.style.cursor = 'grabbing';
    } else if (!this.hoveredSat && !this.orreryCtrl.isOrreryMode && !this.input.isOverUI) {
      this.renderer.domElement.style.cursor = this.hitTestObserver() ? 'grab' : '';
    }

    // activeSat = hovered, or first selected if nothing hovered
    const firstSelected = this.selectedSats.size > 0 ? this.selectedSats.values().next().value! : null;
    const activeSat = this.hoveredSat ?? firstSelected;

    const earthMode = this.activeLock !== TargetLock.PLANET && this.activeLock !== TargetLock.MOON && !this.orreryCtrl.isOrreryMode;

    // Cursor lat/lon (skip when pointer is over UI)
    if (earthMode && !this.input.isOverUI) {
      if (this.viewMode === ViewMode.VIEW_3D) {
        this.raycaster.setFromCamera(this.input.mouseNDC, this.camera3d);
        const earthR = EARTH_RADIUS_KM / DRAW_SCALE;
        this.tmpSphere.set(this.tmpVec3.set(0, 0, 0), earthR);
        const hit = this.raycaster.ray.intersectSphere(this.tmpSphere, this.tmpVec3);
        if (hit) {
          this.tmpVec3.applyAxisAngle(new THREE.Vector3(0, 1, 0), -earthRotRad);
          const r = this.tmpVec3.length();
          uiStore.cursorLatLon = {
            lat: Math.asin(this.tmpVec3.y / r) * RAD2DEG,
            lon: Math.atan2(-this.tmpVec3.z, this.tmpVec3.x) * RAD2DEG,
          };
        } else {
          uiStore.cursorLatLon = null;
        }
      } else {
        const wx = (this.input.mouseNDC.x + 1) / 2 * (this.camera2d.right - this.camera2d.left) + this.camera2d.left;
        const wy = (this.input.mouseNDC.y + 1) / 2 * (this.camera2d.top - this.camera2d.bottom) + this.camera2d.bottom;
        if (Math.abs(wy) <= MAP_H / 2) {
          let lon = (wx / MAP_W) * 360;
          while (lon > 180) lon -= 360;
          while (lon < -180) lon += 360;
          uiStore.cursorLatLon = { lat: (wy / MAP_H) * 180, lon };
        } else {
          uiStore.cursorLatLon = null;
        }
      }
    } else {
      uiStore.cursorLatLon = null;
    }

    // Propagate satellite positions (batched SGP4) — shared across 3D and 2D
    this.satManager.propagatePositions(
      this.satellites, epoch, this.hoveredSat, this.selectedSats,
      this.timeSystem.timeMultiplier, dt, this.maxBatch
    );

    if (this.viewMode === ViewMode.VIEW_3D) {
      // Update 3D scene
      if (!this.orreryCtrl.isOrreryMode) {
        this.earth.update(epoch, gmstDeg, this.cfg.earthRotationOffset, this.cfg.showNightLights);
        if (earthMode) this.cloudLayer.update(epoch, gmstDeg, this.cfg.earthRotationOffset, this.cfg.showClouds, this.cfg.showNightLights);
        this.moonScene.update(epoch);
        this.sunScene.update(epoch);
      }

      // Geographic overlays rotate with Earth
      this.geoOverlay.setRotation(earthRotRad);
      this.geoOverlay.set3dVisible(earthMode);

      // Sun direction in ECI/world space
      const sunEciDir = calculateSunPosition(epoch).normalize();
      this.atmosphere.update(sunEciDir);
      this.moonScene.updateSunDir(sunEciDir);
      this.atmosphere.setVisible(this.atmosphereGlowEnabled && this.activeLock !== TargetLock.PLANET && !this.orreryCtrl.isOrreryMode);

      // Orrery mode (includes promoted planet if any)
      this.orreryCtrl.updateFrame({
        dt,
        sunEciDir,
        showNightLights: this.cfg.showNightLights,
        gfx: this.gfx,
        timeMultiplier: this.timeSystem.timeMultiplier,
      });

      this.satManager.setVisible(earthMode);
      uiStore.earthTogglesVisible = earthMode;
      // Hide 2D marker labels in 3D mode
      this.mapRenderer.hideMarkerLabels();
      const showNight = earthMode || this.activeLock === TargetLock.MOON || this.activeLock === TargetLock.PLANET;
      uiStore.nightToggleVisible = showNight;
      if (earthMode) {
        this.satManager.update(
          this.satellites, this.camera3d.position,
          this.hoveredSat, this.selectedSats, this.unselectedFade, this.hideUnselected,
          { normal: this.cfg.satNormal, highlighted: this.cfg.satHighlighted, selected: this.cfg.satSelected },
          this.bloomEnabled, this.fadingInSats
        );

        this.orbitRenderer.update(
          this.satellites, epoch, this.hoveredSat, this.selectedSats,
          this.selectedSatsVersion, this.unselectedFade, this.sim.orbitsToDraw,
          { orbitNormal: this.cfg.orbitNormal, orbitHighlighted: this.cfg.orbitHighlighted }
        );

        // Footprints for all selected sats + hovered (per-sat orbit color)
        const fpEntries: FootprintEntry[] = [];
        {
          const hiddenIds = uiStore.hiddenSelectedSats;
          let fpIdx = 0;
          for (const sat of this.selectedSats) {
            if (!hiddenIds.has(sat.noradId)) {
              fpEntries.push({
                position: sat.currentPos,
                color: ORBIT_COLORS[fpIdx % ORBIT_COLORS.length] as [number, number, number],
              });
            }
            fpIdx++;
          }
          if (this.hoveredSat && !this.selectedSats.has(this.hoveredSat)) {
            const rc = ORBIT_COLORS[this.selectedSats.size % ORBIT_COLORS.length];
            fpEntries.push({
              position: (this.hoveredSat as Satellite).currentPos,
              color: rc as [number, number, number],
            });
          }
        }
        this.footprintRenderer.update(fpEntries);

        this.markerManager.update(gmstDeg, this.cfg.earthRotationOffset, this.camera3d, this.camera.distance);
      }

      const activePlanet = this.orreryCtrl.currentActivePlanet;
      const bloomForBody = this.activeLock === TargetLock.PLANET
        ? (activePlanet?.bloom !== false)
        : (BODIES[this.activeLock]?.bloom !== false);
      const useBloom = this.bloomEnabled && bloomForBody && !this.orreryCtrl.isOrreryMode;
      if (useBloom) {
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.postProcessing.render();
      } else {
        this.renderer.toneMapping = THREE.NoToneMapping;
        this.renderer.clear();
        this.renderer.render(this.scene3d, this.camera3d);
      }
    } else {
      // Update 2D map
      this.mapRenderer.update({ epoch, gmstDeg, cfg: this.cfg, satellites: this.satellites, hoveredSat: this.hoveredSat, selectedSats: this.selectedSats, cam2dZoom: this.camera.zoom2d, camera2d: this.camera2d });
      this.markerManager.hide();
      this.orbitRenderer.clear();
      this.footprintRenderer.clear();
      this.periSprite3d.visible = false;
      this.apoSprite3d.visible = false;

      // Disable tone mapping for 2D direct render
      const prevToneMapping = this.renderer.toneMapping;
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.renderer.clear();
      this.renderer.render(this.scene2d, this.camera2d);
      this.renderer.toneMapping = prevToneMapping;
    }

    // Mini planet spinner
    this.orreryCtrl.renderMini(dt);

    // Keep reactive sat count in sync for UI components (view-independent)
    uiStore.selectedSatCount = this.selectedSats.size;

    // Pass predictor: auto-trigger when selection changes and window is open
    if (uiStore.passesWindowOpen && this.lastPassSatsVersion !== this.selectedSatsVersion) {
      // Always allow clearing (0 sats); only gate recomputation on not-busy
      if (this.selectedSats.size === 0 || !this.passPredictor.isComputing()) {
        this.requestPasses();
      }
    }

    // Throttle pass-list epoch updates using updateQuality setting
    if (this.passListFrame++ % Math.max(1, this.maxBatch) === 0) {
      uiStore.passListEpoch = epoch;
    }

    // Pass predictor: compute sky path on-demand + live az/el for polar plot
    if (uiStore.polarPlotOpen && uiStore.selectedPassIdx >= 0 && uiStore.selectedPassIdx < uiStore.activePassList.length) {
      const pass = uiStore.activePassList[uiStore.selectedPassIdx];
      // Lazy sky path: compute 100-point track on first view (cached on pass object)
      if (pass.skyPath.length < 50) {
        const sat = this.satByNorad.get(pass.satNoradId);
        if (sat) {
          const pathStep = (pass.losEpoch - pass.aosEpoch) / 99;
          if (pathStep > 0) {
            const path: { az: number; el: number; t: number }[] = [];
            const obs = observerStore.location;
            for (let k = 0; k < 100; k++) {
              const pt = pass.aosEpoch + k * pathStep;
              const date = new Date(epochToUnix(pt) * 1000);
              const result = propagate(sat.satrec, date);
              if (result.position && typeof result.position !== 'boolean') {
                const eci = result.position as { x: number; y: number; z: number };
                const g = epochToGmst(pt) * (Math.PI / 180);
                const ae = getAzEl(eci.x, eci.y, eci.z, g, obs.lat, obs.lon, obs.alt);
                path.push({ az: ae.az, el: ae.el, t: pt });
              }
            }
            pass.skyPath = path;
          }
        }
      }
      if (epoch >= pass.aosEpoch && epoch <= pass.losEpoch) {
        const sat = this.satByNorad.get(pass.satNoradId);
        if (sat) {
          const date = new Date(epochToUnix(epoch) * 1000);
          const result = propagate(sat.satrec, date);
          if (result.position && typeof result.position !== 'boolean') {
            const eci = result.position as { x: number; y: number; z: number };
            const gmstRad = gmstDeg * DEG2RAD;
            const obs = observerStore.location;
            uiStore.livePassAzEl = getAzEl(eci.x, eci.y, eci.z, gmstRad, obs.lat, obs.lon, obs.alt);
          } else {
            uiStore.livePassAzEl = null;
          }
        } else {
          uiStore.livePassAzEl = null;
        }
      } else {
        uiStore.livePassAzEl = null;
      }
    }

    this.uiUpdater.update({
      activeSat,
      hoveredSat: this.hoveredSat,
      selectedSats: this.selectedSats,
      gmstDeg,
      cfg: this.cfg,
      viewMode: this.viewMode,
      camera3d: this.camera3d,
      camera2d: this.camera2d,
      currentEpoch: this.timeSystem.currentEpoch,
      periSprite3d: this.periSprite3d,
      apoSprite3d: this.apoSprite3d,
      moonDrawPos: this.moonScene.drawPos,
    });
  }

  private handleDoubleClickLock() {
    this.raycaster.setFromCamera(this.input.mouseNDC, this.camera3d);
    const earthR = EARTH_RADIUS_KM / DRAW_SCALE;
    const moonR = MOON_RADIUS_KM / DRAW_SCALE;
    this.tmpSphere.set(this.moonScene.drawPos, moonR);
    const moonHit = this.raycaster.ray.intersectsSphere(this.tmpSphere);
    this.tmpSphere.set(this.tmpVec3.set(0, 0, 0), earthR);
    const earthHit = this.raycaster.ray.intersectsSphere(this.tmpSphere);
    this.tmpSphere.set(this.sunScene.disc.position, 6);
    const sunHit = this.raycaster.ray.intersectsSphere(this.tmpSphere);
    if (sunHit && !earthHit && !moonHit) this.activeLock = TargetLock.SUN;
    else if (moonHit && !earthHit) this.activeLock = TargetLock.MOON;
    else if (earthHit) this.activeLock = TargetLock.EARTH;
  }

  private detectHover3D() {
    this.raycaster.setFromCamera(this.input.mouseNDC, this.camera3d);
    const touchScale = this.input.isTouchActive ? 3.0 : 1.0;
    const earthR = EARTH_RADIUS_KM / DRAW_SCALE;
    const camPos = this.camera3d.position;

    let closestRayDist = 9999;
    for (const sat of this.satellites) {
      if (this.hideUnselected && this.selectedSats.size > 0 && !this.selectedSats.has(sat)) continue;

      this.tmpVec3.copy(sat.currentPos).divideScalar(DRAW_SCALE);
      const distToCam = camPos.distanceTo(this.tmpVec3);
      const hitRadius = 0.015 * distToCam * touchScale;

      // Skip satellites occluded by Earth
      const vx = this.tmpVec3.x - camPos.x, vy = this.tmpVec3.y - camPos.y, vz = this.tmpVec3.z - camPos.z;
      const L = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (L > 0) {
        const dx = vx / L, dy = vy / L, dz = vz / L;
        const t = -(camPos.x * dx + camPos.y * dy + camPos.z * dz);
        if (t > 0 && t < L) {
          const cx = camPos.x + dx * t, cy = camPos.y + dy * t, cz = camPos.z + dz * t;
          if (Math.sqrt(cx * cx + cy * cy + cz * cz) < earthR * 0.99) continue;
        }
      }

      this.tmpSphere.set(this.tmpVec3, hitRadius);
      if (this.raycaster.ray.intersectsSphere(this.tmpSphere)) {
        const rayDist = this.raycaster.ray.distanceToPoint(this.tmpVec3);
        if (rayDist < closestRayDist) {
          closestRayDist = rayDist;
          this.hoveredSat = sat;
        }
      }
    }
  }

}
