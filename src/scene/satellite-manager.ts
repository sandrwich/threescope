import * as THREE from 'three';
import type { Satellite } from '../types';
import { DRAW_SCALE, EARTH_RADIUS_KM } from '../constants';
import { parseHexColor } from '../config';
import { calculatePosition } from '../astro/propagator';

export class SatelliteManager {
  points: THREE.Points;
  private posAttr: THREE.BufferAttribute;
  private colorAttr: THREE.BufferAttribute;
  private alphaAttr: THREE.BufferAttribute;
  private maxSats: number;

  constructor(satTexture: THREE.Texture, maxSats = 15000) {
    this.maxSats = maxSats;
    const positions = new Float32Array(maxSats * 3);
    const colors = new Float32Array(maxSats * 3);
    const alphas = new Float32Array(maxSats);

    const geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(positions, 3);
    this.colorAttr = new THREE.BufferAttribute(colors, 3);
    this.alphaAttr = new THREE.BufferAttribute(alphas, 1);
    geometry.setAttribute('position', this.posAttr);
    geometry.setAttribute('color', this.colorAttr);
    geometry.setAttribute('alpha', this.alphaAttr);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        pointTexture: { value: satTexture },
        pointSize: { value: 24.0 },
      },
      vertexShader: `
        attribute float alpha;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float pointSize;
        void main() {
          vColor = color;
          vAlpha = alpha;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = pointSize;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform sampler2D pointTexture;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 texel = texture2D(pointTexture, gl_PointCoord);
          if (texel.a < 0.1) discard;
          gl_FragColor = vec4(vColor * texel.rgb, texel.a * vAlpha);
        }
      `,
      transparent: true,
      depthTest: false,
      vertexColors: true,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
  }

  update(
    satellites: Satellite[],
    currentEpoch: number,
    cameraPos: THREE.Vector3,
    hoveredSat: Satellite | null,
    selectedSat: Satellite | null,
    unselectedFade: number,
    hideUnselected: boolean,
    colorConfig: { normal: string; highlighted: string; selected: string }
  ) {
    const earthRadius = EARTH_RADIUS_KM / DRAW_SCALE;
    const cNormal = parseHexColor(colorConfig.normal);
    const cHighlight = parseHexColor(colorConfig.highlighted);
    const cSelected = parseHexColor(colorConfig.selected);

    const count = Math.min(satellites.length, this.maxSats);
    const drawRange = this.points.geometry.drawRange;
    drawRange.count = count;

    for (let i = 0; i < count; i++) {
      const sat = satellites[i];
      sat.currentPos = calculatePosition(sat, currentEpoch);

      const dx = sat.currentPos.x / DRAW_SCALE;
      const dy = sat.currentPos.y / DRAW_SCALE;
      const dz = sat.currentPos.z / DRAW_SCALE;

      this.posAttr.array[i * 3] = dx;
      this.posAttr.array[i * 3 + 1] = dy;
      this.posAttr.array[i * 3 + 2] = dz;

      // Determine color
      let c = cNormal;
      if (sat === selectedSat) c = cSelected;
      else if (sat === hoveredSat) c = cHighlight;

      this.colorAttr.array[i * 3] = c.r;
      this.colorAttr.array[i * 3 + 1] = c.g;
      this.colorAttr.array[i * 3 + 2] = c.b;

      // Alpha: handle occlusion + fade
      const isUnselected = selectedSat !== null && sat !== selectedSat;
      let alpha = isUnselected ? unselectedFade : c.a;
      if (alpha <= 0) {
        this.alphaAttr.array[i] = 0;
        continue;
      }

      // Earth occlusion check
      if (this.isOccludedByEarth(cameraPos, dx, dy, dz, earthRadius)) {
        alpha = 0;
      }

      this.alphaAttr.array[i] = alpha;
    }

    this.posAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }

  private isOccludedByEarth(camPos: THREE.Vector3, tx: number, ty: number, tz: number, earthRadius: number): boolean {
    const vx = tx - camPos.x, vy = ty - camPos.y, vz = tz - camPos.z;
    const L = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (L === 0) return false;
    const dx = vx / L, dy = vy / L, dz = vz / L;
    const t = -(camPos.x * dx + camPos.y * dy + camPos.z * dz);
    if (t > 0 && t < L) {
      const cx = camPos.x + dx * t;
      const cy = camPos.y + dy * t;
      const cz = camPos.z + dz * t;
      if (Math.sqrt(cx * cx + cy * cy + cz * cz) < earthRadius * 0.99) return true;
    }
    return false;
  }
}
