import * as THREE from 'three';
import type { Satellite } from '../types';
import { TWO_PI } from '../constants';
import { normalizeEpoch, epochToUnix, epochToGmst } from './epoch';
import { calculatePosition } from './propagator';
import { getMapCoordinates } from './coordinates';

export interface ApsisInfo {
  periPos: THREE.Vector3;   // render coords km
  apoPos: THREE.Vector3;    // render coords km
  periEpoch: number;
  apoEpoch: number;
}

export function computeApsis(sat: Satellite, currentEpoch: number): ApsisInfo {
  currentEpoch = normalizeEpoch(currentEpoch);

  const curUnix = epochToUnix(currentEpoch);
  const satUnix = epochToUnix(sat.epochDays);
  const deltaS = curUnix - satUnix;

  let M = (sat.meanAnomaly + sat.meanMotion * deltaS) % TWO_PI;
  if (M < 0) M += TWO_PI;

  let diffPeri = 0.0 - M;
  if (diffPeri < 0) diffPeri += TWO_PI;
  let diffApo = Math.PI - M;
  if (diffApo < 0) diffApo += TWO_PI;

  const tPeri = currentEpoch + (diffPeri / sat.meanMotion) / 86400.0;
  const tApo = currentEpoch + (diffApo / sat.meanMotion) / 86400.0;

  return {
    periPos: calculatePosition(sat, tPeri),
    apoPos: calculatePosition(sat, tApo),
    periEpoch: tPeri,
    apoEpoch: tApo,
  };
}

export function computeApsis2D(
  sat: Satellite,
  currentEpoch: number,
  isApoapsis: boolean,
  earthOffset: number
): { x: number; y: number } {
  currentEpoch = normalizeEpoch(currentEpoch);

  const curUnix = epochToUnix(currentEpoch);
  const satUnix = epochToUnix(sat.epochDays);
  const deltaS = curUnix - satUnix;

  let M = (sat.meanAnomaly + sat.meanMotion * deltaS) % TWO_PI;
  if (M < 0) M += TWO_PI;

  const targetM = isApoapsis ? Math.PI : 0.0;
  let diff = targetM - M;
  if (diff < 0) diff += TWO_PI;

  const tTarget = currentEpoch + (diff / sat.meanMotion) / 86400.0;
  const pos3d = calculatePosition(sat, tTarget);
  const gmstTarget = epochToGmst(tTarget);

  return getMapCoordinates(pos3d, gmstTarget, earthOffset);
}
