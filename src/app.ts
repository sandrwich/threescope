import * as THREE from 'three';
import type { Satellite } from './types';
import { TargetLock, ViewMode } from './types';
import { defaultConfig, parseHexColor } from './config';
import { DRAW_SCALE, EARTH_RADIUS_KM, MOON_RADIUS_KM, MU, RAD2DEG, DEG2RAD, MAP_W, MAP_H, TWO_PI } from './constants';
import { TimeSystem } from './simulation/time-system';
import { Earth } from './scene/earth';
import { CloudLayer } from './scene/cloud-layer';
import { MoonScene } from './scene/moon-scene';
import { SunScene } from './scene/sun-scene';
import { SatelliteManager } from './scene/satellite-manager';
import { OrbitRenderer } from './scene/orbit-renderer';
import { FootprintRenderer } from './scene/footprint-renderer';
import { MarkerManager } from './scene/marker-manager';
import { PostProcessing } from './scene/post-processing';
import { getMinZoom, BODIES, PLANETS, type PlanetDef } from './bodies';
import { Orrery, type PromotedPlanet } from './scene/orrery';
import { Atmosphere } from './scene/atmosphere';
import { computeApsis } from './astro/apsis';
import { getMapCoordinates } from './astro/coordinates';
import { calculatePosition } from './astro/propagator';
import { epochToGmst } from './astro/epoch';
import { calculateSunPosition } from './astro/sun';
import { fetchTLEData, parseTLEText, clearRateLimit, type FetchResult } from './data/tle-loader';
import { TLE_SOURCES, DEFAULT_GROUP } from './data/tle-sources';

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
  private bloomEnabled = true;
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
  private selectedSat: Satellite | null = null;
  private activeLock = TargetLock.EARTH;
  private viewMode = ViewMode.VIEW_3D;
  private hideUnselected = false;
  private showMarkers = false;
  private unselectedFade = 1.0;
  private fadingInSat: Satellite | null = null;
  private prevSelectedSat: Satellite | null = null;
  private cfg = { ...defaultConfig };

  // Reusable temp objects (avoid per-frame allocations)
  private raycaster = new THREE.Raycaster();
  private tmpVec3 = new THREE.Vector3();
  private tmpSphere = new THREE.Sphere();

  // 3D camera state
  private camDistance = 35.0;
  private camAngleX = 0.785;
  private camAngleY = 0.5;
  private targetCamDistance = 35.0;
  private targetCamAngleX = 0.785;
  private targetCamAngleY = 0.5;
  private target3d = new THREE.Vector3();
  private targetTarget3d = new THREE.Vector3();

  // 2D camera state
  private cam2dZoom = 1.0;
  private targetCam2dZoom = 1.0;
  private cam2dTarget = new THREE.Vector2();
  private targetCam2dTarget = new THREE.Vector2();

  // 2D scene objects
  private mapPlane!: THREE.Mesh;
  private mapMaterial!: THREE.ShaderMaterial;
  // Pre-allocated 2D buffers
  private satPoints2d!: THREE.Points;
  private satPosBuffer2d!: THREE.BufferAttribute;
  private satColorBuffer2d!: THREE.BufferAttribute;
  private maxSatVerts2d = 15000 * 3; // 3 offsets per sat
  private hlTrack2d!: THREE.LineSegments;
  private hlTrackBuffer2d!: THREE.BufferAttribute;
  private maxTrackVerts2d = 4001 * 3 * 2; // 3 offsets, 2 verts per segment

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

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    document.getElementById('ui-overlay')!.before(this.renderer.domElement);

    // Mini planet renderer for picker button
    const miniCanvas = document.getElementById('planet-btn-canvas') as HTMLCanvasElement;
    this.miniRenderer = new THREE.WebGLRenderer({ canvas: miniCanvas, alpha: true, antialias: true });
    this.miniRenderer.setSize(56, 56);
    this.miniRenderer.setPixelRatio(window.devicePixelRatio);
    const geo = new THREE.SphereGeometry(1, 32, 32);
    const mat = new THREE.MeshBasicMaterial();
    this.miniSphere = new THREE.Mesh(geo, mat);
    this.miniScene.add(this.miniSphere);
    this.miniCamera.position.z = 3.2;

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
    this.scene2d = new THREE.Scene();
    this.scene2d.background = new THREE.Color(this.cfg.bgColor);

    this.setLoading(0.2, 'Loading textures...');
    await this.loadTextures();

    const savedGroup = localStorage.getItem('threescope_tle_group') || 'none';
    this.setLoading(0.6, 'Fetching satellite data...');
    await this.loadTLEGroup(savedGroup);

    this.setLoading(0.9, 'Setting up UI...');
    this.setupUI();
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

    const [dayTex, nightTex, cloudTex, moonTex, satTex, markerTex, starTex] = await Promise.all([
      load('/textures/earth.webp'),
      load('/textures/earth_night.webp'),
      load('/textures/clouds.webp'),
      load('/textures/moon.webp'),
      load('/textures/sat_icon.png'),
      load('/textures/marker_icon.png'),
      load('/textures/stars.webp'),
    ]);

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
    const overlay = document.getElementById('ui-overlay')!;
    this.markerManager = new MarkerManager(this.scene3d, this.cfg.markers, markerTex, overlay);

    // 2D map plane
    this.mapMaterial = new THREE.ShaderMaterial({
      uniforms: {
        dayTexture: { value: dayTex },
        nightTexture: { value: nightTex },
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
        showNight: { value: 1.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D dayTexture;
        uniform sampler2D nightTexture;
        uniform vec3 sunDir;
        uniform float showNight;
        varying vec2 vUv;
        void main() {
          vec4 day = texture2D(dayTexture, vUv);
          if (showNight < 0.5) {
            gl_FragColor = day;
            return;
          }
          vec4 night = texture2D(nightTexture, vUv);
          float theta = (vUv.x - 0.5) * 6.28318530718;
          float phi = vUv.y * 3.14159265359;
          vec3 normal = vec3(cos(theta)*sin(phi), cos(phi), -sin(theta)*sin(phi));
          float intensity = dot(normal, sunDir);
          float blend = smoothstep(-0.15, 0.15, intensity);
          gl_FragColor = mix(night, day, blend);
        }
      `,
      side: THREE.DoubleSide,
    });

    const planeGeo = new THREE.PlaneGeometry(MAP_W, MAP_H);
    // Flip V coords to compensate for flipY=false on textures
    const planeUv = planeGeo.getAttribute('uv') as THREE.BufferAttribute;
    const planeUvArr = planeUv.array as Float32Array;
    for (let i = 1; i < planeUvArr.length; i += 2) {
      planeUvArr[i] = 1.0 - planeUvArr[i];
    }
    planeUv.needsUpdate = true;
    this.mapPlane = new THREE.Mesh(planeGeo, this.mapMaterial);
    this.scene2d.add(this.mapPlane);

    // Pre-allocate 2D satellite points buffer
    const satGeo2d = new THREE.BufferGeometry();
    this.satPosBuffer2d = new THREE.BufferAttribute(new Float32Array(this.maxSatVerts2d * 3), 3);
    this.satPosBuffer2d.setUsage(THREE.DynamicDrawUsage);
    this.satColorBuffer2d = new THREE.BufferAttribute(new Float32Array(this.maxSatVerts2d * 3), 3);
    this.satColorBuffer2d.setUsage(THREE.DynamicDrawUsage);
    satGeo2d.setAttribute('position', this.satPosBuffer2d);
    satGeo2d.setAttribute('color', this.satColorBuffer2d);
    satGeo2d.setDrawRange(0, 0);
    this.satPoints2d = new THREE.Points(satGeo2d, new THREE.PointsMaterial({
      size: 6, sizeAttenuation: false, vertexColors: true, transparent: true, depthTest: false,
    }));
    this.satPoints2d.frustumCulled = false;
    this.scene2d.add(this.satPoints2d);

    // Pre-allocate 2D highlight track buffer
    const hlGeo2d = new THREE.BufferGeometry();
    this.hlTrackBuffer2d = new THREE.BufferAttribute(new Float32Array(this.maxTrackVerts2d * 3), 3);
    this.hlTrackBuffer2d.setUsage(THREE.DynamicDrawUsage);
    hlGeo2d.setAttribute('position', this.hlTrackBuffer2d);
    hlGeo2d.setDrawRange(0, 0);
    this.hlTrack2d = new THREE.LineSegments(hlGeo2d, new THREE.LineBasicMaterial({ transparent: true }));
    this.hlTrack2d.frustumCulled = false;
    this.scene2d.add(this.hlTrack2d);
  }

  private currentGroup = DEFAULT_GROUP;
  private satStatusText = '';

  async loadTLEGroup(group: string, forceRetry = false) {
    this.currentGroup = group;
    if (group === 'none') {
      this.satellites = [];
      this.selectedSat = null;
      this.hoveredSat = null;
      this.orbitRenderer.precomputeOrbits([], this.timeSystem.currentEpoch);
      this.satStatusText = '0 sats';
      this.hideActionLink();
      return;
    }
    try {
      const result = await fetchTLEData(group, (msg) => {
        this.satStatusText = msg;
      }, forceRetry);
      this.satellites = result.satellites;
      this.selectedSat = null;
      this.hoveredSat = null;
      this.orbitRenderer.precomputeOrbits(this.satellites, this.timeSystem.currentEpoch);

      let info = `${this.satellites.length} sats`;
      if (result.source === 'cache' && result.cacheAge != null) {
        info += ` (${formatAge(result.cacheAge)})`;
      } else if (result.source === 'stale-cache' && result.cacheAge != null) {
        info += ` (offline, ${formatAge(result.cacheAge)})`;
      }
      if (result.rateLimited) info += ' — rate limited';
      this.satStatusText = info;
      if (result.rateLimited) {
        this.showActionLink('Retry', () => {
          clearRateLimit();
          this.loadTLEGroup(this.currentGroup, true);
        });
      } else if (result.source === 'cache' || result.source === 'stale-cache') {
        this.showActionLink('Refresh', () => {
          this.loadTLEGroup(this.currentGroup, true);
        });
      } else {
        this.hideActionLink();
      }
    } catch (e) {
      console.error('Failed to load TLE data:', e);
      const rl = (e as any)?.rateLimited === true;
      this.satStatusText = rl ? 'Rate limited' : 'Load failed';
      if (rl) {
        this.showActionLink('Retry', () => {
          clearRateLimit();
          this.loadTLEGroup(this.currentGroup, true);
        });
      } else {
        this.hideActionLink();
      }
    }
  }

  private showActionLink(label: string, onClick: () => void) {
    let link = document.getElementById('action-link');
    if (!link) {
      link = document.createElement('div');
      link.id = 'action-link';
      link.style.cssText = 'color:#888;font-size:12px;cursor:pointer;text-decoration:underline;margin-top:2px;';
      document.getElementById('stats-panel')!.appendChild(link);
    }
    link.textContent = label;
    link.onclick = onClick;
    link.style.display = 'block';
  }

  private hideActionLink() {
    const link = document.getElementById('action-link');
    if (link) link.style.display = 'none';
  }

  private loadCustomTLE(text: string, label: string) {
    const statusEl = document.getElementById('sat-count-display')!;
    try {
      this.satellites = parseTLEText(text);
      this.selectedSat = null;
      this.hoveredSat = null;
      this.orbitRenderer.precomputeOrbits(this.satellites, this.timeSystem.currentEpoch);
      statusEl.textContent = `${this.satellites.length} Sats (${label})`;
    } catch (e) {
      console.error('Failed to parse TLE data:', e);
      statusEl.textContent = 'Parse failed';
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
    this.selectedSat = null;
    this.hoveredSat = null;
    this.activePlanet = planet;
    this.activeLock = TargetLock.PLANET;
    this.updatePlanetPickerUI();

    // Upgrade orrery ball material to sun-lit shader (in place, no new mesh)
    this.promotedPlanet = this.orrery.promoteBody(planet.id);
    document.getElementById('planet-btn')!.style.display = '';

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
    this.targetTarget3d.set(0, 0, 0);
    this.updatePlanetPickerUI();
  }

  private updatePlanetPickerUI() {
    const thumbUrl = this.activePlanet?.thumbnailUrl ?? '/textures/planets/thumb/earth.webp';
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
    // Update active state in overlay
    document.querySelectorAll('.ss-item').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-planet') === (this.activePlanet?.id ?? 'earth'));
    });
  }

  private orreryMode = false;

  private enterOrrery() {
    if (this.orreryMode) return;
    this.orreryMode = true;
    this.activePlanet = null;
    this.promotedPlanet = null;
    document.getElementById('planet-btn')!.style.display = 'none';

    // Create orrery (vertical on portrait screens)
    this.orrery = new Orrery(this.camera3d.aspect);
    this.scene3d.add(this.orrery.group);

    // Hide Earth/moon/sats
    this.setEarthVisible(false);
    this.selectedSat = null;
    this.hoveredSat = null;

    // Position camera to fit all planets with some padding
    this.activeLock = TargetLock.NONE;
    const halfSpan = this.orrery.totalSpan / 2 + 6; // padding for outermost spheres + labels
    const vFov = this.camera3d.fov * Math.PI / 360; // half vertical FOV in radians
    if (this.orrery.vertical) {
      // Look straight on; offset target slightly right to account for side labels
      this.targetTarget3d.set(2, 0, 0);
      this.targetCamDistance = halfSpan / Math.tan(vFov);
      this.targetCamAngleY = 0;
    } else {
      this.targetTarget3d.set(0, 0, 0);
      const hFov = Math.atan(Math.tan(vFov) * this.camera3d.aspect);
      this.targetCamDistance = halfSpan / Math.tan(hFov);
      this.targetCamAngleY = 0.3;
    }
    this.targetCamAngleX = 0;
  }

  private exitOrrery() {
    if (!this.orreryMode) return;
    this.orreryMode = false;
    document.getElementById('planet-btn')!.style.display = '';

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
      this.targetCamDistance = 10.5;
      this.camDistance = 10.5;
      this.target3d.set(0, 0, 0);
      return;
    } else if (hit.id === 'moon') {
      this.navigateToEarth();
      this.activeLock = TargetLock.MOON;
      // Snap camera to moon immediately — no long fly-in from orrery position
      this.targetTarget3d.copy(this.moonScene.drawPos);
      this.target3d.copy(this.moonScene.drawPos);
      this.targetCamDistance = 3.0;
      this.camDistance = 3.0;
      return;
    }

    // Other planets: snap camera to the ball, promote in place
    this.orrery.focusBody(hit.id);
    const pos = this.orrery.getBodyPosition(hit.id);
    const bodyR = this.orrery.getBodyDrawRadius(hit.id);
    if (pos) {
      this.targetTarget3d.copy(pos);
      this.target3d.copy(pos);
      this.targetCamDistance = bodyR * 3.5;
      this.camDistance = bodyR * 3.5;
    }

    if (hit.planetDef) {
      this.promoteToPlanetView(hit.planetDef);
    }
  }

  private setupUI() {
    // TLE picker
    const select = document.getElementById('tle-select') as HTMLSelectElement;
    const customRow = document.getElementById('tle-custom-row')!;

    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = 'Custom...';
    select.appendChild(customOpt);

    for (const src of TLE_SOURCES) {
      const opt = document.createElement('option');
      opt.value = src.group;
      opt.textContent = src.name;
      select.appendChild(opt);
    }

    // Restore saved selection
    select.value = this.currentGroup;

    select.addEventListener('change', async () => {
      if (select.value === '__custom__') {
        customRow.classList.add('visible');
        return;
      }
      customRow.classList.remove('visible');
      localStorage.setItem('threescope_tle_group', select.value);
      this.setLoading(0.5, 'Loading satellite data...');
      this.loadingScreen.style.display = 'flex';
      await this.loadTLEGroup(select.value);
      this.loadingScreen.style.display = 'none';
    });

    // File upload
    const fileInput = document.getElementById('tle-file-input') as HTMLInputElement;
    document.getElementById('tle-file-btn')!.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      this.setLoading(0.5, 'Reading file...');
      this.loadingScreen.style.display = 'flex';
      const reader = new FileReader();
      reader.onload = () => {
        this.loadCustomTLE(reader.result as string, file.name);
        this.loadingScreen.style.display = 'none';
      };
      reader.readAsText(file);
      fileInput.value = '';
    });

    // URL load
    const urlInput = document.getElementById('tle-url-input') as HTMLInputElement;
    const urlLoad = async () => {
      const url = urlInput.value.trim();
      if (!url) return;
      this.setLoading(0.5, 'Fetching TLE from URL...');
      this.loadingScreen.style.display = 'flex';
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        this.loadCustomTLE(text, 'URL');
      } catch (e) {
        console.error('Failed to fetch TLE URL:', e);
        document.getElementById('sat-count-display')!.textContent = 'URL fetch failed';
      }
      this.loadingScreen.style.display = 'none';
    };
    document.getElementById('tle-url-btn')!.addEventListener('click', urlLoad);
    urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') urlLoad(); });

    // Planet picker
    document.getElementById('planet-btn')!.addEventListener('click', () => {
      if (this.promotedPlanet) {
        // Viewing a planet — go back to orrery picker
        this.unpromoteToOrrery();
      } else if (this.orreryMode) {
        // Browsing orrery — go back to Earth
        this.exitOrrery();
        this.navigateToEarth();
      } else {
        this.enterOrrery();
      }
    });
    this.updatePlanetPickerUI();

    // Checkbox helper: bind element ↔ localStorage ↔ onChange callback
    const bindCheckbox = (id: string, key: string, defaultOn: boolean, onChange: (v: boolean) => void) => {
      const cb = document.getElementById(id) as HTMLInputElement;
      const saved = localStorage.getItem(key);
      const initial = saved !== null ? (defaultOn ? saved !== 'false' : saved === 'true') : defaultOn;
      cb.checked = initial;
      onChange(initial);
      cb.addEventListener('change', () => {
        onChange(cb.checked);
        localStorage.setItem(key, String(cb.checked));
      });
    };

    bindCheckbox('cb-hide-unselected', 'threescope_spotlight', true, v => { this.hideUnselected = v; });
    bindCheckbox('cb-clouds', 'threescope_clouds', true, v => { this.cfg.showClouds = v; });
    bindCheckbox('cb-night-lights', 'threescope_night', true, v => {
      this.cfg.showNightLights = v;
      this.moonScene.setShowNight(v);
    });
    bindCheckbox('cb-markers', 'threescope_markers', false, v => {
      this.showMarkers = v;
      if (!v) this.markerManager.hide();
    });
    bindCheckbox('cb-rtx', 'threescope_bloom', true, v => {
      this.bloomEnabled = v;
      this.earth.setNightEmission(v ? 1.5 : 1.0);
      this.sunScene.setBloomEnabled(v);
    });


    // Info modal
    const infoModal = document.getElementById('info-modal')!;
    document.getElementById('info-btn')!.addEventListener('click', () => {
      infoModal.classList.add('visible');
    });
    document.getElementById('info-modal-close')!.addEventListener('click', () => {
      infoModal.classList.remove('visible');
    });
    infoModal.addEventListener('click', (e) => {
      if (e.target === infoModal) infoModal.classList.remove('visible');
    });

    // Update quality (SGP4 batch cap)
    const qualitySelect = document.getElementById('update-quality-select') as HTMLSelectElement;
    const savedQuality = localStorage.getItem('threescope_update_quality') || '16';
    qualitySelect.value = savedQuality;
    this.maxBatch = Number(savedQuality);
    qualitySelect.addEventListener('change', () => {
      this.maxBatch = Number(qualitySelect.value);
      localStorage.setItem('threescope_update_quality', qualitySelect.value);
    });

    // Unlock FPS
    const unlockCb = document.getElementById('cb-unlock-fps') as HTMLInputElement;
    const savedUnlock = localStorage.getItem('threescope_unlock_fps') === 'true';
    unlockCb.checked = savedUnlock;
    this.unlockFps = savedUnlock;
    unlockCb.addEventListener('change', () => {
      this.unlockFps = unlockCb.checked;
      localStorage.setItem('threescope_unlock_fps', String(unlockCb.checked));
    });

    // Settings modal
    const settingsModal = document.getElementById('settings-modal')!;
    document.getElementById('settings-btn')!.addEventListener('click', () => {
      settingsModal.classList.add('visible');
    });
    document.getElementById('settings-modal-close')!.addEventListener('click', () => {
      settingsModal.classList.remove('visible');
    });
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) settingsModal.classList.remove('visible');
    });
  }

  private setupEvents() {
    // Resize
    window.addEventListener('resize', () => {
      const w = window.innerWidth, h = window.innerHeight;
      this.renderer.setSize(w, h);
      this.camera3d.aspect = w / h;
      this.camera3d.updateProjectionMatrix();
      this.postProcessing.setSize(w, h);
      const aspect = w / h;
      const halfH = MAP_H / 2 / this.cam2dZoom;
      const halfW = halfH * aspect;
      this.camera2d.left = -halfW;
      this.camera2d.right = halfW;
      this.camera2d.top = halfH;
      this.camera2d.bottom = -halfH;
      this.camera2d.updateProjectionMatrix();
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
          const scale = 1.0 / this.targetCam2dZoom;
          this.targetCam2dTarget.x -= dx * scale;
          this.targetCam2dTarget.y -= dy * scale;
          this.activeLock = TargetLock.NONE;
        } else {
          // Orbit 3D
          if (e.shiftKey) {
            const forward = new THREE.Vector3().subVectors(this.target3d, this.camera3d.position).normalize();
            const right = new THREE.Vector3().crossVectors(forward, this.camera3d.up).normalize();
            const upVec = new THREE.Vector3().crossVectors(right, forward).normalize();
            const panSpeed = this.targetCamDistance * 0.001;
            this.targetTarget3d.add(right.multiplyScalar(-dx * panSpeed));
            this.targetTarget3d.add(upVec.multiplyScalar(dy * panSpeed));
            this.activeLock = TargetLock.NONE;
          } else {
            this.targetCamAngleX -= dx * 0.005;
            this.targetCamAngleY += dy * 0.005;
            this.targetCamAngleY = Math.max(-1.5, Math.min(1.5, this.targetCamAngleY));
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
        this.targetCam2dZoom += delta * 0.1 * this.targetCam2dZoom;
        this.targetCam2dZoom = Math.max(0.1, this.targetCam2dZoom);
        this.activeLock = TargetLock.NONE;
      } else {
        this.targetCamDistance -= delta * (this.targetCamDistance * 0.1);
        this.targetCamDistance = Math.max(getMinZoom(this.activeLock), this.targetCamDistance);
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

      this.selectedSat = this.hoveredSat;

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
      // Ignore if typing in input/select elements
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          this.timeSystem.paused = !this.timeSystem.paused;
          break;
        case '.':
          this.timeSystem.timeMultiplier *= 2.0;
          break;
        case ',':
          this.timeSystem.timeMultiplier /= 2.0;
          break;
        case '/':
          if (e.shiftKey) this.timeSystem.resetToNow();
          else this.timeSystem.timeMultiplier = 1.0;
          break;
        case 'm':
        case 'M':
          this.viewMode = this.viewMode === ViewMode.VIEW_3D ? ViewMode.VIEW_2D : ViewMode.VIEW_3D;
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
          const scale = 1.0 / this.targetCam2dZoom;
          this.targetCam2dTarget.x -= dx * scale;
          this.targetCam2dTarget.y -= dy * scale;
          this.activeLock = TargetLock.NONE;
        } else {
          this.targetCamAngleX -= dx * 0.005;
          this.targetCamAngleY += dy * 0.005;
          this.targetCamAngleY = Math.max(-1.5, Math.min(1.5, this.targetCamAngleY));
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
            this.targetCam2dZoom *= scale;
            this.targetCam2dZoom = Math.max(0.1, this.targetCam2dZoom);
          } else {
            this.targetCamDistance /= scale;
            this.targetCamDistance = Math.max(getMinZoom(this.activeLock), this.targetCamDistance);
          }
        }

        // Two-finger pan (3D only)
        if (this.viewMode === ViewMode.VIEW_3D) {
          const panDx = centerX - this.lastTwoTouchCenter.x;
          const panDy = centerY - this.lastTwoTouchCenter.y;
          const forward = new THREE.Vector3().subVectors(this.target3d, this.camera3d.position).normalize();
          const right = new THREE.Vector3().crossVectors(forward, this.camera3d.up).normalize();
          const upVec = new THREE.Vector3().crossVectors(right, forward).normalize();
          const panSpeed = this.targetCamDistance * 0.001;
          this.targetTarget3d.add(right.multiplyScalar(-panDx * panSpeed));
          this.targetTarget3d.add(upVec.multiplyScalar(panDy * panSpeed));
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
        this.selectedSat = this.hoveredSat;

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

  private unlockFps = false;
  private maxBatch = 16;
  private mcChannel = new MessageChannel();

  private scheduleUnlocked() {
    this.mcChannel.port2.postMessage(null);
  }

  private animate() {
    if (this.unlockFps) {
      this.scheduleUnlocked();
    } else {
      requestAnimationFrame(() => this.animate());
    }

    const dt = this.clock.getDelta();
    this.timeSystem.update(dt);

    // FPS counter
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fpsDisplay = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
      const fpsEl = document.getElementById('fps-display')!;
      fpsEl.textContent = `${this.fpsDisplay} FPS`;
      if (this.fpsDisplay >= 30) {
        fpsEl.style.color = '#00ff00';
      } else {
        const t = Math.max(0, this.fpsDisplay / 30);
        fpsEl.style.color = `rgb(255,${Math.round(255 * t)},0)`;
      }
      document.getElementById('sat-count-display')!.textContent = this.satStatusText;
    }

    const epoch = this.timeSystem.currentEpoch;
    const gmstDeg = this.timeSystem.getGmstDeg();

    // Unselected fade
    const shouldHide = this.hideUnselected && this.selectedSat !== null;
    if (shouldHide) {
      this.unselectedFade -= 3.0 * dt;
      if (this.unselectedFade < 0) this.unselectedFade = 0;
      this.fadingInSat = null;
    } else {
      // Detect deselection transition: selectedSat just went null while faded out
      if (this.prevSelectedSat && !this.selectedSat && this.unselectedFade < 1.0) {
        this.fadingInSat = this.prevSelectedSat;
      }
      this.unselectedFade += 3.0 * dt;
      if (this.unselectedFade > 1) {
        this.unselectedFade = 1;
        this.fadingInSat = null;
      }
    }
    this.prevSelectedSat = this.selectedSat;

    // Target lock
    if (this.activeLock === TargetLock.EARTH) {
      if (this.viewMode === ViewMode.VIEW_2D) this.targetCam2dTarget.set(0, 0);
      else this.targetTarget3d.set(0, 0, 0);
    } else if (this.activeLock === TargetLock.MOON) {
      if (this.viewMode === ViewMode.VIEW_2D) {
        const mc = getMapCoordinates(this.moonScene.drawPos.clone().multiplyScalar(DRAW_SCALE), gmstDeg, this.cfg.earthRotationOffset);
        this.targetCam2dTarget.set(mc.x, mc.y);
      } else {
        this.targetTarget3d.copy(this.moonScene.drawPos);
      }
    } else if (this.activeLock === TargetLock.SUN) {
      if (this.viewMode === ViewMode.VIEW_3D) {
        this.targetTarget3d.copy(this.sunScene.disc.position);
      }
    } else if (this.activeLock === TargetLock.PLANET && this.promotedPlanet) {
      const pos = this.orrery?.getBodyPosition(this.promotedPlanet.body.id);
      if (pos) this.targetTarget3d.copy(pos);
    }

    // Smooth camera lerp
    const smooth = Math.min(1.0, 10.0 * dt);

    this.cam2dZoom += (this.targetCam2dZoom - this.cam2dZoom) * smooth;
    this.cam2dTarget.lerp(this.targetCam2dTarget, smooth);

    this.camAngleX += (this.targetCamAngleX - this.camAngleX) * smooth;
    this.camAngleY += (this.targetCamAngleY - this.camAngleY) * smooth;
    this.camDistance += (this.targetCamDistance - this.camDistance) * smooth;
    this.target3d.lerp(this.targetTarget3d, smooth);

    // Update 3D camera position (co-rotate with Earth so it appears stationary)
    const earthRotRad = (gmstDeg + this.cfg.earthRotationOffset) * DEG2RAD;
    // Don't co-rotate with Earth when viewing a planet or in orrery mode
    const camAX = this.camAngleX + (this.activeLock === TargetLock.PLANET || this.orreryMode ? 0 : earthRotRad);
    this.camera3d.position.set(
      this.target3d.x + this.camDistance * Math.cos(this.camAngleY) * Math.sin(camAX),
      this.target3d.y + this.camDistance * Math.sin(this.camAngleY),
      this.target3d.z + this.camDistance * Math.cos(this.camAngleY) * Math.cos(camAX)
    );
    this.camera3d.lookAt(this.target3d);

    // Update 2D camera
    const aspect = window.innerWidth / window.innerHeight;
    const halfH = MAP_H / 2 / this.cam2dZoom;
    const halfW = halfH * aspect;
    this.camera2d.left = this.cam2dTarget.x - halfW;
    this.camera2d.right = this.cam2dTarget.x + halfW;
    this.camera2d.top = halfH;
    this.camera2d.bottom = -halfH;
    this.camera2d.updateProjectionMatrix();

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
        this.detectHover2D();
      }
    }

    const activeSat = this.hoveredSat ?? this.selectedSat;

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
      this.atmosphere.setVisible(this.bloomEnabled && this.activeLock !== TargetLock.PLANET && !this.orreryMode);

      // Orrery mode (includes promoted planet if any)
      if (this.orrery) {
        this.orrery.update();
        if (this.promotedPlanet) {
          this.promotedPlanet.body.mesh.rotation.y += this.promotedPlanet.rotationSpeed * dt * this.timeSystem.timeMultiplier;
          // Swap hi-res texture only after camera zoom has fully settled
          if (this.pendingHiTex) {
            const zoomRatio = Math.abs(this.camDistance - this.targetCamDistance) / this.targetCamDistance;
            if (zoomRatio < 0.005) {
              this.promotedPlanet.material.uniforms.map.value = this.pendingHiTex;
              this.pendingHiTex = null;
            }
          }
        }
      }

      this.satManager.setVisible(earthMode);
      document.getElementById('earth-toggles')!.style.display = earthMode ? 'contents' : 'none';
      const showNight = earthMode || this.activeLock === TargetLock.MOON;
      document.getElementById('night-toggle')!.style.display = showNight ? 'contents' : 'none';
      if (earthMode) {
        this.satManager.update(
          this.satellites, epoch, this.camera3d.position,
          this.hoveredSat, this.selectedSat, this.unselectedFade, this.hideUnselected,
          { normal: this.cfg.satNormal, highlighted: this.cfg.satHighlighted, selected: this.cfg.satSelected },
          this.timeSystem.timeMultiplier, dt, this.maxBatch, this.bloomEnabled, this.fadingInSat
        );

        this.orbitRenderer.update(
          this.satellites, epoch, this.hoveredSat, this.selectedSat,
          this.unselectedFade, this.cfg.orbitsToDraw,
          { orbitNormal: this.cfg.orbitNormal, orbitHighlighted: this.cfg.orbitHighlighted }
        );

        this.footprintRenderer.update(
          activeSat ? activeSat.currentPos : null,
          { footprintBg: this.cfg.footprintBg, footprintBorder: this.cfg.footprintBorder }
        );

        if (this.showMarkers) {
          this.markerManager.update(gmstDeg, this.cfg.earthRotationOffset, this.camera3d, this.camDistance);
        } else {
          this.markerManager.hide();
        }
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
      this.update2DMap(epoch, gmstDeg);
      this.markerManager.hide();
      this.orbitRenderer.clear();
      this.footprintRenderer.clear();

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

    let closestDist = 9999;
    for (const sat of this.satellites) {
      if (this.hideUnselected && this.selectedSat && sat !== this.selectedSat) continue;

      this.tmpVec3.copy(sat.currentPos).divideScalar(DRAW_SCALE);
      const distToCam = this.camera3d.position.distanceTo(this.tmpVec3);
      const hitRadius = 0.015 * distToCam * touchScale;

      this.tmpSphere.set(this.tmpVec3, hitRadius);
      if (this.raycaster.ray.intersectsSphere(this.tmpSphere)) {
        if (distToCam < closestDist) {
          closestDist = distToCam;
          this.hoveredSat = sat;
        }
      }
    }
  }

  private detectHover2D() {
    const gmstDeg = this.timeSystem.getGmstDeg();
    // Convert mouse position to world 2D coords (screen Y is inverted vs Three.js Y)
    const mouseWorldX = this.camera2d.left + (this.mousePos.x / window.innerWidth) * (this.camera2d.right - this.camera2d.left);
    const mouseWorldY = this.camera2d.top + (this.mousePos.y / window.innerHeight) * (this.camera2d.bottom - this.camera2d.top);

    const touchScale = this.touchCount > 0 || ('ontouchstart' in window) ? 3.0 : 1.0;
    const hitRadius = 12.0 * 1.0 * touchScale / this.cam2dZoom;
    let closestDist = 9999;

    for (const sat of this.satellites) {
      if (this.hideUnselected && this.selectedSat && sat !== this.selectedSat) continue;

      const mc = getMapCoordinates(sat.currentPos, gmstDeg, this.cfg.earthRotationOffset);
      // mc.y is positive for south, but in scene space we negate it
      const dx = mc.x - mouseWorldX;
      const dy = -mc.y - mouseWorldY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < hitRadius && dist < closestDist) {
        closestDist = dist;
        this.hoveredSat = sat;
      }
    }
  }

  private update2DMap(epoch: number, gmstDeg: number) {
    // Update map shader sun direction
    this.mapMaterial.uniforms.showNight.value = this.cfg.showNightLights ? 1.0 : 0.0;
    const sunEci = calculateSunPosition(epoch);
    const earthRotRad = (gmstDeg + this.cfg.earthRotationOffset) * DEG2RAD;
    const sunEcef = sunEci.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -earthRotRad);
    this.mapMaterial.uniforms.sunDir.value.copy(sunEcef);

    const activeSat = this.hoveredSat ?? this.selectedSat;
    const cHL = parseHexColor(this.cfg.orbitHighlighted);

    // Highlighted ground track (using pre-allocated buffer)
    if (activeSat) {
      const segments = Math.min(4000, Math.max(50, Math.floor(400 * this.cfg.orbitsToDraw)));
      const periodDays = TWO_PI / activeSat.meanMotion / 86400.0;
      const timeStep = (periodDays * this.cfg.orbitsToDraw) / segments;

      const trackPts: { x: number; y: number }[] = [];
      for (let j = 0; j <= segments; j++) {
        const t = epoch + j * timeStep;
        const pos = calculatePosition(activeSat, t);
        const gm = epochToGmst(t);
        trackPts.push(getMapCoordinates(pos, gm, this.cfg.earthRotationOffset));
      }

      const arr = this.hlTrackBuffer2d.array as Float32Array;
      let vi = 0;
      for (let off = -1; off <= 1; off++) {
        const xOff = off * MAP_W;
        for (let j = 1; j <= segments; j++) {
          if (vi + 6 > this.maxTrackVerts2d * 3) break;
          if (Math.abs(trackPts[j].x - trackPts[j - 1].x) < MAP_W * 0.6) {
            arr[vi++] = trackPts[j - 1].x + xOff; arr[vi++] = -trackPts[j - 1].y; arr[vi++] = 0.02;
            arr[vi++] = trackPts[j].x + xOff; arr[vi++] = -trackPts[j].y; arr[vi++] = 0.02;
          }
        }
      }

      this.hlTrackBuffer2d.needsUpdate = true;
      this.hlTrack2d.geometry.setDrawRange(0, vi / 3);
      const mat = this.hlTrack2d.material as THREE.LineBasicMaterial;
      mat.color.setRGB(cHL.r, cHL.g, cHL.b);
      mat.opacity = cHL.a;
      this.hlTrack2d.visible = vi > 0;
    } else {
      this.hlTrack2d.visible = false;
    }

    // Satellite dots on map (using pre-allocated buffer)
    const cNorm = parseHexColor(this.cfg.satNormal);
    const cSel = parseHexColor(this.cfg.satSelected);
    const cHov = parseHexColor(this.cfg.satHighlighted);

    const posArr = this.satPosBuffer2d.array as Float32Array;
    const colArr = this.satColorBuffer2d.array as Float32Array;
    let si = 0;
    for (const sat of this.satellites) {
      if (si + 9 > this.maxSatVerts2d * 3) break;
      const mc = getMapCoordinates(sat.currentPos, gmstDeg, this.cfg.earthRotationOffset);
      let c = cNorm;
      if (sat === this.selectedSat) c = cSel;
      else if (sat === this.hoveredSat) c = cHov;

      for (let off = -1; off <= 1; off++) {
        posArr[si] = mc.x + off * MAP_W; posArr[si + 1] = -mc.y; posArr[si + 2] = 0.05;
        colArr[si] = c.r; colArr[si + 1] = c.g; colArr[si + 2] = c.b;
        si += 3;
      }
    }

    this.satPosBuffer2d.needsUpdate = true;
    this.satColorBuffer2d.needsUpdate = true;
    this.satPoints2d.geometry.setDrawRange(0, si / 3);
  }

  private updateUI(activeSat: Satellite | null, gmstDeg: number) {
    // When a sat is selected, only show info card for it (not hover)
    const cardSat = this.selectedSat ? this.selectedSat : activeSat;

    // Status line
    document.getElementById('status-line')!.textContent = this.timeSystem.getDatetimeStr();
    const speedVal = this.timeSystem.timeMultiplier;
    const speedStr = speedVal === 1.0 ? '1x' : `${speedVal.toFixed(speedVal >= 10 ? 0 : 1)}x`;
    const pauseStr = this.timeSystem.paused ? ' PAUSED' : '';
    const speedEl = document.getElementById('speed-line')!;
    speedEl.textContent = `Speed: ${speedStr}${pauseStr}`;
    speedEl.style.color = this.timeSystem.paused ? '#ff6666' : '';

    // Satellite info popup
    const infoEl = document.getElementById('sat-info')!;
    const periLabel = document.getElementById('peri-label')!;
    const apoLabel = document.getElementById('apo-label')!;

    if (cardSat) {
      const rKm = cardSat.currentPos.length();
      const alt = rKm - EARTH_RADIUS_KM;
      const speed = Math.sqrt(MU * (2.0 / rKm - 1.0 / cardSat.semiMajorAxis));
      const latDeg = Math.asin(cardSat.currentPos.y / rKm) * RAD2DEG;
      let lonDeg = (Math.atan2(-cardSat.currentPos.z, cardSat.currentPos.x) - (gmstDeg + this.cfg.earthRotationOffset) * DEG2RAD) * RAD2DEG;
      while (lonDeg > 180) lonDeg -= 360;
      while (lonDeg < -180) lonDeg += 360;

      const nameColor = cardSat === this.hoveredSat ? '#ffff00' : '#00ff00';
      document.getElementById('sat-info-name')!.innerHTML = `<span style="color:${nameColor}">${cardSat.name}</span>`;
      document.getElementById('sat-info-detail')!.innerHTML =
        `Inc: ${(cardSat.inclination * RAD2DEG).toFixed(2)} deg<br>` +
        `RAAN: ${(cardSat.raan * RAD2DEG).toFixed(2)} deg<br>` +
        `Ecc: ${cardSat.eccentricity.toFixed(5)}<br>` +
        `Alt: ${alt.toFixed(2)} km<br>` +
        `Spd: ${speed.toFixed(2)} km/s<br>` +
        `Lat: ${latDeg.toFixed(2)} deg<br>` +
        `Lon: ${lonDeg.toFixed(2)} deg`;

      // Position the popup near the satellite
      let screenPos: THREE.Vector2;
      if (this.viewMode === ViewMode.VIEW_3D) {
        const drawPos = cardSat.currentPos.clone().divideScalar(DRAW_SCALE);
        const projected = drawPos.project(this.camera3d);
        screenPos = new THREE.Vector2(
          (projected.x * 0.5 + 0.5) * window.innerWidth,
          (-projected.y * 0.5 + 0.5) * window.innerHeight
        );
      } else {
        const mc = getMapCoordinates(cardSat.currentPos, gmstDeg, this.cfg.earthRotationOffset);
        // Convert map world coords to screen
        const nx = (mc.x - this.camera2d.left) / (this.camera2d.right - this.camera2d.left);
        const ny = (mc.y - this.camera2d.top) / (this.camera2d.bottom - this.camera2d.top);
        screenPos = new THREE.Vector2(nx * window.innerWidth, ny * window.innerHeight);
      }

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      infoEl.style.display = 'block';
      const infoW = infoEl.offsetWidth;
      const infoH = infoEl.offsetHeight;

      // Place to the right/below the satellite, flip if it would overflow
      let boxX = screenPos.x + 15;
      let boxY = screenPos.y + 15;
      if (boxX + infoW > vw - 4) boxX = Math.max(4, screenPos.x - infoW - 15);
      if (boxY + infoH > vh - 4) boxY = Math.max(4, screenPos.y - infoH - 15);

      infoEl.style.left = `${boxX}px`;
      infoEl.style.top = `${boxY}px`;

      // Apsis labels
      const apsis = computeApsis(cardSat, this.timeSystem.currentEpoch);
      const periR = apsis.periPos.length();
      const apoR = apsis.apoPos.length();

      if (this.viewMode === ViewMode.VIEW_3D) {
        const pDraw = apsis.periPos.clone().divideScalar(DRAW_SCALE);
        const aDraw = apsis.apoPos.clone().divideScalar(DRAW_SCALE);
        const pp = pDraw.project(this.camera3d);
        const ap = aDraw.project(this.camera3d);

        // Only show if in front of camera and on screen
        const ppX = (pp.x * 0.5 + 0.5) * vw;
        const ppY = (-pp.y * 0.5 + 0.5) * vh;
        if (pp.z < 1 && ppX > -50 && ppX < vw + 50 && ppY > -20 && ppY < vh + 20) {
          periLabel.textContent = `Peri: ${(periR - EARTH_RADIUS_KM).toFixed(0)} km`;
          periLabel.style.display = 'block';
          periLabel.style.left = `${ppX + 20}px`;
          periLabel.style.top = `${ppY - 8}px`;
        } else {
          periLabel.style.display = 'none';
        }

        const apX = (ap.x * 0.5 + 0.5) * vw;
        const apY = (-ap.y * 0.5 + 0.5) * vh;
        if (ap.z < 1 && apX > -50 && apX < vw + 50 && apY > -20 && apY < vh + 20) {
          apoLabel.textContent = `Apo: ${(apoR - EARTH_RADIUS_KM).toFixed(0)} km`;
          apoLabel.style.display = 'block';
          apoLabel.style.left = `${apX + 20}px`;
          apoLabel.style.top = `${apY - 8}px`;
        } else {
          apoLabel.style.display = 'none';
        }
      } else {
        periLabel.style.display = 'none';
        apoLabel.style.display = 'none';
      }
    } else {
      infoEl.style.display = 'none';
      periLabel.style.display = 'none';
      apoLabel.style.display = 'none';
    }
  }
}
