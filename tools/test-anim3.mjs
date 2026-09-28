// V3 animation checks: directional clips, blend spaces, layers (override + additive),
// one-shots, the state machine, look-at, foot IK, hit reactions and tweens.
import * as E from '../src/engine/index.js';
import { createCowboy } from '../src/content/cowboy.js';
const results = [];
const check = (name, ok, info = '') => results.push([name, ok, info]);
const W = (c, bone) => { c.updateWorld(null); return E.vec3.transformMat4([0, 0, 0], c.skeleton.worldHead(c.skeleton.boneIndex(bone)), c.world); };
const qdist = (a, b) => 1 - Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);

{ // strafing: feet never cross over (left ankle stays left of the right ankle)
  const c = createCowboy(); c.play('Strafe Left', { fade: 0 });
  let minGap = 9;
  for (let i = 0; i < 64; i++) { c.update(1.06 / 64); minGap = Math.min(minGap, W(c, 'foot.L')[0] - W(c, 'foot.R')[0]); }
  const rm = c.mixer.clips.get('Strafe Left').rootMotion;
  check('strafe keeps feet apart', minGap > 0.08 && rm[0] > 0.8, `min ankle gap ${(minGap * 100).toFixed(1)} cm, root motion ${rm.map((v) => v.toFixed(2))}`);
}
{ // 2D blend space: weights sum to 1, hit exact points, blend between
  const c = createCowboy();
  const bs = new E.BlendSpace2D(c.mixer, [{ clip: 'Idle', x: 0, y: 0 }, { clip: 'Walk', x: 0, y: 1.15 }, { clip: 'Run', x: 0, y: 2.9 }, { clip: 'Walk Back', x: 0, y: -0.95 }, { clip: 'Strafe Left', x: 0.9, y: 0 }, { clip: 'Strafe Right', x: -0.9, y: 0 }]);
  const w1 = bs.weights(0, 1.15), w2 = bs.weights(0.45, 0.6), sum = Object.values(w2).reduce((a, b) => a + b, 0);
  check('blend space 2D', w1.Walk > 0.99 && Math.abs(sum - 1) < 1e-6 && w2.Walk > 0.1 && w2['Strafe Left'] > 0.1 && !w2.Run, `at walk: ${w1.Walk.toFixed(2)}; diagonal: ${Object.entries(w2).filter(([, v]) => v > 0.01).map(([k, v]) => k + ' ' + v.toFixed(2)).join(', ')}`);
}
{ // override layer: upper body waves, legs keep walking exactly
  const a = createCowboy(), b = createCowboy();
  for (const c of [a, b]) c.play('Walk', { fade: 0 });
  const upper = b.mixer.addLayer('upper', { mask: E.boneMask(b.skeleton, ['spine'], { weights: { spine: 0.5 } }) });
  upper.play('Wave', { fade: 0 }); upper.actions.get('Wave').time = 0.6;
  for (const c of [a, b]) c.update(0.3);
  const legSame = E.vec3.dist(W(a, 'foot.L'), W(b, 'foot.L')) < 1e-4, armDiff = E.vec3.dist(W(a, 'hand.R'), W(b, 'hand.R'));
  check('masked override layer', legSame && armDiff > 0.3, `legs identical ${legSame}, right hand moved ${(armDiff * 100).toFixed(0)} cm`);
}
{ // additive layer: frame 0 of an additive clip is a no-op; later frames bend the spine back
  const a = createCowboy(), b = createCowboy();
  for (const c of [a, b]) c.play('Run', { fade: 0 });
  const add = b.mixer.addLayer('hit', { additive: true });
  add.play('Flinch', { fade: 0 }); add.actions.get('Flinch').time = 0; add.actions.get('Flinch').playing = false;
  for (const c of [a, b]) c.update(0.2);
  const i = a.skeleton.boneIndex('chest');
  const noop = qdist(a.skeleton.rot.subarray(i * 4, i * 4 + 4), b.skeleton.rot.subarray(i * 4, i * 4 + 4)) < 1e-6;
  add.actions.get('Flinch').time = 0.07; a.mixer.evaluate(); b.mixer.evaluate();
  const lean = W(b, 'head')[2] - W(a, 'head')[2];
  check('additive layer', noop && lean < -0.03, `frame 0 no-op ${noop}, flinch moves head ${(lean * 100).toFixed(1)} cm back`);
}
{ // one-shot fades out on its own and fires events to the base mixer's listeners
  const c = createCowboy(); c.play('Idle', { fade: 0 });
  const g = c.mixer.addLayer('gesture', { mask: E.boneMask(c.skeleton, ['spine']) });
  const events = []; c.mixer.on((e) => events.push(e.name));
  g.playOnce('Quickdraw', { fadeIn: 0.1, fadeOut: 0.3 });
  let busyMid = false; for (let t = 0; t < 2.4; t += 1 / 60) { c.update(1 / 60); if (t > 1 && t < 1.2) busyMid = g.busy; }
  check('one-shot layer', busyMid && !g.busy && events.includes('bang'), `busy mid-clip ${busyMid}, busy after ${g.busy}, events ${[...new Set(events)].join(',')}`);
}
{ // state machine: idle -> jump start -> fall -> land -> idle
  const c = createCowboy();
  const sm = new E.AnimStateMachine(c.mixer, {
    params: { grounded: true },
    states: { Idle: { clip: 'Idle' }, JumpStart: { clip: 'Jump Start', fade: 0.08 }, Fall: { clip: 'Fall', fade: 0.15 }, Land: { clip: 'Land', fade: 0.05 } },
    transitions: [
      { from: 'Idle', to: 'JumpStart', when: (p) => p.jump },
      { from: 'JumpStart', to: 'Fall', exitTime: 0.95 },
      { from: 'Fall', to: 'Land', when: (p) => p.grounded },
      { from: 'Land', to: 'Idle', exitTime: 0.9 },
    ],
  });
  const seen = [sm.current];
  sm.on((s) => seen.push(s));
  for (let f = 0; f < 150; f++) {
    if (f === 10) { sm.trigger('jump'); sm.set('grounded', false); }
    if (f === 80) sm.set('grounded', true);
    sm.update(1 / 60); c.update(1 / 60);
  }
  check('state machine', seen.join('>') === 'Idle>JumpStart>Fall>Land>Idle' && !sm.params.jump, seen.join(' > '));
}
{ // look-at: the head turns toward a target on the left and stays within limits
  const c = createCowboy(); c.play('Idle', { fade: 0 });
  const look = new E.LookAt(c); look.target = [3, 1.7, 1];
  for (let i = 0; i < 60; i++) { c.update(1 / 60); look.update(1 / 60); }
  const h = c.skeleton.worldRotation(c.skeleton.boneIndex('head')), fwd = E.vec3.transformQuat([0, 0, 0], [0, 0, 1], h);
  const yaw = (Math.atan2(fwd[0], fwd[2]) * 180) / Math.PI;
  check("look-at", Math.abs(yaw - 71.6) < 3, `head yaw ${yaw.toFixed(0)}° toward a target at ${((Math.atan2(3, 1) * 180) / Math.PI).toFixed(0)}°`);
}
{ // foot IK: a 15 cm block under the left foot lifts it; the right stays down; hips drop for a hole
  const c = createCowboy(); c.play('Idle', { fade: 0 }); c.update(0);
  const ground = (x) => ({ y: x > 0.05 ? 0.15 : 0, normal: [0, 1, 0] });
  const ik = new E.FootIK(c, ground);
  const l0 = W(c, 'foot.L')[1], r0 = W(c, 'foot.R')[1];
  for (let i = 0; i < 60; i++) { c.update(1 / 60); ik.update(1 / 60); }
  const dl = W(c, 'foot.L')[1] - l0, dr = W(c, 'foot.R')[1] - r0;
  const ik2 = new E.FootIK(c, (x) => ({ y: x > 0.05 ? -0.12 : 0, normal: [0, 1, 0] }));
  for (let i = 0; i < 60; i++) { c.update(1 / 60); ik2.update(1 / 60); }
  const dl2 = W(c, 'foot.L')[1] - l0;
  check('foot IK', Math.abs(dl - 0.15) < 0.02 && Math.abs(dr) < 0.02 && Math.abs(dl2 + 0.12) < 0.02, `left +${(dl * 100).toFixed(1)} cm, right ${(dr * 100).toFixed(1)} cm, hole ${(dl2 * 100).toFixed(1)} cm`);
}
{ // hit reaction springs back to rest
  const c = createCowboy(); c.play('Idle', { fade: 0 }); c.update(0);
  const hr = new E.HitReaction(c);
  const h0 = W(c, 'head');
  hr.hit([0, 0, -1], 8);
  let maxD = 0; for (let i = 0; i < 120; i++) { c.update(1 / 60); hr.update(1 / 60); maxD = Math.max(maxD, E.vec3.dist(W(c, 'head'), h0)); }
  const settle = E.vec3.dist(W(c, 'head'), h0);
  check('hit reaction', maxD > 0.05 && settle < 0.02, `head knocked ${(maxD * 100).toFixed(0)} cm, back within ${(settle * 100).toFixed(1)} cm`);
}
{ // tweens: position + euler with easing, yoyo repeat, then() and takeover
  const tw = new E.Tweens(), n = new E.Node('door');
  let done = 0;
  tw.to(n, { position: [2, 0, 0], euler: [0, 90, 0] }, { duration: 0.5, ease: 'outBack' }).then(() => done++);
  for (let i = 0; i < 40; i++) tw.update(1 / 60);
  const ang = (n.getEuler()[1]);
  const m = new E.Node('lamp');
  tw.to(m, { position: [0, 1, 0] }, { duration: 0.25, yoyo: true, repeat: 1 });
  for (let i = 0; i < 40; i++) tw.update(1 / 60);
  check('tweens', done === 1 && Math.abs(n.position[0] - 2) < 1e-6 && Math.abs(ang - 90) < 0.1 && Math.abs(m.position[1]) < 1e-6 && tw.active === 0, `door at x ${n.position[0].toFixed(2)}, ${ang.toFixed(1)}°, lamp back at ${m.position[1].toFixed(3)}`);
}
{ // revolver: socket follows the hand; aim IK puts the barrel on target within a degree
  const { createRevolver, HAND_SOCKET } = await import('../src/content/revolver.js');
  const c = createCowboy(); c.play('Idle', { fade: 0 });
  const up = c.mixer.addLayer('gun', { mask: E.boneMask(c.skeleton, ['spine']) });
  up.play('Aim Revolver', { fade: 0 });
  const gun = c.attach(createRevolver(), 'hand.R', HAND_SOCKET);
  // barrel in hand space from the socket: gun +Z is the barrel, the muzzle 17 cm along it
  const aim = new E.AimIK(c, { axis: [0, -1, 0], offset: [HAND_SOCKET.position[0], HAND_SOCKET.position[1] - 0.17, HAND_SOCKET.position[2] + 0.036] });
  const errs = [];
  for (const target of [[2, 1.5, 6], [-3, 0.4, 5], [0, 3, 4]]) {
    c.update(1 / 60); aim.target = target; errs.push(aim.update()); c.updateSockets(); c.updateWorld(null);
  }
  const hand = E.vec3.transformMat4([0, 0, 0], c.skeleton.worldHead(c.skeleton.boneIndex('hand.R')), c.world);
  const gp = gun.worldPosition();
  check('revolver socket + aim IK', errs.every((e) => e < 1.5) && E.vec3.dist(hand, gp) < 0.12, `barrel error ${errs.map((e) => e.toFixed(2) + '°').join(', ')}, gun ${(E.vec3.dist(hand, gp) * 100).toFixed(0)} cm from the wrist`);
}
let fail = 0;
for (const [name, ok, info] of results) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); if (!ok) fail++; }
if (fail) process.exit(1);
