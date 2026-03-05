/**
 * Compute azimuth and elevation from a ground observer to a satellite.
 * Pure math — no THREE.js or DOM dependencies. Usable in Web Workers.
 *
 * Uses WGS-84 ellipsoid for observer positioning.
 *
 * @param eciX  Standard ECI X position (km) — toward vernal equinox
 * @param eciY  Standard ECI Y position (km) — completes right-hand system
 * @param eciZ  Standard ECI Z position (km) — toward north pole
 * @param gmstRad  Greenwich Mean Sidereal Time in radians
 * @param obsLatDeg  Observer geodetic latitude in degrees (-90 to 90)
 * @param obsLonDeg  Observer geodetic longitude in degrees (-180 to 180)
 * @param obsAltM  Observer altitude in meters above WGS-84 ellipsoid
 * @returns { az, el } in degrees. Az: 0=N, 90=E, 180=S, 270=W. El: 0=horizon, 90=zenith.
 */
import { geodeticToEcef } from './geodetic';

export function getAzEl(
  eciX: number, eciY: number, eciZ: number,
  gmstRad: number,
  obsLatDeg: number, obsLonDeg: number, obsAltM: number,
): { az: number; el: number } {
  const DEG2RAD = Math.PI / 180;

  if (eciX === 0 && eciY === 0 && eciZ === 0) return { az: 0, el: -90 };

  // ECI to ECEF via Rz(-GMST)
  const cg = Math.cos(gmstRad), sg = Math.sin(gmstRad);
  const sx =  cg * eciX + sg * eciY;
  const sy = -sg * eciX + cg * eciY;
  const sz = eciZ;

  // Observer ECEF position (WGS-84 ellipsoid)
  const obs = geodeticToEcef(obsLatDeg, obsLonDeg, obsAltM);

  // Range vector (ECEF)
  const dx = sx - obs.x;
  const dy = sy - obs.y;
  const dz = sz - obs.z;

  // Rotate to topocentric East-North-Up (geodetic lat/lon defines the local frame)
  const latRad = obsLatDeg * DEG2RAD;
  const lonRad = obsLonDeg * DEG2RAD;
  const clat = Math.cos(latRad), slat = Math.sin(latRad);
  const clon = Math.cos(lonRad), slon = Math.sin(lonRad);

  const east  = -slon * dx + clon * dy;
  const north = -slat * clon * dx - slat * slon * dy + clat * dz;
  const up    =  clat * clon * dx + clat * slon * dy + slat * dz;

  const el = Math.atan2(up, Math.sqrt(east * east + north * north)) * (180 / Math.PI);
  let az = Math.atan2(east, north) * (180 / Math.PI);
  if (az < 0) az += 360;

  return { az, el };
}

/**
 * Convert render coordinates to standard ECI.
 * Render: x=eci.x, y=eci.z (up), z=-eci.y
 * Standard ECI: x=toward vernal equinox, y=completes RHS, z=north pole
 */
export function renderToEci(rx: number, ry: number, rz: number): { x: number; y: number; z: number } {
  return { x: rx, y: -rz, z: ry };
}
