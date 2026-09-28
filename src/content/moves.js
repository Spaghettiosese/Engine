// V3 moves for humanoid rigs (Cowboy, soldier): directional walks for 2D blend spaces,
// a three-part jump for state machines, upper-body gestures for layers, and an additive
// flinch. Built from key poses with arm and leg IK, so they fit any rig with the standard
// bone names.
import { synthesizeLocomotion } from '../engine/gait.js';
import { keyPoseClip } from '../engine/choreo.js';

const WALK = { duration: 1.06, speed: 1.15, stance: 0.6, hipHeight: 0.94, bob: 0.018, center: -0.015 };

// a relaxed standing pose every gesture starts and ends on
const STAND = {
  bones: { hips: [0, 0, 0], spine: [2, 0, 0], chest: [1, 0, 0], neck: [0, 0, 0], head: [0, 0, 0], 'shoulder*': [0, 0, 0], 'upperArm*': [3, 0, 6], 'foreArm*': [-14, 0, 0], 'hand*': [-6, 0, 0] },
  hips: [0, 0.965, 0], legs: { L: 'plant', R: 'plant' }, arms: { L: null, R: null }, hands: { L: 'relaxed', R: 'relaxed' },
};
const foot = (side, y = 0.1, z = -0.01, pitch = 0) => ({ target: [side === 'L' ? 0.11 : -0.11, y, z], pitch });

export function directionalWalks(sk) {
  return [
    synthesizeLocomotion(sk, { name: 'Walk Back', ...WALK, speed: 0.95, heading: 180, lean: -1, armSwing: 12, pelvisYaw: 4 }),
    synthesizeLocomotion(sk, { name: 'Strafe Left', ...WALK, speed: 0.9, heading: 90, stepWidth: 0.13, pelvisYaw: 2, pelvisRoll: 5, armSwing: 6, armAbduct: 8, sway: 0.03 }),
    synthesizeLocomotion(sk, { name: 'Strafe Right', ...WALK, speed: 0.9, heading: -90, stepWidth: 0.13, pelvisYaw: 2, pelvisRoll: 5, armSwing: 6, armAbduct: 8, sway: 0.03 }),
  ];
}

export function jumpClips(sk) {
  const start = keyPoseClip(sk, 'Jump Start', [
    { t: 0, ...STAND },
    { t: 0.16, hips: [0, 0.8, -0.03], bones: { hips: [16, 0, 0], spine: [14, 0, 0], chest: [8, 0, 0], neck: [-14, 0, 0], head: [-6, 0, 0], 'upperArm*': [42, 0, 10], 'foreArm*': [-24, 0, 0] } },
    { t: 0.3, hips: [0, 1.02, 0.02], bones: { hips: [-4, 0, 0], spine: [0, 0, 0], chest: [-4, 0, 0], neck: [4, 0, 0], head: [0, 0, 0], 'upperArm*': [-120, 0, 18], 'foreArm*': [-30, 0, 0] }, legs: { L: foot('L', 0.156, 0.042, 30), R: foot('R', 0.156, 0.042, 30) } /* heel up, ball of the foot stays put */, hands: { L: 'flat', R: 'flat' } },
  ], { events: [{ t: 0.28, name: 'takeoff' }] });
  const air = (s) => ({ L: foot('L', 0.3 + 0.08 * s, 0.14 - 0.05 * s, -10), R: foot('R', 0.22 - 0.06 * s, -0.12 + 0.05 * s, 18) });
  const fall = keyPoseClip(sk, 'Fall', [
    { t: 0, hips: [0, 0.99, 0], bones: { ...STAND.bones, spine: [6, 0, 0], chest: [2, 0, 0], 'upperArm*': [-30, 0, 55], 'foreArm*': [-30, 0, 0] }, legs: air(0), arms: { L: null, R: null }, hands: { L: 'spread', R: 'spread' } },
    { t: 0.4, bones: { 'upperArm*': [-45, 0, 45], 'foreArm*': [-40, 0, 0] }, legs: air(1) },
    { t: 0.8, bones: { 'upperArm*': [-30, 0, 55], 'foreArm*': [-30, 0, 0] }, legs: air(0) },
  ], { loop: true });
  const land = keyPoseClip(sk, 'Land', [
    { t: 0, ...STAND, hips: [0, 0.9, 0], bones: { ...STAND.bones, 'upperArm*': [-25, 0, 40], 'foreArm*': [-30, 0, 0] } },
    { t: 0.1, hips: [0, 0.76, -0.04], bones: { hips: [18, 0, 0], spine: [18, 0, 0], chest: [8, 0, 0], neck: [-18, 0, 0], 'upperArm*': [-15, 0, 30], 'foreArm*': [-35, 0, 0] } },
    { t: 0.45, ...STAND },
  ], { events: [{ t: 0.02, name: 'land' }] });
  return [start, fall, land];
}

// Upper-body one-shots, meant for a layer masked to the spine and arms.
export function gestureClips(sk) {
  const wave = [];
  wave.push({ t: 0, ...STAND });
  wave.push({ t: 0.35, bones: { chest: [0, -8, 3], head: [0, -6, -5], 'upperArm.R': [-12, 0, -86], 'foreArm.R': [0, 0, -72], 'hand.R': [0, 0, 0] }, hands: { R: 'flat' } });
  for (let k = 0; k < 5; k++) wave.push({ t: 0.55 + k * 0.2, bones: { 'foreArm.R': [0, 0, k % 2 ? -52 : -96], 'hand.R': [0, 0, k % 2 ? 10 : -12] } });
  wave.push({ t: 1.65, bones: { 'foreArm.R': [0, 0, -72], 'hand.R': [0, 0, 0] } });
  wave.push({ t: 2.1, ...STAND });
  const tip = keyPoseClip(sk, 'Tip Hat', [
    { t: 0, ...STAND },
    { t: 0.45, arms: { R: { target: [-0.13, 1.68, 0.2], pole: [-1, -0.6, 0.2], handRot: [-70, 20, -60] } }, hands: { R: { curl: [0.5, 0.45, 0.55, 0.65, 0.7], spread: 0 } }, bones: { chest: [0, -6, 0] } },
    { t: 0.75, arms: { R: { target: [-0.13, 1.62, 0.23], pole: [-1, -0.6, 0.2], handRot: [-60, 20, -60] } }, bones: { neck: [16, 0, 0], head: [8, 0, 0], chest: [4, -6, 0] } },
    { t: 1.05, arms: { R: { target: [-0.13, 1.68, 0.2], pole: [-1, -0.6, 0.2], handRot: [-70, 20, -60] } }, bones: { neck: [0, 0, 0], head: [0, 0, 0], chest: [0, -6, 0] } },
    { t: 1.5, ...STAND },
  ]);
  const aim = [-0.19, 1.38, 0.55];
  const draw = keyPoseClip(sk, 'Quickdraw', [
    { t: 0, ...STAND },
    { t: 0.22, arms: { R: { target: [-0.22, 1.0, 0.04], pole: [-1, 0.2, -0.6], handRot: [0, 0, -10] } }, hands: { R: 'gunGrip' }, bones: { chest: [4, -4, 0], 'upperArm.L': [-10, 0, 20] } },
    { t: 0.4, arms: { R: { target: aim, pole: [-0.4, -1, 0], handRot: [-90, 0, 0] } }, hands: { R: 'point' }, bones: { chest: [0, -10, 0], neck: [0, 10, 0] } },
    { t: 0.62, arms: { R: { target: aim, pole: [-0.4, -1, 0], handRot: [-90, 0, 0] } } },
    { t: 0.68, arms: { R: { target: [-0.19, 1.47, 0.5], pole: [-0.4, -1, 0], handRot: [-120, 0, 0] } } },
    { t: 0.85, arms: { R: { target: aim, pole: [-0.4, -1, 0], handRot: [-90, 0, 0] } } },
    { t: 1.15, arms: { R: { target: [-0.08, 1.58, 0.28], pole: [-1, -0.8, 0], handRot: [-150, 0, 0] } }, bones: { neck: [4, 0, 0], head: [6, 0, 0] } },
    { t: 1.5, arms: { R: { target: [-0.22, 1.0, 0.04], pole: [-1, 0.2, -0.6], handRot: [0, 0, -10] } }, hands: { R: 'gunGrip' }, bones: { neck: [0, 0, 0], head: [0, 0, 0] } },
    { t: 1.9, ...STAND },
  ], { events: [{ t: 0.64, name: 'bang', side: 'R' }] });
  return [keyPoseClip(sk, 'Wave', wave), tip, draw];
}

// An additive flinch: frame 0 is the reference, the rest is the delta layered on top.
export function flinchClip(sk) {
  return keyPoseClip(sk, 'Flinch', [
    { t: 0, ...STAND },
    { t: 0.07, bones: { spine: [-10, 0, 5], chest: [-12, 4, 3], neck: [-7, 0, 0], head: [-5, 4, 4], 'upperArm*': [18, 0, 16], 'foreArm*': [-40, 0, 0] } },
    { t: 0.22, bones: { spine: [-4, 0, 2], chest: [-4, 2, 1], neck: [-3, 0, 0], head: [-2, 2, 2], 'upperArm*': [8, 0, 10], 'foreArm*': [-24, 0, 0] } },
    { t: 0.6, ...STAND },
  ]);
}

export function v3Moves(sk) { return [...directionalWalks(sk), ...jumpClips(sk), ...gestureClips(sk), flinchClip(sk)]; }
