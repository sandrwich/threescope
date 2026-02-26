import * as THREE from 'three';
import type { Marker, MarkerGroup } from '../types';
import { latLonToSurface } from '../astro/coordinates';

/** Generate a pin/teardrop marker texture on a canvas. */
export function createPinTexture(): THREE.CanvasTexture {
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;

  const cx = S / 2;
  const r = S * 0.22;
  const cy = r + S * 0.05;
  const tipY = S * 0.95;
  const openAngle = 0.35;

  // Pin body (teardrop)
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI / 2 - openAngle, Math.PI / 2 + openAngle, true);
  ctx.lineTo(cx, tipY);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Inner dot
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/** Generate a filled square marker texture on a canvas. */
export function createSquareTexture(): THREE.CanvasTexture {
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;

  const r = S * 0.38;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(S / 2 - r, S / 2 - r, r * 2, r * 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/** Generate a diamond/rhombus marker texture on a canvas (replaces smallmark.png). */
export function createDiamondTexture(): THREE.CanvasTexture {
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;

  const cx = S / 2, cy = S / 2, r = S * 0.42;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

interface GroupEntry {
  group: MarkerGroup;
  sprites: THREE.Sprite[];
  labels: HTMLDivElement[];
  visible: boolean;
}

export class MarkerManager {
  private groups: GroupEntry[] = [];
  private scene: THREE.Scene;
  private overlay: HTMLElement;
  private pinTex: THREE.Texture;

  constructor(scene: THREE.Scene, markerGroups: MarkerGroup[], overlay: HTMLElement) {
    this.scene = scene;
    this.overlay = overlay;
    this.pinTex = createPinTexture();

    for (const group of markerGroups) {
      const entry: GroupEntry = { group, sprites: [], labels: [], visible: group.defaultVisible };
      const color = new THREE.Color(group.color);

      for (const m of group.markers) {
        entry.sprites.push(this.createSprite(color));
        entry.labels.push(this.createLabel(m.name, group.color));
      }

      this.groups.push(entry);
    }
  }

  private createSprite(color: THREE.Color): THREE.Sprite {
    // Clamp brightness below bloom threshold (0.95) so markers don't glow
    const maxC = Math.max(color.r, color.g, color.b);
    if (maxC > 0.9) color.multiplyScalar(0.9 / maxC);
    const mat = new THREE.SpriteMaterial({
      map: this.pinTex, color, depthTest: false, transparent: true, alphaTest: 0.1, sizeAttenuation: false, toneMapped: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.015, 0.018, 1);
    sprite.center.set(0.5, 0); // anchor at pin tip (bottom center)
    sprite.renderOrder = 999;
    this.scene.add(sprite);
    return sprite;
  }

  private createLabel(name: string, colorStr: string): HTMLDivElement {
    const label = document.createElement('div');
    label.className = 'scene-label';
    label.style.cssText = `position:absolute;left:0;top:0;font-size:11px;color:${colorStr};pointer-events:none;white-space:nowrap;display:none;will-change:transform;text-shadow:-1px -1px 0 var(--bg),1px -1px 0 var(--bg),-1px 1px 0 var(--bg),1px 1px 0 var(--bg);`;
    label.textContent = name;
    this.overlay.appendChild(label);
    return label;
  }

  updateGroupMarkers(groupId: string, markers: Marker[]) {
    const entry = this.groups.find(g => g.group.id === groupId);
    if (!entry) return;
    // Remove old sprites and labels
    for (const s of entry.sprites) this.scene.remove(s);
    for (const l of entry.labels) l.remove();
    entry.sprites = [];
    entry.labels = [];
    entry.group.markers = markers;
    // Create new ones
    const color = new THREE.Color(entry.group.color);
    for (const m of markers) {
      entry.sprites.push(this.createSprite(color));
      entry.labels.push(this.createLabel(m.name, entry.group.color));
    }
  }

  setGroupVisible(groupId: string, visible: boolean) {
    const entry = this.groups.find(g => g.group.id === groupId);
    if (!entry) return;
    entry.visible = visible;
    if (!visible) this.hideGroup(entry);
  }

  // Reusable vectors to avoid per-frame allocations
  private _v = new THREE.Vector3();
  private _camFwd = new THREE.Vector3();

  update(gmstDeg: number, earthOffset: number, camera: THREE.Camera, camDistance: number) {
    this._camFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const vw = window.innerWidth, vh = window.innerHeight;

    // Distance-based scaling: full size when close, shrink and fade when far
    // camDistance is in draw-space units; Earth radius ≈ 2.12 in draw-space
    const FADE_START = 12;   // start shrinking
    const FADE_END = 40;    // fully hidden
    if (camDistance > FADE_END) {
      for (const entry of this.groups) this.hideGroup(entry);
      return;
    }
    const distFactor = camDistance < FADE_START ? 1.0
      : 1.0 - (camDistance - FADE_START) / (FADE_END - FADE_START);
    const scale = 0.015 * distFactor;
    const scaleY = 0.018 * distFactor;

    for (const entry of this.groups) {
      if (!entry.visible) {
        this.hideGroup(entry);
        continue;
      }
      for (let i = 0; i < entry.group.markers.length; i++) {
        const m = entry.group.markers[i];
        const pos = latLonToSurface(m.lat, m.lon, gmstDeg, earthOffset);
        const sprite = entry.sprites[i];
        sprite.position.copy(pos);
        sprite.scale.set(scale, scaleY, 1);
        (sprite.material as THREE.SpriteMaterial).opacity = distFactor;

        // Visibility: facing camera and in front of camera
        const nx = pos.x, ny = pos.y, nz = pos.z;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        const dx = camera.position.x - nx, dy = camera.position.y - ny, dz = camera.position.z - nz;
        const facingCam = (nx * dx + ny * dy + nz * dz) / len > 0;
        const inFront = (-dx * this._camFwd.x - dy * this._camFwd.y - dz * this._camFwd.z) > 0;
        const visible = facingCam && inFront;
        sprite.visible = visible;

        if (visible) {
          this._v.copy(pos).project(camera);
          const x = (this._v.x * 0.5 + 0.5) * vw + 12;
          const y = (-this._v.y * 0.5 + 0.5) * vh - 24;
          const label = entry.labels[i];
          label.style.display = 'block';
          label.style.opacity = String(distFactor);
          label.dataset.sx = String(x);
          label.dataset.sy = String(y);
          label.style.transform = `translate(${x}px,${y}px)`;
        } else {
          entry.labels[i].style.display = 'none';
        }
      }
    }
  }

  hide() {
    for (const entry of this.groups) this.hideGroup(entry);
  }

  private hideGroup(entry: GroupEntry) {
    for (const s of entry.sprites) s.visible = false;
    for (const l of entry.labels) l.style.display = 'none';
  }
}
