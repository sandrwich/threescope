import * as THREE from 'three';
import { MOON_RADIUS_KM, DRAW_SCALE } from '../constants';
import { calculateMoonPosition } from '../astro/moon';

export class MoonScene {
  mesh: THREE.Mesh;
  drawPos = new THREE.Vector3();

  constructor(moonTex: THREE.Texture) {
    const radius = MOON_RADIUS_KM / DRAW_SCALE;
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = new THREE.MeshBasicMaterial({ map: moonTex });
    this.mesh = new THREE.Mesh(geometry, material);
  }

  update(currentEpoch: number) {
    const moonPosKm = calculateMoonPosition(currentEpoch);
    this.drawPos.copy(moonPosKm).divideScalar(DRAW_SCALE);
    this.mesh.position.copy(this.drawPos);

    // Tidal lock: moon always faces Earth (origin)
    const dirToEarth = this.drawPos.clone().negate().normalize();
    const yaw = Math.atan2(-dirToEarth.z, dirToEarth.x);
    const pitch = Math.asin(dirToEarth.y);

    const mZ = new THREE.Matrix4().makeRotationZ(pitch);
    const mY = new THREE.Matrix4().makeRotationY(yaw);
    this.mesh.matrix.copy(mZ.premultiply(mY));
    this.mesh.matrix.setPosition(this.drawPos);
    this.mesh.matrixAutoUpdate = false;
  }
}
