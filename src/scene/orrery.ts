import * as THREE from 'three';
import { PLANETS, type PlanetDef } from '../bodies';

const PLANET_VERT = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PLANET_FRAG = `
uniform sampler2D map;
varying vec2 vUv;

void main() {
  gl_FragColor = vec4(texture2D(map, vUv).rgb, 1.0);
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
      { id: 'sun', name: 'Sun', thumb: '/textures/planets/thumb/sun.webp', color: 0xffdd55, planetDef: PLANETS.find(p => p.id === 'sun') },
      { id: 'mercury', name: 'Mercury', thumb: '/textures/planets/thumb/mercury.webp', color: 0x999999, planetDef: PLANETS.find(p => p.id === 'mercury') },
      { id: 'venus', name: 'Venus', thumb: '/textures/planets/thumb/venus.webp', color: 0xddaa55, planetDef: PLANETS.find(p => p.id === 'venus') },
      { id: 'earth', name: 'Earth', thumb: '/textures/planets/thumb/earth.webp', color: 0x4488cc },
      { id: 'moon', name: 'Moon', thumb: '/textures/planets/thumb/moon.webp', color: 0xaaaaaa },
      { id: 'mars', name: 'Mars', thumb: '/textures/planets/thumb/mars.webp', color: 0xcc5533, planetDef: PLANETS.find(p => p.id === 'mars') },
      { id: 'jupiter', name: 'Jupiter', thumb: '/textures/planets/thumb/jupiter.webp', color: 0xccaa77, planetDef: PLANETS.find(p => p.id === 'jupiter') },
      { id: 'saturn', name: 'Saturn', thumb: '/textures/planets/thumb/saturn.webp', color: 0xddcc88, planetDef: PLANETS.find(p => p.id === 'saturn') },
      { id: 'uranus', name: 'Uranus', thumb: '/textures/planets/thumb/uranus.webp', color: 0x88ccdd, planetDef: PLANETS.find(p => p.id === 'uranus') },
      { id: 'neptune', name: 'Neptune', thumb: '/textures/planets/thumb/neptune.webp', color: 0x4466cc, planetDef: PLANETS.find(p => p.id === 'neptune') },
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

    // Just show the full texture — no sun shading needed for a standalone planet view
    const material = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex } },
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
    });

    oldMat.dispose();
    body.mesh.material = material;

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
