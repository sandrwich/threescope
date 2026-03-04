import * as THREE from 'three';
import { ViewMode, TargetLock } from '../types';
import type { CameraController } from './camera-controller';
import type { PostProcessing } from '../scene/post-processing';
import { timeStore } from '../stores/time.svelte';
import { uiStore } from '../stores/ui.svelte';

export interface InputCallbacks {
  getViewMode(): ViewMode;
  getOrreryMode(): boolean;
  getActiveLock(): TargetLock;
  getMinZoom(): number;
  clearTargetLock(): void;
  onSelect(): void;
  onDoubleClick3D(): void;
  onDoubleClick2D(): void;
  onDoubleClickSky(): void;
  onOrreryClick(): void;
  onToggleViewMode(): void;
  onToggleSkyView(): void;
  onSkyClick(ndcX: number, ndcY: number): void;
  onSkyDrag(ndcX: number, ndcY: number): void;
  onResize(w: number, h: number): void;
  tryStartObserverDrag(): boolean;
  onObserverDrag(): void;
  tryStartOrbitScrub(): boolean;
  onOrbitScrub(): void;
}

/**
 * Owns all mouse/touch/keyboard input state and event handlers.
 * Extracted from App so the main class only handles domain logic via callbacks.
 */
export class InputHandler {
  // Mouse/touch state
  private _mousePos = new THREE.Vector2();
  private _mouseNDC = new THREE.Vector2();
  private _lastLeftClickTime = 0;
  private _isRightDragging = false;
  private _isMiddleDragging = false;
  private _mouseDelta = new THREE.Vector2();
  private _touchCount = 0;
  private _lastTouchPos = new THREE.Vector2();
  private _lastPinchDist = 0;
  private _lastTwoTouchCenter = new THREE.Vector2();
  private _touchStartPos = new THREE.Vector2();
  private _touchStartTime = 0;
  private _touchDragChecked = false;
  private _touchGesture: 'pinch' | 'pan' | null = null;

  // Observer marker drag
  private _isDraggingObserver = false;
  private _leftDownPos = new THREE.Vector2();
  private _leftDown = false;

  // Orbit scrub drag
  private _isDraggingOrbit = false;

  // Left-drag orbit (fallback when observer/orbit scrub don't activate)
  private _isLeftDragging = false;

  // Hover dirty flag: set when mouseNDC changes, consumed by app to skip redundant raycasts
  private _hoverDirty = false;


  // UI overlay tracking
  private _pointerOverUI = false;
  private _canvas!: HTMLCanvasElement;

  // Pointer event touch tracking (for browser DevTools touch emulation)
  private _hasRealTouch = false;
  private _pointerTouches = new Map<number, { x: number; y: number }>();

  constructor(
    canvas: HTMLCanvasElement,
    private renderer: THREE.WebGLRenderer,
    private camera: CameraController,
    private camera3d: THREE.PerspectiveCamera,
    private postProcessing: PostProcessing,
    private cb: InputCallbacks,
  ) {
    this.setupEvents(canvas);
  }

  // ====================== Public getters ======================

  get mousePos(): THREE.Vector2 { return this._mousePos; }
  get mouseNDC(): THREE.Vector2 { return this._mouseNDC; }
  get isTouchActive(): boolean { return this._touchCount > 0 || ('ontouchstart' in window); }
  get touchCount(): number { return this._touchCount; }
  get isDraggingObserver(): boolean { return this._isDraggingObserver; }
  get isDraggingOrbit(): boolean { return this._isDraggingOrbit; }
  get isOverUI(): boolean { return this._pointerOverUI; }

  /** Returns true if mouseNDC changed since last call, then resets. */
  consumeHoverDirty(): boolean {
    const d = this._hoverDirty;
    this._hoverDirty = false;
    return d;
  }

  /** Mark hover as needing recomputation (called when camera moves). */
  markHoverDirty(): void { this._hoverDirty = true; }

  // ====================== Event setup ======================

  private setupEvents(canvas: HTMLCanvasElement): void {
    this._canvas = canvas;

    // Resize
    window.addEventListener('resize', () => {
      const w = window.innerWidth, h = window.innerHeight;
      this.renderer.setSize(w, h);
      this.camera3d.aspect = w / h;
      this.camera3d.updateProjectionMatrix();
      this.postProcessing.setSize(w, h);
      this.camera.updateCamera2dProjection();
      this.cb.onResize(w, h);
    });

    // Mouse tracking
    window.addEventListener('mousemove', (e) => {
      const dx = e.movementX, dy = e.movementY;
      this._mouseDelta.set(dx, dy);
      this._mousePos.set(e.clientX, e.clientY);
      this._mouseNDC.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      );
      this._hoverDirty = true;
      this._pointerOverUI = e.target !== this._canvas;

      // Observer marker drag / orbit scrub / left-drag orbit (skip in sky view)
      if (this._leftDown && !this._pointerOverUI && !this._isDraggingObserver && !this._isDraggingOrbit && !this._isLeftDragging) {
        const dist = this._leftDownPos.distanceTo(this._mousePos);
        if (dist > 8) {
          if (this.cb.getViewMode() === ViewMode.VIEW_SKY) {
            // Sky view: always orbit
            this._isLeftDragging = true;
          } else {
            // Moved enough to start drag — check observer first, then orbit scrub, then orbit
            this._isDraggingObserver = this.cb.tryStartObserverDrag();
            if (!this._isDraggingObserver) {
              this._isDraggingOrbit = this.cb.tryStartOrbitScrub();
            }
            if (!this._isDraggingObserver && !this._isDraggingOrbit) {
              this._isLeftDragging = true;
            }
          }
          this._leftDown = false; // don't re-check
        }
      }
      if (this._isDraggingObserver) {
        this.cb.onObserverDrag();
        return; // don't orbit/pan while dragging observer
      }
      if (this._isDraggingOrbit) {
        this.cb.onOrbitScrub();
        return; // don't orbit/pan while scrubbing
      }

      if (this._isRightDragging || this._isMiddleDragging || this._isLeftDragging) {
        const vm = this.cb.getViewMode();
        if (vm === ViewMode.VIEW_SKY) {
          if (this._isLeftDragging) {
            // Sky view: left-drag aims beam to current pointer position
            this.cb.onSkyDrag(this._mouseNDC.x, this._mouseNDC.y);
          } else {
            // Sky view: right/middle-drag orbits (look around)
            this.camera.orbit(dx, dy);
          }
        } else if (vm === ViewMode.VIEW_2D) {
          // Pan 2D
          this.camera.pan2d(dx, dy);
          this.cb.clearTargetLock();
        } else {
          // Orbit 3D
          if (e.shiftKey || e.altKey) {
            this.camera.pan3d(dx, dy);
            this.cb.clearTargetLock();
          } else {
            this.camera.orbit(dx, dy);
          }
        }
      }
    });

    window.addEventListener('mousedown', (e) => {
      this._pointerOverUI = e.target !== this._canvas;
      if (e.button === 0) {
        this._leftDown = true;
        this._leftDownPos.set(e.clientX, e.clientY);
      }
      if (e.button === 2) this._isRightDragging = true;
      if (e.button === 1) this._isMiddleDragging = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this._leftDown = false;
        this._isLeftDragging = false;
        if (this._isDraggingObserver) {
          this._isDraggingObserver = false;
        }
        if (this._isDraggingOrbit) {
          this._isDraggingOrbit = false;
        }
      }
      if (e.button === 2) this._isRightDragging = false;
      if (e.button === 1) this._isMiddleDragging = false;
    });

    // Prevent context menu
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Native double-click for sky view beam lock (more reliable than manual timing)
    canvas.addEventListener('dblclick', (e) => {
      if (this.cb.getViewMode() === ViewMode.VIEW_SKY) {
        this.cb.onDoubleClickSky();
      }
    });

    // Scroll zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = -Math.sign(e.deltaY);
      const vm = this.cb.getViewMode();
      if (vm === ViewMode.VIEW_SKY) {
        this.camera.applySkyZoom(delta);
      } else if (vm === ViewMode.VIEW_2D) {
        this.camera.applyZoom2d(delta);
        this.cb.clearTargetLock();
      } else {
        this.camera.applyZoom3d(delta, this.cb.getMinZoom());
      }
    }, { passive: false });

    // Click selection
    canvas.addEventListener('click', (e) => {
      // Suppress click if we just finished dragging the observer or orbit scrub
      if (this._isDraggingObserver || this._isDraggingOrbit) return;

      const wasDrag = this._leftDownPos.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 8;

      // Sky view: single click selects sat + aims beam (double-click handled by dblclick event)
      if (this.cb.getViewMode() === ViewMode.VIEW_SKY) {
        if (!wasDrag) {
          this.cb.onSelect();
          this.cb.onSkyClick(this._mouseNDC.x, this._mouseNDC.y);
        }
        return;
      }

      // Check if left button was released after a drag (distance > threshold)
      if (wasDrag) return;

      // Orrery mode: pick planet
      if (this.cb.getOrreryMode()) {
        this.cb.onOrreryClick();
        return;
      }

      // Delegate satellite selection to App
      this.cb.onSelect();

      // Double click detection for target lock
      const now = performance.now() / 1000;
      if (now - this._lastLeftClickTime < 0.3) {
        if (this.cb.getViewMode() === ViewMode.VIEW_3D) {
          this.cb.onDoubleClick3D();
        } else {
          this.cb.onDoubleClick2D();
        }
      }
      this._lastLeftClickTime = now;
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
          timeStore.resetSpeed();
          break;
        case 'Home':
          this.camera.resetView();
          this.cb.clearTargetLock();
          break;
        case 'm':
        case 'M':
          this.cb.onToggleViewMode();
          break;
        case 'c':
        case 'C':
          uiStore.setToggle('showClouds', !uiStore.showClouds);
          break;
        case 'n':
        case 'N':
          uiStore.setToggle('showNightLights', !uiStore.showNightLights);
          break;
        case 'l':
        case 'L':
          uiStore.setToggle('showOrbits', !uiStore.showOrbits);
          break;
        case '?':
          uiStore.infoModalOpen = true;
          break;
        case '`':
          uiStore.chromeVisible = !uiStore.chromeVisible;
          break;
        case 'p':
        case 'P':
          uiStore.passesWindowOpen = !uiStore.passesWindowOpen;
          break;
        case 'd':
        case 'D':
          uiStore.dataSourcesOpen = !uiStore.dataSourcesOpen;
          break;
        case 'o':
        case 'O':
          uiStore.observerWindowOpen = !uiStore.observerWindowOpen;
          break;
        case 'r':
        case 'R':
          uiStore.radarOpen = !uiStore.radarOpen;
          break;
        case 's':
        case 'S':
          this.cb.onToggleSkyView();
          break;
      }
    });


    // Prevent middle-click auto-scroll
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1) e.preventDefault();
    });

    // Touch events (real touch devices)
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._hasRealTouch = true;
      if (e.target !== this._canvas) return;
      this._handleTouchStart(Array.from(e.touches, t => ({ x: t.clientX, y: t.clientY })));
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this._handleTouchMove(Array.from(e.touches, t => ({ x: t.clientX, y: t.clientY })));
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this._handleTouchEnd(
        Array.from(e.touches, t => ({ x: t.clientX, y: t.clientY })),
        Array.from(e.changedTouches, t => ({ x: t.clientX, y: t.clientY })),
      );
    }, { passive: false });

    canvas.addEventListener('touchcancel', () => this._handleTouchCancel());

    // Pointer events (for browser DevTools touch emulation — Firefox/Chrome RDM)
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || this._hasRealTouch) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      this._pointerTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._handleTouchStart(Array.from(this._pointerTouches.values()));
    });

    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch' || this._hasRealTouch) return;
      if (!this._pointerTouches.has(e.pointerId)) return;
      e.preventDefault();
      this._pointerTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._handleTouchMove(Array.from(this._pointerTouches.values()));
    });

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || this._hasRealTouch) return;
      if (!this._pointerTouches.has(e.pointerId)) return;
      const changed = { x: e.clientX, y: e.clientY };
      this._pointerTouches.delete(e.pointerId);
      this._handleTouchEnd(Array.from(this._pointerTouches.values()), [changed]);
    };
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', (e) => {
      if (e.pointerType !== 'touch' || this._hasRealTouch) return;
      this._pointerTouches.clear();
      this._handleTouchCancel();
    });
  }

  // ====================== Touch gesture handlers ======================

  private _handleTouchStart(touches: { x: number; y: number }[]): void {
    this.camera.stopInertia();
    this._touchCount = touches.length;
    this._touchGesture = null;

    if (touches.length === 1) {
      this._lastTouchPos.set(touches[0].x, touches[0].y);
      this._touchStartPos.set(touches[0].x, touches[0].y);
      this._touchStartTime = performance.now();
      this._touchDragChecked = false;
      this._mousePos.set(touches[0].x, touches[0].y);
      this._mouseNDC.set(
        (touches[0].x / window.innerWidth) * 2 - 1,
        -(touches[0].y / window.innerHeight) * 2 + 1,
      );
      this._hoverDirty = true;
    } else if (touches.length === 2) {
      const dx = touches[1].x - touches[0].x;
      const dy = touches[1].y - touches[0].y;
      this._lastPinchDist = Math.sqrt(dx * dx + dy * dy);
      this._lastTwoTouchCenter.set(
        (touches[0].x + touches[1].x) / 2,
        (touches[0].y + touches[1].y) / 2,
      );
    }
  }

  private _handleTouchMove(touches: { x: number; y: number }[]): void {
    const count = touches.length;
    if (count > 2) return;

    // Detect finger count changes mid-gesture
    if (count !== this._touchCount) {
      if (count === 1) {
        // 2→1 transition: reinitialize single-finger state
        this._lastTouchPos.set(touches[0].x, touches[0].y);
        this._touchDragChecked = true; // don't re-check observer/scrub after pinch
      } else if (count === 2) {
        // 1→2 transition: initialize pinch/pan state
        const tdx = touches[1].x - touches[0].x;
        const tdy = touches[1].y - touches[0].y;
        this._lastPinchDist = Math.sqrt(tdx * tdx + tdy * tdy);
        this._lastTwoTouchCenter.set(
          (touches[0].x + touches[1].x) / 2,
          (touches[0].y + touches[1].y) / 2,
        );
      }
      this._touchCount = count;
      this._touchGesture = null;
      return; // skip this frame to avoid jumps
    }

    if (count === 1) {
      // Single finger: orbit (3D) or pan (2D)
      const tx = touches[0].x, ty = touches[0].y;
      const dx = tx - this._lastTouchPos.x;
      const dy = ty - this._lastTouchPos.y;
      this._lastTouchPos.set(tx, ty);
      this._mousePos.set(tx, ty);
      this._mouseNDC.set(
        (tx / window.innerWidth) * 2 - 1,
        -(ty / window.innerHeight) * 2 + 1,
      );
      this._hoverDirty = true;

      // Observer drag / orbit scrub detection (skip in sky view — always orbit)
      if (!this._touchDragChecked && !this._isDraggingObserver && !this._isDraggingOrbit
        && this.cb.getViewMode() !== ViewMode.VIEW_SKY) {
        const dist = this._touchStartPos.distanceTo(this._lastTouchPos);
        if (dist > 8) {
          this._isDraggingObserver = this.cb.tryStartObserverDrag();
          if (!this._isDraggingObserver) {
            this._isDraggingOrbit = this.cb.tryStartOrbitScrub();
          }
          this._touchDragChecked = true;
        }
      }

      if (this._isDraggingObserver) { this.cb.onObserverDrag(); return; }
      if (this._isDraggingOrbit) { this.cb.onOrbitScrub(); return; }

      const vm = this.cb.getViewMode();
      if (vm === ViewMode.VIEW_SKY) {
        this.camera.orbitWithVelocity(dx, dy);
      } else if (vm === ViewMode.VIEW_2D) {
        this.camera.pan2dWithVelocity(dx, dy);
        this.cb.clearTargetLock();
      } else {
        this.camera.orbitWithVelocity(dx, dy);
      }
    } else if (count === 2) {
      // Two fingers: pinch zoom and/or pan
      const tdx = touches[1].x - touches[0].x;
      const tdy = touches[1].y - touches[0].y;
      const pinchDist = Math.sqrt(tdx * tdx + tdy * tdy);
      const centerX = (touches[0].x + touches[1].x) / 2;
      const centerY = (touches[0].y + touches[1].y) / 2;

      // Gesture disambiguation: lock into dominant gesture
      if (this._touchGesture === null && this._lastPinchDist > 0) {
        const pinchDelta = Math.abs(pinchDist - this._lastPinchDist);
        const panDelta = Math.sqrt(
          (centerX - this._lastTwoTouchCenter.x) ** 2 +
          (centerY - this._lastTwoTouchCenter.y) ** 2,
        );
        if (pinchDelta > 5 || panDelta > 5) {
          this._touchGesture = pinchDelta > panDelta ? 'pinch' : 'pan';
        }
      }

      // Pinch zoom (suppressed if gesture locked to pan)
      if (this._touchGesture !== 'pan' && this._lastPinchDist > 0) {
        const scale = pinchDist / this._lastPinchDist;
        const vm = this.cb.getViewMode();
        if (vm === ViewMode.VIEW_SKY) {
          this.camera.pinchSkyZoom(scale);
        } else if (vm === ViewMode.VIEW_2D) {
          this.camera.pinchZoom2d(scale);
        } else {
          this.camera.pinchZoom3d(scale, this.cb.getMinZoom());
        }
      }

      // Two-finger pan (suppressed if gesture locked to pinch)
      if (this._touchGesture !== 'pinch') {
        const panDx = centerX - this._lastTwoTouchCenter.x;
        const panDy = centerY - this._lastTwoTouchCenter.y;
        const vm = this.cb.getViewMode();
        if (vm === ViewMode.VIEW_SKY) {
          // Sky view: no pan, ignore two-finger pan
        } else if (vm === ViewMode.VIEW_3D) {
          this.camera.pan3dWithVelocity(panDx, panDy);
          this.cb.clearTargetLock();
        } else {
          this.camera.pan2dWithVelocity(panDx, panDy);
          this.cb.clearTargetLock();
        }
      }

      this._lastPinchDist = pinchDist;
      this._lastTwoTouchCenter.set(centerX, centerY);
    }
  }

  private _handleTouchEnd(remaining: { x: number; y: number }[], changed: { x: number; y: number }[]): void {
    if (remaining.length === 0) {
      // All fingers up
      if (this._isDraggingObserver) { this._isDraggingObserver = false; }
      else if (this._isDraggingOrbit) { this._isDraggingOrbit = false; }
      else {
        // Tap detection (distance + time threshold)
        const touchDist = this._touchStartPos.distanceTo(
          new THREE.Vector2(changed[0].x, changed[0].y),
        );
        const touchDuration = performance.now() - this._touchStartTime;
        const isTap = this._touchCount === 1 && touchDist < 12 && touchDuration < 400;

        if (isTap) {
          if (this.cb.getViewMode() === ViewMode.VIEW_SKY) {
            this.cb.onSelect();
            const now = performance.now() / 1000;
            if (now - this._lastLeftClickTime < 0.3) {
              this.cb.onDoubleClickSky();
            } else {
              this.cb.onSkyClick(this._mouseNDC.x, this._mouseNDC.y);
            }
            this._lastLeftClickTime = now;
          } else if (this.cb.getOrreryMode()) {
            this.cb.onOrreryClick();
          } else {
            this.cb.onSelect();
            // Double tap detection
            const now = performance.now() / 1000;
            if (now - this._lastLeftClickTime < 0.3) {
              if (this.cb.getViewMode() === ViewMode.VIEW_3D) {
                this.cb.onDoubleClick3D();
              } else {
                this.cb.onDoubleClick2D();
              }
            }
            this._lastLeftClickTime = now;
          }
        } else {
          // Not a tap — start inertia
          this.camera.startInertia();
        }
      }
    } else if (remaining.length === 1 && this._touchCount === 2) {
      // 2→1 transition: reinitialize for single-finger orbit
      this._lastTouchPos.set(remaining[0].x, remaining[0].y);
      this._touchGesture = null;
    }

    this._touchCount = remaining.length;
    this._lastPinchDist = 0;
  }

  private _handleTouchCancel(): void {
    this._touchCount = 0;
    this._lastPinchDist = 0;
    this._isDraggingObserver = false;
    this._isDraggingOrbit = false;
    this._touchGesture = null;
  }
}
