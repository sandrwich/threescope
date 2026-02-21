import * as THREE from 'three';
import { MOON_RADIUS_KM, DRAW_SCALE } from '../constants';
import { calculateMoonPosition } from '../astro/moon';

const MOON_VERT = `
varying vec3 vWorldNormal;
varying vec2 vUv;

void main() {
  vUv = uv;
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const MOON_FRAG = `
uniform sampler2D map;
uniform vec3 sunDir;
uniform float showNight;

varying vec3 vWorldNormal;
varying vec2 vUv;

void main() {
  vec3 tex = texture2D(map, vUv).rgb;
  vec3 N = normalize(vWorldNormal);

  // Diffuse sun lighting (only when night mode is on)
  float NdotL = dot(N, sunDir);
  float diffuse = smoothstep(-0.02, 0.15, NdotL);
  diffuse = mix(1.0, diffuse, showNight);

  vec3 color = tex * diffuse;

  // Earthshine: faint blue fill on the dark side
  float earthshine = max(0.0, -NdotL) * 0.015 * showNight;
  color += vec3(0.4, 0.5, 0.7) * earthshine;

  gl_FragColor = vec4(color, 1.0);
}
`;

export class MoonScene {
  mesh: THREE.Mesh;
  drawPos = new THREE.Vector3();
  private material: THREE.ShaderMaterial;

  constructor(moonTex: THREE.Texture) {
    const radius = MOON_RADIUS_KM / DRAW_SCALE;
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: moonTex },
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
        showNight: { value: 1.0 },
      },
      vertexShader: MOON_VERT,
      fragmentShader: MOON_FRAG,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
  }

  updateSunDir(sunDir: THREE.Vector3) {
    this.material.uniforms.sunDir.value.copy(sunDir);
  }

  setShowNight(show: boolean) {
    this.material.uniforms.showNight.value = show ? 1.0 : 0.0;
  }

  update(currentEpoch: number) {
    const moonPosKm = calculateMoonPosition(currentEpoch);
    this.drawPos.copy(moonPosKm).divideScalar(DRAW_SCALE);
    this.mesh.position.copy(this.drawPos);

    // Tidal lock: moon always faces Earth (origin)
    const dirToEarth = this.drawPos.clone().negate().normalize();
    const yaw = Math.atan2(-dirToEarth.z, dirToEarth.x);
    const pitch = Math.asin(dirToEarth.y);

    const mZ = new THREE.Matrix4().makeRotationZ(pitch);
    const mY = new THREE.Matrix4().makeRotationY(yaw);
    this.mesh.matrix.copy(mZ.premultiply(mY));
    this.mesh.matrix.setPosition(this.drawPos);
    this.mesh.matrixAutoUpdate = false;
  }
}
