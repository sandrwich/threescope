import * as THREE from 'three';
import type { CameraController } from '../interaction/camera-controller';
import type { Satellite } from '../types';
import { DEG2RAD, RAD2DEG } from '../constants';
import { uiStore } from '../stores/ui.svelte';
import { beamStore } from '../stores/beam.svelte';
import { rotatorStore } from '../stores/rotator.svelte';
import { feedbackStore } from '../stores/feedback.svelte';
import { FeedbackEvent } from '../feedback/types';

/**
 * Sky-view HUD: projects az/el markers to screen and handles
 * click/drag interaction for aiming the beam in sky (POV) mode.
 */
export class SkyHud {
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly camera3d: THREE.PerspectiveCamera,
    private readonly cam: CameraController,
  ) {}

  // ── Projection helpers ──────────────────────────────────────

  /** Project az/el (degrees) to screen pixels, or null if behind camera. */
  projectAzEl(azDeg: number, elDeg: number): { x: number; y: number } | null {
    const up = this.cam.skyUp;
    const north = this.cam.skyNorth;
    const east = this.cam.skyEast;
    const azRad = azDeg * DEG2RAD;
    const elRad = elDeg * DEG2RAD;
    const cosEl = Math.cos(elRad);
    this.tmp.set(0, 0, 0)
      .addScaledVector(north, cosEl * Math.cos(azRad))
      .addScaledVector(east, cosEl * Math.sin(azRad))
      .addScaledVector(up, Math.sin(elRad));
    this.tmp.multiplyScalar(100).add(this.camera3d.position);
    this.tmp.project(this.camera3d);
    if (this.tmp.z > 1) return null;
    return {
      x: (this.tmp.x * 0.5 + 0.5) * window.innerWidth,
      y: (-this.tmp.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  /** Unproject NDC coordinates to az/el (degrees), or null if below horizon. */
  unprojectToAzEl(ndcX: number, ndcY: number): { az: number; el: number } | null {
    this.tmp.set(ndcX, ndcY, 0.5).unproject(this.camera3d);
    this.tmp.sub(this.camera3d.position).normalize();
    const e = this.tmp.dot(this.cam.skyEast);
    const n = this.tmp.dot(this.cam.skyNorth);
    const u = this.tmp.dot(this.cam.skyUp);
    const el = Math.atan2(u, Math.sqrt(e * e + n * n)) * RAD2DEG;
    if (el < 0) return null;
    let az = Math.atan2(e, n) * RAD2DEG;
    if (az < 0) az += 360;
    return { az, el };
  }

  // ── Per-frame HUD update ────────────────────────────────────

  /** Update all sky HUD elements. Call once per frame when in sky view. */
  updateFrame(): void {
    uiStore.skyHeading = this.cam.angleX;
    this.updateReticle();
    this.updateRotator();
  }

  /** Clear HUD state when leaving sky view. */
  clearHud(): void {
    if (uiStore.skyReticle.visible) uiStore.skyReticle = { x: 0, y: 0, radius: 0, visible: false };
    if (uiStore.skyRotator.visible) uiStore.skyRotator = { x: 0, y: 0, visible: false };
  }

  private updateReticle(): void {
    const p = this.projectAzEl(beamStore.aimAz, beamStore.aimEl);
    if (!p) {
      uiStore.skyReticle = { x: 0, y: 0, radius: 0, visible: false };
      return;
    }
    const radius = (beamStore.beamWidth / this.cam.skyFov) * window.innerHeight / 2;
    uiStore.skyReticle = { x: p.x, y: p.y, radius, visible: true };
  }

  private updateRotator(): void {
    if (rotatorStore.status !== 'connected' || rotatorStore.actualAz === null || rotatorStore.actualEl === null) {
      if (uiStore.skyRotator.visible) uiStore.skyRotator = { x: 0, y: 0, visible: false };
      return;
    }
    const p = this.projectAzEl(rotatorStore.actualAz, rotatorStore.actualEl);
    if (!p) {
      uiStore.skyRotator = { x: 0, y: 0, visible: false };
      return;
    }
    uiStore.skyRotator = { x: p.x, y: p.y, visible: true };
  }

  // ── Interaction handlers ────────────────────────────────────

  /** Click in sky view: aim beam at clicked az/el. */
  handleClick(ndcX: number, ndcY: number): void {
    if (!this.cam.isSkyView) return;
    if (beamStore.locked) return;
    const azEl = this.unprojectToAzEl(ndcX, ndcY);
    if (azEl) beamStore.setAim(azEl.az, azEl.el);
  }

  /** Drag in sky view: aim beam + fire feedback. */
  handleDrag(ndcX: number, ndcY: number): void {
    this.handleClick(ndcX, ndcY);
    feedbackStore.fire(FeedbackEvent.BeamAimDrag);
  }

  /** Double-click/tap in sky view: toggle beam lock on hovered satellite. */
  handleDoubleClick(hoveredSat: Satellite | null): void {
    if (!hoveredSat) return;
    if (beamStore.locked && beamStore.lockedNoradId === hoveredSat.noradId) {
      beamStore.unlock();
      feedbackStore.fire(FeedbackEvent.BeamUnlock);
    } else {
      beamStore.lockToSatellite(hoveredSat.noradId, hoveredSat.name);
      feedbackStore.fire(FeedbackEvent.BeamLock);
    }
  }
}
