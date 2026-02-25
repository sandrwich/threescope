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
  onOrreryClick(): void;
  onToggleViewMode(): void;
  onResize(w: number, h: number): void;
  tryStartObserverDrag(): boolean;
  onObserverDrag(): void;
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
  private _touchMoved = false;

  // Observer marker drag
  private _isDraggingObserver = false;
  private _leftDownPos = new THREE.Vector2();
  private _leftDown = false;

  // UI overlay tracking
  private _pointerOverUI = false;
  private _canvas!: HTMLCanvasElement;

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
  get isOverUI(): boolean { return this._pointerOverUI; }

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
      this._pointerOverUI = e.target !== this._canvas;

      // Observer marker drag
      if (this._leftDown && !this._isDraggingObserver) {
        const dist = this._leftDownPos.distanceTo(this._mousePos);
        if (dist > 4) {
          // Moved enough to start drag — check if we should drag the observer
          this._isDraggingObserver = this.cb.tryStartObserverDrag();
          this._leftDown = false; // don't re-check
        }
      }
      if (this._isDraggingObserver) {
        this.cb.onObserverDrag();
        return; // don't orbit/pan while dragging observer
      }

      if (this._isRightDragging || this._isMiddleDragging) {
        if (this.cb.getViewMode() === ViewMode.VIEW_2D) {
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
        if (this._isDraggingObserver) {
          this._isDraggingObserver = false;
        }
      }
      if (e.button === 2) this._isRightDragging = false;
      if (e.button === 1) this._isMiddleDragging = false;
    });

    // Prevent context menu
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Scroll zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = -Math.sign(e.deltaY);
      if (this.cb.getViewMode() === ViewMode.VIEW_2D) {
        this.camera.applyZoom2d(delta);
        this.cb.clearTargetLock();
      } else {
        this.camera.applyZoom3d(delta, this.cb.getMinZoom());
      }
    }, { passive: false });

    // Click selection
    canvas.addEventListener('click', (e) => {
      // Suppress click if we just finished dragging the observer
      if (this._isDraggingObserver) return;
      // Check if left button was released after a drag (distance > threshold)
      if (this._leftDownPos.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 4) return;

      // Ignore clicks on UI area
      if (e.clientX < 220 && e.clientY > 110 && e.clientY < 210) return;

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
        case 'm':
        case 'M':
          this.cb.onToggleViewMode();
          break;
        case '?':
          uiStore.infoModalOpen = true;
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
      }
    });

    // Prevent middle-click auto-scroll
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1) e.preventDefault();
    });

    // Touch events
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._touchCount = e.touches.length;
      this._touchMoved = false;

      if (e.touches.length === 1) {
        this._lastTouchPos.set(e.touches[0].clientX, e.touches[0].clientY);
        this._mousePos.set(e.touches[0].clientX, e.touches[0].clientY);
        this._mouseNDC.set(
          (e.touches[0].clientX / window.innerWidth) * 2 - 1,
          -(e.touches[0].clientY / window.innerHeight) * 2 + 1,
        );
      } else if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        this._lastPinchDist = Math.sqrt(dx * dx + dy * dy);
        this._lastTwoTouchCenter.set(
          (e.touches[0].clientX + e.touches[1].clientX) / 2,
          (e.touches[0].clientY + e.touches[1].clientY) / 2,
        );
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this._touchMoved = true;

      if (e.touches.length === 1 && this._touchCount === 1) {
        // Single finger: orbit (3D) or pan (2D)
        const tx = e.touches[0].clientX, ty = e.touches[0].clientY;
        const dx = tx - this._lastTouchPos.x;
        const dy = ty - this._lastTouchPos.y;
        this._lastTouchPos.set(tx, ty);
        this._mousePos.set(tx, ty);
        this._mouseNDC.set(
          (tx / window.innerWidth) * 2 - 1,
          -(ty / window.innerHeight) * 2 + 1,
        );

        if (this.cb.getViewMode() === ViewMode.VIEW_2D) {
          this.camera.pan2d(dx, dy);
          this.cb.clearTargetLock();
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
        if (this._lastPinchDist > 0) {
          const scale = pinchDist / this._lastPinchDist;
          if (this.cb.getViewMode() === ViewMode.VIEW_2D) {
            this.camera.pinchZoom2d(scale);
          } else {
            this.camera.pinchZoom3d(scale, this.cb.getMinZoom());
          }
        }

        // Two-finger pan (3D only)
        if (this.cb.getViewMode() === ViewMode.VIEW_3D) {
          const panDx = centerX - this._lastTwoTouchCenter.x;
          const panDy = centerY - this._lastTwoTouchCenter.y;
          this.camera.pan3d(panDx, panDy);
          this.cb.clearTargetLock();
        }

        this._lastPinchDist = pinchDist;
        this._lastTwoTouchCenter.set(centerX, centerY);
      }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      // Tap = select (only if finger didn't move)
      if (!this._touchMoved && this._touchCount === 1 && e.touches.length === 0) {
        // Orrery mode: pick planet
        if (this.cb.getOrreryMode()) {
          this.cb.onOrreryClick();
          this._touchCount = 0;
          return;
        }
        // Delegate satellite selection to App
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
      this._touchCount = e.touches.length;
      this._lastPinchDist = 0;
    }, { passive: false });
  }
}
