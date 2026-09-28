// Sanity checks for every shape + modifier: finite positions, outward normals, consistent winding.
import { buildShape, MODIFIERS, modifierDefaults } from '../src/engine/modifiers.js';
import { SHAPES, shapeDefaults } from '../src/engine/geometry.js';
let fail = 0;
function check(name, g, expectOutward = true) {
  const P = g.positions, N = g.normals, I = g.indices;
  const b = g.bounds(), c = [0, 1, 2].map((k) => (b.min[k] + b.max[k]) / 2);
  let out = 0, w = 0, nt = 0;
  for (let i = 0; i < P.length; i += 3) out += (P[i] - c[0]) * N[i] + (P[i + 1] - c[1]) * N[i + 1] + (P[i + 2] - c[2]) * N[i + 2];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b1 = I[t + 1] * 3, c1 = I[t + 2] * 3;
    const e1 = [P[b1] - P[a], P[b1 + 1] - P[a + 1], P[b1 + 2] - P[a + 2]], e2 = [P[c1] - P[a], P[c1 + 1] - P[a + 1], P[c1 + 2] - P[a + 2]];
    const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const avg = [0, 1, 2].map((k) => N[I[t] * 3 + k] + N[I[t + 1] * 3 + k] + N[I[t + 2] * 3 + k]);
    if (Math.hypot(...f) < 1e-12) continue; // degenerate (poles/apex)
    w += Math.sign(f[0] * avg[0] + f[1] * avg[1] + f[2] * avg[2]); nt++;
  }
  const agree = w / Math.max(1, nt);
  const bad = [...P, ...N].some((v) => !Number.isFinite(v)) || (expectOutward && out <= 0) || agree < 0.9;
  if (bad) fail++;
  console.log((bad ? 'FAIL ' : 'ok   ') + name.padEnd(22), 'v', String(g.vertexCount).padStart(6), 't', String(g.triangleCount).padStart(6), 'outward', out > 0, 'winding', agree.toFixed(2));
}
for (const t of Object.keys(SHAPES)) check(t, buildShape({ type: t, ...shapeDefaults(t) }), t !== 'plane');
for (const m of Object.keys(MODIFIERS)) check('mod:' + m, buildShape({ type: 'roundedBox', ...shapeDefaults('roundedBox') }, [modifierDefaults(m)]));
check('tube partial+solidify', buildShape({ type: 'tube', ...shapeDefaults('tube'), arc: 200 }, [modifierDefaults('solidify')]), false);
process.exit(fail ? 1 : 0);
