export interface PassSkyPoint {
  az: number;   // degrees 0-360
  el: number;   // degrees 0-90
  t: number;    // TLE epoch (for interpolation)
  shadowFactor?: number;  // 1.0 = fully sunlit, 0.0 = full shadow (Earth umbra or solar eclipse)
  mag?: number;           // apparent visual magnitude at this point (only when sunlit + stdMag known)
  rangeKm?: number;       // slant range from observer (km)
}

export interface SatellitePass {
  satNoradId: number;
  satName: string;
  satColorIndex: number;
  aosEpoch: number;       // TLE epoch at AOS
  losEpoch: number;       // TLE epoch at LOS
  maxElEpoch: number;     // TLE epoch at max elevation
  maxEl: number;          // degrees
  aosAz: number;          // azimuth at AOS (degrees)
  losAz: number;          // azimuth at LOS (degrees)
  maxElAz: number;        // azimuth at max elevation (degrees)
  durationSec: number;
  skyPath: PassSkyPoint[];
  eclipsed: boolean;        // satellite in Earth's shadow at max elevation
  peakMag: number | null;   // estimated visual magnitude at max elevation (null if eclipsed)
  sunAlt: number;           // sun altitude at observer at max-el time (degrees, negative = below horizon)
  elongation: number;       // solar elongation at max-el time (degrees, 0-180)
}

export interface PassRequest {
  type: 'compute';
  satellites: { noradId: number; name: string; line1: string; line2: string; colorIndex: number; stdMag: number | null }[];
  observerLat: number;
  observerLon: number;
  observerAlt: number;    // meters
  startEpoch: number;     // TLE epoch
  durationDays: number;
  minElevation: number;   // degrees
  stepMinutes?: number;   // scan step size (default 1)
  // Optional filters — passes that don't match are discarded in the worker
  maxElevation?: number;        // degrees, discard passes peaking below this
  visibility?: 'all' | 'observable' | 'visible';
  azFrom?: number;              // 0-360, supports wrap-around
  azTo?: number;                // 0-360
  horizonMask?: { az: number; minEl: number }[];  // 8 azimuths with min elevation
  minDuration?: number;         // seconds within observable window
}

export interface PassResponse {
  type: 'result';
  passes: SatellitePass[];
}

export interface PassPartial {
  type: 'partial';
  passes: SatellitePass[];
}

export interface PassProgress {
  type: 'progress';
  percent: number;
}
