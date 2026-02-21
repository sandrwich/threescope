import { TargetLock } from './types';
import { EARTH_RADIUS_KM, MOON_RADIUS_KM, DRAW_SCALE } from './constants';

export interface CelestialBody {
  name: string;
  radiusKm: number;
  minZoomDistance: number;
  bloom: boolean;
}

export const BODIES: Record<number, CelestialBody> = {
  [TargetLock.EARTH]: {
    name: 'Earth',
    radiusKm: EARTH_RADIUS_KM,
    minZoomDistance: EARTH_RADIUS_KM / DRAW_SCALE + 1.0,
    bloom: true,
  },
  [TargetLock.MOON]: {
    name: 'Moon',
    radiusKm: MOON_RADIUS_KM,
    minZoomDistance: MOON_RADIUS_KM / DRAW_SCALE * 1.2,
    bloom: false,
  },
  [TargetLock.SUN]: {
    name: 'Sun',
    radiusKm: 0,
    minZoomDistance: 3.0,
    bloom: true,
  },
  [TargetLock.NONE]: {
    name: 'Free',
    radiusKm: 0,
    minZoomDistance: 0.5,
    bloom: true,
  },
};

export function getMinZoom(lock: TargetLock): number {
  return BODIES[lock]?.minZoomDistance ?? 0.5;
}
