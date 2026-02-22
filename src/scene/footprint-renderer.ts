import * as THREE from 'three';
import { DRAW_SCALE, FP_RINGS, FP_PTS } from '../constants';
import { computeFootprintGrid } from '../astro/footprint';

export interface FootprintEntry {
  position: THREE.Vector3;
  color: [number, number, number]; // RGB 0-1
}

export class FootprintRenderer {
  private scene: THREE.Scene;
  private fillMeshes: THREE.Mesh[] = [];
  private borderLines: THREE.LineLoop[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  update(entries: FootprintEntry[], baseOpacity = 0.13, borderOpacity = 0.53) {
    this.clear();
    if (entries.length === 0) return;

    for (const entry of entries) {
      const grid = computeFootprintGrid(entry.position);
      if (!grid) continue;

      const [cr, cg, cb] = entry.color;

      // Build triangle mesh
      const vertices: number[] = [];
      for (let i = 0; i < FP_RINGS; i++) {
        for (let k = 0; k < FP_PTS; k++) {
          const next = (k + 1) % FP_PTS;
          const p1 = grid[i][k], p2 = grid[i][next];
          const p3 = grid[i + 1][k], p4 = grid[i + 1][next];
          const s = 1.01 / DRAW_SCALE;

          vertices.push(p1.x * s, p1.y * s, p1.z * s);
          vertices.push(p3.x * s, p3.y * s, p3.z * s);
          vertices.push(p2.x * s, p2.y * s, p2.z * s);

          vertices.push(p2.x * s, p2.y * s, p2.z * s);
          vertices.push(p3.x * s, p3.y * s, p3.z * s);
          vertices.push(p4.x * s, p4.y * s, p4.z * s);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(cr, cg, cb),
        transparent: true,
        opacity: baseOpacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      this.scene.add(mesh);
      this.fillMeshes.push(mesh);

      // Border ring (outermost ring)
      const outerRing = grid[FP_RINGS];
      const borderPts = outerRing.map(p => new THREE.Vector3(p.x * 1.01 / DRAW_SCALE, p.y * 1.01 / DRAW_SCALE, p.z * 1.01 / DRAW_SCALE));
      const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPts);
      const borderMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(cr, cg, cb),
        transparent: true,
        opacity: borderOpacity,
      });
      const line = new THREE.LineLoop(borderGeo, borderMat);
      this.scene.add(line);
      this.borderLines.push(line);
    }
  }

  clear() {
    for (const m of this.fillMeshes) { this.scene.remove(m); m.geometry.dispose(); }
    for (const l of this.borderLines) { this.scene.remove(l); l.geometry.dispose(); }
    this.fillMeshes.length = 0;
    this.borderLines.length = 0;
  }
}
