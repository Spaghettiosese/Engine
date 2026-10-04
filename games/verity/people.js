// People of Verity: every human is the engine's rigged Cowboy skeleton and part library,
// re-dressed (clothes, hair, skin, glasses, hoods, backpacks) and re-proportioned (height,
// bigger heads for kids), plus the animations the story needs: sitting, talking, scared,
// crying, typing, driving. All humans share one skeleton, so the clips are made once.
import { Character, expandSkeleton } from '../../src/engine/character.js';
import { Skeleton } from '../../src/engine/skeleton.js';
import { synthesizeIdle, synthesizeLocomotion } from '../../src/engine/gait.js';
import { keyPoseClip } from '../../src/engine/choreo.js';
import { COWBOY_SKELETON, COWBOY_MATERIALS, COWBOY_PARTS } from '../../src/content/cowboy.js';
import { gestureClips } from '../../src/content/moves.js';

// ------------------------------------------------------------------ colour helpers
function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function hex(c) { return '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
export function shade(h, k) { return hex(rgb(h).map((v) => v * k)); }
function mix(a, b, t) { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * t)); }

// ------------------------------------------------------------------ parts
const P = (name, shape, material, bind, o = {}) => ({ name, shape, material, bind, position: o.position || [0, 0, 0], rotation: o.rotation || [0, 0, 0], scale: o.scale || [1, 1, 1], modifiers: o.modifiers || [], ...(o.mirror ? { mirror: true } : {}), ...(o.castShadow === false ? { castShadow: false } : {}) });
const sq = (rx, ry, rz, e1, e2, extra = {}) => ({ type: 'superquadric', rx, ry, rz, e1, e2, widthSegments: 28, heightSegments: 18, phiStart: 0, phiLength: 360, thetaStart: 0, thetaLength: 180, taperTop: 1, taperBottom: 1, ...extra });
const rbox = (w, h, d, bevel, extra = {}) => ({ type: 'box', width: w, height: h, depth: d, bevel, bevelSegments: 3, ...extra });
const sph = (r) => ({ type: 'sphere', radius: r, widthSegments: 16, heightSegments: 12, phiStart: 0, phiLength: 360, thetaStart: 0, thetaLength: 180 });
const tubeShape = (path, radii, extra = {}) => ({ type: 'tube', path, radii, radialSegments: 12, samples: 6, caps: true, flatten: 1, arc: 360, arcOffset: 0, twist: 0, ...extra });

const DROP = new Set(['Hat Crown', 'Hat Brim', 'Hat Band', 'Hat Concho', 'Bandana Collar', 'Bandana Flap', 'Vest', 'Vest Pocket', 'Sheriff Badge', 'Badge Rim', 'Holster', 'Holster Loop',
  'Revolver Cylinder', 'Revolver Grip', 'Revolver Hammer', 'Lasso', 'Chaps', 'Chaps Fringe', 'Glove Cuff', 'Spur Strap', 'Spur Shank', 'Spur Rowel', 'Boot Shaft', 'Boot Heel', 'Hair', 'Sideburn', 'Belt', 'Buckle', 'Buckle Star', 'Shirt Buttons', 'Collar']);
const HEAD_PARTS = new Set(['Head', 'Jaw', 'Nose', 'Ear', 'Eye', 'Eyelid', 'Brow', 'Mustache', 'Mouth', 'Cheekbone', 'Brow Ridge', 'Nose Bridge', 'Nostril', 'Upper Lip', 'Lower Lip', 'Chin']);
const HEAD_PIVOT = [0, 1.6, 0.01];
const HAND_PARTS = new Set(['Palm', 'Index Finger', 'Middle Finger', 'Ring Finger', 'Pinky Finger', 'Thumb']);
const SOLE = { color: '#d9d6cf', roughness: 0.75 };

function scaleAbout(p, pivot, k) { return [pivot[0] + (p[0] - pivot[0]) * k, pivot[1] + (p[1] - pivot[1]) * k, pivot[2] + (p[2] - pivot[2]) * k]; }
function enlargeHead(part, k) {
  part.position = scaleAbout(part.position, HEAD_PIVOT, k);
  part.scale = part.scale.map((v) => v * k);
  const s = part.shape;
  if (s && s.path) { s.path = s.path.map((p) => scaleAbout(p, HEAD_PIVOT, k)); s.radii = s.radii.map((r) => r * k); }
}

// Hairstyles are built around the Cowboy's head (centre 0, 1.705, 0.012; radii .097 x .114 x .105).
// The head's own 'profile' (narrow chin, full cranium) is applied over each part's height, so a
// hair cap that covers only a slice of the head needs the matching slice of that profile.
const HEAD_PROFILE = [0.72, 0.9, 1.0, 1.0, 0.94];
const profAt = (t) => { const V = HEAD_PROFILE, x = t * (V.length - 1), j = Math.min(V.length - 2, Math.max(0, Math.floor(x))), f = x - j, sm = f * f * (3 - 2 * f); return V[j] + (V[j + 1] - V[j]) * sm; };
const yFrac = (th) => (Math.pow(Math.max(0, Math.cos((th * Math.PI) / 180)), 0.78) + 1) / 2; // polar degrees -> 0..1 up the head
function slicedProfile(th0, th1, n = 7) {
  const hi = yFrac(th0), lo = yFrac(th1);
  return Array.from({ length: n }, (_, i) => profAt(lo + ((hi - lo) * i) / (n - 1)));
}
const sliceMods = (th0, th1) => [{ type: 'profile', axis: 'y', values: slicedProfile(th0, th1) }, { type: 'solidify', thickness: 0.004 }];

function hairParts(style, colour) {
  const H = [0, 1.705, 0.012];
  // polar angles are measured from the crown (0) down to the eyes (about 87); phi 0 is the face.
  // top: the whole crown down to the hairline; back: sides and nape, never the face.
  const cap = (k = 1.04, front = 58, back = 98) => [
    P('Hair', sq(0.097, 0.114, 0.105, 0.78, 0.9, { thetaStart: 0, thetaLength: front, widthSegments: 32, heightSegments: 12 }), 'hair', { bone: 'head' }, { position: H, scale: [k, k * 0.99, k], modifiers: sliceMods(0, front) }),
    P('Hair Back', sq(0.097, 0.114, 0.105, 0.78, 0.9, { phiStart: 52, phiLength: 256, thetaStart: front - 1, thetaLength: back - front + 1, widthSegments: 36, heightSegments: 8 }), 'hair', { bone: 'head' }, { position: H, scale: [k, k * 0.99, k], modifiers: sliceMods(front - 1, back) }),
  ];
  const sideburn = (y = 1.7) => P('Sideburn', rbox(0.012, 0.045, 0.02, 0.005), 'hair', { bone: 'head' }, { position: [0.09, y, 0.035], rotation: [0, -10, 4], mirror: true });
  switch (style) {
    case 'none': case 'bald': return [];
    case 'buzz': return cap(1.012, 56, 90);
    case 'short': return [...cap(1.035, 58, 96), sideburn()];
    case 'side': return [...cap(1.04, 54, 100), P('Part Lock', rbox(0.05, 0.012, 0.03, 0.005), 'hair', { bone: 'head' }, { position: [0.025, 1.775, 0.108], rotation: [-6, 0, -14] }), sideburn()];
    case 'bowl': return [...cap(1.07, 72, 104)];
    case 'spiky': return [...cap(1.03, 54, 92), ...[-0.05, -0.02, 0.02, 0.05].map((x, i) => P('Spike ' + i, { type: 'cone', radius: 0.018, height: 0.05, radialSegments: 6, heightSegments: 1, capBottom: true, arc: 360 }, 'hair', { bone: 'head' }, { position: [x, 1.84 + (i % 2) * 0.008, 0.02 + (i % 2) * 0.03], rotation: [-10 + i * 6, 0, x * 260] }))];
    case 'long': return [...cap(1.045, 56, 108),
      P('Hair Fall', tubeShape([[0.088, 1.76, -0.015], [0.1, 1.62, -0.065], [0.094, 1.46, -0.088], [0.082, 1.33, -0.092]], [0.032, 0.044, 0.05, 0.042], { caps: true }), 'hair', { bones: ['head', 'neck', 'chest'], falloff: 5 }, { mirror: true }),
      P('Hair Back', sq(0.09, 0.2, 0.05, 0.8, 0.9), 'hair', { bones: ['head', 'neck', 'chest'], falloff: 5 }, { position: [0, 1.52, -0.09] })];
    case 'bun': return [...cap(1.04, 56, 100), P('Bun', sph(0.05), 'hair', { bone: 'head' }, { position: [0, 1.83, -0.07] }), P('Bun Band', { type: 'torus', radius: 0.036, tube: 0.007, radialSegments: 8, tubularSegments: 16, arc: 360, tubeScaleY: 1 }, 'hairband', { bone: 'head' }, { position: [0, 1.81, -0.065], rotation: [60, 0, 0] })];
    case 'balding': return [P('Hair Ring', sq(0.097, 0.114, 0.105, 0.78, 0.9, { phiStart: 80, phiLength: 200, thetaStart: 62, thetaLength: 32, widthSegments: 28, heightSegments: 6 }), 'hair', { bone: 'head' }, { position: H, scale: [1.03, 0.99, 1.03], modifiers: sliceMods(62, 94) }), sideburn(1.69)];
    default: return cap();
  }
}

function glassesParts(color) {
  return [
    P('Lens Frame', { type: 'torus', radius: 0.027, tube: 0.0032, radialSegments: 8, tubularSegments: 24, arc: 360, tubeScaleY: 1 }, 'frame', { bone: 'head' }, { position: [0.038, 1.722, 0.116], rotation: [90, 0, 0], mirror: true }),
    P('Lens', { type: 'cylinder', radiusTop: 0.0255, radiusBottom: 0.0255, height: 0.0015, radialSegments: 20, heightSegments: 1, capTop: true, capBottom: true, arc: 360 }, 'lens', { bone: 'head' }, { position: [0.038, 1.722, 0.117], rotation: [90, 0, 0], mirror: true, castShadow: false }),
    P('Glasses Bridge', { type: 'capsule', radius: 0.0028, length: 0.02, radialSegments: 6, capSegments: 3 }, 'frame', { bone: 'head' }, { position: [0, 1.728, 0.12], rotation: [0, 0, 90] }),
    P('Glasses Arm', { type: 'capsule', radius: 0.0026, length: 0.1, radialSegments: 6, capSegments: 3 }, 'frame', { bone: 'head' }, { position: [0.0655, 1.726, 0.066], rotation: [90, 0, 0], mirror: true }),
  ];
}

// ------------------------------------------------------------------ the definition builder
// o: { name, height, skin, hair, hairStyle, eye, lips, shirt, shirtMap, shirtPattern, sleeves, pants, pantsPattern, shoes, sole,
//      hood, hoodie, glasses, beard, cap, backpack, lanyard, scrubs, headScale, mouth, tie, buttons, belt, mustache, thickBrows }
export function humanDef(o = {}) {
  const skin = o.skin || '#d9a67e';
  const hairC = o.hair || '#17110d';
  const mats = {};
  const M = COWBOY_MATERIALS;
  mats.skin = { ...M.skin, color: skin, patternColor: mix(skin, '#a64a3a', 0.45) };
  mats.lips = { ...M.lips, color: o.lips || mix(skin, '#7a3a34', 0.5), patternColor: shade(skin, 0.6) };
  mats.hair = { ...M.hair, color: hairC };
  mats.hairband = { color: '#2a2a35', roughness: 0.6 };
  mats.eye = { ...M.eye, patternColor: o.eye || '#3a2616' };
  mats.shirt = { color: o.shirt || '#6a6f7a', roughness: 0.88, pattern: o.shirtPattern || 'fabric', patternScale: o.shirtScale || 320, patternColor: shade(o.shirt || '#6a6f7a', 0.55), sheen: 0.5 };
  if (o.shirtMap) mats.shirt = { ...mats.shirt, color: '#ffffff', pattern: 'fabric', patternStrength: 0.35 };
  mats.jeans = { color: o.pants || '#2c3a5a', roughness: 0.92, pattern: o.pantsPattern || 'denim', patternScale: o.pantsScale || 260, patternColor: shade(o.pants || '#2c3a5a', 0.6), sheen: 0.05 };
  mats.boot = { color: o.shoes || '#e8e8e8', roughness: 0.55, pattern: 'leather', patternScale: 300, patternColor: shade(o.shoes || '#e8e8e8', 0.6) };
  mats.sole = { ...SOLE, color: o.sole || '#e2dfd6' };
  mats.frame = { color: o.glasses || '#1b1b1f', roughness: 0.35, metallic: 0.5 };
  mats.lens = { color: '#cfe0e8', roughness: 0.05, opacity: 0.22, metallic: 0 };
  mats.pack = { color: o.backpack || '#2f6a3a', roughness: 0.8, pattern: 'fabric', patternScale: 300, patternColor: '#10241a', sheen: 0.4 };
  mats.sleeve = { ...mats.shirt, color: o.sleeveColor || o.shirt || '#6a6f7a' };
  mats.hood = { ...mats.shirt, color: o.hood || o.shirt || '#6a6f7a' };
  mats.lanyard = { color: '#c9c9d2', roughness: 0.7 };
  mats.badge = { color: '#f2f2f2', roughness: 0.6 };
  mats.tie = { color: '#7a2a2a', roughness: 0.6, pattern: 'stripes', patternScale: 60, patternColor: '#d0c0a0' };
  mats.belt = { ...M.belt, color: '#2a1d14' };
  mats.silver = M.silver;

  const k = o.headScale || 1;
  const parts = [];
  for (const src of COWBOY_PARTS) {
    if (DROP.has(src.name) && !(o.belt && ['Belt', 'Buckle'].includes(src.name)) && !(o.buttons && ['Shirt Buttons', 'Collar'].includes(src.name))) continue;
    const p = JSON.parse(JSON.stringify(src));
    if (p.material === 'glove') p.material = 'skin';
    if (p.name === 'Sleeve' || p.name === 'Deltoid') p.material = 'sleeve';
    if (p.name === 'Buckle') p.material = 'silver';
    if (p.name === 'Collar') p.material = 'shirt';
    if (p.name === 'Boot Foot') p.shape = { ...p.shape, rx: p.shape.rx * 0.98 };
    if (p.name === 'Jaw') { p.shape = { ...p.shape, e1: 0.9, e2: 1.0 }; p.scale = [0.9, 0.95, 0.97]; }
    if (p.name === 'Chin') p.scale = [0.9, 0.9, 0.9];
    if (p.name === 'Mustache' && !o.mustache) continue;
    if (p.name === 'Brow' && o.thickBrows) { p.scale = [1.25, 1.9, 1.3]; }
    if (k !== 1 && HEAD_PARTS.has(p.name)) enlargeHead(p, k);
    if (p.name === 'Mouth' || p.name === 'Upper Lip' || p.name === 'Lower Lip') {
      p.position = [p.position[0], p.position[1], p.position[2] - 0.0035];
      p.scale = [p.scale[0], p.scale[1] * 0.8, p.scale[2] * 0.7];
      const m = o.mouth || 'neutral';
      if (m === 'smile') { p.scale[0] *= 1.3; if (p.name !== 'Upper Lip') p.position[1] += 0.002; }
      else if (m === 'frown') { p.scale[0] *= 0.85; p.position[1] -= 0.001; }
      else if (m === 'open') p.scale[2] *= 3.2;
      if (p.name === 'Upper Lip' && !o.mustache) continue;
    }
    if (p.name === 'Chin') p.position = [p.position[0], p.position[1] + 0.002, p.position[2] - 0.012];
    if (o.sleeves === 'short' && p.name === 'Sleeve') { p.shape.path = p.shape.path.slice(0, 3); p.shape.radii = p.shape.radii.slice(0, 3); }
    parts.push(p);
  }
  // hair, facial hair and headwear (built for the standard head, then scaled with it)
  const extra = [...hairParts(o.hairStyle || 'short', hairC)];
  if (o.cap) {
    mats.cap = { color: o.cap, roughness: 0.8, pattern: 'fabric', patternScale: 260, patternColor: shade(o.cap, 0.5), sheen: 0.4 };
    extra.push(P('Cap', sq(0.103, 0.075, 0.112, 0.85, 0.9, { thetaStart: 0, thetaLength: 100 }), 'cap', { bone: 'head' }, { position: [0, 1.752, 0.006] }),
      P('Cap Brim', rbox(0.12, 0.008, 0.09, 0.004), 'cap', { bone: 'head' }, { position: [0, 1.745, 0.125], rotation: [-8, 0, 0] }));
  }
  if (o.beard) extra.push(P('Beard', sq(0.083, 0.062, 0.068, 0.8, 0.9, { thetaStart: 62, thetaLength: 118 }), 'hair', { bone: 'head' }, { position: [0, 1.658, 0.03] }));
  if (o.glasses) extra.push(...glassesParts(o.glasses));
  for (const e of extra) { if (k !== 1) enlargeHead(e, k); parts.push(e); }
  // clothes
  if (o.hoodie) {
    parts.push(P('Hood', { type: 'torus', radius: 0.082, tube: 0.04, radialSegments: 10, tubularSegments: 24, arc: 360, tubeScaleY: 1.15 }, 'hood', { bones: ['chest', 'neck'], falloff: 6 }, { position: [0, 1.5, -0.035], rotation: [72, 0, 0], scale: [1.05, 1, 0.8] }),
      P('Hoodie Pocket', rbox(0.22, 0.1, 0.03, 0.02), 'hood', { bones: ['spine', 'chest'], falloff: 5 }, { position: [0, 1.12, 0.1], rotation: [-6, 0, 0] }),
      P('Drawstring', { type: 'capsule', radius: 0.003, length: 0.1, radialSegments: 5, capSegments: 2 }, 'lanyard', { bone: 'chest' }, { position: [0.03, 1.4, 0.11], mirror: true }));
  }
  if (o.lanyard) parts.push(P('Lanyard', tubeShape([[0.045, 1.53, 0.065], [0.03, 1.4, 0.112], [0.0, 1.3, 0.122]], [0.004, 0.004, 0.004], { caps: true }), 'lanyard', { bones: ['chest', 'neck'], falloff: 6 }, { mirror: true }),
    P('Name Badge', rbox(0.05, 0.075, 0.006, 0.003), 'badge', { bone: 'chest' }, { position: [0, 1.255, 0.123] }));
  if (o.tie) parts.push(P('Tie', { type: 'box', width: 0.035, height: 0.2, depth: 0.012, bevel: 0.004, bevelSegments: 2 }, 'tie', { bones: ['chest', 'spine'], falloff: 5 }, { position: [0, 1.32, 0.115], rotation: [-4, 0, 0] }));
  if (o.backpack) parts.push(P('Backpack', rbox(0.27, 0.34, 0.13, 0.05), 'pack', { bones: ['chest', 'spine'], falloff: 5 }, { position: [0, 1.29, -0.165] }),
    P('Backpack Pocket', rbox(0.2, 0.14, 0.04, 0.02), 'pack', { bones: ['chest', 'spine'], falloff: 5 }, { position: [0, 1.2, -0.24] }),
    P('Pack Strap', tubeShape([[0.07, 1.47, -0.07], [0.085, 1.36, 0.09], [0.075, 1.2, 0.02]], [0.017, 0.017, 0.017], { caps: true, flatten: 0.55 }), 'pack', { bones: ['chest', 'spine'], falloff: 5 }, { mirror: true }));
  const def = { name: o.name || 'Human', skeleton: JSON.parse(JSON.stringify(COWBOY_SKELETON)), materials: mats, parts, clips: [] };
  def.height = o.height || 1.75;
  return def;
}

// ------------------------------------------------------------------ clips (shared by every human)
const STAND = {
  bones: { hips: [0, 0, 0], spine: [2, 0, 0], chest: [1, 0, 0], neck: [0, 0, 0], head: [0, 0, 0], 'shoulder*': [0, 0, 0], 'upperArm*': [3, 0, 6], 'foreArm*': [-14, 0, 0], 'hand*': [-6, 0, 0] },
  hips: [0, 0.965, 0], legs: { L: 'plant', R: 'plant' }, arms: { L: null, R: null }, hands: { L: 'relaxed', R: 'relaxed' },
};
const SIT_LEGS = { L: { target: [0.11, 0.085, 0.4], pole: [0.1, 0.1, 1], pitch: 0 }, R: { target: [-0.11, 0.085, 0.4], pole: [-0.1, 0.1, 1], pitch: 0 } };
const SIT = { hips: [0, 0.53, -0.07], bones: { hips: [0, 0, 0], spine: [4, 0, 0], chest: [2, 0, 0], neck: [0, 0, 0], head: [0, 0, 0], 'upperArm*': [4, 0, 8], 'foreArm*': [-44, 0, 0], 'hand*': [0, 0, 0] }, legs: SIT_LEGS, arms: { L: null, R: null }, hands: { L: 'relaxed', R: 'relaxed' } };

let CLIPS = null;
export function humanClips() {
  if (CLIPS) return CLIPS;
  const sk = new Skeleton(expandSkeleton(COWBOY_SKELETON));
  const L = [];
  L.push(synthesizeIdle(sk, { name: 'Idle', thumbHook: false }));
  L.push(synthesizeLocomotion(sk, { name: 'Walk', duration: 1.06, speed: 1.15, stance: 0.6, hipHeight: 0.94, bob: 0.018, center: -0.015 }));
  L.push(synthesizeLocomotion(sk, {
    name: 'Run', duration: 0.68, speed: 2.9, stance: 0.36, samples: 20, hipHeight: 0.93, bob: 0.035, bobPhase: 0.18,
    sway: 0.012, lean: 11, pelvisYaw: 9, pelvisRoll: 3, spineCounter: 1.1, stepWidth: 0.09, center: -0.1,
    heelStrike: -6, toeOff: 48, flatStart: 0.2, heelOff: 0.35, swingPitchMid: 30,
    kick: [0, 0.34, -0.16], drive: [0, 0.3, 0.22], armSwing: 38, armBias: -8, armAbduct: 10, elbow: 78, elbowSwing: 22,
    headPitch: 4, handFlex: -15, spineLean: 3, chestLean: 2, hands: 'fist', fingerSwing: 0.04,
  }));
  L.push(synthesizeLocomotion(sk, { name: 'Sneak', duration: 1.5, speed: 0.6, stance: 0.66, hipHeight: 0.84, bob: 0.01, center: -0.02, lean: 8, armSwing: 6, headPitch: 6, spineLean: 8 }));
  const wave = gestureClips(sk).find((c) => c.name === 'Wave');
  if (wave) L.push(wave);

  const sitIdle = (name, extra = [], loop = true) => keyPoseClip(sk, name, [{ t: 0, ...SIT }, ...extra.map((e, i) => ({ ...e, t: e.t ?? (i + 1) * 0.9 })), { t: (extra.length + 1) * 0.9 + 0.3, ...SIT }], { loop });
  L.push(keyPoseClip(sk, 'Sit', [
    { t: 0, ...SIT, arms: { L: { target: [0.17, 0.6, 0.2], pole: [1, 0, -0.2], handRot: [0, 0, 0] }, R: { target: [-0.17, 0.6, 0.2], pole: [-1, 0, -0.2], handRot: [0, 0, 0] } } },
    { t: 1.6, bones: { spine: [5, 0, 0], head: [2, 4, 0] } },
    { t: 3.2, bones: { spine: [4, 0, 0], head: [-2, -3, 0] } },
    { t: 4.8, bones: { spine: [4, 0, 0], head: [0, 0, 0] } },
  ], { loop: true }));
  L.push(keyPoseClip(sk, 'SitTalk', [
    { t: 0, ...SIT, arms: { L: { target: [0.17, 0.6, 0.2], pole: [1, 0, -0.2], handRot: [0, 0, 0] }, R: { target: [-0.17, 0.6, 0.2], pole: [-1, 0, -0.2], handRot: [0, 0, 0] } } },
    { t: 0.5, arms: { R: { target: [-0.2, 0.95, 0.38], pole: [-1, -0.2, -0.2], handRot: [-30, 0, 0] } }, bones: { head: [-3, 6, 0], chest: [2, -3, 0] } },
    { t: 1.1, arms: { R: { target: [-0.14, 0.85, 0.3], pole: [-1, -0.2, -0.2], handRot: [-10, 0, 0] } }, bones: { head: [3, -4, 0] } },
    { t: 1.8, arms: { R: { target: [-0.2, 1.0, 0.4], pole: [-1, -0.2, -0.2], handRot: [-40, 0, 0] } }, bones: { head: [-2, 3, 0], chest: [1, 2, 0] } },
    { t: 2.5, arms: { R: { target: [-0.17, 0.6, 0.2], pole: [-1, 0, -0.2], handRot: [0, 0, 0] } }, bones: { head: [0, 0, 0], chest: [2, 0, 0] } },
  ], { loop: true }));
  L.push(keyPoseClip(sk, 'Type', [
    { t: 0, ...SIT, arms: { L: { target: [0.12, 0.74, 0.34], pole: [1, -0.2, -0.3], handRot: [-30, 0, 0] }, R: { target: [-0.12, 0.74, 0.34], pole: [-1, -0.2, -0.3], handRot: [-30, 0, 0] } }, bones: { ...SIT.bones, spine: [8, 0, 0], neck: [10, 0, 0], head: [6, 0, 0] } },
    { t: 0.15, arms: { L: { target: [0.12, 0.72, 0.35], pole: [1, -0.2, -0.3], handRot: [-30, 0, 0] } } },
    { t: 0.3, arms: { R: { target: [-0.13, 0.72, 0.35], pole: [-1, -0.2, -0.3], handRot: [-30, 0, 0] }, L: { target: [0.12, 0.74, 0.34], pole: [1, -0.2, -0.3], handRot: [-30, 0, 0] } } },
    { t: 0.45, arms: { R: { target: [-0.12, 0.74, 0.34], pole: [-1, -0.2, -0.3], handRot: [-30, 0, 0] } } },
  ], { loop: true }));
  L.push(keyPoseClip(sk, 'Drive', [
    { t: 0, ...SIT, bones: { ...SIT.bones, spine: [-2, 0, 0], 'upperArm*': [-8, 0, 8] }, arms: { L: { target: [0.15, 0.86, 0.36], pole: [1, -0.4, 0], handRot: [-60, 0, 0] }, R: { target: [-0.15, 0.86, 0.36], pole: [-1, -0.4, 0], handRot: [-60, 0, 0] } }, hands: { L: 'fist', R: 'fist' } },
    { t: 1.5, bones: { head: [0, 3, 0] } },
    { t: 3, bones: { head: [0, -3, 0] } },
    { t: 4.5, bones: { head: [0, 0, 0] } },
  ], { loop: true }));
  L.push(keyPoseClip(sk, 'Talk', [
    { t: 0, ...STAND },
    { t: 0.45, arms: { R: { target: [-0.2, 1.16, 0.3], pole: [-1, -0.6, -0.2], handRot: [-40, 0, -10] } }, bones: { chest: [2, -4, 0], head: [-3, 5, 2] }, hands: { R: 'relaxed' } },
    { t: 0.9, arms: { R: { target: [-0.17, 1.02, 0.28], pole: [-1, -0.6, -0.2], handRot: [-20, 0, -10] } }, bones: { head: [3, -3, -2] } },
    { t: 1.5, arms: { R: { target: [-0.22, 1.2, 0.32], pole: [-1, -0.6, -0.2], handRot: [-50, 0, -10] }, L: { target: [0.2, 1.1, 0.28], pole: [1, -0.6, -0.2], handRot: [-30, 0, 10] } }, bones: { chest: [1, 3, 0], head: [-2, 2, 3] }, hands: { R: 'flat', L: 'relaxed' } },
    { t: 2.1, arms: { R: { target: [-0.18, 1.0, 0.26], pole: [-1, -0.6, -0.2], handRot: [-20, 0, -10] }, L: null }, bones: { head: [2, -4, 0] }, hands: { R: 'relaxed' } },
    { t: 2.7, ...STAND },
  ], { loop: true }));
  L.push(keyPoseClip(sk, 'Scared', [
    { t: 0, ...STAND, hips: [0, 0.93, 0], bones: { ...STAND.bones, spine: [8, 0, 0], chest: [6, 0, 0], neck: [8, 0, 0], head: [4, 0, 0], 'shoulder*': [0, 0, 6] }, arms: { L: { target: [0.1, 1.38, 0.2], pole: [1, -0.5, -0.3], handRot: [-80, 0, 0] }, R: { target: [-0.1, 1.38, 0.2], pole: [-1, -0.5, -0.3], handRot: [-80, 0, 0] } }, hands: { L: 'relaxed', R: 'relaxed' } },
    { t: 0.12, bones: { chest: [7, 1, 0], head: [5, 3, 0] } },
    { t: 0.24, bones: { chest: [6, -1, 0], head: [4, -3, 0] } },
    { t: 0.36, bones: { chest: [7, 1, 0], head: [5, 3, 0] } },
  ], { loop: true }));
  L.push(keyPoseClip(sk, 'Cry', [
    { t: 0, ...STAND, hips: [0, 0.95, 0], bones: { ...STAND.bones, spine: [12, 0, 0], chest: [8, 0, 0], neck: [18, 0, 0], head: [16, 0, 0] }, arms: { L: null, R: { target: [-0.08, 1.43, 0.22], pole: [-1, -0.5, -0.3], handRot: [-90, 0, 0] } }, hands: { L: 'relaxed', R: 'flat' } },
    { t: 0.5, bones: { spine: [14, 0, 0], chest: [10, 0, 0], neck: [20, 0, 0] } },
    { t: 1, bones: { spine: [12, 0, 0], chest: [8, 0, 0], neck: [18, 0, 0] } },
  ], { loop: true }));
  L.push(keyPoseClip(sk, 'Point', [
    { t: 0, ...STAND },
    { t: 0.35, arms: { R: { target: [-0.2, 1.42, 0.55], pole: [-0.5, -1, 0], handRot: [-90, 0, 0] } }, hands: { R: 'point' }, bones: { chest: [0, -10, 0], head: [0, 8, 0] } },
    { t: 1.6, arms: { R: { target: [-0.2, 1.43, 0.55], pole: [-0.5, -1, 0], handRot: [-90, 0, 0] } } },
  ], { loop: false }));
  L.push(keyPoseClip(sk, 'LookAround', [
    { t: 0, ...STAND },
    { t: 1, bones: { head: [0, 55, 0], neck: [0, 20, 0], chest: [0, 8, 0] } },
    { t: 2.2, bones: { head: [4, -50, 0], neck: [0, -18, 0], chest: [0, -8, 0] } },
    { t: 3.2, ...STAND },
  ], { loop: true }));
  L.push(keyPoseClip(sk, 'HandsUp', [
    { t: 0, ...STAND },
    { t: 0.3, arms: { L: { target: [0.2, 1.75, 0.15], pole: [1, -0.2, -0.5], handRot: [0, 0, 0] }, R: { target: [-0.2, 1.75, 0.15], pole: [-1, -0.2, -0.5], handRot: [0, 0, 0] } }, hands: { L: 'spread', R: 'spread' }, bones: { head: [-6, 0, 0] } },
    { t: 1.2, arms: { L: { target: [0.21, 1.76, 0.15], pole: [1, -0.2, -0.5], handRot: [0, 0, 0] } } },
  ], { loop: true }));
  L.push(keyPoseClip(sk, 'Sleep', [
    { t: 0, ...SIT, hips: [0, 0.53, -0.07], bones: { ...SIT.bones, spine: [14, 0, 0], neck: [26, 0, 0], head: [12, 0, 0] } },
    { t: 2, bones: { spine: [15, 0, 0], neck: [28, 0, 0] } },
    { t: 4, bones: { spine: [14, 0, 0], neck: [26, 0, 0] } },
  ], { loop: true }));
  CLIPS = L;
  return L;
}

export const HUMAN_CLIP_NAMES = ['Idle', 'Walk', 'Run', 'Sneak', 'Wave', 'Sit', 'SitTalk', 'Type', 'Drive', 'Talk', 'Scared', 'Cry', 'Point', 'LookAround', 'HandsUp', 'Sleep'];

// Build a Character. Clip objects are shared (an Action per character keeps its own time).
export function createHuman(o = {}) {
  const def = humanDef(o);
  const ch = new Character(def, { detail: o.detail ?? 0.8 });
  for (const clip of humanClips()) ch.mixer.addClip(clip);
  const s = (o.height || 1.75) / 1.84;
  ch.scale.set([s, s, s]);
  ch.userData.spec = o;
  ch.userData.rootScale = s;
  ch.play('Idle', { fade: 0 });
  return ch;
}
