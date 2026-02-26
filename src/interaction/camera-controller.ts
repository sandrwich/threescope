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

  /** Apply 3D pan (shift+drag or two-finger) to targetTarget3d. */
  pan3d(dx: number, dy: number): void {
    const forward = new THREE.Vector3().subVectors(this._target3d, this.camera3d.position).normalize();
    const right = new THREE.Vector3().crossVectors(forward, this.camera3d.up).normalize();
    const upVec = new THREE.Vector3().crossVectors(right, forward).normalize();
    const panSpeed = this._targetCamDistance * 0.001;
    this._targetTarget3d.add(right.multiplyScalar(-dx * panSpeed));
    this._targetTarget3d.add(upVec.multiplyScalar(dy * panSpeed));
  }

  /** Apply 2D pan to targetCam2dTarget. */
  pan2d(dx: number, dy: number): void {
    const scale = 1.0 / this._targetCam2dZoom;
    this._targetCam2dTarget.x -= dx * scale;
    this._targetCam2dTarget.y += dy * scale;
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
    this._targetCamDistance /= scale;
    this._targetCamDistance = Math.max(minZoom, this._targetCamDistance);
  }

  /** Apply pinch-zoom scale to 2D zoom with clamping. */
  pinchZoom2d(scale: number): void {
    this._targetCam2dZoom *= scale;
    this._targetCam2dZoom = Math.max(0.1, this._targetCam2dZoom);
  }

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

    // Lerp 2D state
    this._cam2dZoom += (this._targetCam2dZoom - this._cam2dZoom) * smooth;
    this._cam2dTarget.lerp(this._targetCam2dTarget, smooth);

    // Lerp 3D state
    this._camAngleX += (this._targetCamAngleX - this._camAngleX) * smooth;
    this._camAngleY += (this._targetCamAngleY - this._camAngleY) * smooth;
    this._camDistance += (this._targetCamDistance - this._camDistance) * smooth;
    this._target3d.lerp(this._targetTarget3d, smooth);

    // Update 3D camera position (co-rotate with Earth so it appears stationary)
    const camAX = this._camAngleX + (isOrreryOrPlanet ? 0 : earthRotRad);
    this.camera3d.position.set(
      this._target3d.x + this._camDistance * Math.cos(this._camAngleY) * Math.sin(camAX),
      this._target3d.y + this._camDistance * Math.sin(this._camAngleY),
      this._target3d.z + this._camDistance * Math.cos(this._camAngleY) * Math.cos(camAX),
    );
    this.camera3d.lookAt(this._target3d);

    // Clamp 2D target Y to map bounds
    this.clamp2dBounds();

    // Update 2D camera
    const aspect = window.innerWidth / window.innerHeight;
    const halfH = MAP_H / 2 / this._cam2dZoom;
    const halfW = halfH * aspect;
    this.camera2d.left = this._cam2dTarget.x - halfW;
    this.camera2d.right = this._cam2dTarget.x + halfW;
    this.camera2d.top = this._cam2dTarget.y + halfH;
    this.camera2d.bottom = this._cam2dTarget.y - halfH;
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
