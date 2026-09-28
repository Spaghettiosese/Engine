// glTF 2.0 import (.glb and .gltf with embedded or external buffers): the node hierarchy,
// meshes (positions, normals, UVs, indices), PBR materials with base-colour and normal
// textures, skins (any rest pose, with inverse bind matrices) and animations
// (translation / rotation / scale, LINEAR, STEP and CUBICSPLINE). This is how scanned or
// sculpted characters from other tools come into the engine.
//
//   const model = await loadGLTF('assets/hero.glb');
//   scene.add(model.scene);
//   model.animator.play('Walk');
//   runLoop((dt) => { model.update(dt); renderer.render(scene, camera); });
import { Node, Mesh, Material, Texture } from './scene.js';
import { Geometry } from './geometry.js';
import { mat4, quat, vec3, rgbToHex } from './math.js';

const COMPONENT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export class GLTFError extends Error {}

function parseGLB(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new GLTFError('Not a GLB file (bad magic).');
  if (dv.getUint32(4, true) !== 2) throw new GLTFError('Only glTF 2.0 is supported.');
  let o = 12, json = null, bin = null;
  while (o < dv.byteLength) {
    const len = dv.getUint32(o, true), type = dv.getUint32(o + 4, true);
    const chunk = bytes.subarray(o + 8, o + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
    else if (type === 0x004e4942) bin = chunk;
    o += 8 + len;
  }
  if (!json) throw new GLTFError('GLB has no JSON chunk.');
  return { json, bin };
}

// src: URL string, ArrayBuffer, Uint8Array, or a parsed glTF JSON object
export async function loadGLTF(src, { baseUrl = '', textures = true } = {}) {
  let json, bin = null;
  if (typeof src === 'string') {
    const r = await fetch(src);
    if (!r.ok) throw new GLTFError(`Could not load ${src}: HTTP ${r.status}`);
    baseUrl = baseUrl || src.replace(/[^/]*$/, '');
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf[0] === 0x67 && buf[1] === 0x6c && buf[2] === 0x54 && buf[3] === 0x46) ({ json, bin } = parseGLB(buf));
    else json = JSON.parse(new TextDecoder().decode(buf));
  } else if (src instanceof ArrayBuffer || ArrayBuffer.isView(src)) {
    const buf = src instanceof ArrayBuffer ? new Uint8Array(src) : new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
    ({ json, bin } = parseGLB(buf));
  } else json = src;
  if (!json.asset || !String(json.asset.version).startsWith('2')) throw new GLTFError('Only glTF 2.0 assets are supported.');
  // buffers
  const buffers = await Promise.all((json.buffers || []).map(async (b, i) => {
    if (!b.uri) { if (i === 0 && bin) return bin; throw new GLTFError(`Buffer ${i} has no data.`); }
    if (b.uri.startsWith('data:')) { const b64 = b.uri.split(',')[1]; const s = atob(b64); const u = new Uint8Array(s.length); for (let k = 0; k < s.length; k++) u[k] = s.charCodeAt(k); return u; }
    const r = await fetch(baseUrl + b.uri); if (!r.ok) throw new GLTFError(`Missing buffer ${b.uri}`); return new Uint8Array(await r.arrayBuffer());
  }));
  const viewBytes = (vi) => { const v = json.bufferViews[vi], b = buffers[v.buffer]; return { bytes: b.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength), stride: v.byteStride || 0 }; };
  // accessors -> typed arrays (floats for vertex data, integers for indices/joints)
  const accCache = new Map();
  const accessor = (ai, asFloat = true) => {
    const key = ai + (asFloat ? 'f' : 'i');
    if (accCache.has(key)) return accCache.get(key);
    const a = json.accessors[ai], n = SIZE[a.type], T = COMPONENT[a.componentType], count = a.count;
    if (!T || !n) throw new GLTFError(`Accessor ${ai}: unsupported type ${a.type}/${a.componentType}`);
    const out = asFloat ? new Float32Array(count * n) : new Uint32Array(count * n);
    if (a.bufferView !== undefined) {
      const { bytes, stride } = viewBytes(a.bufferView);
      const elem = T.BYTES_PER_ELEMENT, st = stride || n * elem, base = a.byteOffset || 0;
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
      const norm = a.normalized && NORM[a.componentType];
      for (let i = 0; i < count; i++) for (let k = 0; k < n; k++) {
        let v = dv[get](base + i * st + k * elem, true);
        if (norm) v = Math.max(v / norm, -1);
        out[i * n + k] = v;
      }
    }
    if (a.sparse) { // sparse overrides
      const s = a.sparse;
      const iv = viewBytes(s.indices.bufferView), vv = viewBytes(s.values.bufferView);
      const IT = COMPONENT[s.indices.componentType], ids = new IT(iv.bytes.buffer.slice(iv.bytes.byteOffset + (s.indices.byteOffset || 0), iv.bytes.byteOffset + (s.indices.byteOffset || 0) + s.count * IT.BYTES_PER_ELEMENT));
      const vals = new T(vv.bytes.buffer.slice(vv.bytes.byteOffset + (s.values.byteOffset || 0), vv.bytes.byteOffset + (s.values.byteOffset || 0) + s.count * n * T.BYTES_PER_ELEMENT));
      for (let i = 0; i < s.count; i++) for (let k = 0; k < n; k++) out[ids[i] * n + k] = vals[i * n + k];
    }
    accCache.set(key, out);
    return out;
  };
  // images -> textures (browser only; in Node the geometry still loads)
  const images = await Promise.all((json.images || []).map(async (im) => {
    if (!textures || typeof createImageBitmap === 'undefined') return null;
    try {
      let blob;
      if (im.bufferView !== undefined) blob = new Blob([viewBytes(im.bufferView).bytes], { type: im.mimeType || 'image/png' });
      else if (im.uri) blob = await (await fetch(im.uri.startsWith('data:') ? im.uri : baseUrl + im.uri)).blob();
      return await createImageBitmap(blob); // glTF's top-left UV origin matches unflipped uploads
    } catch (e) { console.warn('glTF image failed to load:', e.message); return null; }
  }));
  const texCache = new Map();
  const texture = (info, srgb) => {
    if (!info || !json.textures) return null;
    const t = json.textures[info.index], img = t && images[t.source];
    if (!img) return null;
    const key = t.source + (srgb ? 's' : 'l');
    if (!texCache.has(key)) texCache.set(key, new Texture(img, { srgb }));
    return texCache.get(key);
  };
  // materials
  const materials = (json.materials || []).map((m, i) => {
    const pbr = m.pbrMetallicRoughness || {}, c = pbr.baseColorFactor || [1, 1, 1, 1], e = m.emissiveFactor || [0, 0, 0];
    const emax = Math.max(...e, 1e-6);
    const mat = new Material({
      name: m.name || `Material ${i}`, color: rgbToHex(c.slice(0, 3).map(linearToSrgb)), metallic: pbr.metallicFactor ?? 1, roughness: pbr.roughnessFactor ?? 1,
      emissive: rgbToHex(e.map((v) => linearToSrgb(v / emax))), emissiveStrength: emax > 1e-5 ? emax * (m.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1) : 0,
      doubleSided: !!m.doubleSided, opacity: m.alphaMode === 'BLEND' ? c[3] : 1,
    });
    mat.map = texture(pbr.baseColorTexture, true);
    mat.normalMap = texture(m.normalTexture, false);
    mat.normalScale = m.normalTexture?.scale ?? 1;
    return mat;
  });
  const defaultMat = new Material({ name: 'glTF default', color: '#cccccc', roughness: 0.6 });
  // nodes
  const nodes = (json.nodes || []).map((n, i) => {
    const node = new Node(n.name || `Node ${i}`);
    if (n.matrix) { const m = Float32Array.from(n.matrix); mat4.getTranslation(node.position, m); mat4.getRotation(node.rotation, m); node.scale.set([Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10])]); }
    if (n.translation) node.position.set(n.translation);
    if (n.rotation) node.rotation.set(n.rotation);
    if (n.scale) node.scale.set(n.scale);
    node.userData.gltf = { index: i, extras: n.extras };
    return node;
  });
  (json.nodes || []).forEach((n, i) => (n.children || []).forEach((c) => nodes[i].add(nodes[c])));
  // skins: joint matrices = jointWorld * inverseBind, uploaded like an engine Skeleton
  const identity = new Node('glTF skin space'); // never moves: skinned vertices are already in world space
  const skins = (json.skins || []).map((s, i) => {
    const n = s.joints.length, ibm = s.inverseBindMatrices !== undefined ? accessor(s.inverseBindMatrices) : null;
    return { name: s.name || `Skin ${i}`, jointNodes: s.joints.map((j) => nodes[j]), inverseBind: ibm || new Float32Array(n * 16).map((_, k) => (k % 17 === 0 ? 1 : 0)), joints: new Float32Array(n * 16), version: 0, get length() { return n; }, isGLTFSkin: true };
  });
  // meshes: one engine Mesh per primitive
  const meshes = [];
  (json.nodes || []).forEach((n, ni) => {
    if (n.mesh === undefined) return;
    const m = json.meshes[n.mesh];
    m.primitives.forEach((pr, pi) => {
      if (pr.mode !== undefined && pr.mode !== 4) return; // triangles only
      const at = pr.attributes;
      if (at.POSITION === undefined) throw new GLTFError(`Mesh ${m.name}: primitive has no POSITION.`);
      const positions = accessor(at.POSITION), vc = positions.length / 3;
      const indices = pr.indices !== undefined ? accessor(pr.indices, false) : Uint32Array.from({ length: vc }, (_, k) => k);
      const g = new Geometry({ positions, normals: at.NORMAL !== undefined ? accessor(at.NORMAL) : undefined, uvs: at.TEXCOORD_0 !== undefined ? accessor(at.TEXCOORD_0) : undefined, indices });
      if (n.skin !== undefined && at.JOINTS_0 !== undefined) { g.joints = accessor(at.JOINTS_0); g.weights = accessor(at.WEIGHTS_0); }
      const mesh = new Mesh(g, pr.material !== undefined ? materials[pr.material] : defaultMat, (m.name || 'Mesh') + (m.primitives.length > 1 ? ` [${pi}]` : ''));
      if (n.skin !== undefined && g.joints) { mesh.skeleton = skins[n.skin]; mesh.skinRoot = identity; mesh.frustumCulled = false; }
      nodes[ni].add(mesh); meshes.push(mesh);
    });
  });
  // scene root
  const root = new Node(json.scenes?.[json.scene ?? 0]?.name || 'glTF scene');
  const sceneNodes = json.scenes ? json.scenes[json.scene ?? 0].nodes : nodes.map((_, i) => i).filter((i) => !nodes[i].parent);
  for (const i of sceneNodes) root.add(nodes[i]);
  // animations
  const animations = (json.animations || []).map((a, i) => {
    let duration = 0;
    const channels = a.channels.map((c) => {
      const s = a.samplers[c.sampler], input = accessor(s.input), output = accessor(s.output);
      duration = Math.max(duration, input[input.length - 1] || 0);
      return { node: nodes[c.target.node], path: c.target.path, input, output, interp: s.interpolation || 'LINEAR' };
    }).filter((c) => c.node && c.path !== 'weights');
    return { name: a.name || `Animation ${i}`, duration, channels };
  });
  const model = { scene: root, nodes, meshes, materials, skins, animations, json };
  model.animator = new GLTFAnimator(model);
  model.update = (dt) => { model.animator.update(dt); updateSkins(model); };
  updateSkins(model);
  return model;
}

// Recompute skin joint matrices from the (animated) joint nodes.
export function updateSkins(model) {
  const root = model.scene;
  root.updateWorld(root.parent ? root.parent.world : null);
  const m = mat4.create();
  for (const s of model.skins) {
    s.jointNodes.forEach((jn, k) => { mat4.multiply(m, jn.world, s.inverseBind.subarray(k * 16, k * 16 + 16)); s.joints.set(m, k * 16); });
    s.version++;
  }
}

// Plays glTF animations on the model's nodes, with crossfades between clips.
export class GLTFAnimator {
  constructor(model) { this.model = model; this.clips = new Map(model.animations.map((a) => [a.name, a])); this.current = null; this.previous = null; this.fade = 0; this.fadeDur = 0; this.speed = 1; }
  get names() { return [...this.clips.keys()]; }
  play(name, { loop = true, fade = 0.25, speed = 1 } = {}) {
    const clip = typeof name === 'number' ? this.model.animations[name] : this.clips.get(name);
    if (!clip) throw new GLTFError(`No animation named ${name}. Available: ${this.names.join(', ')}`);
    this.previous = this.current && fade > 0 ? { ...this.current } : null;
    this.current = { clip, time: 0, loop, speed };
    this.fade = 0; this.fadeDur = fade;
    return this;
  }
  update(dt) {
    if (!this.current) return;
    for (const a of [this.current, this.previous]) if (a) { a.time += dt * a.speed * this.speed; if (a.loop && a.clip.duration > 0) a.time %= a.clip.duration; else a.time = Math.min(a.time, a.clip.duration); }
    this.fade = Math.min(1, this.fade + (this.fadeDur > 0 ? dt / this.fadeDur : 1));
    if (this.fade >= 1) this.previous = null;
    const w = this.previous ? this.fade * this.fade * (3 - 2 * this.fade) : 1;
    if (this.previous) apply(this.previous.clip, this.previous.time, 1);
    apply(this.current.clip, this.current.time, w);
  }
}
const tmpQ = quat.create(), tmpV = [0, 0, 0];
function apply(clip, t, w) {
  for (const c of clip.channels) {
    const n = c.path === 'rotation' ? 4 : 3, v = sample(c, t, n);
    const target = c.path === 'rotation' ? c.node.rotation : c.path === 'translation' ? c.node.position : c.node.scale;
    if (w >= 1) target.set(v);
    else if (n === 4) { quat.slerp(tmpQ, target, v, w); target.set(tmpQ); }
    else { vec3.lerp(tmpV, target, v, w); target.set(tmpV); }
  }
}
function sample(c, t, n) {
  const I = c.input, O = c.output, cubic = c.interp === 'CUBICSPLINE', stride = cubic ? n * 3 : n, off = cubic ? n : 0;
  const out = new Float32Array(n);
  if (t <= I[0] || I.length === 1) { for (let k = 0; k < n; k++) out[k] = O[off + k]; return out; }
  const last = I.length - 1;
  if (t >= I[last]) { for (let k = 0; k < n; k++) out[k] = O[last * stride + off + k]; return out; }
  let lo = 0, hi = last;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (I[mid] <= t) lo = mid; else hi = mid; }
  const dtk = I[hi] - I[lo], s = (t - I[lo]) / (dtk || 1);
  if (c.interp === 'STEP') { for (let k = 0; k < n; k++) out[k] = O[lo * stride + k]; return out; }
  if (cubic) { // Hermite with in/out tangents
    const s2 = s * s, s3 = s2 * s, h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    for (let k = 0; k < n; k++) out[k] = h00 * O[lo * stride + n + k] + h10 * dtk * O[lo * stride + 2 * n + k] + h01 * O[hi * stride + n + k] + h11 * dtk * O[hi * stride + k];
    if (n === 4) quat.normalize(out, out);
    return out;
  }
  if (n === 4) return quat.slerp(out, O.subarray(lo * 4, lo * 4 + 4), O.subarray(hi * 4, hi * 4 + 4), s);
  for (let k = 0; k < n; k++) out[k] = O[lo * n + k] + (O[hi * n + k] - O[lo * n + k]) * s;
  return out;
}
