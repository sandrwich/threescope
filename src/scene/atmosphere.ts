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
  // Flip normal for BackSide rendering
  float NdotV = clamp(dot(-vWorldNormal, vViewDir), 0.0, 1.0);
  float NdotL = dot(vWorldNormal, sunDir);
  float fresnel = pow(1.0 - NdotV, 3.5);

  float sunBlend = smoothstep(-0.3, 0.3, NdotL);
  float brightness = mix(0.15, 1.0, sunBlend);
  float VdotL = dot(vViewDir, sunDir);

  // Sunset shift near terminator
  vec3 dayColor = vec3(0.25, 0.58, 1.0);
  vec3 sunsetColor = vec3(1.0, 0.5, 0.2);
  float sunsetBlend = smoothstep(0.35, -0.15, NdotL);
  vec3 atmosColor = mix(dayColor, sunsetColor, sunsetBlend);

  // Limb whitening — thicker atmosphere at edges shifts toward blue-white
  atmosColor = mix(atmosColor, vec3(0.7, 0.85, 1.0), pow(fresnel, 1.5) * 0.7);

  // Forward-scatter glow when looking toward the sun through the limb
  float forwardGlow = pow(max(VdotL, 0.0), 8.0) * 0.15;
  atmosColor += vec3(1.0, 0.6, 0.3) * forwardGlow * sunBlend;

  // Smooth fadeout into vacuum at the absolute edge
  float vacuumFade = smoothstep(0.0, 0.25, NdotV);

  vec3 color = atmosColor * brightness * atmosphereStrength;
  float alpha = fresnel * vacuumFade * brightness * 2.0;
  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
}
`;

export class Atmosphere {
  mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private radius: number;

  constructor() {
    const radius = (EARTH_RADIUS_KM + 80.0) / DRAW_SCALE;
    this.radius = radius;
    const geometry = new THREE.SphereGeometry(radius, 128, 128);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
        atmosphereStrength: { value: 5.0 },
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

  setBloomEnabled(on: boolean) {
    this.material.uniforms.atmosphereStrength.value = on ? 5.0 : 1.0;
  }

  setSphereDetail(segments: number) {
    const oldGeo = this.mesh.geometry;
    this.mesh.geometry = new THREE.SphereGeometry(this.radius, segments, segments);
    oldGeo.dispose();
  }

  setScale(s: number) {
    this.mesh.scale.setScalar(s);
  }
}
