// Decals: small discs stuck to surfaces (bullet holes, scorch marks, splats), drawn as one
// instanced mesh. The oldest decal is reused once the pool is full.
import { InstancedMesh, Material } from './scene.js';
import { cylinder } from './geometry.js';
import { quat, mat4, vec3 } from './math.js';

export class Decals extends InstancedMesh {
  constructor({ max = 128, material = null, sides = 10 } = {}) {
    const geo = cylinder({ radiusTop: 0.5, radiusBottom: 0.5, height: 0.004, radialSegments: sides, heightSegments: 1, capTop: true, capBottom: false });
    super(geo, material || new Material({ name: 'Decal', color: '#16110d', roughness: 0.95 }), max, 'Decals');
    this.castShadow = false;
    this.next = 0; this.used = 0;
    const zero = mat4.fromRTS(mat4.create(), quat.create(), [0, -1000, 0], [0, 0, 0]);
    for (let i = 0; i < max; i++) this.instanceMatrices.set(zero, i * 16);
  }
  // point and normal in world space (the Decals node should sit at the scene root)
  add(point, normal, size = 0.05, spin = Math.random() * 360) {
    const n = vec3.normalize([0, 0, 0], normal);
    const q = quat.rotationTo(quat.create(), [0, 1, 0], n);
    quat.multiply(q, q, quat.fromEuler(quat.create(), 0, spin, 0));
    const p = [point[0] + n[0] * 0.003, point[1] + n[1] * 0.003, point[2] + n[2] * 0.003];
    this.setMatrixAt(this.next, mat4.fromRTS(mat4.create(), q, p, [size, 1, size * (0.85 + Math.random() * 0.3)]));
    this.next = (this.next + 1) % this.count; this.used = Math.min(this.count, this.used + 1);
  }
  clear() { const zero = mat4.fromRTS(mat4.create(), quat.create(), [0, -1000, 0], [0, 0, 0]); for (let i = 0; i < this.count; i++) this.instanceMatrices.set(zero, i * 16); this.instanceVersion++; this.used = 0; }
}
