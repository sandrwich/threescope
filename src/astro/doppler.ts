/**
 * Doppler shift analysis for satellite passes.
 *
 * Improvements over the original C implementation:
 * 1. Uses satellite.js velocity output directly (analytical range-rate)
 *    instead of finite-difference with two propagations.
 * 2. Direct Rz(-GMST) rotation for ECI→ECEF instead of the
 *    lat/lon round-trip (2 trig calls vs 6).
 */
import { twoline2satrec, propagate } from 'satellite.js';
import type { SatRec, EciVec3, Kilometer, KilometerPerSecond } from 'satellite.js';
import { epochToUnix, epochToGmst } from './epoch';
import { EARTH_RADIUS_KM, DEG2RAD } from '../constants';

const C_KM_S = 299792.458;        // speed of light (km/s)
const OMEGA_E = 7.2921159e-5;     // Earth rotation rate (rad/s)

export interface DopplerResult {
  frequency: number;      // Hz, Doppler-shifted
  rangeKm: number;        // slant range (km)
  rangeRateKmS: number;   // range rate (km/s, positive = receding)
}

/** Observer ECEF position from geodetic (spherical Earth). */
function observerEcef(latDeg: number, lonDeg: number, altM: number) {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const R = EARTH_RADIUS_KM + altM / 1000;
  return {
    x: R * Math.cos(lat) * Math.cos(lon),
    y: R * Math.cos(lat) * Math.sin(lon),
    z: R * Math.sin(lat),
  };
}

/**
 * Rotate a standard-ECI vector to ECEF via Rz(-GMST).
 * Standard ECI: x=vernal equinox, y=90° ahead, z=north pole.
 */
function rotateEciToEcef(x: number, y: number, z: number, gmstRad: number) {
  const c = Math.cos(gmstRad);
  const s = Math.sin(gmstRad);
  return {
    x:  c * x + s * y,
    y: -s * x + c * y,
    z,
  };
}

/**
 * Compute Doppler-shifted frequency for a satellite at a given epoch.
 *
 * Uses a single satellite.js propagation to obtain both position and
 * velocity, then computes range rate analytically as
 *   dr/dt = dot(v_rel, r_hat)
 * where v_rel is the satellite velocity in the ECEF frame (accounting
 * for Earth rotation) and r_hat is the observer→satellite unit vector.
 */
export function calculateDopplerShift(
  satrec: SatRec,
  epoch: number,
  obsLatDeg: number,
  obsLonDeg: number,
  obsAltM: number,
  baseFreqHz: number,
): DopplerResult | null {
  const unix = epochToUnix(epoch);
  const date = new Date(unix * 1000);
  const result = propagate(satrec, date);

  if (!result.position || typeof result.position === 'boolean' ||
      !result.velocity || typeof result.velocity === 'boolean') {
    return null;
  }

  const pos = result.position as EciVec3<Kilometer>;
  const vel = result.velocity as EciVec3<KilometerPerSecond>;

  const gmstRad = epochToGmst(epoch) * DEG2RAD;

  // Satellite position in ECEF
  const satPos = rotateEciToEcef(pos.x, pos.y, pos.z, gmstRad);

  // Satellite velocity in ECEF: rotate + subtract Earth rotation (ω × r)
  const velRot = rotateEciToEcef(vel.x, vel.y, vel.z, gmstRad);
  const satVel = {
    x: velRot.x + OMEGA_E * satPos.y,
    y: velRot.y - OMEGA_E * satPos.x,
    z: velRot.z,
  };

  // Observer (stationary in ECEF)
  const obs = observerEcef(obsLatDeg, obsLonDeg, obsAltM);

  // Range vector (observer → satellite)
  const dx = satPos.x - obs.x;
  const dy = satPos.y - obs.y;
  const dz = satPos.z - obs.z;
  const rangeKm = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (rangeKm === 0) return null;

  // Range rate = dot(satellite velocity, range unit vector)
  const rangeRateKmS = (satVel.x * dx + satVel.y * dy + satVel.z * dz) / rangeKm;

  // Classical Doppler (negligible difference from relativistic at LEO v/c ~ 2.5e-5)
  const frequency = baseFreqHz * (C_KM_S / (C_KM_S + rangeRateKmS));

  return { frequency, rangeKm, rangeRateKmS };
}

/** Create a satrec from TLE lines (re-export to avoid satellite.js import in UI). */
export function createSatrec(line1: string, line2: string): SatRec {
  return twoline2satrec(line1, line2);
}
