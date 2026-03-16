import * as THREE from 'three';
import { EARTH_RADIUS_KM, MOON_RADIUS_KM, DRAW_SCALE, DEG2RAD } from '../constants';
import { calculateSunPosition } from '../astro/sun';
import { calculateMoonPosition } from '../astro/moon';

import earthVertSrc from '../shaders/earth-daynight.vert.glsl?raw';
import earthFragSrc from '../shaders/earth-daynight.frag.glsl?raw';

const _yAxis = new THREE.Vector3(0, 1, 0);
const _tmpSun = new THREE.Vector3();
const _tmpView = new THREE.Vector3();

export class Earth {
  mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private normalMapLoaded = false;
  private bumpEnabled = true;
  private aoEnabledState = true;

  constructor(dayTex: THREE.Texture, nightTex: THREE.Texture, normalTex: THREE.Texture | null, displacementTex: THREE.Texture | null, cloudTex: THREE.Texture | null) {
    const radius = EARTH_RADIUS_KM / DRAW_SCALE;
    const geometry = this.genEarthGeometry(radius, 256, 256);

    this.normalMapLoaded = normalTex != null;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        dayTexture: { value: dayTex },
        nightTexture: { value: nightTex },
        normalMap: { value: normalTex },
        displacementMap: { value: displacementTex },
        cloudTexture: { value: cloudTex },
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
        moonPos: { value: new THREE.Vector3(0, 0, 0) },
        moonRadius: { value: MOON_RADIUS_KM },
        showNight: { value: 1.0 },
        nightEmission: { value: 1.0 },
        hasNormalMap: { value: normalTex ? 1.0 : 0.0 },
        aoEnabled: { value: 1.0 },
        displacementScale: { value: 0.007 },
        hasDisplacement: { value: displacementTex ? 1.0 : 0.0 },
        viewPos: { value: new THREE.Vector3() },
        cloudUVOffset: { value: 0.0 },
        showClouds: { value: 0.0 },
        showGlare: { value: 1.0 },
        showCloudShadows: { value: 1.0 },
        showRimScatter: { value: 1.0 },
      },
      vertexShader: earthVertSrc,
      fragmentShader: earthFragSrc,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
  }

  /**
   * Custom sphere with UV-aligned seam for day/night shader:
   * theta = (u - 0.5) * 2PI, phi = v * PI
   * x = cos(theta)*sin(phi), y = cos(phi), z = -sin(theta)*sin(phi)
   */
  private genEarthGeometry(radius: number, slices: number, rings: number): THREE.BufferGeometry {
    const vertexCount = (rings + 1) * (slices + 1);
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices: number[] = [];

    let idx = 0;
    for (let i = 0; i <= rings; i++) {
      const v = i / rings;
      const phi = v * Math.PI;
      for (let j = 0; j <= slices; j++) {
        const u = j / slices;
        const theta = (u - 0.5) * 2.0 * Math.PI;

        const x = Math.cos(theta) * Math.sin(phi);
        const y = Math.cos(phi);
        const z = -Math.sin(theta) * Math.sin(phi);

        positions[idx * 3] = x * radius;
        positions[idx * 3 + 1] = y * radius;
        positions[idx * 3 + 2] = z * radius;
        normals[idx * 3] = x;
        normals[idx * 3 + 1] = y;
        normals[idx * 3 + 2] = z;
        uvs[idx * 2] = u;
        uvs[idx * 2 + 1] = v;
        idx++;
      }
    }

    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < slices; j++) {
        const first = i * (slices + 1) + j;
        const second = first + slices + 1;
        indices.push(first, second, first + 1);
        indices.push(second, second + 1, first + 1);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    return geo;
  }

  update(currentEpoch: number, gmstDeg: number, earthOffset: number, showNightLights: boolean, showClouds: boolean, cameraPosition: THREE.Vector3) {
    const earthRotRad = (gmstDeg + earthOffset) * DEG2RAD;
    this.mesh.rotation.y = earthRotRad;
    this.material.uniforms.showNight.value = showNightLights ? 1.0 : 0.0;
    this.material.uniforms.showClouds.value = showClouds ? 1.0 : 0.0;

    const sunEci = calculateSunPosition(currentEpoch);
    _tmpSun.copy(sunEci).applyAxisAngle(_yAxis, -earthRotRad);
    this.material.uniforms.sunDir.value.copy(_tmpSun);

    // Moon position in ECEF for solar eclipse shadow
    const moonRender = calculateMoonPosition(currentEpoch);
    moonRender.applyAxisAngle(_yAxis, -earthRotRad);
    this.material.uniforms.moonPos.value.copy(moonRender);

    // View position in ECEF for specular
    _tmpView.copy(cameraPosition).applyAxisAngle(_yAxis, -earthRotRad);
    // Scale from draw units to km for the shader
    _tmpView.multiplyScalar(DRAW_SCALE);
    this.material.uniforms.viewPos.value.copy(_tmpView);

    // Cloud UV offset: difference between earth and cloud rotation in UV space
    const cloudAngle = ((gmstDeg + earthOffset + currentEpoch * 360.0 * 0.04) % 360.0) * DEG2RAD;
    const uvOffset = (earthRotRad - cloudAngle) / (2.0 * Math.PI);
    this.material.uniforms.cloudUVOffset.value = uvOffset;
  }

  setShowGlare(on: boolean) {
    this.material.uniforms.showGlare.value = on ? 1.0 : 0.0;
  }

  setShowCloudShadows(on: boolean) {
    this.material.uniforms.showCloudShadows.value = on ? 1.0 : 0.0;
  }

  setShowRimScatter(on: boolean) {
    this.material.uniforms.showRimScatter.value = on ? 1.0 : 0.0;
  }

  setNightEmission(value: number) {
    this.material.uniforms.nightEmission.value = value;
  }

  setDisplacementScale(value: number) {
    this.material.uniforms.displacementScale.value = value;
  }

  setBumpEnabled(on: boolean) {
    this.bumpEnabled = on;
    this.material.uniforms.hasNormalMap.value = (on && this.normalMapLoaded) ? 1.0 : 0.0;
  }

  setAOEnabled(on: boolean) {
    this.aoEnabledState = on;
    this.material.uniforms.aoEnabled.value = on ? 1.0 : 0.0;
  }

  setSphereDetail(segments: number) {
    const radius = EARTH_RADIUS_KM / DRAW_SCALE;
    const oldGeo = this.mesh.geometry;
    this.mesh.geometry = this.genEarthGeometry(radius, segments, segments);
    oldGeo.dispose();
  }
}
