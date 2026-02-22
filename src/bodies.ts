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
    thumbnailUrl: '/textures/earth/thumb.webp',
  },
  [TargetLock.MOON]: {
    name: 'Moon',
    radiusKm: MOON_RADIUS_KM,
    minZoomDistance: MOON_RADIUS_KM / DRAW_SCALE * 1.2,
    bloom: false,
    thumbnailUrl: '/textures/moon/thumb.webp',
  },
  [TargetLock.SUN]: {
    name: 'Sun',
    radiusKm: 0,
    minZoomDistance: 3.0,
    bloom: true,
    thumbnailUrl: '/textures/sun/thumb.webp',
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
  bumpStrength: number; // 0 = no bump, >0 = derive bump from displacement map
  displacementScale: number; // vertex displacement magnitude (fraction of draw radius)
  displacementMapUrl?: string; // URL to grayscale height map for displacement
}

export const PLANETS: PlanetDef[] = [
  {
    id: 'sun', name: 'Sun', radiusKm: 695700,
    minZoomDistance: 4.0,
    bloom: true, textureUrl: '/textures/sun/color.webp',
    thumbnailUrl: '/textures/sun/thumb.webp',
    rotationPeriodH: 601.2, order: 0, bumpStrength: 0.0, displacementScale: 0.0,
  },
  {
    id: 'mercury', name: 'Mercury', radiusKm: 2439.7,
    minZoomDistance: 2439.7 / DRAW_SCALE * 1.2,
    bloom: false, textureUrl: '/textures/mercury/color.webp',
    thumbnailUrl: '/textures/mercury/thumb.webp',
    rotationPeriodH: 1407.6, order: 1, bumpStrength: 2.0, displacementScale: 0.009,
    displacementMapUrl: '/textures/mercury/displacement.webp',
  },
  {
    id: 'venus', name: 'Venus', radiusKm: 6051.8,
    minZoomDistance: 6051.8 / DRAW_SCALE * 1.2,
    bloom: false, textureUrl: '/textures/venus/color.webp',
    thumbnailUrl: '/textures/venus/thumb.webp',
    rotationPeriodH: 5832.5, order: 2, bumpStrength: 0.3, displacementScale: 0.005,
  },
  {
    id: 'mars', name: 'Mars', radiusKm: 3389.5,
    minZoomDistance: 3389.5 / DRAW_SCALE * 1.2,
    bloom: false, textureUrl: '/textures/mars/color.webp',
    thumbnailUrl: '/textures/mars/thumb.webp',
    rotationPeriodH: 24.62, order: 4, bumpStrength: 1.5, displacementScale: 0.026,
    displacementMapUrl: '/textures/mars/displacement.webp',
  },
  {
    id: 'jupiter', name: 'Jupiter', radiusKm: 69911,
    minZoomDistance: 69911 / DRAW_SCALE * 1.2,
    bloom: false, textureUrl: '/textures/jupiter/color.webp',
    thumbnailUrl: '/textures/jupiter/thumb.webp',
    rotationPeriodH: 9.93, order: 5, bumpStrength: 0.0, displacementScale: 0.0,
  },
  {
    id: 'saturn', name: 'Saturn', radiusKm: 58232,
    minZoomDistance: 58232 / DRAW_SCALE * 1.2,
    bloom: false, textureUrl: '/textures/saturn/color.webp',
    thumbnailUrl: '/textures/saturn/thumb.webp',
    rotationPeriodH: 10.7, order: 6, bumpStrength: 0.0, displacementScale: 0.0,
  },
  {
    id: 'uranus', name: 'Uranus', radiusKm: 25362,
    minZoomDistance: 25362 / DRAW_SCALE * 1.2,
    bloom: false, textureUrl: '/textures/uranus/color.webp',
    thumbnailUrl: '/textures/uranus/thumb.webp',
    rotationPeriodH: 17.24, order: 7, bumpStrength: 0.0, displacementScale: 0.0,
  },
  {
    id: 'neptune', name: 'Neptune', radiusKm: 24622,
    minZoomDistance: 24622 / DRAW_SCALE * 1.2,
    bloom: false, textureUrl: '/textures/neptune/color.webp',
    thumbnailUrl: '/textures/neptune/thumb.webp',
    rotationPeriodH: 16.11, order: 8, bumpStrength: 0.0, displacementScale: 0.0,
  },
];

export function getMinZoom(lock: TargetLock): number {
  // Promoted planets use uniform orrery ball size (radius 3.0)
  if (lock === TargetLock.PLANET) return 4.0;
  return BODIES[lock]?.minZoomDistance ?? 0.5;
}
