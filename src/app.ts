import * as THREE from 'three';
import type { Satellite } from './types';
import { TargetLock, ViewMode } from './types';
import { defaultConfig, parseHexColor, hexToCSS } from './config';
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

  private satellites: Satellite[] = [];
  private hoveredSat: Satellite | null = null;
  private selectedSat: Satellite | null = null;
  private activeLock = TargetLock.EARTH;
  private viewMode = ViewMode.VIEW_3D;
  private hideUnselected = false;
  private unselectedFade = 1.0;
  private cfg = { ...defaultConfig };

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
    document.getElementById('ui-overlay')!.before(this.renderer.domElement);

    // Cameras
    this.camera3d = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 10000);
    this.scene3d = new THREE.Scene();
    this.scene3d.background = new THREE.Color(this.cfg.bgColor);

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

    this.setLoading(0.6, 'Fetching satellite data...');
    await this.loadTLEGroup(DEFAULT_GROUP);

    this.setLoading(0.9, 'Setting up UI...');
    this.setupUI();
    this.setupEvents();

    this.setLoading(1.0, 'Ready!');
    setTimeout(() => { this.loadingScreen.style.display = 'none'; }, 300);

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

    const [dayTex, nightTex, cloudTex, moonTex, satTex, markerTex] = await Promise.all([
      load('/textures/earth.png'),
      load('/textures/earth_night.png'),
      load('/textures/clouds.png'),
      load('/textures/moon.png'),
      load('/textures/sat_icon.png'),
      load('/textures/marker_icon.png'),
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

    this.setLoading(0.4, 'Building scene...');

    // Earth
    this.earth = new Earth(dayTex, nightTex);
    this.scene3d.add(this.earth.mesh);

    // Clouds
    this.cloudLayer = new CloudLayer(cloudTex);
    this.scene3d.add(this.cloudLayer.mesh);

    // Moon
    this.moonScene = new MoonScene(moonTex);
    this.scene3d.add(this.moonScene.mesh);

    // Sun
    this.sunScene = new SunScene();
    this.scene3d.add(this.sunScene.disc);
    this.scene3d.add(this.sunScene.corona);

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
    try {
      const result = await fetchTLEData(group, (msg) => {
        this.satStatusText = msg;
      }, forceRetry);
      this.satellites = result.satellites;
      this.selectedSat = null;
      this.hoveredSat = null;
      this.orbitRenderer.precomputeOrbits(this.satellites);

      let info = `${this.satellites.length} sats`;
      if (result.source === 'cache' && result.cacheAge != null) {
        info += ` (${formatAge(result.cacheAge)})`;
      } else if (result.source === 'stale-cache' && result.cacheAge != null) {
        info += ` (offline, ${formatAge(result.cacheAge)})`;
      }
      if (result.rateLimited) info += ' — rate limited';
      this.satStatusText = info;
      this.showRetryLink(result.rateLimited === true);
    } catch (e) {
      console.error('Failed to load TLE data:', e);
      const rl = (e as any)?.rateLimited === true;
      this.satStatusText = rl ? 'Rate limited' : 'Load failed';
      this.showRetryLink(rl);
    }
  }

  private showRetryLink(show: boolean) {
    let link = document.getElementById('retry-link');
    if (show) {
      if (!link) {
        link = document.createElement('div');
        link.id = 'retry-link';
        link.style.cssText = 'color:#888;font-size:13px;cursor:pointer;text-decoration:underline;margin-top:2px;';
        link.textContent = 'Retry';
        link.addEventListener('click', () => {
          clearRateLimit();
          this.loadTLEGroup(this.currentGroup, true);
        });
        document.getElementById('stats-panel')!.appendChild(link);
      }
      link.style.display = 'block';
    } else if (link) {
      link.style.display = 'none';
    }
  }

  private loadCustomTLE(text: string, label: string) {
    const statusEl = document.getElementById('sat-count-display')!;
    try {
      this.satellites = parseTLEText(text);
      this.selectedSat = null;
      this.hoveredSat = null;
      this.orbitRenderer.precomputeOrbits(this.satellites);
      statusEl.textContent = `${this.satellites.length} Sats (${label})`;
    } catch (e) {
      console.error('Failed to parse TLE data:', e);
      statusEl.textContent = 'Parse failed';
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
      if (src.group === DEFAULT_GROUP) opt.selected = true;
      select.appendChild(opt);
    }

    select.addEventListener('change', async () => {
      if (select.value === '__custom__') {
        customRow.classList.add('visible');
        return;
      }
      customRow.classList.remove('visible');
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

    // Checkboxes
    document.getElementById('cb-hide-unselected')!.addEventListener('change', (e) => {
      this.hideUnselected = (e.target as HTMLInputElement).checked;
    });
    document.getElementById('cb-clouds')!.addEventListener('change', (e) => {
      this.cfg.showClouds = (e.target as HTMLInputElement).checked;
    });
    document.getElementById('cb-night-lights')!.addEventListener('change', (e) => {
      this.cfg.showNightLights = (e.target as HTMLInputElement).checked;
    });


    // Info modal (mobile)
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
  }

  private setupEvents() {
    // Resize
    window.addEventListener('resize', () => {
      const w = window.innerWidth, h = window.innerHeight;
      this.renderer.setSize(w, h);
      this.camera3d.aspect = w / h;
      this.camera3d.updateProjectionMatrix();
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
        const earthR = EARTH_RADIUS_KM / DRAW_SCALE;
        this.targetCamDistance -= delta * (this.targetCamDistance * 0.1);
        this.targetCamDistance = Math.max(earthR + 1.0, this.targetCamDistance);
      }
    }, { passive: false });

    // Click selection
    this.renderer.domElement.addEventListener('click', (e) => {
      // Ignore clicks on UI area
      if (e.clientX < 220 && e.clientY > 110 && e.clientY < 210) return;

      this.selectedSat = this.hoveredSat;

      // Double click detection for target lock
      const now = performance.now() / 1000;
      if (now - this.lastLeftClickTime < 0.3) {
        if (this.viewMode === ViewMode.VIEW_3D) {
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(this.mouseNDC, this.camera3d);
          const earthR = EARTH_RADIUS_KM / DRAW_SCALE;
          const moonR = MOON_RADIUS_KM / DRAW_SCALE;
          const moonSphere = new THREE.Sphere(this.moonScene.drawPos, moonR);
          const earthSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), earthR);
          const sunSphere = new THREE.Sphere(this.sunScene.disc.position, 6); // generous hit radius
          const moonHit = raycaster.ray.intersectsSphere(moonSphere);
          const earthHit = raycaster.ray.intersectsSphere(earthSphere);
          const sunHit = raycaster.ray.intersectsSphere(sunSphere);
          if (sunHit && !earthHit && !moonHit) this.activeLock = TargetLock.SUN;
          else if (moonHit && !earthHit) this.activeLock = TargetLock.MOON;
          else if (earthHit) this.activeLock = TargetLock.EARTH;
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
            const earthR = EARTH_RADIUS_KM / DRAW_SCALE;
            this.targetCamDistance = Math.max(earthR + 1.0, this.targetCamDistance);
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
        this.selectedSat = this.hoveredSat;

        // Double tap detection
        const now = performance.now() / 1000;
        if (now - this.lastLeftClickTime < 0.3) {
          if (this.viewMode === ViewMode.VIEW_3D) {
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(this.mouseNDC, this.camera3d);
            const earthR = EARTH_RADIUS_KM / DRAW_SCALE;
            const moonR = MOON_RADIUS_KM / DRAW_SCALE;
            const moonSphere = new THREE.Sphere(this.moonScene.drawPos, moonR);
            const earthSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), earthR);
            const sunSphere = new THREE.Sphere(this.sunScene.disc.position, 6);
            const moonHit = raycaster.ray.intersectsSphere(moonSphere);
            const earthHit = raycaster.ray.intersectsSphere(earthSphere);
            const sunHit = raycaster.ray.intersectsSphere(sunSphere);
            if (sunHit && !earthHit && !moonHit) this.activeLock = TargetLock.SUN;
            else if (moonHit && !earthHit) this.activeLock = TargetLock.MOON;
            else if (earthHit) this.activeLock = TargetLock.EARTH;
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

  private animate() {
    requestAnimationFrame(() => this.animate());

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
    } else {
      this.unselectedFade += 3.0 * dt;
      if (this.unselectedFade > 1) this.unselectedFade = 1;
    }

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
    const camAX = this.camAngleX + earthRotRad;
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

    // Hover detection (3D)
    this.hoveredSat = null;
    if (this.viewMode === ViewMode.VIEW_3D) {
      this.detectHover3D();
    } else {
      this.detectHover2D();
    }

    const activeSat = this.hoveredSat ?? this.selectedSat;

    if (this.viewMode === ViewMode.VIEW_3D) {
      // Update 3D scene
      this.earth.update(epoch, gmstDeg, this.cfg.earthRotationOffset, this.cfg.showNightLights);
      this.cloudLayer.update(epoch, gmstDeg, this.cfg.earthRotationOffset, this.cfg.showClouds, this.cfg.showNightLights);
      this.moonScene.update(epoch);
      this.sunScene.update(epoch);

      this.satManager.update(
        this.satellites, epoch, this.camera3d.position,
        this.hoveredSat, this.selectedSat, this.unselectedFade, this.hideUnselected,
        { normal: this.cfg.satNormal, highlighted: this.cfg.satHighlighted, selected: this.cfg.satSelected }
      );

      this.orbitRenderer.update(
        this.satellites, epoch, this.hoveredSat, this.selectedSat,
        this.unselectedFade, this.cfg.orbitsToDraw,
        { orbitNormal: this.cfg.orbitNormal, orbitHighlighted: this.cfg.orbitHighlighted },
        dt
      );

      this.footprintRenderer.update(
        activeSat ? activeSat.currentPos : null,
        { footprintBg: this.cfg.footprintBg, footprintBorder: this.cfg.footprintBorder }
      );

      this.markerManager.update(gmstDeg, this.cfg.earthRotationOffset, this.camera3d, this.camDistance);

      this.renderer.clear();
      this.renderer.render(this.scene3d, this.camera3d);
    } else {
      // Update 2D map
      this.update2DMap(epoch, gmstDeg);
      this.markerManager.hide();
      this.orbitRenderer.clear();
      this.footprintRenderer.clear();

      this.renderer.clear();
      this.renderer.render(this.scene2d, this.camera2d);
    }

    this.updateUI(activeSat, gmstDeg);
  }

  private detectHover3D() {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(this.mouseNDC, this.camera3d);

    let closestDist = 9999;
    for (const sat of this.satellites) {
      if (this.hideUnselected && this.selectedSat && sat !== this.selectedSat) continue;

      const drawPos = sat.currentPos.clone().divideScalar(DRAW_SCALE);
      const distToCam = this.camera3d.position.distanceTo(drawPos);
      const touchScale = this.touchCount > 0 || ('ontouchstart' in window) ? 3.0 : 1.0;
      const hitRadius = 0.015 * distToCam * 1.0 * touchScale;

      const sphere = new THREE.Sphere(drawPos, hitRadius);
      if (raycaster.ray.intersectsSphere(sphere)) {
        const d = this.camera3d.position.distanceTo(drawPos);
        if (d < closestDist) {
          closestDist = d;
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
    const statusEl = document.getElementById('status-line')!;
    const speedVal = this.timeSystem.timeMultiplier;
    const speedStr = speedVal === 1.0 ? '1x' : `${speedVal.toFixed(speedVal >= 10 ? 0 : 1)}x`;
    const pauseStr = this.timeSystem.paused ? ' <span style="color:#ff6666">PAUSED</span>' : '';
    statusEl.innerHTML = `${this.timeSystem.getDatetimeStr()} <span style="color:#555">|</span> Speed: ${speedStr}${pauseStr}`;

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
