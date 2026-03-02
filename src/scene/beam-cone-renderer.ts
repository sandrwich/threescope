import * as THREE from 'three';
import { DEG2RAD, DRAW_SCALE } from '../constants';
import { latLonToSurface } from '../astro/coordinates';

const CONE_SEGMENTS = 48;   // points around each ring
const CONE_RINGS = 6;       // rings along the beam (fade out)
const CONE_LINES = 8;       // radial edge lines
const CONE_LENGTH_KM = 42000; // lines extend to GEO orbit distance
const FILL_FRACTION = 0.15;   // fill only covers first 15% of cone length

// Color: amber #ffcc33 = (1.0, 0.8, 0.2)
const CR = 1.0, CG = 0.8, CB = 0.2;

export class BeamConeRenderer {
  private coneGroup: THREE.Group;

  // Rings at different distances (each a LineLoop)
  private rings: THREE.LineLoop[] = [];
  private ringAttrs: THREE.BufferAttribute[] = [];

  // Radial lines with vertex colors for fade
  private radialLines: THREE.LineSegments;
  private radialPosAttr: THREE.BufferAttribute;
  private radialColAttr: THREE.BufferAttribute;

  // Translucent fill with vertex alpha
  private fillMesh: THREE.Mesh;
  private fillPosAttr: THREE.BufferAttribute;
  private fillColAttr: THREE.BufferAttribute;

  constructor(scene: THREE.Scene) {
    this.coneGroup = new THREE.Group();

    // Create rings at fractional distances along the cone
    for (let ri = 0; ri < CONE_RINGS; ri++) {
      const pos = new Float32Array(CONE_SEGMENTS * 3);
      const attr = new THREE.BufferAttribute(pos, 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', attr);
      // Opacity falls off steeply with distance
      const t = (ri + 1) / CONE_RINGS;
      const opacity = 0.45 * Math.pow(1 - t, 1.5);
      const ring = new THREE.LineLoop(geo,
        new THREE.LineBasicMaterial({ color: 0xffcc33, transparent: true, opacity, depthWrite: false }),
      );
      ring.frustumCulled = false;
      this.rings.push(ring);
      this.ringAttrs.push(attr);
      this.coneGroup.add(ring);
    }

    // Radial lines with vertex colors (alpha fades from apex to base)
    const radVerts = CONE_LINES * 2;
    const radPos = new Float32Array(radVerts * 3);
    const radCol = new Float32Array(radVerts * 4);
    this.radialPosAttr = new THREE.BufferAttribute(radPos, 3);
    this.radialPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.radialColAttr = new THREE.Float32BufferAttribute(radCol, 4);
    this.radialColAttr.setUsage(THREE.DynamicDrawUsage);
    const radGeo = new THREE.BufferGeometry();
    radGeo.setAttribute('position', this.radialPosAttr);
    radGeo.setAttribute('color', this.radialColAttr);
    this.radialLines = new THREE.LineSegments(radGeo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }),
    );
    this.radialLines.frustumCulled = false;
    this.coneGroup.add(this.radialLines);

    // Translucent fill with vertex alpha (bright at apex, transparent at base)
    const fillVerts = CONE_SEGMENTS * 3;
    const fillPos = new Float32Array(fillVerts * 3);
    const fillCol = new Float32Array(fillVerts * 4);
    this.fillPosAttr = new THREE.BufferAttribute(fillPos, 3);
    this.fillPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.fillColAttr = new THREE.Float32BufferAttribute(fillCol, 4);
    this.fillColAttr.setUsage(THREE.DynamicDrawUsage);
    const fillGeo = new THREE.BufferGeometry();
    fillGeo.setAttribute('position', this.fillPosAttr);
    fillGeo.setAttribute('color', this.fillColAttr);
    this.fillMesh = new THREE.Mesh(fillGeo,
      new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    this.fillMesh.frustumCulled = false;
    this.coneGroup.add(this.fillMesh);

    this.coneGroup.visible = false;
    scene.add(this.coneGroup);
  }

  update(
    obsLat: number, obsLon: number,
    gmstDeg: number, earthOffset: number,
    aimAz: number, aimEl: number, beamWidth: number,
    visible: boolean, rangeKm?: number | null,
  ) {
    if (!visible) { this.coneGroup.visible = false; return; }
    this.coneGroup.visible = true;

    const obsPos = latLonToSurface(obsLat, obsLon, gmstDeg, earthOffset);

    // Local ENU basis
    const up = obsPos.clone().normalize();
    const globalUp = new THREE.Vector3(0, 1, 0);
    const east = new THREE.Vector3().crossVectors(globalUp, up);
    if (east.lengthSq() < 1e-10) east.set(1, 0, 0);
    east.normalize();
    const north = new THREE.Vector3().crossVectors(up, east).normalize();

    // Beam direction
    const azRad = aimAz * DEG2RAD;
    const elRad = aimEl * DEG2RAD;
    const cosEl = Math.cos(elRad);
    const beamDir = new THREE.Vector3()
      .addScaledVector(north, cosEl * Math.cos(azRad))
      .addScaledVector(east, cosEl * Math.sin(azRad))
      .addScaledVector(up, Math.sin(elRad))
      .normalize();

    const lengthKm = (rangeKm && rangeKm > 0) ? rangeKm : CONE_LENGTH_KM;
    const coneLen = lengthKm / DRAW_SCALE;
    const halfAngle = (beamWidth / 2) * DEG2RAD;

    const apex = obsPos.clone().addScaledVector(up, 0.005);

    // Perpendicular basis for circles
    const basisU = new THREE.Vector3();
    const basisV = new THREE.Vector3();
    if (Math.abs(beamDir.dot(globalUp)) > 0.99) {
      basisU.crossVectors(new THREE.Vector3(1, 0, 0), beamDir).normalize();
    } else {
      basisU.crossVectors(globalUp, beamDir).normalize();
    }
    basisV.crossVectors(beamDir, basisU);

    // Helper: compute ring points at a distance fraction t along the cone
    const computeRing = (arr: Float32Array, t: number) => {
      const dist = coneLen * t;
      const radius = dist * Math.tan(halfAngle);
      const cx = apex.x + beamDir.x * dist;
      const cy = apex.y + beamDir.y * dist;
      const cz = apex.z + beamDir.z * dist;
      for (let i = 0; i < CONE_SEGMENTS; i++) {
        const angle = (2 * Math.PI * i) / CONE_SEGMENTS;
        const cosA = Math.cos(angle), sinA = Math.sin(angle);
        arr[i * 3]     = cx + radius * (cosA * basisU.x + sinA * basisV.x);
        arr[i * 3 + 1] = cy + radius * (cosA * basisU.y + sinA * basisV.y);
        arr[i * 3 + 2] = cz + radius * (cosA * basisU.z + sinA * basisV.z);
      }
    };

    // Update rings
    for (let ri = 0; ri < CONE_RINGS; ri++) {
      const t = (ri + 1) / CONE_RINGS;
      computeRing(this.ringAttrs[ri].array as Float32Array, t);
      this.ringAttrs[ri].needsUpdate = true;
    }

    // Radial lines (apex → outermost base, with vertex color fade)
    const lastRingArr = this.ringAttrs[CONE_RINGS - 1].array as Float32Array;
    const radPos = this.radialPosAttr.array as Float32Array;
    const radCol = this.radialColAttr.array as Float32Array;
    for (let i = 0; i < CONE_LINES; i++) {
      const baseIdx = Math.floor((i / CONE_LINES) * CONE_SEGMENTS);
      const off = i * 6;
      // Apex vertex
      radPos[off]     = apex.x;  radPos[off + 1] = apex.y;  radPos[off + 2] = apex.z;
      // Base vertex
      radPos[off + 3] = lastRingArr[baseIdx * 3];
      radPos[off + 4] = lastRingArr[baseIdx * 3 + 1];
      radPos[off + 5] = lastRingArr[baseIdx * 3 + 2];
      // Colors: apex bright, base transparent
      const co = i * 8;
      radCol[co]     = CR; radCol[co + 1] = CG; radCol[co + 2] = CB; radCol[co + 3] = 0.4;  // apex
      radCol[co + 4] = CR; radCol[co + 5] = CG; radCol[co + 6] = CB; radCol[co + 7] = 0.0;  // base
    }
    this.radialPosAttr.needsUpdate = true;
    this.radialColAttr.needsUpdate = true;

    // Fill triangles — short cone (first 15%), fades out quickly
    const fillDist = coneLen * FILL_FRACTION;
    const fillRadius = fillDist * Math.tan(halfAngle);
    const fillCx = apex.x + beamDir.x * fillDist;
    const fillCy = apex.y + beamDir.y * fillDist;
    const fillCz = apex.z + beamDir.z * fillDist;
    const fillPos = this.fillPosAttr.array as Float32Array;
    const fillCol = this.fillColAttr.array as Float32Array;
    for (let i = 0; i < CONE_SEGMENTS; i++) {
      const next = (i + 1) % CONE_SEGMENTS;
      const angle0 = (2 * Math.PI * i) / CONE_SEGMENTS;
      const angle1 = (2 * Math.PI * next) / CONE_SEGMENTS;
      const po = i * 9;
      // Apex
      fillPos[po]     = apex.x;  fillPos[po + 1] = apex.y;  fillPos[po + 2] = apex.z;
      // Base vertex i
      fillPos[po + 3] = fillCx + fillRadius * (Math.cos(angle0) * basisU.x + Math.sin(angle0) * basisV.x);
      fillPos[po + 4] = fillCy + fillRadius * (Math.cos(angle0) * basisU.y + Math.sin(angle0) * basisV.y);
      fillPos[po + 5] = fillCz + fillRadius * (Math.cos(angle0) * basisU.z + Math.sin(angle0) * basisV.z);
      // Base vertex next
      fillPos[po + 6] = fillCx + fillRadius * (Math.cos(angle1) * basisU.x + Math.sin(angle1) * basisV.x);
      fillPos[po + 7] = fillCy + fillRadius * (Math.cos(angle1) * basisU.y + Math.sin(angle1) * basisV.y);
      fillPos[po + 8] = fillCz + fillRadius * (Math.cos(angle1) * basisU.z + Math.sin(angle1) * basisV.z);
      // Colors: apex visible, base edge transparent
      const co = i * 12;
      fillCol[co]      = CR; fillCol[co + 1]  = CG; fillCol[co + 2]  = CB; fillCol[co + 3]  = 0.06;
      fillCol[co + 4]  = CR; fillCol[co + 5]  = CG; fillCol[co + 6]  = CB; fillCol[co + 7]  = 0.0;
      fillCol[co + 8]  = CR; fillCol[co + 9]  = CG; fillCol[co + 10] = CB; fillCol[co + 11] = 0.0;
    }
    this.fillPosAttr.needsUpdate = true;
    this.fillColAttr.needsUpdate = true;
  }

  hide() {
    this.coneGroup.visible = false;
  }
}
