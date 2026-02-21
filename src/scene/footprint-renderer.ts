import * as THREE from 'three';
import { DRAW_SCALE, FP_RINGS, FP_PTS } from '../constants';
import { parseHexColor } from '../config';
import { computeFootprintGrid } from '../astro/footprint';

export class FootprintRenderer {
  private scene: THREE.Scene;
  private fillMesh: THREE.Mesh | null = null;
  private borderLine: THREE.LineLoop | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  update(satPos: THREE.Vector3 | null, colorConfig: { footprintBg: string; footprintBorder: string }) {
    this.clear();
    if (!satPos) return;

    const grid = computeFootprintGrid(satPos);
    if (!grid) return;

    const cFill = parseHexColor(colorConfig.footprintBg);
    const cBorder = parseHexColor(colorConfig.footprintBorder);

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
      color: new THREE.Color(cFill.r, cFill.g, cFill.b),
      transparent: true,
      opacity: cFill.a,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.fillMesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.fillMesh);

    // Border ring (outermost ring)
    const outerRing = grid[FP_RINGS];
    const borderPts = outerRing.map(p => new THREE.Vector3(p.x * 1.01 / DRAW_SCALE, p.y * 1.01 / DRAW_SCALE, p.z * 1.01 / DRAW_SCALE));
    const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPts);
    const borderMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(cBorder.r, cBorder.g, cBorder.b),
      transparent: true,
      opacity: cBorder.a,
    });
    this.borderLine = new THREE.LineLoop(borderGeo, borderMat);
    this.scene.add(this.borderLine);
  }

  clear() {
    if (this.fillMesh) { this.scene.remove(this.fillMesh); this.fillMesh.geometry.dispose(); this.fillMesh = null; }
    if (this.borderLine) { this.scene.remove(this.borderLine); this.borderLine.geometry.dispose(); this.borderLine = null; }
  }
}
