// Prop handling: how a character holds and uses things. The prop's pose drives the body:
// each hold (aim, ready, carry) and each action (chop, dig, hammer, aim, reload...) is a
// small timeline of where the prop should be, relative to the right shoulder. The main
// hand is solved with two-bone IK to the prop's grip, the prop is then re-seated in the
// hand where the arm could actually reach, and the other hand is solved to the prop's
// support grip. So one set of actions works for every axe, shovel or rifle the generators
// make, whatever its size.
import { vec3, quat, mat4, clamp } from './math.js';
import { twoBoneIK, setWorldRotation } from './ik.js';
import { applyHandPose, blendHandPoses, HAND_POSES } from './gait.js';

const q = (e) => quat.fromEuler(quat.create(), e[0], e[1], e[2]);
const smooth = (t) => t * t * (3 - 2 * t);

// prop poses: pos is an offset from the right shoulder (character faces +Z, right side is -X),
// rot is the prop's rotation in degrees (pitch > 0 tips +Z down and +Y forward)
export const HOLDS = {
  carry: null, // hand animation drives it; the prop just sits in the hand socket
  pistolReady: { pos: [0.02, -0.42, 0.3], rot: [38, 0, 0] },
  pistolAim: { pos: [0.04, -0.03, 0.56], rot: [0, 4, 0] },
  rifleReady: { pos: [0.16, -0.4, 0.26], rot: [28, 28, 0] },
  rifleAim: { pos: [0.075, -0.075, 0.22], rot: [0, 2, 0] },
  toolReady: { pos: [0.16, -0.62, 0.28], rot: [48, 0, 0] },
  toolRest: { pos: [0.02, -0.55, 0.12], rot: [12, 0, 8] },
  shovelReady: { pos: [0.18, -0.2, 0.18], rot: [150, 0, 0] },
  knifeReady: { pos: [0.02, -0.5, 0.36], rot: [70, 0, 0] },
  lanternRaise: { pos: [0.02, 0.02, 0.5], rot: [0, 0, 0] },
};

// actions: keyed prop poses over time, events, and optional chest lean (degrees)
const k = (t, pos, rot, extra = {}) => ({ t, pos, rot, ...extra });
export const ACTIONS = {
  chop: { duration: 1.05, keys: [
    k(0, HOLDS.toolReady.pos, HOLDS.toolReady.rot),
    k(0.42, [0.14, 0.12, 0.02], [-118, 0, 0], { chest: [-8, 10, 0] }),
    k(0.62, [0.16, -0.72, 0.5], [100, 0, 0], { chest: [22, -4, 0] }),
    k(0.7, [0.16, -0.74, 0.5], [104, 0, 0], { chest: [24, -4, 0] }),
    k(1.05, HOLDS.toolReady.pos, HOLDS.toolReady.rot),
  ], events: [{ t: 0.62, name: 'hit', socket: 'head' }] },
  dig: { duration: 1.6, keys: [
    k(0, HOLDS.shovelReady.pos, HOLDS.shovelReady.rot),
    k(0.35, [0.22, -0.25, 0.3], [160, 0, 0], { chest: [20, 0, 0] }),
    k(0.55, [0.22, -0.45, 0.32], [168, 0, 0], { chest: [30, 0, 0] }),
    k(0.9, [0.2, -0.3, 0.1], [130, 0, 0], { chest: [12, 0, 0] }),
    k(1.2, [0.25, -0.15, 0.2], [120, -40, 30], { chest: [5, 25, 0] }),
    k(1.6, HOLDS.shovelReady.pos, HOLDS.shovelReady.rot),
  ], events: [{ t: 0.55, name: 'hit', socket: 'head' }, { t: 1.2, name: 'toss', socket: 'head' }] },
  hammer: { duration: 0.5, keys: [
    k(0, [0.05, -0.35, 0.42], [70, 0, 0]),
    k(0.2, [0.05, -0.15, 0.3], [-30, 0, 0]),
    k(0.32, [0.05, -0.4, 0.45], [85, 0, 0]),
    k(0.5, [0.05, -0.35, 0.42], [70, 0, 0]),
  ], events: [{ t: 0.32, name: 'hit', socket: 'head' }] },
  saw: { duration: 0.9, keys: [
    k(0, [0.05, -0.45, 0.3], [95, 0, 0]), k(0.45, [0.05, -0.5, 0.62], [95, 0, 0]), k(0.9, [0.05, -0.45, 0.3], [95, 0, 0]),
  ], events: [{ t: 0.45, name: 'hit', socket: 'head' }] },
  stab: { duration: 0.55, keys: [
    k(0, HOLDS.knifeReady.pos, HOLDS.knifeReady.rot), k(0.18, [0.04, -0.3, 0.15], [60, 0, 0]),
    k(0.3, [0.02, -0.25, 0.68], [88, 0, 0], { chest: [8, -12, 0] }), k(0.55, HOLDS.knifeReady.pos, HOLDS.knifeReady.rot),
  ], events: [{ t: 0.3, name: 'hit', socket: 'head' }] },
  raise: { duration: 0.6, keys: [k(0, [0.02, -0.6, 0.1], [0, 0, 0]), k(0.6, HOLDS.lanternRaise.pos, HOLDS.lanternRaise.rot)], hold: true },
  recoilPistol: { duration: 0.35, keys: [k(0, HOLDS.pistolAim.pos, HOLDS.pistolAim.rot), k(0.05, [0.04, 0.0, 0.5], [-24, 4, 0]), k(0.35, HOLDS.pistolAim.pos, HOLDS.pistolAim.rot)] },
  recoilRifle: { duration: 0.4, keys: [k(0, HOLDS.rifleAim.pos, HOLDS.rifleAim.rot), k(0.05, [0.075, -0.05, 0.16], [-9, 2, 0], { chest: [-4, 0, 0] }), k(0.4, HOLDS.rifleAim.pos, HOLDS.rifleAim.rot)] },
  reloadPistol: { keys: [k(0, [0.14, -0.3, 0.32], [10, -35, -20]), k(1, [0.14, -0.3, 0.32], [10, -35, -20])], support: 'free' },
  reloadRifle: { keys: [k(0, [0.2, -0.3, 0.3], [-8, 35, 0]), k(1, [0.2, -0.3, 0.3], [-8, 35, 0])] },
};

function samplePose(keys, t, out) {
  let a = keys[0], b = keys[keys.length - 1];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i].t) { a = keys[i - 1]; b = keys[i]; break; }
  const s = b.t > a.t ? smooth(clamp((t - a.t) / (b.t - a.t), 0, 1)) : 1;
  vec3.lerp(out.pos, a.pos, b.pos, s);
  quat.slerp(out.rot, q(a.rot), q(b.rot), s);
  const ca = a.chest || [0, 0, 0], cb = b.chest || [0, 0, 0];
  out.chest = ca.map((v, i) => v + (cb[i] - v) * s);
  return out;
}

// hold style for a prop, by what it is
export function defaultHold(prop) {
  if (prop.kind === 'gun') return prop.twoHanded ? 'rifleReady' : 'pistolReady';
  const t = prop.toolKind;
  if (t === 'lantern' || t === 'bucket' || t === 'torch') return 'carry';
  if (t === 'shovel' || t === 'pitchfork') return 'shovelReady';
  if (t === 'knife') return 'knifeReady';
  return prop.twoHanded ? 'toolReady' : 'toolRest';
}
export function defaultAction(prop) {
  if (prop.kind === 'gun') return 'fire';
  return { axe: 'chop', hatchet: 'chop', pickaxe: 'chop', sledgehammer: 'chop', shovel: 'dig', pitchfork: 'dig', hammer: 'hammer', wrench: 'hammer', saw: 'saw', knife: 'stab', lantern: 'raise', torch: 'raise', bucket: 'raise' }[prop.toolKind] || 'chop';
}

export class PropHandler {
  constructor(character, prop, { side = 'R', hold = defaultHold(prop), socket = prop.grip?.socket, pose = prop.grip?.pose || 'gunGrip' } = {}) {
    this.c = character; this.prop = prop; this.side = side; this.pose = typeof pose === 'string' ? HAND_POSES[pose] : pose;
    this.hold = hold; this.blend = 0; this.action = null; this.t = 0; this.weight = 1;
    const sk = character.skeleton;
    const b = (n) => sk.boneIndex(n);
    this.bones = { R: { upper: b('upperArm.R'), fore: b('foreArm.R'), hand: b('hand.R') }, L: { upper: b('upperArm.L'), fore: b('foreArm.L'), hand: b('hand.L') }, chest: b('chest') };
    this.shoulder = sk.bones[b('shoulder.R')]?.head || [-0.18, 1.45, 0];
    const s = socket || { position: [0, 0, 0], rotation: [0, 0, 0] };
    this.socketM = mat4.fromRTS(mat4.create(), q(s.rotation), s.position);
    this.socketInv = mat4.invert(mat4.create(), this.socketM);
    this.cur = { pos: [0, 0, 0], rot: quat.create(), chest: [0, 0, 0] };
    this.from = null;
    if (!HOLDS[hold]) character.attach(prop, 'hand.' + side, s); else if (prop.parent !== character) character.add(prop);
    this.onEvent = null;
  }
  // switch hold (ready <-> aim), blending over `time`
  setHold(hold, time = 0.25) { if (hold === this.hold) return; this.from = { ...this.cur, pos: [...this.cur.pos], rot: Float32Array.from(this.cur.rot) }; this.hold = hold; this.blend = 0; this.blendTime = time; }
  // play an action (chop, dig...); resolves when done
  play(name, { speed = 1, onEvent = null } = {}) {
    const a = ACTIONS[name]; if (!a) return Promise.resolve(false);
    this.action = { ...a, name, speed, onEvent, ev: 0, duration: a.duration || 1 };
    this.t = 0;
    return new Promise((res) => (this.action.done = res));
  }
  // run an action for as long as a promise (e.g. a gun's reload clip)
  during(name, promise) { const a = ACTIONS[name]; if (!a) return promise; this.action = { ...a, name, speed: 1, ev: 0, duration: Infinity, loopPose: true }; this.t = 0; return promise.then((r) => { this.action = null; return r; }); }
  get busy() { return !!this.action; }

  // after the animation mixer: place the prop, solve both arms, pose the fingers
  update(dt) {
    const c = this.c, sk = c.skeleton, prop = this.prop;
    const hold = HOLDS[this.hold];
    if (!hold && !this.action) { applyHandPose(sk, this.side, this.pose); sk.update(); return; }
    // target prop pose (shoulder-relative)
    let target;
    if (this.action) {
      const A = this.action;
      this.t += dt * A.speed;
      target = samplePose(A.keys, A.loopPose ? 0 : Math.min(this.t, A.duration), { pos: [0, 0, 0], rot: quat.create() });
      while (A.events && A.ev < A.events.length && A.events[A.ev].t <= this.t) {
        const e = A.events[A.ev++];
        (this._pending ||= []).push({ ...e, action: A.name, cb: A.onEvent });
      }
      if (!A.loopPose && this.t >= A.duration && !A.hold) { const done = A.done; this.action = null; if (done) done(true); }
    } else target = { pos: hold.pos, rot: q(hold.rot), chest: [0, 0, 0] };
    // blend from the previous hold
    if (this.from && this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / (this.blendTime || 0.25));
      const s = smooth(this.blend);
      target = { pos: vec3.lerp([0, 0, 0], this.from.pos, target.pos, s), rot: quat.slerp(quat.create(), this.from.rot, target.rot, s), chest: (target.chest || [0, 0, 0]).map((v, i) => (this.from.chest?.[i] || 0) * (1 - s) + v * s) };
    }
    this.cur = { pos: [...target.pos], rot: Float32Array.from(target.rot), chest: target.chest || [0, 0, 0] };
    // chest lean (added on top of the animation)
    const ci = this.bones.chest;
    if (ci >= 0 && this.cur.chest.some((v) => Math.abs(v) > 0.01)) {
      const cq = quat.multiply(quat.create(), sk.rot.subarray(ci * 4, ci * 4 + 4), q(this.cur.chest));
      sk.rot.set(cq, ci * 4); sk.update();
    }
    // desired prop matrix (model space) -> main hand target
    const P = [this.shoulder[0] + target.pos[0], this.shoulder[1] + target.pos[1], this.shoulder[2] + target.pos[2]];
    const propM = mat4.fromRTS(mat4.create(), target.rot, P);
    const handM = mat4.multiply(mat4.create(), propM, this.socketInv);
    const B = this.bones[this.side];
    const pole = this.side === 'R' ? [-0.6, -1, -0.35] : [0.6, -1, -0.35];
    twoBoneIK(sk, B.upper, B.fore, B.hand, mat4.getTranslation([0, 0, 0], handM), pole);
    setWorldRotation(sk, B.hand, mat4.getRotation(quat.create(), handM));
    applyHandPose(sk, this.side, this.pose);
    sk.update();
    // re-seat the prop in the hand where the arm actually got to
    const realHand = Float32Array.from(sk.world.subarray(B.hand * 16, B.hand * 16 + 16));
    const realProp = mat4.multiply(mat4.create(), realHand, this.socketM);
    mat4.getTranslation(prop.position, realProp); mat4.getRotation(prop.rotation, realProp);
    // support hand
    const sup = prop.twoHanded && prop.support && !(this.action && this.action.support === 'free');
    if (sup) {
      const O = this.side === 'R' ? 'L' : 'R', S = this.bones[O];
      const sp = vec3.transformMat4([0, 0, 0], prop.support.position, realProp);
      twoBoneIK(sk, S.upper, S.fore, S.hand, sp, O === 'L' ? [0.7, -1, -0.2] : [-0.7, -1, -0.2]);
      const sr = quat.multiply(quat.create(), mat4.getRotation(quat.create(), realProp), q(prop.support.rotation || [0, 0, O === 'L' ? -90 : 90]));
      setWorldRotation(sk, S.hand, sr);
      applyHandPose(sk, O, prop.support.pose || HAND_POSES.relaxed);
      sk.update();
    }
    if (this._pending) {
      // action events carry the world position of the prop socket (where the axe bit in)
      prop.updateWorld(c.world);
      for (const e of this._pending) {
        const ev = { name: e.name, action: e.action, socket: e.socket, point: e.socket && prop.sockets[e.socket] ? vec3.transformMat4([0, 0, 0], prop.sockets[e.socket], prop.world) : null };
        if (e.cb) e.cb(ev); if (this.onEvent) this.onEvent(ev);
      }
      this._pending = null;
    }
  }
}
