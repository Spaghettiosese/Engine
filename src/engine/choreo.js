// Choreography: author an action as a few key poses per channel (weapon transform,
// hand targets, finger poses, prop attachments...), evaluate them at a fixed frame rate
// and bake the result into an ordinary editable Clip. Transform keys can be attached to
// other moving things (a hand, a weapon), and blending happens in world space, so a prop
// can be handed from one attachment to another without popping.
import { quat, vec3, clamp } from './math.js';
import { twoBoneIK, setWorldRotation } from './ik.js';
import { applyHandPose, hasFingers, HAND_POSES } from './gait.js';

export const EASE = {
  linear: (s) => s,
  inOut: (s) => s * s * (3 - 2 * s),
  in: (s) => s * s,
  out: (s) => 1 - (1 - s) * (1 - s),
  snap: (s) => 1 - Math.pow(1 - s, 4), // fast start, soft landing (bolt slams, recoil)
  hold: (s) => (s >= 1 ? 1 : 0),
};

// keys: [{ t, ...value, ease }] sorted by t. mix(a, b, s) blends two key values.
export function sampleKeys(keys, t, mix) {
  if (t <= keys[0].t) return mix(keys[0], keys[0], 0);
  const last = keys[keys.length - 1];
  if (t >= last.t) return mix(last, last, 0);
  let i = 0;
  while (keys[i + 1].t < t) i++;
  const a = keys[i], b = keys[i + 1];
  const s = clamp((t - a.t) / (b.t - a.t || 1e-6), 0, 1);
  return mix(a, b, (EASE[b.ease || 'inOut'] || EASE.inOut)(s));
}

export const lerpArr = (a, b, s) => a.map((v, k) => v + (b[k] - v) * s);

// A rigid transform {p, q}; compose(parent, localPos, localRot)
export function compose(parent, p, q) {
  const wp = vec3.transformQuat([0, 0, 0], p, parent.q);
  return { p: [parent.p[0] + wp[0], parent.p[1] + wp[1], parent.p[2] + wp[2]], q: quat.multiply(quat.create(), parent.q, q) };
}
export function blendXf(a, b, s) {
  const q = quat.slerp(quat.create(), a.q, b.q, s);
  return { p: lerpArr(a.p, b.p, s), q };
}

// Sample a transform channel whose keys may be attached to named parents.
// keys: [{ t, attach: 'world' | name, p:[x,y,z], r:[euler deg] }], parents: { name: {p,q} } at this time
export function sampleXf(keys, t, parents) {
  const resolve = (k) => {
    const q = quat.fromEuler(quat.create(), ...(k.r || [0, 0, 0]));
    const par = k.attach && k.attach !== 'world' ? parents[k.attach] : null;
    return par ? compose(par, k.p, q) : { p: [...k.p], q };
  };
  return sampleKeys(keys, t, (a, b, s) => (s <= 0 ? resolve(a) : blendXf(resolve(a), resolve(b), s)));
}

// Bake a list of skeleton pose snapshots (taken at `times`) into a Clip definition.
export function bakePoses(sk, name, times, poses, { loop = false, posBones = [], stepBones = [], ...extra } = {}) {
  const tracks = [];
  const eul = [0, 0, 0];
  const r = (x) => Math.round(x * 1e5) / 1e5;
  sk.bones.forEach((b, i) => {
    if (b.name === 'root' || b.spring) return;
    const rot = { bone: b.name, type: 'rotation', interp: stepBones.includes(b.name) ? 'step' : 'smooth', keys: [] };
    let prev = null;
    poses.forEach((snap, k) => {
      quat.toEuler(eul, snap.rot.subarray(i * 4, i * 4 + 4));
      const v = eul.map((a, c) => { if (!prev) return a; let x = a; while (x - prev[c] > 180) x -= 360; while (x - prev[c] < -180) x += 360; return x; });
      prev = v; rot.keys.push({ t: r(times[k]), v: v.map(r) });
    });
    if (rot.keys.some((k) => k.v.some((x) => Math.abs(x) > 1e-3))) tracks.push(rot);
    if (posBones.includes(b.name)) {
      tracks.push({ bone: b.name, type: 'position', interp: stepBones.includes(b.name) ? 'step' : 'smooth', keys: poses.map((snap, k) => ({ t: r(times[k]), v: Array.from(snap.pos.subarray(i * 3, i * 3 + 3)).map(r) })) });
    }
  });
  return { name, duration: r(times[times.length - 1]), loop, tracks, rootMotion: [0, 0, 0], syncGroup: null, events: [], ...extra };
}

// ------------------------------------------------------------------ key-pose authoring
// Author a clip as a few full-body key poses. Each frame carries over everything from the
// previous one, so a frame only lists what changes:
//   { t, bones: { spine: [x,y,z], 'upperArm.R': [...] },   local euler degrees
//     hips: [x,y,z],                                         model-space hips position
//     arms: { R: { target, pole, handRot } | null },         two-bone IK for the hands
//     legs: { L: { target, pole, pitch } | 'plant' | null }, 'plant' keeps the foot on the floor
//     hands: { L: 'relaxed' | { curl, spread } } }
// Bones named with a trailing '*' (e.g. 'upperArm*') are set on both sides, mirrored.
export function keyPoseClip(sk, name, frames, { loop = false, events = [], rootMotion = [0, 0, 0], syncGroup = null } = {}) {
  const state = { bones: {}, hips: null, arms: {}, legs: {}, hands: {} };
  const idx = (n) => sk.boneIndex(n);
  const times = [], poses = [];
  const hi = idx('hips'), hipsRest = sk.bones[hi].head;
  const footRest = { L: sk.bones[idx('foot.L')]?.head, R: sk.bones[idx('foot.R')]?.head };
  for (const f of frames) {
    for (const [k, v] of Object.entries(f.bones || {})) {
      if (k.endsWith('*')) { const b = k.slice(0, -1); state.bones[b + '.L'] = v; state.bones[b + '.R'] = [v[0], -v[1], -v[2]]; }
      else state.bones[k] = v;
    }
    if (f.hips) state.hips = f.hips;
    Object.assign(state.arms, f.arms || {}); Object.assign(state.legs, f.legs || {}); Object.assign(state.hands, f.hands || {});
    sk.resetPose();
    for (const [b, e] of Object.entries(state.bones)) { const i = idx(b); if (i >= 0) sk.rot.set(quat.fromEuler(quat.create(), e[0], e[1], e[2]), i * 4); }
    if (state.hips && hi >= 0) sk.pos.set([state.hips[0] - hipsRest[0], state.hips[1] - hipsRest[1], state.hips[2] - hipsRest[2]], hi * 3);
    sk.update();
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? 1 : -1;
      let leg = state.legs[side];
      if (leg === 'plant' && footRest[side]) leg = { target: [footRest[side][0], footRest[side][1], footRest[side][2]], pitch: 0 };
      if (leg && leg.target && idx('thigh.' + side) >= 0) {
        twoBoneIK(sk, idx('thigh.' + side), idx('shin.' + side), idx('foot.' + side), leg.target, leg.pole || [sg * 0.1, 0, 1]);
        setWorldRotation(sk, idx('foot.' + side), quat.fromEuler(quat.create(), leg.pitch || 0, 0, 0));
      }
      const arm = state.arms[side];
      if (arm && arm.target && idx('upperArm.' + side) >= 0) {
        twoBoneIK(sk, idx('upperArm.' + side), idx('foreArm.' + side), idx('hand.' + side), arm.target, arm.pole || [sg, -0.5, -0.3]);
        if (arm.handRot) setWorldRotation(sk, idx('hand.' + side), quat.fromEuler(quat.create(), ...arm.handRot));
      }
      const hp = state.hands[side];
      if (hp && hasFingers(sk, side)) applyHandPose(sk, side, typeof hp === 'string' ? HAND_POSES[hp] : hp);
    }
    sk.update();
    times.push(f.t); poses.push(sk.snapshotPose());
  }
  const clip = bakePoses(sk, name, times, poses, { loop, posBones: ['hips'], events, rootMotion, syncGroup });
  sk.resetPose(); sk.update();
  return clip;
}
