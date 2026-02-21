import * as THREE from 'three';
import type { Marker } from '../types';
import { latLonToSurface } from '../astro/coordinates';

export class MarkerManager {
  private markers: Marker[];
  private sprites: THREE.Sprite[] = [];
  private scene: THREE.Scene;
  private labels: HTMLDivElement[] = [];
  private overlay: HTMLElement;

  constructor(scene: THREE.Scene, markers: Marker[], markerTex: THREE.Texture, overlay: HTMLElement) {
    this.scene = scene;
    this.markers = markers;
    this.overlay = overlay;

    for (const m of markers) {
      const mat = new THREE.SpriteMaterial({ map: markerTex, color: 0xffffff, depthTest: false, transparent: true });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(0.04, 0.04, 1);
      scene.add(sprite);
      this.sprites.push(sprite);

      const label = document.createElement('div');
      label.style.cssText = 'position:absolute;font-size:11px;color:#fff;pointer-events:none;white-space:nowrap;display:none;';
      label.textContent = m.name;
      overlay.appendChild(label);
      this.labels.push(label);
    }
  }

  update(gmstDeg: number, earthOffset: number, camera: THREE.Camera, camDistance: number) {
    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i];
      const pos = latLonToSurface(m.lat, m.lon, gmstDeg, earthOffset);
      this.sprites[i].position.copy(pos);

      // Face-culling: hide markers on back side
      const normal = pos.clone().normalize();
      const viewDir = camera.position.clone().sub(pos).normalize();
      const toTarget = pos.clone().sub(camera.position);
      const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

      const visible = normal.dot(viewDir) > 0 && toTarget.dot(camForward) > 0;
      this.sprites[i].visible = visible;

      // Update label
      if (visible && camDistance < 50) {
        const screenPos = pos.clone().project(camera);
        const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
        this.labels[i].style.display = 'block';
        this.labels[i].style.left = `${x + 14}px`;
        this.labels[i].style.top = `${y - 8}px`;
      } else {
        this.labels[i].style.display = 'none';
      }
    }
  }

  hide() {
    for (const s of this.sprites) s.visible = false;
    for (const l of this.labels) l.style.display = 'none';
  }
}
