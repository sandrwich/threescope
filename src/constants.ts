export const EARTH_RADIUS_KM = 6371.0;
export const MOON_RADIUS_KM = 1737.4;
export const MU = 398600.4418;
export const DRAW_SCALE = 3000.0;
export const DELTA_T_S = 69.0; // TT - UTC (seconds, ~2026). Meeus formulas expect TT, not UTC.
export const FP_RINGS = 12;
export const FP_PTS = 120;
export const DEG2RAD = Math.PI / 180.0;
export const RAD2DEG = 180.0 / Math.PI;
export const TWO_PI = 2.0 * Math.PI;
export const MAP_W = 2048.0;
export const MAP_H = 1024.0;

// Satellite color palette (RGB 0–255) — Progress Pride flag
export const SAT_COLORS: readonly [number, number, number][] = [
  [228,   3,   3], // Red        #E40303
  [255, 140,   0], // Orange     #FF8C00
  [255, 237,   0], // Yellow     #FFED00
  [  0, 128,  38], // Green      #008026
  [ 37,  77, 197], // Blue       #254DC5
  [115,  42, 130], // Violet     #732A82
  [191, 191, 191], // White      (dimmed below bloom)
  [ 91, 206, 250], // Light Blue #5BCEFA
  [245, 169, 184], // Pink       #F5A9B8
];

// Satellite colors — derived formats + helpers
export const SAT_COLORS_GL: readonly [number, number, number][] =
  SAT_COLORS.map(([r, g, b]) => [r / 255, g / 255, b / 255]);

const _satCount = SAT_COLORS.length;

/** CSS `rgb()` string for a satellite color index. */
export function satColorCss(index: number): string {
  const c = SAT_COLORS[index % _satCount];
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** CSS `rgba()` string for a satellite color index with alpha. */
export function satColorRgba(index: number, alpha: number): string {
  const c = SAT_COLORS[index % _satCount];
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

/** GL-ready [r,g,b] 0–1 floats for a satellite color index. */
export function satColorGl(index: number): readonly [number, number, number] {
  return SAT_COLORS_GL[index % _satCount];
}

// J2 perturbation constants
export const J2 = 1.08263e-3;                  // Earth's J2 zonal harmonic
export const EARTH_RADIUS_EQ_KM = 6378.137;    // WGS-84 equatorial radius (km)

// WGS-84 ellipsoid constants
export const WGS84_A = 6378.137;               // semi-major axis (km)
export const WGS84_F = 1 / 298.257223563;      // flattening
export const WGS84_E2 = 2 * WGS84_F - WGS84_F * WGS84_F; // first eccentricity squared
export const ORBIT_RECOMPUTE_INTERVAL_S = 900;  // recompute orbits every 15 sim-minutes
export const MOBILE_BREAKPOINT = 768;
