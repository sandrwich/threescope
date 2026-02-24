/**
 * Satellite visual magnitude estimation.
 * Uses a Lambertian (diffuse) sphere model — the standard approach for
 * predicting apparent brightness of satellites.
 *
 * No THREE.js dependency so it can run in the pass Web Worker.
 *
 * References:
 *   - McCants standard magnitude convention (1000 km range, 90° phase)
 *   - Kasten & Young (1989) airmass formula
 *
 * Standard magnitude data is loaded from src/data/stdmag.json (generated
 * by scripts/generate-stdmag.ts). See .docs/magnitude.md for details.
 */

const DEG2RAD = Math.PI / 180.0;
const RAD2DEG = 180.0 / Math.PI;
const EARTH_RADIUS_KM = 6371.0;

/**
 * Lambertian (diffuse) sphere phase function.
 * F(φ) = (sin(φ) + (π − φ) · cos(φ)) / π
 *
 * Returns the fraction of maximum brightness (0 at φ=180°, 1/π at φ=90°, 2/π at φ=0°).
 */
export function phaseFunction(phaseAngleDeg: number): number {
  const phi = Math.max(0, Math.min(180, phaseAngleDeg)) * DEG2RAD;
  return (Math.sin(phi) + (Math.PI - phi) * Math.cos(phi)) / Math.PI;
}

/**
 * Atmospheric airmass using the Kasten-Young (1989) formula.
 * Valid for elevations down to ~0°. Returns 1.0 at zenith, ~38 at horizon.
 */
export function airmass(elevationDeg: number): number {
  if (elevationDeg >= 90) return 1.0;
  if (elevationDeg < 0) elevationDeg = 0;
  // Kasten-Young: X = 1 / (sin(h) + 0.50572 · (h + 6.07995)^-1.6364)
  const sinH = Math.sin(elevationDeg * DEG2RAD);
  const correction = 0.50572 * Math.pow(elevationDeg + 6.07995, -1.6364);
  return 1.0 / (sinH + correction);
}

/**
 * Compute the phase angle (degrees) at the satellite between the Sun and the observer.
 * Phase angle = 0° when observer is behind the sun (full illumination),
 *             = 180° when satellite is between observer and sun (backlit).
 *
 * All positions in standard ECI (km).
 */
export function computePhaseAngle(
  satEci: { x: number; y: number; z: number },
  sunDirEci: { x: number; y: number; z: number },
  obsEci: { x: number; y: number; z: number },
): number {
  // Vector from satellite to sun (sun at infinity, so just sunDir)
  const toSunX = sunDirEci.x;
  const toSunY = sunDirEci.y;
  const toSunZ = sunDirEci.z;

  // Vector from satellite to observer
  const toObsX = obsEci.x - satEci.x;
  const toObsY = obsEci.y - satEci.y;
  const toObsZ = obsEci.z - satEci.z;
  const toObsLen = Math.sqrt(toObsX * toObsX + toObsY * toObsY + toObsZ * toObsZ);
  if (toObsLen === 0) return 90;

  // cos(phase) = dot(satToSun, satToObs) / (|satToSun| · |satToObs|)
  // sunDir is already unit length
  const dot = toSunX * (toObsX / toObsLen) + toSunY * (toObsY / toObsLen) + toSunZ * (toObsZ / toObsLen);
  return Math.acos(Math.max(-1, Math.min(1, dot))) * RAD2DEG;
}

/**
 * Compute observer position in standard ECI (km) from geodetic coordinates.
 * Simplified: assumes spherical Earth (good enough for magnitude estimation).
 *
 * @param latDeg  Geodetic latitude (degrees)
 * @param lonDeg  Geodetic longitude (degrees)
 * @param altM    Altitude above sea level (meters)
 * @param gmstRad Greenwich Mean Sidereal Time (radians)
 */
export function observerEci(
  latDeg: number, lonDeg: number, altM: number, gmstRad: number,
): { x: number; y: number; z: number } {
  const latRad = latDeg * DEG2RAD;
  const lonRad = lonDeg * DEG2RAD;
  const r = EARTH_RADIUS_KM + altM / 1000.0;
  const cosLat = Math.cos(latRad);
  const sinLat = Math.sin(latRad);
  const theta = gmstRad + lonRad;  // sidereal angle
  return {
    x: r * cosLat * Math.cos(theta),
    y: r * cosLat * Math.sin(theta),
    z: r * sinLat,
  };
}

/**
 * Compute slant range (km) between satellite and observer, both in ECI.
 */
export function slantRange(
  satEci: { x: number; y: number; z: number },
  obsEci: { x: number; y: number; z: number },
): number {
  const dx = satEci.x - obsEci.x;
  const dy = satEci.y - obsEci.y;
  const dz = satEci.z - obsEci.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Estimate visual magnitude of a satellite.
 *
 * @param stdMag         Standard magnitude (at 1000 km, 90° phase)
 * @param rangeKm        Slant range from observer (km)
 * @param phaseAngleDeg  Phase angle (degrees, 0 = full, 180 = backlit)
 * @param elevationDeg   Elevation above horizon (degrees)
 * @returns Apparent visual magnitude (lower = brighter)
 */
export function estimateVisualMagnitude(
  stdMag: number,
  rangeKm: number,
  phaseAngleDeg: number,
  elevationDeg: number,
): number {
  // Range correction: brightness falls off with distance²
  const rangeMag = 5.0 * Math.log10(Math.max(rangeKm, 1) / 1000.0);

  // Phase correction: relative to the reference phase (90°)
  const refPhase = phaseFunction(90);
  const curPhase = phaseFunction(phaseAngleDeg);
  const phaseMag = (curPhase > 0 && refPhase > 0)
    ? -2.5 * Math.log10(curPhase / refPhase)
    : 10; // effectively invisible if phase function is 0

  // Atmospheric extinction: ~0.2 mag per airmass at sea level
  const extinction = 0.2 * airmass(elevationDeg);

  return stdMag + rangeMag + phaseMag + extinction;
}
