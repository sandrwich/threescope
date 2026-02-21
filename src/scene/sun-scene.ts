import * as THREE from 'three';
import { calculateSunPosition } from '../astro/sun';

const SUN_DISTANCE = 200; // draw units (beyond moon at ~128)
const SUN_DISC_SIZE = 1.8; // matches real angular diameter (~0.53 deg, same as moon)
const CORONA_SIZE = 12; // corona extends well beyond disc (visually prominent)

export class SunScene {
  readonly disc: THREE.Sprite;
  readonly corona: THREE.Sprite;

  constructor() {
    // Inner sun disc — bright white/yellow, sharp circle
    const discTex = this.makeDiscTexture(256);
    this.disc = new THREE.Sprite(new THREE.SpriteMaterial({
      map: discTex,
      depthWrite: false,
    }));
    this.disc.scale.set(SUN_DISC_SIZE, SUN_DISC_SIZE, 1);

    // Outer corona glow — soft radial falloff, additive blending
    const coronaTex = this.makeCoronaTexture(512);
    this.corona = new THREE.Sprite(new THREE.SpriteMaterial({
      map: coronaTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }));
    this.corona.scale.set(CORONA_SIZE, CORONA_SIZE, 1);
  }

  update(epoch: number) {
    const dir = calculateSunPosition(epoch);
    const pos = dir.multiplyScalar(SUN_DISTANCE);
    this.disc.position.copy(pos);
    this.corona.position.copy(pos);
  }

  private makeDiscTexture(size: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const half = size / 2;

    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0.0, '#ffffff');
    grad.addColorStop(0.6, '#fff8e0');
    grad.addColorStop(0.85, '#ffe080');
    grad.addColorStop(0.95, '#ff800020');
    grad.addColorStop(1.0, '#ff800000');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  private makeCoronaTexture(size: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const half = size / 2;

    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0.0, 'rgba(255, 240, 200, 0.5)');
    grad.addColorStop(0.1, 'rgba(255, 220, 150, 0.3)');
    grad.addColorStop(0.3, 'rgba(255, 180, 80, 0.12)');
    grad.addColorStop(0.6, 'rgba(255, 140, 40, 0.04)');
    grad.addColorStop(1.0, 'rgba(255, 100, 20, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }
}
