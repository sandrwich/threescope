import * as THREE from 'three';
import { PLANETS, type PlanetDef } from '../bodies';

const PLANET_VERT = `
uniform sampler2D displacementMap;
uniform float displacementScale;
uniform float hasDisplacement;

varying vec2 vUv;
varying vec3 vWorldNormal;

void main() {
  vUv = uv;
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

  vec3 pos = position;
  if (hasDisplacement > 0.5) {
    float height = texture2D(displacementMap, uv).r;
    pos += normal * height * displacementScale;
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const PLANET_FRAG = `
uniform sampler2D map;
uniform sampler2D displacementMap;
uniform vec3 sunDir;
uniform float bumpStrength;
uniform float aoEnabled;
uniform float showNight;
uniform float hasDisplacement;

varying vec2 vUv;
varying vec3 vWorldNormal;

const float TEX_STEP = 1.0 / 2048.0;
const float AO_STRENGTH = 8.0;

void main() {
  vec3 tex = texture2D(map, vUv).rgb;
  vec3 N = normalize(vWorldNormal);
  float ao = 1.0;

  if (hasDisplacement > 0.5) {
    float hC = texture2D(displacementMap, vUv).r;
    float hL = texture2D(displacementMap, vUv + vec2(-TEX_STEP, 0.0)).r;
    float hR = texture2D(displacementMap, vUv + vec2( TEX_STEP, 0.0)).r;
    float hD = texture2D(displacementMap, vUv + vec2(0.0, -TEX_STEP)).r;
    float hU = texture2D(displacementMap, vUv + vec2(0.0,  TEX_STEP)).r;

    // Bump normal
    if (bumpStrength > 0.01) {
      float len = length(N.xz);
      vec3 T = len > 0.001 ? vec3(-N.z, 0.0, N.x) / len : vec3(1.0, 0.0, 0.0);
      vec3 B = cross(N, T);
      N = normalize(N + bumpStrength * ((hR - hL) * T + (hU - hD) * B));
    }

    // Curvature AO: concave areas (crater floors) darken
    if (aoEnabled > 0.5) {
      float laplacian = (hL + hR + hD + hU) * 0.25 - hC;
      ao = clamp(1.0 - laplacian * AO_STRENGTH, 0.5, 1.0);
    }
  }

  // Diffuse sun lighting (only when night mode is on)
  float NdotL = dot(N, sunDir);
  float diffuse = smoothstep(-0.02, 0.15, NdotL);
  diffuse = mix(1.0, diffuse, showNight);

  vec3 color = tex * diffuse * ao;

  // Ambient fill on dark side
  color += tex * 0.03 * showNight;

  gl_FragColor = vec4(color, 1.0);
}
`;

export interface OrreryBody {
  id: string;
  name: string;
  mesh: THREE.Mesh;
  label: THREE.Sprite;
  x: number;
  drawRadius: number;
  planetDef?: PlanetDef;
  baseColor: number;
}

export interface PromotedPlanet {
  body: OrreryBody;
  material: THREE.ShaderMaterial;
  rotationSpeed: number;
}

const BODY_RADIUS = 3.0;
const GAP = 4.0;

export class Orrery {
  bodies: OrreryBody[] = [];
  group = new THREE.Group();
  totalSpan = 0;
  vertical = false;
  private promoted: PromotedPlanet | null = null;

  constructor(aspect: number) {
    this.vertical = aspect < 1;
    this.buildBodies();
  }

  private buildBodies() {
    const loader = new THREE.TextureLoader();

    const allBodies: { id: string; name: string; thumb: string; color: number; planetDef?: PlanetDef }[] = [
      { id: 'sun', name: 'Sun', thumb: '/textures/sun/thumb.webp', color: 0xffdd55, planetDef: PLANETS.find(p => p.id === 'sun') },
      { id: 'mercury', name: 'Mercury', thumb: '/textures/mercury/thumb.webp', color: 0x999999, planetDef: PLANETS.find(p => p.id === 'mercury') },
      { id: 'venus', name: 'Venus', thumb: '/textures/venus/thumb.webp', color: 0xddaa55, planetDef: PLANETS.find(p => p.id === 'venus') },
      { id: 'earth', name: 'Earth', thumb: '/textures/earth/thumb.webp', color: 0x4488cc },
      { id: 'moon', name: 'Moon', thumb: '/textures/moon/thumb.webp', color: 0xaaaaaa },
      { id: 'mars', name: 'Mars', thumb: '/textures/mars/thumb.webp', color: 0xcc5533, planetDef: PLANETS.find(p => p.id === 'mars') },
      { id: 'jupiter', name: 'Jupiter', thumb: '/textures/jupiter/thumb.webp', color: 0xccaa77, planetDef: PLANETS.find(p => p.id === 'jupiter') },
      { id: 'saturn', name: 'Saturn', thumb: '/textures/saturn/thumb.webp', color: 0xddcc88, planetDef: PLANETS.find(p => p.id === 'saturn') },
      { id: 'uranus', name: 'Uranus', thumb: '/textures/uranus/thumb.webp', color: 0x88ccdd, planetDef: PLANETS.find(p => p.id === 'uranus') },
      { id: 'neptune', name: 'Neptune', thumb: '/textures/neptune/thumb.webp', color: 0x4466cc, planetDef: PLANETS.find(p => p.id === 'neptune') },
    ];

    const step = BODY_RADIUS * 2 + GAP;

    for (let i = 0; i < allBodies.length; i++) {
      const b = allBodies[i];
      const pos = i * step;

      const geo = new THREE.SphereGeometry(BODY_RADIUS, 32, 32);
      const mat = new THREE.MeshBasicMaterial({ color: b.color });

      if (b.thumb) {
        loader.load(b.thumb, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          mat.map = tex; mat.color.setHex(0xffffff); mat.needsUpdate = true;
        });
      }

      const mesh = new THREE.Mesh(geo, mat);
      if (this.vertical) {
        mesh.position.y = -pos; // top to bottom
      } else {
        mesh.position.x = pos;
      }
      this.group.add(mesh);

      const label = this.makeLabel(b.name);
      if (this.vertical) {
        label.position.set(BODY_RADIUS + 4.5, -pos, 0);
        label.scale.set(9, 2.25, 1);
      } else {
        label.position.set(pos, -(BODY_RADIUS + 2.5), 0);
        label.scale.set(9, 2.25, 1);
      }
      this.group.add(label);

      this.bodies.push({ id: b.id, name: b.name, mesh, label, x: pos, drawRadius: BODY_RADIUS, planetDef: b.planetDef, baseColor: b.color });
    }

    // Center the group
    this.totalSpan = (allBodies.length - 1) * step;
    if (this.vertical) {
      this.group.position.y = this.totalSpan / 2;
    } else {
      this.group.position.x = -this.totalSpan / 2;
    }
  }

  private makeLabel(text: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#cccccc';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 40);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    return new THREE.Sprite(mat);
  }

  private hoveredBody: OrreryBody | null = null;

  update() {
    const t = performance.now() * 0.001;
    for (const body of this.bodies) {
      if (this.promoted && body === this.promoted.body) continue;
      body.mesh.rotation.y = t * 0.3;
    }
  }

  /** Raycast hover detection — returns hovered body and applies highlight */
  updateHover(raycaster: THREE.Raycaster): OrreryBody | null {
    if (this.promoted) return null;
    const meshes = this.bodies.map(b => b.mesh);
    const hits = raycaster.intersectObjects(meshes);
    const hit = hits.length > 0 ? this.bodies.find(b => b.mesh === hits[0].object) || null : null;

    if (hit !== this.hoveredBody) {
      // Restore previous
      if (this.hoveredBody) {
        const mat = this.hoveredBody.mesh.material as THREE.MeshBasicMaterial;
        if (mat.map) mat.color.setHex(0xffffff);
        else mat.color.setHex(this.hoveredBody.baseColor);
        this.hoveredBody.label.material.opacity = 1.0;
      }
      // Highlight new
      if (hit) {
        const mat = hit.mesh.material as THREE.MeshBasicMaterial;
        if (mat.map) mat.color.setRGB(1.4, 1.4, 1.4);
        else mat.color.setHex(0xffffff);
        hit.label.material.opacity = 1.0;
      }
      this.hoveredBody = hit;
    }
    return hit;
  }

  focusBody(id: string) {
    for (const body of this.bodies) {
      const keep = body.id === id;
      body.mesh.visible = keep;
      body.label.visible = keep;
    }
  }

  /** Upgrade a body's material to textured shader for planet view */
  promoteBody(id: string): PromotedPlanet | null {
    const body = this.bodies.find(b => b.id === id);
    if (!body || !body.planetDef) return null;

    body.label.visible = false;

    const oldMat = body.mesh.material as THREE.MeshBasicMaterial;
    const tex = oldMat.map;

    // Upgrade geometry for displacement (256x256 segments for smooth displaced surface)
    const hasDisplacement = body.planetDef.displacementScale > 0;
    if (hasDisplacement) {
      const oldGeo = body.mesh.geometry;
      body.mesh.geometry = new THREE.SphereGeometry(BODY_RADIUS, 256, 256);
      oldGeo.dispose();
    }

    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: tex },
        displacementMap: { value: null },
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
        bumpStrength: { value: body.planetDef.bumpStrength },
        aoEnabled: { value: 1.0 },
        showNight: { value: 1.0 },
        displacementScale: { value: body.planetDef.displacementScale },
        hasDisplacement: { value: 0.0 },
      },
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
    });

    oldMat.dispose();
    body.mesh.material = material;

    // Load displacement map asynchronously
    if (hasDisplacement && body.planetDef.displacementMapUrl) {
      new THREE.TextureLoader().load(body.planetDef.displacementMapUrl, (dispTex) => {
        dispTex.colorSpace = THREE.NoColorSpace;
        material.uniforms.displacementMap.value = dispTex;
        material.uniforms.hasDisplacement.value = 1.0;
      });
    }

    const rotationSpeed = (2 * Math.PI) / (body.planetDef.rotationPeriodH * 3600);
    this.promoted = { body, material, rotationSpeed };
    return this.promoted;
  }

  getBodyPosition(id: string): THREE.Vector3 | null {
    const body = this.bodies.find(b => b.id === id);
    if (!body) return null;
    if (this.vertical) {
      return new THREE.Vector3(0, -body.x + this.group.position.y, 0);
    }
    return new THREE.Vector3(body.x + this.group.position.x, 0, 0);
  }

  getBodyDrawRadius(id: string): number {
    return this.bodies.find(b => b.id === id)?.drawRadius ?? BODY_RADIUS;
  }

  pick(raycaster: THREE.Raycaster): OrreryBody | null {
    const meshes = this.bodies.map(b => b.mesh);
    const hits = raycaster.intersectObjects(meshes);
    if (hits.length > 0) {
      return this.bodies.find(b => b.mesh === hits[0].object) || null;
    }
    return null;
  }

  dispose() {
    for (const body of this.bodies) {
      body.mesh.geometry.dispose();
      const meshMat = body.mesh.material as THREE.MeshBasicMaterial | THREE.ShaderMaterial;
      if ('map' in meshMat && meshMat.map) meshMat.map.dispose();
      meshMat.dispose();
      const spriteMat = body.label.material as THREE.SpriteMaterial;
      if (spriteMat.map) spriteMat.map.dispose();
      spriteMat.dispose();
    }
    this.group.clear();
    this.promoted = null;
  }
}
