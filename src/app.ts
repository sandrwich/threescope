import * as THREE from 'three';
import type { Satellite } from './types';
import { TargetLock, ViewMode } from './types';
import { defaultConfig } from './config';
import { DRAW_SCALE, EARTH_RADIUS_KM, MOON_RADIUS_KM, DEG2RAD, RAD2DEG, MAP_W, MAP_H, MOBILE_BREAKPOINT } from './constants';
import { TimeSystem } from './simulation/time-system';
import { Earth } from './scene/earth';
import { CloudLayer } from './scene/cloud-layer';
import { MoonScene } from './scene/moon-scene';
import { SunScene } from './scene/sun-scene';
import { SatelliteManager } from './scene/satellite-manager';
import { OrbitRenderer, ORBIT_COLORS } from './scene/orbit-renderer';
import { FootprintRenderer, type FootprintEntry } from './scene/footprint-renderer';
import { BeamConeRenderer } from './scene/beam-cone-renderer';
import { SkyGridRenderer } from './scene/sky-grid-renderer';
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
import { getMapCoordinates, latLonToSurface, observerFrame, observerFrameInto } from './astro/coordinates';
import { calculateSunPosition } from './astro/sun';
import { fetchTLEData, parseTLETextParallel, warmupTLEWorkers } from './data/tle-loader';
import { getSatellitesByFreqRange } from './data/satnogs';
import { sourcesStore, type TLESourceConfig } from './stores/sources.svelte';
import { timeStore } from './stores/time.svelte';
import { uiStore } from './stores/ui.svelte';
import { beamStore } from './stores/beam.svelte';
import { Tracker } from './tracker/tracker';
import { settingsStore } from './stores/settings.svelte';
import { observerStore } from './stores/observer.svelte';
import { themeStore } from './stores/theme.svelte';
import { UIUpdater } from './ui/ui-updater';
import { GeoOverlay } from './scene/geo-overlay';
import { PassPredictor } from './passes/pass-predictor';
import { getAzEl, renderToEci } from './astro/az-el';
import { propagate } from 'satellite.js';
import { epochToUnix, epochToGmst } from './astro/epoch';
import { sunDirectionECI, earthShadowFactor, isSolarEclipsed, solarEclipsePossible } from './astro/eclipse';
import { moonPositionECI } from './astro/moon-observer';
import { computePhaseAngle, observerEci, slantRange, estimateVisualMagnitude } from './astro/magnitude';
import { loadElevation, getElevation, isElevationLoaded } from './astro/elevation';
import { palette } from './ui/shared/theme';

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
  private beamConeRenderer!: BeamConeRenderer;
  private skyGridRenderer!: SkyGridRenderer;
  private markerManager!: MarkerManager;
  private postProcessing!: PostProcessing;
  private atmosphere!: Atmosphere;
  private gfx: GraphicsSettings = getPresetSettings(DEFAULT_PRESET);
  private sim: SimulationSettings = getSimPresetSettings(DEFAULT_SIM_PRESET);
  private bloomEnabled = true;
  private atmosphereGlowEnabled = true;
  private lastSphereDetail = 0;
  private starTex!: THREE.Texture;
  private skyGround!: THREE.Mesh; // flat ground disc with projected Earth texture
  private _skyFrame = {
    origin: new THREE.Vector3(), up: new THREE.Vector3(),
    north: new THREE.Vector3(), east: new THREE.Vector3(),
  };

  private orreryCtrl!: OrreryController;

  private satellites: Satellite[] = [];
  private satByNorad = new Map<number, Satellite>();
  private hoveredSat: Satellite | null = null;
  private _hoverSettleFrames = 0;
  private _lastHoverCamX = 0;
  private _lastHoverCamY = 0;
  private _lastHoverCamZ = 0;
  private selectedSats = new Set<Satellite>();
  private selectedSatsVersion = 0;
  private tracker = new Tracker();

  // ── Selection helpers (centralized mutation) ──

  /** Add a satellite to selection, respecting single-select mode. */
  private selectSat(sat: Satellite) {
    if (uiStore.singleSelectMode) {
      // Properly clean up each deselected satellite (release locks, hidden state)
      for (const prev of this.selectedSats) {
        if (prev === sat) continue;
        if (this.lockedSat === prev) this.exitSatLock();
      }
      this.selectedSats.clear();
      if (uiStore.hiddenSelectedSats.size > 0) uiStore.hiddenSelectedSats = new Set();
    }
    this.selectedSats.add(sat);
    this.selectedSatsVersion++;
    uiStore.lastAddedSatNoradId = sat.noradId;
  }

  /** Toggle a satellite's selection state. */
  private toggleSat(sat: Satellite) {
    if (this.selectedSats.has(sat)) this.deselectSat(sat);
    else this.selectSat(sat);
  }

  /** Remove a satellite from selection. */
  private deselectSat(sat: Satellite) {
    if (!this.selectedSats.has(sat)) return;
    this.selectedSats.delete(sat);
    this.selectedSatsVersion++;
    if (this.lockedSat === sat) {
      this.exitSatLock();
    }
    if (uiStore.hiddenSelectedSats.has(sat.noradId)) {
      const next = new Set(uiStore.hiddenSelectedSats);
      next.delete(sat.noradId);
      uiStore.hiddenSelectedSats = next;
    }
  }

  /** Clear entire selection. */
  private clearSelection() {
    this.selectedSats.clear();
    this.selectedSatsVersion++;
    uiStore.hiddenSelectedSats = new Set();
  }
  private activeLock = TargetLock.EARTH;
  private lockedSat: Satellite | null = null;
  private viewMode = ViewMode.VIEW_3D;
  private hideUnselected = false;
  private unselectedFade = 1.0;
  private fadingInSats = new Set<Satellite>();
  private prevSelectedSats = new Set<Satellite>();
  private prevSelVersion = -1;
  private cfg = { ...defaultConfig };
  private passPredictor = new PassPredictor();
  private nearbyPredictor = new PassPredictor();
  private lastPassSatsVersion = -1;
  private overlayEl!: HTMLElement;

  // Reusable temp objects (avoid per-frame allocations)
  private raycaster = new THREE.Raycaster();
  private tmpVec3 = new THREE.Vector3();
  private tmpSphere = new THREE.Sphere();
  private static readonly Y_AXIS = new THREE.Vector3(0, 1, 0);
  private static readonly Z_AXIS = new THREE.Vector3(0, 0, 1);

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
    this.camera3d = new THREE.PerspectiveCamera(settingsStore.fov, window.innerWidth / window.innerHeight, 0.01, 10000);
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

    // On mobile, zoom in so the earth fills the screen nicely
    if (window.innerWidth < MOBILE_BREAKPOINT) {
      const earthR = EARTH_RADIUS_KM / DRAW_SCALE;
      const fovRad = settingsStore.fov * DEG2RAD;
      const aspect = window.innerWidth / window.innerHeight;
      // Use horizontal half-FOV (narrower on portrait) to fit the earth's width
      const hFov = 2 * Math.atan(Math.tan(fovRad / 2) * aspect);
      // Distance where earth fills 65% of viewport width
      const dist = earthR / Math.sin(hFov / 2) / 0.65;
      this.camera.snapDistance(dist);
    }

    this.scene2d = new THREE.Scene();
    this.scene2d.background = new THREE.Color(palette.bg);

    // Warm up TLE parsing workers — compile in background during texture download.
    // On slow networks: ready in time for TLE parsing. On fast/localhost: readiness check falls back to sync.
    warmupTLEWorkers();

    // Start texture downloads first (network I/O, non-blocking)
    this.setLoading(0.1, 'Loading textures (0/4)...');
    const texturesDone = this.loadTextures();

    // Parse cached TLE data while textures download (CPU-bound but hidden behind network wait)
    sourcesStore.load();
    const tleFetchDone = this.prefetchSources();

    await texturesDone;

    // Orrery controller (after scene + camera + textures are ready)
    this.orreryCtrl = new OrreryController(this.scene3d, this.camera3d, this.camera, {
      setEarthVisible: (v) => this.setEarthVisible(v),
      clearSatSelection: () => { this.clearSelection(); this.hoveredSat = null; },
      setViewMode3D: () => { this.viewMode = ViewMode.VIEW_3D; uiStore.viewMode = ViewMode.VIEW_3D; },
      setActiveLock: (lock) => { this.activeLock = lock; },
      onMoonClicked: () => {
        this.activeLock = TargetLock.MOON;
        this.camera.snapTarget3d(this.moonScene.drawPos);
        this.camera.snapDistance(3.0);
      },
    });

    // Wait for TLE fetch to finish, then apply (orbitRenderer now exists)
    if (this._prefetchTotal > 1 && this._prefetchLoaded < this._prefetchTotal) {
      // Prefetch still in progress — poll for progress updates
      const total = this._prefetchTotal;
      while (this._prefetchLoaded < total) {
        this.setLoading(0.55 + (this._prefetchLoaded / total) * 0.2, `Loading satellites (${this._prefetchLoaded}/${total} sources)...`);
        await new Promise(r => setTimeout(r, 100));
      }
    }
    this.setLoading(0.75, this._prefetchTotal > 1 ? `Loading satellites (${this._prefetchTotal}/${this._prefetchTotal} sources)...` : 'Loading satellites...');
    await tleFetchDone;
    this.setLoading(0.8, 'Computing orbits...');
    await this.loadSources();

    this.setLoading(0.9, 'Wiring controls...');
    this.wireStores();
    this.input = new InputHandler(this.renderer.domElement, this.renderer, this.camera, this.camera3d, this.postProcessing, {
      getViewMode: () => this.viewMode,
      getOrreryMode: () => this.orreryCtrl.isOrreryMode,
      getActiveLock: () => this.activeLock,
      getMinZoom: () => getMinZoom(this.activeLock),
      clearTargetLock: () => { if (this.lockedSat) this.exitSatLock(); else this.activeLock = TargetLock.NONE; },
      onSelect: () => this.handleClick(),
      onDoubleClick3D: () => this.handleDoubleClickLock(),
      onDoubleClick2D: () => { if (this.hitTestObserver()) { this.enterSkyView(); return; } if (!this.hoveredSat && this.selectedSats.size > 0) this.clearSelection(); this.activeLock = TargetLock.EARTH; },
      onDoubleClickSky: () => this.handleDoubleClickSky(),
      onOrreryClick: () => this.orreryCtrl.handleClick(this.raycaster, this.input.mouseNDC),
      onToggleViewMode: () => {
        if (this.viewMode === ViewMode.VIEW_SKY) return;
        if (!this.orreryCtrl.isOrreryMode) {
          this.viewMode = this.viewMode === ViewMode.VIEW_3D ? ViewMode.VIEW_2D : ViewMode.VIEW_3D;
          uiStore.viewMode = this.viewMode;
        }
      },
      onToggleSkyView: () => this.toggleSkyView(),
      onSkyClick: (ndcX, ndcY) => this.handleSkyClick(ndcX, ndcY),
      onSkyDrag: (dx, dy) => this.handleSkyDrag(dx, dy),
      onResize: () => {},
      tryStartObserverDrag: () => this.tryStartObserverDrag(),
      onObserverDrag: () => this.handleObserverDrag(),
      tryStartOrbitScrub: () => this.tryStartOrbitScrub(),
      onOrbitScrub: () => this.handleOrbitScrub(),
    });

    this.setLoading(1.0, 'Ready!');
    setTimeout(() => { this.loadingScreen.style.display = 'none'; }, 150);

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
    let texLoaded = 0;
    const texTotal = 9;
    const load = (url: string) => new Promise<THREE.Texture>((resolve) => {
      loader.load(url, (tex) => {
        texLoaded++;
        this.setLoading(0.1 + (texLoaded / texTotal) * 0.35, `Loading textures (${texLoaded}/${texTotal})...`);
        resolve(tex);
      }, undefined, () => resolve(new THREE.Texture()));
    });

    // Load ALL textures behind the loading screen — no deferred loads, no post-load stutter
    const [dayTex, nightTex, satTex, starTex, cloudTex, moonTex, earthNormal, earthDisp, moonDisp] = await Promise.all([
      load('/textures/earth/color.webp'),
      load('/textures/earth/night.webp'),
      load('/textures/ui/sat_icon.png'),
      load('/textures/stars.webp'),
      load('/textures/earth/clouds.webp'),
      load('/textures/moon/color.webp'),
      load('/textures/earth/normal.webp'),
      load('/textures/earth/displacement.webp'),
      load('/textures/moon/displacement.webp'),
    ]);

    for (const tex of [dayTex, nightTex, cloudTex, earthNormal, earthDisp, moonTex, moonDisp]) {
      tex.flipY = false;
      tex.colorSpace = THREE.NoColorSpace;
    }

    // Star background (equirectangular -> 3D skybox)
    starTex.mapping = THREE.EquirectangularReflectionMapping;
    starTex.colorSpace = THREE.SRGBColorSpace;
    this.starTex = starTex;
    this.scene3d.background = starTex;

    // Pre-upload all textures to GPU behind the loading screen
    for (const tex of [dayTex, nightTex, satTex, starTex, cloudTex, moonTex, earthNormal, earthDisp, moonDisp]) {
      this.renderer.initTexture(tex);
    }

    this.setLoading(0.5, 'Building scene...');

    // Earth
    this.earth = new Earth(dayTex, nightTex, earthNormal, earthDisp);
    this.scene3d.add(this.earth.mesh);

    // Sky-view ground disc: flat plane with projected Earth texture for realistic ground
    this.skyGround = new THREE.Mesh(
      new THREE.CircleGeometry(5, 64),
      new THREE.ShaderMaterial({
        uniforms: {
          dayTexture: { value: dayTex },
          gmstRad: { value: 0 },
        },
        vertexShader: `
          varying vec3 vWorldPos;
          void main() {
            vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D dayTexture;
          uniform float gmstRad;
          varying vec3 vWorldPos;
          const float PI = 3.14159265;
          void main() {
            vec3 dir = normalize(vWorldPos);
            // ECI to ECEF: rotate around Y by -gmstRad
            float c = cos(gmstRad), s = sin(gmstRad);
            vec3 ecef = vec3(c * dir.x - s * dir.z, dir.y, s * dir.x + c * dir.z);
            // Match Earth UV: theta = atan(-z, x), phi = acos(y)
            float phi = acos(clamp(ecef.y, -1.0, 1.0));
            float theta = atan(-ecef.z, ecef.x);
            vec2 uv = vec2(theta / (2.0 * PI) + 0.5, phi / PI);
            gl_FragColor = texture2D(dayTexture, uv);
          }
        `,
      }),
    );
    this.skyGround.visible = false;
    this.scene3d.add(this.skyGround);

    // Atmosphere (Fresnel rim glow, rendered before clouds)
    this.atmosphere = new Atmosphere();
    this.scene3d.add(this.atmosphere.mesh);

    // Clouds
    this.cloudLayer = new CloudLayer(cloudTex);
    this.scene3d.add(this.cloudLayer.mesh);

    // Moon
    this.moonScene = new MoonScene(moonTex, moonDisp);
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
    this.beamConeRenderer = new BeamConeRenderer(this.scene3d);
    this.skyGridRenderer = new SkyGridRenderer(this.scene3d, document.getElementById('svelte-ui')!);

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
    const apsisOpts = { map: diamondTex, depthTest: false, transparent: true, alphaTest: 0.1, sizeAttenuation: false, toneMapped: false } as const;
    const periMat = new THREE.SpriteMaterial({ ...apsisOpts, color: 0x87ceeb });
    this.periSprite3d = new THREE.Sprite(periMat);
    this.periSprite3d.scale.set(0.012, 0.012, 1);
    this.periSprite3d.renderOrder = 999;
    this.periSprite3d.visible = false;
    this.scene3d.add(this.periSprite3d);

    const apoMat = new THREE.SpriteMaterial({ ...apsisOpts, color: 0xffa500 });
    this.apoSprite3d = new THREE.Sprite(apoMat);
    this.apoSprite3d.scale.set(0.012, 0.012, 1);
    this.apoSprite3d.renderOrder = 999;
    this.apoSprite3d.visible = false;
    this.scene3d.add(this.apoSprite3d);
  }

  private sourceData = new Map<string, Satellite[]>();

  private _prefetchTotal = 0;
  private _prefetchLoaded = 0;

  /** Fetch TLE data into sourceData without touching scene objects. Safe to run before scene is built. */
  private async prefetchSources() {
    const toFetch = sourcesStore.enabledSources.filter(s => !this.sourceData.has(s.id));
    if (toFetch.length === 0) return;
    this._prefetchTotal = toFetch.length;
    this._prefetchLoaded = 0;
    sourcesStore.loading = true;
    uiStore.satCount = -1;
    uiStore.satStatusExtra = '';
    await Promise.allSettled(toFetch.map(async src => {
      await this.fetchSource(src);
      this._prefetchLoaded++;
    }));
    sourcesStore.loading = false;
  }

  async loadSources() {
    const enabled = sourcesStore.enabledSources;
    const enabledIdSet = new Set(enabled.map(s => s.id));

    // Remove cached data for disabled sources
    for (const id of this.sourceData.keys()) {
      if (!enabledIdSet.has(id)) this.sourceData.delete(id);
    }

    if (enabled.length === 0) {
      this.satellites = [];
      this.clearSelection();
      this.hoveredSat = null;
      this.orbitRenderer.precomputeOrbits([], this.timeSystem.currentEpoch);
      sourcesStore.totalSats = 0;
      sourcesStore.dupsRemoved = 0;
      uiStore.satCount = 0;
      uiStore.satStatusExtra = '';
      uiStore.tleLoadState = 'none';
      return;
    }

    // Fetch sources not yet loaded
    const toFetch = enabled.filter(s => !this.sourceData.has(s.id));
    if (toFetch.length > 0) {
      sourcesStore.loading = true;
      uiStore.satCount = -1;
      uiStore.satStatusExtra = '';

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
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const resp = await fetch(src.url!, { signal: controller.signal });
        clearTimeout(timeout);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        satellites = await parseTLETextParallel(text);
        try {
          localStorage.setItem('tlescope_tle_custom_' + src.id, JSON.stringify({ ts: Date.now(), data: text, count: satellites.length }));
        } catch { /* localStorage full */ }
        sourcesStore.setLoadState(src.id, { satCount: satellites.length, status: 'loaded' });
      } else {
        const text = sourcesStore.getCustomText(src.id);
        satellites = await parseTLETextParallel(text);
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
    if (uiStore.passesVisible && uiStore.passesTab === 'nearby') {
      this.requestNearbyPasses();
    }

    sourcesStore.totalSats = deduped.length;
    sourcesStore.dupsRemoved = dupsRemoved;
    uiStore.satCount = deduped.length;
    uiStore.satStatusExtra = dupsRemoved > 0 ? `${dupsRemoved} dups` : '';

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

  /** Set visibility for sky view — hide ground objects, keep sky objects.
   *  A flat ground disc with projected Earth texture replaces the sphere for realistic horizon. */
  private setSkyViewVisible(sky: boolean) {
    this.earth.mesh.visible = !sky;
    this.atmosphere.mesh.visible = !sky;
    this.cloudLayer.mesh.visible = !sky;
    this.geoOverlay.set3dVisible(!sky);
    this.skyGround.visible = sky;
    if (sky) {
      // Ground-only renderers: clear when entering sky view
      this.footprintRenderer.clear();
      this.beamConeRenderer.hide();
      this.markerManager.hide();
      // Orbits stay — they're visible arcs across the sky
    }
    // Moon, sun, sats, orbits stay visible — they're in the sky
  }

  private enterSkyView() {
    if (!observerStore.isSet) return;
    if (this.viewMode === ViewMode.VIEW_SKY) return;
    if (this.orreryCtrl.isOrreryMode) return;
    const gmstDeg = this.timeSystem.getGmstDeg();
    const frame = observerFrame(observerStore.location.lat, observerStore.location.lon, gmstDeg, this.cfg.earthRotationOffset);
    this.camera.enterSkyView(frame.origin, frame.up, frame.north, frame.east);
    this.viewMode = ViewMode.VIEW_SKY;
    uiStore.viewMode = ViewMode.VIEW_SKY;
    this.setSkyViewVisible(true);
    this.skyGridRenderer.setVisible(uiStore.showSkyGrid);
    this.skyGridRenderer.update(frame.origin, frame.up, frame.north, frame.east);
    this.activeLock = TargetLock.NONE;
    if (this.lockedSat) this.lockedSat = null;
  }

  private exitSkyView() {
    if (this.viewMode !== ViewMode.VIEW_SKY) return;
    this.camera.exitSkyView();
    this.viewMode = ViewMode.VIEW_3D;
    uiStore.viewMode = ViewMode.VIEW_3D;
    this.setSkyViewVisible(false);
    this.skyGridRenderer.setVisible(false);
    this.activeLock = TargetLock.EARTH;
  }

  private toggleSkyView() {
    if (this.viewMode === ViewMode.VIEW_SKY) this.exitSkyView();
    else this.enterSkyView();
  }

  /** Double-click/tap in sky view — beam-lock to hovered satellite. */
  private handleDoubleClickSky() {
    if (this.hoveredSat) {
      if (beamStore.locked && beamStore.lockedNoradId === this.hoveredSat.noradId) {
        beamStore.unlock();
      } else {
        beamStore.lockToSatellite(this.hoveredSat.noradId, this.hoveredSat.name);
      }
    }
  }

  /** Convert NDC click coords to az/el in the observer's ENU frame, then aim beam. */
  private handleSkyClick(ndcX: number, ndcY: number) {
    if (!this.camera.isSkyView) return;
    if (beamStore.locked) return; // locked beam is controlled by tracker only
    // Unproject click to world-space ray direction
    this.tmpVec3.set(ndcX, ndcY, 0.5).unproject(this.camera3d);
    this.tmpVec3.sub(this.camera3d.position).normalize();
    // Convert to local ENU: dot with east, north, up
    const e = this.tmpVec3.dot(this.camera.skyEast);
    const n = this.tmpVec3.dot(this.camera.skyNorth);
    const u = this.tmpVec3.dot(this.camera.skyUp);
    const el = Math.atan2(u, Math.sqrt(e * e + n * n)) * RAD2DEG;
    if (el < 0) return; // below horizon
    let az = Math.atan2(e, n) * RAD2DEG;
    if (az < 0) az += 360;
    beamStore.setAim(az, el);
  }

  /** Left-drag in sky view: aim beam at current pointer position. */
  private handleSkyDrag(ndcX: number, ndcY: number) {
    this.handleSkyClick(ndcX, ndcY);
  }

  /** Project beam aim direction to screen and update reticle HUD data. */
  private updateSkyReticle() {
    const up = this.camera.skyUp;
    const north = this.camera.skyNorth;
    const east = this.camera.skyEast;
    const azRad = beamStore.aimAz * DEG2RAD;
    const elRad = beamStore.aimEl * DEG2RAD;
    const cosEl = Math.cos(elRad);
    // Beam direction in world space
    this.tmpVec3.set(0, 0, 0)
      .addScaledVector(north, cosEl * Math.cos(azRad))
      .addScaledVector(east, cosEl * Math.sin(azRad))
      .addScaledVector(up, Math.sin(elRad));
    // Project a point along beam direction
    const camPos = this.camera3d.position;
    this.tmpVec3.multiplyScalar(100).add(camPos);
    this.tmpVec3.project(this.camera3d);
    if (this.tmpVec3.z > 1) {
      uiStore.skyReticle = { x: 0, y: 0, radius: 0, visible: false };
      return;
    }
    const sx = (this.tmpVec3.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-this.tmpVec3.y * 0.5 + 0.5) * window.innerHeight;
    // Beam circle radius in pixels: (beamWidth / FOV) * viewportHeight / 2
    const radius = (beamStore.beamWidth / this.camera.skyFov) * window.innerHeight / 2;
    uiStore.skyReticle = { x: sx, y: sy, radius, visible: true };
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
    beamStore.load();
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
        case 'showSkyGrid':
          if (this.viewMode === ViewMode.VIEW_SKY) this.skyGridRenderer.setVisible(value);
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

    // FOV changed from SettingsWindow
    settingsStore.onFovChange = (fov: number) => {
      this.camera3d.fov = fov;
      this.camera3d.updateProjectionMatrix();
    };

    // Multi-source loading (debounced: rapid toggles coalesce into one loadSources call)
    let sourceChangeTimer: ReturnType<typeof setTimeout> | null = null;
    sourcesStore.onSourcesChange = async () => {
      if (sourceChangeTimer) clearTimeout(sourceChangeTimer);
      sourceChangeTimer = setTimeout(() => { sourceChangeTimer = null; this.loadSources(); }, 150);
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
      this.clearSelection();
    };

    // Command palette: deselect satellite by NORAD ID
    uiStore.onDeselectSatellite = (noradId: number) => {
      const sat = this.satByNorad.get(noradId);
      if (sat) this.deselectSat(sat);
    };

    // Command palette: toggle 2D/3D
    uiStore.onToggleViewMode = () => {
      if (this.viewMode === ViewMode.VIEW_SKY) return;
      if (this.orreryCtrl.isOrreryMode) return;
      this.viewMode = this.viewMode === ViewMode.VIEW_3D ? ViewMode.VIEW_2D : ViewMode.VIEW_3D;
      uiStore.viewMode = this.viewMode;
    };

    // Sky view toggle
    uiStore.onToggleSkyView = () => this.toggleSkyView();

    // Command palette: get satellite list for search
    uiStore.getSatelliteList = () => {
      return this.satellites.map(s => ({ noradId: s.noradId, name: s.name }));
    };
    uiStore.getSatelliteByIndex = (i: number) => {
      const s = this.satellites[i];
      return s ? { name: s.name, noradId: s.noradId } : null;
    };

    // Command palette: get selected satellite list
    uiStore.getSelectedSatelliteList = () => {
      return [...this.selectedSats].map(s => ({ noradId: s.noradId, name: s.name }));
    };

    // Command palette: select satellite by NORAD ID (adds to selection)
    uiStore.onSelectSatellite = (noradId: number) => {
      const sat = this.satByNorad.get(noradId);
      if (sat) this.selectSat(sat);
    };

    // Lock camera to satellite (same as double-click)
    uiStore.onLockCameraToSat = (noradId: number) => {
      const sat = this.satByNorad.get(noradId);
      if (!sat) return;
      if (!this.selectedSats.has(sat)) this.selectSat(sat);
      // In sky view, beam-lock instead of camera-lock
      if (this.viewMode === ViewMode.VIEW_SKY) {
        beamStore.lockToSatellite(noradId, sat.name);
        return;
      }
      const earthRotRad = (epochToGmst(timeStore.epoch) + this.cfg.earthRotationOffset) * DEG2RAD;
      if (this.activeLock !== TargetLock.SAT) {
        this.camera.setAngleX(this.camera.angleX + earthRotRad);
      }
      this.activeLock = TargetLock.SAT;
      this.lockedSat = sat;
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
      if (!uiStore.passesVisible) return;
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
    uiStore.onSelectSatFromNearbyPass = uiStore.onSelectSatellite;

    observerStore.onLocationChange = () => {
      if (uiStore.passesVisible && uiStore.passesTab === 'selected') this.requestPasses();
      if (uiStore.passesVisible && uiStore.passesTab === 'nearby') this.requestNearbyPasses();
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
    let sats: { noradId: number; name: string; line1: string; line2: string; colorIndex: number; stdMag: number | null }[] = [];
    let idx = 0;
    for (const sat of this.selectedSats) {
      sats.push({ noradId: sat.noradId, name: sat.name, line1: sat.tleLine1, line2: sat.tleLine2, colorIndex: idx, stdMag: sat.stdMag });
      idx++;
    }
    if (uiStore.passFreqMinMHz > 0 || uiStore.passFreqMaxMHz > 0) {
      const freqSet = getSatellitesByFreqRange(
        (uiStore.passFreqMinMHz || 0) * 1e6,
        (uiStore.passFreqMaxMHz || 50000) * 1e6,
      );
      sats = sats.filter(s => freqSet.has(s.noradId));
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

    let sats = filtered.map((sat, idx) => ({
      noradId: sat.noradId, name: sat.name, line1: sat.tleLine1, line2: sat.tleLine2, colorIndex: idx, stdMag: sat.stdMag,
    }));

    if (uiStore.passFreqMinMHz > 0 || uiStore.passFreqMaxMHz > 0) {
      const freqSet = getSatellitesByFreqRange(
        (uiStore.passFreqMinMHz || 0) * 1e6,
        (uiStore.passFreqMaxMHz || 50000) * 1e6,
      );
      sats = sats.filter(s => freqSet.has(s.noradId));
    }

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

  /** Transition from SAT lock (ECI frame) back to Earth co-rotation without visual jump. */
  private exitSatLock() {
    const earthRotRad = (epochToGmst(timeStore.epoch) + this.cfg.earthRotationOffset) * DEG2RAD;
    this.camera.setAngleX(this.camera.angleX - earthRotRad);
    this.activeLock = TargetLock.EARTH;
    this.lockedSat = null;
  }

  // Orbit scrub state
  private scrubStartCamAngleX = 0;
  private scrubBaseEpoch = 0;
  private scrubInitDM = 0;    // initial M offset from M0 (shortest path, clamped once at start)
  private scrubAccumM = 0;    // accumulated mean anomaly delta since first hit (continuous)
  private scrubLastM = 0;     // last raw M for wrap detection
  private scrubSat: Satellite | null = null;

  private tryStartOrbitScrub(): boolean {
    if (this.viewMode !== ViewMode.VIEW_3D) return false;
    this.raycaster.setFromCamera(this.input.mouseNDC, this.camera3d);
    this.scrubSat = this.selectedSats.values().next().value ?? null;
    if (!this.scrubSat) return false;
    const hit = this.orbitRenderer.scrubOrbitFromRay(
      this.raycaster, this.camera3d, this.input.mousePos, timeStore.epoch, 40, this.scrubSat,
    );
    if (!hit) return false;

    this.scrubStartCamAngleX = this.camera.angleX;
    this.scrubBaseEpoch = timeStore.epoch;
    this.scrubLastM = hit.M;
    this.scrubAccumM = 0;

    // Compute M0 (mean anomaly at base epoch) and initial offset to click point
    const sat = this.scrubSat;
    const TWO_PI = 2 * Math.PI;
    const deltaSec = epochToUnix(timeStore.epoch) - epochToUnix(sat.epochDays);
    let M0 = (sat.meanAnomaly + sat.meanMotion * deltaSec) % TWO_PI;
    if (M0 < 0) M0 += TWO_PI;
    let initDM = hit.M - M0;
    if (initDM > Math.PI) initDM -= TWO_PI;
    if (initDM < -Math.PI) initDM += TWO_PI;
    this.scrubInitDM = initDM;

    this.handleOrbitScrub();
    return true;
  }

  private handleOrbitScrub() {
    if (!this.scrubSat) return;
    this.raycaster.setFromCamera(this.input.mouseNDC, this.camera3d);
    const hit = this.orbitRenderer.scrubOrbitFromRay(
      this.raycaster, this.camera3d, this.input.mousePos, this.scrubBaseEpoch, 200, this.scrubSat,
    );
    if (!hit) return;

    // Track cumulative mean anomaly delta (detect wraps at M = 0/2π boundary)
    const TWO_PI = 2 * Math.PI;
    let dM = hit.M - this.scrubLastM;
    if (dM > Math.PI) dM -= TWO_PI;
    if (dM < -Math.PI) dM += TWO_PI;
    this.scrubAccumM += dM;
    this.scrubLastM = hit.M;

    // Total mean anomaly offset from M0 = initial offset + accumulated delta
    const totalDM = this.scrubInitDM + this.scrubAccumM;
    const epoch = this.scrubBaseEpoch + totalDM / this.scrubSat.meanMotion / 86400;

    timeStore.epoch = epoch;
    timeStore.paused = true;

    // Compensate camera for Earth rotation using continuous rate
    const epochDeltaDays = epoch - this.scrubBaseEpoch;
    const earthRotDelta = epochDeltaDays * 360.98564736629 * DEG2RAD;
    this.camera.setAngleX(this.scrubStartCamAngleX - earthRotDelta);
    this.renderer.domElement.style.cursor = 'grabbing';
  }

  /** Handle click/tap satellite selection */
  private handleClick() {
    // On touch, mouseNDC updates in touchstart but detectHover3D() may not
    // have run yet — do a fresh raycast if hoveredSat is still null
    if (!this.hoveredSat) {
      if (this.viewMode === ViewMode.VIEW_SKY) {
        this.detectHoverSky();
      } else if (this.viewMode === ViewMode.VIEW_3D) {
        this.detectHover3D();
      } else {
        this.hoveredSat = this.mapRenderer.detectHover(this.input.mousePos, this.camera2d, this.satellites, this.timeSystem.getGmstDeg(), this.cfg, this.hideUnselected, this.selectedSats, this.camera.zoom2d, this.input.touchCount);
      }
    }
    if (this.hoveredSat) this.toggleSat(this.hoveredSat);
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
    if (this.prevSelVersion !== this.selectedSatsVersion) {
      this.prevSelectedSats = new Set(this.selectedSats);
      this.prevSelVersion = this.selectedSatsVersion;
    }

    // Earth rotation (needed for target lock + camera update)
    const earthRotRad = (gmstDeg + this.cfg.earthRotationOffset) * DEG2RAD;
    const isSkyView = this.viewMode === ViewMode.VIEW_SKY;

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
    } else if (this.activeLock === TargetLock.SAT && this.lockedSat) {
      this.camera.setTarget3dXYZ(0, 0, 0);
    }

    // Expose lock target to UI
    const lockLabels: Record<number, string> = {
      [TargetLock.NONE]: 'None',
      [TargetLock.EARTH]: 'Earth',
      [TargetLock.MOON]: 'Moon',
      [TargetLock.SUN]: 'Sun',
      [TargetLock.PLANET]: this.orreryCtrl.currentPromotedPlanet?.body.name ?? 'Planet',
      [TargetLock.SAT]: this.lockedSat?.name ?? 'Satellite',
    };
    uiStore.lockTarget = lockLabels[this.activeLock] ?? 'Earth';

    // Set view offset to center earth above mobile sheet (35vh + 56px nav bar)
    if (uiStore.isMobile) {
      const sheetOffset = uiStore.activeMobileSheet
        ? (window.innerHeight * 0.35 + 56) / 2
        : 0;
      this.camera.setViewOffsetY(sheetOffset);
    }

    // Update sky-view camera origin + ground disc + grid
    if (this.camera.isSkyView && observerStore.isSet) {
      observerFrameInto(observerStore.location.lat, observerStore.location.lon, gmstDeg, this.cfg.earthRotationOffset, this._skyFrame);
      const f = this._skyFrame;
      this.camera.updateSkyOrigin(f.origin, f.up, f.north, f.east);
      // Position ground disc at observer, facing up
      this.skyGround.position.copy(f.origin);
      this.skyGround.quaternion.setFromUnitVectors(App.Z_AXIS, f.up);
      (this.skyGround.material as THREE.ShaderMaterial).uniforms.gmstRad.value = earthRotRad;
      this.skyGridRenderer.update(f.origin, f.up, f.north, f.east);
    }

    // Smooth camera lerp + update camera transforms
    const isOrreryOrPlanet = this.activeLock === TargetLock.PLANET || this.activeLock === TargetLock.SAT || this.orreryCtrl.isOrreryMode;
    this.camera.updateFrame(dt, earthRotRad, isOrreryOrPlanet);
    this.camera3d.updateMatrixWorld();

    // Project sky grid labels + beam reticle after camera update
    if (isSkyView) {
      this.skyGridRenderer.projectLabels(this.camera3d);
      this.updateSkyReticle();
    } else if (uiStore.skyReticle.visible) {
      uiStore.skyReticle = { x: 0, y: 0, radius: 0, visible: false };
    }

    // Hover detection — only recompute when pointer moved
    // Camera movement alone doesn't trigger hover recompute (user is orbiting, not hovering).
    // Stale hover persists during camera motion — corrected on next pointer move.
    const cp = this.camera3d.position;
    const cameraMoved = cp.x !== this._lastHoverCamX || cp.y !== this._lastHoverCamY || cp.z !== this._lastHoverCamZ;
    const hoverDirty = this.input.consumeHoverDirty();
    if (cameraMoved) {
      this._lastHoverCamX = cp.x;
      this._lastHoverCamY = cp.y;
      this._lastHoverCamZ = cp.z;
    }
    if (this.viewMode === ViewMode.VIEW_SKY) {
      // Sky view: recompute hover on mouse move OR camera move (sky rotates under cursor)
      if (hoverDirty || cameraMoved) {
        this.detectHoverSky();
        this.renderer.domElement.style.cursor = this.hoveredSat ? 'pointer' : 'crosshair';
      }
    } else if (this.input.isDraggingOrbit) {
      this.hoveredSat = null;
    } else if (this.input.isOverUI) {
      this.hoveredSat = null;
      this.renderer.domElement.style.cursor = '';
    } else if (this.orreryCtrl.isOrreryMode) {
      if (hoverDirty) {
        const hovered = this.orreryCtrl.updateHover(this.raycaster, this.input.mouseNDC);
        this.renderer.domElement.style.cursor = hovered ? 'pointer' : '';
      }
    } else if (hoverDirty && this.activeLock !== TargetLock.PLANET && this.activeLock !== TargetLock.MOON) {
      if (this.viewMode === ViewMode.VIEW_3D) {
        this.detectHover3D();
      } else {
        this.hoveredSat = this.mapRenderer.detectHover(this.input.mousePos, this.camera2d, this.satellites, this.timeSystem.getGmstDeg(), this.cfg, this.hideUnselected, this.selectedSats, this.camera.zoom2d, this.input.touchCount);
      }
    }

    // Track hover settle time (for delaying expensive hover effects like footprints)
    if (hoverDirty) this._hoverSettleFrames = 0;
    else this._hoverSettleFrames = Math.min(this._hoverSettleFrames + 1, 10);

    // Drag cursors (observer / orbit scrub)
    if (this.input.isDraggingObserver || this.input.isDraggingOrbit) {
      this.renderer.domElement.style.cursor = 'grabbing';
    } else if (!this.hoveredSat && !this.orreryCtrl.isOrreryMode && !this.input.isOverUI) {
      if (this.hitTestObserver()) {
        this.renderer.domElement.style.cursor = 'grab';
      } else if (this.viewMode === ViewMode.VIEW_3D && this.selectedSats.size > 0) {
        const firstSel = this.selectedSats.values().next().value;
        if (firstSel) {
          this.raycaster.setFromCamera(this.input.mouseNDC, this.camera3d);
          const near = this.orbitRenderer.scrubOrbitFromRay(this.raycaster, this.camera3d, this.input.mousePos, timeStore.epoch, 40, firstSel);
          this.renderer.domElement.style.cursor = near ? 'grab' : '';
        } else {
          this.renderer.domElement.style.cursor = '';
        }
      } else {
        this.renderer.domElement.style.cursor = '';
      }
    }

    // activeSat = hovered, or first selected if nothing hovered
    const firstSelected = this.selectedSats.size > 0 ? this.selectedSats.values().next().value! : null;
    const activeSat = this.hoveredSat ?? firstSelected;

    const earthMode = this.activeLock !== TargetLock.PLANET && this.activeLock !== TargetLock.MOON && !this.orreryCtrl.isOrreryMode;

    // Cursor lat/lon (skip when pointer is over UI or in sky view)
    if (earthMode && !isSkyView && !this.input.isOverUI) {
      if (this.viewMode === ViewMode.VIEW_3D) {
        this.raycaster.setFromCamera(this.input.mouseNDC, this.camera3d);
        const earthR = EARTH_RADIUS_KM / DRAW_SCALE;
        this.tmpSphere.set(this.tmpVec3.set(0, 0, 0), earthR);
        const hit = this.raycaster.ray.intersectSphere(this.tmpSphere, this.tmpVec3);
        if (hit) {
          this.tmpVec3.applyAxisAngle(App.Y_AXIS, -earthRotRad);
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

    // Tracking: lock aim (every frame), radar blips + sky path (throttled)
    if (observerStore.isSet && (uiStore.radarOpen || beamStore.locked || isSkyView)) {
      const obs = observerStore.location;
      this.tracker.update(this.satellites, this.selectedSats, epoch, gmstDeg, obs.lat, obs.lon, obs.alt, this.timeSystem.timeMultiplier);
    }

    if (this.viewMode === ViewMode.VIEW_3D || isSkyView) {
      // Update 3D scene (sky view shares the 3D scene but hides ground objects)
      if (!this.orreryCtrl.isOrreryMode && !isSkyView) {
        this.earth.update(epoch, gmstDeg, this.cfg.earthRotationOffset, this.cfg.showNightLights);
        if (earthMode) this.cloudLayer.update(epoch, gmstDeg, this.cfg.earthRotationOffset, this.cfg.showClouds, this.cfg.showNightLights);
      }
      // Moon + sun update in both orbital and sky view
      if (!this.orreryCtrl.isOrreryMode) {
        this.moonScene.update(epoch);
        this.sunScene.update(epoch);
      }

      // Geographic overlays rotate with Earth (hidden in sky view via setSkyViewVisible)
      if (!isSkyView) {
        this.geoOverlay.setRotation(earthRotRad);
        this.geoOverlay.set3dVisible(earthMode);
      }

      // Sun direction in ECI/world space
      const sunEciDir = calculateSunPosition(epoch).normalize();
      this.atmosphere.update(sunEciDir);
      this.moonScene.updateSunDir(sunEciDir);
      this.atmosphere.setVisible(this.atmosphereGlowEnabled && !isSkyView && this.activeLock !== TargetLock.PLANET && !this.orreryCtrl.isOrreryMode);

      // Orrery mode (includes promoted planet if any)
      this.orreryCtrl.updateFrame({
        dt,
        sunEciDir,
        showNightLights: this.cfg.showNightLights,
        gfx: this.gfx,
        timeMultiplier: this.timeSystem.timeMultiplier,
      });

      this.satManager.setVisible(earthMode || isSkyView);
      uiStore.earthTogglesVisible = earthMode && !isSkyView;
      uiStore.satTogglesVisible = earthMode || isSkyView;
      // Hide 2D marker labels in 3D mode
      this.mapRenderer.hideMarkerLabels();
      const showNight = earthMode || this.activeLock === TargetLock.MOON || this.activeLock === TargetLock.PLANET;
      uiStore.nightToggleVisible = showNight && !isSkyView;
      if (earthMode || isSkyView) {
        // Observer position in render coords for magnitude-based icon brightness
        let obsRenderPos: { x: number; y: number; z: number } | null = null;
        if (observerStore.isSet) {
          const oe = observerEci(observerStore.location.lat, observerStore.location.lon, observerStore.location.alt, gmstDeg * DEG2RAD);
          obsRenderPos = { x: oe.x, y: oe.z, z: -oe.y }; // ECI → render coords
        }
        this.satManager.update(
          this.satellites, this.camera3d.position,
          this.hoveredSat, this.selectedSats, this.selectedSatsVersion,
          this.unselectedFade, this.hideUnselected,
          { normal: this.cfg.satNormal, highlighted: this.cfg.satHighlighted, selected: this.cfg.satSelected },
          this.bloomEnabled, this.fadingInSats, sunEciDir, obsRenderPos, dt,
        );

        // Orbits — visible in both 3D and sky view
        this.orbitRenderer.update(
          this.satellites, epoch, this.hoveredSat, this.selectedSats,
          this.selectedSatsVersion, this.unselectedFade, this.sim.orbitsToDraw,
          { orbitNormal: this.cfg.orbitNormal, orbitHighlighted: this.cfg.orbitHighlighted },
          this.camera3d.position, gmstDeg, this.cfg.earthRotationOffset,
        );
        // In sky view, hide ground-reference lines (nadir from Earth center, observer-to-sat)
        if (isSkyView) this.orbitRenderer.hideGroundLines();

        if (!isSkyView) {
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
            if (this.hoveredSat && !this.selectedSats.has(this.hoveredSat) && this._hoverSettleFrames >= 6) {
              const rc = ORBIT_COLORS[this.selectedSats.size % ORBIT_COLORS.length];
              fpEntries.push({
                position: (this.hoveredSat as Satellite).currentPos,
                color: rc as [number, number, number],
              });
            }
          }
          this.footprintRenderer.update(fpEntries);

          // Beam cone visualization
          if (observerStore.isSet && beamStore.coneVisible) {
            const obs = observerStore.location;
            this.beamConeRenderer.update(
              obs.lat, obs.lon, gmstDeg, this.cfg.earthRotationOffset,
              beamStore.aimAz, beamStore.aimEl, beamStore.beamWidth, true,
              beamStore.locked ? beamStore.trackRange : null,
            );
          } else {
            this.beamConeRenderer.hide();
          }

          this.markerManager.update(gmstDeg, this.cfg.earthRotationOffset, this.camera3d, this.camera.distance);
        }
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
      this.beamConeRenderer.hide();
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
    if (uiStore.passesVisible && this.lastPassSatsVersion !== this.selectedSatsVersion) {
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
      // Lazy sky path: enrich with per-point shadow + magnitude for polar plot bloom
      // Worker provides ~60 points with shadowFactor but no mag; recompute with mag on first view
      // Use rangeKm as sentinel — worker doesn't provide it, so undefined means not yet enriched
      const needsMag = pass.skyPath.length === 0 || pass.skyPath[0].rangeKm === undefined;
      if (needsMag) {
        const sat = this.satByNorad.get(pass.satNoradId);
        if (sat) {
          const pathStep = (pass.losEpoch - pass.aosEpoch) / 99;
          if (pathStep > 0) {
            const path: { az: number; el: number; t: number; shadowFactor?: number; mag?: number; rangeKm?: number }[] = [];
            const obs = observerStore.location;
            // Sun/Moon barely move during a pass — compute once at midpoint
            const midEpoch = (pass.aosEpoch + pass.losEpoch) / 2;
            const sunDir = sunDirectionECI(midEpoch);
            const moonEci = moonPositionECI(midEpoch);
            const checkSolarEcl = solarEclipsePossible(moonEci, sunDir);
            let bestMag = Infinity;
            for (let k = 0; k < 100; k++) {
              const pt = pass.aosEpoch + k * pathStep;
              const date = new Date(epochToUnix(pt) * 1000);
              const result = propagate(sat.satrec, date);
              if (result.position && typeof result.position !== 'boolean') {
                const eci = result.position as { x: number; y: number; z: number };
                const g = epochToGmst(pt) * (Math.PI / 180);
                const ae = getAzEl(eci.x, eci.y, eci.z, g, obs.lat, obs.lon, obs.alt);
                // Shadow factor (Earth + Moon shadow)
                let sf = earthShadowFactor(eci.x, eci.y, eci.z, sunDir);
                if (sf >= 1.0 && checkSolarEcl && isSolarEclipsed(eci.x, eci.y, eci.z, moonEci, sunDir)) sf = 0.0;
                // Per-point slant range + magnitude
                const obsPos = observerEci(obs.lat, obs.lon, obs.alt, g);
                const rangeKm = slantRange(eci, obsPos);
                let mag: number | undefined;
                if (sf > 0 && sat.stdMag !== null) {
                  const phase = computePhaseAngle(eci, sunDir, obsPos);
                  mag = estimateVisualMagnitude(sat.stdMag, rangeKm, phase, ae.el);
                  if (mag < bestMag) bestMag = mag;
                }
                path.push({ az: ae.az, el: ae.el, t: pt, shadowFactor: sf, mag, rangeKm });
              }
            }
            pass.skyPath = path;
            // Update peakMag with true brightest point
            if (bestMag < Infinity) pass.peakMag = Math.round(bestMag * 100) / 100;
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
    // Double-click on a hovered satellite → lock camera to it
    if (this.hoveredSat) {
      // Transition from Earth co-rotation to ECI frame without visual jump:
      // camAX was = _camAngleX + earthRotRad; in SAT mode it becomes = _camAngleX + 0
      // So add earthRotRad to _camAngleX to keep the same visual angle
      const earthRotRad = (epochToGmst(timeStore.epoch) + this.cfg.earthRotationOffset) * DEG2RAD;
      this.camera.setAngleX(this.camera.angleX + earthRotRad);
      this.activeLock = TargetLock.SAT;
      this.lockedSat = this.hoveredSat;
      if (!this.selectedSats.has(this.hoveredSat)) this.toggleSat(this.hoveredSat);
      return;
    }

    // Double-click on observer marker → enter sky view
    if (this.hitTestObserver()) {
      this.enterSkyView();
      return;
    }

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
    else if (earthHit) { this.activeLock = TargetLock.EARTH; this.lockedSat = null; }
    else if (this.selectedSats.size > 0) { this.clearSelection(); }
  }

  /** Sky-view hover: screen-space approach — project each satellite to screen
   *  and check pixel distance to mouse. Guarantees hover matches visual dot position. */
  private detectHoverSky() {
    const touchScale = this.input.isTouchActive ? 2.0 : 1.0;
    const hitPx = 16 * touchScale; // pixel radius for hit detection
    const retainPx = 24 * touchScale; // larger radius for hysteresis
    const camPos = this.camera3d.position;
    const up = this.camera.skyUp;
    const mousePos = this.input.mousePos; // screen pixels
    const halfW = window.innerWidth * 0.5;
    const halfH = window.innerHeight * 0.5;

    // Hysteresis: keep current hover if still within retention zone
    if (this.hoveredSat && !this.hoveredSat.decayed) {
      this.tmpVec3.copy(this.hoveredSat.currentPos).divideScalar(DRAW_SCALE);
      // Check above horizon
      this.tmpVec3.sub(camPos);
      const aboveHorizon = this.tmpVec3.dot(up) >= 0;
      this.tmpVec3.add(camPos);
      if (aboveHorizon) {
        this.tmpVec3.project(this.camera3d);
        if (this.tmpVec3.z < 1) {
          const sx = (this.tmpVec3.x + 1) * halfW;
          const sy = (-this.tmpVec3.y + 1) * halfH;
          const dx = sx - mousePos.x;
          const dy = sy - mousePos.y;
          if (dx * dx + dy * dy < retainPx * retainPx) return;
        }
      }
    }

    this.hoveredSat = null;
    let closestDist2 = hitPx * hitPx;
    for (const sat of this.satellites) {
      if (sat.decayed) continue;
      if (this.hideUnselected && this.selectedSats.size > 0 && !this.selectedSats.has(sat)) continue;

      this.tmpVec3.copy(sat.currentPos).divideScalar(DRAW_SCALE);
      // Skip satellites below horizon
      this.tmpVec3.sub(camPos);
      if (this.tmpVec3.dot(up) < 0) continue;
      this.tmpVec3.add(camPos);

      // Project to screen
      this.tmpVec3.project(this.camera3d);
      if (this.tmpVec3.z > 1) continue; // behind camera or beyond far plane

      const sx = (this.tmpVec3.x + 1) * halfW;
      const sy = (-this.tmpVec3.y + 1) * halfH;
      const dx = sx - mousePos.x;
      const dy = sy - mousePos.y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < closestDist2) {
        closestDist2 = dist2;
        this.hoveredSat = sat;
      }
    }
  }

  private detectHover3D() {
    this.raycaster.setFromCamera(this.input.mouseNDC, this.camera3d);
    const touchScale = this.input.isTouchActive ? 2.0 : 1.0;
    const earthR = EARTH_RADIUS_KM / DRAW_SCALE;
    const camPos = this.camera3d.position;

    // Compute distance from camera to Earth surface along the ray
    // If ray hits Earth, any satellite beyond that distance is behind Earth
    const rd = this.raycaster.ray.direction;
    const oc = camPos; // ray origin
    const b = 2 * (oc.x * rd.x + oc.y * rd.y + oc.z * rd.z);
    const c = oc.x * oc.x + oc.y * oc.y + oc.z * oc.z - earthR * earthR;
    const disc = b * b - 4 * c;
    const earthHitDist = disc > 0 ? (-b - Math.sqrt(disc)) / 2 : Infinity;

    // Hysteresis: keep current hover with a larger retention radius to prevent blinking
    if (this.hoveredSat && !this.hoveredSat.decayed) {
      this.tmpVec3.copy(this.hoveredSat.currentPos).divideScalar(DRAW_SCALE);
      const distToCam = camPos.distanceTo(this.tmpVec3);
      if (distToCam <= earthHitDist) {
        const retainRadius = 0.022 * distToCam * touchScale;
        this.tmpSphere.set(this.tmpVec3, retainRadius);
        if (this.raycaster.ray.intersectsSphere(this.tmpSphere)) {
          return; // still within retention zone, keep current hover
        }
      }
    }

    this.hoveredSat = null;
    let closestRayDist = 9999;
    for (const sat of this.satellites) {
      if (sat.decayed) continue;
      if (this.hideUnselected && this.selectedSats.size > 0 && !this.selectedSats.has(sat)) continue;

      this.tmpVec3.copy(sat.currentPos).divideScalar(DRAW_SCALE);
      const distToCam = camPos.distanceTo(this.tmpVec3);

      // Skip satellites behind Earth's surface
      if (distToCam > earthHitDist) continue;

      const hitRadius = 0.015 * distToCam * touchScale;
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
