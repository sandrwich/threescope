import * as THREE from 'three';
import { DEG2RAD, MAP_H } from '../constants';

/**
 * Owns all camera state (3D orbital + 2D orthographic) and per-frame lerp logic.
 * Extracted from App so the main loop just calls updateFrame().
 */
export class CameraController {
  // ---- 3D orbital camera state ----
  private _camDistance = 35.0;
  private _targetCamDistance = 35.0;
  private _camAngleX = 0.785;
  private _targetCamAngleX = 0.785;
  private _camAngleY = 0.5;
  private _targetCamAngleY = 0.5;
  private _target3d = new THREE.Vector3();
  private _targetTarget3d = new THREE.Vector3();

  // ---- Reusable temp vectors for pan3d (avoid per-call allocations) ----
  private _panFwd = new THREE.Vector3();
  private _panRight = new THREE.Vector3();
  private _panUp = new THREE.Vector3();

  // ---- Touch inertia velocity state ----
  private _orbitVelX = 0;
  private _orbitVelY = 0;
  private _panVelX = 0;
  private _panVelY = 0;
  private _pan2dVelX = 0;
  private _pan2dVelY = 0;

  // ---- View offset (center earth above mobile sheet) ----
  private _viewOffsetY = 0;
  private _targetViewOffsetY = 0;

  // ---- 2D orthographic camera state ----
  private _cam2dZoom = 1.0;
  private _targetCam2dZoom = 1.0;
  private _cam2dTarget = new THREE.Vector2();
  private _targetCam2dTarget = new THREE.Vector2();

  constructor(
    private camera3d: THREE.PerspectiveCamera,
    private camera2d: THREE.OrthographicCamera,
  ) {}

  // ====================== Getters ======================

  get distance(): number { return this._camDistance; }
  get targetDistance(): number { return this._targetCamDistance; }
  get angleX(): number { return this._camAngleX; }
  get angleY(): number { return this._camAngleY; }
  get targetAngleX(): number { return this._targetCamAngleX; }
  get targetAngleY(): number { return this._targetCamAngleY; }
  get target3d(): THREE.Vector3 { return this._target3d; }
  get targetTarget3d(): THREE.Vector3 { return this._targetTarget3d; }
  get zoom2d(): number { return this._cam2dZoom; }
  get targetZoom2d(): number { return this._targetCam2dZoom; }
  get target2d(): THREE.Vector2 { return this._cam2dTarget; }
  get targetTarget2d(): THREE.Vector2 { return this._targetCam2dTarget; }

  // ====================== Setters ======================

  /** Set desired camera distance (lerps toward it). */
  setTargetDistance(d: number): void { this._targetCamDistance = d; }

  /** Snap both current and target distance (no lerp). */
  snapDistance(d: number): void {
    this._camDistance = d;
    this._targetCamDistance = d;
  }

  /** Set desired orbit angles (lerps toward them). */
  setTargetAngles(x: number, y: number): void {
    this._targetCamAngleX = x;
    this._targetCamAngleY = y;
  }

  /** Set horizontal angle to an absolute value (both current and target). Used during orbit scrub. */
  setAngleX(value: number): void {
    this._targetCamAngleX = value;
    this._camAngleX = value;
  }

  /** Set desired 3D look-at target (lerps toward it). */
  setTarget3d(pos: THREE.Vector3): void { this._targetTarget3d.copy(pos); }

  /** Convenience: set targetTarget3d from x, y, z components. */
  setTarget3dXYZ(x: number, y: number, z: number): void { this._targetTarget3d.set(x, y, z); }

  /** Snap both current and target 3D look-at (no lerp). */
  snapTarget3d(pos: THREE.Vector3): void {
    this._target3d.copy(pos);
    this._targetTarget3d.copy(pos);
  }

  /** Snap both current and target 3D look-at from x, y, z (no lerp). */
  snapTarget3dXYZ(x: number, y: number, z: number): void {
    this._target3d.set(x, y, z);
    this._targetTarget3d.set(x, y, z);
  }

  /** Set desired 2D target (lerps toward it). */
  setTarget2d(pos: THREE.Vector2): void { this._targetCam2dTarget.copy(pos); }

  /** Convenience: set targetCam2dTarget from x, y. */
  setTarget2dXY(x: number, y: number): void { this._targetCam2dTarget.set(x, y); }

  /** Set desired 2D zoom (lerps toward it). */
  setTargetZoom2d(z: number): void { this._targetCam2dZoom = z; }

  // ====================== Input methods ======================

  /** Apply orbit delta (mouse/touch drag) to target angles, with clamping. */
  orbit(dx: number, dy: number): void {
    this._targetCamAngleX -= dx * 0.005;
    this._targetCamAngleY += dy * 0.005;
    this._targetCamAngleY = Math.max(-1.5, Math.min(1.5, this._targetCamAngleY));
  }

  /** Apply orbit delta with velocity tracking (for touch inertia). */
  orbitWithVelocity(dx: number, dy: number): void {
    this.orbit(dx, dy);
    this._orbitVelX = dx;
    this._orbitVelY = dy;
  }

  /** Apply 3D pan (shift+drag or two-finger) to targetTarget3d. */
  pan3d(dx: number, dy: number): void {
    this._panFwd.subVectors(this._target3d, this.camera3d.position).normalize();
    this._panRight.crossVectors(this._panFwd, this.camera3d.up).normalize();
    this._panUp.crossVectors(this._panRight, this._panFwd).normalize();
    const panSpeed = this._targetCamDistance * 0.001;
    this._targetTarget3d.add(this._panRight.multiplyScalar(-dx * panSpeed));
    this._targetTarget3d.add(this._panUp.multiplyScalar(dy * panSpeed));
  }

  /** Apply 3D pan with velocity tracking (for touch inertia). */
  pan3dWithVelocity(dx: number, dy: number): void {
    this.pan3d(dx, dy);
    this._panVelX = dx;
    this._panVelY = dy;
  }

  /** Apply 2D pan to targetCam2dTarget. */
  pan2d(dx: number, dy: number): void {
    const scale = 1.0 / this._targetCam2dZoom;
    this._targetCam2dTarget.x -= dx * scale;
    this._targetCam2dTarget.y += dy * scale;
  }

  /** Apply 2D pan with velocity tracking (for touch inertia). */
  pan2dWithVelocity(dx: number, dy: number): void {
    this.pan2d(dx, dy);
    this._pan2dVelX = dx;
    this._pan2dVelY = dy;
  }

  /** Apply 3D scroll zoom to targetCamDistance with min-zoom clamping. */
  applyZoom3d(delta: number, minZoom: number): void {
    this._targetCamDistance -= delta * (this._targetCamDistance * 0.1);
    this._targetCamDistance = Math.max(minZoom, this._targetCamDistance);
  }

  /** Apply 2D scroll zoom to targetCam2dZoom with clamping. */
  applyZoom2d(delta: number): void {
    this._targetCam2dZoom += delta * 0.1 * this._targetCam2dZoom;
    this._targetCam2dZoom = Math.max(0.1, this._targetCam2dZoom);
  }

  /** Apply pinch-zoom scale to 3D distance with min-zoom clamping. */
  pinchZoom3d(scale: number, minZoom: number): void {
    if (Math.abs(scale - 1.0) < 0.01) return;
    this._targetCamDistance /= scale;
    this._targetCamDistance = Math.max(minZoom, this._targetCamDistance);
  }

  /** Apply pinch-zoom scale to 2D zoom with clamping. */
  pinchZoom2d(scale: number): void {
    if (Math.abs(scale - 1.0) < 0.01) return;
    this._targetCam2dZoom *= scale;
    this._targetCam2dZoom = Math.max(0.1, this._targetCam2dZoom);
  }

  /** Begin inertia decay (called on touchend — velocities already set from last touchmove). */
  startInertia(): void { /* decay runs in updateFrame() */ }

  /** Kill all inertia velocity (called on new touchstart). */
  stopInertia(): void {
    this._orbitVelX = 0;
    this._orbitVelY = 0;
    this._panVelX = 0;
    this._panVelY = 0;
    this._pan2dVelX = 0;
    this._pan2dVelY = 0;
  }

  /** Set vertical view offset in pixels (shifts projection to center in available space). */
  setViewOffsetY(pixels: number): void { this._targetViewOffsetY = pixels; }

  /** Clamp 2D target Y to map bounds. */
  clamp2dBounds(): void {
    this._targetCam2dTarget.y = Math.max(-MAP_H / 2, Math.min(MAP_H / 2, this._targetCam2dTarget.y));
  }

  // ====================== Per-frame update ======================

  /**
   * Lerp all camera state and update camera3d / camera2d transforms.
   * @param dt - frame delta time in seconds
   * @param earthRotRad - current Earth rotation in radians (gmstDeg + offset) * DEG2RAD
   * @param isOrreryOrPlanet - true when in orrery mode or viewing a planet (disables co-rotation)
   */
  updateFrame(dt: number, earthRotRad: number, isOrreryOrPlanet: boolean): void {
    const smooth = Math.min(1.0, 10.0 * dt);

    // Lerp view offset
    this._viewOffsetY += (this._targetViewOffsetY - this._viewOffsetY) * smooth;

    // Lerp 2D state
    this._cam2dZoom += (this._targetCam2dZoom - this._cam2dZoom) * smooth;
    this._cam2dTarget.lerp(this._targetCam2dTarget, smooth);

    // Lerp 3D state
    this._camAngleX += (this._targetCamAngleX - this._camAngleX) * smooth;
    this._camAngleY += (this._targetCamAngleY - this._camAngleY) * smooth;
    this._camDistance += (this._targetCamDistance - this._camDistance) * smooth;
    this._target3d.lerp(this._targetTarget3d, smooth);

    // Inertia: apply velocity and decay (frame-rate independent)
    const friction = Math.pow(0.92, dt * 60);  // normalize to 60fps reference
    const velThreshold = 0.01;

    if (Math.abs(this._orbitVelX) > velThreshold || Math.abs(this._orbitVelY) > velThreshold) {
      this._targetCamAngleX -= this._orbitVelX * 0.005;
      this._targetCamAngleY += this._orbitVelY * 0.005;
      this._targetCamAngleY = Math.max(-1.5, Math.min(1.5, this._targetCamAngleY));
      this._orbitVelX *= friction;
      this._orbitVelY *= friction;
    } else {
      this._orbitVelX = 0;
      this._orbitVelY = 0;
    }

    if (Math.abs(this._panVelX) > velThreshold || Math.abs(this._panVelY) > velThreshold) {
      this.pan3d(this._panVelX, this._panVelY);
      this._panVelX *= friction;
      this._panVelY *= friction;
    } else {
      this._panVelX = 0;
      this._panVelY = 0;
    }

    if (Math.abs(this._pan2dVelX) > velThreshold || Math.abs(this._pan2dVelY) > velThreshold) {
      this.pan2d(this._pan2dVelX, this._pan2dVelY);
      this._pan2dVelX *= friction;
      this._pan2dVelY *= friction;
    } else {
      this._pan2dVelX = 0;
      this._pan2dVelY = 0;
    }

    // Update 3D camera position (co-rotate with Earth so it appears stationary)
    const camAX = this._camAngleX + (isOrreryOrPlanet ? 0 : earthRotRad);
    this.camera3d.position.set(
      this._target3d.x + this._camDistance * Math.cos(this._camAngleY) * Math.sin(camAX),
      this._target3d.y + this._camDistance * Math.sin(this._camAngleY),
      this._target3d.z + this._camDistance * Math.cos(this._camAngleY) * Math.cos(camAX),
    );
    this.camera3d.lookAt(this._target3d);

    // Apply 3D view offset: shift projection to center earth above sheet
    if (Math.abs(this._viewOffsetY) > 0.5) {
      this.camera3d.updateProjectionMatrix();
      const ndcOffset = this._viewOffsetY * 2 / window.innerHeight;
      this.camera3d.projectionMatrix.elements[9] -= ndcOffset;
      this.camera3d.projectionMatrixInverse.copy(this.camera3d.projectionMatrix).invert();
    }

    // Clamp 2D target Y to map bounds
    this.clamp2dBounds();

    // Update 2D camera
    const aspect = window.innerWidth / window.innerHeight;
    const halfH = MAP_H / 2 / this._cam2dZoom;
    const halfW = halfH * aspect;
    // Apply 2D view offset: shift orthographic bounds to center map above sheet
    const worldOffsetY = this._viewOffsetY * (halfH * 2) / window.innerHeight;
    this.camera2d.left = this._cam2dTarget.x - halfW;
    this.camera2d.right = this._cam2dTarget.x + halfW;
    this.camera2d.top = this._cam2dTarget.y + halfH + worldOffsetY;
    this.camera2d.bottom = this._cam2dTarget.y - halfH + worldOffsetY;
    this.camera2d.updateProjectionMatrix();
  }

  /**
   * Update 2D camera projection only (used on window resize).
   * Re-computes left/right/top/bottom from current cam2dZoom and cam2dTarget.
   */
  updateCamera2dProjection(): void {
    const aspect = window.innerWidth / window.innerHeight;
    const halfH = MAP_H / 2 / this._cam2dZoom;
    const halfW = halfH * aspect;
    this.camera2d.left = this._cam2dTarget.x - halfW;
    this.camera2d.right = this._cam2dTarget.x + halfW;
    this.camera2d.top = this._cam2dTarget.y + halfH;
    this.camera2d.bottom = this._cam2dTarget.y - halfH;
    this.camera2d.updateProjectionMatrix();
  }

  /** Returns the ratio |camDistance - targetCamDistance| / targetCamDistance. Useful for hi-res texture swap. */
  get zoomSettleRatio(): number {
    return Math.abs(this._camDistance - this._targetCamDistance) / this._targetCamDistance;
  }
}
