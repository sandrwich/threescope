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
    const mat = new THREE.SpriteMaterial({
      map: this.pinTex, color, depthTest: false, transparent: true, alphaTest: 0.1,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.03, 0.035, 1);
    sprite.center.set(0.5, 0); // anchor at pin tip (bottom center)
    this.scene.add(sprite);
    return sprite;
  }

  private createLabel(name: string, colorStr: string): HTMLDivElement {
    const label = document.createElement('div');
    label.style.cssText = `position:absolute;font-size:11px;color:${colorStr};pointer-events:none;white-space:nowrap;display:none;`;
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

  update(gmstDeg: number, earthOffset: number, camera: THREE.Camera, camDistance: number) {
    for (const entry of this.groups) {
      if (!entry.visible) {
        this.hideGroup(entry);
        continue;
      }
      for (let i = 0; i < entry.group.markers.length; i++) {
        const m = entry.group.markers[i];
        const pos = latLonToSurface(m.lat, m.lon, gmstDeg, earthOffset);
        entry.sprites[i].position.copy(pos);

        const normal = pos.clone().normalize();
        const viewDir = camera.position.clone().sub(pos).normalize();
        const toTarget = pos.clone().sub(camera.position);
        const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

        const visible = normal.dot(viewDir) > 0 && toTarget.dot(camForward) > 0;
        entry.sprites[i].visible = visible;

        if (visible && camDistance < 50) {
          const screenPos = pos.clone().project(camera);
          const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
          const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
          entry.labels[i].style.display = 'block';
          entry.labels[i].style.left = `${x + 12}px`;
          entry.labels[i].style.top = `${y - 24}px`;
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
