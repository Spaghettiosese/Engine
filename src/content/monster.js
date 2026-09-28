// The Grinner — a gaunt, 2.5 m tall yellow creature with an ear-to-ear grin, sunken eyes,
// exposed ribs and arms that hang past its knees. Built from shapes like the Cowboy and
// rigged to the same humanoid naming, so the gait synthesizer and hand poses work on it.
import { Character, expandSkeleton } from '../engine/character.js';
import { Skeleton } from '../engine/skeleton.js';
import { synthesizeLocomotion, synthesizeAllFours, synthesizeIdle } from '../engine/gait.js';

const KNUCKLE_Y = 0.455, FINGER_X = 0.3;
const FINGERS = [
  { name: 'index', z: 0.026, length: 0.13, radius: 0.0075 },
  { name: 'middle', z: 0.009, length: 0.148, radius: 0.0078 },
  { name: 'ring', z: -0.008, length: 0.138, radius: 0.0074 },
  { name: 'pinky', z: -0.024, length: 0.11, radius: 0.0068 },
];

export const GRINNER_SKELETON = [
  { name: 'root', parent: null, head: [0, 0, 0], tail: [0, 0.3, 0], deform: false },
  { name: 'hips', parent: 'root', head: [0, 1.33, 0], tail: [0, 1.45, 0] },
  { name: 'spine', parent: 'hips', head: [0, 1.45, 0], tail: [0, 1.62, 0.01] },
  { name: 'chest', parent: 'spine', head: [0, 1.62, 0.01], tail: [0, 1.86, 0] },
  { name: 'neck', parent: 'chest', head: [0, 1.86, 0], tail: [0, 2.13, 0.035] },
  { name: 'head', parent: 'neck', head: [0, 2.13, 0.035], tail: [0, 2.46, 0.035] },
  { name: 'jaw', parent: 'head', head: [0, 2.24, 0.06], tail: [0, 2.2, 0.14], spring: { stiffness: 320, damping: 14, gravity: 1 } },
  { name: 'shoulder.L', parent: 'chest', head: [0.03, 1.83, -0.01], tail: [0.19, 1.84, -0.02], mirror: true },
  { name: 'upperArm.L', parent: 'shoulder.L', head: [0.19, 1.84, -0.02], tail: [0.25, 1.17, -0.03], mirror: true },
  { name: 'foreArm.L', parent: 'upperArm.L', head: [0.25, 1.17, -0.03], tail: [0.29, 0.55, 0.0], mirror: true },
  { name: 'hand.L', parent: 'foreArm.L', head: [0.29, 0.55, 0.0], tail: [FINGER_X, KNUCKLE_Y, 0.002], mirror: true },
  ...FINGERS.flatMap((f) => {
    const j = KNUCKLE_Y - f.length * 0.5, tip = KNUCKLE_Y - f.length;
    return [
      { name: f.name + '1.L', parent: 'hand.L', head: [FINGER_X, KNUCKLE_Y, f.z], tail: [FINGER_X, j, f.z], mirror: true },
      { name: f.name + '2.L', parent: f.name + '1.L', head: [FINGER_X, j, f.z], tail: [FINGER_X, tip, f.z], mirror: true },
    ];
  }),
  { name: 'thumb1.L', parent: 'hand.L', head: [0.292, 0.525, 0.03], tail: [0.287, 0.475, 0.045], mirror: true },
  { name: 'thumb2.L', parent: 'thumb1.L', head: [0.287, 0.475, 0.045], tail: [0.282, 0.425, 0.056], mirror: true },
  { name: 'thigh.L', parent: 'hips', head: [0.09, 1.3, 0], tail: [0.1, 0.68, 0.02], mirror: true },
  { name: 'shin.L', parent: 'thigh.L', head: [0.1, 0.68, 0.02], tail: [0.1, 0.08, -0.01], mirror: true },
  { name: 'foot.L', parent: 'shin.L', head: [0.1, 0.08, -0.01], tail: [0.102, 0.025, 0.13], mirror: true },
  { name: 'toe.L', parent: 'foot.L', head: [0.102, 0.025, 0.13], tail: [0.104, 0.02, 0.23], mirror: true },
];

export const GRINNER_MATERIALS = {
  skin: { color: '#b7a041', roughness: 0.52, pattern: 'skin', patternScale: 5, patternColor: '#6f6021', sheen: 0.3, bump: 1.4 },
  shadowSkin: { color: '#968238', roughness: 0.55, pattern: 'skin', patternScale: 6, patternColor: '#6d5f25', sheen: 0.3, bump: 1.4 },
  teeth: { color: '#efe7cc', roughness: 0.22, patternColor: '#c9b98a' },
  gums: { color: '#4d1611', roughness: 0.35, pattern: 'skin', patternScale: 20, patternColor: '#2a0906' },
  socket: { color: '#1b120a', roughness: 0.35, pattern: 'skin', patternScale: 10, patternColor: '#0c0703' },
  eye: { color: '#060504', roughness: 0.04, emissive: '#3a0d05', emissiveStrength: 0.4 },
  nail: { color: '#7b6c33', roughness: 0.3 },
};

const P = (name, shape, material, bind, o = {}) => ({ name, shape, material, bind, position: o.position || [0, 0, 0], rotation: o.rotation || [0, 0, 0], scale: o.scale || [1, 1, 1], modifiers: o.modifiers || [], ...(o.mirror ? { mirror: true } : {}), ...(o.castShadow === false ? { castShadow: false } : {}) });
const sq = (rx, ry, rz, e1, e2, extra = {}) => ({ type: 'superquadric', rx, ry, rz, e1, e2, widthSegments: 36, heightSegments: 24, phiStart: 0, phiLength: 360, thetaStart: 0, thetaLength: 180, taperTop: 1, taperBottom: 1, ...extra });
const sph = (radius, extra = {}) => ({ type: 'sphere', radius, widthSegments: 20, heightSegments: 14, phiStart: 0, phiLength: 360, thetaStart: 0, thetaLength: 180, ...extra });
const tube = (path, radii, extra = {}) => ({ type: 'tube', path, radii, radialSegments: 16, samples: 8, caps: true, flatten: 1, arc: 360, arcOffset: 0, twist: 0, ...extra });
const rbox = (width, height, depth, bevel) => ({ type: 'box', width, height, depth, bevel, bevelSegments: 2, segments: 1 });

// A row of teeth: half a row built with Array, mirrored across the centre line, then
// wrapped around the face (Bend toward -Z) and curled into a grin (Bend toward +Y).
const teethRow = (h, grin, wrap = -92) => [
  { type: 'array', count: 8, offsetX: 0.0142, offsetY: 0, offsetZ: 0, rotX: 0, rotY: 0, rotZ: 0, scaleStep: 0.94 },
  { type: 'mirror', axis: 'x', offset: -0.0071 },
  { type: 'bend', axis: 'x', toward: 'z', angle: wrap },
  { type: 'bend', axis: 'x', toward: 'y', angle: grin },
];

const MOUTH_Y = 2.232, MOUTH_Z = 0.145;
export const GRINNER_PARTS = [
  // ---------------------------------------------------------------- head
  P('Skull', sq(0.104, 0.155, 0.12, 0.85, 0.92, { widthSegments: 48, heightSegments: 32 }), 'skin', { bone: 'head' }, { position: [0, 2.3, 0.04], modifiers: [{ type: 'profile', axis: 'y', values: [0.62, 0.84, 0.98, 1.0, 1.0, 0.96] }, { type: 'displace', amount: 0.003, scale: 18, seed: 9, octaves: 2 }] }),
  P('Brow Ridge', sq(0.084, 0.013, 0.02, 0.7, 0.9), 'skin', { bone: 'head' }, { position: [0, 2.338, 0.13], modifiers: [{ type: 'bend', axis: 'x', toward: 'z', angle: -46 }] }),
  P('Eye Socket', sph(0.026, { widthSegments: 18, heightSegments: 12 }), 'socket', { bone: 'head' }, { position: [0.044, 2.314, 0.13], scale: [1.2, 0.82, 0.45], mirror: true }),
  P('Eye', sph(0.0075, { widthSegments: 12, heightSegments: 8 }), 'eye', { bone: 'head' }, { position: [0.044, 2.312, 0.138], mirror: true, castShadow: false }),
  P('Cheekbone', sph(0.02), 'skin', { bone: 'head' }, { position: [0.074, 2.268, 0.094], scale: [1, 0.8, 0.8], mirror: true }),
  P('Nose', { type: 'capsule', radius: 0.009, length: 0.02, radialSegments: 12, capSegments: 5 }, 'skin', { bone: 'head' }, { position: [0, 2.284, 0.152], rotation: [-20, 0, 0], modifiers: [{ type: 'taper', axis: 'y', amount: -0.3, curve: 1 }] }),
  P('Gums', rbox(0.0146, 0.058, 0.006, 0.002), 'gums', { bones: ['head', 'jaw'], falloff: 10 }, { position: [0, MOUTH_Y, MOUTH_Z - 0.006], modifiers: teethRow(0.056, 37) }),
  P('Upper Teeth', rbox(0.0132, 0.023, 0.007, 0.0025), 'teeth', { bone: 'head' }, { position: [0, MOUTH_Y + 0.0125, MOUTH_Z + 0.001], modifiers: teethRow(0.021, 36) }),
  P('Lower Teeth', rbox(0.0132, 0.019, 0.007, 0.0025), 'teeth', { bone: 'jaw' }, { position: [0, MOUTH_Y - 0.011, MOUTH_Z], modifiers: teethRow(0.018, 40) }),
  // ---------------------------------------------------------------- neck
  P('Neck', tube([[0, 1.84, -0.01], [0, 1.98, 0.012], [0, 2.1, 0.035], [0, 2.2, 0.05]], [0.052, 0.034, 0.031, 0.045], { caps: false }), 'skin', { bones: ['chest', 'neck', 'head'], falloff: 7 }),
  P('Neck Tendon', tube([[0.048, 2.19, 0.04], [0.03, 2.02, 0.035], [0.022, 1.87, 0.065]], [0.011, 0.009, 0.013]), 'skin', { bones: ['chest', 'neck', 'head'], falloff: 7 }, { mirror: true }),
  P('Collarbone', tube([[0.015, 1.85, 0.075], [0.1, 1.865, 0.055], [0.18, 1.85, 0.0]], [0.013, 0.011, 0.015]), 'skin', { bones: ['chest', 'shoulder.L'], falloff: 6 }, { mirror: true }),
  // ---------------------------------------------------------------- torso
  P('Ribcage', sq(0.168, 0.2, 0.118, 0.72, 0.8, { widthSegments: 44, heightSegments: 28 }), 'skin', { bones: ['spine', 'chest', 'neck'], falloff: 5 }, { position: [0, 1.67, 0.0], modifiers: [{ type: 'profile', axis: 'y', values: [0.72, 0.92, 1.0, 0.98, 0.9, 0.72] }] }),
  P('Ribs', { type: 'torus', radius: 0.146, tube: 0.0095, radialSegments: 8, tubularSegments: 40, arc: 150, tubeScaleY: 0.7 }, 'skin', { bones: ['spine', 'chest'], falloff: 5 }, { position: [0, 1.75, 0.004], rotation: [16, -75, 0], scale: [1.09, 1, 0.78], modifiers: [{ type: 'array', count: 5, offsetX: 0, offsetY: -0.046, offsetZ: 0.002, rotX: 0, rotY: 0, rotZ: 0, scaleStep: 0.93 }] }),
  P('Sternum', { type: 'capsule', radius: 0.011, length: 0.15, radialSegments: 10, capSegments: 4 }, 'skin', { bone: 'chest' }, { position: [0, 1.71, 0.113], rotation: [-8, 0, 0] }),
  P('Belly', sq(0.112, 0.14, 0.08, 0.6, 0.8), 'shadowSkin', { bones: ['hips', 'spine'], falloff: 6 }, { position: [0, 1.44, -0.005] }),
  P('Pelvis', sq(0.135, 0.1, 0.088, 0.55, 0.75, { taperBottom: 0.75 }), 'skin', { bones: ['hips', 'thigh.L', 'thigh.R'], falloff: 6 }, { position: [0, 1.3, 0.0] }),
  P('Hip Bone', sph(0.028), 'skin', { bone: 'hips' }, { position: [0.118, 1.36, 0.04], scale: [0.8, 1, 1.2], mirror: true }),
  P('Shoulder', sph(0.048), 'skin', { bones: ['chest', 'shoulder.L', 'upperArm.L'], falloff: 6 }, { position: [0.18, 1.83, -0.02], mirror: true }),
  P('Shoulder Blade', sq(0.06, 0.08, 0.018, 0.6, 0.8), 'shadowSkin', { bones: ['chest', 'shoulder.L'], falloff: 6 }, { position: [0.09, 1.75, -0.105], rotation: [0, 12, 0], mirror: true }),
  // ---------------------------------------------------------------- arms
  P('Arm', tube([[0.18, 1.845, -0.02], [0.215, 1.5, -0.025], [0.25, 1.17, -0.03], [0.27, 0.86, -0.015], [0.29, 0.56, 0.0]], [0.04, 0.028, 0.031, 0.024, 0.019], { caps: false, samples: 10 }), 'skin', { bones: ['shoulder.L', 'upperArm.L', 'foreArm.L', 'hand.L'], falloff: 8 }, { mirror: true }),
  P('Elbow', sph(0.027), 'skin', { bones: ['upperArm.L', 'foreArm.L'], falloff: 6 }, { position: [0.25, 1.17, -0.045], mirror: true }),
  P('Wrist Knob', sph(0.016), 'skin', { bone: 'hand.L' }, { position: [0.298, 0.56, -0.012], mirror: true }),
  P('Palm', rbox(0.024, 0.1, 0.066, 0.01), 'skin', { bone: 'hand.L' }, { position: [0.296, 0.505, 0.002], rotation: [0, 0, 4], mirror: true }),
  ...FINGERS.map((f) => P(f.name[0].toUpperCase() + f.name.slice(1) + ' Finger', { type: 'capsule', radius: f.radius, length: f.length - f.radius, radialSegments: 10, capSegments: 4 }, 'skin', { bones: ['hand.L', f.name + '1.L', f.name + '2.L'], falloff: 9 }, { position: [FINGER_X, KNUCKLE_Y + 0.004 - (f.length + f.radius) / 2, f.z], mirror: true, modifiers: [{ type: 'profile', axis: 'y', values: [0.75, 1.1, 0.8, 1.05, 0.9] }] })),
  ...FINGERS.map((f) => P(f.name[0].toUpperCase() + f.name.slice(1) + ' Claw', { type: 'cone', radius: f.radius * 0.9, height: 0.028, radialSegments: 10, heightSegments: 2, capBottom: true, arc: 360 }, 'nail', { bone: f.name + '2.L' }, { position: [FINGER_X - 0.002, KNUCKLE_Y - f.length - 0.004, f.z], rotation: [0, 0, 180], mirror: true })),
  P('Thumb', { type: 'capsule', radius: 0.0085, length: 0.095, radialSegments: 10, capSegments: 4 }, 'skin', { bones: ['hand.L', 'thumb1.L', 'thumb2.L'], falloff: 9 }, { position: [0.287, 0.475, 0.044], rotation: [-17, 0, -6], mirror: true }),
  // ---------------------------------------------------------------- legs
  P('Leg', tube([[0.09, 1.34, 0], [0.095, 1.0, 0.012], [0.1, 0.68, 0.02], [0.102, 0.4, 0.0], [0.1, 0.1, -0.012]], [0.058, 0.04, 0.035, 0.03, 0.027], { caps: false, samples: 10 }), 'skin', { bones: ['hips', 'thigh.L', 'shin.L', 'foot.L'], falloff: 8 }, { mirror: true }),
  P('Knee', sph(0.033), 'skin', { bones: ['thigh.L', 'shin.L'], falloff: 6 }, { position: [0.1, 0.68, 0.034], scale: [1, 1.2, 0.8], mirror: true }),
  P('Ankle', sph(0.028), 'skin', { bone: 'foot.L' }, { position: [0.1, 0.075, -0.012], mirror: true }),
  P('Foot', sq(0.034, 0.028, 0.125, 0.6, 0.8), 'skin', { bones: ['foot.L', 'toe.L'], falloff: 6 }, { position: [0.101, 0.035, 0.07], mirror: true, modifiers: [{ type: 'squash', axis: 'y', min: -0.026, max: 1 }, { type: 'taper', axis: 'z', amount: 0.15, curve: 1 }] }),
  P('Toes', { type: 'capsule', radius: 0.008, length: 0.03, radialSegments: 8, capSegments: 3 }, 'skin', { bone: 'toe.L' }, { position: [0.083, 0.012, 0.19], rotation: [90, 0, 0], mirror: true, modifiers: [{ type: 'array', count: 4, offsetX: 0.012, offsetY: 0, offsetZ: 0.004, rotX: 0, rotY: 0, rotZ: 0, scaleStep: 0.92 }] }),
];

// Creepy quirks layered onto the synthesized cycles. Frequencies are whole multiples
// of the loop so every clip stays seamless.
const twitch = (phi, a, b) => Math.sin(Math.PI * 2 * phi * a) * 0.6 + Math.sin(Math.PI * 2 * phi * b + 1.3) * 0.4;

export function grinnerClips() {
  const sk = new Skeleton(expandSkeleton(GRINNER_SKELETON));
  return [
    synthesizeIdle(sk, {
      name: 'Idle', duration: 5, samples: 60, hipHeight: 1.31, footX: 0.12, thumbHook: false,
      overlay: (api, phi) => {
        // slow unnatural head tilt with a sharp twitch, fingers flexing one after another
        const snap = Math.pow(Math.max(0, Math.sin(Math.PI * 2 * phi)), 12);
        api.set('neck', [6, 0, 10 * Math.sin(Math.PI * 2 * phi)]);
        api.setWorld('head', [4, 10 * Math.sin(Math.PI * 2 * phi + 0.5), 18 * Math.sin(Math.PI * 2 * phi) + 12 * snap]);
        for (const side of ['L', 'R']) {
          api.set('upperArm', [2, 0, 3], side); api.set('foreArm', [-8, 0, 0], side);
          const w = (k) => 0.35 + 0.35 * Math.max(0, Math.sin(Math.PI * 2 * (phi * 2 - k * 0.1 - (side === 'R' ? 0.5 : 0))));
          api.hand(side, { curl: [0.2, w(0), w(1), w(2), w(3)], spread: 0.5 });
        }
      },
    }),
    synthesizeLocomotion(sk, {
      name: 'Walk', duration: 1.7, speed: 0.9, stance: 0.66, samples: 34, hipHeight: 1.22, bob: 0.03, sway: 0.05,
      lean: 9, pelvisYaw: 8, pelvisRoll: 7, spineCounter: 0.6, stepWidth: 0.1, center: 0.0,
      heelStrike: -10, toeOff: 30, flatStart: 0.14, heelOff: 0.55, swingPitchMid: 10,
      kick: [0, 0.12, -0.04], drive: [0, 0.1, 0.1], armSwing: 7, armAbduct: 4, armBias: 2, elbow: 8, elbowSwing: 6,
      headPitch: 8, handFlex: -5, spineLean: 4, chestLean: 5, hands: 'claw', fingerSwing: 0.12, syncGroup: 'grinner',
      overlay: (api, phi) => {
        // head lolls side to side against the stride; arms dangle and lag behind
        api.setWorld('head', [10, 6 * Math.sin(Math.PI * 2 * phi), 18 * Math.sin(Math.PI * 2 * phi - 0.8) + 4 * twitch(phi, 6, 9)]);
        for (const side of ['L', 'R']) api.set('upperArm', [2 + 7 * Math.cos(Math.PI * 2 * (phi + (side === 'L' ? 0 : 0.5)) - 0.9), 0, 4 + 2 * Math.sin(Math.PI * 4 * phi)], side);
      },
    }),
    synthesizeLocomotion(sk, {
      name: 'Chase', duration: 0.74, speed: 5, stance: 0.3, samples: 30, hipHeight: 1.17, bob: 0.05, bobPhase: 0.15,
      sway: 0.02, lean: 28, pelvisYaw: 12, pelvisRoll: 5, spineCounter: 0.8, stepWidth: 0.09, center: -0.06,
      heelStrike: -4, toeOff: 50, flatStart: 0.2, heelOff: 0.3, swingPitchMid: 35,
      kick: [0, 0.5, -0.22], drive: [0, 0.38, 0.32], armSwing: 24, armAbduct: 16, armBias: -62, elbow: 14, elbowSwing: 18,
      headPitch: -18, handFlex: 10, spineLean: 8, chestLean: 6, hands: 'claw', fingerSwing: 0.2, syncGroup: 'grinner',
      overlay: (api, phi) => {
        // arms reach for the prey, claws spread; the head jitters and stays locked forward
        api.setWorld('head', [-22 + 5 * twitch(phi, 3, 7), 8 * twitch(phi, 2, 5), 12 * twitch(phi, 4, 9)]);
        for (const side of ['L', 'R']) api.hand(side, { curl: [0.3, 0.35 + 0.25 * Math.sin(Math.PI * 4 * phi), 0.4, 0.45, 0.5], spread: 0.9 });
      },
    }),
    synthesizeAllFours(sk, {
      name: 'Crawl', duration: 1.4, speed: 0.95, samples: 56, hipHeight: 0.98, pitch: 70, footWidth: 0.26, handWidth: 0.2, handReach: 0.34,
      overlay: (api, phi) => {
        // head upside-down tilt, the grin always facing forward
        api.setWorld('head', [8 + 4 * twitch(phi, 2, 5), 6 * twitch(phi, 3, 4), 38 + 10 * Math.sin(Math.PI * 2 * phi) + 5 * twitch(phi, 5, 7)]);
      },
    }),
  ];
}

export function grinnerDefinition({ withClips = true } = {}) {
  const def = { name: 'Grinner', skeleton: GRINNER_SKELETON, materials: GRINNER_MATERIALS, parts: GRINNER_PARTS, clips: withClips ? grinnerClips() : [], roles: { idle: 'Idle', walk: 'Walk', run: 'Chase', crawl: 'Crawl' } };
  return JSON.parse(JSON.stringify(def));
}
export const createGrinner = () => new Character(grinnerDefinition());
