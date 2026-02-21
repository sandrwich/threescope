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
  textMain: string;
  textSecondary: string;
  uiBg: string;
  periapsis: string;
  apoapsis: string;
  footprintBg: string;
  footprintBorder: string;
  markers: Marker[];
}

export enum TargetLock { NONE, EARTH, MOON }
export enum ViewMode { VIEW_3D, VIEW_2D }
