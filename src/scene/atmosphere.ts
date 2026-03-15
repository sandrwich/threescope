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
  float NdotV = clamp(dot(vWorldNormal, vViewDir), 0.0, 1.0);
  float NdotL = dot(vWorldNormal, sunDir);

  // Sharper fresnel — concentrates glow closer to the limb edge
  float fresnel = pow(1.0 - NdotV, 3.5);

  // Sun brightness: 15% on night side, 100% on day side (matches original range)
  float sunBlend = smoothstep(-0.3, 0.3, NdotL);
  float brightness = mix(0.15, 1.0, sunBlend);

  // Atmosphere base color with sunset shift near terminator
  vec3 dayColor = vec3(0.25, 0.58, 1.0);
  vec3 sunsetColor = vec3(0.9, 0.45, 0.35);
  float sunsetBlend = smoothstep(0.6, -0.25, NdotL);
  vec3 atmosColor = mix(dayColor, sunsetColor, sunsetBlend);

  // Forward-scatter glow: brighter when looking toward sun through the limb
  float VdotL = dot(vViewDir, sunDir);
  float forwardGlow = pow(max(VdotL, 0.0), 8.0) * 0.25;
  atmosColor += vec3(1.0, 0.6, 0.3) * forwardGlow * sunBlend;

  // HDR color for bloom (atmosphereStrength = 3.0 pushes values well above threshold)
  vec3 color = atmosColor * brightness * atmosphereStrength;
  float alpha = fresnel * brightness;

  gl_FragColor = vec4(color, alpha);
}
`;

export class Atmosphere {
  mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;

  constructor() {
    const radius = (EARTH_RADIUS_KM + 80.0) / DRAW_SCALE;
    const geometry = new THREE.SphereGeometry(radius, 128, 128);

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

  setScale(s: number) {
    this.mesh.scale.setScalar(s);
  }
}
