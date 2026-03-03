import type { Satellite } from '../types';

// --- Sprite atlas slot indices ---
// Each slot corresponds to a numbered SVG in public/textures/ui/sprites/
// (e.g. 00-default.svg = slot 0, 01-station.svg = slot 1)
export const SPRITE_DEFAULT = 0;

// --- Rest angle for Earth-pointing rotation ---
// The default sprite SVG uses rotate(-45) with wifi arcs extending in the
// local +y direction. In the SVG file the arcs point toward lower-right (π/4),
// but Three.js TextureLoader applies flipY=true by default, which vertically
// flips the texture on the GPU. This shifts the arcs to upper-right (-π/4).
//
// To adjust: render the sprite without rotation, note which screen direction
// the antenna/wifi arcs point, and set REST_ANGLE = atan2(dy, dx) where
// (dx, dy) is that direction in y-down screen coords.
export const REST_ANGLE = -Math.PI / 4;

/**
 * Determine which sprite atlas slot to use for a satellite.
 * Currently returns SPRITE_DEFAULT for all satellites.
 *
 * Future: match by sat.name, sat.noradId, constellation membership,
 * object type (payload/debris/rocket body), etc.
 */
export function getSpriteIndex(_sat: Satellite): number {
  return SPRITE_DEFAULT;
}
