import * as THREE from 'three';
import type { PlanetDef } from '../bodies';
import { TargetLock } from '../types';
import { Orrery, type PromotedPlanet } from './orrery';
import { CameraController } from '../interaction/camera-controller';
import { uiStore } from '../stores/ui.svelte';
import type { GraphicsSettings } from '../graphics';

export interface OrreryCallbacks {
  setEarthVisible(visible: boolean): void;
  clearSatSelection(): void;
  setViewMode3D(): void;
  setActiveLock(lock: TargetLock): void;
  /** Called when the user clicks Moon in the orrery — app handles camera snap to moon */
  onMoonClicked(): void;
}

/**
 * Owns all orrery / planet-explorer state and logic.
 * Extracted from App so the main class delegates all planet navigation here.
 */
export class OrreryController {
  private orrery: Orrery | null = null;
  private _orreryMode = false;
  private _activePlanet: PlanetDef | null = null;
  private _promotedPlanet: PromotedPlanet | null = null;
  private pendingHiTex: THREE.Texture | null = null;

  // Mini planet spinner for the picker button
  private miniRenderer!: THREE.WebGLRenderer;
  private miniScene = new THREE.Scene();
  private miniCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 10);
  private miniSphere!: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private miniTextureId = '';

  constructor(
    private scene3d: THREE.Scene,
    private camera3d: THREE.PerspectiveCamera,
    private camera: CameraController,
    private callbacks: OrreryCallbacks,
  ) {}

  // ====================== Getters ======================

  get isOrreryMode(): boolean { return this._orreryMode; }
  get currentActivePlanet(): PlanetDef | null { return this._activePlanet; }
  get currentPromotedPlanet(): PromotedPlanet | null { return this._promotedPlanet; }
  get orreryInstance(): Orrery | null { return this.orrery; }

  // ====================== Orrery lifecycle ======================

  enterOrrery(): void {
    if (this._orreryMode) return;
    this.callbacks.setViewMode3D();
    this._orreryMode = true;
    this._activePlanet = null;
    this._promotedPlanet = null;
    uiStore.orreryMode = true;

    // Create orrery (vertical on portrait screens)
    this.orrery = new Orrery(this.camera3d.aspect);
    this.scene3d.add(this.orrery.group);

    // Hide Earth/moon/sats
    this.callbacks.setEarthVisible(false);
    this.callbacks.clearSatSelection();

    // Position camera to fit all planets with some padding
    this.callbacks.setActiveLock(TargetLock.NONE);
    const halfSpan = this.orrery.totalSpan / 2 + 6;
    const vFov = this.camera3d.fov * Math.PI / 360;
    if (this.orrery.vertical) {
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

  exitOrrery(): void {
    if (!this._orreryMode) return;
    this._orreryMode = false;
    uiStore.orreryMode = false;

    if (this.orrery) {
      this.scene3d.remove(this.orrery.group);
      this.orrery.dispose();
      this.orrery = null;
    }
  }

  // ====================== Click handling ======================

  handleClick(raycaster: THREE.Raycaster, mouseNDC: THREE.Vector2): void {
    if (!this.orrery) return;

    raycaster.setFromCamera(mouseNDC, this.camera3d);
    const hit = this.orrery.pick(raycaster);
    if (!hit) return;

    if (hit.id === 'earth') {
      this.navigateToEarth();
      this.camera.snapDistance(10.5);
      this.camera.snapTarget3dXYZ(0, 0, 0);
      return;
    } else if (hit.id === 'moon') {
      this.navigateToEarth();
      this.callbacks.onMoonClicked();
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

  // ====================== Planet view ======================

  /** Promote the focused orrery body to planet view (upgrade material, load hi-res) */
  async promoteToPlanetView(planet: PlanetDef): Promise<void> {
    if (!this.orrery || this._activePlanet?.id === planet.id) return;

    this.callbacks.setEarthVisible(false);
    this.callbacks.clearSatSelection();
    this._activePlanet = planet;
    this.callbacks.setActiveLock(TargetLock.PLANET);
    this.updatePlanetPickerUI();

    // Upgrade orrery ball material to sun-lit shader (in place, no new mesh)
    this._promotedPlanet = this.orrery.promoteBody(planet.id);

    // Tauri bundles all assets locally — always instant. Also check browser cache.
    const local = '__TAURI__' in window;
    const cached = local || await this.isCached(planet.textureUrl);
    if (cached && this._activePlanet?.id === planet.id && this._promotedPlanet) {
      const loader = new THREE.TextureLoader();
      loader.load(planet.textureUrl, (hiTex) => {
        hiTex.colorSpace = THREE.SRGBColorSpace;
        if (this._activePlanet?.id === planet.id && this._promotedPlanet) {
          this._promotedPlanet.material.uniforms.map.value = hiTex;
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
      if (this._activePlanet?.id === planet.id && this._promotedPlanet) {
        this.pendingHiTex = hiTex;
      } else {
        hiTex.dispose();
      }
    });
  }

  unpromoteToOrrery(): void {
    this._activePlanet = null;
    this._promotedPlanet = null;
    if (this.pendingHiTex) { this.pendingHiTex.dispose(); this.pendingHiTex = null; }
    this.callbacks.setActiveLock(TargetLock.NONE);
    // Recreate orrery (promotion destroyed the original material)
    this.exitOrrery();
    this.enterOrrery();
  }

  navigateToEarth(): void {
    this.exitOrrery();
    this._activePlanet = null;
    this._promotedPlanet = null;
    if (this.pendingHiTex) { this.pendingHiTex.dispose(); this.pendingHiTex = null; }
    this.callbacks.setActiveLock(TargetLock.EARTH);
    this.callbacks.setEarthVisible(true);
    this.camera.setTarget3dXYZ(0, 0, 0);
    this.updatePlanetPickerUI();
  }

  // ====================== Planet picker UI ======================

  updatePlanetPickerUI(): void {
    const thumbUrl = this._activePlanet?.thumbnailUrl ?? '/textures/earth/thumb.webp';
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
    uiStore.activePlanetId = this._activePlanet?.id ?? null;
  }

  /** Check if a URL is already cached (service worker, browser cache, etc.) */
  async isCached(url: string): Promise<boolean> {
    try {
      const keys = await caches.keys();
      for (const key of keys) {
        const cache = await caches.open(key);
        if (await cache.match(url)) return true;
      }
      const resp = await fetch(url, { method: 'HEAD', cache: 'only-if-cached', mode: 'same-origin' });
      return resp.ok;
    } catch {
      return false;
    }
  }

  /** Initialize the mini planet renderer once the Svelte canvas is available */
  initMiniRenderer(): void {
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

  // ====================== Per-frame updates ======================

  /**
   * Update orrery rotation + promoted planet shader uniforms.
   * Called from animate() when in 3D mode.
   */
  updateFrame(params: {
    dt: number;
    sunEciDir: THREE.Vector3;
    showNightLights: boolean;
    gfx: GraphicsSettings;
    timeMultiplier: number;
  }): void {
    if (!this.orrery) return;
    const { dt, sunEciDir, showNightLights, gfx, timeMultiplier } = params;

    this.orrery.update();

    if (this._promotedPlanet) {
      this._promotedPlanet.material.uniforms.sunDir.value.copy(sunEciDir);
      this._promotedPlanet.material.uniforms.showNight.value = showNightLights ? 1.0 : 0.0;
      this._promotedPlanet.material.uniforms.aoEnabled.value = gfx.curvatureAO ? 1.0 : 0.0;
      if (this._promotedPlanet.body.planetDef) {
        const mult = gfx.surfaceRelief / 10;
        this._promotedPlanet.material.uniforms.displacementScale.value =
          this._promotedPlanet.body.planetDef.displacementScale * mult;
        this._promotedPlanet.material.uniforms.bumpStrength.value =
          gfx.bumpMapping ? this._promotedPlanet.body.planetDef.bumpStrength : 0.0;
      }
      this._promotedPlanet.body.mesh.rotation.y += this._promotedPlanet.rotationSpeed * dt * timeMultiplier;

      // Swap hi-res texture only after camera zoom has fully settled
      if (this.pendingHiTex) {
        const zoomRatio = this.camera.zoomSettleRatio;
        if (zoomRatio < 0.005) {
          this._promotedPlanet.material.uniforms.map.value = this.pendingHiTex;
          this.pendingHiTex = null;
        }
      }
    }
  }

  /**
   * Render the mini planet spinner.
   * Called from animate() every frame.
   */
  renderMini(dt: number): void {
    const showMini = (!this._orreryMode || this._promotedPlanet) && this.miniSphere?.material.map;
    if (showMini) {
      this.miniSphere.rotation.y += 0.1 * dt;
      this.miniRenderer.render(this.miniScene, this.miniCamera);
    }
  }

  /**
   * Update hover detection for orrery bodies.
   * Returns true if a body is hovered (for cursor style).
   */
  updateHover(raycaster: THREE.Raycaster, mouseNDC: THREE.Vector2): boolean {
    if (!this._orreryMode || !this.orrery) return false;
    raycaster.setFromCamera(mouseNDC, this.camera3d);
    const hovered = this.orrery.updateHover(raycaster);
    return !!hovered;
  }

  /**
   * Get the world position of a promoted planet body (for target lock).
   */
  getPromotedBodyPosition(): THREE.Vector3 | null {
    if (!this._promotedPlanet || !this.orrery) return null;
    return this.orrery.getBodyPosition(this._promotedPlanet.body.id);
  }
}
