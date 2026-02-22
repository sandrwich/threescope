export interface PassSkyPoint {
  az: number;   // degrees 0-360
  el: number;   // degrees 0-90
  t: number;    // TLE epoch (for interpolation)
}

export interface SatellitePass {
  satName: string;
  satColorIndex: number;
  aosEpoch: number;       // TLE epoch at AOS
  losEpoch: number;       // TLE epoch at LOS
  maxElEpoch: number;     // TLE epoch at max elevation
  maxEl: number;          // degrees
  aosAz: number;          // azimuth at AOS (degrees)
  losAz: number;          // azimuth at LOS (degrees)
  durationSec: number;
  skyPath: PassSkyPoint[];
}

export interface PassRequest {
  type: 'compute';
  satellites: { name: string; line1: string; line2: string; colorIndex: number }[];
  observerLat: number;
  observerLon: number;
  observerAlt: number;    // meters
  startEpoch: number;     // TLE epoch
  durationDays: number;
  minElevation: number;   // degrees
}

export interface PassResponse {
  type: 'result';
  passes: SatellitePass[];
}

export interface PassProgress {
  type: 'progress';
  percent: number;
}
