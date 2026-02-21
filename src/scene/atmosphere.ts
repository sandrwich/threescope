import * as THREE from 'three';
import { EARTH_RADIUS_KM, DRAW_SCALE } from '../constants';

const ATMO_VERT = `
varying vec3 vWorldNormal;
varying vec3 vViewDir;

void main() {
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const ATMO_FRAG = `
uniform vec3 sunDir;
uniform float atmosphereStrength;

varying vec3 vWorldNormal;
varying vec3 vViewDir;

void main() {
  // Fresnel: both vectors in world space
  float NdotV = clamp(dot(vWorldNormal, vViewDir), 0.0, 1.0);
  float fresnel = pow(1.0 - NdotV, 1.5);

  // Atmosphere color
  vec3 baseColor = vec3(0.3, 0.6, 1.0);

  // Sun lighting in world space (sunDir is in world/ECI space)
  float sunFacing = dot(vWorldNormal, sunDir);
  float sunBlend = smoothstep(-0.3, 0.3, sunFacing);
  float brightness = mix(0.15, 1.0, sunBlend);

  vec3 color = baseColor * brightness * atmosphereStrength;
  float alpha = fresnel * brightness;

  gl_FragColor = vec4(color, alpha);
}
`;

export class Atmosphere {
  mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;

  constructor() {
    const radius = (EARTH_RADIUS_KM + 80.0) / DRAW_SCALE;
    const geometry = new THREE.SphereGeometry(radius, 64, 64);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
        atmosphereStrength: { value: 3.0 },
      },
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
  }

  update(sunDir: THREE.Vector3) {
    this.material.uniforms.sunDir.value.copy(sunDir);
  }

  setVisible(visible: boolean) {
    this.mesh.visible = visible;
  }
}
