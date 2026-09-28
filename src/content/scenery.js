// Western set dressing built from the same parametric shapes: desert floor, rocks,
// saguaro cacti, a split-rail fence, barrels and a hitching post.
import { Mesh, Material, Node } from '../engine/scene.js';
import { buildShape } from '../engine/modifiers.js';
import { rng } from '../engine/math.js';

const M = {
  ground: new Material({ name: 'Desert', color: '#c9a077', roughness: 0.95, pattern: 'dirt', patternScale: 1, patternColor: '#a57a52', bump: 1.2 }),
  rock: new Material({ name: 'Rock', color: '#9c7358', roughness: 0.85, pattern: 'leather', patternScale: 60, patternColor: '#6d4c38', bump: 1.5 }),
  cactus: new Material({ name: 'Cactus', color: '#4f7a45', roughness: 0.6, pattern: 'stripes', patternScale: 14, patternColor: '#3c5f35', patternStrength: 0.8, sheen: 0.3 }),
  wood: new Material({ name: 'Weathered Wood', color: '#8a6a4a', roughness: 0.8, pattern: 'wood', patternScale: 4, patternColor: '#5a4128', bump: 1.2 }),
  iron: new Material({ name: 'Iron', color: '#4a4540', roughness: 0.5, metallic: 1, pattern: 'metal', patternScale: 1 }),
};

function mesh(shape, mods, mat, pos, rot = [0, 0, 0], scale = [1, 1, 1], name = shape.type) {
  const m = new Mesh(buildShape(shape, mods), mat, name);
  m.position.set(pos); m.setEuler(...rot); m.scale.set(scale);
  return m;
}

export function saguaro(seed = 1) {
  const r = rng(seed), g = new Node('Saguaro');
  const h = 1.8 + r() * 1.4;
  g.add(mesh({ type: 'capsule', radius: 0.17, length: h, radialSegments: 20, capSegments: 8 }, [{ type: 'profile', axis: 'y', values: [1.1, 1, 1, 0.95] }], M.cactus, [0, h / 2 + 0.05, 0], [0, 0, 0], [1, 1, 1], 'Trunk'));
  const arms = 1 + Math.floor(r() * 3);
  for (let k = 0; k < arms; k++) {
    const side = k % 2 ? -1 : 1, y = h * (0.35 + r() * 0.3), up = 0.5 + r() * 0.6, out = 0.35 + r() * 0.15;
    g.add(mesh({ type: 'tube', path: [[0, 0, 0], [side * out * 0.6, 0.02, 0], [side * out, 0.2, 0], [side * out, up, 0]], radii: [0.11, 0.11, 0.1, 0.09], radialSegments: 16, samples: 8, caps: true, flatten: 1, arc: 360, arcOffset: 0, twist: 0 }, [], M.cactus, [0, y, 0], [0, r() * 360, 0], [1, 1, 1], 'Arm'));
  }
  return g;
}

export function rock(seed = 1, size = 0.5) {
  const r = rng(seed);
  return mesh({ type: 'sphere', radius: size, widthSegments: 28, heightSegments: 18, phiStart: 0, phiLength: 360, thetaStart: 0, thetaLength: 180 },
    [{ type: 'displace', amount: size * 0.35, scale: 1.6 / size, seed: seed, octaves: 3 }, { type: 'squash', axis: 'y', min: -size * 0.2, max: 10 }],
    M.rock, [0, 0, 0], [0, r() * 360, 0], [1 + r() * 0.5, 0.55 + r() * 0.3, 1 + r() * 0.3], 'Rock');
}

export function fence(length = 8, posts = 5) {
  const g = new Node('Fence');
  const step = length / (posts - 1);
  for (let i = 0; i < posts; i++) g.add(mesh({ type: 'box', width: 0.12, height: 1.1, depth: 0.12, bevel: 0.015, bevelSegments: 2 }, [{ type: 'displace', amount: 0.01, scale: 8, seed: i, octaves: 2 }], M.wood, [i * step, 0.55, 0], [0, i * 13, (i % 2 ? 2 : -2)], [1, 1, 1], 'Post'));
  for (const y of [0.45, 0.85]) g.add(mesh({ type: 'cylinder', radiusTop: 0.045, radiusBottom: 0.05, height: length, radialSegments: 10, heightSegments: 8, capTop: true, capBottom: true, arc: 360 }, [{ type: 'wave', axis: 'x', along: 'y', amplitude: 0.02, frequency: 0.15, phase: y * 90 }], M.wood, [length / 2, y, 0.07], [0, 0, 90], [1, 1, 1], 'Rail'));
  return g;
}

export function barrel() {
  const g = new Node('Barrel');
  g.add(mesh({ type: 'lathe', points: [[0, 0], [0.26, 0], [0.3, 0.2], [0.315, 0.42], [0.3, 0.64], [0.26, 0.84], [0, 0.84]], segments: 32, arc: 360, smooth: 2 }, [], M.wood, [0, 0, 0], [0, 0, 0], [1, 1, 1], 'Staves'));
  for (const y of [0.12, 0.72]) g.add(mesh({ type: 'torus', radius: 0.285, tube: 0.012, radialSegments: 6, tubularSegments: 40, arc: 360, tubeScaleY: 2.5 }, [], M.iron, [0, y, 0], [0, 0, 0], [1, 1, 1], 'Hoop'));
  return g;
}

export function hitchingPost() {
  const g = new Node('Hitching Post');
  for (const x of [-0.9, 0.9]) g.add(mesh({ type: 'box', width: 0.14, height: 1.0, depth: 0.14, bevel: 0.02, bevelSegments: 2 }, [], M.wood, [x, 0.5, 0]));
  g.add(mesh({ type: 'cylinder', radiusTop: 0.06, radiusBottom: 0.06, height: 2.1, radialSegments: 12, heightSegments: 6, capTop: true, capBottom: true, arc: 360 }, [{ type: 'displace', amount: 0.008, scale: 10, seed: 4, octaves: 2 }], M.wood, [0, 0.98, 0], [0, 0, 90]));
  return g;
}

export function westernSet() {
  const root = new Node('Western Set');
  const ground = new Mesh(buildShape({ type: 'plane', width: 400, depth: 400, subdivisions: 1 }), M.ground, 'Ground');
  ground.castShadow = false; ground.pickable = false;
  root.add(ground);
  const r = rng(42);
  const place = (n, x, z) => { n.position.set([x, 0, z]); root.add(n); return n; };
  [[-6, -7], [7, -9], [-11, 4], [12, 6], [-4, 14], [5, 16], [-16, -12]].forEach(([x, z], i) => place(saguaro(i + 3), x, z).setEuler(0, r() * 360, 0));
  for (let i = 0; i < 16; i++) { const a = r() * Math.PI * 2, d = 6 + r() * 22; place(rock(i + 10, 0.2 + r() * 0.8), Math.cos(a) * d, Math.sin(a) * d); }
  place(fence(9, 5), -12, -3).setEuler(0, 30, 0);
  place(barrel(), 3.6, -3.2); place(barrel(), 4.2, -2.7).setEuler(0, 40, 0);
  place(hitchingPost(), -3.5, -4.5).setEuler(0, 20, 0);
  return root;
}
