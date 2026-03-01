import * as THREE from 'three';
import { FP_FILL_FLOATS, FP_BORDER_FLOATS, computeFootprintFill, computeFootprintBorder } from '../astro/footprint';

export interface FootprintEntry {
  position: THREE.Vector3;
  color: [number, number, number]; // RGB 0-1
}

/** Pre-allocated pool entry: one fill mesh + one border line, permanently in the scene. */
interface PoolEntry {
  fillMesh: THREE.Mesh;
  fillAttr: THREE.BufferAttribute;
  fillMat: THREE.MeshBasicMaterial;
  borderLine: THREE.LineLoop;
  borderAttr: THREE.BufferAttribute;
  borderMat: THREE.LineBasicMaterial;
}

const POOL_SIZE = 21; // 20 selected + 1 hovered

// Shared scratch buffers for computation (avoid per-call allocations)
const _fillBuf = new Float32Array(FP_FILL_FLOATS);
const _borderBuf = new Float32Array(FP_BORDER_FLOATS);

export class FootprintRenderer {
  private pool: PoolEntry[] = [];

  constructor(private scene: THREE.Scene) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const fillPositions = new Float32Array(FP_FILL_FLOATS);
      const fillAttr = new THREE.BufferAttribute(fillPositions, 3);
      fillAttr.setUsage(THREE.DynamicDrawUsage);
      const fillGeo = new THREE.BufferGeometry();
      fillGeo.setAttribute('position', fillAttr);
      const fillMat = new THREE.MeshBasicMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const fillMesh = new THREE.Mesh(fillGeo, fillMat);
      fillMesh.visible = false;
      fillMesh.frustumCulled = false;
      this.scene.add(fillMesh);

      const borderPositions = new Float32Array(FP_BORDER_FLOATS);
      const borderAttr = new THREE.BufferAttribute(borderPositions, 3);
      borderAttr.setUsage(THREE.DynamicDrawUsage);
      const borderGeo = new THREE.BufferGeometry();
      borderGeo.setAttribute('position', borderAttr);
      const borderMat = new THREE.LineBasicMaterial({ transparent: true });
      const borderLine = new THREE.LineLoop(borderGeo, borderMat);
      borderLine.visible = false;
      borderLine.frustumCulled = false;
      this.scene.add(borderLine);

      this.pool.push({ fillMesh, fillAttr, fillMat, borderLine, borderAttr, borderMat });
    }
  }

  update(entries: FootprintEntry[], baseOpacity = 0.13, borderOpacity = 0.53) {
    let used = 0;

    for (const entry of entries) {
      if (used >= POOL_SIZE) break;

      if (!computeFootprintFill(entry.position, _fillBuf)) continue;
      computeFootprintBorder(entry.position, _borderBuf);

      const slot = this.pool[used];
      const [cr, cg, cb] = entry.color;

      // Update fill
      (slot.fillAttr.array as Float32Array).set(_fillBuf);
      slot.fillAttr.needsUpdate = true;
      slot.fillMat.color.setRGB(cr, cg, cb);
      slot.fillMat.opacity = baseOpacity;
      slot.fillMesh.visible = true;

      // Update border
      (slot.borderAttr.array as Float32Array).set(_borderBuf);
      slot.borderAttr.needsUpdate = true;
      slot.borderMat.color.setRGB(cr, cg, cb);
      slot.borderMat.opacity = borderOpacity;
      slot.borderLine.visible = true;

      used++;
    }

    // Hide unused pool entries
    for (let i = used; i < POOL_SIZE; i++) {
      this.pool[i].fillMesh.visible = false;
      this.pool[i].borderLine.visible = false;
    }
  }

  clear() {
    for (const slot of this.pool) {
      slot.fillMesh.visible = false;
      slot.borderLine.visible = false;
    }
  }
}
