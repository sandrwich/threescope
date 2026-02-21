import * as THREE from 'three';
import { DEG2RAD, DRAW_SCALE, EARTH_RADIUS_KM, MAP_W, MAP_H } from '../constants';

export function eciToDrawPos(posKm: THREE.Vector3): THREE.Vector3 {
  return posKm.clone().divideScalar(DRAW_SCALE);
}

export function getMapCoordinates(
  pos: THREE.Vector3,
  gmstDeg: number,
  earthOffset: number
): { x: number; y: number } {
  const r = pos.length();
  const phi = Math.acos(pos.y / r);
  const v = phi / Math.PI;

  const thetaSat = Math.atan2(-pos.z, pos.x);
  const rRad = (gmstDeg + earthOffset) * DEG2RAD;
  let thetaTex = thetaSat - rRad;

  while (thetaTex > Math.PI) thetaTex -= 2.0 * Math.PI;
  while (thetaTex < -Math.PI) thetaTex += 2.0 * Math.PI;

  const u = thetaTex / (2.0 * Math.PI) + 0.5;
  return {
    x: (u - 0.5) * MAP_W,
    y: (v - 0.5) * MAP_H,
  };
}

export function latLonToSurface(
  lat: number,
  lon: number,
  gmstDeg: number,
  earthOffset: number
): THREE.Vector3 {
  const latRad = lat * DEG2RAD;
  const lonRad = (lon + gmstDeg + earthOffset) * DEG2RAD;
  const r = EARTH_RADIUS_KM / DRAW_SCALE;
  return new THREE.Vector3(
    Math.cos(latRad) * Math.cos(lonRad) * r,
    Math.sin(latRad) * r,
    -Math.cos(latRad) * Math.sin(lonRad) * r
  );
}
