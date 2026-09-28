// Tools and hand props: a parametric generator for axes, picks, shovels, hammers, saws,
// knives, wrenches, lanterns, buckets and torches. Each is a Prop: origin at the main
// hand's grip, handle along +Y (head up), working edge toward +Z, so the same hand socket
// holds all of them. Two-handed tools carry a support grip for the other hand. Moving
// parts use the mechanism rig: a folding knife opens, a wrench jaw adjusts, a lantern's
// bail swings and its flame flickers and can be turned down.
import { Kit, Material, Node, Prop, MechClip, Light, cylinder, tube, torus, sphere, box, extrude, cone, lathe } from '../engine/index.js';

export const TOOL_KINDS = ['axe', 'hatchet', 'pickaxe', 'shovel', 'hammer', 'sledgehammer', 'pitchfork', 'saw', 'knife', 'wrench', 'lantern', 'bucket', 'torch'];
export const TOOL_DEFAULTS = { size: 1, handle: 1, wood: 'ash', metal: 'steel', wear: 0.3 };
const WOODS = { ash: ['#b48a5a', '#6b4a2a'], hickory: ['#9a6b3e', '#4d3017'], walnut: ['#6a3a1e', '#2e170a'], painted: ['#8e3b2e', '#3a1712'] };
const METALS = {
  steel: { color: '#7d8288', roughness: 0.35 }, rusty: { color: '#6e4a36', roughness: 0.75 }, black: { color: '#26282c', roughness: 0.5 },
  brass: { color: '#c9a045', roughness: 0.3 }, tin: { color: '#9aa0a6', roughness: 0.3 },
};
export function toolMaterials(p) {
  const w = WOODS[p.wood] || WOODS.ash, m = METALS[p.metal] || METALS.steel;
  return {
    wood: new Material({ name: 'Handle', color: w[0], roughness: 0.6, pattern: 'wood', patternScale: 8, patternColor: w[1] }),
    metal: new Material({ name: 'Head', ...m, metallic: p.metal === 'rusty' ? 0.4 : 1, pattern: p.metal === 'rusty' ? 'corrugated' : 'metal', patternScale: p.metal === 'rusty' ? 0.5 : 4, patternColor: '#4a2a18', patternStrength: p.wear }),
    edge: new Material({ name: 'Edge', color: '#c9ced4', metallic: 1, roughness: 0.18, pattern: 'metal', patternScale: 6 }),
    brass: new Material({ name: 'Brass', color: '#c9a045', metallic: 1, roughness: 0.3 }),
    leather: new Material({ name: 'Leather wrap', color: '#4a2c18', roughness: 0.7, pattern: 'leather', patternScale: 30, patternColor: '#241408' }),
    glass: new Material({ name: 'Lantern glass', color: '#ffe0a8', roughness: 0.08, emissive: '#ffb04a', emissiveStrength: 0, opacity: 0.55 }),
    flame: new Material({ name: 'Flame', color: '#ffcf7a', emissive: '#ff9a2a', emissiveStrength: 0 }),
    rag: new Material({ name: 'Pitch rag', color: '#2a211a', roughness: 0.95, pattern: 'fabric', patternScale: 60 }),
    rope: new Material({ name: 'Rope', color: '#b69a64', roughness: 0.9, pattern: 'hair', patternScale: 6 }),
  };
}

const K = () => new Kit({});
const HAND_R = { position: [0.013, -0.058, 0.004], rotation: [90, 0, 0] };
const TOOL_GRIP = { curl: [0.62, 0.78, 0.84, 0.9, 0.95], spread: 0 };
const SUPPORT = { curl: [0.55, 0.72, 0.78, 0.84, 0.9], spread: 0.05 };
// a bail: a half ring over the top, ends at (±r, y0), peak at the origin
const arch = (r, y0) => Array.from({ length: 13 }, (_, i) => { const a = -Math.PI / 2 + (i / 12) * Math.PI; return [Math.sin(a) * r, y0 + Math.cos(a) * -y0, 0]; });
function node(name, kit, pos = [0, 0, 0]) { const n = new Node(name); n.position.set(pos); if (kit) n.add(kit.toNode(name + ' mesh')); return n; }
// straight or gently curved wooden handle from y0 to y1, thicker at the grip end
function haft(k, M, y0, y1, { r0 = 0.017, r1 = 0.014, curve = 0, flatten = 0.75, knob = true } = {}) {
  k.add(M.wood, tube({ path: [[0, y0, 0], [0, (y0 + y1) / 2, curve], [0, y1, 0]], radii: [r0 * 1.15, r0, r1], radialSegments: 12, samples: 6, flatten }));
  if (knob) k.add(M.wood, sphere({ radius: r0 * 1.2, widthSegments: 10, heightSegments: 6 }), [0, y0, 0], [0, 0, 0], [flatten, 0.7, 1]);
}
// a flat blade outline (in Z/Y) extruded across X
function blade(k, mat, outline, pos, thick = 0.008) { k.add(mat, extrude({ outline, depth: thick, bevel: thick * 0.3 }), pos, [0, 90, 0]); }

const BUILD = {
  axe(p, M, t, s) {
    const L = 0.72 * p.handle * s, k = K();
    haft(k, M, -0.1 * s, L, { curve: 0.02 * s });
    const hy = L - 0.04 * s;
    k.box(M.metal, [0, hy, -0.01 * s], [0.03 * s, 0.075 * s, 0.07 * s], [0, 0, 0], 0.004);       // eye + poll
    blade(k, M.metal, [[0, -0.035], [0.1, -0.075], [0.115, -0.07], [0.12, 0.05], [0.105, 0.06], [0, 0.035]].map(([z, y]) => [z * s, y * s]), [0, hy, 0.02 * s], 0.014 * s);
    blade(k, M.edge, [[0.1, -0.074], [0.12, -0.07], [0.125, 0.05], [0.106, 0.058]].map(([z, y]) => [z * s, y * s]), [0, hy, 0.02 * s], 0.016 * s);
    t.add(node('Axe', k)); t.sockets.head = [0, hy, 0.14 * s]; t.support = { position: [0, L * 0.35, 0], slideFrom: [0, 0.1 * s, 0], pose: SUPPORT }; t.twoHanded = true;
  },
  hatchet(p, M, t, s) { BUILD.axe({ ...p, handle: p.handle * 0.5 }, M, t, s * 0.8); t.twoHanded = false; t.support = null; },
  pickaxe(p, M, t, s) {
    const L = 0.8 * p.handle * s, k = K();
    haft(k, M, -0.1 * s, L);
    k.box(M.metal, [0, L - 0.01, 0], [0.04 * s, 0.07 * s, 0.045 * s], [0, 0, 0], 0.005);
    k.add(M.metal, tube({ path: [[0, L - 0.01, 0], [0, L + 0.01 * s, 0.14 * s], [0, L - 0.06 * s, 0.28 * s]], radii: [0.018 * s, 0.012 * s, 0.002], radialSegments: 10, samples: 8, flatten: 1 }));
    k.add(M.metal, tube({ path: [[0, L - 0.01, 0], [0, L + 0.005 * s, -0.12 * s], [0, L - 0.04 * s, -0.24 * s]], radii: [0.018 * s, 0.014 * s, 0.01 * s], radialSegments: 10, samples: 8, flatten: 0.35 }));
    t.add(node('Pickaxe', k)); t.sockets.head = [0, L - 0.06 * s, 0.28 * s]; t.support = { position: [0, L * 0.4, 0], slideFrom: [0, 0.1 * s, 0], pose: SUPPORT }; t.twoHanded = true;
  },
  shovel(p, M, t, s) {
    const L = 1.0 * p.handle * s, k = K();
    // D-grip at the top of the handle (where the main hand is), blade at the far end
    k.add(M.wood, torus({ radius: 0.055 * s, tube: 0.012 * s, radialSegments: 8, tubularSegments: 20, arc: 180 }), [0, -0.02 * s, 0], [0, 90, 180]);
    k.cyl(M.wood, [0, -0.075 * s, 0], 0.013 * s, 0.11 * s, [0, 0, 90], 10);
    haft(k, M, 0.02 * s, L, { knob: false, r0: 0.016, r1: 0.016 });
    k.cyl(M.metal, [0, L + 0.03 * s, 0], 0.02 * s, 0.1 * s, [0, 0, 0], 10);
    k.add(M.metal, lathe({ points: [[0, 0], [0.13 * s, 0.02 * s], [0.14 * s, 0.2 * s], [0.08 * s, 0.3 * s], [0, 0.32 * s]], segments: 18, arc: 140 }), [0, L + 0.06 * s, 0.02 * s], [0, 110, 0], [1, 1, 0.35]);
    t.add(node('Shovel', k)); t.sockets.head = [0, L + 0.3 * s, 0]; t.support = { position: [0, L * 0.4, 0], slideFrom: [0, 0.1 * s, 0], pose: SUPPORT }; t.twoHanded = true;
  },
  hammer(p, M, t, s) {
    const L = 0.3 * p.handle * s, k = K();
    haft(k, M, -0.06 * s, L, { r0: 0.014, r1: 0.011 });
    k.cyl(M.metal, [0, L, 0.035 * s], 0.016 * s, 0.07 * s, [90, 0, 0], 12);
    k.cyl(M.edge, [0, L, 0.072 * s], 0.017 * s, 0.006 * s, [90, 0, 0], 12);
    k.add(M.metal, tube({ path: [[0, L, 0], [0, L - 0.01 * s, -0.05 * s], [0, L - 0.04 * s, -0.08 * s]], radii: [0.013 * s, 0.01 * s, 0.004 * s], radialSegments: 8, samples: 6, flatten: 0.45 }));
    t.add(node('Hammer', k)); t.sockets.head = [0, L, 0.075 * s];
  },
  sledgehammer(p, M, t, s) {
    const L = 0.85 * p.handle * s, k = K();
    haft(k, M, -0.08 * s, L, { r0: 0.018, r1: 0.016 });
    k.box(M.metal, [0, L, 0], [0.07 * s, 0.07 * s, 0.2 * s], [0, 0, 0], 0.008);
    t.add(node('Sledgehammer', k)); t.sockets.head = [0, L, 0.1 * s]; t.support = { position: [0, L * 0.4, 0], slideFrom: [0, 0.1 * s, 0], pose: SUPPORT }; t.twoHanded = true;
  },
  pitchfork(p, M, t, s) {
    const L = 1.15 * p.handle * s, k = K();
    haft(k, M, -0.05 * s, L, { r0: 0.016, r1: 0.015 });
    k.box(M.metal, [0, L + 0.01 * s, 0], [0.16 * s, 0.02 * s, 0.018 * s], [0, 0, 0], 0.004);
    for (let i = 0; i < 4; i++) { const x = (-0.06 + i * 0.04) * s; k.add(M.metal, tube({ path: [[x, L + 0.01 * s, 0], [x, L + 0.15 * s, 0.03 * s], [x * 1.1, L + 0.3 * s, 0.015 * s]], radii: [0.005 * s, 0.004 * s, 0.001], radialSegments: 6, samples: 6, flatten: 1 })); }
    t.add(node('Pitchfork', k)); t.sockets.head = [0, L + 0.3 * s, 0]; t.support = { position: [0, L * 0.4, 0], slideFrom: [0, 0.1 * s, 0], pose: SUPPORT }; t.twoHanded = true;
  },
  saw(p, M, t, s) {
    const k = K();
    k.box(M.wood, [0, 0.0, -0.02 * s], [0.028 * s, 0.12 * s, 0.07 * s], [0, 0, 0], 0.012);          // closed grip
    k.box(M.wood, [0, 0.07 * s, -0.005 * s], [0.028 * s, 0.03 * s, 0.1 * s], [0, 0, 0], 0.01);
    const len = 0.55 * p.handle * s;
    blade(k, M.edge, [[0, 0.02], [len, 0.04], [len, 0.065], [0, 0.11]].map(([y, z]) => [z * s - 0.04 * s, y]), [0, 0.05 * s, 0], 0.0015 * s);
    t.add(node('Saw', k)); t.sockets.head = [0, len, 0.02 * s];
  },
  knife(p, M, t, s) {
    const k = K();
    k.box(M.wood, [0, 0.03 * s, 0], [0.016 * s, 0.1 * s, 0.022 * s], [0, 0, 0], 0.006);
    for (const y of [-0.02, 0.08]) k.box(M.brass, [0, y * s, 0], [0.017 * s, 0.01 * s, 0.023 * s], [0, 0, 0], 0.003);
    t.add(node('Knife handle', k));
    // the blade hinges at the top bolster: 0 open, 175 folded into the handle
    const b = node('Blade', null, [0, 0.085 * s, 0.006 * s]); const bk = K();
    blade(bk, M.edge, [[0, -0.008], [0.08, -0.004], [0.095, 0.006], [0.01, 0.009]].map(([y, z]) => [z * s, y * s]), [0, 0, 0], 0.003 * s);
    b.add(bk.toNode('Blade mesh')); t.add(b);
    t.rig.add('blade', b, { axis: [1, 0, 0], min: 0, max: 175, stiffness: 400 });
    t.rig.get('blade').snap(175);
    t.addClip(new MechClip('Open', 0.35, { blade: [[0, 175], [0.12, 150, 'in'], [0.35, 0, 'snap']] }, [{ t: 0.35, name: 'click' }]));
    t.addClip(new MechClip('Close', 0.3, { blade: [[0, 0], [0.3, 175, 'in']] }, [{ t: 0.3, name: 'click' }]));
    t.sockets.head = [0, 0.18 * s, 0]; t.grip = { pose: { curl: [0.55, 0.8, 0.85, 0.9, 0.95], spread: 0 }, socket: HAND_R };
  },
  wrench(p, M, t, s) {
    const L = 0.25 * p.handle * s, k = K();
    k.box(M.metal, [0, L / 2, 0], [0.008 * s, L, 0.022 * s], [0, 0, 0], 0.003);
    k.box(M.metal, [0, L + 0.012 * s, -0.008 * s], [0.012 * s, 0.035 * s, 0.03 * s], [0, 0, 0], 0.004);
    k.box(M.metal, [0, L + 0.04 * s, -0.018 * s], [0.012 * s, 0.03 * s, 0.014 * s], [0, 0, 0], 0.003); // fixed jaw
    t.add(node('Wrench', k));
    const jaw = node('Jaw', null, [0, L + 0.03 * s, 0.01 * s]); const jk = K(); jk.box(M.metal, [0, 0.008 * s, 0], [0.011 * s, 0.03 * s, 0.012 * s], [0, 0, 0], 0.003); jaw.add(jk.toNode('Jaw mesh'));
    const knurl = node('Knurl', null, [0, L + 0.01 * s, 0.0]); const nk = K(); nk.cyl(M.edge, [0, 0, 0], 0.006 * s, 0.012 * s, [0, 0, 90], 10); knurl.add(nk.toNode('Knurl mesh'));
    t.add(jaw, knurl);
    t.rig.add('jaw', jaw, { type: 'slide', axis: [0, 0, 1], min: -0.018 * s, max: 0.012 * s, stiffness: 300 });
    t.rig.add('knurl', knurl, { type: 'spin', axis: [1, 0, 0], stiffness: 300 });
    t.addClip(new MechClip('Adjust', 0.8, { jaw: [[0, 0], [0.4, 0.01 * s], [0.8, -0.012 * s]], knurl: [[0, 0], [0.4, 540], [0.8, -360]] }));
    t.sockets.head = [0, L + 0.04 * s, 0];
  },
  lantern(p, M, t, s) {
    // held by the bail: the lantern hangs below the hand and swings on the bail pivot
    const body = node('Lantern', null, [0, -0.02 * s, 0]); const k = K();
    k.cyl(M.metal, [0, -0.25 * s, 0], 0.07 * s, 0.03 * s, [0, 0, 0], 16);                                 // fount
    k.add(M.glass, lathe({ points: [[0, 0], [0.055 * s, 0], [0.065 * s, 0.06 * s], [0.05 * s, 0.13 * s], [0, 0.13 * s]], segments: 16 }), [0, -0.235 * s, 0]);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; k.cyl(M.metal, [Math.cos(a) * 0.064 * s, -0.17 * s, Math.sin(a) * 0.064 * s], 0.003 * s, 0.14 * s, [0, 0, 0], 6); }
    k.add(M.metal, cone({ radius: 0.055 * s, height: 0.05 * s, radialSegments: 14 }), [0, -0.085 * s, 0]);
    k.cyl(M.metal, [0, -0.055 * s, 0], 0.012 * s, 0.02 * s, [0, 0, 0], 8);
    k.cyl(M.brass, [0.07 * s, -0.24 * s, 0], 0.008 * s, 0.012 * s, [0, 0, 90], 8);                       // wick knob
    body.add(k.toNode('Lantern mesh'));
    const fk = K(); fk.add(M.flame, sphere({ radius: 0.012 * s, widthSegments: 8, heightSegments: 6 }), [0, 0, 0], [0, 0, 0], [0.7, 1.6, 0.7]);
    const flame = node('Flame', fk, [0, -0.19 * s, 0]); body.add(flame);
    const light = new Light('point', { color: '#ffb35c', intensity: 0, range: 9, flicker: 0.5, profile: 'lantern' }); light.position.set([0, -0.17 * s, 0]); body.add(light);
    const bail = node('Bail', null, [0, 0, 0]); const bk = K();
    bk.add(M.metal, tube({ path: arch(0.07 * s, -0.09 * s), radii: [0.0025 * s], radialSegments: 6, samples: 2 }));
    bail.add(bk.toNode('Bail mesh'));
    t.add(body, bail);
    t.rig.add('swing', body, { axis: [1, 0, 0], min: -60, max: 60, stiffness: 18, damping: 1.2 });
    t.rig.add('swingSide', body, { axis: [0, 0, 1], min: -60, max: 60, stiffness: 18, damping: 1.2 });
    t.rig.add('wick', flame, { type: 'slide', axis: [0, 1, 0], min: -0.012 * s, max: 0, stiffness: 200 });
    t.state = { lit: true, wick: 1 };
    t.lamp = light; t.flameMat = M.flame; t.glassMat = M.glass;
    t.toggle = (on = !t.state.lit) => { t.state.lit = on; return on; };
    t.setWick = (w) => { t.state.wick = Math.max(0.1, Math.min(1, w)); t.rig.get('wick').set(-0.012 * s * (1 - t.state.wick)); };
    // the hanging lantern lags behind the hand: kick the swing spring with the carrier's acceleration
    let lastP = null, lastV = [0, 0, 0];
    t.onUpdate = (dt) => {
      const k2 = t.state.lit ? t.state.wick : 0;
      light.setLumens?.(1200 * k2) ?? (light.intensity = 30 * k2);
      M.flame.emissiveStrength = 14 * k2; M.glass.emissiveStrength = 1.2 * k2; flame.visible = k2 > 0;
      t.updateWorld(t.parent ? t.parent.world : null);
      const wp = [t.world[12], t.world[13], t.world[14]];
      if (lastP && dt > 0) {
        const v = [0, 1, 2].map((i) => (wp[i] - lastP[i]) / dt), a = [0, 1, 2].map((i) => (v[i] - lastV[i]) / dt);
        const sw = t.rig.get('swing'), ss = t.rig.get('swingSide');
        sw.vel += -a[2] * 3 * dt; ss.vel += a[0] * 3 * dt; sw.target = 0; ss.target = 0; sw.driven = ss.driven = false;
        lastV = v;
      }
      lastP = wp;
    };
    t.grip = { pose: { curl: [0.35, 0.75, 0.8, 0.85, 0.9], spread: 0 }, socket: { position: [-0.004, -0.085, 0.012], rotation: [0, 0, 0] } };
    t.sockets.light = [0, -0.19 * s, 0];
  },
  bucket(p, M, t, s) {
    const body = node('Bucket', null, [0, -0.02 * s, 0]); const k = K();
    k.add(M.metal, lathe({ points: [[0, 0], [0.1 * s, 0], [0.13 * s, 0.24 * s], [0.125 * s, 0.24 * s], [0.095 * s, 0.01 * s], [0, 0.01 * s]], segments: 22 }), [0, -0.38 * s, 0]);
    for (const y of [-0.34, -0.2]) k.add(M.metal, torus({ radius: (0.11 + (y + 0.34) * 0.15) * s, tube: 0.004 * s, radialSegments: 6, tubularSegments: 24 }), [0, y * s, 0], [90, 0, 0]);
    body.add(k.toNode('Bucket mesh'));
    const bail = node('Bail', null); const bk = K(); bk.add(M.metal, tube({ path: arch(0.13 * s, -0.16 * s), radii: [0.003 * s], radialSegments: 6, samples: 2 })); bk.cyl(M.wood, [0, 0, 0], 0.012 * s, 0.08 * s, [0, 0, 90], 10); bail.add(bk.toNode('Bail mesh'));
    t.add(body, bail);
    t.rig.add('swing', body, { axis: [1, 0, 0], min: -45, max: 45, stiffness: 14, damping: 1.5 });
    t.grip = { pose: { curl: [0.35, 0.75, 0.8, 0.85, 0.9], spread: 0 }, socket: { position: [-0.004, -0.085, 0.012], rotation: [0, 0, 0] } };
  },
  torch(p, M, t, s) {
    const L = 0.5 * p.handle * s, k = K();
    haft(k, M, -0.08 * s, L, { r0: 0.016, r1: 0.02, knob: false });
    k.add(M.rag, sphere({ radius: 0.035 * s, widthSegments: 10, heightSegments: 8 }), [0, L + 0.02 * s, 0], [0, 0, 0], [1, 1.5, 1]);
    t.add(node('Torch', k));
    const fk = K(); fk.add(M.flame, cone({ radius: 0.03 * s, height: 0.12 * s, radialSegments: 10 }), [0, 0.05 * s, 0]);
    const flame = node('Flame', fk, [0, L + 0.05 * s, 0]); t.add(flame);
    const light = new Light('point', { color: '#ff9a3a', intensity: 0, range: 8, flicker: 0.9 }); light.position.set([0, L + 0.12 * s, 0]); t.add(light);
    t.state = { lit: true }; t.lamp = light;
    t.toggle = (on = !t.state.lit) => { t.state.lit = on; return on; };
    let time = 0;
    t.onUpdate = (dt) => { time += dt; const on = t.state.lit ? 1 : 0; light.setCandela?.(260 * on); M.flame.emissiveStrength = 10 * on; flame.visible = !!on; flame.scale.set([1 + 0.12 * Math.sin(time * 23), 1 + 0.2 * Math.sin(time * 17 + 1), 1 + 0.12 * Math.sin(time * 19 + 2)]); };
    t.sockets.flame = [0, L + 0.1 * s, 0];
  },
};

// Build a tool. makeTool('axe', { size: 1.1, wood: 'hickory', metal: 'rusty' })
export function makeTool(kind = 'axe', params = {}) {
  const p = { ...TOOL_DEFAULTS, ...params }, s = p.size;
  const M = toolMaterials(p);
  const name = kind[0].toUpperCase() + kind.slice(1);
  const t = new Prop(name, { kind: 'tool', params: { kind, ...p }, grip: { pose: TOOL_GRIP, socket: HAND_R } });
  t.toolKind = kind; t.materials = M; t.twoHanded = false;
  (BUILD[kind] || BUILD.axe)(p, M, t, s);
  return t;
}
