// Voxel world for the Minecraft chapter, built on ShapeForge: chunk meshes are engine
// Geometry with a nearest-neighbour atlas texture; the player is an AABB walker that drives the
// engine Camera; block people, Verity's name tag and the first-person arm are engine Nodes.
import * as E from '../../src/engine/index.js';
import { quat } from '../../src/engine/math.js';
import { B, BLOCKS, ITEM_TILES, atlas, isSolid, isOpaque } from './blocks.js';
import { makeCanvas } from './textures.js';
import { Obj3 } from './stage.js';

export { B, BLOCKS, atlas, isSolid };
const DEG = 180 / Math.PI;

// ------------------------------------------------------------------ atlas as a texture
// The engine has no alpha-tested cutouts, so leaves and doors are filled in, and glass and
// water are drawn from separate translucent meshes.
const FILL = { 6: [44, 104, 32], 20: [86, 70, 30], 23: [120, 88, 50], 24: [120, 88, 50], 12: [150, 200, 215], 10: [40, 90, 210] };
let ATEX = null;
export function atlasTexture() {
  if (ATEX) return ATEX;
  const A = atlas(), c = makeCanvas(A.canvas.width, A.canvas.height), g = c.getContext('2d');
  g.drawImage(A.canvas, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data, S = A.S, N = A.N;
  for (const t in FILL) {
    const tile = +t, ox = (tile % N) * S, oy = Math.floor(tile / N) * S, f = FILL[t];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = ((oy + y) * c.width + ox + x) * 4;
      if (d[i + 3] < 250) { const a = d[i + 3] / 255; d[i] = f[0] * (1 - a) + d[i] * a; d[i + 1] = f[1] * (1 - a) + d[i + 1] * a; d[i + 2] = f[2] * (1 - a) + d[i + 2] * a; d[i + 3] = 255; }
    }
  }
  g.putImageData(img, 0, 0);
  ATEX = new E.Texture(c, { nearest: true, mipmaps: false, repeat: false, name: 'voxel-atlas' });
  return ATEX;
}
// atlas rectangle for a tile: engine textures are top-down (v = 0 is the first canvas row)
function tileRect(tile, N = 8, e = 0.02 / 16) {
  const tx = tile % N, ty = Math.floor(tile / N);
  return [tx / N + e, ty / N + e, (tx + 1) / N - e, (ty + 1) / N - e];
}

const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], k: 1 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], k: 1 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], k: 0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], k: 2 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], k: 1 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], k: 1 },
];

// ------------------------------------------------------------------ world
export class VoxelWorld {
  constructor(sx, sy, sz, scene) {
    this.sx = sx; this.sy = sy; this.sz = sz;
    this.data = new Uint8Array(sx * sy * sz);
    this.scene = scene;
    this.CS = 16;
    this.chunks = new Map();
    this.dirty = new Set();
    const map = atlasTexture();
    this.mat = new E.Material({ name: 'Blocks', color: '#ffffff', map, roughness: 1, metallic: 0 });
    this.waterMat = new E.Material({ name: 'Water', color: '#ffffff', map, roughness: 0.15, opacity: 0.72 });
    this.glassMat = new E.Material({ name: 'Glass blocks', color: '#ffffff', map, roughness: 0.1, opacity: 0.42 });
  }
  idx(x, y, z) { return (y * this.sz + z) * this.sx + x; }
  inside(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz; }
  get(x, y, z) { return this.inside(x, y, z) ? this.data[this.idx(x, y, z)] : (y < 0 ? B.BEDROCK : 0); }
  set(x, y, z, v, mark = true) {
    if (!this.inside(x, y, z)) return;
    this.data[this.idx(x, y, z)] = v;
    if (mark) {
      const cx = Math.floor(x / this.CS), cz = Math.floor(z / this.CS);
      this.dirty.add(cx + ',' + cz);
      if (x % this.CS === 0) this.dirty.add((cx - 1) + ',' + cz);
      if (x % this.CS === this.CS - 1) this.dirty.add((cx + 1) + ',' + cz);
      if (z % this.CS === 0) this.dirty.add(cx + ',' + (cz - 1));
      if (z % this.CS === this.CS - 1) this.dirty.add(cx + ',' + (cz + 1));
    }
  }
  topY(x, z) {
    for (let y = this.sy - 1; y >= 0; y--) { const id = this.get(x, y, z); if (id && id !== B.LEAVES && id !== B.DEADLEAVES && !BLOCKS[id]?.nonsolid) return y; }
    return 0;
  }
  buildAll() {
    for (let cx = 0; cx < this.sx / this.CS; cx++) for (let cz = 0; cz < this.sz / this.CS; cz++) this.buildChunk(cx, cz);
    this.dirty.clear();
  }
  update(max = 3) {
    let n = 0;
    for (const k of this.dirty) {
      const [cx, cz] = k.split(',').map(Number);
      this.dirty.delete(k);
      if (cx < 0 || cz < 0 || cx >= this.sx / this.CS || cz >= this.sz / this.CS) continue;
      this.buildChunk(cx, cz);
      if (++n >= max) break;
    }
  }
  buildChunk(cx, cz) {
    const key = cx + ',' + cz;
    const old = this.chunks.get(key);
    if (old) for (const m of old) this.scene.remove(m);
    const mk = () => ({ p: [], n: [], u: [], i: [] });
    const solid = mk(), water = mk(), glass = mk();
    const x0 = cx * this.CS, z0 = cz * this.CS;
    for (let y = 0; y < this.sy; y++) for (let z = z0; z < z0 + this.CS; z++) for (let x = x0; x < x0 + this.CS; x++) {
      const id = this.data[this.idx(x, y, z)];
      if (!id) continue;
      const def = BLOCKS[id];
      if (!def) continue;
      const liquid = !!def.liquid;
      for (const f of FACES) {
        const nid = this.get(x + f.n[0], y + f.n[1], z + f.n[2]);
        if (liquid) { if (nid === B.WATER || isOpaque(nid) || (f.n[1] !== 1 && nid !== 0)) continue; }
        else {
          if (isOpaque(nid)) continue;
          if (nid === id && def.cutout && id !== B.LEAVES && id !== B.DEADLEAVES) continue;
        }
        const buf = liquid ? water : id === B.GLASS ? glass : solid;
        const [u0, v0, u1, v1] = tileRect(def.tiles[f.k]);
        const base = buf.p.length / 3, top = liquid && f.n[1] === 1 ? -0.12 : 0;
        const uvs = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];
        for (let i = 0; i < 4; i++) {
          const c = f.c[i];
          buf.p.push(x + c[0], y + c[1] + (c[1] === 1 ? top : 0), z + c[2]);
          buf.n.push(f.n[0], f.n[1], f.n[2]);
          buf.u.push(uvs[i][0], uvs[i][1]);
        }
        buf.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const meshes = [];
    const add = (b, mat, shadow) => {
      if (!b.i.length) return;
      const m = new E.Mesh(new E.Geometry({ positions: b.p, normals: b.n, uvs: b.u, indices: b.i }), mat, 'Chunk ' + key);
      m.castShadow = shadow; m.receiveShadow = true;
      this.scene.add(m); meshes.push(m);
    };
    add(solid, this.mat, true); add(water, this.waterMat, false); add(glass, this.glassMat, false);
    this.chunks.set(key, meshes);
  }
  // DDA ray through the voxels. o, d: [x, y, z]
  raycast(o, d, max = 6) {
    let x = Math.floor(o[0]), y = Math.floor(o[1]), z = Math.floor(o[2]);
    const sx = Math.sign(d[0]), sy = Math.sign(d[1]), sz = Math.sign(d[2]);
    const tdx = sx ? Math.abs(1 / d[0]) : Infinity, tdy = sy ? Math.abs(1 / d[1]) : Infinity, tdz = sz ? Math.abs(1 / d[2]) : Infinity;
    let tmx = sx > 0 ? (x + 1 - o[0]) * tdx : sx < 0 ? (o[0] - x) * tdx : Infinity;
    let tmy = sy > 0 ? (y + 1 - o[1]) * tdy : sy < 0 ? (o[1] - y) * tdy : Infinity;
    let tmz = sz > 0 ? (z + 1 - o[2]) * tdz : sz < 0 ? (o[2] - z) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 64 && t <= max; i++) {
      const id = this.get(x, y, z);
      if (id && id !== B.WATER) return { x, y, z, id, nx, ny, nz, t };
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }
  dispose() {
    for (const ms of this.chunks.values()) for (const m of ms) this.scene.remove(m);
    this.chunks.clear();
  }
}

// ------------------------------------------------------------------ player
export class VoxelPlayer {
  constructor(game, world) {
    this.g = game; this.w = world;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0; this.pitch = 0;
    this.half = 0.3; this.height = 1.8; this.eye = 1.62;
    this.onGround = false;
    this.bob = 0; this.lastStep = 0;
    this.enabled = true; this.lookEnabled = true; this.speedMul = 1;
  }
  place(x, y, z, yaw = 0) { this.pos.x = x; this.pos.y = y; this.pos.z = z; this.vel.x = this.vel.y = this.vel.z = 0; this.yaw = yaw; this.pitch = 0; this.apply(0); }
  solidAt(x, y, z) { return isSolid(this.w.get(Math.floor(x), Math.floor(y), Math.floor(z))); }
  overlaps() {
    const p = this.pos, h = this.half;
    for (let x = Math.floor(p.x - h); x <= Math.floor(p.x + h - 1e-6); x++)
      for (let y = Math.floor(p.y); y <= Math.floor(p.y + this.height - 1e-6); y++)
        for (let z = Math.floor(p.z - h); z <= Math.floor(p.z + h - 1e-6); z++)
          if (isSolid(this.w.get(x, y, z))) return [x, y, z];
    return null;
  }
  moveAxis(axis, d) {
    if (!d) return false;
    this.pos[axis] += d;
    const hit = this.overlaps();
    if (!hit) return false;
    const [bx, by, bz] = hit;
    if (axis === 'x') this.pos.x = d > 0 ? bx - this.half - 1e-4 : bx + 1 + this.half + 1e-4;
    else if (axis === 'z') this.pos.z = d > 0 ? bz - this.half - 1e-4 : bz + 1 + this.half + 1e-4;
    else { this.pos.y = d > 0 ? by - this.height - 1e-4 : by + 1 + 1e-4; if (d < 0) this.onGround = true; }
    this.vel[axis] = 0;
    return true;
  }
  intersectsCell(x, y, z) {
    const p = this.pos, h = this.half;
    return p.x + h > x && p.x - h < x + 1 && p.y + this.height > y && p.y < y + 1 && p.z + h > z && p.z - h < z + 1;
  }
  apply(dt) {
    const cam = this.g.camera, by = this.onGround ? Math.sin(this.bob * 2) * 0.04 * Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 4) : 0;
    const px = this.pos.x, py = this.pos.y + this.eye + by, pz = this.pos.z, cp = Math.cos(this.pitch);
    cam.position[0] = px; cam.position[1] = py; cam.position[2] = pz;
    cam.target[0] = px - Math.sin(this.yaw) * cp; cam.target[1] = py + Math.sin(this.pitch); cam.target[2] = pz - Math.cos(this.yaw) * cp;
  }
  update(dt) {
    const g = this.g, inp = g.input;
    if (this.lookEnabled && !g.ui.choice && !g.paused) {
      const l = inp.look();
      this.yaw -= l.dx; this.pitch -= l.dy;
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));
    }
    let ax = { x: 0, y: 0 };
    const canMove = this.enabled && g.ui.blocking === 0 && !g.mc?.chatOpen;
    if (canMove) ax = inp.axis();
    const run = canMove && inp.isDown('run') && ax.y > 0.2;
    const speed = (run ? 5.6 : 4.3) * this.speedMul;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const tx = (fx * ax.y + rx * ax.x) * speed, tz = (fz * ax.y + rz * ax.x) * speed;
    const k = Math.min(1, dt * (this.onGround ? 12 : 3));
    this.vel.x += (tx - this.vel.x) * k; this.vel.z += (tz - this.vel.z) * k;
    this.vel.y -= 28 * dt;
    if (this.vel.y < -40) this.vel.y = -40;
    if (canMove && inp.isDown('jump') && this.onGround) { this.vel.y = 8.6; this.onGround = false; }
    const wasGround = this.onGround;
    this.onGround = false;
    const steps = Math.ceil(Math.max(Math.abs(this.vel.x), Math.abs(this.vel.y), Math.abs(this.vel.z)) * dt / 0.3) || 1;
    let bumped = false;
    for (let s = 0; s < steps; s++) {
      bumped = this.moveAxis('x', this.vel.x * dt / steps) || bumped;
      bumped = this.moveAxis('z', this.vel.z * dt / steps) || bumped;
      this.moveAxis('y', this.vel.y * dt / steps);
    }
    if (bumped && wasGround && (Math.abs(ax.x) + Math.abs(ax.y) > 0.1)) {
      const fxp = this.pos.x + Math.sign(tx) * 0.5, fzp = this.pos.z + Math.sign(tz) * 0.5;
      if (!this.solidAt(fxp, this.pos.y + 1.2, fzp) && !this.solidAt(this.pos.x, this.pos.y + 2.2, this.pos.z)) this.vel.y = 8.2;
    }
    if (this.pos.y < -20) { this.pos.y = this.w.topY(Math.floor(this.pos.x), Math.floor(this.pos.z)) + 2; this.vel.x = this.vel.y = this.vel.z = 0; }
    const hv = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hv > 0.5) {
      this.bob += dt * hv * 2.2;
      const ph = Math.floor(this.bob / Math.PI);
      if (ph !== this.lastStep) {
        this.lastStep = ph;
        const below = this.w.get(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.1), Math.floor(this.pos.z));
        g.audio.step(BLOCKS[below]?.surf || 'grass', 0.7);
      }
    }
    this.apply(dt);
  }
}

// ------------------------------------------------------------------ particles
// Block fragments and Verity sparks: the engine's particle system behind the old burst() call.
export class BlockParticles {
  constructor() { this.ps = new E.Particles(900, {}); this.ps.gravity = -26; this.ps.drag = 0.6; }
  burst(x, y, z, col, n = 10, speed = 3) {
    const c = typeof col === 'number' ? [((col >> 16) & 255) / 255, ((col >> 8) & 255) / 255, (col & 255) / 255] : Array.isArray(col) ? col : [col.r ?? 0.5, col.g ?? 0.5, col.b ?? 0.5];
    this.ps.emit([x + 0.5, y + 0.5, z + 0.5], { count: n * 2, color: [c[0], c[1], c[2], 1], colorEnd: [c[0], c[1], c[2], 0.9], size: 0.1, grow: 0.8, spread: speed * 0.5, up: speed, life: 0.9, jitter: 0.4 });
  }
  update(dt) { this.ps.update(dt); }
}

// ------------------------------------------------------------------ small meshes
export function blockMesh(id, size = 1) {
  const def = BLOCKS[id], order = [1, 1, 0, 2, 1, 1], P = [], Nn = [], U = [], I = [];
  FACES.forEach((f, fi) => {
    const [u0, v0, u1, v1] = tileRect(def.tiles[order[fi]]), base = P.length / 3, uvs = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];
    f.c.forEach((c, i) => { P.push((c[0] - 0.5) * size, (c[1] - 0.5) * size, (c[2] - 0.5) * size); Nn.push(...f.n); U.push(...uvs[i]); });
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return new E.Mesh(new E.Geometry({ positions: P, normals: Nn, uvs: U, indices: I }), new E.Material({ name: 'Held block', color: '#fff', map: atlasTexture(), roughness: 1 }), 'Held block');
}
const baguetteMat = () => new E.Material({ name: 'Baguette', color: '#c8924a', roughness: 0.8, pattern: 'fabric', patternScale: 40, patternColor: '#8a5a28' });
const diamondMat = () => new E.Material({ name: 'Diamond', color: '#5fe0e6', roughness: 0.15, metallic: 0.2, emissive: '#2ac0d0', emissiveStrength: 0.6 });
export function itemMesh(item) {
  if (item === 'baguette') return new E.Mesh(E.box({ width: 0.06, height: 0.06, depth: 0.34, bevel: 0.02 }), baguetteMat(), 'Baguette');
  return new E.Mesh(E.sphere({ radius: 0.07, widthSegments: 4, heightSegments: 3 }), diamondMat(), 'Diamond');
}

// the dark wireframe cube round the block you're looking at
export function makeOutline() {
  const n = new E.Node('Block outline'), m = new E.Material({ name: 'Outline', color: '#000000', roughness: 1, opacity: 0.55 }), t = 0.012;
  const bar = (x, y, z, w, h, d) => { const b = new E.Mesh(E.box({ width: w, height: h, depth: d }), m, 'edge'); b.position.set([x, y, z]); b.castShadow = false; n.add(b); };
  for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) bar(0, y, z, 1.01, t, t);
  for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) bar(x, 0, z, t, 1.01, t);
  for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) bar(x, y, 0, t, t, 1.01);
  return n;
}
export function makeCrack() {
  const mat = new E.Material({ name: 'Crack', color: '#000000', roughness: 1, opacity: 0.1 });
  const m = new E.Mesh(E.box({ width: 1.012, height: 1.012, depth: 1.012 }), mat, 'Crack');
  m.castShadow = false; m.userData.mat = mat;
  return m;
}

// ------------------------------------------------------------------ first-person arm
export function makeArm(scene) {
  const k = new E.Kit(E.archPalette());
  k.box(new E.Material({ name: 'Sleeve', color: '#4a4e56', roughness: 0.9, pattern: 'fabric', patternScale: 200, patternColor: '#2a2c30' }), [0, 0, 0.1], [0.16, 0.16, 0.5]);
  k.box(new E.Material({ name: 'Hand', color: '#d8a880', roughness: 0.6 }), [0, 0, -0.22], [0.155, 0.155, 0.16]);
  const node = new E.Node('Arm'), body = k.toNode('Arm mesh');
  node.add(body);
  const held = new E.Node('Held'); held.position.set([-0.02, 0.1, -0.34]); body.add(held);
  for (const m of body.children) m.castShadow = false;
  scene.add(node);
  const qy = quat.create(), qx = quat.create(), ql = quat.create(), tmp = quat.create();
  const arm = {
    node, swing: 0, item: undefined, mesh: null,
    setItem(item) {
      if (this.item === item) return;
      this.item = item;
      if (this.mesh) held.remove(this.mesh);
      this.mesh = null;
      if (item === null || item === undefined) return;
      const m = typeof item === 'string' ? itemMesh(item) : blockMesh(item, 0.2);
      m.castShadow = false;
      m.setEuler(17, 40, 0);
      held.add(m); this.mesh = m;
    },
    update(dt, moving, t, cam) {
      this.swing = Math.max(0, this.swing - dt * 4);
      const s = Math.sin(this.swing * Math.PI);
      let f = [cam.target[0] - cam.position[0], cam.target[1] - cam.position[1], cam.target[2] - cam.position[2]];
      const fl = Math.hypot(...f) || 1; f = f.map((v) => v / fl);
      const yaw = Math.atan2(-f[0], -f[2]), pitch = Math.asin(Math.max(-1, Math.min(1, f[1])));
      const r = [Math.cos(yaw), 0, -Math.sin(yaw)], u = [-Math.sin(pitch) * -Math.sin(yaw) * -1, Math.cos(pitch), 0];
      // up vector = r x f
      u[0] = r[1] * f[2] - r[2] * f[1]; u[1] = r[2] * f[0] - r[0] * f[2]; u[2] = r[0] * f[1] - r[1] * f[0];
      const rx = 0.34 + Math.sin(t * 7) * 0.012 * moving, ry = -0.32 + Math.abs(Math.cos(t * 7)) * 0.015 * moving - s * 0.08, rf = 0.55 + s * 0.05;
      node.position.set([cam.position[0] + r[0] * rx + u[0] * ry + f[0] * rf, cam.position[1] + r[1] * rx + u[1] * ry + f[1] * rf, cam.position[2] + r[2] * rx + u[2] * ry + f[2] * rf]);
      quat.fromEuler(qy, 0, yaw * DEG, 0); quat.fromEuler(qx, pitch * DEG, 0, 0);
      quat.fromEuler(ql, (0.1 - s * 0.9) * DEG, (-0.25 + s * 0.3) * DEG, 0.1 * DEG);
      quat.multiply(tmp, qy, qx); quat.multiply(node.rotation, tmp, ql);
    },
    set visible(v) { node.visible = v; },
  };
  return arm;
}

// ------------------------------------------------------------------ block people
// A blocky avatar: 4 boxes' worth of limbs sharing one skin atlas (6 faces x 4 parts of 8x8).
const PART_ROW = { head: 0, body: 1, arm: 2, leg: 3 };
export function blockSkin(hair, shirt, pants, face = 'normal') {
  const c = makeCanvas(48, 32), g = c.getContext('2d'), skin = '#e0b48c';
  const tile = (part, f, draw) => { g.save(); g.translate(f * 8, PART_ROW[part] * 8); g.beginPath(); g.rect(0, 0, 8, 8); g.clip(); draw(); g.restore(); };
  const fill = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  // faces: px, nx, py, ny, pz (front), nz (back)
  const headSide = () => { fill(skin, 0, 0, 8, 8); fill(hair, 0, 0, 8, 3); fill(hair, 0, 0, 3, 6); };
  tile('head', 0, headSide); tile('head', 1, headSide);
  tile('head', 2, () => fill(hair, 0, 0, 8, 8)); tile('head', 3, () => fill(skin, 0, 0, 8, 8));
  tile('head', 4, () => {
    fill(skin, 0, 0, 8, 8); fill(hair, 0, 0, 8, 2); fill(hair, 0, 2, 1, 2); fill(hair, 7, 2, 1, 2);
    fill('#fff', 1, 4, 2, 1); fill('#fff', 5, 4, 2, 1); fill('#111', 2, 4, 1, 1); fill('#111', 5, 4, 1, 1); fill('#8a4a3a', 3, 6, 2, 1);
    if (face === 'blank') fill(skin, 1, 4, 6, 3);
  });
  tile('head', 5, () => fill(hair, 0, 0, 8, 7));
  for (const f of [0, 1, 2, 3, 5]) tile('body', f, () => fill(shirt, 0, 0, 8, 8));
  tile('body', 4, () => { fill(shirt, 0, 0, 8, 8); if (shirt === '#4f9a3f') { fill('#1a2a14', 2, 1, 1, 1); fill('#1a2a14', 5, 1, 1, 1); fill('#1a2a14', 3, 3, 2, 2); fill('#1a2a14', 2, 4, 1, 2); fill('#1a2a14', 5, 4, 1, 2); } });
  for (const f of [0, 1, 3, 4, 5]) tile('arm', f, () => { fill(shirt, 0, 0, 8, 8); fill(skin, 0, 6, 8, 2); });
  tile('arm', 2, () => fill(shirt, 0, 0, 8, 8));
  for (let f = 0; f < 6; f++) tile('leg', f, () => { fill(pants, 0, 0, 8, 8); fill('#ddd', 0, 7, 8, 1); });
  return c;
}
function partMesh(part, w, h, d, mat, pivotY) {
  const P = [], Nn = [], U = [], I = [], row = PART_ROW[part];
  FACES.forEach((f, fi) => {
    const tx = fi, ty = row, base = P.length / 3, e = 0.02 / 8;
    const u0 = tx / 6 + e / 6, u1 = (tx + 1) / 6 - e / 6, v0 = ty / 4 + e / 4, v1 = (ty + 1) / 4 - e / 4;
    const uvs = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];
    f.c.forEach((c, i) => { P.push((c[0] - 0.5) * w, (c[1] - 0.5) * h + pivotY, (c[2] - 0.5) * d); Nn.push(...f.n); U.push(...uvs[i]); });
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return new E.Mesh(new E.Geometry({ positions: P, normals: Nn, uvs: U, indices: I }), mat, part);
}
export function makeBlockPerson(skinCanvas) {
  const mat = new E.Material({ name: 'Block skin', color: '#ffffff', map: new E.Texture(skinCanvas, { nearest: true, mipmaps: false, repeat: false }), roughness: 1 });
  const px = 0.05625, node = new E.Node('Block person'), root = new E.Node('Root');
  node.add(root);
  const mk = (part, w, h, d, x, y, z, pivotY = 0) => { const pivot = new E.Node(part + ' pivot'); pivot.position.set([x, y, z]); const m = partMesh(part, w * px, h * px, d * px, mat, pivotY * px); pivot.add(m); root.add(pivot); return pivot; };
  const legL = mk('leg', 4, 12, 4, -2 * px, 12 * px, 0, -6), legR = mk('leg', 4, 12, 4, 2 * px, 12 * px, 0, -6);
  const body = mk('body', 8, 12, 4, 0, 18 * px, 0);
  const armL = mk('arm', 4, 12, 4, -6 * px, 24 * px, 0, -6), armR = mk('arm', 4, 12, 4, 6 * px, 24 * px, 0, -6);
  const head = mk('head', 8, 8, 8, 0, 28 * px, 0);
  // the head sits on the neck; arms and legs hang from their pivots
  head.children[0].position.set([0, 0, 0]);
  const person = { node, root, legL, legR, armL, armR, head, group: new Obj3(node), rootH: new Obj3(root), walk: 0 };
  return person;
}
export function poseBlockPerson(p, dt, speed) {
  p.walk += dt * speed * 2.4;
  const a = Math.sin(p.walk) * Math.min(1, speed / 3) * 55;
  p.legL.setEuler(a, 0, 0); p.legR.setEuler(-a, 0, 0); p.armL.setEuler(-a, 0, 0); p.armR.setEuler(a, 0, 0);
}

// a name plate that always faces the camera (call tag.face(cam) each frame)
export function nameTag(text, color = '#ffffff') {
  const c = makeCanvas(128, 20), g = c.getContext('2d');
  g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, 128, 20);
  g.fillStyle = color; g.font = 'bold 14px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 11);
  const mat = new E.Material({ name: 'Name tag', color: '#fff', map: new E.Texture(c, { repeat: false, mipmaps: false, nearest: true }), emissive: '#fff', emissiveMap: true, emissiveStrength: 1, roughness: 1, doubleSided: true });
  const node = new E.Node('Name tag'), m = new E.Mesh(E.plane({ width: 1.6, depth: 0.25 }), mat, 'tag');
  m.setEuler(90, 0, 0); m.castShadow = false; node.add(m);
  node.userData.face = (cam) => { const p = node.world; const dx = cam.position[0] - p[12], dz = cam.position[2] - p[14]; node.setEuler(0, Math.atan2(dx, dz) * DEG - (node.parent ? 0 : 0), 0); };
  return node;
}
