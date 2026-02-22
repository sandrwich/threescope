import * as THREE from 'three';
import { EARTH_RADIUS_KM, DRAW_SCALE, DEG2RAD } from '../constants';
import { calculateSunPosition } from '../astro/sun';

import cloudVertSrc from '../shaders/cloud.vert.glsl?raw';
import cloudFragSrc from '../shaders/cloud.frag.glsl?raw';

export class CloudLayer {
  mesh: THREE.Mesh;
  private shaderMat: THREE.ShaderMaterial;
  private defaultMat: THREE.MeshBasicMaterial;
  private useNightLights = true;

  constructor(cloudTex: THREE.Texture) {
    const radius = (EARTH_RADIUS_KM + 25.0) / DRAW_SCALE;
    const geometry = new THREE.SphereGeometry(radius, 64, 64);

    this.shaderMat = new THREE.ShaderMaterial({
      uniforms: {
        cloudTexture: { value: cloudTex },
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
      },
      vertexShader: cloudVertSrc,
      fragmentShader: cloudFragSrc,
      transparent: true,
      depthWrite: false,
    });

    this.defaultMat = new THREE.MeshBasicMaterial({
      map: cloudTex,
      transparent: true,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geometry, this.shaderMat);
    this.mesh.visible = false;
  }

  setScale(s: number) {
    this.mesh.scale.setScalar(s);
  }

  update(currentEpoch: number, gmstDeg: number, earthOffset: number, showClouds: boolean, showNightLights: boolean) {
    this.mesh.visible = showClouds;
    if (!showClouds) return;

    // Cloud rotation: slower than Earth (96% speed, matching original's 0.04 offset factor)
    const cloudAngle = ((gmstDeg + earthOffset + currentEpoch * 360.0 * 0.04) % 360.0) * DEG2RAD;
    this.mesh.rotation.y = cloudAngle;

    if (showNightLights !== this.useNightLights) {
      this.useNightLights = showNightLights;
      this.mesh.material = showNightLights ? this.shaderMat : this.defaultMat;
    }

    if (showNightLights) {
      const sunEci = calculateSunPosition(currentEpoch);
      const sunCloudSpace = sunEci.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -cloudAngle);
      this.shaderMat.uniforms.sunDir.value.copy(sunCloudSpace);
    }
  }
}
