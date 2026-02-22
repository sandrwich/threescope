import * as THREE from 'three';
import type { Satellite, SelectedSatInfo } from './types';
import { TargetLock, ViewMode } from './types';
import { defaultConfig, parseHexColor } from './config';
import { DRAW_SCALE, EARTH_RADIUS_KM, MOON_RADIUS_KM, MU, RAD2DEG, DEG2RAD, MAP_W, MAP_H, TWO_PI } from './constants';
import { TimeSystem } from './simulation/time-system';
import { Earth } from './scene/earth';
import { CloudLayer } from './scene/cloud-layer';
import { MoonScene } from './scene/moon-scene';
import { SunScene } from './scene/sun-scene';
import { SatelliteManager } from './scene/satellite-manager';
import { OrbitRenderer, ORBIT_COLORS } from './scene/orbit-renderer';
import { FootprintRenderer, type FootprintEntry } from './scene/footprint-renderer';
import { MarkerManager } from './scene/marker-manager';
import { PostProcessing } from './scene/post-processing';
import { getMinZoom, BODIES, PLANETS, type PlanetDef } from './bodies';
import { type GraphicsSettings, PRESETS, DEFAULT_PRESET, findMatchingPreset, getPresetSettings } from './graphics';
import { type SimulationSettings, DEFAULT_SIM_PRESET, findMatchingSimPreset, getSimPresetSettings } from './simulation';
import { Orrery, type PromotedPlanet } from './scene/orrery';
import { Atmosphere } from './scene/atmosphere';
import { MapRenderer } from './scene/map-renderer';
import { CameraController } from './interaction/camera-controller';
import { computeApsis, computeApsis2D } from './astro/apsis';
import { getMapCoordinates } from './astro/coordinates';
import { calculateSunPosition } from './astro/sun';
import { fetchTLEData, parseTLEText, clearRateLimit, type FetchResult } from './data/tle-loader';
import { TLE_SOURCES, DEFAULT_GROUP } from './data/tle-sources';
import { timeStore } from './stores/time.svelte';
import { uiStore } from './stores/ui.svelte';
import { settingsStore } from './stores/settings.svelte';

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
  private activePlanet: PlanetDef | null = null;
  private promotedPlanet: PromotedPlanet | null = null;
  private pendingHiTex: THREE.Texture | null = null;
  private orrery: Orrery | null = null;

  // Mini planet spinner for the picker button
  private miniRenderer!: THREE.WebGLRenderer;
  private miniScene = new THREE.Scene();
  private miniCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 10);
  private miniSphere!: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private miniTextureId = '';

  private satellites: Satellite[] = [];
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
  private smallmarkTex!: THREE.Texture;

  // Mouse/touch state
  private mousePos = new THREE.Vector2();
  private mouseNDC = new THREE.Vector2();
  private lastLeftClickTime = 0;
  private isRightDragging = false;
  private mouseDelta = new THREE.Vector2();
  private touchCount = 0;
  private lastTouchPos = new THREE.Vector2();
  private lastPinchDist = 0;
  private lastTwoTouchCenter = new THREE.Vector2();
  private touchMoved = false;

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
    this.scene3d.background = new THREE.Color(this.cfg.bgColor);

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
    this.scene2d.background = new THREE.Color(this.cfg.bgColor);

    this.setLoading(0.2, 'Loading textures...');
    await this.loadTextures();

    const savedGroup = localStorage.getItem('threescope_tle_group') || 'none';
    this.setLoading(0.6, 'Fetching satellite data...');
    await this.loadTLEGroup(savedGroup);

    this.setLoading(0.9, 'Setting up...');
    this.wireStores();
    this.setupEvents();

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

    const [dayTex, nightTex, cloudTex, moonTex, satTex, markerTex, starTex, smallmarkTex] = await Promise.all([
      load('/textures/earth/color.webp'),
      load('/textures/earth/night.webp'),
      load('/textures/earth/clouds.webp'),
      load('/textures/moon/color.webp'),
      load('/textures/ui/sat_icon.png'),
      load('/textures/ui/marker_icon.png'),
      load('/textures/stars.webp'),
      load('/textures/ui/smallmark.png'),
    ]);
    this.smallmarkTex = smallmarkTex;

    // Match Raylib's texture behavior:
    // - flipY=false: Raylib/OpenGL doesn't flip, and our custom GenEarthMesh UVs
    //   expect v=0 at the top of the texture (north pole). Three.js flipY=true
    //   would invert this.
    // - NoColorSpace: Our custom shaders read raw texture values like Raylib does,
    //   no sRGB→linear conversion needed.
    for (const tex of [dayTex, nightTex, cloudTex, moonTex]) {
      tex.flipY = false;
      tex.colorSpace = THREE.NoColorSpace;
    }

    // Star background (equirectangular → 3D skybox)
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
    const overlay = document.getElementById('svelte-ui')!;
    this.markerManager = new MarkerManager(this.scene3d, this.cfg.markerGroups, markerTex, overlay);

    this.mapRenderer = new MapRenderer(this.scene2d, {
      dayTex, nightTex, satTex, smallmarkTex,
      markerGroups: this.cfg.markerGroups,
      overlay,
      cfg: this.cfg,
    });

    // 3D apsis sprites (diamond icons at periapsis/apoapsis)
    const periMat = new THREE.SpriteMaterial({ map: smallmarkTex, color: 0x87ceeb, depthTest: false, transparent: true });
    this.periSprite3d = new THREE.Sprite(periMat);
    this.periSprite3d.scale.set(0.03, 0.03, 1);
    this.periSprite3d.visible = false;
    this.scene3d.add(this.periSprite3d);

    const apoMat = new THREE.SpriteMaterial({ map: smallmarkTex, color: 0xffa500, depthTest: false, transparent: true });
    this.apoSprite3d = new THREE.Sprite(apoMat);
    this.apoSprite3d.scale.set(0.03, 0.03, 1);
    this.apoSprite3d.visible = false;
    this.scene3d.add(this.apoSprite3d);
  }

  private currentGroup = DEFAULT_GROUP;

  async loadTLEGroup(group: string, forceRetry = false) {
    this.currentGroup = group;
    if (group === 'none') {
      this.satellites = [];
      this.selectedSats.clear(); this.selectedSatsVersion++;
      this.hoveredSat = null;
      this.orbitRenderer.precomputeOrbits([], this.timeSystem.currentEpoch);
      uiStore.satStatusText = '0 sats';
      return;
    }
    try {
      const result = await fetchTLEData(group, (msg) => {
        uiStore.satStatusText = msg;
      }, forceRetry);
      this.satellites = result.satellites;
      this.selectedSats.clear(); this.selectedSatsVersion++;
      this.hoveredSat = null;
      this.orbitRenderer.precomputeOrbits(this.satellites, this.timeSystem.currentEpoch);

      let info = `${this.satellites.length} sats`;
      if (result.source === 'cache' && result.cacheAge != null) {
        info += ` (${formatAge(result.cacheAge)})`;
      } else if (result.source === 'stale-cache' && result.cacheAge != null) {
        info += ` (offline, ${formatAge(result.cacheAge)})`;
      }
      if (result.rateLimited) info += ' — rate limited';
      uiStore.satStatusText = info;
    } catch (e) {
      console.error('Failed to load TLE data:', e);
      const rl = (e as any)?.rateLimited === true;
      uiStore.satStatusText = rl ? 'Rate limited' : 'Load failed';
    }
  }

  private loadCustomTLE(text: string, label: string) {
    try {
      this.satellites = parseTLEText(text);
      this.selectedSats.clear(); this.selectedSatsVersion++;
      this.hoveredSat = null;
      this.orbitRenderer.precomputeOrbits(this.satellites, this.timeSystem.currentEpoch);
      uiStore.satStatusText = `${this.satellites.length} Sats (${label})`;
    } catch (e) {
      console.error('Failed to parse TLE data:', e);
      uiStore.satStatusText = 'Parse failed';
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

  /** Check if a URL is already cached (service worker, browser cache, etc.) */
  private async isCached(url: string): Promise<boolean> {
    try {
      // Check Cache API (service worker / PWA cache)
      const keys = await caches.keys();
      for (const key of keys) {
        const cache = await caches.open(key);
        if (await cache.match(url)) return true;
      }
      // Check browser HTTP cache
      const resp = await fetch(url, { method: 'HEAD', cache: 'only-if-cached', mode: 'same-origin' });
      return resp.ok;
    } catch {
      return false;
    }
  }

  /** Promote the focused orrery body to planet view (upgrade material, load hi-res) */
  private async promoteToPlanetView(planet: PlanetDef) {
    if (!this.orrery || this.activePlanet?.id === planet.id) return;

    this.setEarthVisible(false);
    this.selectedSats.clear(); this.selectedSatsVersion++;
    this.hoveredSat = null;
    this.activePlanet = planet;
    this.activeLock = TargetLock.PLANET;
    this.updatePlanetPickerUI();

    // Upgrade orrery ball material to sun-lit shader (in place, no new mesh)
    this.promotedPlanet = this.orrery.promoteBody(planet.id);

    // Tauri bundles all assets locally — always instant. Also check browser cache.
    const local = '__TAURI__' in window;
    const cached = local || await this.isCached(planet.textureUrl);
    if (cached && this.activePlanet?.id === planet.id && this.promotedPlanet) {
      const loader = new THREE.TextureLoader();
      loader.load(planet.textureUrl, (hiTex) => {
        hiTex.colorSpace = THREE.SRGBColorSpace;
        if (this.activePlanet?.id === planet.id && this.promotedPlanet) {
          this.promotedPlanet.material.uniforms.map.value = hiTex;
        } else {
          hiTex.dispose();
        }
      });
      return;
    }

    // Not cached — load in background, swap once camera settles
    this.pendingHiTex = null;
    const loader = new THREE.TextureLoader();
    loader.load(planet.textureUrl, (hiTex) => {
      hiTex.colorSpace = THREE.SRGBColorSpace;
      if (this.activePlanet?.id === planet.id && this.promotedPlanet) {
        this.pendingHiTex = hiTex;
      } else {
        hiTex.dispose();
      }
    });
  }

  private unpromoteToOrrery() {
    this.activePlanet = null;
    this.promotedPlanet = null;
    if (this.pendingHiTex) { this.pendingHiTex.dispose(); this.pendingHiTex = null; }
    this.activeLock = TargetLock.NONE;
    // Recreate orrery (promotion destroyed the original material)
    this.exitOrrery();
    this.enterOrrery();
  }

  private navigateToEarth() {
    this.exitOrrery();
    this.activePlanet = null;
    this.promotedPlanet = null;
    if (this.pendingHiTex) { this.pendingHiTex.dispose(); this.pendingHiTex = null; }
    this.activeLock = TargetLock.EARTH;
    this.setEarthVisible(true);
    this.camera.setTarget3dXYZ(0, 0, 0);
    this.updatePlanetPickerUI();
  }

  private updatePlanetPickerUI() {
    const thumbUrl = this.activePlanet?.thumbnailUrl ?? '/textures/earth/thumb.webp';
    if (this.miniTextureId !== thumbUrl) {
      this.miniTextureId = thumbUrl;
      new THREE.TextureLoader().load(thumbUrl, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        const old = this.miniSphere.material.map;
        this.miniSphere.material.map = tex;
        this.miniSphere.material.needsUpdate = true;
        if (old) old.dispose();
      });
    }
    uiStore.activePlanetId = this.activePlanet?.id ?? null;
  }

  private orreryMode = false;

  private enterOrrery() {
    if (this.orreryMode) return;
    this.viewMode = ViewMode.VIEW_3D;
    uiStore.viewMode = ViewMode.VIEW_3D;
    this.orreryMode = true;
    this.activePlanet = null;
    this.promotedPlanet = null;
    uiStore.orreryMode = true;

    // Create orrery (vertical on portrait screens)
    this.orrery = new Orrery(this.camera3d.aspect);
    this.scene3d.add(this.orrery.group);

    // Hide Earth/moon/sats
    this.setEarthVisible(false);
    this.selectedSats.clear(); this.selectedSatsVersion++;
    this.hoveredSat = null;

    // Position camera to fit all planets with some padding
    this.activeLock = TargetLock.NONE;
    const halfSpan = this.orrery.totalSpan / 2 + 6; // padding for outermost spheres + labels
    const vFov = this.camera3d.fov * Math.PI / 360; // half vertical FOV in radians
    if (this.orrery.vertical) {
      // Look straight on; offset target slightly right to account for side labels
      this.camera.setTarget3dXYZ(2, 0, 0);
      this.camera.setTargetDistance(halfSpan / Math.tan(vFov));
      this.camera.setTargetAngles(0, 0);
    } else {
      this.camera.setTarget3dXYZ(0, 0, 0);
      const hFov = Math.atan(Math.tan(vFov) * this.camera3d.aspect);
      this.camera.setTargetDistance(halfSpan / Math.tan(hFov));
      this.camera.setTargetAngles(0, 0.3);
    }
  }

  private exitOrrery() {
    if (!this.orreryMode) return;
    this.orreryMode = false;
    uiStore.orreryMode = false;

    if (this.orrery) {
      this.scene3d.remove(this.orrery.group);
      this.orrery.dispose();
      this.orrery = null;
    }
  }

  private handleOrreryClick() {
    if (!this.orrery) return;

    this.raycaster.setFromCamera(this.mouseNDC, this.camera3d);
    const hit = this.orrery.pick(this.raycaster);
    if (!hit) return;

    // Earth/Moon have dedicated scenes — navigate immediately with matching zoom
    if (hit.id === 'earth') {
      this.navigateToEarth();
      this.camera.snapDistance(10.5);
      this.camera.snapTarget3dXYZ(0, 0, 0);
      return;
    } else if (hit.id === 'moon') {
      this.navigateToEarth();
      this.activeLock = TargetLock.MOON;
      // Snap camera to moon immediately — no long fly-in from orrery position
      this.camera.snapTarget3d(this.moonScene.drawPos);
      this.camera.snapDistance(3.0);
      return;
    }

    // Other planets: snap camera to the ball, promote in place
    this.orrery.focusBody(hit.id);
    const pos = this.orrery.getBodyPosition(hit.id);
    const bodyR = this.orrery.getBodyDrawRadius(hit.id);
    if (pos) {
      this.camera.snapTarget3d(pos);
      this.camera.snapDistance(bodyR * 3.5);
    }

    if (hit.planetDef) {
      this.promoteToPlanetView(hit.planetDef);
    }
  }

  /** Wire Svelte stores ↔ App communication */
  private wireStores() {
    const earthDrawR = EARTH_RADIUS_KM / DRAW_SCALE;

    // --- Load persisted settings from localStorage ---
    settingsStore.load();
    uiStore.loadToggles();
    uiStore.loadMarkerGroups(this.cfg.markerGroups);

    // Apply initial toggle values
    this.hideUnselected = uiStore.hideUnselected;
    this.orbitRenderer.showNormalOrbits = uiStore.showOrbits;
    this.cfg.showClouds = uiStore.showClouds;
    this.cfg.showNightLights = uiStore.showNightLights;
    this.moonScene.setShowNight(uiStore.showNightLights);
    if (!uiStore.showSkybox) this.scene3d.background = new THREE.Color(this.cfg.bgColor);

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

    // --- Register callbacks from Svelte → App ---

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
          this.scene3d.background = value ? this.starTex : new THREE.Color(this.cfg.bgColor);
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

    // TLE group changed from TlePicker
    uiStore.onTLEGroupChange = async (group: string) => {
      this.setLoading(0.5, 'Loading satellite data...');
      this.loadingScreen.style.display = 'flex';
      await this.loadTLEGroup(group);
      this.loadingScreen.style.display = 'none';
    };

    // Custom TLE file loaded
    uiStore.onCustomTLELoad = (text: string, name: string) => {
      this.loadCustomTLE(text, name);
    };

    // Custom TLE URL
    uiStore.onCustomTLEUrl = async (url: string) => {
      this.setLoading(0.5, 'Fetching TLE from URL...');
      this.loadingScreen.style.display = 'flex';
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        this.loadCustomTLE(text, 'URL');
      } catch (e) {
        console.error('Failed to fetch TLE URL:', e);
        uiStore.satStatusText = 'URL fetch failed';
      }
      this.loadingScreen.style.display = 'none';
    };

    // Planet button clicked
    uiStore.onPlanetButtonClick = () => {
      if (this.promotedPlanet) {
        this.unpromoteToOrrery();
      } else if (this.orreryMode) {
        this.exitOrrery();
        this.navigateToEarth();
      } else {
        this.enterOrrery();
      }
    };

    // Command palette: navigate to body by id
    uiStore.onNavigateTo = (id: string) => {
      if (id === 'earth') {
        if (this.orreryMode) this.navigateToEarth();
        else { this.activeLock = TargetLock.EARTH; this.camera.setTarget3dXYZ(0, 0, 0); }
      } else if (id === 'moon') {
        if (this.orreryMode) this.navigateToEarth();
        this.activeLock = TargetLock.MOON;
      } else if (id === 'solar-system') {
        if (!this.orreryMode) this.enterOrrery();
      } else {
        // Planet — enter orrery if not in it, then promote
        const planet = PLANETS.find(p => p.id === id);
        if (!planet) return;
        if (!this.orreryMode) this.enterOrrery();
        // Wait a frame for orrery to initialize
        requestAnimationFrame(() => this.promoteToPlanetView(planet));
      }
    };

    // Command palette: deselect all satellites
    uiStore.onDeselectAll = () => {
      this.selectedSats.clear(); this.selectedSatsVersion++;
    };

    // Command palette: deselect satellite by name
    uiStore.onDeselectSatelliteByName = (name: string) => {
      for (const sat of this.selectedSats) {
        if (sat.name === name) {
          this.selectedSats.delete(sat);
          this.selectedSatsVersion++;
          break;
        }
      }
    };

    // Command palette: toggle 2D/3D
    uiStore.onToggleViewMode = () => {
      if (this.orreryMode) return;
      this.viewMode = this.viewMode === ViewMode.VIEW_3D ? ViewMode.VIEW_2D : ViewMode.VIEW_3D;
      uiStore.viewMode = this.viewMode;
    };

    // Command palette: get satellite names for search
    uiStore.getSatelliteNames = () => {
      return this.satellites.map(s => s.name);
    };

    // Command palette: get selected satellite names
    uiStore.getSelectedSatelliteNames = () => {
      return [...this.selectedSats].map(s => s.name);
    };

    // Command palette: select satellite by name (adds to selection)
    uiStore.onSelectSatelliteByName = (name: string) => {
      const sat = this.satellites.find(s => s.name === name);
      if (sat) {
        this.selectedSats.add(sat);
        this.selectedSatsVersion++;
      }
    };

    // Mini planet renderer — wait for Svelte to mount the canvas
    this.initMiniRenderer();

    this.updatePlanetPickerUI();
  }

  /** Initialize the mini planet renderer once the Svelte canvas is available */
  private initMiniRenderer() {
    const tryInit = () => {
      const miniCanvas = uiStore.planetCanvasEl;
      if (!miniCanvas) {
        requestAnimationFrame(tryInit);
        return;
      }
      this.miniRenderer = new THREE.WebGLRenderer({ canvas: miniCanvas, alpha: true, antialias: true });
      this.miniRenderer.setSize(56, 56);
      this.miniRenderer.setPixelRatio(window.devicePixelRatio);
      const geo = new THREE.SphereGeometry(1, 32, 32);
      const mat = new THREE.MeshBasicMaterial();
      this.miniSphere = new THREE.Mesh(geo, mat);
      this.miniScene.add(this.miniSphere);
      this.miniCamera.position.z = 3.2;
      this.updatePlanetPickerUI();
    };
    tryInit();
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
    this.orbitRenderer.setOrbitMode(s.orbitMode);
    this.orbitRenderer.setOrbitSegments(s.orbitSegments);
    this.orbitRenderer.setJ2Enabled(s.j2Precession);
    this.orbitRenderer.setDragEnabled(s.atmosphericDrag);
    this.maxBatch = s.updateQuality;
  }

  private setupEvents() {
    // Resize
    window.addEventListener('resize', () => {
      const w = window.innerWidth, h = window.innerHeight;
      this.renderer.setSize(w, h);
      this.camera3d.aspect = w / h;
      this.camera3d.updateProjectionMatrix();
      this.postProcessing.setSize(w, h);
      this.camera.updateCamera2dProjection();
    });

    // Mouse tracking
    window.addEventListener('mousemove', (e) => {
      const dx = e.movementX, dy = e.movementY;
      this.mouseDelta.set(dx, dy);
      this.mousePos.set(e.clientX, e.clientY);
      this.mouseNDC.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );

      if (this.isRightDragging) {
        if (this.viewMode === ViewMode.VIEW_2D) {
          // Pan 2D
          this.camera.pan2d(dx, dy);
          this.activeLock = TargetLock.NONE;
        } else {
          // Orbit 3D
          if (e.shiftKey) {
            this.camera.pan3d(dx, dy);
            this.activeLock = TargetLock.NONE;
          } else {
            this.camera.orbit(dx, dy);
          }
        }
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (e.button === 2) this.isRightDragging = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.isRightDragging = false;
    });

    // Prevent context menu
    this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    // Scroll zoom
    this.renderer.domElement.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = -Math.sign(e.deltaY);
      if (this.viewMode === ViewMode.VIEW_2D) {
        this.camera.applyZoom2d(delta);
        this.activeLock = TargetLock.NONE;
      } else {
        this.camera.applyZoom3d(delta, getMinZoom(this.activeLock));
      }
    }, { passive: false });

    // Click selection
    this.renderer.domElement.addEventListener('click', (e) => {
      // Ignore clicks on UI area
      if (e.clientX < 220 && e.clientY > 110 && e.clientY < 210) return;

      // Orrery mode: pick planet
      if (this.orreryMode) {
        this.handleOrreryClick();
        return;
      }

      // Toggle selection: click adds/removes, empty click does nothing
      if (this.hoveredSat) {
        if (this.selectedSats.has(this.hoveredSat)) {
          this.selectedSats.delete(this.hoveredSat);
        } else {
          this.selectedSats.add(this.hoveredSat);
        }
        this.selectedSatsVersion++;
      }

      // Double click detection for target lock
      const now = performance.now() / 1000;
      if (now - this.lastLeftClickTime < 0.3) {
        if (this.viewMode === ViewMode.VIEW_3D) {
          this.handleDoubleClickLock();
        } else {
          this.activeLock = TargetLock.EARTH;
        }
      }
      this.lastLeftClickTime = now;
    });

    // Keyboard
    window.addEventListener('keydown', (e) => {
      // Ctrl+K: open command palette, Ctrl+F: open satellite search
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'f')) {
        e.preventDefault();
        uiStore.commandPaletteSatMode = e.key === 'f';
        uiStore.commandPaletteOpen = true;
        return;
      }

      // Ignore if typing in input/select elements
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          timeStore.togglePause();
          break;
        case '.':
          timeStore.stepForward();
          break;
        case ',':
          timeStore.stepBackward();
          break;
        case '/':
          if (e.shiftKey) timeStore.jumpToNow();
          else timeStore.resetSpeed();
          break;
        case 'm':
        case 'M':
          if (!this.orreryMode) {
            this.viewMode = this.viewMode === ViewMode.VIEW_3D ? ViewMode.VIEW_2D : ViewMode.VIEW_3D;
            uiStore.viewMode = this.viewMode;
          }
          break;
      }
    });

    // Touch events
    const canvas = this.renderer.domElement;

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.touchCount = e.touches.length;
      this.touchMoved = false;

      if (e.touches.length === 1) {
        this.lastTouchPos.set(e.touches[0].clientX, e.touches[0].clientY);
        this.mousePos.set(e.touches[0].clientX, e.touches[0].clientY);
        this.mouseNDC.set(
          (e.touches[0].clientX / window.innerWidth) * 2 - 1,
          -(e.touches[0].clientY / window.innerHeight) * 2 + 1
        );
      } else if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        this.lastPinchDist = Math.sqrt(dx * dx + dy * dy);
        this.lastTwoTouchCenter.set(
          (e.touches[0].clientX + e.touches[1].clientX) / 2,
          (e.touches[0].clientY + e.touches[1].clientY) / 2
        );
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this.touchMoved = true;

      if (e.touches.length === 1 && this.touchCount === 1) {
        // Single finger: orbit (3D) or pan (2D)
        const tx = e.touches[0].clientX, ty = e.touches[0].clientY;
        const dx = tx - this.lastTouchPos.x;
        const dy = ty - this.lastTouchPos.y;
        this.lastTouchPos.set(tx, ty);
        this.mousePos.set(tx, ty);
        this.mouseNDC.set(
          (tx / window.innerWidth) * 2 - 1,
          -(ty / window.innerHeight) * 2 + 1
        );

        if (this.viewMode === ViewMode.VIEW_2D) {
          this.camera.pan2d(dx, dy);
          this.activeLock = TargetLock.NONE;
        } else {
          this.camera.orbit(dx, dy);
        }
      } else if (e.touches.length === 2) {
        // Two fingers: pinch zoom + pan
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const pinchDist = Math.sqrt(dx * dx + dy * dy);
        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

        // Pinch zoom
        if (this.lastPinchDist > 0) {
          const scale = pinchDist / this.lastPinchDist;
          if (this.viewMode === ViewMode.VIEW_2D) {
            this.camera.pinchZoom2d(scale);
          } else {
            this.camera.pinchZoom3d(scale, getMinZoom(this.activeLock));
          }
        }

        // Two-finger pan (3D only)
        if (this.viewMode === ViewMode.VIEW_3D) {
          const panDx = centerX - this.lastTwoTouchCenter.x;
          const panDy = centerY - this.lastTwoTouchCenter.y;
          this.camera.pan3d(panDx, panDy);
          this.activeLock = TargetLock.NONE;
        }

        this.lastPinchDist = pinchDist;
        this.lastTwoTouchCenter.set(centerX, centerY);
      }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      // Tap = select (only if finger didn't move)
      if (!this.touchMoved && this.touchCount === 1 && e.touches.length === 0) {
        // Orrery mode: pick planet
        if (this.orreryMode) {
          this.handleOrreryClick();
          this.touchCount = 0;
          return;
        }
        // Toggle selection: tap adds/removes, empty tap does nothing
        if (this.hoveredSat) {
          if (this.selectedSats.has(this.hoveredSat)) {
            this.selectedSats.delete(this.hoveredSat);
          } else {
            this.selectedSats.add(this.hoveredSat);
          }
          this.selectedSatsVersion++;
        }

        // Double tap detection
        const now = performance.now() / 1000;
        if (now - this.lastLeftClickTime < 0.3) {
          if (this.viewMode === ViewMode.VIEW_3D) {
            this.handleDoubleClickLock();
          } else {
            this.activeLock = TargetLock.EARTH;
          }
        }
        this.lastLeftClickTime = now;
      }
      this.touchCount = e.touches.length;
      this.lastPinchDist = 0;
    }, { passive: false });
  }

  private fpsLimit = -1; // -1 = vsync (rAF), 0 = unlocked, >0 = FPS cap
  private maxBatch = 16;
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
        // ≤4ms: MessageChannel for sub-setTimeout precision
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
      // Fixed-interval pacing: advance by target interval, reset if too far behind
      const interval = 1000 / this.fpsLimit;
      this.lastFrameTime += interval;
      if (performance.now() - this.lastFrameTime > interval) this.lastFrameTime = performance.now();
    } else {
      this.lastFrameTime = performance.now();
    }
    this.scheduleNextFrame();

    const dt = this.clock.getDelta();

    if (timeStore.warping) {
      // Warp mode: store drives epoch directly, skip normal time system
      timeStore.tickWarp();
      this.timeSystem.currentEpoch = timeStore.epoch;
      this.timeSystem.timeMultiplier = 1;
      this.timeSystem.paused = false;
    } else {
      // Normal mode: pull from store, update, push back
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
      // Detect deselection transition: sats removed from selection while faded out
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
    } else if (this.activeLock === TargetLock.PLANET && this.promotedPlanet) {
      const pos = this.orrery?.getBodyPosition(this.promotedPlanet.body.id);
      if (pos) this.camera.setTarget3d(pos);
    }

    // Smooth camera lerp + update camera transforms
    const earthRotRad = (gmstDeg + this.cfg.earthRotationOffset) * DEG2RAD;
    const isOrreryOrPlanet = this.activeLock === TargetLock.PLANET || this.orreryMode;
    this.camera.updateFrame(dt, earthRotRad, isOrreryOrPlanet);

    // Hover detection (skip in planet/orrery view)
    this.hoveredSat = null;
    if (this.orreryMode && this.orrery) {
      this.raycaster.setFromCamera(this.mouseNDC, this.camera3d);
      const hovered = this.orrery.updateHover(this.raycaster);
      this.renderer.domElement.style.cursor = hovered ? 'pointer' : '';
    } else if (this.activeLock !== TargetLock.PLANET && this.activeLock !== TargetLock.MOON) {
      if (this.viewMode === ViewMode.VIEW_3D) {
        this.detectHover3D();
      } else {
        this.hoveredSat = this.mapRenderer.detectHover(this.mousePos, this.camera2d, this.satellites, this.timeSystem.getGmstDeg(), this.cfg, this.hideUnselected, this.selectedSats, this.camera.zoom2d, this.touchCount);
      }
    }

    // activeSat = hovered, or first selected if nothing hovered
    const firstSelected = this.selectedSats.size > 0 ? this.selectedSats.values().next().value! : null;
    const activeSat = this.hoveredSat ?? firstSelected;

    const earthMode = this.activeLock !== TargetLock.PLANET && this.activeLock !== TargetLock.MOON && !this.orreryMode;

    if (this.viewMode === ViewMode.VIEW_3D) {
      // Update 3D scene
      if (!this.orreryMode) {
        this.earth.update(epoch, gmstDeg, this.cfg.earthRotationOffset, this.cfg.showNightLights);
        if (earthMode) this.cloudLayer.update(epoch, gmstDeg, this.cfg.earthRotationOffset, this.cfg.showClouds, this.cfg.showNightLights);
        this.moonScene.update(epoch);
        this.sunScene.update(epoch);
      }

      // Sun direction in ECI/world space
      const sunEciDir = calculateSunPosition(epoch).normalize();
      this.atmosphere.update(sunEciDir);
      this.moonScene.updateSunDir(sunEciDir);
      this.atmosphere.setVisible(this.atmosphereGlowEnabled && this.activeLock !== TargetLock.PLANET && !this.orreryMode);

      // Orrery mode (includes promoted planet if any)
      if (this.orrery) {
        this.orrery.update();
        if (this.promotedPlanet) {
          this.promotedPlanet.material.uniforms.sunDir.value.copy(sunEciDir);
          this.promotedPlanet.material.uniforms.showNight.value = this.cfg.showNightLights ? 1.0 : 0.0;
          this.promotedPlanet.material.uniforms.aoEnabled.value = this.gfx.curvatureAO ? 1.0 : 0.0;
          if (this.promotedPlanet.body.planetDef) {
            const mult = this.gfx.surfaceRelief / 10;
            this.promotedPlanet.material.uniforms.displacementScale.value =
              this.promotedPlanet.body.planetDef.displacementScale * mult;
            this.promotedPlanet.material.uniforms.bumpStrength.value =
              this.gfx.bumpMapping ? this.promotedPlanet.body.planetDef.bumpStrength : 0.0;
          }
          this.promotedPlanet.body.mesh.rotation.y += this.promotedPlanet.rotationSpeed * dt * this.timeSystem.timeMultiplier;
          // Swap hi-res texture only after camera zoom has fully settled
          if (this.pendingHiTex) {
            const zoomRatio = this.camera.zoomSettleRatio;
            if (zoomRatio < 0.005) {
              this.promotedPlanet.material.uniforms.map.value = this.pendingHiTex;
              this.pendingHiTex = null;
            }
          }
        }
      }

      this.satManager.setVisible(earthMode);
      uiStore.earthTogglesVisible = earthMode;
      // Hide 2D marker labels in 3D mode
      this.mapRenderer.hideMarkerLabels();
      const showNight = earthMode || this.activeLock === TargetLock.MOON || this.activeLock === TargetLock.PLANET;
      uiStore.nightToggleVisible = showNight;
      if (earthMode) {
        this.satManager.update(
          this.satellites, epoch, this.camera3d.position,
          this.hoveredSat, this.selectedSats, this.unselectedFade, this.hideUnselected,
          { normal: this.cfg.satNormal, highlighted: this.cfg.satHighlighted, selected: this.cfg.satSelected },
          this.timeSystem.timeMultiplier, dt, this.maxBatch, this.bloomEnabled, this.fadingInSats
        );

        this.orbitRenderer.update(
          this.satellites, epoch, this.hoveredSat, this.selectedSats,
          this.selectedSatsVersion, this.unselectedFade, this.cfg.orbitsToDraw,
          { orbitNormal: this.cfg.orbitNormal, orbitHighlighted: this.cfg.orbitHighlighted }
        );

        // Footprints for all selected sats + hovered (per-sat orbit color)
        const fpEntries: FootprintEntry[] = [];
        {
          let fpIdx = 0;
          for (const sat of this.selectedSats) {
            fpEntries.push({
              position: sat.currentPos,
              color: ORBIT_COLORS[fpIdx % ORBIT_COLORS.length] as [number, number, number],
            });
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

      const bloomForBody = this.activeLock === TargetLock.PLANET
        ? (this.activePlanet?.bloom !== false)
        : (BODIES[this.activeLock]?.bloom !== false);
      const useBloom = this.bloomEnabled && bloomForBody && !this.orreryMode;
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

    // Mini planet spinner (show when on Earth, Moon, or promoted planet — not orrery browse)
    const showMini = (!this.orreryMode || this.promotedPlanet) && this.miniSphere.material.map;
    if (showMini) {
      this.miniSphere.rotation.y += 0.1 * dt;
      this.miniRenderer.render(this.miniScene, this.miniCamera);
    }

    this.updateUI(activeSat, gmstDeg);
  }

  private handleDoubleClickLock() {
    this.raycaster.setFromCamera(this.mouseNDC, this.camera3d);
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
    this.raycaster.setFromCamera(this.mouseNDC, this.camera3d);
    const touchScale = this.touchCount > 0 || ('ontouchstart' in window) ? 3.0 : 1.0;
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
        // Pick the satellite closest to the ray (not closest to camera)
        const rayDist = this.raycaster.ray.distanceToPoint(this.tmpVec3);
        if (rayDist < closestRayDist) {
          closestRayDist = rayDist;
          this.hoveredSat = sat;
        }
      }
    }
  }

  private updateUI(activeSat: Satellite | null, gmstDeg: number) {
    const cardSat = activeSat;

    // Compute per-sat data for Selection Window
    const satDataArr: SelectedSatInfo[] = [];
    let selIdx = 0;
    for (const sat of this.selectedSats) {
      const rKm = sat.currentPos.length();
      let lonDeg = (Math.atan2(-sat.currentPos.z, sat.currentPos.x) - (gmstDeg + this.cfg.earthRotationOffset) * DEG2RAD) * RAD2DEG;
      while (lonDeg > 180) lonDeg -= 360;
      while (lonDeg < -180) lonDeg += 360;
      satDataArr.push({
        name: sat.name,
        color: ORBIT_COLORS[selIdx % ORBIT_COLORS.length] as [number, number, number],
        altKm: rKm - EARTH_RADIUS_KM,
        speedKmS: Math.sqrt(MU * (2.0 / rKm - 1.0 / sat.semiMajorAxis)),
        latDeg: Math.asin(sat.currentPos.y / rKm) * RAD2DEG,
        lonDeg,
        incDeg: sat.inclination * RAD2DEG,
        eccen: sat.eccentricity,
        raanDeg: sat.raan * RAD2DEG,
        periodMin: (TWO_PI / sat.meanMotion) / 60,
      });
      selIdx++;
    }
    uiStore.selectedSatData = satDataArr;

    // Hover tooltip — only when actually hovering
    const infoEl = uiStore.satInfoEl;
    const periLabel = uiStore.periLabelEl;
    const apoLabel = uiStore.apoLabelEl;

    if (this.hoveredSat) {
      const hSat = this.hoveredSat;
      const rKm = hSat.currentPos.length();
      const alt = rKm - EARTH_RADIUS_KM;
      const speed = Math.sqrt(MU * (2.0 / rKm - 1.0 / hSat.semiMajorAxis));
      uiStore.satInfoName = hSat.name;
      uiStore.satInfoDetail = `Altitude: ${alt.toFixed(0)} km<br>Speed: ${speed.toFixed(2)} km/s`;
      uiStore.satInfoHint = this.selectedSats.has(hSat) ? 'Click to deselect' : 'Click to select';
      uiStore.satInfoVisible = true;

      if (infoEl) {
        let screenPos: THREE.Vector2;
        if (this.viewMode === ViewMode.VIEW_3D) {
          const drawPos = hSat.currentPos.clone().divideScalar(DRAW_SCALE);
          const projected = drawPos.project(this.camera3d);
          screenPos = new THREE.Vector2(
            (projected.x * 0.5 + 0.5) * window.innerWidth,
            (-projected.y * 0.5 + 0.5) * window.innerHeight
          );
        } else {
          const mc = getMapCoordinates(hSat.currentPos, gmstDeg, this.cfg.earthRotationOffset);
          const camCX = (this.camera2d.left + this.camera2d.right) / 2;
          let bestX = mc.x;
          for (const off of [-MAP_W, MAP_W]) {
            if (Math.abs(mc.x + off - camCX) < Math.abs(bestX - camCX)) bestX = mc.x + off;
          }
          const nx = (bestX - this.camera2d.left) / (this.camera2d.right - this.camera2d.left);
          const ny = (this.camera2d.top + mc.y) / (this.camera2d.top - this.camera2d.bottom);
          screenPos = new THREE.Vector2(nx * window.innerWidth, ny * window.innerHeight);
        }

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const infoW = infoEl.offsetWidth;
        const infoH = infoEl.offsetHeight;
        let boxX = screenPos.x + 15;
        let boxY = screenPos.y + 15;
        if (boxX + infoW > vw - 4) boxX = Math.max(4, screenPos.x - infoW - 15);
        if (boxY + infoH > vh - 4) boxY = Math.max(4, screenPos.y - infoH - 15);
        infoEl.style.left = `${boxX}px`;
        infoEl.style.top = `${boxY}px`;
      }
    } else {
      uiStore.satInfoVisible = false;
    }

    // Apsis labels — tied to cardSat (hovered ?? firstSelected)
    if (cardSat) {
      const apsis = computeApsis(cardSat, this.timeSystem.currentEpoch);
      const periR = apsis.periPos.length();
      const apoR = apsis.apoPos.length();

      if (this.viewMode === ViewMode.VIEW_3D) {
        const pDraw = apsis.periPos.clone().divideScalar(DRAW_SCALE);
        const aDraw = apsis.apoPos.clone().divideScalar(DRAW_SCALE);
        const earthR = EARTH_RADIUS_KM / DRAW_SCALE;
        const camPos = this.camera3d.position;

        // Earth occlusion check helper
        const isOccluded = (pt: THREE.Vector3): boolean => {
          const dx = pt.x - camPos.x, dy = pt.y - camPos.y, dz = pt.z - camPos.z;
          const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const ux = dx / L, uy = dy / L, uz = dz / L;
          const t = -(camPos.x * ux + camPos.y * uy + camPos.z * uz);
          if (t > 0 && t < L) {
            const cx = camPos.x + ux * t, cy = camPos.y + uy * t, cz = camPos.z + uz * t;
            if (Math.sqrt(cx * cx + cy * cy + cz * cz) < earthR * 0.99) return true;
          }
          return false;
        };

        const periOccluded = isOccluded(pDraw);
        const apoOccluded = isOccluded(aDraw);

        // Position 3D apsis sprites
        this.periSprite3d.position.copy(pDraw);
        this.periSprite3d.visible = !periOccluded;
        this.apoSprite3d.position.copy(aDraw);
        this.apoSprite3d.visible = !apoOccluded;

        const pp = pDraw.project(this.camera3d);
        const ap = aDraw.project(this.camera3d);
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const ppX = (pp.x * 0.5 + 0.5) * vw;
        const ppY = (-pp.y * 0.5 + 0.5) * vh;
        if (!periOccluded && pp.z < 1 && ppX > -50 && ppX < vw + 50 && ppY > -20 && ppY < vh + 20) {
          uiStore.periText = `Peri: ${(periR - EARTH_RADIUS_KM).toFixed(0)} km`;
          uiStore.periVisible = true;
          if (periLabel) {
            periLabel.style.left = `${ppX + 20}px`;
            periLabel.style.top = `${ppY - 8}px`;
          }
        } else {
          uiStore.periVisible = false;
        }

        const apX = (ap.x * 0.5 + 0.5) * vw;
        const apY = (-ap.y * 0.5 + 0.5) * vh;
        if (!apoOccluded && ap.z < 1 && apX > -50 && apX < vw + 50 && apY > -20 && apY < vh + 20) {
          uiStore.apoText = `Apo: ${(apoR - EARTH_RADIUS_KM).toFixed(0)} km`;
          uiStore.apoVisible = true;
          if (apoLabel) {
            apoLabel.style.left = `${apX + 20}px`;
            apoLabel.style.top = `${apY - 8}px`;
          }
        } else {
          uiStore.apoVisible = false;
        }
      } else {
        // 2D mode: position apsis text labels on the map
        this.periSprite3d.visible = false;
        this.apoSprite3d.visible = false;

        const peri2d = computeApsis2D(cardSat, this.timeSystem.currentEpoch, false, this.cfg.earthRotationOffset);
        const apo2d = computeApsis2D(cardSat, this.timeSystem.currentEpoch, true, this.cfg.earthRotationOffset);

        const camL = this.camera2d.left, camR = this.camera2d.right;
        const camT = this.camera2d.top, camB = this.camera2d.bottom;
        const camCenterX = (camL + camR) / 2;
        const vw = window.innerWidth, vh = window.innerHeight;

        // Wrap to nearest x-offset
        let periX = peri2d.x;
        let apoX = apo2d.x;
        for (const off of [-MAP_W, MAP_W]) {
          if (Math.abs(peri2d.x + off - camCenterX) < Math.abs(periX - camCenterX)) periX = peri2d.x + off;
          if (Math.abs(apo2d.x + off - camCenterX) < Math.abs(apoX - camCenterX)) apoX = apo2d.x + off;
        }

        const pnx = (periX - camL) / (camR - camL);
        const pny = (-peri2d.y - camB) / (camT - camB);
        uiStore.periText = `Peri: ${(periR - EARTH_RADIUS_KM).toFixed(0)} km`;
        uiStore.periVisible = pnx > -0.1 && pnx < 1.1 && pny > -0.1 && pny < 1.1;
        if (uiStore.periVisible && periLabel) {
          periLabel.style.left = `${pnx * vw + 12}px`;
          periLabel.style.top = `${(1 - pny) * vh - 8}px`;
        }

        const anx = (apoX - camL) / (camR - camL);
        const any_ = (-apo2d.y - camB) / (camT - camB);
        uiStore.apoText = `Apo: ${(apoR - EARTH_RADIUS_KM).toFixed(0)} km`;
        uiStore.apoVisible = anx > -0.1 && anx < 1.1 && any_ > -0.1 && any_ < 1.1;
        if (uiStore.apoVisible && apoLabel) {
          apoLabel.style.left = `${anx * vw + 12}px`;
          apoLabel.style.top = `${(1 - any_) * vh - 8}px`;
        }
      }
    } else {
      // No cardSat — hide apsis markers
      uiStore.periVisible = false;
      uiStore.apoVisible = false;
      this.periSprite3d.visible = false;
      this.apoSprite3d.visible = false;
    }
  }
}
