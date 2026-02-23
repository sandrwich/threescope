export const EARTH_RADIUS_KM = 6371.0;
export const MOON_RADIUS_KM = 1737.4;
export const MU = 398600.4418;
export const DRAW_SCALE = 3000.0;
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

// J2 perturbation constants
export const J2 = 1.08263e-3;                  // Earth's J2 zonal harmonic
export const EARTH_RADIUS_EQ_KM = 6378.137;    // WGS-84 equatorial radius (km)
export const ORBIT_RECOMPUTE_INTERVAL_S = 900;  // recompute orbits every 15 sim-minutes
