// First-person M1 Garand rig: a US infantryman's arms (M1941 field jacket, A-11 watch)
// holding a shape-built M1 Garand with a moving operating rod, bolt, en-bloc clip of eight
// .30-06 rounds and a muzzle flash. Actions: Idle, Fire (last round: the clip "pings" out),
// Reload (thumb the clip in, bolt slams, slap the op rod) and Inspect.
// Rig space: the camera (eye) sits at the origin looking down +Z, +Y up, +X is left.
import { Character, expandSkeleton } from '../engine/character.js';
import { Skeleton } from '../engine/skeleton.js';
import { quat } from '../engine/math.js';
import { twoBoneIK, setWorldRotation } from '../engine/ik.js';
import { applyHandPose, blendHandPoses } from '../engine/gait.js';
import { sampleKeys, sampleXf, lerpArr, bakePoses } from '../engine/choreo.js';

// Weapon origin (just ahead of the trigger) at rest = the "ready" hold.
const W0 = [-0.155, -0.15, 0.2];
const W = (p) => [W0[0] + p[0], W0[1] + p[1], W0[2] + p[2]];
const SEAT = [0, 0.012, 0.03]; // en-bloc clip seated in the magazine well (weapon-local)

// ---------------------------------------------------------------- skeleton
const FINGERS = [
  { name: 'index', z: 0.026, length: 0.08, radius: 0.0088 },
  { name: 'middle', z: 0.009, length: 0.088, radius: 0.0092 },
  { name: 'ring', z: -0.008, length: 0.082, radius: 0.0088 },
  { name: 'pinky', z: -0.024, length: 0.066, radius: 0.0078 },
];
// Arm layout (left side; the right side is mirrored, then its shoulder is pulled back
// into the stock at pose time so the right arm isn't folded double).
const SH = [0.16, -0.33, 0.02], // bladed stance: support shoulder forward
  EL = [SH[0] + 0.01, SH[1] - 0.36, SH[2]], WR = [EL[0] + 0.015, EL[1] - 0.36, EL[2] + 0.01];
const RIGHT_SHOULDER_BACK = -0.24;
const KNUCKLE_Y = WR[1] - 0.09, FINGER_X = WR[0] + 0.01, HAND_Z = WR[2] + 0.005;
const A = (dx, dy, dz) => [WR[0] + dx, WR[1] + dy, WR[2] + dz]; // wrist-relative
export const GARAND_SKELETON = [
  { name: 'root', parent: null, head: [0, 0, 0], tail: [0, 0.1, 0], deform: false },
  { name: 'weapon', parent: 'root', head: W0, tail: W([0, 0, 0.15]) },
  { name: 'opRod', parent: 'weapon', head: W([-0.028, 0.004, 0.06]), tail: W([-0.028, 0.004, 0.16]) },
  { name: 'bolt', parent: 'weapon', head: W([0, 0.026, -0.01]), tail: W([0, 0.026, 0.05]) },
  { name: 'flash', parent: 'weapon', head: W([0, 0.014, 0.79]), tail: W([0, 0.014, 0.84]) },
  { name: 'clip', parent: 'root', head: W(SEAT), tail: W([SEAT[0], SEAT[1] + 0.05, SEAT[2]]) },
  { name: 'rounds', parent: 'clip', head: W(SEAT), tail: W([SEAT[0], SEAT[1] + 0.03, SEAT[2]]) },
  { name: 'upperArm.L', parent: 'root', head: SH, tail: EL, mirror: true },
  { name: 'foreArm.L', parent: 'upperArm.L', head: EL, tail: WR, mirror: true },
  { name: 'hand.L', parent: 'foreArm.L', head: WR, tail: [FINGER_X, KNUCKLE_Y, HAND_Z], mirror: true },
  ...FINGERS.flatMap((f) => {
    const j = KNUCKLE_Y - f.length * 0.55, tip = KNUCKLE_Y - f.length;
    return [
      { name: f.name + '1.L', parent: 'hand.L', head: [FINGER_X, KNUCKLE_Y, HAND_Z + f.z], tail: [FINGER_X, j, HAND_Z + f.z], mirror: true },
      { name: f.name + '2.L', parent: f.name + '1.L', head: [FINGER_X, j, HAND_Z + f.z], tail: [FINGER_X, tip, HAND_Z + f.z], mirror: true },
    ];
  }),
  { name: 'thumb1.L', parent: 'hand.L', head: A(0.002, -0.025, 0.038), tail: A(-0.002, -0.065, 0.056), mirror: true },
  { name: 'thumb2.L', parent: 'thumb1.L', head: A(-0.002, -0.065, 0.056), tail: A(-0.006, -0.102, 0.07), mirror: true },
];

// ---------------------------------------------------------------- materials
export const GARAND_MATERIALS = {
  walnut: { color: '#74401f', roughness: 0.4, pattern: 'walnut', patternScale: 30, patternColor: '#3a1b0a', sheen: 0.3 },
  parkerized: { color: '#40433d', roughness: 0.58, metallic: 0.85, pattern: 'metal', patternScale: 2 },
  blued: { color: '#25272a', roughness: 0.35, metallic: 1, pattern: 'metal', patternScale: 3 },
  brass: { color: '#c79a48', roughness: 0.28, metallic: 1, pattern: 'metal', patternScale: 1 },
  copper: { color: '#b86c3a', roughness: 0.3, metallic: 1 },
  clipSteel: { color: '#5b5e5b', roughness: 0.45, metallic: 0.9, pattern: 'metal', patternScale: 2 },
  sling: { color: '#5b3b1f', roughness: 0.6, pattern: 'leather', patternScale: 300, patternColor: '#2e1c0c' },
  flash: { color: '#ffcf7a', roughness: 1, emissive: '#ffb347', emissiveStrength: 30, opacity: 0.9, doubleSided: true },
  jacket: { color: '#6d6245', roughness: 0.9, pattern: 'fabric', patternScale: 420, patternStrength: 0.35, sheen: 0.7 },
  jacketDark: { color: '#5a5039', roughness: 0.9, pattern: 'fabric', patternScale: 300, sheen: 0.6 },
  button: { color: '#3a3226', roughness: 0.4 },
  skin: { color: '#c48a66', roughness: 0.55, pattern: 'skin', patternScale: 7, patternColor: '#a65440', sheen: 0.3 },
  watchBand: { color: '#3a2716', roughness: 0.5, pattern: 'leather', patternScale: 360, patternColor: '#1a0e06' },
  watchFace: { color: '#e9e2cc', roughness: 0.25, emissive: '#9fd9a0', emissiveStrength: 0.15 },
  watchCase: { color: '#b9bcc0', roughness: 0.2, metallic: 1 },
};

// ---------------------------------------------------------------- parts
const P = (name, shape, material, bind, o = {}) => ({ name, shape, material, bind, position: o.position || [0, 0, 0], rotation: o.rotation || [0, 0, 0], scale: o.scale || [1, 1, 1], modifiers: o.modifiers || [], ...(o.mirror ? { mirror: true } : {}), ...(o.castShadow === false ? { castShadow: false } : {}) });
const rbox = (width, height, depth, bevel, segments = 1) => ({ type: 'box', width, height, depth, bevel, bevelSegments: 2, segments });
const cyl = (radiusTop, radiusBottom, height, radialSegments = 20, caps = true) => ({ type: 'cylinder', radiusTop, radiusBottom, height, radialSegments, heightSegments: 1, capTop: caps, capBottom: caps, arc: 360 });
const sq = (rx, ry, rz, e1, e2) => ({ type: 'superquadric', rx, ry, rz, e1, e2, widthSegments: 28, heightSegments: 18, phiStart: 0, phiLength: 360, thetaStart: 0, thetaLength: 180, taperTop: 1, taperBottom: 1 });
const tube = (path, radii, extra = {}) => ({ type: 'tube', path, radii, radialSegments: 18, samples: 8, caps: true, flatten: 1, arc: 360, arcOffset: 0, twist: 0, ...extra });
const ALONG_Z = [90, 0, 0];
const WPN = { bone: 'weapon' };

const RIFLE = [
  // stock (walnut)
  P('Buttstock', rbox(0.044, 0.112, 0.3, 0.02, 4), 'walnut', WPN, { position: W([0, -0.072, -0.27]), rotation: [-7, 0, 0], modifiers: [{ type: 'taper', axis: 'z', amount: -0.22, curve: 1 }] }),
  P('Butt Plate', rbox(0.046, 0.128, 0.008, 0.004), 'parkerized', WPN, { position: W([0, -0.09, -0.42]), rotation: [-7, 0, 0] }),
  P('Stock Wrist', sq(0.021, 0.033, 0.085, 0.7, 0.8), 'walnut', WPN, { position: W([0, -0.028, -0.07]), rotation: [-10, 0, 0] }),
  P('Forestock', rbox(0.046, 0.04, 0.52, 0.012, 6), 'walnut', WPN, { position: W([0, -0.022, 0.24]), modifiers: [{ type: 'taper', axis: 'z', amount: -0.12, curve: 1 }] }),
  P('Rear Handguard', rbox(0.036, 0.02, 0.12, 0.009), 'walnut', WPN, { position: W([0, 0.021, 0.2]) }),
  P('Front Handguard', rbox(0.034, 0.02, 0.22, 0.009, 3), 'walnut', WPN, { position: W([0, 0.021, 0.45]), modifiers: [{ type: 'taper', axis: 'z', amount: -0.08, curve: 1 }] }),
  // metal
  P('Receiver', rbox(0.034, 0.038, 0.21, 0.006, 3), 'parkerized', WPN, { position: W([0, 0.006, 0.035]) }),
  P('Receiver Heel', rbox(0.03, 0.03, 0.04, 0.008), 'parkerized', WPN, { position: W([0, 0.01, -0.085]) }),
  P('Rear Sight', rbox(0.026, 0.024, 0.028, 0.004), 'parkerized', WPN, { position: W([0, 0.036, -0.058]) }),
  P('Sight Aperture', { type: 'torus', radius: 0.006, tube: 0.0022, radialSegments: 8, tubularSegments: 20, arc: 360, tubeScaleY: 1 }, 'blued', WPN, { position: W([0, 0.054, -0.062]), rotation: [90, 0, 0] }),
  P('Windage Knob', cyl(0.011, 0.011, 0.008, 16), 'blued', WPN, { position: W([0.018, 0.034, -0.058]), rotation: [0, 0, 90] }),
  P('Elevation Knob', cyl(0.012, 0.012, 0.008, 16), 'blued', WPN, { position: W([-0.018, 0.034, -0.058]), rotation: [0, 0, 90] }),
  P('Barrel', cyl(0.0092, 0.0098, 0.66, 20), 'blued', WPN, { position: W([0, 0.014, 0.45]), rotation: ALONG_Z }),
  P('Gas Cylinder', cyl(0.0135, 0.0135, 0.1, 20), 'parkerized', WPN, { position: W([0, 0.004, 0.72]), rotation: ALONG_Z }),
  P('Gas Lock', cyl(0.012, 0.0115, 0.015, 16), 'parkerized', WPN, { position: W([0, 0.004, 0.777]), rotation: ALONG_Z }),
  P('Front Sight', rbox(0.004, 0.028, 0.012, 0.0015), 'blued', WPN, { position: W([0, 0.034, 0.765]) }),
  P('Sight Ears', rbox(0.02, 0.018, 0.012, 0.003), 'parkerized', WPN, { position: W([0, 0.027, 0.765]), modifiers: [{ type: 'squash', axis: 'x', min: -0.01, max: 0.01 }] }),
  P('Lower Band', rbox(0.05, 0.066, 0.012, 0.005), 'parkerized', WPN, { position: W([0, -0.005, 0.33]) }),
  P('Front Band', rbox(0.044, 0.05, 0.012, 0.005), 'parkerized', WPN, { position: W([0, 0.002, 0.57]) }),
  P('Trigger Guard', { type: 'torus', radius: 0.018, tube: 0.0032, radialSegments: 8, tubularSegments: 24, arc: 360, tubeScaleY: 1 }, 'parkerized', WPN, { position: W([0, -0.05, -0.008]), rotation: [0, 0, 90], scale: [1, 1, 1.4] }),
  P('Trigger', rbox(0.004, 0.02, 0.006, 0.0015), 'blued', WPN, { position: W([0, -0.047, -0.004]), rotation: [12, 0, 0] }),
  P('Safety', rbox(0.006, 0.01, 0.02, 0.002), 'blued', WPN, { position: W([0, -0.043, 0.02]) }),
  P('Sling', tube([[0, -0.13, -0.33], [0, -0.2, -0.12], [0, -0.19, 0.2], [0, -0.1, 0.45], [0, -0.03, 0.57]], [0.013], { flatten: 0.22, caps: false, samples: 10 }), 'sling', WPN, { position: W([0, 0, 0]) }),
  // moving parts
  P('Operating Rod', cyl(0.0055, 0.0055, 0.5, 12), 'parkerized', { bone: 'opRod' }, { position: W([-0.02, -0.004, 0.33]), rotation: ALONG_Z }),
  P('Op Rod Handle', rbox(0.013, 0.02, 0.032, 0.004), 'parkerized', { bone: 'opRod' }, { position: W([-0.028, 0.004, 0.075]) }),
  P('Bolt', rbox(0.02, 0.016, 0.08, 0.004), 'blued', { bone: 'bolt' }, { position: W([0, 0.027, -0.005]) }),
  P('Muzzle Flash', { type: 'extrude', shape: 'star', points: 7, inner: 0.35, radius: 0.07, teeth: 12, toothDepth: 0.12, depth: 0.004, bevel: 0 }, 'flash', { bone: 'flash' }, { position: W([0, 0.014, 0.82]), castShadow: false }),
  P('Flash Core', { type: 'cone', radius: 0.03, height: 0.12, radialSegments: 12, heightSegments: 2, capBottom: true, arc: 360 }, 'flash', { bone: 'flash' }, { position: W([0, 0.014, 0.85]), rotation: [90, 0, 0], castShadow: false }),
  // en-bloc clip with eight .30-06 rounds (double stack)
  ...[1, -1].map((side) => P(side > 0 ? 'Clip Plate L' : 'Clip Plate R', rbox(0.002, 0.046, 0.058, 0.0008), 'clipSteel', { bone: 'clip' }, { position: W([side * 0.0135, SEAT[1] - 0.012, SEAT[2]]) })),
  P('Clip Spine', rbox(0.029, 0.004, 0.058, 0.001), 'clipSteel', { bone: 'clip' }, { position: W([0, SEAT[1] - 0.036, SEAT[2]]) }),
  ...[1, -1].flatMap((side) => [
    P(side > 0 ? 'Rounds L' : 'Rounds R', { type: 'capsule', radius: 0.0058, length: 0.052, radialSegments: 12, capSegments: 3 }, 'brass', { bone: 'rounds' }, { position: W([side * 0.0052, SEAT[1] + 0.006 - (side > 0 ? 0 : 0.0045), SEAT[2] - 0.004]), rotation: ALONG_Z, modifiers: [{ type: 'array', count: 4, offsetX: 0, offsetY: 0, offsetZ: 0.0092, rotX: 0, rotY: 0, rotZ: 0, scaleStep: 1 }] }),
    P(side > 0 ? 'Bullets L' : 'Bullets R', { type: 'cone', radius: 0.0048, height: 0.02, radialSegments: 12, heightSegments: 3, capBottom: true, arc: 360 }, 'copper', { bone: 'rounds' }, { position: W([side * 0.0052, SEAT[1] + 0.006 - (side > 0 ? 0 : 0.0045), SEAT[2] + 0.038]), rotation: ALONG_Z, modifiers: [{ type: 'array', count: 4, offsetX: 0, offsetY: 0, offsetZ: 0.0092, rotX: 0, rotY: 0, rotZ: 0, scaleStep: 1 }] }),
  ]),
];

const ARMS = [
  P('Jacket Sleeve', tube([[SH[0], SH[1] + 0.04, SH[2]], [SH[0] + 0.005, SH[1] - 0.18, SH[2]], EL, [EL[0] + 0.008, EL[1] - 0.17, EL[2] + 0.005], A(0, 0.025, 0)], [0.055, 0.05, 0.045, 0.04, 0.038], { caps: false, samples: 8 }), 'jacket', { bones: ['upperArm.L', 'foreArm.L'], falloff: 7 }, { mirror: true, modifiers: [{ type: 'displace', amount: 0.004, scale: 20, seed: 4, octaves: 2 }] }),
  P('Cuff', cyl(0.04, 0.041, 0.035, 22, false), 'jacketDark', { bone: 'foreArm.L' }, { position: A(0, 0.032, 0), mirror: true }),
  P('Cuff Button', { type: 'sphere', radius: 0.005, widthSegments: 10, heightSegments: 8, phiStart: 0, phiLength: 360, thetaStart: 0, thetaLength: 180 }, 'button', { bone: 'foreArm.L' }, { position: A(0.04, 0.034, 0), mirror: true }),
  P('Wrist', cyl(0.024, 0.027, 0.07, 18, false), 'skin', { bones: ['foreArm.L', 'hand.L'], falloff: 8 }, { position: A(0.002, -0.005, 0.001), mirror: true }),
  P('Palm', rbox(0.028, 0.09, 0.08, 0.012), 'skin', { bone: 'hand.L' }, { position: A(0.007, -0.045, 0.003), mirror: true }),
  ...FINGERS.map((f) => P(f.name[0].toUpperCase() + f.name.slice(1) + ' Finger', { type: 'capsule', radius: f.radius, length: f.length - f.radius, radialSegments: 12, capSegments: 5 }, 'skin', { bones: ['hand.L', f.name + '1.L', f.name + '2.L'], falloff: 9 }, { position: [FINGER_X, KNUCKLE_Y + 0.004 - (f.length + f.radius) / 2, HAND_Z + f.z], mirror: true })),
  P('Thumb', { type: 'capsule', radius: 0.0105, length: 0.058, radialSegments: 12, capSegments: 5 }, 'skin', { bones: ['hand.L', 'thumb1.L', 'thumb2.L'], falloff: 9 }, { position: A(-0.002, -0.065, 0.054), rotation: [-24, 0, -6], mirror: true }),
  // A-11 field watch on the left wrist only
  P('Watch Band', { type: 'torus', radius: 0.029, tube: 0.004, radialSegments: 8, tubularSegments: 28, arc: 360, tubeScaleY: 2.2 }, 'watchBand', { bone: 'foreArm.L' }, { position: A(0.002, 0.005, 0.001) }),
  P('Watch Case', cyl(0.017, 0.017, 0.008, 24), 'watchCase', { bone: 'foreArm.L' }, { position: A(0.033, 0.005, 0.001), rotation: [0, 0, 90] }),
  P('Watch Face', cyl(0.0145, 0.0145, 0.002, 24), 'watchFace', { bone: 'foreArm.L' }, { position: A(0.0375, 0.005, 0.001), rotation: [0, 0, 90], castShadow: false }),
];

// ---------------------------------------------------------------- choreography
// Hand targets are wrist positions + hand rotations, usually relative to the weapon.
const GRIP_R = { attach: 'weapon', p: [-0.036, -0.058, -0.125], r: [-68, 0, 4] };
const SUPPORT_L = { attach: 'weapon', p: [0.048, -0.066, 0.33], r: [0, 18, -90] };
const SUPPORT_L_BACK = { attach: 'weapon', p: [0.048, -0.066, 0.24], r: [0, 22, -90] }; // hand slides back while reloading
const POSES = {
  gripR: { curl: [0.55, 0.42, 0.85, 0.9, 0.95], spread: 0 },
  supportL: { curl: [0.25, 0.55, 0.6, 0.65, 0.7], spread: 0.1 },
  relaxed: { curl: [0.2, 0.3, 0.38, 0.45, 0.5], spread: 0.15 },
  pinch: { curl: [0.15, 0.5, 0.6, 0.85, 0.9], spread: 0 }, // clip between thumb and fingers
  push: { curl: [-0.1, 0.75, 0.85, 0.9, 0.95], spread: 0 }, // thumb straight, pressing the clip down
  flatHand: { curl: [0.05, 0.05, 0.06, 0.08, 0.1], spread: 0.1 },
  hook: { curl: [0.35, 0.6, 0.7, 0.75, 0.8], spread: 0 },
};
const READY = { p: [...W0], r: [0, 5, -4] };
const HIDDEN_CLIP = { attach: 'world', p: [-0.3, -1.2, 0.1], r: [0, 0, 0] };
const SEATED_CLIP = { attach: 'weapon', p: SEAT, r: [0, 0, 0] };
const BOLT_BACK = -0.085, ROD_BACK = -0.09;

function k(t, v, ease) { return { t, ...v, ...(ease ? { ease } : {}) }; }

const ACTIONS = {
  Idle: {
    duration: 3, loop: true, fps: 20,
    weapon: (t) => { const a = (t / 3) * Math.PI * 2; return { p: [W0[0] + 0.003 * Math.sin(a), W0[1] + 0.004 * Math.sin(2 * a), W0[2] + 0.002 * Math.cos(a)], r: [0.7 * Math.sin(2 * a), 5 + 0.9 * Math.sin(a), -4 + 0.6 * Math.cos(a)] }; },
    handR: [k(0, GRIP_R)], handL: [k(0, SUPPORT_L)],
    fingersR: [k(0, { pose: POSES.gripR })], fingersL: [k(0, { pose: POSES.supportL }), k(1.5, { pose: { curl: [0.3, 0.6, 0.66, 0.7, 0.74], spread: 0.1 } }), k(3, { pose: POSES.supportL })],
    clip: [k(0, SEATED_CLIP)], bolt: [k(0, { v: 0 })], rod: [k(0, { v: 0 })], flash: [k(0, { v: 0 })],
  },
  Fire: {
    // last round: recoil, the action cycles and locks open, the empty clip pings out
    duration: 1.0, fps: 60,
    weapon: [k(0, READY), k(0.035, { p: [W0[0] + 0.004, W0[1] + 0.02, W0[2] - 0.075], r: [-9, 6.5, -6] }, 'snap'), k(0.22, { p: [W0[0] - 0.002, W0[1] - 0.006, W0[2] + 0.008], r: [1.2, 4.5, -3.4] }), k(0.45, { p: [W0[0], W0[1] + 0.002, W0[2] - 0.004], r: [-0.4, 5, -4] }), k(1.0, READY)],
    handR: [k(0, GRIP_R)], handL: [k(0, SUPPORT_L)],
    fingersR: [k(0, { pose: POSES.gripR }), k(0.02, { pose: { curl: [0.55, 0.62, 0.85, 0.9, 0.95], spread: 0 } }, 'snap'), k(0.25, { pose: POSES.gripR })],
    fingersL: [k(0, { pose: POSES.supportL }), k(0.05, { pose: { curl: [0.35, 0.7, 0.75, 0.78, 0.8], spread: 0.05 } }, 'snap'), k(0.4, { pose: POSES.supportL })],
    clip: [k(0, SEATED_CLIP), k(0.04, SEATED_CLIP), k(0.07, { attach: 'weapon', p: [0, 0.07, 0.02], r: [8, 0, -10] }, 'linear'), k(0.2, { attach: 'world', p: [-0.2, 0.2, 0.62], r: [60, 90, -140] }, 'out'), k(0.45, { attach: 'world', p: [-0.55, 0.05, 0.8], r: [150, 200, -300] }, 'in'), k(0.65, { attach: 'world', p: [-0.8, -0.6, 0.85], r: [220, 260, -420] }, 'in'), k(1.0, HIDDEN_CLIP)],
    bolt: [k(0, { v: 0 }), k(0.03, { v: BOLT_BACK }, 'snap')],
    rod: [k(0, { v: 0 }), k(0.03, { v: ROD_BACK }, 'snap')],
    flash: [k(0, { v: 1 }), k(0.05, { v: 1 }, 'hold'), k(0.051, { v: 0 }, 'hold')],
    rounds: [k(0, { v: 0 })],
    events: [{ t: 0, name: 'shot' }, { t: 0.07, name: 'ping' }],
  },
  Reload: {
    duration: 3.0, fps: 30,
    weapon: [
      k(0, READY),
      k(0.35, { p: [-0.07, -0.2, 0.42], r: [-10, 24, -30] }),
      k(1.15, { p: [-0.06, -0.24, 0.47], r: [-16, 22, -36] }),
      k(1.52, { p: [-0.06, -0.255, 0.47], r: [-13, 22, -36] }, 'out'),
      k(1.58, { p: [-0.057, -0.23, 0.47], r: [-18, 23, -38] }, 'snap'),
      k(1.75, { p: [-0.06, -0.24, 0.47], r: [-14, 22, -35] }),
      k(2.0, { p: [-0.065, -0.21, 0.44], r: [-11, 22, -31] }),
      k(2.5, READY), k(2.72, { p: [W0[0], W0[1] - 0.004, W0[2]], r: [1, 5, -4] }), k(3.0, READY),
    ],
    handR: [
      k(0, GRIP_R),
      k(0.3, GRIP_R),
      k(0.55, { attach: 'world', p: [-0.22, -0.4, 0.14], r: [-40, 20, 30] }),
      k(0.8, { attach: 'world', p: [-0.24, -0.6, 0.1], r: [-20, 20, 40] }, 'out'),
      k(0.95, { attach: 'world', p: [-0.24, -0.61, 0.1], r: [-20, 20, 40] }),
      k(1.22, { attach: 'weapon', p: [-0.07, 0.14, -0.03], r: [-50, 10, 55] }),
      // wrist to the rifle's right, hand tilted so the thumb reaches across onto the clip
      k(1.34, { attach: 'weapon', p: [-0.063, 0.155, -0.04], r: [0, 0, 35] }),
      k(1.52, { attach: 'weapon', p: [-0.063, 0.115, -0.04], r: [4, 0, 35] }, 'in'),
      k(1.62, { attach: 'weapon', p: [-0.08, 0.21, -0.07], r: [-10, 0, -25] }, 'snap'),
      k(1.85, { attach: 'weapon', p: [-0.075, 0.03, -0.02], r: [-20, -40, 90] }),
      k(1.96, { attach: 'weapon', p: [-0.068, 0.01, 0.02], r: [-15, -40, 90] }, 'snap'),
      k(2.12, { attach: 'weapon', p: [-0.07, 0.0, 0.0], r: [-30, -20, 60] }),
      k(2.45, GRIP_R), k(3.0, GRIP_R),
    ],
    handL: [k(0, SUPPORT_L), k(0.35, SUPPORT_L_BACK), k(1.55, SUPPORT_L_BACK), k(1.6, { attach: 'weapon', p: [0.05, -0.068, 0.238], r: [0, 22, -92] }, 'snap'), k(1.8, SUPPORT_L_BACK), k(2.1, SUPPORT_L_BACK), k(2.5, SUPPORT_L), k(3.0, SUPPORT_L)],
    fingersR: [k(0, { pose: POSES.gripR }), k(0.35, { pose: POSES.relaxed }), k(0.8, { pose: POSES.hook }), k(0.95, { pose: POSES.pinch }), k(1.3, { pose: POSES.pinch }), k(1.42, { pose: POSES.push }), k(1.6, { pose: POSES.flatHand }, 'snap'), k(1.85, { pose: POSES.flatHand }), k(2.12, { pose: POSES.relaxed }), k(2.45, { pose: POSES.gripR }), k(3.0, { pose: POSES.gripR })],
    fingersL: [k(0, { pose: POSES.supportL }), k(1.5, { pose: POSES.supportL }), k(1.6, { pose: { curl: [0.35, 0.72, 0.76, 0.8, 0.82], spread: 0.05 } }, 'snap'), k(2.0, { pose: POSES.supportL })],
    clip: [k(0, HIDDEN_CLIP), k(0.78, { attach: 'world', p: [-0.23, -0.66, 0.13], r: [0, 0, 0] }), k(0.95, { attach: 'hand.R', p: [-0.012, -0.075, 0.02], r: [70, 0, 0] }), k(1.26, { attach: 'hand.R', p: [-0.012, -0.075, 0.02], r: [70, 0, 0] }), k(1.36, { attach: 'weapon', p: [0, 0.04, SEAT[2]], r: [0, 0, 0] }), k(1.52, SEATED_CLIP, 'in'), k(3.0, SEATED_CLIP)],
    bolt: [k(0, { v: BOLT_BACK }), k(1.52, { v: BOLT_BACK }), k(1.57, { v: 0 }, 'in'), k(3.0, { v: 0 })],
    rod: [k(0, { v: ROD_BACK }), k(1.52, { v: ROD_BACK }), k(1.57, { v: -0.006 }, 'in'), k(1.96, { v: -0.006 }), k(2.0, { v: 0 }, 'snap'), k(3.0, { v: 0 })],
    flash: [k(0, { v: 0 })],
    events: [{ t: 1.52, name: 'clipIn' }, { t: 1.57, name: 'boltHome' }],
  },
  Inspect: {
    duration: 4.4, fps: 30,
    weapon: [
      k(0, READY),
      k(0.3, { p: [-0.1, -0.17, 0.26], r: [-3, -22, 3] }),
      k(0.6, { p: [0.02, -0.19, 0.38], r: [-6, -52, 8] }),
      k(1.0, { p: [0.02, -0.188, 0.39], r: [-8, -56, 10] }),
      k(2.2, { p: [0.022, -0.186, 0.39], r: [-7, -54, 9] }),
      k(2.9, { p: [0.05, -0.18, 0.46], r: [-16, 48, -24] }),
      k(3.4, { p: [0.05, -0.182, 0.46], r: [-14, 52, -28] }),
      k(4.0, { p: [W0[0], W0[1] - 0.006, W0[2]], r: [1, 5, -4] }),
      k(4.4, READY),
    ],
    handR: [
      k(0, GRIP_R), k(0.9, GRIP_R),
      k(1.2, { attach: 'weapon', p: [-0.075, 0.0, 0.02], r: [-10, -60, 90] }),
      k(1.35, { attach: 'weapon', p: [-0.07, -0.004, 0.06], r: [-10, -60, 90] }),
      k(1.6, { attach: 'weapon', p: [-0.07, -0.004, 0.06 + ROD_BACK * 0.8], r: [-10, -60, 90] }),
      k(1.95, { attach: 'weapon', p: [-0.07, -0.004, 0.06 + ROD_BACK * 0.8], r: [-10, -60, 90] }),
      k(2.02, { attach: 'weapon', p: [-0.09, 0.03, 0.0], r: [-20, -40, 80] }, 'snap'),
      k(2.5, GRIP_R), k(4.4, GRIP_R),
    ],
    handL: [k(0, SUPPORT_L), k(4.4, SUPPORT_L)],
    fingersR: [k(0, { pose: POSES.gripR }), k(0.9, { pose: POSES.gripR }), k(1.2, { pose: POSES.relaxed }), k(1.35, { pose: POSES.hook }), k(1.95, { pose: POSES.hook }), k(2.05, { pose: POSES.flatHand }, 'snap'), k(2.5, { pose: POSES.gripR }), k(4.4, { pose: POSES.gripR })],
    fingersL: [k(0, { pose: POSES.supportL }), k(0.6, { pose: { curl: [0.3, 0.62, 0.68, 0.72, 0.76], spread: 0.08 } }), k(3.4, { pose: { curl: [0.3, 0.62, 0.68, 0.72, 0.76], spread: 0.08 } }), k(4.4, { pose: POSES.supportL })],
    clip: [k(0, SEATED_CLIP)],
    bolt: [k(0, { v: 0 }), k(1.35, { v: 0 }), k(1.6, { v: BOLT_BACK * 0.8 }), k(1.95, { v: BOLT_BACK * 0.8 }), k(2.0, { v: 0 }, 'in'), k(4.4, { v: 0 })],
    rod: [k(0, { v: 0 }), k(1.35, { v: 0 }), k(1.6, { v: ROD_BACK * 0.8 }), k(1.95, { v: ROD_BACK * 0.8 }), k(2.0, { v: 0 }, 'in'), k(4.4, { v: 0 })],
    flash: [k(0, { v: 0 })],
  },
};

const mixV = (a, b, s) => a.v + (b.v - a.v) * s;
const mixPose = (a, b, s) => blendHandPoses(a.pose, b.pose, s);

function performAction(sk, name, A) {
  const idx = (n) => sk.boneIndex(n);
  const rest = (n) => sk.bones[idx(n)].head;
  const times = [], poses = [];
  const frames = Math.round(A.duration * A.fps);
  const n = A.loop ? frames : frames + 1;
  for (let f = 0; f < n; f++) {
    const t = (f / frames) * A.duration;
    sk.resetPose();
    // weapon
    const wk = typeof A.weapon === 'function' ? A.weapon(t) : sampleKeys(A.weapon, t, (a, b, s) => ({ p: lerpArr(a.p, b.p, s), r: lerpArr(a.r, b.r, s) }));
    const wq = quat.fromEuler(quat.create(), ...wk.r);
    const wi = idx('weapon'), w0 = rest('weapon');
    sk.pos.set([wk.p[0] - w0[0], wk.p[1] - w0[1], wk.p[2] - w0[2]], wi * 3);
    sk.rot.set(wq, wi * 4);
    sk.pos.set([-0.07, 0.02, RIGHT_SHOULDER_BACK], idx('upperArm.R') * 3);
    sk.pos.set([0, 0, sampleKeys(A.bolt, t, mixV)], idx('bolt') * 3);
    sk.pos.set([0, 0, sampleKeys(A.rounds || [{ t: 0, v: 1 }], t, mixV) > 0.5 ? 0 : -40], idx('rounds') * 3); // an emptied clip
    sk.pos.set([0, 0, sampleKeys(A.rod, t, mixV)], idx('opRod') * 3);
    sk.pos.set([0, 0, sampleKeys(A.flash, t, mixV) > 0.5 ? 0 : -1.6], idx('flash') * 3); // hidden behind the eye
    sk.update();
    const weapon = { p: wk.p, q: wq };
    // hands (IK to wrist targets, then hand orientation and fingers)
    const hands = {};
    for (const [side, keys, fingerKeys, pole] of [['R', A.handR, A.fingersR, [-1.8, -0.9, -0.1]], ['L', A.handL, A.fingersL, [1.4, -1, -0.2]]]) {
      const x = sampleXf(keys, t, { weapon });
      twoBoneIK(sk, idx('upperArm.' + side), idx('foreArm.' + side), idx('hand.' + side), x.p, pole);
      setWorldRotation(sk, idx('hand.' + side), x.q);
      applyHandPose(sk, side, sampleKeys(fingerKeys, t, mixPose));
      sk.update();
      hands['hand.' + side] = { p: sk.worldHead(idx('hand.' + side)), q: sk.worldRotation(idx('hand.' + side)) };
    }
    // the clip: world transform from its (possibly attached) keys
    const c = sampleXf(A.clip, t, { weapon, ...hands });
    const ci = idx('clip'), c0 = rest('clip');
    sk.pos.set([c.p[0] - c0[0], c.p[1] - c0[1], c.p[2] - c0[2]], ci * 3);
    sk.rot.set(c.q, ci * 4);
    sk.update();
    times.push(t); poses.push(sk.snapshotPose());
  }
  const clip = bakePoses(sk, name, times, poses, { loop: !!A.loop, posBones: ['weapon', 'clip', 'rounds', 'bolt', 'opRod', 'flash', 'upperArm.R'], stepBones: ['flash', 'rounds'], events: A.events || [] });
  if (A.loop) clip.duration = A.duration;
  sk.resetPose(); sk.update();
  return clip;
}

export function garandClips() {
  const sk = new Skeleton(expandSkeleton(GARAND_SKELETON));
  return Object.entries(ACTIONS).map(([name, A]) => performAction(sk, name, A));
}

export function garandDefinition({ withClips = true } = {}) {
  const def = {
    name: 'M1 Garand', skeleton: GARAND_SKELETON, materials: GARAND_MATERIALS, parts: [...RIFLE, ...ARMS],
    clips: withClips ? garandClips() : [],
    firstPerson: { fov: 58, eyeHeight: 1.62, actions: { fire: 'Fire', reload: 'Reload', inspect: 'Inspect', idle: 'Idle' }, after: { Fire: 'Reload', Reload: 'Idle', Inspect: 'Idle' } },
  };
  return JSON.parse(JSON.stringify(def));
}
export const createGarand = () => new Character(garandDefinition());
