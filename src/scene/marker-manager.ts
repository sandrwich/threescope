import * as THREE from 'three';
import type { MarkerGroup } from '../types';
import { latLonToSurface } from '../astro/coordinates';

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
  private markerTex: THREE.Texture;

  constructor(scene: THREE.Scene, markerGroups: MarkerGroup[], markerTex: THREE.Texture, overlay: HTMLElement) {
    this.scene = scene;
    this.overlay = overlay;
    this.markerTex = markerTex;

    for (const group of markerGroups) {
      const entry: GroupEntry = { group, sprites: [], labels: [], visible: group.defaultVisible };
      const color = new THREE.Color(group.color);

      for (const m of group.markers) {
        const mat = new THREE.SpriteMaterial({ map: markerTex, color, depthTest: false, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(0.04, 0.04, 1);
        scene.add(sprite);
        entry.sprites.push(sprite);

        const label = document.createElement('div');
        label.style.cssText = `position:absolute;font-size:11px;color:${group.color};pointer-events:none;white-space:nowrap;display:none;`;
        label.textContent = m.name;
        overlay.appendChild(label);
        entry.labels.push(label);
      }

      this.groups.push(entry);
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
          entry.labels[i].style.left = `${x + 14}px`;
          entry.labels[i].style.top = `${y - 8}px`;
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
