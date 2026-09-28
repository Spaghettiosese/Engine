// BVH checks: every triangle lands in exactly one leaf, leaves fit the shader's limit,
// boxes contain their triangles, and a CPU traversal matches brute force.
import * as E from '../src/engine/index.js';
import { buildBVH, bakeScene } from '../src/engine/pathtracer.js';
import { createCowboy } from '../src/content/cowboy.js';
const scene = new E.Scene();
scene.add(new E.Mesh(E.plane({ width: 10, depth: 10 }), new E.Material()));
const c = createCowboy(); c.play('Walk', { fade: 0 }); c.update(0.3); scene.add(c);
const kit = E.building(new E.Kit(E.archPalette()), { sign: 'BANK' }); const b = kit.toNode(); b.position.set([4, 0, -3]); scene.add(b);
const t0 = performance.now();
const baked = bakeScene(scene), { nodes, order } = buildBVH(baked.positions, baked.tris);
const ms = performance.now() - t0;
const seen = new Uint8Array(baked.tris.length); let maxLeaf = 0, bad = 0;
const P = baked.positions;
nodes.forEach((n) => {
  if (n.count > 0) {
    maxLeaf = Math.max(maxLeaf, n.count);
    for (let i = n.first; i < n.first + n.count; i++) {
      seen[order[i]]++;
      for (const v of baked.tris[order[i]].slice(0, 3)) for (let k = 0; k < 3; k++) if (P[v * 3 + k] < n.min[k] - 1e-5 || P[v * 3 + k] > n.max[k] + 1e-5) bad++;
    }
  } else if (!(n.left > 0 && nodes[n.left] && nodes[n.left + 1])) bad++;
});
const covered = seen.every((v) => v === 1);
// rays: CPU traversal vs brute force
const tri = (k, ro, rd) => {
  const t = baked.tris[k], v0 = [...P.subarray(t[0] * 3, t[0] * 3 + 3)], v1 = [...P.subarray(t[1] * 3, t[1] * 3 + 3)], v2 = [...P.subarray(t[2] * 3, t[2] * 3 + 3)];
  const e1 = E.vec3.sub([0, 0, 0], v1, v0), e2 = E.vec3.sub([0, 0, 0], v2, v0), p = E.vec3.cross([0, 0, 0], rd, e2), det = E.vec3.dot(e1, p);
  if (Math.abs(det) < 1e-12) return Infinity;
  const s = E.vec3.sub([0, 0, 0], ro, v0), u = E.vec3.dot(s, p) / det; if (u < 0 || u > 1) return Infinity;
  const q = E.vec3.cross([0, 0, 0], s, e1), v = E.vec3.dot(rd, q) / det; if (v < 0 || u + v > 1) return Infinity;
  const tt = E.vec3.dot(e2, q) / det; return tt > 1e-4 ? tt : Infinity;
};
const boxT = (n, ro, rd) => { let a = 0, b = Infinity; for (let k = 0; k < 3; k++) { const i = 1 / rd[k]; let t0 = (n.min[k] - ro[k]) * i, t1 = (n.max[k] - ro[k]) * i; if (t0 > t1) [t0, t1] = [t1, t0]; a = Math.max(a, t0); b = Math.min(b, t1); } return a <= b ? a : Infinity; };
const bvhHit = (ro, rd) => { let best = Infinity; const st = [0]; while (st.length) { const n = nodes[st.pop()]; if (boxT(n, ro, rd) >= best) continue; if (n.count) { for (let i = n.first; i < n.first + n.count; i++) best = Math.min(best, tri(order[i], ro, rd)); } else st.push(n.left, n.left + 1); } return best; };
let mism = 0;
for (let i = 0; i < 200; i++) {
  const ro = [Math.random() * 6 - 1, 0.3 + Math.random() * 3, 3 + Math.random() * 3], tgt = [Math.random() * 6 - 1, Math.random() * 3, Math.random() * 4 - 4];
  const rd = E.vec3.normalize([0, 0, 0], E.vec3.sub([0, 0, 0], tgt, ro));
  let bf = Infinity; for (let k = 0; k < baked.tris.length; k++) bf = Math.min(bf, tri(k, ro, rd));
  if (Math.abs(bvhHit(ro, rd) - bf) > 1e-5 && !(bf === Infinity && bvhHit(ro, rd) === Infinity)) mism++;
}
const ok = covered && !bad && maxLeaf <= 8 && mism === 0;
console.log(`${ok ? 'ok  ' : 'FAIL'} BVH — ${baked.tris.length.toLocaleString()} tris, ${nodes.length.toLocaleString()} nodes, built in ${ms.toFixed(0)} ms, largest leaf ${maxLeaf}, 200 rays match brute force: ${mism === 0}`);
if (!ok) process.exit(1);
