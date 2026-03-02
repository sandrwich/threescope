import * as THREE from 'three';
import { palette, parseRgba } from '../ui/shared/theme';

const EL_STEPS = [15, 30, 45, 60, 75]; // elevation rings in degrees
const AZ_STEPS = 12;                    // azimuth lines (every 30°)
const RING_PTS = 72;                    // points per elevation ring
const DOME_R = 400;                     // draw-space radius of sky dome
const DEG = Math.PI / 180;

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const CARD_AZ = [0, 45, 90, 135, 180, 225, 270, 315]; // degrees
const AZ_LABELS = ['0°', '30°', '60°', '90°', '120°', '150°', '180°', '210°', '240°', '270°', '300°', '330°'];
const AZ_LABEL_ANGLES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]; // degrees

/**
 * Az/El reference grid rendered on a dome around the observer.
 * Elevation rings at 15° intervals, azimuth lines every 30°,
 * and cardinal direction labels at the horizon.
 */
export class SkyGridRenderer {
  private group = new THREE.Group();

  // Elevation rings
  private ringAttrs: THREE.BufferAttribute[] = [];

  // Azimuth lines (one LineSegments with all lines)
  private azPosAttr: THREE.BufferAttribute;

  // Cardinal labels (HTML overlay — positioned from 3D projection)
  private labelEls: HTMLSpanElement[] = [];
  private labelPositions: THREE.Vector3[] = [];
  private labelCount = 0; // cardinal count (first N labels are cardinals)

  // Elevation + azimuth degree labels (appended after cardinals)

  // Cached frame vectors for label positioning
  private _origin = new THREE.Vector3();
  private _up = new THREE.Vector3();
  private _north = new THREE.Vector3();
  private _east = new THREE.Vector3();
  private _tmpProj = new THREE.Vector3();

  constructor(scene: THREE.Scene, private overlay: HTMLElement) {
    const gridColor = parseRgba(palette.skyGrid);
    const lineMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(gridColor.r, gridColor.g, gridColor.b),
      transparent: true,
      opacity: gridColor.a,
      depthTest: false, depthWrite: false,
    });

    // Elevation rings
    for (let i = 0; i < EL_STEPS.length; i++) {
      const pos = new Float32Array(RING_PTS * 3);
      const attr = new THREE.BufferAttribute(pos, 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', attr);
      const ring = new THREE.LineLoop(geo, lineMat);
      ring.frustumCulled = false;
      ring.renderOrder = 900;
      this.group.add(ring);
      this.ringAttrs.push(attr);
    }

    // Azimuth lines: each line goes from horizon (el=0) to near-zenith (el=80°)
    const azVerts = AZ_STEPS * 2;
    const azPos = new Float32Array(azVerts * 3);
    this.azPosAttr = new THREE.BufferAttribute(azPos, 3);
    this.azPosAttr.setUsage(THREE.DynamicDrawUsage);
    const azGeo = new THREE.BufferGeometry();
    azGeo.setAttribute('position', this.azPosAttr);
    const azLines = new THREE.LineSegments(azGeo, lineMat);
    azLines.frustumCulled = false;
    azLines.renderOrder = 900;
    this.group.add(azLines);

    // Cardinal labels (HTML)
    for (const label of CARDINALS) {
      const el = document.createElement('span');
      el.textContent = label;
      el.className = 'sky-grid-label';
      el.style.cssText = `
        position: absolute; pointer-events: none; font-size: 11px;
        font-family: 'Overpass Mono', monospace; color: var(--sky-grid-label);
        text-shadow: 0 0 3px var(--bg); transform: translate(-50%, -50%);
        white-space: nowrap; display: none; z-index: 5;
      `;
      overlay.appendChild(el);
      this.labelEls.push(el);
      this.labelPositions.push(new THREE.Vector3());
    }

    this.labelCount = CARDINALS.length;

    // Elevation degree labels (placed along north azimuth line)
    for (const elDeg of EL_STEPS) {
      const el = document.createElement('span');
      el.textContent = `${elDeg}°`;
      el.className = 'sky-grid-label';
      el.style.cssText = `
        position: absolute; pointer-events: none; font-size: 10px;
        font-family: 'Overpass Mono', monospace; color: var(--sky-grid-label);
        text-shadow: 0 0 3px var(--bg); transform: translate(-50%, -50%);
        white-space: nowrap; display: none; z-index: 5; opacity: 0.7;
      `;
      overlay.appendChild(el);
      this.labelEls.push(el);
      this.labelPositions.push(new THREE.Vector3());
    }

    // Azimuth degree labels (placed at horizon, between cardinals)
    for (let i = 0; i < AZ_LABELS.length; i++) {
      // Skip labels that overlap with cardinals (0°=N, 90°=E, 180°=S, 270°=W)
      if (AZ_LABEL_ANGLES[i] % 90 === 0) continue;
      const el = document.createElement('span');
      el.textContent = AZ_LABELS[i];
      el.className = 'sky-grid-label';
      el.style.cssText = `
        position: absolute; pointer-events: none; font-size: 10px;
        font-family: 'Overpass Mono', monospace; color: var(--sky-grid-label);
        text-shadow: 0 0 3px var(--bg); transform: translate(-50%, -50%);
        white-space: nowrap; display: none; z-index: 5;
      `;
      overlay.appendChild(el);
      this.labelEls.push(el);
      this.labelPositions.push(new THREE.Vector3());
    }

    this.group.visible = false;
    scene.add(this.group);
  }

  /** Update grid geometry from observer ENU frame. */
  update(
    origin: THREE.Vector3, up: THREE.Vector3,
    north: THREE.Vector3, east: THREE.Vector3,
  ) {
    this._origin.copy(origin);
    this._up.copy(up);
    this._north.copy(north);
    this._east.copy(east);

    // Elevation rings
    for (let ri = 0; ri < EL_STEPS.length; ri++) {
      const elRad = EL_STEPS[ri] * DEG;
      const cosEl = Math.cos(elRad);
      const sinEl = Math.sin(elRad);
      const r = DOME_R * cosEl;
      const h = DOME_R * sinEl;
      const arr = this.ringAttrs[ri].array as Float32Array;
      for (let i = 0; i < RING_PTS; i++) {
        const azRad = (2 * Math.PI * i) / RING_PTS;
        const cosAz = Math.cos(azRad);
        const sinAz = Math.sin(azRad);
        const dx = north.x * cosAz * r + east.x * sinAz * r + up.x * h;
        const dy = north.y * cosAz * r + east.y * sinAz * r + up.y * h;
        const dz = north.z * cosAz * r + east.z * sinAz * r + up.z * h;
        arr[i * 3]     = origin.x + dx;
        arr[i * 3 + 1] = origin.y + dy;
        arr[i * 3 + 2] = origin.z + dz;
      }
      this.ringAttrs[ri].needsUpdate = true;
    }

    // Azimuth lines: horizon → near-zenith
    const azArr = this.azPosAttr.array as Float32Array;
    for (let i = 0; i < AZ_STEPS; i++) {
      const azRad = (2 * Math.PI * i) / AZ_STEPS;
      const cosAz = Math.cos(azRad);
      const sinAz = Math.sin(azRad);
      // Horizon point (el=0)
      const hx = north.x * cosAz + east.x * sinAz;
      const hy = north.y * cosAz + east.y * sinAz;
      const hz = north.z * cosAz + east.z * sinAz;
      const off = i * 6;
      azArr[off]     = origin.x + hx * DOME_R;
      azArr[off + 1] = origin.y + hy * DOME_R;
      azArr[off + 2] = origin.z + hz * DOME_R;
      // Near-zenith (el=80°)
      const cosEl80 = Math.cos(80 * DEG);
      const sinEl80 = Math.sin(80 * DEG);
      azArr[off + 3] = origin.x + (hx * cosEl80 + up.x * sinEl80) * DOME_R;
      azArr[off + 4] = origin.y + (hy * cosEl80 + up.y * sinEl80) * DOME_R;
      azArr[off + 5] = origin.z + (hz * cosEl80 + up.z * sinEl80) * DOME_R;
    }
    this.azPosAttr.needsUpdate = true;

    // Cardinal label positions (el=5° just above horizon)
    const labelEl = 5 * DEG;
    const cosLEl = Math.cos(labelEl);
    const sinLEl = Math.sin(labelEl);
    for (let i = 0; i < CARDINALS.length; i++) {
      const azRad = CARD_AZ[i] * DEG;
      const cosAz = Math.cos(azRad);
      const sinAz = Math.sin(azRad);
      const hx = north.x * cosAz + east.x * sinAz;
      const hy = north.y * cosAz + east.y * sinAz;
      const hz = north.z * cosAz + east.z * sinAz;
      this.labelPositions[i].set(
        origin.x + (hx * cosLEl + up.x * sinLEl) * DOME_R,
        origin.y + (hy * cosLEl + up.y * sinLEl) * DOME_R,
        origin.z + (hz * cosLEl + up.z * sinLEl) * DOME_R,
      );
    }

    // Elevation degree labels — placed along north azimuth line, offset slightly east
    let idx = this.labelCount;
    for (let ri = 0; ri < EL_STEPS.length; ri++) {
      const elRad = EL_STEPS[ri] * DEG;
      const cosE = Math.cos(elRad), sinE = Math.sin(elRad);
      // Slight east offset so label doesn't sit on the azimuth line
      const nx = north.x * cosE + up.x * sinE;
      const ny = north.y * cosE + up.y * sinE;
      const nz = north.z * cosE + up.z * sinE;
      this.labelPositions[idx].set(
        origin.x + nx * DOME_R + east.x * DOME_R * 0.02,
        origin.y + ny * DOME_R + east.y * DOME_R * 0.02,
        origin.z + nz * DOME_R + east.z * DOME_R * 0.02,
      );
      idx++;
    }

    // Azimuth degree labels — at horizon (el=5°), skipping cardinals at 0°/90°/180°/270°
    for (let i = 0; i < AZ_LABEL_ANGLES.length; i++) {
      if (AZ_LABEL_ANGLES[i] % 90 === 0) continue;
      const azRad = AZ_LABEL_ANGLES[i] * DEG;
      const cosAz = Math.cos(azRad), sinAz = Math.sin(azRad);
      const hx = north.x * cosAz + east.x * sinAz;
      const hy = north.y * cosAz + east.y * sinAz;
      const hz = north.z * cosAz + east.z * sinAz;
      this.labelPositions[idx].set(
        origin.x + (hx * cosLEl + up.x * sinLEl) * DOME_R,
        origin.y + (hy * cosLEl + up.y * sinLEl) * DOME_R,
        origin.z + (hz * cosLEl + up.z * sinLEl) * DOME_R,
      );
      idx++;
    }
  }

  /** Project all grid labels (cardinals, elevation, azimuth) to screen. Call after camera update. */
  projectLabels(camera: THREE.PerspectiveCamera) {
    if (!this.group.visible) {
      for (const el of this.labelEls) el.style.display = 'none';
      return;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const tmp = this._tmpProj;
    for (let i = 0; i < this.labelEls.length; i++) {
      tmp.copy(this.labelPositions[i]);
      tmp.project(camera);
      // Behind camera or off-screen
      if (tmp.z > 1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1) {
        this.labelEls[i].style.display = 'none';
        continue;
      }
      const sx = (tmp.x * 0.5 + 0.5) * w;
      const sy = (-tmp.y * 0.5 + 0.5) * h;
      this.labelEls[i].style.display = '';
      this.labelEls[i].style.left = `${sx}px`;
      this.labelEls[i].style.top = `${sy}px`;
    }
  }

  setVisible(v: boolean) {
    this.group.visible = v;
    if (!v) {
      for (const el of this.labelEls) el.style.display = 'none';
    }
  }

  dispose() {
    for (const el of this.labelEls) el.remove();
  }
}
