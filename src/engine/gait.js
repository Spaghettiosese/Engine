// Procedural gait synthesizer. Generates editable keyframe clips for humanoid rigs by
// planning foot / hand / knee contact trajectories that match the clip's root-motion
// speed exactly (no foot sliding), then solving the limbs with IK and baking the result
// into keyframes. Works with any skeleton that follows the humanoid naming convention:
// hips, spine, chest, neck, head, shoulder.L/R, upperArm.L/R, foreArm.L/R, hand.L/R,
// thigh.L/R, shin.L/R, foot.L/R, toe.L/R.
import { quat, vec3, clamp, lerp, fract, smoothstep } from './math.js';
import { twoBoneIK, aimBone, setWorldRotation } from './ik.js';

const TAU = Math.PI * 2;
const E = (x, y, z) => quat.fromEuler(quat.create(), x, y, z);
const ease = (t) => (1 - Math.cos(Math.PI * clamp(t, 0, 1))) / 2;
const bez = (a, b, c, d, t) => { const u = 1 - t; return a.map((_, k) => u * u * u * a[k] + 3 * u * u * t * b[k] + 3 * u * t * t * c[k] + t * t * t * d[k]); };
const rotX = (v, deg) => { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; };

class Rig {
  constructor(sk) {
    this.sk = sk;
    const b = (n) => sk.boneIndex(n);
    this.i = {};
    for (const n of ['hips', 'spine', 'chest', 'neck', 'head']) this.i[n] = b(n);
    for (const s of ['L', 'R']) for (const n of ['shoulder', 'upperArm', 'foreArm', 'hand', 'thigh', 'shin', 'foot', 'toe']) this.i[n + '.' + s] = b(n + '.' + s);
    const f = sk.bones[this.i['foot.L']], t = sk.bones[this.i['toe.L']];
    this.ankleY = f.head[1];
    this.ankleToBall = [0, t.head[1] - f.head[1], t.head[2] - f.head[2]];
    this.ankleToHeel = [0, -f.head[1], -0.065];
    this.hipsRest = sk.bones[this.i.hips].head;
  }
  // local euler on a side-aware bone (right side mirrors y/z)
  set(name, e, side = null) {
    const n = side ? name + '.' + side : name, idx = this.i[n];
    if (idx === undefined || idx < 0) return;
    const m = side === 'R' ? [e[0], -e[1], -e[2]] : e;
    this.sk.rot.set(E(m[0], m[1], m[2]), idx * 4);
  }
  hipsPos(p) { this.sk.pos.set([p[0] - this.hipsRest[0], p[1] - this.hipsRest[1], p[2] - this.hipsRest[2]], this.i.hips * 3); }
}

function bake(sk, name, T, samples, record, extra = {}) {
  const tracks = new Map();
  const eul = [0, 0, 0];
  samples.forEach((snap, k) => {
    const t = (k / samples.length) * T;
    for (const i of record) {
      const q = snap.rot.subarray(i * 4, i * 4 + 4);
      quat.toEuler(eul, q);
      const key = sk.bones[i].name + ':rotation';
      if (!tracks.has(key)) tracks.set(key, { bone: sk.bones[i].name, type: 'rotation', interp: 'smooth', keys: [] });
      const tr = tracks.get(key);
      const prev = tr.keys.length ? tr.keys[tr.keys.length - 1].v : null;
      const v = eul.map((a, c) => { if (!prev) return a; let x = a; while (x - prev[c] > 180) x -= 360; while (x - prev[c] < -180) x += 360; return x; });
      tr.keys.push({ t, v });
    }
    const hi = sk.boneIndex('hips');
    const pk = 'hips:position';
    if (!tracks.has(pk)) tracks.set(pk, { bone: 'hips', type: 'position', interp: 'smooth', keys: [] });
    tracks.get(pk).keys.push({ t, v: Array.from(snap.pos.subarray(hi * 3, hi * 3 + 3)) });
  });
  const r = (x) => Math.round(x * 1e4) / 1e4;
  const out = [...tracks.values()].filter((tr) => tr.keys.some((k) => k.v.some((x) => Math.abs(x) > 1e-3)));
  // loop continuity: bring last-key unwrapping back in line with the first
  for (const tr of out) for (const k of tr.keys) k.v = k.v.map(r);
  return { name, duration: r(T), loop: true, tracks: out, ...extra };
}

// ------------------------------------------------------------------ walk / run
export function synthesizeLocomotion(sk, o) {
  const p = {
    name: 'Walk', duration: 1.1, speed: 1.35, stance: 0.62, samples: 24, hipHeight: 0.955, bob: 0.02, bobPhase: 0,
    sway: 0.022, lean: 3, pelvisYaw: 6, pelvisRoll: 4, spineCounter: 0.9, stepWidth: 0.105, center: 0.03,
    heelStrike: -16, toeOff: 38, flatStart: 0.14, heelOff: 0.52, swingPitchMid: 8,
    kick: [0, 0.07, -0.02], drive: [0, 0.06, 0.08], armSwing: 18, armAbduct: 6, armBias: 2, elbow: 14, elbowSwing: 14,
    headPitch: 0, handFlex: -8, spineLean: 1, chestLean: 1, syncGroup: 'locomotion', strikeLift: 0.0,
    ...o,
  };
  const R = new Rig(sk), T = p.duration, S = p.speed * p.stance * T;
  const zStrike = p.center + S / 2, zOff = p.center - S / 2;
  // Foot plan in character space for a limb phase ph -> ankle pos + foot pitch + toe local pitch
  const stanceFoot = (ph) => {
    const g = lerp(zStrike, zOff, ph / p.stance); // ground point under the ankle (flat foot)
    const u = ph / p.stance;
    let pitch = 0, ankle;
    if (u < p.flatStart) {
      pitch = lerp(p.heelStrike, 0, smoothstep(0, 1, u / p.flatStart));
      const heel = [0, 0, g + R.ankleToHeel[2]];
      const v = rotX([0, -R.ankleToHeel[1], -R.ankleToHeel[2]], pitch);
      ankle = [0, heel[1] + v[1], heel[2] + v[2]];
    } else if (u > p.heelOff) {
      pitch = lerp(0, p.toeOff, Math.pow((u - p.heelOff) / (1 - p.heelOff), 1.6));
      const ball = [0, R.ankleY + R.ankleToBall[1], g + R.ankleToBall[2]];
      const v = rotX([0, -R.ankleToBall[1], -R.ankleToBall[2]], pitch);
      ankle = [0, ball[1] + v[1], ball[2] + v[2]];
    } else ankle = [0, R.ankleY, g];
    return { ankle, pitch, toe: u > p.heelOff ? -pitch : 0 };
  };
  const A0 = stanceFoot(p.stance - 1e-6), A1 = stanceFoot(0);
  const foot = (ph) => {
    if (ph < p.stance) return stanceFoot(ph);
    const s = (ph - p.stance) / (1 - p.stance);
    const P1 = vec3.add([0, 0, 0], A0.ankle, p.kick), P2 = vec3.add([0, 0, 0], A1.ankle, p.drive);
    const ankle = bez(A0.ankle, P1, P2, A1.ankle, s);
    const pitch = s < 0.4 ? lerp(A0.pitch, p.swingPitchMid, ease(s / 0.4)) : lerp(p.swingPitchMid, A1.pitch, ease((s - 0.4) / 0.6));
    return { ankle, pitch, toe: lerp(A0.toe, 0, ease(s / 0.35)) };
  };
  const samples = [];
  for (let k = 0; k < p.samples; k++) {
    const phi = k / p.samples, c1 = Math.cos(TAU * phi), s1 = Math.sin(TAU * phi);
    sk.resetPose();
    const hy = p.hipHeight - p.bob * Math.cos(2 * TAU * (phi - p.bobPhase));
    R.hipsPos([p.sway * s1, hy, 0]);
    const yaw = -p.pelvisYaw * c1, roll = p.pelvisRoll * s1;
    R.set('hips', [p.lean, yaw, roll]);
    R.set('spine', [p.spineLean, -yaw * p.spineCounter, -roll * 0.6]);
    R.set('chest', [p.chestLean + 1.5 * Math.cos(2 * TAU * phi), -yaw * p.spineCounter, -roll * 0.4]);
    sk.update();
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? 1 : -1, ph = fract(phi + (side === 'R' ? 0.5 : 0));
      const f = foot(ph);
      const target = [sg * p.stepWidth, f.ankle[1], f.ankle[2]];
      twoBoneIK(sk, R.i['thigh.' + side], R.i['shin.' + side], R.i['foot.' + side], target, [sg * 0.12, 0, 1]);
      setWorldRotation(sk, R.i['foot.' + side], E(f.pitch, 0, 0));
      setWorldRotation(sk, R.i['toe.' + side], E(f.pitch + f.toe, 0, 0));
      // arms swing opposite to the same-side leg
      const armPh = Math.cos(TAU * ph);
      R.set('upperArm', [p.armBias + p.armSwing * armPh, 0, p.armAbduct], side);
      R.set('foreArm', [-(p.elbow + p.elbowSwing * (1 - armPh) / 2), 0, 0], side);
      R.set('hand', [p.handFlex, 0, 0], side);
      R.set('shoulder', [0, 0, -1.5 * armPh], side);
    }
    sk.update();
    R.set('neck', [-p.lean * 0.4, 0, 0]);
    setWorldRotation(sk, R.i.head, E(p.headPitch, 0, 0));
    samples.push(sk.snapshotPose());
  }
  const record = sk.bones.map((b, i) => i).filter((i) => !sk.bones[i].spring && sk.bones[i].name !== 'root');
  const clip = bake(sk, p.name, T, samples, record, { rootMotion: [0, 0, p.speed], syncGroup: p.syncGroup, events: [{ t: 0, name: 'footstep', side: 'L' }, { t: T / 2, name: 'footstep', side: 'R' }] });
  sk.resetPose(); sk.update();
  return clip;
}

// ------------------------------------------------------------------ crawl (hands & knees)
export function synthesizeCrawl(sk, o = {}) {
  const p = { name: 'Crawl', duration: 1.6, speed: 0.3, stance: 0.68, samples: 24, pitch: 80, knee: 0.06, handY: 0.045, lift: 0.07, kneeLift: 0.05, ...o };
  const R = new Rig(sk), T = p.duration, S = p.speed * p.stance * T;
  const L1 = vec3.dist(sk.bones[R.i['thigh.L']].head, sk.bones[R.i['shin.L']].head);
  const L2 = vec3.dist(sk.bones[R.i['shin.L']].head, sk.bones[R.i['foot.L']].head);
  // limb phase offsets: diagonal pairs move together (left hand + right knee)
  const off = { 'hand.L': 0, 'knee.R': 0.1, 'hand.R': 0.5, 'knee.L': 0.6 };
  const contact = (ph, center, lift) => {
    if (ph < p.stance) return { z: center + S / 2 - (S * ph) / p.stance, y: 0, s: -1 };
    const s = (ph - p.stance) / (1 - p.stance);
    return { z: center - S / 2 + S * ease(s), y: lift * Math.sin(Math.PI * s), s };
  };
  const samples = [];
  let hipY = p.knee + L1 + 0.02;
  for (let k = 0; k < p.samples; k++) {
    const phi = k / p.samples, s1 = Math.sin(TAU * phi), c2 = Math.cos(2 * TAU * phi);
    let kneeT = {};
    for (let iter = 0; iter < 4; iter++) {
      sk.resetPose();
      R.hipsPos([0.012 * s1, hipY + 0.008 * c2, -0.18]);
      R.set('hips', [p.pitch, 5 * s1, -4 * s1]);
      R.set('spine', [4, -3 * s1, 3 * s1]);
      R.set('chest', [3, -3 * s1, 2 * s1]);
      sk.update();
      // knees: adjust hip height so stance knees rest on the floor
      let err = 0, n = 0;
      for (const side of ['L', 'R']) {
        const sg = side === 'L' ? 1 : -1;
        const hj = sk.worldHead(R.i['thigh.' + side]);
        const c = contact(fract(phi + off['knee.' + side]), hj[2] + 0.02, p.kneeLift);
        const kt = [sg * 0.115, p.knee + c.y, c.z];
        kneeT[side] = { kt, c };
        if (c.s < 0) { const dx = kt[0] - hj[0], dz = kt[2] - hj[2]; const need = kt[1] + Math.sqrt(Math.max(0.01, L1 * L1 - dx * dx - dz * dz)); err += need - hj[1]; n++; }
      }
      if (n) hipY += err / n;
    }
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? 1 : -1, { kt, c } = kneeT[side];
      aimBone(sk, R.i['thigh.' + side], kt, sk.bones[R.i['shin.' + side]].head);
      const lift = c.s >= 0 ? Math.sin(Math.PI * c.s) : 0;
      const ang = (8 + 22 * lift) * Math.PI / 180;
      const kneeW = sk.worldHead(R.i['shin.' + side]);
      aimBone(sk, R.i['shin.' + side], [kneeW[0] + sg * 0.01, kneeW[1] + Math.sin(ang) * L2, kneeW[2] - Math.cos(ang) * L2], sk.bones[R.i['foot.' + side]].head);
      // feet trail back with toes toward the ground
      const ankle = sk.worldHead(R.i['foot.' + side]);
      aimBone(sk, R.i['foot.' + side], [ankle[0], ankle[1] - 0.09, ankle[2] - 0.12]);
      const ball = sk.worldHead(R.i['toe.' + side]);
      aimBone(sk, R.i['toe.' + side], [ball[0], ball[1] - 0.02, ball[2] - 0.1]);
    }
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? 1 : -1;
      const sh = sk.worldHead(R.i['upperArm.' + side]);
      const c = contact(fract(phi + off['hand.' + side]), sh[2] + 0.03, p.lift);
      const target = [sh[0] + sg * 0.02, p.handY + c.y, c.z];
      twoBoneIK(sk, R.i['upperArm.' + side], R.i['foreArm.' + side], R.i['hand.' + side], target, [sg * 0.5, 0.2, -1]);
      // palm flat on the floor, fingers forward (tilt the fingers down while swinging)
      const lift = c.s >= 0 ? Math.sin(Math.PI * c.s) : 0;
      setWorldRotation(sk, R.i['hand.' + side], quat.multiply(quat.create(), E(0, 0, sg * 90), E(-90 + 35 * lift, 0, 0)));
      R.set('shoulder', [0, 0, 4 * Math.cos(TAU * (phi + off['hand.' + side]))], side);
    }
    sk.update();
    R.set('neck', [-38, -2 * s1, 0]);
    setWorldRotation(sk, R.i.head, E(18 + 3 * c2, 0, 0));
    samples.push(sk.snapshotPose());
  }
  const record = sk.bones.map((b, i) => i).filter((i) => !sk.bones[i].spring && sk.bones[i].name !== 'root');
  const clip = bake(sk, p.name, T, samples, record, { rootMotion: [0, 0, p.speed], syncGroup: null, events: [{ t: 0, name: 'handplant', side: 'L' }, { t: T / 2, name: 'handplant', side: 'R' }] });
  sk.resetPose(); sk.update();
  return clip;
}

// ------------------------------------------------------------------ idle (planted feet, breathing, thumbs in belt)
export function synthesizeIdle(sk, o = {}) {
  const p = { name: 'Idle', duration: 4, samples: 16, hipHeight: 0.965, thumbHook: true, ...o };
  const R = new Rig(sk), T = p.duration;
  const samples = [];
  for (let k = 0; k < p.samples; k++) {
    const phi = k / p.samples, s1 = Math.sin(TAU * phi), s2 = Math.sin(2 * TAU * phi), c1 = Math.cos(TAU * phi);
    sk.resetPose();
    R.hipsPos([0.018 * s1, p.hipHeight - 0.004 * Math.abs(s1), 0]);
    R.set('hips', [1, 2 * s1, 2 * s1]);
    R.set('spine', [1 + 0.8 * s2, -1 * s1, -1.5 * s1]);
    R.set('chest', [-1 + 1.4 * s2, -1 * s1, -0.8 * s1]);
    sk.update();
    // planted feet
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? 1 : -1;
      twoBoneIK(sk, R.i['thigh.' + side], R.i['shin.' + side], R.i['foot.' + side], [sg * 0.13, R.ankleY, side === 'L' ? 0.03 : -0.02], [sg * 0.2, 0, 1]);
      setWorldRotation(sk, R.i['foot.' + side], E(0, sg * 10, 0));
    }
    // left thumb hooked in the belt, right hand relaxed near the holster
    if (p.thumbHook) {
      twoBoneIK(sk, R.i['upperArm.L'], R.i['foreArm.L'], R.i['hand.L'], [0.16 + 0.01 * s1, 1.02, 0.1], [1, -0.2, -0.8]);
      setWorldRotation(sk, R.i['hand.L'], E(-20, 0, 30));
    }
    R.set('upperArm', [4 + 1.5 * s2, 0, 7], 'R');
    R.set('foreArm', [-14 - 2 * s2, 0, 0], 'R');
    R.set('hand', [-12, 0, -4], 'R');
    sk.update();
    R.set('neck', [0, 6 * Math.sin(TAU * phi + 0.6), 0]);
    setWorldRotation(sk, R.i.head, E(-2 + 2.5 * s2, 14 * Math.sin(TAU * phi + 0.3) * smoothstep(-0.2, 0.6, c1 * 0.5 + 0.5), 0));
    samples.push(sk.snapshotPose());
  }
  const record = sk.bones.map((b, i) => i).filter((i) => !sk.bones[i].spring && sk.bones[i].name !== 'root');
  const clip = bake(sk, p.name, T, samples, record, { rootMotion: [0, 0, 0], syncGroup: null, events: [] });
  sk.resetPose(); sk.update();
  return clip;
}
