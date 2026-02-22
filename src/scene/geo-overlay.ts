import * as THREE from 'three';
import { EARTH_RADIUS_KM, DRAW_SCALE, DEG2RAD, MAP_W, MAP_H } from '../constants';

const EARTH_R = (EARTH_RADIUS_KM / DRAW_SCALE) * 1.002; // slightly above surface
const GRID_INTERVAL = 15; // degrees
const PTS_PER_LINE = 120;

// Styling
const COUNTRY_OPACITY = 0.35;
const GRID_OPACITY = 0.12;
const GRID_EMPH_OPACITY = 0.25;
const Z_COUNTRIES_2D = 0.005;
const Z_GRID_2D = 0.004;

export class GeoOverlay {
  private group3d: THREE.Group;
  private scene2d: THREE.Scene;

  private countriesLine3d: THREE.LineSegments | null = null;
  private countriesLine2d: THREE.LineSegments | null = null;
  private countriesUrl = '';
  private countriesLoading = false;

  private gridLine3d!: THREE.LineSegments;
  private gridEmph3d!: THREE.LineSegments;
  private gridLine2d!: THREE.LineSegments;
  private gridEmph2d!: THREE.LineSegments;

  constructor(scene3d: THREE.Scene, scene2d: THREE.Scene, gridVisible = false) {
    this.group3d = new THREE.Group();
    scene3d.add(this.group3d);
    this.scene2d = scene2d;
    this.buildGrid(gridVisible);
  }

  /** Set the URL for country data — fetched lazily on first enable */
  setCountriesUrl(url: string) {
    this.countriesUrl = url;
  }

  private loadCountries() {
    if (this.countriesLoading || this.countriesLine3d) return;
    this.countriesLoading = true;
    fetch(this.countriesUrl)
      .then(r => r.json())
      .then(data => this.buildCountries(data))
      .catch(e => console.warn('Failed to load country outlines:', e));
  }

  private buildCountries(data: { features: { geometry: { coordinates: number[][][] } }[] }) {
    const allArcs: number[][][] = [];
    for (const feature of data.features) {
      allArcs.push(...feature.geometry.coordinates);
    }

    // 3D line segments (body-fixed coordinates — group rotates with Earth)
    const v3: number[] = [];
    for (const arc of allArcs) {
      for (let i = 0; i < arc.length - 1; i++) {
        if (Math.abs(arc[i + 1][0] - arc[i][0]) > 90) continue; // skip antimeridian crossings
        const a = this.ll3d(arc[i][1], arc[i][0]);
        const b = this.ll3d(arc[i + 1][1], arc[i + 1][0]);
        v3.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }

    const geo3d = new THREE.BufferGeometry();
    geo3d.setAttribute('position', new THREE.Float32BufferAttribute(v3, 3));
    this.countriesLine3d = new THREE.LineSegments(geo3d,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: COUNTRY_OPACITY, depthWrite: false }),
    );
    this.countriesLine3d.frustumCulled = false;
    this.group3d.add(this.countriesLine3d);

    // 2D line segments (3 copies for wrapping)
    const v2: number[] = [];
    for (const arc of allArcs) {
      for (let i = 0; i < arc.length - 1; i++) {
        if (Math.abs(arc[i + 1][0] - arc[i][0]) > 90) continue;
        const x1 = (arc[i][0] / 360) * MAP_W, y1 = (arc[i][1] / 180) * MAP_H;
        const x2 = (arc[i + 1][0] / 360) * MAP_W, y2 = (arc[i + 1][1] / 180) * MAP_H;
        for (const ox of [-MAP_W, 0, MAP_W]) {
          v2.push(x1 + ox, y1, Z_COUNTRIES_2D, x2 + ox, y2, Z_COUNTRIES_2D);
        }
      }
    }

    const geo2d = new THREE.BufferGeometry();
    geo2d.setAttribute('position', new THREE.Float32BufferAttribute(v2, 3));
    this.countriesLine2d = new THREE.LineSegments(geo2d,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: COUNTRY_OPACITY, depthWrite: false }),
    );
    this.countriesLine2d.frustumCulled = false;
    this.scene2d.add(this.countriesLine2d);
  }

  private buildGrid(visible: boolean) {
    const nv3: number[] = [], ev3: number[] = [];
    const nv2: number[] = [], ev2: number[] = [];

    // Latitude lines (every 15°, skipping poles)
    for (let lat = -90 + GRID_INTERVAL; lat < 90; lat += GRID_INTERVAL) {
      const emph = lat === 0; // equator
      const t3 = emph ? ev3 : nv3;
      const t2 = emph ? ev2 : nv2;

      for (let i = 0; i < PTS_PER_LINE; i++) {
        const lon1 = -180 + (360 * i / PTS_PER_LINE);
        const lon2 = -180 + (360 * (i + 1) / PTS_PER_LINE);
        const a = this.ll3d(lat, lon1), b = this.ll3d(lat, lon2);
        t3.push(a.x, a.y, a.z, b.x, b.y, b.z);

        const mx1 = (lon1 / 360) * MAP_W, mx2 = (lon2 / 360) * MAP_W;
        const my = (lat / 180) * MAP_H;
        for (const ox of [-MAP_W, 0, MAP_W]) {
          t2.push(mx1 + ox, my, Z_GRID_2D, mx2 + ox, my, Z_GRID_2D);
        }
      }
    }

    // Longitude lines (every 15°)
    for (let lon = -180; lon < 180; lon += GRID_INTERVAL) {
      const emph = lon === 0; // prime meridian
      const t3 = emph ? ev3 : nv3;
      const t2 = emph ? ev2 : nv2;

      for (let i = 0; i < PTS_PER_LINE; i++) {
        const lat1 = -90 + (180 * i / PTS_PER_LINE);
        const lat2 = -90 + (180 * (i + 1) / PTS_PER_LINE);
        const a = this.ll3d(lat1, lon), b = this.ll3d(lat2, lon);
        t3.push(a.x, a.y, a.z, b.x, b.y, b.z);

        const mx = (lon / 360) * MAP_W;
        const my1 = (lat1 / 180) * MAP_H, my2 = (lat2 / 180) * MAP_H;
        for (const ox of [-MAP_W, 0, MAP_W]) {
          t2.push(mx + ox, my1, Z_GRID_2D, mx + ox, my2, Z_GRID_2D);
        }
      }
    }

    const makeLine = (verts: number[], opacity: number): THREE.LineSegments => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      const line = new THREE.LineSegments(geo,
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity, depthWrite: false }),
      );
      line.frustumCulled = false;
      return line;
    };

    this.gridLine3d = makeLine(nv3, GRID_OPACITY);
    this.gridEmph3d = makeLine(ev3, GRID_EMPH_OPACITY);
    this.gridLine3d.visible = visible;
    this.gridEmph3d.visible = visible;
    this.group3d.add(this.gridLine3d, this.gridEmph3d);

    this.gridLine2d = makeLine(nv2, GRID_OPACITY);
    this.gridEmph2d = makeLine(ev2, GRID_EMPH_OPACITY);
    this.gridLine2d.visible = visible;
    this.gridEmph2d.visible = visible;
    this.scene2d.add(this.gridLine2d, this.gridEmph2d);
  }

  /** Convert lat/lon (degrees) to body-fixed 3D position */
  private ll3d(lat: number, lon: number): { x: number; y: number; z: number } {
    const la = lat * DEG2RAD, lo = lon * DEG2RAD;
    return {
      x: Math.cos(la) * Math.cos(lo) * EARTH_R,
      y: Math.sin(la) * EARTH_R,
      z: -Math.cos(la) * Math.sin(lo) * EARTH_R,
    };
  }

  setCountriesVisible(v: boolean) {
    if (v && !this.countriesLine3d) this.loadCountries();
    if (this.countriesLine3d) this.countriesLine3d.visible = v;
    if (this.countriesLine2d) this.countriesLine2d.visible = v;
  }

  setGridVisible(v: boolean) {
    this.gridLine3d.visible = v;
    this.gridEmph3d.visible = v;
    this.gridLine2d.visible = v;
    this.gridEmph2d.visible = v;
  }

  /** Hide all 3D overlays (for orrery/planet mode) */
  set3dVisible(v: boolean) {
    this.group3d.visible = v;
  }

  /** Match Earth mesh rotation each frame */
  setRotation(rad: number) {
    this.group3d.rotation.y = rad;
  }
}
