import * as THREE from 'three';
import { sunDirectionECI } from './sun-core';

/** Sun direction in **render coords** (x=eci.x, y=eci.z, z=-eci.y). NOT standard ECI. */
export function calculateSunPosition(currentEpoch: number): THREE.Vector3 {
  const { x, y, z } = sunDirectionECI(currentEpoch);
  // ECI to render coords: x=eci.x, y=eci.z, z=-eci.y
  return new THREE.Vector3(x, z, -y);
}
