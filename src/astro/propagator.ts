import * as satellite from 'satellite.js';
import * as THREE from 'three';
import type { Satellite } from '../types';
import { normalizeEpoch } from './epoch';

export function parseTLE(name: string, line1: string, line2: string): Satellite | null {
  try {
    const satrec = satellite.twoline2satrec(line1, line2);

    // Extract orbital elements from TLE lines
    const epochDays = parseFloat(line1.substring(18, 32));
    const inclination = parseFloat(line2.substring(8, 16)) * (Math.PI / 180);
    const raan = parseFloat(line2.substring(17, 25)) * (Math.PI / 180);
    const eccentricity = parseFloat('0.' + line2.substring(26, 33).trim());
    const argPerigee = parseFloat(line2.substring(34, 42)) * (Math.PI / 180);
    const meanAnomaly = parseFloat(line2.substring(43, 51)) * (Math.PI / 180);
    const revsPerDay = parseFloat(line2.substring(52, 63));
    const meanMotion = (revsPerDay * 2.0 * Math.PI) / 86400.0; // rad/s
    const MU = 398600.4418;
    const semiMajorAxis = Math.pow(MU / (meanMotion * meanMotion), 1.0 / 3.0);

    return {
      name: name.trim(),
      epochDays,
      inclination,
      raan,
      eccentricity,
      argPerigee,
      meanAnomaly,
      meanMotion,
      semiMajorAxis,
      currentPos: new THREE.Vector3(),
      satrec,
      tleLine1: line1,
      tleLine2: line2,
    };
  } catch {
    return null;
  }
}

export function calculatePosition(sat: Satellite, currentEpoch: number): THREE.Vector3 {
  currentEpoch = normalizeEpoch(currentEpoch);

  // Convert epoch to Date for satellite.js
  const yy = Math.floor(currentEpoch / 1000.0);
  const day = currentEpoch % 1000.0;
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  const jan1 = Date.UTC(year, 0, 1);
  const dateMs = jan1 + (day - 1.0) * 86400000;
  const date = new Date(dateMs);

  const result = satellite.propagate(sat.satrec, date);

  if (!result.position || typeof result.position === 'boolean') {
    return new THREE.Vector3(0, 0, 0);
  }

  const eci = result.position as satellite.EciVec3<number>;

  // ECI to render coords: x=eci.x, y=eci.z, z=-eci.y
  return new THREE.Vector3(eci.x, eci.z, -eci.y);
}
