import { TargetLock } from './types';
import { EARTH_RADIUS_KM, MOON_RADIUS_KM, DRAW_SCALE } from './constants';

export interface CelestialBody {
  name: string;
  radiusKm: number;
  minZoomDistance: number;
  bloom: boolean;
  thumbnailUrl?: string;
}

export const BODIES: Record<number, CelestialBody> = {
  [TargetLock.EARTH]: {
    name: 'Earth',
    radiusKm: EARTH_RADIUS_KM,
    minZoomDistance: EARTH_RADIUS_KM / DRAW_SCALE + 1.0,
    bloom: true,
    thumbnailUrl: '/textures/planets/thumb/earth.webp',
  },
  [TargetLock.MOON]: {
    name: 'Moon',
    radiusKm: MOON_RADIUS_KM,
    minZoomDistance: MOON_RADIUS_KM / DRAW_SCALE * 1.2,
    bloom: false,
    thumbnailUrl: '/textures/planets/thumb/moon.webp',
  },
  [TargetLock.SUN]: {
    name: 'Sun',
    radiusKm: 0,
    minZoomDistance: 3.0,
    bloom: true,
    thumbnailUrl: '/textures/planets/thumb/sun.webp',
  },
  [TargetLock.NONE]: {
    name: 'Free',
    radiusKm: 0,
    minZoomDistance: 0.5,
    bloom: true,
  },
};

// Planets keyed by string ID for the picker (separate from TargetLock)
export interface PlanetDef {
  id: string;
  name: string;
  radiusKm: number;
  minZoomDistance: number;
  bloom: boolean;
  textureUrl: string;
  thumbnailUrl: string;
  rotationPeriodH: number;
  order: number; // distance from sun (for picker layout)
}

export const PLANETS: PlanetDef[] = [
  {
    id: 'sun', name: 'Sun', radiusKm: 695700,
    minZoomDistance: 4.0,
    bloom: true, textureUrl: '/textures/planets/sun.webp',
    thumbnailUrl: '/textures/planets/thumb/sun.webp',
    rotationPeriodH: 601.2, order: 0,
  },
  {
    id: 'mercury', name: 'Mercury', radiusKm: 2439.7,
    minZoomDistance: 2439.7 / DRAW_SCALE * 1.2,
    bloom: false, textureUrl: '/textures/planets/mercury.webp',
    thumbnailUrl: '/textures/planets/thumb/mercury.webp',
    rotationPeriodH: 1407.6, order: 1,
  },
  {
    id: 'venus', name: 'Venus', radiusKm: 6051.8,
    minZoomDistance: 6051.8 / DRAW_SCALE * 1.2,
    bloom: false, textureUrl: '/textures/planets/venus.webp',
    thumbnailUrl: '/textures/planets/thumb/venus.webp',
    rotationPeriodH: 5832.5, order: 2,
  },
  {
    id: 'mars', name: 'Mars', radiusKm: 3389.5,
    minZoomDistance: 3389.5 / DRAW_SCALE * 1.2,
    bloom: false, textureUrl: '/textures/planets/mars.webp',
    thumbnailUrl: '/textures/planets/thumb/mars.webp',
    rotationPeriodH: 24.62, order: 4,
  },
  {
    id: 'jupiter', name: 'Jupiter', radiusKm: 69911,
    minZoomDistance: 69911 / DRAW_SCALE * 1.2,
    bloom: false, textureUrl: '/textures/planets/jupiter.webp',
    thumbnailUrl: '/textures/planets/thumb/jupiter.webp',
    rotationPeriodH: 9.93, order: 5,
  },
  {
    id: 'saturn', name: 'Saturn', radiusKm: 58232,
    minZoomDistance: 58232 / DRAW_SCALE * 1.2,
    bloom: false, textureUrl: '/textures/planets/saturn.webp',
    thumbnailUrl: '/textures/planets/thumb/saturn.webp',
    rotationPeriodH: 10.7, order: 6,
  },
  {
    id: 'uranus', name: 'Uranus', radiusKm: 25362,
    minZoomDistance: 25362 / DRAW_SCALE * 1.2,
    bloom: false, textureUrl: '/textures/planets/uranus.webp',
    thumbnailUrl: '/textures/planets/thumb/uranus.webp',
    rotationPeriodH: 17.24, order: 7,
  },
  {
    id: 'neptune', name: 'Neptune', radiusKm: 24622,
    minZoomDistance: 24622 / DRAW_SCALE * 1.2,
    bloom: false, textureUrl: '/textures/planets/neptune.webp',
    thumbnailUrl: '/textures/planets/thumb/neptune.webp',
    rotationPeriodH: 16.11, order: 8,
  },
];

export function getMinZoom(lock: TargetLock): number {
  // Promoted planets use uniform orrery ball size (radius 3.0)
  if (lock === TargetLock.PLANET) return 4.0;
  return BODIES[lock]?.minZoomDistance ?? 0.5;
}
