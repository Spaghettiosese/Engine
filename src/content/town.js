// A generated western town built with the V2 architecture kit: Main Street with a dozen
// storefronts, a church, water tower, windmill, well, corrals, telegraph line, wagons and
// street lamps. Returns the scene root, 2D colliders, and hooks for night lighting.
import { Node, Mesh, Material } from '../engine/scene.js';
import { buildShape } from '../engine/modifiers.js';
import * as A from '../engine/architecture.js';
import { rng, vec3 } from '../engine/math.js';
import { saguaro, rock } from './scenery.js';

const STREET_HALF = 7;

const LEFT = [
  { sign: 'SALOON', width: 10, depth: 12, floors: 2, siding: 'paint', door: 'batwing', roof: 'falseFront', facade: 'curved', balcony: true },
  { sign: 'BANK', width: 8, depth: 10, floors: 2, siding: 'brick', roof: 'flat', porch: false, balcony: false, windows: 3 },
  { sign: 'BARBER', width: 5.5, depth: 7, floors: 1, siding: 'paintCream', roof: 'falseFront', facade: 'square', windows: 2 },
  { sign: 'HOTEL', width: 11, depth: 12, floors: 3, siding: 'paintCream', roof: 'hip', balcony: true, windows: 4, shutters: true },
  { sign: 'ASSAY', width: 6, depth: 8, floors: 1, siding: 'stucco', roof: 'flat', windows: 2, porch: true },
];
const RIGHT = [
  { sign: 'GENERAL STORE', width: 11, depth: 11, floors: 2, siding: 'siding', roof: 'falseFront', facade: 'stepped', windows: 4 },
  { sign: 'SHERIFF', width: 7, depth: 9, floors: 1, siding: 'stucco', roof: 'flat', windows: 2 },
  { sign: 'POST', width: 6, depth: 8, floors: 1, siding: 'paint', roof: 'falseFront', facade: 'stepped', windows: 2 },
  { sign: 'DRY GOODS', width: 9, depth: 10, floors: 2, siding: 'paintRed', roof: 'falseFront', facade: 'curved', windows: 3, balcony: false },
  { sign: 'LIVERY', width: 10, depth: 12, floors: 1, siding: 'siding', roof: 'gable', windows: 2, porch: false, lanterns: false },
];

// rect in building-local (x, z) -> world AABB for a building rotated by +-90 degrees
function worldRect(r, pos, rotY) {
  const pts = [[r.min[0], r.min[1]], [r.max[0], r.max[1]], [r.min[0], r.max[1]], [r.max[0], r.min[1]]].map(([x, z]) => {
    const a = rotY * Math.PI / 180; return [pos[0] + x * Math.cos(a) + z * Math.sin(a), pos[2] - x * Math.sin(a) + z * Math.cos(a)];
  });
  return { min: [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))], max: [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))] };
}

function church(kit, pos) {
  const P = kit.p;
  A.building(kit, { width: 8, depth: 14, floors: 1, floorHeight: 5, siding: 'paintCream', roof: 'gable', windows: 2, porch: false, lanterns: false, sign: '' });
  // bell tower over the entrance
  kit.span(P.paintCream, [-1.4, 5.3, -2.6], [1.4, 10.5, 0.2]);
  A.wall(kit, { x0: -1.4, x1: 1.4, y0: 8.2, y1: 10.2, z: 0.2, t: 0.1, mat: P.paintCream, openings: [{ x: 0, y: 0.2, w: 1.1, h: 1.5, kind: 'window' }] });
  kit.add(P.shingles, buildShape({ type: 'cylinder', radiusTop: 0.001, radiusBottom: 2.2, height: 3.2, radialSegments: 4, heightSegments: 1, capTop: false, capBottom: true, arc: 360 }), [0, 12.1, -1.2], [0, 45, 0]);
  kit.box(P.trim, [0, 14.3, -1.2], [0.12, 1.2, 0.12]); kit.box(P.trim, [0, 14.5, -1.2], [0.7, 0.12, 0.12]);
  kit.add(P.metal, buildShape({ type: 'lathe', points: [[0, 0], [0.35, 0.02], [0.38, 0.3], [0.25, 0.55], [0.1, 0.62], [0, 0.63]], segments: 18, arc: 360, smooth: 1 }), [0, 8.6, -1.2]);
  kit.span(P.door, [-0.9, 0.35, 0.05], [0.9, 3.2, 0.2]);
}

export function westernTown({ seed = 7 } = {}) {
  const r = rng(seed);
  const root = new Node('Frontier Town');
  const palette = A.archPalette();
  const colliders = [], rotors = [], interior = [], lamps = [], structures = [];
  // ground: desert plus a packed-dirt main street with wheel ruts
  const ground = new Mesh(buildShape({ type: 'plane', width: 400, depth: 400, subdivisions: 1 }), new Material({ name: 'Desert', color: '#c9a077', roughness: 0.95, pattern: 'dirt', patternScale: 1, patternColor: '#a57a52', bump: 1.2 }), 'Ground');
  ground.castShadow = false; root.add(ground);
  const street = new Mesh(buildShape({ type: 'plane', width: STREET_HALF * 2 + 2, depth: 96, subdivisions: 1 }), new Material({ name: 'Street', color: '#9a7654', roughness: 1, pattern: 'dirt', patternScale: 2.2, patternColor: '#7a5a3e', bump: 1.6 }), 'Main Street');
  street.position.set([0, 0.01, 0]); street.castShadow = false; root.add(street);

  const place = (kit, pos, rotY, name) => {
    const n = kit.toNode(name); n.position.set(pos); n.setEuler(0, rotY, 0); root.add(n);
    for (const c of kit.colliders) colliders.push(worldRect(c, pos, rotY));
    n.traverse((x) => { if (x.isLight) (x.userData.interior ? interior : lamps).push(x); });
    if (n.userData.rig) structures.push(n); // V5: doors and shutters that open
    return n;
  };
  // storefronts down both sides of Main Street, alleys in between
  for (const [side, list] of [[-1, LEFT], [1, RIGHT]]) {
    let z = 36;
    list.forEach((b, i) => {
      const pd = b.porch === false ? 0 : 2.4;
      z -= b.width / 2;
      const kit = A.building(new A.Kit(palette, { openable: true }), { ...b, porchDepth: 2.4, seed: seed + i * 13 + (side > 0 ? 100 : 0) });
      place(kit, [side * (STREET_HALF + pd + 0.4), 0, z], side < 0 ? 90 : -90, b.sign);
      z -= b.width / 2 + 2.2 + r() * 2.5;
    });
  }
  // the church closes the north end of the street
  { const k = new A.Kit(palette); church(k, [0, 0, 0]); place(k, [0, 0, -46], 0, 'Church'); }
  // props and structures
  const props = new A.Kit(palette);
  for (let z = 30; z >= -34; z -= 13) for (const s of [-1, 1]) A.lampPost(props, [s * (STREET_HALF - 0.4), 0, z + (s > 0 ? 6 : 0)]);
  A.well(props, [0, 0, -4]);
  A.waterTower(props, [-24, 0, -8]);
  rotors.push(A.windmill(props, [22, 0, 14]));
  A.wagon(props, [3.6, 0, 16], 8); A.wagon(props, [-26, 0, 20], 70);
  for (let i = 0; i < 9; i++) { const s = i % 2 ? 1 : -1; A.barrel(props, [s * (STREET_HALF + 0.3 + r() * 0.6), 0, 28 - i * 7.3 + r() * 2]); }
  for (let i = 0; i < 8; i++) A.crate(props, [(i % 2 ? 1 : -1) * (STREET_HALF + 0.8), 0, 24 - i * 8.5], 0.6 + r() * 0.3, r() * 40);
  A.bench(props, [-(STREET_HALF + 0.9), 0.42, 9], 90); A.bench(props, [STREET_HALF + 0.9, 0.42, -12], -90);
  A.telegraphLine(props, [[9.5, 44], [9.5, 20], [9.5, -4], [9.5, -28], [14, -52]]);
  // corrals behind the livery and the saloon
  A.fenceLine(props, [[20, -18], [34, -18], [34, -34], [20, -34], [20, -24]]);
  A.fenceLine(props, [[-20, 30], [-34, 30], [-34, 18], [-20, 18]]);
  // a dry creek with a plank footbridge east of town
  A.bridge(props, { from: [40, 0.8, 6], length: 11, width: 2.2, rotY: 90 });
  A.stairs(props, { from: [-18.4, 0, 5], steps: 7, rise: 0.19, run: 0.28, width: 1.1, rotY: 90 });
  const propsNode = place(props, [0, 0, 0], 0, 'Props');
  // desert scenery outside town
  for (let i = 0; i < 26; i++) { const a = r() * Math.PI * 2, d = 55 + r() * 60; const n = i % 3 ? rock(i + 40, 0.3 + r() * 1.4) : saguaro(i + 5); n.position.set([Math.cos(a) * d, 0, Math.sin(a) * d]); root.add(n); }
  void propsNode;
  // world bounds
  const bound = 70;
  colliders.push({ min: [-bound - 5, -bound - 5], max: [-bound, bound + 5] }, { min: [bound, -bound - 5], max: [bound + 5, bound + 5] }, { min: [-bound, -bound - 5], max: [bound, -bound] }, { min: [-bound, bound], max: [bound, bound + 5] });
  let nightAmt = -1;
  return {
    root, colliders, palette, lamps, interior, rotors, structures,
    // 0 = day, 1 = full night: windows glow, lamps and interiors switch on
    setNight(n) {
      if (Math.abs(n - nightAmt) < 0.01) return; nightAmt = n;
      A.setNightLights(palette, n);
      for (const l of lamps) l.intensity = 14 * n;
      for (const l of interior) l.intensity = 5 * n;
    },
    update(dt) { for (const st of structures) st.userData.rig.update(dt); for (const rt of rotors) { rt.userData.angle = (rt.userData.angle || 0) + dt * 1.6; rt.setEuler(0, 0, rt.userData.angle * 57.3); } },
  };
}

// Push a circle (x, z, radius) out of every collider; returns the corrected position.
export function collide(p, radius, colliders) {
  for (const c of colliders) {
    const cx = Math.max(c.min[0], Math.min(p[0], c.max[0])), cz = Math.max(c.min[1], Math.min(p[2], c.max[1]));
    const dx = p[0] - cx, dz = p[2] - cz, d = Math.hypot(dx, dz);
    if (d < radius) {
      if (d > 1e-5) { p[0] = cx + (dx / d) * radius; p[2] = cz + (dz / d) * radius; }
      else { // centre inside the box: push out along the shallowest axis
        const opts = [[c.min[0] - radius - p[0], 0], [c.max[0] + radius - p[0], 0], [0, c.min[1] - radius - p[2]], [0, c.max[1] + radius - p[2]]];
        const best = opts.reduce((a, b) => (Math.hypot(...a) < Math.hypot(...b) ? a : b)); p[0] += best[0]; p[2] += best[1];
      }
    }
  }
  return p;
}
export { vec3 };
