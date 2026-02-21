import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export class PostProcessing {
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private smaaPass: SMAAPass;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    // Half-resolution bloom for performance
    const w = Math.round(window.innerWidth / 2);
    const h = Math.round(window.innerHeight / 2);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      0.8,   // strength
      0.4,   // radius
      0.95   // threshold
    );
    this.composer.addPass(this.bloomPass);

    // SMAA antialiasing (EffectComposer bypasses renderer MSAA)
    this.smaaPass = new SMAAPass(window.innerWidth, window.innerHeight);
    this.composer.addPass(this.smaaPass);

    this.composer.addPass(new OutputPass());
  }

  setSize(width: number, height: number) {
    this.composer.setSize(width, height);
    this.bloomPass.resolution.set(Math.round(width / 2), Math.round(height / 2));
    this.smaaPass.setSize(width, height);
  }

  setPixelRatio(ratio: number) {
    this.composer.setPixelRatio(ratio);
  }

  render() {
    this.composer.render();
  }

  get bloomStrength(): number { return this.bloomPass.strength; }
  set bloomStrength(v: number) { this.bloomPass.strength = v; }
  get bloomRadius(): number { return this.bloomPass.radius; }
  set bloomRadius(v: number) { this.bloomPass.radius = v; }
  get bloomThreshold(): number { return this.bloomPass.threshold; }
  set bloomThreshold(v: number) { this.bloomPass.threshold = v; }
}
