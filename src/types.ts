import type { SatRec } from 'satellite.js';
import * as THREE from 'three';

export interface Satellite {
  name: string;
  epochDays: number;
  inclination: number;
  raan: number;
  eccentricity: number;
  argPerigee: number;
  meanAnomaly: number;
  meanMotion: number;     // rad/s
  semiMajorAxis: number;  // km
  currentPos: THREE.Vector3;  // ECI km (render coords: x=eci.x, y=eci.z, z=-eci.y)
  satrec: SatRec;
  tleLine1: string;
  tleLine2: string;
  // J2 secular perturbation rates (computed once at parse time)
  raanRate: number;       // dΩ/dt in rad/s
  argPerigeeRate: number; // dω/dt in rad/s
  ndot: number;           // dn/dt in rad/s² (from TLE first derivative of mean motion)
}

export interface Marker {
  name: string;
  lat: number;
  lon: number;
}

export interface AppConfig {
  earthRotationOffset: number;
  orbitsToDraw: number;
  showClouds: boolean;
  showNightLights: boolean;
  bgColor: string;
  orbitNormal: string;
  orbitHighlighted: string;
  satNormal: string;
  satHighlighted: string;
  satSelected: string;
  footprintBg: string;
  footprintBorder: string;
  markers: Marker[];
}

export enum TargetLock { NONE, EARTH, MOON, SUN, PLANET }
export enum ViewMode { VIEW_3D, VIEW_2D }
