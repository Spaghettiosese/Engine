// V2 world checks: building generation, hip roof normals, static batching, the town,
// collisions and the time-of-day curve.
import * as E from '../src/engine/index.js';
import { westernTown, collide } from '../src/content/town.js';

const results = [];
const check = (name, ok, info = '') => results.push([name, ok, info]);

// every roof and facade combination builds, faces outward and registers a collider
let tris = 0;
for (const roof of ['falseFront', 'gable', 'hip', 'flat']) for (const facade of ['stepped', 'curved', 'square']) {
  const kit = E.building(new E.Kit(E.archPalette()), { roof, facade, floors: 2, sign: 'TEST', width: 7, depth: 12 });
  const n = kit.toNode();
  let t = 0, bad = 0; n.traverse((m) => { if (m.geometry) { t += m.geometry.triangleCount; for (const v of m.geometry.positions) if (!Number.isFinite(v)) bad++; } });
  tris = Math.max(tris, t);
  if (bad || kit.colliders.length !== 1 || !n.children.some((c) => c.isLight)) { check(`building ${roof}/${facade}`, false, `${bad} NaN`); }
}
check('building variants', !results.some((r) => !r[1]), `max ${tris} tris`);

// hip roof: every face normal points away from the roof's centre line (or down, for the soffit)
{
  const kit = E.building(new E.Kit(E.archPalette()), { roof: 'hip', width: 6, depth: 13, porch: false, sign: '' });
  const g = E.Geometry.merge(kit.groups.get(kit.p.shingles));
  let out = 0, total = 0;
  for (let i = 0; i < g.positions.length; i += 3) {
    const p = [g.positions[i], g.positions[i + 1], g.positions[i + 2]], n = [g.normals[i], g.normals[i + 1], g.normals[i + 2]];
    const d = [p[0], 0, p[2] + 6.5];
    total++; if (n[1] < -0.9 || n[0] * d[0] + n[2] * d[2] >= -1e-4) out++;
  }
  check('hip roof faces outward', out === total, `${out}/${total} vertices`);
}

// batching keeps triangles and lights, and collapses to one mesh per material
{
  const street = new E.Node('street');
  for (let i = 0; i < 3; i++) { const b = E.building(new E.Kit(E.archPalette()), { seed: i }).toNode(); b.position.set([i * 12, 0, 0]); street.add(b); }
  let before = 0, lightsBefore = 0; street.traverse((n) => { if (n.geometry) before += n.geometry.triangleCount; if (n.isLight) lightsBefore++; });
  const batched = E.batchStatic(street);
  let after = 0, meshes = 0, lights = 0, mats = new Set(); batched.traverse((n) => { if (n.geometry) { after += n.geometry.triangleCount; meshes++; mats.add(n.material); } if (n.isLight) lights++; });
  check('static batching', before === after && lights === lightsBefore && meshes === mats.size, `${before} tris → ${meshes} meshes, ${lights} lights kept`);
}

// the town builds with lamps, interiors and colliders, and collide() pushes out of walls
{
  const town = westernTown({ seed: 7 });
  let meshes = 0; town.root.traverse((n) => n.geometry && meshes++);
  const c = town.colliders[0], p = [(c.min[0] + c.max[0]) / 2, 0, (c.min[1] + c.max[1]) / 2];
  collide(p, 0.4, town.colliders);
  const inside = town.colliders.some((k) => p[0] > k.min[0] && p[0] < k.max[0] && p[2] > k.min[1] && p[2] < k.max[1]);
  check('western town', meshes > 50 && town.lamps.length > 5 && town.interior.length > 5 && !inside, `${meshes} meshes, ${town.lamps.length} lamps, ${town.interior.length} interiors, ${town.colliders.length} colliders`);
}

// time of day: bright noon, dark midnight, shafts only with a low sun
{
  const env = new E.Scene().environment;
  const at = (h) => { E.applyTimeOfDay(env, h); return { night: env.night, sun: env.sunIntensity, rays: env.godRays }; };
  const noon = at(12.5), dusk = at(18.4), midnight = at(0);
  check('time of day', noon.night === 0 && midnight.night > 0.9 && noon.sun > dusk.sun && dusk.rays > noon.rays && midnight.rays === 0,
    `noon sun ${noon.sun.toFixed(2)}, dusk rays ${dusk.rays.toFixed(2)}, midnight night ${midnight.night.toFixed(2)}`);
}

let fail = 0;
for (const [name, ok, info] of results) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); if (!ok) fail++; }
if (fail) process.exit(1);
