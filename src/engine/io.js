// Import / export: OBJ (posed snapshot) and binary glTF 2.0 (.glb) with skeleton,
// skin weights, PBR materials and every animation clip — ready for Godot/Unity/Blender.
import { mat4, vec3, quat, hexToRGB, srgbToLinear } from './math.js';
import { sampleClip, createPose } from './animation.js';

// CPU skinning of one mesh into world space
export function skinnedPositions(mesh) {
  const g = mesh.geometry, n = g.vertexCount, P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  const p = [0, 0, 0], q = [0, 0, 0], acc = [0, 0, 0], accN = [0, 0, 0], tmp = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    vec3.set(p, g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]);
    vec3.set(q, g.normals[i * 3], g.normals[i * 3 + 1], g.normals[i * 3 + 2]);
    if (mesh.skeleton && mesh.skinRoot) {
      vec3.transformMat4(p, p, mesh.local); vec3.transformDir(q, q, mesh.local);
      acc.fill(0); accN.fill(0);
      for (let k = 0; k < 4; k++) {
        const w = g.weights[i * 4 + k]; if (!w) continue;
        const J = mesh.skeleton.joints.subarray(g.joints[i * 4 + k] * 16, g.joints[i * 4 + k] * 16 + 16);
        vec3.scaleAdd(acc, acc, vec3.transformMat4(tmp, p, J), w);
        vec3.scaleAdd(accN, accN, vec3.transformDir(tmp, q, J), w);
      }
      vec3.transformMat4(p, acc, mesh.skinRoot.world); vec3.transformDir(q, accN, mesh.skinRoot.world);
    } else { vec3.transformMat4(p, p, mesh.world); vec3.transformDir(q, q, mesh.world); }
    vec3.normalize(q, q);
    P.set(p, i * 3); N.set(q, i * 3);
  }
  return { positions: P, normals: N };
}

export function exportOBJ(meshes) {
  let out = '# ShapeForge OBJ export\n', off = 1;
  for (const m of meshes) {
    const { positions: P, normals: N } = skinnedPositions(m), g = m.geometry;
    out += `o ${m.name.replace(/\s+/g, '_')}\n`;
    for (let i = 0; i < P.length; i += 3) out += `v ${P[i].toFixed(5)} ${P[i + 1].toFixed(5)} ${P[i + 2].toFixed(5)}\n`;
    for (let i = 0; i < g.uvs.length; i += 2) out += `vt ${g.uvs[i].toFixed(4)} ${g.uvs[i + 1].toFixed(4)}\n`;
    for (let i = 0; i < N.length; i += 3) out += `vn ${N[i].toFixed(4)} ${N[i + 1].toFixed(4)} ${N[i + 2].toFixed(4)}\n`;
    for (let t = 0; t < g.indices.length; t += 3) {
      const a = g.indices[t] + off, b = g.indices[t + 1] + off, c = g.indices[t + 2] + off;
      out += `f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}\n`;
    }
    off += g.vertexCount;
  }
  return out;
}

// ---------------------------------------------------------------- glTF
export function exportGLB(character, { fps = 30 } = {}) {
  const sk = character.skeleton, chunks = [], views = [], accessors = [];
  let byteLen = 0;
  const addView = (arr, target) => {
    const pad = (4 - (byteLen % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); byteLen += pad; }
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    chunks.push(bytes.slice());
    views.push({ buffer: 0, byteOffset: byteLen, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    byteLen += bytes.byteLength;
    return views.length - 1;
  };
  const addAcc = (arr, type, componentType, target, minmax = false) => {
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
    const acc = { bufferView: addView(arr, target), componentType, count: arr.length / size, type };
    if (minmax) {
      const mn = Array(size).fill(Infinity), mx = Array(size).fill(-Infinity);
      for (let i = 0; i < arr.length; i++) { const k = i % size; mn[k] = Math.min(mn[k], arr[i]); mx[k] = Math.max(mx[k], arr[i]); }
      acc.min = mn; acc.max = mx;
    }
    accessors.push(acc); return accessors.length - 1;
  };
  const FLOAT = 5126, USHORT = 5123, UINT = 5125;
  // nodes: 0 = scene root (character), 1..n bones, then meshes
  const nodes = [{ name: character.name, children: [] }];
  const boneNode = (i) => 1 + i;
  sk.bones.forEach((b, i) => {
    const t = [sk.restLocal[i * 3], sk.restLocal[i * 3 + 1], sk.restLocal[i * 3 + 2]];
    nodes.push({ name: b.name, translation: t, children: [] });
  });
  sk.bones.forEach((b, i) => { const p = sk.parentIndex[i]; (p >= 0 ? nodes[boneNode(p)].children : nodes[0].children).push(boneNode(i)); });
  const ibm = new Float32Array(sk.length * 16);
  sk.bones.forEach((b, i) => { const m = mat4.create(); m[12] = -b.head[0]; m[13] = -b.head[1]; m[14] = -b.head[2]; ibm.set(m, i * 16); });
  const skin = { joints: sk.bones.map((_, i) => boneNode(i)), inverseBindMatrices: addAcc(ibm, 'MAT4', FLOAT), skeleton: boneNode(0) };
  const materials = [], matIndex = new Map(), meshes = [];
  for (const part of character.parts) for (const mesh of part.meshes) {
    const g = mesh.geometry, n = g.vertexCount;
    // bake part transform into positions (glTF skinned meshes ignore node transforms)
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), v = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      vec3.set(v, g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]); vec3.transformMat4(v, v, mesh.local); P.set(v, i * 3);
      vec3.set(v, g.normals[i * 3], g.normals[i * 3 + 1], g.normals[i * 3 + 2]); vec3.transformDir(v, v, mesh.local); vec3.normalize(v, v); N.set(v, i * 3);
    }
    const J = new Uint16Array(n * 4); for (let i = 0; i < n * 4; i++) J[i] = g.joints[i];
    const mat = mesh.material;
    if (!matIndex.has(mat)) {
      const c = srgbToLinear(hexToRGB(mat.color)), e = srgbToLinear(hexToRGB(mat.emissive)).map((x) => Math.min(1, x * mat.emissiveStrength));
      materials.push({ name: mat.name, doubleSided: mat.doubleSided, pbrMetallicRoughness: { baseColorFactor: [...c, mat.opacity], metallicFactor: mat.metallic, roughnessFactor: mat.roughness }, emissiveFactor: e, ...(mat.opacity < 1 ? { alphaMode: 'BLEND' } : {}) });
      matIndex.set(mat, materials.length - 1);
    }
    meshes.push({ name: mesh.name, primitives: [{ attributes: { POSITION: addAcc(P, 'VEC3', FLOAT, 34962, true), NORMAL: addAcc(N, 'VEC3', FLOAT, 34962), TEXCOORD_0: addAcc(g.uvs.slice(), 'VEC2', FLOAT, 34962), JOINTS_0: addAcc(J, 'VEC4', USHORT, 34962), WEIGHTS_0: addAcc(g.weights.slice(), 'VEC4', FLOAT, 34962) }, indices: addAcc(new Uint32Array(g.indices), 'SCALAR', UINT, 34963), material: matIndex.get(mat) }] });
    nodes.push({ name: mesh.name, mesh: meshes.length - 1, skin: 0 });
    nodes[0].children.push(nodes.length - 1);
  }
  // animations
  const animations = [];
  const pose = createPose(sk.length);
  for (const clip of character.mixer.clips.values()) {
    const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
    const times = new Float32Array(frames).map((_, f) => (f / (frames - 1)) * clip.duration);
    const rot = sk.bones.map(() => new Float32Array(frames * 4)), tr = sk.bones.map(() => new Float32Array(frames * 3));
    const q = quat.create();
    for (let f = 0; f < frames; f++) {
      sampleClip(clip, sk, clip.loop && f === frames - 1 ? 0 : times[f], pose);
      for (let i = 0; i < sk.length; i++) {
        quat.copy(q, pose.rot.subarray(i * 4, i * 4 + 4));
        if (f > 0 && quat.dot(q, rot[i].subarray((f - 1) * 4, f * 4)) < 0) for (let k = 0; k < 4; k++) q[k] = -q[k];
        rot[i].set(q, f * 4);
        tr[i].set([sk.restLocal[i * 3] + pose.pos[i * 3], sk.restLocal[i * 3 + 1] + pose.pos[i * 3 + 1], sk.restLocal[i * 3 + 2] + pose.pos[i * 3 + 2]], f * 3);
      }
    }
    const input = addAcc(times, 'SCALAR', FLOAT, undefined, true);
    const samplers = [], channels = [];
    const animated = new Set(clip.tracks.map((t) => t.bone + ':' + t.type));
    sk.bones.forEach((b, i) => {
      if (animated.has(b.name + ':rotation')) { samplers.push({ input, output: addAcc(rot[i], 'VEC4', FLOAT), interpolation: 'LINEAR' }); channels.push({ sampler: samplers.length - 1, target: { node: boneNode(i), path: 'rotation' } }); }
      if (animated.has(b.name + ':position')) { samplers.push({ input, output: addAcc(tr[i], 'VEC3', FLOAT), interpolation: 'LINEAR' }); channels.push({ sampler: samplers.length - 1, target: { node: boneNode(i), path: 'translation' } }); }
    });
    if (channels.length) animations.push({ name: clip.name, samplers, channels });
  }
  const json = { asset: { version: '2.0', generator: 'ShapeForge Engine' }, scene: 0, scenes: [{ nodes: [0] }], nodes, meshes, materials, skins: [skin], animations, accessors, bufferViews: views, buffers: [{ byteLength: byteLen }] };
  const enc = new TextEncoder();
  let jsonBytes = enc.encode(JSON.stringify(json));
  const jpad = (4 - (jsonBytes.length % 4)) % 4;
  if (jpad) { const t = new Uint8Array(jsonBytes.length + jpad); t.set(jsonBytes); t.fill(0x20, jsonBytes.length); jsonBytes = t; }
  const bpad = (4 - (byteLen % 4)) % 4;
  const binLen = byteLen + bpad;
  const total = 12 + 8 + jsonBytes.length + 8 + binLen;
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(jsonBytes, 20);
  let o = 20 + jsonBytes.length;
  dv.setUint32(o, binLen, true); dv.setUint32(o + 4, 0x004e4942, true); o += 8;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}

// ------------------------------------------------------------------ props and structures
// Record an animation by running it: `run` starts an action (e.g. () => gun.reload()) and
// every node under root is sampled at `fps` until the action settles. Nodes that show or
// hide (a round going into a chamber) are recorded as scale keys, since glTF has no
// visibility channel. Returns { name, duration, tracks: Map(node -> {t, pos, rot, scale}) }.
export async function recordAnimation(root, name, run, { fps = 30, maxTime = 12, update = (dt) => root.traverse((n) => n.isProp && n.update(dt)) } = {}) {
  const nodes = []; root.traverse((n) => { if (n !== root && !n.isLight) nodes.push(n); });
  const samples = nodes.map(() => ({ pos: [], rot: [], vis: [] })), times = [];
  const take = (t) => { times.push(t); nodes.forEach((n, i) => { samples[i].pos.push(...n.position); samples[i].rot.push(...n.rotation); samples[i].vis.push(n.visible ? 1 : 0); }); };
  let done = false;
  Promise.resolve(run()).then(() => { done = true; });
  let t = 0, settle = 0;
  take(0);
  while (t < maxTime) {
    await 0;
    update(1 / fps); t += 1 / fps; take(t);
    const moving = [...(root.isProp ? root.rig.parts.values() : [])].some((p) => p.moving) || (root.isProp && root.rig.playing);
    if (done && !moving && ++settle > 2) break;
  }
  const tracks = new Map();
  const changed = (a, stride) => { for (let f = 1; f < a.length / stride; f++) for (let k = 0; k < stride; k++) if (Math.abs(a[f * stride + k] - a[k]) > 1e-5) return true; return false; };
  nodes.forEach((n, i) => {
    const s = samples[i], tr = {};
    if (changed(s.pos, 3)) tr.pos = new Float32Array(s.pos);
    if (changed(s.rot, 4)) { const r = new Float32Array(s.rot); for (let f = 1; f < times.length; f++) { let d = 0; for (let k = 0; k < 4; k++) d += r[f * 4 + k] * r[(f - 1) * 4 + k]; if (d < 0) for (let k = 0; k < 4; k++) r[f * 4 + k] = -r[f * 4 + k]; } tr.rot = r; }
    if (changed(s.vis, 1)) tr.vis = new Float32Array(s.vis);
    if (Object.keys(tr).length) tracks.set(n, tr);
  });
  return { name, duration: t, times: new Float32Array(times), tracks };
}

// Export any node tree (props, guns, tools, buildings) as binary glTF: the node hierarchy,
// meshes, PBR materials (with KHR_materials_emissive_strength for glowing parts) and
// recorded animations from recordAnimation().
export function exportSceneGLB(root, { animations = [] } = {}) {
  const chunks = [], views = [], accessors = [];
  let byteLen = 0;
  const addView = (arr, target) => {
    const pad = (4 - (byteLen % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); byteLen += pad; }
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    chunks.push(bytes.slice());
    views.push({ buffer: 0, byteOffset: byteLen, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    byteLen += bytes.byteLength;
    return views.length - 1;
  };
  const addAcc = (arr, type, componentType, target, minmax = false) => {
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type];
    const acc = { bufferView: addView(arr, target), componentType, count: arr.length / size, type };
    if (minmax) {
      const mn = Array(size).fill(Infinity), mx = Array(size).fill(-Infinity);
      for (let i = 0; i < arr.length; i++) { const k = i % size; mn[k] = Math.min(mn[k], arr[i]); mx[k] = Math.max(mx[k], arr[i]); }
      acc.min = mn; acc.max = mx;
    }
    accessors.push(acc); return accessors.length - 1;
  };
  const FLOAT = 5126, UINT = 5125;
  const nodes = [], meshes = [], materials = [], matIndex = new Map(), nodeIndex = new Map();
  let emissiveExt = false;
  const material = (m) => {
    if (matIndex.has(m)) return matIndex.get(m);
    const c = srgbToLinear(hexToRGB(m.color)), e = srgbToLinear(hexToRGB(m.emissive || '#000000'));
    const k = m.emissiveStrength || 0, peak = Math.max(1e-6, ...e.map((v) => v * k));
    const out = { name: m.name, pbrMetallicRoughness: { baseColorFactor: [...c, m.opacity ?? 1], metallicFactor: m.metallic, roughnessFactor: m.roughness }, doubleSided: !!m.doubleSided };
    if (k > 0) {
      const scale = Math.max(1, peak);
      out.emissiveFactor = e.map((v) => (v * k) / scale);
      if (scale > 1) { out.extensions = { KHR_materials_emissive_strength: { emissiveStrength: scale } }; emissiveExt = true; }
    }
    if ((m.opacity ?? 1) < 1) out.alphaMode = 'BLEND';
    materials.push(out); matIndex.set(m, materials.length - 1);
    return materials.length - 1;
  };
  const visit = (n) => {
    if (n.isLight || n.instanceMatrices || n.skeleton) return -1;
    const j = { name: n.name, translation: [...n.position], rotation: [...n.rotation], scale: n.visible ? [...n.scale] : [0, 0, 0] };
    const idx = nodes.length; nodes.push(j); nodeIndex.set(n, idx);
    if (n.geometry) {
      const g = n.geometry;
      meshes.push({ name: n.name, primitives: [{ attributes: { POSITION: addAcc(Float32Array.from(g.positions), 'VEC3', FLOAT, 34962, true), NORMAL: addAcc(Float32Array.from(g.normals), 'VEC3', FLOAT, 34962), TEXCOORD_0: addAcc(Float32Array.from(g.uvs), 'VEC2', FLOAT, 34962) }, indices: addAcc(Uint32Array.from(g.indices), 'SCALAR', UINT, 34963), material: material(n.material) }] });
      j.mesh = meshes.length - 1;
    }
    const kids = n.children.map(visit).filter((i) => i >= 0);
    if (kids.length) j.children = kids;
    return idx;
  };
  const rootIdx = visit(root);
  const anims = [];
  for (const a of animations) {
    const input = addAcc(a.times, 'SCALAR', FLOAT, undefined, true);
    const samplers = [], channels = [];
    for (const [n, tr] of a.tracks) {
      const node = nodeIndex.get(n); if (node === undefined) continue;
      if (tr.pos) { samplers.push({ input, output: addAcc(tr.pos, 'VEC3', FLOAT), interpolation: 'LINEAR' }); channels.push({ sampler: samplers.length - 1, target: { node, path: 'translation' } }); }
      if (tr.rot) { samplers.push({ input, output: addAcc(tr.rot, 'VEC4', FLOAT), interpolation: 'LINEAR' }); channels.push({ sampler: samplers.length - 1, target: { node, path: 'rotation' } }); }
      if (tr.vis) { const sc = new Float32Array(tr.vis.length * 3); tr.vis.forEach((v, f) => sc.set([v * n.scale[0], v * n.scale[1], v * n.scale[2]], f * 3)); samplers.push({ input, output: addAcc(sc, 'VEC3', FLOAT), interpolation: 'STEP' }); channels.push({ sampler: samplers.length - 1, target: { node, path: 'scale' } }); }
    }
    if (channels.length) anims.push({ name: a.name, samplers, channels });
  }
  const json = { asset: { version: '2.0', generator: 'ShapeForge Engine' }, scene: 0, scenes: [{ nodes: [rootIdx] }], nodes, meshes, materials, accessors, bufferViews: views, buffers: [{ byteLength: byteLen }] };
  if (anims.length) json.animations = anims;
  if (emissiveExt) json.extensionsUsed = ['KHR_materials_emissive_strength'];
  const enc = new TextEncoder();
  let jsonBytes = enc.encode(JSON.stringify(json));
  const jpad = (4 - (jsonBytes.length % 4)) % 4;
  if (jpad) { const t = new Uint8Array(jsonBytes.length + jpad); t.set(jsonBytes); t.fill(0x20, jsonBytes.length); jsonBytes = t; }
  const bpad = (4 - (byteLen % 4)) % 4, binLen = byteLen + bpad, total = 12 + 8 + jsonBytes.length + 8 + binLen;
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(jsonBytes, 20);
  let o = 20 + jsonBytes.length;
  dv.setUint32(o, binLen, true); dv.setUint32(o + 4, 0x004e4942, true); o += 8;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}

// Trigger a browser download (may be blocked inside sandboxed frames; callers should offer a copy fallback)
export function download(name, data, type = 'application/octet-stream') {
  try {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return true;
  } catch (e) { return false; }
}
