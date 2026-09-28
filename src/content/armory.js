// Armory: a parametric gun generator. Four actions, each built from shapes with working
// parts on a mechanism rig and clips for cocking, firing, cycling and reloading:
//   revolver  single-action six-shooter: hammer, turning cylinder, loading gate, ejector rod
//   lever     lever-action carbine: lever loop, sliding bolt, hammer, loading gate, tube magazine
//   bolt      bolt-action rifle: lifting and sliding bolt, 5-round magazine, optional scope
//   shotgun   double-barrel side-by-side: top lever, break-open barrels, extractor, two hammers
// Parameters change the barrel length, finish (blued, nickel, case-hardened, brass frame),
// wood, stock style, sights and scope. Every gun is a Prop: origin at the firing hand's
// grip, barrel along +Z, +Y up, with grip and support-hand information for Character.equip().
import { Kit, Material, Node, Prop, MechClip, cylinder, tube, torus, sphere, box } from '../engine/index.js';

export const GUN_KINDS = ['revolver', 'lever', 'bolt', 'shotgun'];
export const GUN_DEFAULTS = {
  revolver: { barrel: 0.12, finish: 'blued', frame: 'case', wood: 'walnut', engraved: false },
  lever: { barrel: 0.5, finish: 'blued', frame: 'brass', wood: 'walnut', engraved: false },
  bolt: { barrel: 0.6, finish: 'blued', frame: 'blued', wood: 'walnut', scope: false, engraved: false },
  shotgun: { barrel: 0.7, finish: 'blued', frame: 'case', wood: 'walnut', stock: 'straight', hammers: true, engraved: false },
};
export const GUN_FINISHES = ['blued', 'nickel', 'case', 'brass'];
export const WOODS = { walnut: ['#6a3a1e', '#2e170a'], maple: ['#b98a52', '#6b4520'], cherry: ['#8a3f22', '#3d160a'], ebony: ['#2b1d16', '#0d0806'], pearl: ['#e8e0d2', '#b8ad9c'] };

const METAL = {
  blued: { color: '#1c2230', roughness: 0.28 }, nickel: { color: '#b9bcc1', roughness: 0.16 },
  case: { color: '#6a5a4c', roughness: 0.32 }, brass: { color: '#c9a045', roughness: 0.26 },
};
export function gunMaterials(p) {
  const m = (name, key) => new Material({ name, ...METAL[key] || METAL.blued, metallic: 1, pattern: 'metal', patternScale: 3 });
  const w = WOODS[p.wood] || WOODS.walnut;
  return {
    metal: m('Barrel steel', p.finish), frame: m('Frame', p.frame || p.finish),
    wood: new Material({ name: 'Stock', color: w[0], roughness: 0.4, pattern: p.wood === 'pearl' ? 'none' : 'walnut', patternScale: 14, patternColor: w[1] }),
    brass: new Material({ name: 'Brass', color: '#c9a045', metallic: 1, roughness: 0.3 }),
    lead: new Material({ name: 'Lead', color: '#8a8d91', metallic: 0.7, roughness: 0.45 }),
    shell: new Material({ name: 'Shell', color: '#8e2a22', roughness: 0.55, pattern: 'stripes', patternScale: 1 }),
    bore: new Material({ name: 'Bore', color: '#050505', roughness: 0.9 }),
    rubber: new Material({ name: 'Butt pad', color: '#1a1512', roughness: 0.8 }),
    glass: new Material({ name: 'Lens', color: '#2a3a55', metallic: 0.5, roughness: 0.05 }),
  };
}

// a metallic cartridge lying along +Z (base at z=0)
function cartridge(kit, M, pos, len = 0.034, r = 0.0055) {
  kit.cyl(M.brass, [pos[0], pos[1], pos[2] + len * 0.35], r, len * 0.7, [90, 0, 0], 10);
  kit.cyl(M.brass, [pos[0], pos[1], pos[2] + 0.001], r * 1.15, 0.002, [90, 0, 0], 10); // rim
  kit.add(M.lead, sphere({ radius: r * 0.92, widthSegments: 10, heightSegments: 6, thetaLength: 90 }), [pos[0], pos[1], pos[2] + len * 0.7], [90, 0, 0], [1, 1.6, 1]);
}
function node(name, kit, pos = [0, 0, 0]) { const n = new Node(name); n.position.set(pos); if (kit) n.add(kit.toNode(name + ' mesh')); return n; }
const K = () => new Kit({});
const HAND_R = { position: [0.013, -0.058, 0.004], rotation: [90, 0, 0] };
const SUPPORT_POSE = { curl: [0.45, 0.55, 0.6, 0.65, 0.7], spread: 0.1 };

// a wooden buttstock from the wrist (z0) back to the butt
function buttstock(kit, M, { z0 = -0.01, len = 0.33, drop = 0.07, y0 = 0.0, wrist = 0.017, butt = 0.055, flatten = 0.5, pad = true } = {}) {
  const z1 = z0 - len;
  kit.add(M.wood, tube({ path: [[0, y0 + 0.004, z0], [0, y0 - 0.004, z0 - len * 0.25], [0, y0 - drop * 0.6, z0 - len * 0.65], [0, y0 - drop, z1]], radii: [wrist, wrist * 1.05, butt * 0.85, butt], radialSegments: 16, samples: 8, flatten }));
  if (pad) kit.box(M.rubber, [0, y0 - drop, z1 - 0.006], [butt * flatten * 2, butt * 2, 0.012], [0, 0, 0], 0.004);
}

// ------------------------------------------------------------------ revolver
function buildRevolver(p, M, gun) {
  const L = p.barrel, boreY = 0.036;
  const k = K();
  k.cyl(M.metal, [0, boreY, 0.047 + L / 2], 0.0085, L, [90, 0, 0], 20);
  k.cyl(M.bore, [0, boreY, 0.047 + L + 0.0005], 0.0042, 0.003, [90, 0, 0], 12);
  k.box(M.metal, [0, boreY + 0.0105, 0.041 + L], [0.0025, 0.005, 0.008]);
  k.cyl(M.metal, [-0.0075, boreY - 0.0115, 0.047 + L * 0.4], 0.0048, L * 0.72, [90, 0, 0], 12); // ejector housing
  k.box(M.frame, [0, boreY + 0.013, 0.022], [0.016, 0.006, 0.056], [0, 0, 0], 0.002);
  k.box(M.frame, [0, boreY - 0.019, 0.022], [0.02, 0.008, 0.052], [0, 0, 0], 0.002);
  k.box(M.frame, [0, boreY, -0.004], [0.026, 0.042, 0.012], [0, 0, 0], 0.003);
  k.box(M.frame, [0, boreY, 0.049], [0.024, 0.036, 0.008], [0, 0, 0], 0.003);
  k.box(M.metal, [0, 0.004, -0.012], [0.018, 0.03, 0.018], [-20, 0, 0], 0.003);
  k.add(M.brass, torus({ radius: 0.0135, tube: 0.0022, radialSegments: 8, tubularSegments: 24, arc: 200 }), [0, 0.006, 0.02], [0, 90, 105]);
  k.add(M.wood, tube({ path: [[0, 0.02, -0.008], [0, -0.012, -0.014], [0, -0.045, -0.024], [0, -0.07, -0.036]], radii: [0.0135, 0.0152, 0.0165, 0.0158], radialSegments: 16, samples: 10, flatten: 0.72 }));
  k.add(M.metal, sphere({ radius: 0.0165, widthSegments: 12, heightSegments: 6, thetaStart: 90, thetaLength: 90 }), [0, -0.071, -0.037], [0, 0, 0], [0.72, 0.45, 1]);
  gun.add(node('Frame', k));
  // cylinder with six chambers; each round is its own node so reloads can show and hide it
  const cyl = node('Cylinder', null, [0, boreY, 0.022]); const ck = K();
  ck.cyl(M.metal, [0, 0, 0], 0.0185, 0.04, [90, 0, 0], 24);
  const rounds = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    ck.box(M.bore, [c * 0.0182, s * 0.0182, 0.001], [0.004, 0.004, 0.028], [0, 0, (a * 180) / Math.PI], 0.001);
    ck.cyl(M.bore, [c * 0.0112, s * 0.0112, 0.0201], 0.0036, 0.002, [90, 0, 0], 10);
    const rk = K(); rk.cyl(M.brass, [0, 0, 0], 0.0049, 0.002, [90, 0, 0], 10); rk.cyl(M.brass, [0, 0, 0.012], 0.0042, 0.024, [90, 0, 0], 8);
    const r = node('Round ' + (i + 1), rk, [c * 0.0112, s * 0.0112, -0.0205]); cyl.add(r); rounds.push(r);
  }
  cyl.add(ck.toNode('Cylinder mesh'));
  const ham = node('Hammer', null, [0, boreY + 0.004, -0.012]); const hk = K();
  hk.box(M.metal, [0, 0.008, -0.004], [0.006, 0.02, 0.008], [-25, 0, 0], 0.002); hk.box(M.metal, [0, 0.018, -0.011], [0.009, 0.004, 0.009], [-35, 0, 0], 0.0015);
  ham.add(hk.toNode('Hammer mesh'));
  const trig = node('Trigger', null, [0, 0.014, 0.018]); const tk = K(); tk.box(M.metal, [0, -0.01, -0.002], [0.004, 0.018, 0.004], [18, 0, 0]); trig.add(tk.toNode('Trigger mesh'));
  const gate = node('Loading gate', null, [-0.011, boreY, 0.0]); const gk = K(); gk.box(M.frame, [0, 0, 0.006], [0.003, 0.014, 0.012], [0, 0, 0], 0.001); gate.add(gk.toNode('Gate mesh'));
  const rod = node('Ejector rod', null, [-0.0075, boreY - 0.0115, 0]); const ek = K(); ek.cyl(M.metal, [0, 0, 0.047 + L * 0.72], 0.0036, 0.012, [90, 0, 0], 10); rod.add(ek.toNode('Rod mesh'));
  gun.add(cyl, ham, trig, gate, rod);
  const R = gun.rig;
  R.add('hammer', ham, { axis: [1, 0, 0], min: -40, max: 0, stiffness: 900 });
  R.add('cylinder', cyl, { type: 'spin', axis: [0, 0, 1], stiffness: 400 });
  R.add('trigger', trig, { axis: [1, 0, 0], min: -18, max: 0, stiffness: 900 });
  R.add('gate', gate, { axis: [0, 1, 0], min: -85, max: 0, stiffness: 300 });
  R.add('ejector', rod, { type: 'slide', axis: [0, 0, 1], min: -0.05, max: 0, stiffness: 600 });
  const st = gun.state = { capacity: 6, rounds: [true, true, true, true, true, true], spent: [false, false, false, false, false, false], bore: 0, spin: 90, cocked: false };
  R.get('cylinder').snap(90); // chamber 0 lines up with the barrel (top, 90°)
  const chamberAt = (angle) => (i) => angle - i * 60; // spin that puts chamber i at `angle` degrees
  const next = (cur, want) => { let s = want; while (s < cur + 1e-3) s += 360; while (s - 360 > cur + 1e-3) s -= 360; return s; };
  gun.sockets.muzzle = [0, boreY, 0.05 + L];
  gun.handlers.eject = (i) => { rounds[i].visible = false; st.rounds[i] = false; st.spent[i] = false; };
  gun.handlers.load = (i) => { rounds[i].visible = true; st.rounds[i] = true; st.spent[i] = false; };
  gun.cock = () => {
    if (st.cocked || gun.rig.playing) return Promise.resolve(false);
    st.bore = (st.bore + 1) % 6; const to = next(st.spin, chamberAt(90)(st.bore)); const from = st.spin; st.spin = to;
    st.cocked = true;
    return gun.play2(new MechClip('Cock', 0.22, { hammer: [[0, 0], [0.22, -38, 'snap']], cylinder: [[0, from], [0.05, from, 'step'], [0.2, to, 'inOut']] }, [{ t: 0.22, name: 'click' }]));
  };
  gun.fire = async () => {
    if (gun.rig.playing) return false;
    if (!st.cocked) await gun.cock();
    const live = st.rounds[st.bore] && !st.spent[st.bore];
    st.cocked = false;
    gun.play2(new MechClip('Fire', 0.12, { trigger: [[0, 0], [0.03, -16], [0.12, 0]], hammer: [[0, -38], [0.035, 0, 'in']] }, [{ t: 0.035, name: live ? 'shot' : 'dryfire' }]));
    if (live) st.spent[st.bore] = true;
    return live;
  };
  gun.reload = () => {
    if (gun.rig.playing) return Promise.resolve(false);
    const steps = [{ set: { hammer: -12 }, duration: 0.12 }, { set: { gate: -80 }, duration: 0.18, event: 'gateOpen' }];
    let s = st.spin;
    for (let n = 0; n < 6; n++) {
      const i = (st.bore + 1 + n) % 6;
      if (st.rounds[i] && !st.spent[i]) continue;
      s = next(s, chamberAt(180)(i)); // chamber i lines up with the gate on the right side
      steps.push({ set: { cylinder: s }, duration: 0.14 });
      if (st.spent[i]) steps.push({ set: { ejector: -0.045 }, duration: 0.1, event: 'eject', data: i, eventAt: 0.08 }, { set: { ejector: 0 }, duration: 0.08 });
      steps.push({ set: { cylinder: s }, duration: 0.28, event: 'load', data: i, eventAt: 0.22 });
    }
    // close up with an empty or the next live chamber under the hammer
    const bore = st.bore; s = next(s, chamberAt(90)(bore));
    steps.push({ set: { gate: 0 }, duration: 0.15, event: 'gateClose' }, { set: { cylinder: s, hammer: 0 }, duration: 0.2 });
    st.spin = s; st.cocked = false;
    return gun.play2(MechClip.sequence('Reload', steps));
  };
  gun.ammo = () => st.rounds.filter((r, i) => r && !st.spent[i]).length;
}

// ------------------------------------------------------------------ lever action
function buildLever(p, M, gun) {
  const L = p.barrel, boreY = 0.036, rz0 = 0.03, rz1 = 0.17;
  const k = K();
  // receiver with side plates, barrel, magazine tube, forestock and barrel band
  k.box(M.frame, [0, 0.016, (rz0 + rz1) / 2], [0.034, 0.05, rz1 - rz0], [0, 0, 0], 0.004);
  k.box(M.frame, [0, 0.043, (rz0 + rz1) / 2 + 0.01], [0.026, 0.008, rz1 - rz0 - 0.02], [0, 0, 0], 0.003);
  k.cyl(M.metal, [0, boreY, rz1 + L / 2], 0.0095, L, [90, 0, 0], 18);
  k.cyl(M.metal, [0, boreY, rz1 + 0.02], 0.012, 0.04, [90, 0, 0], 18);
  k.cyl(M.bore, [0, boreY, rz1 + L + 0.001], 0.0045, 0.003, [90, 0, 0], 10);
  k.cyl(M.metal, [0, 0.013, rz1 + (L - 0.04) / 2], 0.0085, L - 0.04, [90, 0, 0], 14);
  k.add(M.wood, tube({ path: [[0, 0.02, rz1], [0, 0.02, rz1 + 0.26]], radii: [0.02, 0.018], radialSegments: 14, samples: 2, flatten: 0.85 }));
  k.cyl(M.metal, [0, 0.024, rz1 + 0.265], 0.022, 0.012, [90, 0, 0], 16);
  k.cyl(M.metal, [0, 0.024, rz1 + L - 0.04], 0.02, 0.01, [90, 0, 0], 16);
  k.box(M.metal, [0, boreY + 0.012, rz1 + L - 0.015], [0.003, 0.007, 0.01]);         // front sight
  k.box(M.metal, [0, boreY + 0.012, rz1 + 0.12], [0.014, 0.006, 0.01]);              // rear sight
  k.box(M.metal, [0, 0.004, -0.004], [0.022, 0.02, 0.07], [0, 0, 0], 0.003);          // tang / wrist strap
  buttstock(k, M, { z0: -0.005, len: 0.33, y0: 0.012, drop: 0.055, wrist: 0.018, butt: 0.052, flatten: 0.48 });
  gun.add(node('Receiver', k));
  const lever = node('Lever', null, [0, -0.01, 0.15]); const lk = K();
  lk.box(M.metal, [0, -0.004, -0.06], [0.008, 0.008, 0.12], [0, 0, 0], 0.002);
  lk.add(M.metal, torus({ radius: 0.03, tube: 0.004, radialSegments: 8, tubularSegments: 24, arc: 260 }), [0, -0.034, -0.1], [0, 90, 40]);
  lk.box(M.metal, [0, -0.02, -0.005], [0.008, 0.03, 0.01]);
  lever.add(lk.toNode('Lever mesh'));
  const bolt = node('Bolt', null, [0, boreY + 0.004, rz0 + 0.03]); const bk = K(); bk.box(M.metal, [0, 0, 0], [0.012, 0.012, 0.06], [0, 0, 0], 0.003); bolt.add(bk.toNode('Bolt mesh'));
  const ham = node('Hammer', null, [0, 0.026, rz0 - 0.004]); const hk = K(); hk.box(M.metal, [0, 0.014, -0.004], [0.007, 0.028, 0.009], [-18, 0, 0], 0.002); hk.box(M.metal, [0, 0.028, -0.013], [0.01, 0.005, 0.012], [-30, 0, 0], 0.002); ham.add(hk.toNode('Hammer mesh'));
  const trig = node('Trigger', null, [0, -0.008, 0.07]); const tk = K(); tk.box(M.metal, [0, -0.01, 0], [0.004, 0.018, 0.004], [15, 0, 0]); trig.add(tk.toNode('Trigger mesh'));
  const gate = node('Loading gate', null, [-0.0175, 0.012, 0.13]); const gk = K(); gk.box(M.frame, [0, 0, -0.012], [0.002, 0.016, 0.024]); gate.add(gk.toNode('Gate mesh'));
  // a cartridge that slides into the gate during reloads (hidden otherwise)
  const feed = node('Feed round', null, [-0.035, 0.012, 0.14]); const fk = K(); cartridge(fk, M, [0, 0, -0.04], 0.04, 0.0058); feed.add(fk.toNode('Feed mesh')); feed.visible = false;
  gun.add(lever, bolt, ham, trig, gate, feed);
  const R = gun.rig;
  R.add('lever', lever, { axis: [1, 0, 0], min: -55, max: 0, stiffness: 500 });
  R.add('bolt', bolt, { type: 'slide', axis: [0, 0, 1], min: -0.055, max: 0, stiffness: 700 });
  R.add('hammer', ham, { axis: [1, 0, 0], min: -35, max: 0, stiffness: 900 });
  R.add('trigger', trig, { axis: [1, 0, 0], min: -15, max: 0, stiffness: 900 });
  R.add('gate', gate, { axis: [0, 1, 0], min: 0, max: 35, stiffness: 600 });
  R.add('feed', feed, { type: 'slide', axis: [-0.55, 0, 0.83], min: -0.02, max: 0.05, stiffness: 600 });
  const cap = Math.round(6 + L * 16);
  const st = gun.state = { capacity: cap + 1, magazine: cap, chambered: true, cocked: false, spentInChamber: false };
  gun.sockets.muzzle = [0, boreY, rz1 + L + 0.005]; gun.sockets.ejection = [0, boreY + 0.02, rz0 + 0.06];
  gun.support = { position: [0, 0.0, rz1 + 0.13], pose: SUPPORT_POSE };
  gun.handlers.eject = () => { st.spentInChamber = false; };
  gun.handlers.chamber = () => { if (st.magazine > 0) { st.magazine--; st.chambered = true; } };
  gun.handlers.feedIn = () => { feed.visible = false; st.magazine = Math.min(cap, st.magazine + 1); };
  gun.handlers.feedShow = () => { feed.visible = true; };
  const cycle = () => { st.cocked = true; return gun.play2(new MechClip('Cycle', 0.46, {
    lever: [[0, 0], [0.2, -52, 'out'], [0.24, -52], [0.44, 0, 'in']], bolt: [[0, 0], [0.2, -0.052, 'out'], [0.24, -0.052], [0.44, 0, 'in']], hammer: [[0, 0], [0.18, -34, 'out']],
  }, [{ t: 0.18, name: st.chambered ? 'eject' : 'dry' }, { t: 0.4, name: 'chamber' }, { t: 0.46, name: 'click' }])).then(() => { st.chambered = st.chambered; }); };
  // a round already in the chamber: thumb the hammer back; otherwise work the lever
  gun.cock = () => {
    if (gun.rig.playing) return Promise.resolve(false);
    if (st.chambered) { st.cocked = true; return gun.play2(new MechClip('Cock', 0.2, { hammer: [[0, 0], [0.2, -34, 'snap']] }, [{ t: 0.2, name: 'click' }])); }
    return cycle();
  };
  gun.fire = async () => {
    if (gun.rig.playing) return false;
    if (!st.cocked) await gun.cock();
    const live = st.chambered;
    st.cocked = false; st.chambered = false;
    gun.play2(new MechClip('Fire', 0.12, { trigger: [[0, 0], [0.03, -14], [0.12, 0]], hammer: [[0, -34], [0.035, 0, 'in']] }, [{ t: 0.035, name: live ? 'shot' : 'dryfire' }]));
    return live;
  };
  gun.reload = () => {
    if (gun.rig.playing || st.magazine >= cap) return Promise.resolve(false);
    const steps = [];
    for (let n = st.magazine; n < cap; n++) steps.push(
      { set: { feed: -0.02 }, duration: 0.01, event: 'feedShow', eventAt: 0 },
      { set: { feed: 0.045, gate: 30 }, duration: 0.24, ease: 'in', event: 'feedIn' },
      { set: { gate: 0, feed: -0.02 }, duration: 0.1 },
    );
    return gun.play2(MechClip.sequence('Reload', steps));
  };
  gun.ammo = () => st.magazine + (st.chambered ? 1 : 0);
}

// ------------------------------------------------------------------ bolt action
function buildBolt(p, M, gun) {
  const L = p.barrel, boreY = 0.03, rz0 = 0.02, rz1 = 0.2;
  const k = K();
  k.cyl(M.frame, [0, boreY, (rz0 + rz1) / 2], 0.015, rz1 - rz0, [90, 0, 0], 20);
  k.cyl(M.metal, [0, boreY, rz1 + L / 2], 0.0105, L, [90, 0, 0], 18, 0.0085);
  k.cyl(M.bore, [0, boreY, rz1 + L + 0.001], 0.004, 0.003, [90, 0, 0], 10);
  // one-piece stock: forend under the barrel, magazine well, pistol-grip wrist and butt
  k.add(M.wood, tube({ path: [[0, 0.012, rz0 - 0.02], [0, 0.013, rz1], [0, 0.017, rz1 + L * 0.7]], radii: [0.024, 0.022, 0.016], radialSegments: 16, samples: 6, flatten: 0.8 }));
  k.box(M.wood, [0, -0.006, 0.02], [0.03, 0.05, 0.05], [-20, 0, 0], 0.01);   // pistol grip
  buttstock(k, M, { z0: -0.005, len: 0.34, y0: 0.018, drop: 0.045, wrist: 0.02, butt: 0.056, flatten: 0.5 });
  k.box(M.metal, [0, -0.012, 0.13], [0.022, 0.006, 0.08], [0, 0, 0], 0.002);  // floor plate
  k.add(M.metal, torus({ radius: 0.017, tube: 0.0025, radialSegments: 8, tubularSegments: 20, arc: 200 }), [0, -0.006, 0.07], [0, 90, 100]);
  for (const z of [rz1 + L * 0.45, rz1 + L * 0.68]) k.cyl(M.metal, [0, 0.019, z], 0.02, 0.01, [90, 0, 0], 14);
  k.box(M.metal, [0, boreY + 0.012, rz1 + L - 0.01], [0.003, 0.008, 0.008]);
  if (p.scope) {
    k.cyl(M.metal, [0, boreY + 0.045, 0.14], 0.013, 0.24, [90, 0, 0], 20);
    k.cyl(M.metal, [0, boreY + 0.045, 0.28], 0.019, 0.07, [90, 0, 0], 20, 0.013);
    k.cyl(M.metal, [0, boreY + 0.045, 0.03], 0.017, 0.05, [90, 0, 0], 20, 0.013);
    k.cyl(M.glass, [0, boreY + 0.045, 0.316], 0.017, 0.002, [90, 0, 0], 20);
    for (const z of [0.07, 0.2]) k.box(M.metal, [0, boreY + 0.026, z], [0.012, 0.026, 0.014], [0, 0, 0], 0.002);
    gun.sockets.scope = [0, boreY + 0.045, -0.02];
  } else k.box(M.metal, [0, boreY + 0.018, rz1 + 0.06], [0.012, 0.01, 0.02]);
  gun.add(node('Stock', k));
  // bolt: slides back inside a node that lifts (rotates) the handle
  const slide = node('Bolt', null, [0, boreY, rz0 + 0.02]);
  const turn = node('Bolt turn', null); const bk = K();
  bk.cyl(M.metal, [0, 0, 0.02], 0.0105, 0.1, [90, 0, 0], 16);
  bk.box(M.metal, [-0.025, -0.006, -0.012], [0.04, 0.006, 0.006], [0, 0, 20]);
  bk.add(M.metal, sphere({ radius: 0.009, widthSegments: 12, heightSegments: 8 }), [-0.046, -0.014, -0.012]);
  turn.add(bk.toNode('Bolt mesh')); slide.add(turn);
  const trig = node('Trigger', null, [0, -0.003, 0.068]); const tk = K(); tk.box(M.metal, [0, -0.01, 0], [0.004, 0.018, 0.004], [15, 0, 0]); trig.add(tk.toNode('Trigger mesh'));
  // rounds in the magazine (seen when the bolt is open), topped up one at a time
  const mag = []; const magNode = new Node('Magazine');
  for (let i = 0; i < 5; i++) { const rk = K(); cartridge(rk, M, [0, 0, 0], 0.07, 0.006); const r = node('Mag round ' + (i + 1), rk, [(i % 2 ? 0.004 : -0.004), boreY - 0.012 - i * 0.008, rz0 + 0.06]); magNode.add(r); mag.push(r); }
  gun.add(slide, trig, magNode);
  const R = gun.rig;
  R.add('bolt', slide, { type: 'slide', axis: [0, 0, 1], min: -0.1, max: 0, stiffness: 700 });
  R.add('boltTurn', turn, { axis: [0, 0, 1], min: -85, max: 0, stiffness: 700 });
  R.add('trigger', trig, { axis: [1, 0, 0], min: -14, max: 0, stiffness: 900 });
  const st = gun.state = { capacity: 6, magazine: 5, chambered: true, cocked: true };
  const showMag = () => mag.forEach((r, i) => (r.visible = i < st.magazine));
  gun.sockets.muzzle = [0, boreY, rz1 + L + 0.005]; gun.sockets.ejection = [-0.02, boreY + 0.01, rz0 + 0.05];
  gun.support = { position: [0, 0.0, rz1 + 0.16], pose: SUPPORT_POSE };
  gun.handlers.eject = () => {};
  gun.handlers.chamber = () => { if (st.magazine > 0) { st.magazine--; st.chambered = true; showMag(); } };
  gun.handlers.loadMag = () => { st.magazine = Math.min(5, st.magazine + 1); showMag(); };
  const open = [{ set: { boltTurn: -82 }, duration: 0.12 }, { set: { bolt: -0.095 }, duration: 0.14, ease: 'out', event: 'eject' }];
  const close = [{ set: { bolt: 0 }, duration: 0.14, ease: 'in', event: 'chamber', eventAt: 0.1 }, { set: { boltTurn: 0 }, duration: 0.1, event: 'click' }];
  gun.cock = () => { if (gun.rig.playing) return Promise.resolve(false); st.chambered = false; st.cocked = true; return gun.play2(MechClip.sequence('Cycle', [...open, ...close])); };
  gun.fire = async () => {
    if (gun.rig.playing) return false;
    if (!st.cocked) await gun.cock();
    const live = st.chambered; st.chambered = false; st.cocked = false;
    gun.play2(new MechClip('Fire', 0.1, { trigger: [[0, 0], [0.03, -13], [0.1, 0]] }, [{ t: 0.03, name: live ? 'shot' : 'dryfire' }]));
    return live;
  };
  gun.reload = () => {
    if (gun.rig.playing || st.magazine >= 5) return Promise.resolve(false);
    const steps = [...open];
    for (let n = st.magazine; n < 5; n++) steps.push({ set: { bolt: -0.095 }, duration: 0.22, event: 'loadMag', eventAt: 0.18 });
    steps.push(...close);
    st.cocked = true; st.chambered = st.chambered || false;
    return gun.play2(MechClip.sequence('Reload', steps));
  };
  gun.ammo = () => st.magazine + (st.chambered ? 1 : 0);
}

// ------------------------------------------------------------------ double-barrel shotgun
function buildShotgun(p, M, gun) {
  const L = p.barrel, hingeZ = 0.12, boreY = 0.03, sep = 0.0105;
  const k = K();
  k.box(M.frame, [0, 0.012, 0.07], [0.04, 0.05, 0.1], [0, 0, 0], 0.006);
  k.box(M.metal, [0, 0.0, -0.005], [0.022, 0.02, 0.07], [0, 0, 0], 0.003);
  k.add(M.metal, torus({ radius: 0.017, tube: 0.0025, radialSegments: 8, tubularSegments: 20, arc: 200 }), [0, -0.012, 0.055], [0, 90, 100]);
  if (p.stock === 'pistol') { k.box(M.wood, [0, -0.02, 0.0], [0.03, 0.06, 0.045], [-25, 0, 0], 0.01); buttstock(k, M, { z0: 0.0, len: 0.33, y0: 0.012, drop: 0.05, wrist: 0.02, butt: 0.058, flatten: 0.5 }); }
  else buttstock(k, M, { z0: 0.0, len: 0.35, y0: 0.012, drop: 0.06, wrist: 0.017, butt: 0.058, flatten: 0.48 });
  gun.add(node('Action', k));
  // barrels, rib, forend and the two shells, all hinged at the pin under the breech
  const bar = node('Barrels', null, [0, -0.006, hingeZ]); const bk = K();
  for (const s of [-1, 1]) { bk.cyl(M.metal, [s * sep, boreY + 0.006, L / 2], 0.0105, L, [90, 0, 0], 18, 0.0095); bk.cyl(M.bore, [s * sep, boreY + 0.006, L + 0.001], 0.0088, 0.003, [90, 0, 0], 14); }
  bk.box(M.metal, [0, boreY + 0.019, L / 2], [0.008, 0.004, L], [0, 0, 0], 0.001);
  bk.box(M.metal, [0, boreY - 0.006, L / 2], [0.012, 0.01, L], [0, 0, 0], 0.001);
  bk.add(M.wood, tube({ path: [[0, 0.014, 0.01], [0, 0.012, 0.23]], radii: [0.022, 0.02], radialSegments: 14, samples: 2, flatten: 0.9 }));
  bk.add(M.brass, sphere({ radius: 0.0025, widthSegments: 8, heightSegments: 6 }), [0, boreY + 0.023, L - 0.01]);
  bar.add(bk.toNode('Barrels mesh'));
  const ext = node('Extractor', null, [0, boreY + 0.006, -0.002]); bar.add(ext);
  const shells = [-1, 1].map((s, i) => { const sk = K(); sk.cyl(M.shell, [0, 0, 0.03], 0.0092, 0.058, [90, 0, 0], 12); sk.cyl(M.brass, [0, 0, 0.004], 0.0102, 0.012, [90, 0, 0], 12); const n = node('Shell ' + (i + 1), sk, [s * sep, 0, 0]); ext.add(n); return n; });
  const lever = node('Top lever', null, [0, 0.038, 0.035]); const lk = K(); lk.box(M.metal, [0, 0.003, -0.022], [0.008, 0.005, 0.045], [0, 0, 0], 0.002); lever.add(lk.toNode('Lever mesh'));
  const hams = [];
  if (p.hammers) for (const s of [-1, 1]) { const h = node('Hammer ' + (s < 0 ? 'R' : 'L'), null, [s * 0.014, 0.03, 0.03]); const hk = K(); hk.box(M.metal, [0, 0.012, -0.004], [0.006, 0.024, 0.008], [-20, 0, 0], 0.002); hk.box(M.metal, [0, 0.023, -0.011], [0.008, 0.004, 0.01], [-35, 0, 0], 0.002); h.add(hk.toNode('Hammer mesh')); hams.push(h); }
  const trig = node('Triggers', null, [0, -0.004, 0.06]); const tk = K(); tk.box(M.metal, [0.003, -0.01, 0], [0.003, 0.016, 0.004], [15, 0, 0]); tk.box(M.metal, [-0.003, -0.01, -0.012], [0.003, 0.016, 0.004], [15, 0, 0]); trig.add(tk.toNode('Trigger mesh'));
  gun.add(bar, lever, trig, ...hams);
  const R = gun.rig;
  R.add('barrels', bar, { axis: [1, 0, 0], min: 0, max: 38, stiffness: 300 });
  R.add('extractor', ext, { type: 'slide', axis: [0, 0, 1], min: -0.03, max: 0, stiffness: 600 });
  R.add('lever', lever, { axis: [0, 1, 0], min: -40, max: 0, stiffness: 500 });
  R.add('trigger', trig, { axis: [1, 0, 0], min: -14, max: 0, stiffness: 900 });
  hams.forEach((h, i) => R.add('hammer' + i, h, { axis: [1, 0, 0], min: -35, max: 0, stiffness: 900 }));
  const st = gun.state = { capacity: 2, shells: [true, true], spent: [false, false], cocked: [!p.hammers, !p.hammers], next: 0 };
  gun.sockets.muzzle = [0, boreY, hingeZ + L]; gun.sockets.ejection = [0, boreY, 0.1];
  gun.support = { position: [0, 0.0, hingeZ + 0.12], pose: SUPPORT_POSE };
  gun.handlers.eject = () => shells.forEach((s, i) => { if (st.spent[i] || !st.shells[i]) { s.visible = false; st.shells[i] = false; st.spent[i] = false; } });
  gun.handlers.load = (i) => { shells[i].visible = true; st.shells[i] = true; st.spent[i] = false; };
  gun.cock = () => {
    if (gun.rig.playing || !p.hammers) return Promise.resolve(false);
    const i = st.next; st.cocked[i] = true;
    return gun.play2(new MechClip('Cock', 0.18, { ['hammer' + i]: [[0, 0], [0.18, -33, 'snap']] }, [{ t: 0.18, name: 'click' }]));
  };
  gun.fire = async () => {
    if (gun.rig.playing) return false;
    const i = st.next;
    if (!st.cocked[i]) await gun.cock();
    const live = st.shells[i] && !st.spent[i];
    if (live) st.spent[i] = true;
    if (p.hammers) st.cocked[i] = false;
    st.next = 1 - i;
    const tracks = { trigger: [[0, 0], [0.03, -12], [0.12, 0]] };
    if (p.hammers) tracks['hammer' + i] = [[0, -33], [0.035, 0, 'in']];
    gun.play2(new MechClip('Fire', 0.12, tracks, [{ t: 0.035, name: live ? 'shot' : 'dryfire' }]));
    return live;
  };
  gun.reload = () => {
    if (gun.rig.playing) return Promise.resolve(false);
    const need = [0, 1].filter((i) => !st.shells[i] || st.spent[i]);
    if (!need.length) return Promise.resolve(false);
    const steps = [{ set: { lever: -38 }, duration: 0.1 }, { set: { barrels: 36 }, duration: 0.22, ease: 'out' }, { set: { lever: 0 }, duration: 0.06 },
      { set: { extractor: -0.028 }, duration: 0.08, event: 'eject' }, { set: { extractor: -0.028 }, duration: 0.12 }, { set: { extractor: 0 }, duration: 0.05 }];
    for (const i of need) steps.push({ set: { barrels: 36 }, duration: 0.32, event: 'load', data: i, eventAt: 0.26 });
    steps.push({ set: { barrels: 0 }, duration: 0.16, ease: 'in', event: 'click' });
    st.next = st.spent[0] || !st.shells[0] ? 0 : st.next;
    return gun.play2(MechClip.sequence('Reload', steps));
  };
  gun.ammo = () => st.shells.filter((s, i) => s && !st.spent[i]).length;
}

// Build a gun. makeGun('lever', { barrel: 0.6, finish: 'nickel', wood: 'maple' })
export function makeGun(kind = 'revolver', params = {}) {
  const p = { ...(GUN_DEFAULTS[kind] || GUN_DEFAULTS.revolver), ...params };
  const M = gunMaterials(p);
  if (p.engraved) { M.frame.pattern = 'walnut'; M.frame.patternScale = 60; M.frame.patternColor = '#2a2218'; M.frame.patternStrength = 0.5; }
  const names = { revolver: 'Single-action revolver', lever: 'Lever-action carbine', bolt: 'Bolt-action rifle', shotgun: 'Double-barrel shotgun' };
  const gun = new Prop(names[kind] || 'Gun', { kind: 'gun', params: { kind, ...p }, grip: { pose: 'gunGrip', socket: HAND_R } });
  gun.gunKind = kind; gun.materials = M;
  // play a one-off clip (actions build theirs on the fly) and resolve when it ends
  gun.play2 = (clip) => new Promise((res) => gun.rig.play(clip, { onDone: res }));
  ({ revolver: buildRevolver, lever: buildLever, bolt: buildBolt, shotgun: buildShotgun }[kind] || buildRevolver)(p, M, gun);
  gun.twoHanded = kind !== 'revolver';
  return gun;
}
