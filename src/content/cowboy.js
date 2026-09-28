// The Cowboy — built entirely from parametric shapes + modifiers, rigged to a humanoid
// skeleton, with Idle / Walk / Run / Crawl clips from the gait synthesizer.
import { Character } from '../engine/character.js';
import { Skeleton } from '../engine/skeleton.js';
import { expandSkeleton } from '../engine/character.js';
import { synthesizeLocomotion, synthesizeCrawl, synthesizeIdle } from '../engine/gait.js';
import { v3Moves } from './moves.js';

// Fingers (left hand; mirrored to the right). Rest pose: straight, hanging down,
// palm facing the thigh (-X). Each finger has a proximal and a distal bone.
const KNUCKLE_Y = 0.845;
export const FINGERS = [
  { name: 'index', z: 0.041, length: 0.052, radius: 0.0092 },
  { name: 'middle', z: 0.0215, length: 0.057, radius: 0.0095 },
  { name: 'ring', z: 0.002, length: 0.053, radius: 0.0092 },
  { name: 'pinky', z: -0.0175, length: 0.043, radius: 0.0082 },
];
const FINGER_X = 0.277;
const FINGER_BONES = [
  ...FINGERS.flatMap((f) => {
    const j = KNUCKLE_Y - f.length * 0.55, tip = KNUCKLE_Y - f.length;
    return [
      { name: f.name + '1.L', parent: 'hand.L', head: [FINGER_X, KNUCKLE_Y, f.z], tail: [FINGER_X, j, f.z], mirror: true },
      { name: f.name + '2.L', parent: f.name + '1.L', head: [FINGER_X, j, f.z], tail: [FINGER_X, tip, f.z], mirror: true },
    ];
  }),
  { name: 'thumb1.L', parent: 'hand.L', head: [0.271, 0.8925, 0.042], tail: [0.262, 0.87, 0.055], mirror: true },
  { name: 'thumb2.L', parent: 'thumb1.L', head: [0.262, 0.87, 0.055], tail: [0.253, 0.8475, 0.068], mirror: true },
];

export const COWBOY_SKELETON = [
  { name: 'root', parent: null, head: [0, 0, 0], tail: [0, 0.2, 0], deform: false },
  { name: 'hips', parent: 'root', head: [0, 0.98, 0], tail: [0, 1.1, 0] },
  { name: 'spine', parent: 'hips', head: [0, 1.1, 0], tail: [0, 1.28, 0] },
  { name: 'chest', parent: 'spine', head: [0, 1.28, 0], tail: [0, 1.5, 0] },
  { name: 'neck', parent: 'chest', head: [0, 1.5, 0], tail: [0, 1.6, 0.01] },
  { name: 'head', parent: 'neck', head: [0, 1.6, 0.01], tail: [0, 1.84, 0.01] },
  { name: 'bandana', parent: 'neck', head: [0, 1.49, 0.085], tail: [0, 1.37, 0.12], spring: { stiffness: 160, damping: 9, gravity: 3 } },
  { name: 'holster', parent: 'hips', head: [-0.175, 0.95, 0.0], tail: [-0.18, 0.75, 0.0], spring: { stiffness: 260, damping: 12, gravity: 2 } },
  { name: 'shoulder.L', parent: 'chest', head: [0.04, 1.45, -0.01], tail: [0.18, 1.45, -0.01], mirror: true },
  { name: 'upperArm.L', parent: 'shoulder.L', head: [0.18, 1.45, -0.01], tail: [0.235, 1.175, -0.02], mirror: true },
  { name: 'foreArm.L', parent: 'upperArm.L', head: [0.235, 1.175, -0.02], tail: [0.265, 0.935, 0.01], mirror: true },
  { name: 'hand.L', parent: 'foreArm.L', head: [0.265, 0.935, 0.01], tail: [0.276, 0.845, 0.018], mirror: true },
  ...FINGER_BONES,
  { name: 'thigh.L', parent: 'hips', head: [0.095, 0.95, 0], tail: [0.105, 0.53, 0.01], mirror: true },
  { name: 'shin.L', parent: 'thigh.L', head: [0.105, 0.53, 0.01], tail: [0.11, 0.1, -0.01], mirror: true },
  { name: 'foot.L', parent: 'shin.L', head: [0.11, 0.1, -0.01], tail: [0.113, 0.03, 0.12], mirror: true },
  { name: 'toe.L', parent: 'foot.L', head: [0.113, 0.03, 0.12], tail: [0.115, 0.025, 0.21], mirror: true },
];

export const COWBOY_MATERIALS = {
  skin: { color: '#c78a64', roughness: 0.55, pattern: 'skin', patternScale: 6, patternColor: '#b4553f', sheen: 0.3 },
  lips: { color: '#8e4c3e', roughness: 0.45, pattern: 'skin', patternScale: 8, patternColor: '#6e3026' },
  hair: { color: '#3a281c', roughness: 0.6, pattern: 'hair', patternScale: 4, sheen: 0.5 },
  eye: { color: '#efe9e2', roughness: 0.1, pattern: 'eye', patternColor: '#4d6f8c' },
  hatFelt: { color: '#8a6440', roughness: 0.85, pattern: 'felt', patternScale: 6, sheen: 0.6 },
  hatBand: { color: '#2b1d14', roughness: 0.5, pattern: 'leather', patternScale: 400, patternColor: '#120b07' },
  bandana: { color: '#a3241c', roughness: 0.8, pattern: 'fabric', patternScale: 320, sheen: 0.8 },
  shirt: { color: '#3f5f86', roughness: 0.85, pattern: 'plaid', patternScale: 9, patternColor: '#17233a', sheen: 0.6 },
  vest: { color: '#5b3a24', roughness: 0.55, pattern: 'leather', patternScale: 280, patternColor: '#2e1b10', sheen: 0.2 },
  pearl: { color: '#e4dac6', roughness: 0.25, metallic: 0.2 },
  gold: { color: '#d8ab45', roughness: 0.28, metallic: 1, pattern: 'metal', patternScale: 1 },
  silver: { color: '#cfd1d4', roughness: 0.22, metallic: 1, pattern: 'metal', patternScale: 1 },
  gunMetal: { color: '#3b3c40', roughness: 0.32, metallic: 1, pattern: 'metal', patternScale: 1 },
  grip: { color: '#7a4424', roughness: 0.45, pattern: 'wood', patternScale: 30, patternColor: '#3a1a0a' },
  belt: { color: '#3a2417', roughness: 0.5, pattern: 'leather', patternScale: 340, patternColor: '#1a0f08' },
  holster: { color: '#6b3f22', roughness: 0.5, pattern: 'leather', patternScale: 300, patternColor: '#3b1f0e' },
  jeans: { color: '#27405f', roughness: 0.92, pattern: 'denim', patternScale: 260, sheen: 0.05 },
  chaps: { color: '#8c5a33', roughness: 0.8, pattern: 'leather', patternScale: 260, patternColor: '#5a3218', sheen: 0.7, doubleSided: true },
  boot: { color: '#4b2c1a', roughness: 0.4, pattern: 'leather', patternScale: 320, patternColor: '#26140a' },
  sole: { color: '#1e1610', roughness: 0.7, pattern: 'leather', patternScale: 360, patternColor: '#0a0604' },
  glove: { color: '#9a6a3e', roughness: 0.65, pattern: 'leather', patternScale: 360, patternColor: '#5e3b1e', sheen: 0.4 },
  rope: { color: '#b99b64', roughness: 0.85, pattern: 'hair', patternScale: 6, sheen: 0.4 },
};

const P = (name, shape, material, bind, o = {}) => ({ name, shape, material, bind, position: o.position || [0, 0, 0], rotation: o.rotation || [0, 0, 0], scale: o.scale || [1, 1, 1], modifiers: o.modifiers || [], ...(o.mirror ? { mirror: true } : {}), ...(o.castShadow === false ? { castShadow: false } : {}) });
const sq = (rx, ry, rz, e1, e2, extra = {}) => ({ type: 'superquadric', rx, ry, rz, e1, e2, widthSegments: 36, heightSegments: 22, phiStart: 0, phiLength: 360, thetaStart: 0, thetaLength: 180, taperTop: 1, taperBottom: 1, ...extra });
const rbox = (width, height, depth, bevel, extra = {}) => ({ type: 'box', width, height, depth, bevel, bevelSegments: 3, ...extra });

export const COWBOY_PARTS = [
  // ---------------------------------------------------------------- head
  P('Head', sq(0.097, 0.114, 0.105, 0.78, 0.9), 'skin', { bone: 'head' }, { position: [0, 1.705, 0.012], modifiers: [{ type: 'profile', axis: 'y', values: [0.72, 0.9, 1.0, 1.0, 0.94] }] }),
  P('Jaw', sq(0.074, 0.048, 0.07, 0.62, 0.85), 'skin', { bone: 'head' }, { position: [0, 1.625, 0.038] }),
  P('Nose', { type: 'capsule', radius: 0.0135, length: 0.026, radialSegments: 16, capSegments: 6 }, 'skin', { bone: 'head' }, { position: [0, 1.699, 0.111], rotation: [-22, 0, 0], scale: [1.05, 1, 1.1], modifiers: [{ type: 'taper', axis: 'y', amount: -0.3, curve: 1 }] }),
  P('Ear', sq(0.012, 0.031, 0.021, 0.8, 0.8, { widthSegments: 16, heightSegments: 12 }), 'skin', { bone: 'head' }, { position: [0.094, 1.695, 0.004], rotation: [0, -12, 8], mirror: true }),
  P('Eye', { type: 'sphere', radius: 0.0135, widthSegments: 20, heightSegments: 14, phiStart: 0, phiLength: 360, thetaStart: 0, thetaLength: 180 }, 'eye', { bone: 'head' }, { position: [0.036, 1.721, 0.103], rotation: [0, 6, 0], mirror: true, castShadow: false }),
  P('Eyelid', { type: 'sphere', radius: 0.0152, widthSegments: 20, heightSegments: 10, phiStart: 0, phiLength: 360, thetaStart: 0, thetaLength: 80 }, 'skin', { bone: 'head' }, { position: [0.036, 1.7215, 0.1025], rotation: [-30, 6, 0], mirror: true, castShadow: false }),
  P('Brow', rbox(0.04, 0.009, 0.013, 0.0042), 'hair', { bone: 'head' }, { position: [0.038, 1.745, 0.108], rotation: [-10, 8, -9], mirror: true }),
  P('Mustache', { type: 'tube', path: [[0, 1.671, 0.114], [0.02, 1.67, 0.111], [0.04, 1.661, 0.101], [0.05, 1.64, 0.093], [0.052, 1.62, 0.09]], radii: [0.0105, 0.0085, 0.006, 0.003], radialSegments: 12, samples: 6, caps: true, flatten: 0.75, arc: 360, arcOffset: 0, twist: 0 }, 'hair', { bone: 'head' }, { mirror: true }),
  P('Mouth', { type: 'capsule', radius: 0.0048, length: 0.03, radialSegments: 10, capSegments: 4 }, 'lips', { bone: 'head' }, { position: [0, 1.651, 0.1], rotation: [0, 0, 90], scale: [1, 1, 0.7] }),
  P('Hair', sq(0.097, 0.114, 0.105, 0.78, 0.9, { phiStart: 100, phiLength: 160, thetaStart: 30, thetaLength: 85 }), 'hair', { bone: 'head' }, { position: [0, 1.705, 0.01], scale: [1.035, 1.02, 1.035], modifiers: [{ type: 'profile', axis: 'y', values: [0.72, 0.9, 1.0, 1.0, 0.94] }, { type: 'solidify', thickness: 0.004 }] }),
  P('Sideburn', rbox(0.012, 0.045, 0.02, 0.005), 'hair', { bone: 'head' }, { position: [0.09, 1.7, 0.035], rotation: [0, -10, 4], mirror: true }),
  // ---------------------------------------------------------------- hat
  P('Hat Crown', { type: 'lathe', points: [[0.104, 0], [0.108, 0.05], [0.104, 0.092], [0.094, 0.118], [0.07, 0.13], [0.04, 0.118], [0.012, 0.108], [0, 0.112]], segments: 48, arc: 360, smooth: 2 }, 'hatFelt', { bone: 'head' }, { position: [0, 1.79, -0.004], rotation: [-6, 0, 0], scale: [1, 1, 1.14], modifiers: [{ type: 'profile', axis: 'x', values: [0.9, 1, 1, 1, 0.9] }] }),
  P('Hat Brim', { type: 'lathe', points: [[0.095, 0.0], [0.14, 0.003], [0.18, 0.009], [0.2, 0.019], [0.209, 0.029], [0.203, 0.033], [0.18, 0.02], [0.14, 0.014], [0.095, 0.012]], segments: 64, arc: 360, smooth: 1 }, 'hatFelt', { bone: 'head' }, { position: [0, 1.792, -0.004], rotation: [-6, 0, 0], scale: [1, 1, 1.14], modifiers: [{ type: 'bend', axis: 'x', toward: 'y', angle: 62 }, { type: 'bend', axis: 'z', toward: 'y', angle: -14 }] }),
  P('Hat Band', { type: 'cylinder', radiusTop: 0.105, radiusBottom: 0.1085, height: 0.024, radialSegments: 48, heightSegments: 1, capTop: false, capBottom: false, arc: 360 }, 'hatBand', { bone: 'head' }, { position: [0, 1.806, -0.004], rotation: [-6, 0, 0], scale: [1.012, 1, 1.155] }),
  P('Hat Concho', { type: 'extrude', shape: 'gear', points: 5, inner: 0.45, radius: 0.012, teeth: 10, toothDepth: 0.2, depth: 0.004, bevel: 0.0015 }, 'silver', { bone: 'head' }, { position: [0.1, 1.806, 0.035], rotation: [0, 70, 0] }),
  // ---------------------------------------------------------------- neck & bandana
  P('Neck', { type: 'cylinder', radiusTop: 0.05, radiusBottom: 0.058, height: 0.15, radialSegments: 24, heightSegments: 4, capTop: false, capBottom: false, arc: 360 }, 'skin', { bones: ['chest', 'neck', 'head'], falloff: 6 }, { position: [0, 1.565, 0.0] }),
  P('Bandana Collar', { type: 'torus', radius: 0.064, tube: 0.022, tubeScaleY: 1.45, radialSegments: 14, tubularSegments: 36, arc: 360 }, 'bandana', { bones: ['chest', 'neck'], falloff: 6 }, { position: [0, 1.508, 0.004], rotation: [12, 0, 0], modifiers: [{ type: 'displace', amount: 0.004, scale: 40, seed: 3, octaves: 2 }] }),
  P('Bandana Flap', { type: 'extrude', shape: 'polygon', points: 3, inner: 0.45, radius: 0.085, teeth: 12, toothDepth: 0.12, depth: 0.008, bevel: 0.002 }, 'bandana', { bone: 'bandana' }, { position: [0, 1.435, 0.1], rotation: [-14, 0, 180], scale: [1.1, 1, 1], modifiers: [{ type: 'bend', axis: 'x', toward: 'z', angle: -35 }, { type: 'displace', amount: 0.003, scale: 30, seed: 5, octaves: 2 }] }),
  // ---------------------------------------------------------------- torso
  P('Shirt', sq(0.158, 0.285, 0.1, 0.55, 0.62, { widthSegments: 40, heightSegments: 28 }), 'shirt', { bones: ['hips', 'spine', 'chest', 'neck'], falloff: 5 }, { position: [0, 1.225, 0.0], modifiers: [{ type: 'profile', axis: 'y', values: [0.9, 0.86, 0.9, 1.0, 1.07, 1.02, 0.75] }] }),
  P('Deltoid', { type: 'sphere', radius: 0.062, widthSegments: 24, heightSegments: 16, phiStart: 0, phiLength: 360, thetaStart: 0, thetaLength: 180 }, 'shirt', { bones: ['chest', 'shoulder.L', 'upperArm.L'], falloff: 6 }, { position: [0.175, 1.415, -0.01], scale: [1.0, 0.95, 1.05], mirror: true }),
  P('Collar', { type: 'extrude', shape: 'polygon', points: 3, inner: 0.45, radius: 0.036, teeth: 12, toothDepth: 0.12, depth: 0.004, bevel: 0.001 }, 'shirt', { bones: ['chest', 'neck'], falloff: 6 }, { position: [0.036, 1.486, 0.066], rotation: [-55, 18, 25], mirror: true }),
  P('Vest', sq(0.172, 0.2, 0.113, 0.5, 0.62, { widthSegments: 44, heightSegments: 20, phiStart: 22, phiLength: 316, thetaStart: 22, thetaLength: 128 }), 'vest', { bones: ['hips', 'spine', 'chest'], falloff: 5 }, { position: [0, 1.28, -0.004], modifiers: [{ type: 'profile', axis: 'y', values: [0.95, 0.97, 1.0, 1.04, 1.0] }, { type: 'solidify', thickness: 0.008 }] }),
  P('Vest Pocket', rbox(0.045, 0.004, 0.012, 0.0018), 'belt', { bone: 'chest' }, { position: [0.09, 1.225, 0.104], rotation: [8, 28, -4], mirror: true }),
  P('Sheriff Badge', { type: 'extrude', shape: 'star', points: 5, inner: 0.48, radius: 0.028, teeth: 12, toothDepth: 0.12, depth: 0.005, bevel: 0.0018 }, 'gold', { bone: 'chest' }, { position: [0.083, 1.35, 0.114], rotation: [-8, 26, 0] }),
  P('Badge Rim', { type: 'torus', radius: 0.0165, tube: 0.0022, radialSegments: 8, tubularSegments: 28, arc: 360, tubeScaleY: 1 }, 'gold', { bone: 'chest' }, { position: [0.084, 1.35, 0.116], rotation: [82, 26, 0] }),
  P('Shirt Buttons', { type: 'cylinder', radiusTop: 0.0065, radiusBottom: 0.0065, height: 0.004, radialSegments: 14, heightSegments: 1, capTop: true, capBottom: true, arc: 360 }, 'pearl', { bones: ['spine', 'chest'], falloff: 5 }, { position: [0, 1.43, 0.083], rotation: [90, 0, 0], modifiers: [{ type: 'array', count: 5, offsetX: 0, offsetY: 0, offsetZ: 0.07, rotX: 0, rotY: 0, rotZ: 0, scaleStep: 1 }] }),
  // ---------------------------------------------------------------- hips & belt
  P('Pelvis', sq(0.15, 0.09, 0.098, 0.5, 0.62, { taperBottom: 0.7 }), 'jeans', { bones: ['hips', 'thigh.L', 'thigh.R', 'spine'], falloff: 6 }, { position: [0, 0.99, -0.004] }),
  P('Belt', sq(0.165, 0.024, 0.11, 0.12, 0.62, { widthSegments: 48, heightSegments: 8 }), 'belt', { bones: ['hips', 'spine'], falloff: 8 }, { position: [0, 1.03, 0.0] }),
  P('Buckle', rbox(0.078, 0.054, 0.012, 0.007), 'silver', { bone: 'hips' }, { position: [0, 1.03, 0.112] }),
  P('Buckle Star', { type: 'extrude', shape: 'star', points: 5, inner: 0.45, radius: 0.018, teeth: 12, toothDepth: 0.12, depth: 0.004, bevel: 0.0012 }, 'gold', { bone: 'hips' }, { position: [0, 1.03, 0.119] }),
  P('Holster', rbox(0.058, 0.17, 0.036, 0.013), 'holster', { bone: 'holster' }, { position: [-0.185, 0.84, 0.005], rotation: [-6, 0, 4], modifiers: [{ type: 'taper', axis: 'y', amount: 0.22, curve: 1 }] }),
  P('Holster Loop', rbox(0.066, 0.025, 0.042, 0.006), 'belt', { bone: 'holster' }, { position: [-0.184, 0.905, 0.004], rotation: [-6, 0, 4] }),
  P('Revolver Cylinder', { type: 'cylinder', radiusTop: 0.017, radiusBottom: 0.017, height: 0.04, radialSegments: 6, heightSegments: 1, capTop: true, capBottom: true, arc: 360 }, 'gunMetal', { bone: 'holster' }, { position: [-0.185, 0.935, 0.012], rotation: [-6, 0, 4], modifiers: [{ type: 'smooth', iterations: 1, factor: 0.3 }] }),
  P('Revolver Grip', rbox(0.026, 0.075, 0.032, 0.009), 'grip', { bone: 'holster' }, { position: [-0.187, 0.975, -0.02], rotation: [-32, 0, 4], modifiers: [{ type: 'bend', axis: 'y', toward: 'z', angle: -25 }] }),
  P('Revolver Hammer', rbox(0.008, 0.022, 0.012, 0.003), 'gunMetal', { bone: 'holster' }, { position: [-0.186, 0.962, -0.004], rotation: [-40, 0, 4] }),
  P('Lasso', { type: 'torus', radius: 0.078, tube: 0.0085, radialSegments: 8, tubularSegments: 48, arc: 360, tubeScaleY: 1 }, 'rope', { bone: 'hips' }, { position: [0.182, 0.92, -0.01], rotation: [0, 0, 90], modifiers: [{ type: 'array', count: 3, offsetX: 0, offsetY: 0.013, offsetZ: 0, rotX: 0, rotY: 8, rotZ: 0, scaleStep: 1.02 }] }),
  // ---------------------------------------------------------------- arms (mirrored)
  P('Sleeve', { type: 'tube', path: [[0.165, 1.452, -0.01], [0.207, 1.33, -0.015], [0.235, 1.175, -0.02], [0.25, 1.05, -0.004], [0.262, 0.965, 0.007]], radii: [0.056, 0.049, 0.043, 0.04, 0.038], radialSegments: 20, samples: 6, caps: false, flatten: 1, arc: 360, arcOffset: 0, twist: 0 }, 'shirt', { bones: ['chest', 'shoulder.L', 'upperArm.L', 'foreArm.L'], falloff: 7 }, { mirror: true }),
  P('Glove Cuff', { type: 'cylinder', radiusTop: 0.042, radiusBottom: 0.034, height: 0.06, radialSegments: 20, heightSegments: 2, capTop: false, capBottom: false, arc: 360 }, 'glove', { bone: 'foreArm.L' }, { mirror: true, position: [0.263, 0.952, 0.009], rotation: [6, 0, 7], modifiers: [{ type: 'solidify', thickness: 0.003 }] }),
  P('Palm', rbox(0.03, 0.085, 0.074, 0.013), 'glove', { bone: 'hand.L' }, { mirror: true, position: [0.274, 0.885, 0.015], rotation: [0, 0, 6] }),
  ...FINGERS.map((f) => P(f.name[0].toUpperCase() + f.name.slice(1) + ' Finger', { type: 'capsule', radius: f.radius, length: f.length - f.radius, radialSegments: 12, capSegments: 5 }, 'glove', { bones: ['hand.L', f.name + '1.L', f.name + '2.L'], falloff: 9 }, { position: [FINGER_X, KNUCKLE_Y + 0.004 - (f.length + f.radius) / 2, f.z], mirror: true })),
  P('Thumb', { type: 'capsule', radius: 0.0105, length: 0.034, radialSegments: 12, capSegments: 5 }, 'glove', { bones: ['hand.L', 'thumb1.L', 'thumb2.L'], falloff: 9 }, { position: [0.262, 0.87, 0.055], rotation: [-28, 0, -22], mirror: true }),
  // ---------------------------------------------------------------- legs (mirrored)
  P('Jeans Leg', { type: 'tube', path: [[0.092, 1.0, 0.0], [0.1, 0.76, 0.012], [0.105, 0.53, 0.02], [0.108, 0.33, 0.0], [0.11, 0.17, -0.012]], radii: [0.082, 0.068, 0.055, 0.052, 0.062], radialSegments: 22, samples: 6, caps: false, flatten: 1, arc: 360, arcOffset: 0, twist: 0 }, 'jeans', { bones: ['hips', 'thigh.L', 'shin.L'], falloff: 7 }, { mirror: true }),
  P('Chaps', { type: 'tube', path: [[0.094, 0.98, 0.0], [0.1, 0.76, 0.012], [0.105, 0.53, 0.02], [0.108, 0.33, 0.0], [0.11, 0.2, -0.012]], radii: [0.093, 0.079, 0.066, 0.063, 0.071], radialSegments: 22, samples: 6, caps: false, flatten: 1, arc: 250, arcOffset: -140, twist: 0 }, 'chaps', { bones: ['hips', 'thigh.L', 'shin.L'], falloff: 7 }, { mirror: true, modifiers: [{ type: 'solidify', thickness: 0.004 }] }),
  P('Chaps Fringe', rbox(0.004, 0.055, 0.011, 0.0018), 'chaps', { bones: ['thigh.L', 'shin.L'], falloff: 6 }, { position: [0.19, 0.9, 0.0], rotation: [0, 0, 3], mirror: true, modifiers: [{ type: 'array', count: 13, offsetX: -0.0014, offsetY: -0.056, offsetZ: 0.0004, rotX: 0, rotY: 0, rotZ: 0, scaleStep: 1 }] }),
  P('Boot Shaft', { type: 'cylinder', radiusTop: 0.056, radiusBottom: 0.05, height: 0.17, radialSegments: 22, heightSegments: 3, capTop: false, capBottom: true, arc: 360 }, 'boot', { bones: ['shin.L', 'foot.L'], falloff: 8 }, { mirror: true, position: [0.11, 0.2, -0.008] }),
  P('Boot Foot', sq(0.047, 0.047, 0.125, 0.6, 0.78), 'boot', { bones: ['foot.L', 'toe.L'], falloff: 6 }, { mirror: true, position: [0.113, 0.068, 0.045], modifiers: [{ type: 'taper', axis: 'z', amount: -0.32, curve: 1.2 }, { type: 'squash', axis: 'y', min: -0.043, max: 1 }] }),
  P('Boot Sole', rbox(0.088, 0.013, 0.262, 0.005), 'sole', { bones: ['foot.L', 'toe.L'], falloff: 6 }, { mirror: true, position: [0.113, 0.019, 0.048], modifiers: [{ type: 'taper', axis: 'z', amount: -0.3, curve: 1.3 }] }),
  P('Boot Heel', rbox(0.058, 0.045, 0.058, 0.004), 'sole', { bone: 'foot.L' }, { mirror: true, position: [0.112, 0.0225, -0.048], modifiers: [{ type: 'taper', axis: 'y', amount: 0.14, curve: 1 }] }),
  P('Spur Strap', { type: 'torus', radius: 0.054, tube: 0.0055, radialSegments: 8, tubularSegments: 36, arc: 360, tubeScaleY: 1.6 }, 'belt', { bone: 'foot.L' }, { mirror: true, position: [0.112, 0.075, -0.012], rotation: [-18, 0, 0], scale: [1, 1, 1.18] }),
  P('Spur Shank', { type: 'cylinder', radiusTop: 0.004, radiusBottom: 0.004, height: 0.05, radialSegments: 8, heightSegments: 1, capTop: true, capBottom: true, arc: 360 }, 'silver', { bone: 'foot.L' }, { mirror: true, position: [0.112, 0.072, -0.09], rotation: [80, 0, 0] }),
  P('Spur Rowel', { type: 'extrude', shape: 'star', points: 8, inner: 0.42, radius: 0.019, teeth: 12, toothDepth: 0.12, depth: 0.003, bevel: 0.0008 }, 'silver', { bone: 'foot.L' }, { mirror: true, position: [0.112, 0.068, -0.118], rotation: [0, 90, 0] }),
];

export function cowboyDefinition({ withClips = true } = {}) {
  const def = { name: 'Cowboy', skeleton: COWBOY_SKELETON, materials: COWBOY_MATERIALS, parts: COWBOY_PARTS, clips: [] };
  if (withClips) def.clips = cowboyClips();
  return JSON.parse(JSON.stringify(def));
}

export function cowboyClips() {
  const sk = new Skeleton(expandSkeleton(COWBOY_SKELETON));
  return [
    synthesizeIdle(sk, { name: 'Idle' }),
    synthesizeLocomotion(sk, { name: 'Walk', duration: 1.06, speed: 1.15, stance: 0.6, hipHeight: 0.94, bob: 0.018, center: -0.015 }),
    synthesizeLocomotion(sk, {
      name: 'Run', duration: 0.68, speed: 2.9, stance: 0.36, samples: 20, hipHeight: 0.93, bob: 0.035, bobPhase: 0.18,
      sway: 0.012, lean: 11, pelvisYaw: 9, pelvisRoll: 3, spineCounter: 1.1, stepWidth: 0.09, center: -0.1,
      heelStrike: -6, toeOff: 48, flatStart: 0.2, heelOff: 0.35, swingPitchMid: 30,
      kick: [0, 0.34, -0.16], drive: [0, 0.3, 0.22], armSwing: 38, armBias: -8, armAbduct: 10, elbow: 78, elbowSwing: 22,
      headPitch: 4, handFlex: -15, spineLean: 3, chestLean: 2, hands: 'fist', fingerSwing: 0.04,
    }),
    synthesizeCrawl(sk, { name: 'Crawl' }),
    ...v3Moves(sk),
  ];
}

export function createCowboy() { return new Character(cowboyDefinition()); }
