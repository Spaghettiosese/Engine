// Animation Lab: every V3 animation feature on one playable character.
//  - AnimStateMachine: Locomotion -> Jump Start -> Fall -> Land, with triggers and exit times
//  - BlendSpace2D: idle, walk, run, walk back and both strafes, driven by local velocity
//  - Layers: upper-body gestures (masked override) and an additive flinch
//  - Procedural: foot IK on stairs and ramps, look-at, lean into turns, spring hit reactions
//  - CharacterController + PhysicsWorld for movement, Tweens for the gate and the lantern
import * as E from '../src/engine/index.js';
import { createCowboy } from '../src/content/cowboy.js';

const $ = (id) => document.getElementById(id);
let renderer;
try { renderer = new E.Renderer($('stage')); } catch (e) { $('fatal').hidden = false; $('fatal').textContent = 'The Animation Lab needs WebGL2. ' + e.message; throw e; }
const scene = new E.Scene(), env = scene.environment;
E.applyTimeOfDay(env, 16.6); env.shadowRadius = 10; env.fogDensity = 0.004;
const camera = new E.Camera(); camera.fov = 48 * E.DEG; camera.far = 300;
const world = new E.PhysicsWorld();
const tweens = new E.Tweens();
const particles = new E.Particles(1200);

// ---------------------------------------------------------------- set: stairs, a ramp, a gate, crates
const M = (o) => new E.Material(o);
const palette = E.archPalette();
const ground = new E.Mesh(E.plane({ width: 120, depth: 120 }), M({ name: 'Ground', color: '#b08a62', pattern: 'dirt', patternScale: 1, patternColor: '#7c5d40', roughness: 1 }));
scene.add(ground); world.add(new E.Body({ shape: new E.Plane() }));
const kit = new E.Kit(palette);
const solid = (min, max, mat = palette.deck) => { kit.span(mat, min, max); world.add(new E.Body({ shape: new E.Box([(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2]), type: 'static', position: min.map((v, k) => (v + max[k]) / 2) })); };
// stairs up to a porch deck
for (let i = 0; i < 6; i++) solid([2.5, 0, -4 - i * 0.32], [5.5, 0.17 * (i + 1), -4 - (i + 1) * 0.32], palette.deck);
solid([2.5, 0, -5.92], [5.5, 1.02, -9], palette.deck);
const shed = kit.toNode('Set'); scene.add(shed);
const house = E.building(new E.Kit(palette), { width: 5, depth: 3.5, floors: 1, roof: 'gable', porch: false, sign: 'LAB', windows: 2 }).toNode('Shack');
house.position.set([4, 1.02, -9.2]); scene.add(house);
// ramp
const rampAngle = 14, rq = [Math.sin((rampAngle * Math.PI) / 360), 0, 0, Math.cos((rampAngle * Math.PI) / 360)];
const ramp = new E.Mesh(E.box({ width: 3, height: 0.2, depth: 6 }), palette.deck); ramp.position.set([-4, 0.62, -4]); ramp.rotation.set(rq); scene.add(ramp);
world.add(new E.Body({ shape: new E.Box([1.5, 0.1, 3]), type: 'static', position: [-4, 0.62, -4], rotation: rq }));
solid([-5.5, 0, -6.95], [-2.5, 1.33, -9.5], palette.stone);
// crates you can shove
const crateGeo = E.box({ width: 0.6, height: 0.6, depth: 0.6, bevel: 0.03 });
for (let i = 0; i < 5; i++) {
  const m = new E.Mesh(crateGeo, M({ name: 'Crate', color: '#a0764a', pattern: 'planks', patternScale: 6, patternColor: '#3c2816' })); scene.add(m);
  world.add(new E.Body({ shape: new E.Box([0.3, 0.3, 0.3]), position: [-3.2 + (i % 3) * 0.7, 0.3 + Math.floor(i / 3) * 0.61, 0.8], mass: 15, node: m }));
}
// a gate swinging on a tween, and a lantern that floats around on tweens (the look-at target)
const gate = new E.Node('Gate'); gate.position.set([1, 0, -1]);
const gateMesh = new E.Mesh(E.box({ width: 1.6, height: 1.1, depth: 0.08 }), palette.darkWood); gateMesh.position.set([0.8, 0.6, 0]); gate.add(gateMesh); scene.add(gate);
tweens.to(gate, { euler: [0, 100, 0] }, { duration: 1.6, ease: 'outBounce', yoyo: true, repeat: Infinity, delay: 1 });
const lantern = new E.Node('Lantern'); lantern.position.set([-2, 1.9, 1.5]);
const lk = new E.Kit(palette); E.lantern(lk, [0, 0, 0], { hang: false }); lantern.add(lk.toNode('lantern')); scene.add(lantern);
const lanternPath = [[-2, 1.9, 1.5], [2.5, 2.4, 2.5], [3, 1.6, -2], [-3, 2.8, -2.5]];
let lp = 0;
const nextLantern = () => { lp = (lp + 1) % lanternPath.length; tweens.to(lantern, { position: lanternPath[lp] }, { duration: 2.4, ease: 'inOutCubic' }).then(nextLantern); };
nextLantern();

// ---------------------------------------------------------------- the Cowboy and his animation graph
const cowboy = createCowboy(); scene.add(cowboy);
const cc = new E.CharacterController(world, { position: [0, 0, 1.5], radius: 0.3, height: 1.8 });
const sk = cowboy.skeleton;
const blend = new E.BlendSpace2D(cowboy.mixer, [
  { clip: 'Idle', x: 0, y: 0 }, { clip: 'Walk', x: 0, y: 1.15 }, { clip: 'Run', x: 0, y: 2.9 },
  { clip: 'Walk Back', x: 0, y: -0.95 }, { clip: 'Strafe Left', x: 0.9, y: 0 }, { clip: 'Strafe Right', x: -0.9, y: 0 },
]);
const upper = cowboy.mixer.addLayer('gestures', { mask: E.boneMask(sk, ['spine'], { weights: { spine: 0.35, chest: 0.75 } }) });
const additive = cowboy.mixer.addLayer('hits', { additive: true });
const look = new E.LookAt(cowboy);
const footIK = new E.FootIK(cowboy, (x, z) => { const h = world.raycast([x, cc.position[1] + 1.2, z], [0, -1, 0], 2.2, { ignore: cc.body }); return h ? { y: h.point[1], normal: h.normal } : null; });
const hits = new E.HitReaction(cowboy);
const local = { x: 0, y: 0 };
let jumped = false;
const sm = new E.AnimStateMachine(cowboy.mixer, {
  params: { grounded: true, air: 0 },
  states: {
    Locomotion: { blend, input: () => [local.x, local.y], fade: 0.2 },
    'Jump Start': { clip: 'Jump Start', fade: 0.08, onEnter: () => (jumped = false), update: (s) => { if (!jumped && s.time > 0.22) { cc.jump(4.6); jumped = true; } } },
    Fall: { clip: 'Fall', fade: 0.18 },
    Land: { clip: 'Land', fade: 0.05, onEnter: () => particles.emit([cc.position[0], cc.position[1] + 0.03, cc.position[2]], { count: 18, spread: 1, up: 0.5, size: 0.14, life: 1 }) },
  },
  transitions: [
    { from: 'Locomotion', to: 'Jump Start', when: (p) => p.jump && p.grounded },
    { from: 'Locomotion', to: 'Fall', when: (p) => p.air > 0.25 },
    { from: 'Jump Start', to: 'Fall', exitTime: 0.95 },
    { from: 'Fall', to: 'Land', when: (p) => p.grounded },
    { from: 'Land', to: 'Locomotion', exitTime: 0.55, fade: 0.25 },
    { from: 'Land', to: 'Locomotion', when: (p) => p.moving, fade: 0.2 },
  ],
});
cowboy.mixer.on((e) => { if (e.name === 'footstep' && cc.grounded) { const b = sk.boneIndex('foot.' + e.side); const p = E.vec3.transformMat4([0, 0, 0], sk.worldHead(b), cowboy.world); particles.emit([p[0], p[1] - 0.08, p[2]], { count: 4, spread: 0.25, up: 0.2, size: 0.09, life: 0.9 }); } });

// ---------------------------------------------------------------- input
const state = { keys: new Set(), yaw: 0, camYaw: 0, camPitch: 0.3, camDist: 5.5, strafe: false, lean: 0 };
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase(); state.keys.add(k);
  if (k === ' ') { e.preventDefault(); sm.trigger('jump'); }
  if (k === 'f') $('tStrafe').click();
  if (k === '1') gesture('Wave'); if (k === '2') gesture('Tip Hat'); if (k === '3') gesture('Quickdraw');
});
addEventListener('keyup', (e) => state.keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => state.keys.clear());
const gesture = (name) => upper.playOnce(name, { fadeIn: 0.25, fadeOut: 0.35 });
document.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => gesture(b.dataset.g)));
function hit(dir = null) {
  const d = dir || E.vec3.normalize([0, 0, 0], E.vec3.sub([0, 0, 0], cowboy.position, camera.position));
  hits.hit([d[0], 0, d[2]], 7);
  additive.playOnce('Flinch', { fadeIn: 0.02, fadeOut: 0.25 });
}
$('hit').onclick = () => hit();
$('tStrafe').onchange = (e) => (state.strafe = e.target.checked);
const cv = $('stage');
let drag = null;
cv.addEventListener('pointerdown', (e) => {
  const r = cv.getBoundingClientRect(), ray = camera.ray(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
  const h = world.raycast(ray.origin, ray.dir, 50, { triggers: false });
  if (h && h.body === cc.body) { hit(ray.dir); return; }
  drag = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', (e) => { if (!drag) return; state.camYaw -= (e.clientX - drag[0]) * 0.006; state.camPitch = E.clamp(state.camPitch + (e.clientY - drag[1]) * 0.004, -0.2, 1.2); drag = [e.clientX, e.clientY]; });
cv.addEventListener('pointerup', () => (drag = null));
cv.addEventListener('wheel', (e) => { e.preventDefault(); state.camDist = E.clamp(state.camDist * Math.exp(Math.sign(e.deltaY) * 0.1), 2.2, 14); }, { passive: false });

// ---------------------------------------------------------------- panels
const STATES = ['Locomotion', 'Jump Start', 'Fall', 'Land'];
$('graph').innerHTML = STATES.map((s, i) => `<span data-st="${s}">${s}</span>${i < STATES.length - 1 ? '<i>→</i>' : '<i>↺</i>'}`).join('');
const bars = (el, names) => { el.innerHTML = names.map((n) => `<span>${n}</span><b><i data-b="${n}"></i></b><output data-o="${n}">0</output>`).join(''); };
const BLEND = ['Idle', 'Walk', 'Run', 'Walk Back', 'Strafe Left', 'Strafe Right'];
bars($('blend'), BLEND);
const LAYERS = ['Gestures', 'Flinch', 'Foot IK drop', 'Look-at', 'Lean'];
bars($('layers'), LAYERS);
const setBar = (name, v, txt) => { const b = document.querySelector(`[data-b="${name}"]`), o = document.querySelector(`[data-o="${name}"]`); if (b) b.style.width = Math.round(Math.min(1, Math.abs(v)) * 100) + '%'; if (o) o.textContent = txt ?? v.toFixed(2); };

// ---------------------------------------------------------------- loop
let last = performance.now(), hudT = 0, prevYaw = 0;
function frame(now) {
  let dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  if ($('tSlow').checked) dt *= 0.3;
  const k = state.keys;
  const ix = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
  const iz = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
  const fwd = [-Math.sin(state.camYaw), -Math.cos(state.camYaw)], right = [-fwd[1], fwd[0]];
  let wish = [0, 0];
  if (ix || iz) {
    const d = [fwd[0] * iz - right[0] * ix, fwd[1] * iz - right[1] * ix], l = Math.hypot(...d);
    const run = k.has('shift') && !state.strafe && iz > 0, speed = state.strafe ? (iz < 0 ? 0.95 : ix && !iz ? 0.9 : 1.15) : run ? 2.9 : 1.15;
    wish = [(d[0] / l) * speed, (d[1] / l) * speed];
  }
  if (sm.current === 'Land' || sm.current === 'Jump Start') wish = [wish[0] * 0.3, wish[1] * 0.3];
  cc.move(wish, dt);
  world.step(dt);
  tweens.update(dt);
  // facing: toward travel, or the camera's heading in strafe mode
  const v = cc.velocity, sp = Math.hypot(v[0], v[2]);
  const target = state.strafe ? Math.atan2(fwd[0], fwd[1]) : sp > 0.2 ? Math.atan2(v[0], v[2]) : state.yaw;
  const dy = Math.atan2(Math.sin(target - state.yaw), Math.cos(target - state.yaw));
  state.yaw += dy * Math.min(1, dt * 10);
  const yawRate = Math.atan2(Math.sin(state.yaw - prevYaw), Math.cos(state.yaw - prevYaw)) / Math.max(dt, 1e-3); prevYaw = state.yaw;
  // velocity in character space drives the blend space
  const c = Math.cos(state.yaw), s = Math.sin(state.yaw);
  local.x = v[0] * c - v[2] * s; local.y = v[0] * s + v[2] * c;
  if (sp < 0.05) { local.x = 0; local.y = 0; }
  sm.set('grounded', cc.grounded).set('moving', sp > 0.4); sm.params.air = cc.grounded ? 0 : sm.params.air + dt;
  sm.update(dt);
  cowboy.position.set(cc.position); cowboy.setEuler(0, (state.yaw * 180) / Math.PI, 0);
  cowboy.update(dt);
  // lean into turns (bank the spine against the turn, scaled by speed)
  const leanT = $('tLean').checked ? E.clamp(-yawRate * sp * 4, -14, 14) : 0;
  state.lean += (leanT - state.lean) * Math.min(1, dt * 6);
  if (Math.abs(state.lean) > 0.05) for (const [b, w] of [['hips', 0.4], ['spine', 0.35], ['chest', 0.25]]) { const i = sk.boneIndex(b); const q = sk.rot.subarray(i * 4, i * 4 + 4); E.quat.multiply(q, E.quat.fromEuler(E.quat.create(), 0, 0, state.lean * w), E.quat.copy(E.quat.create(), q)); }
  sk.update();
  footIK.weight = $('tFootIK').checked && cc.grounded && sm.current !== 'Jump Start' ? 1 : 0;
  footIK.update(dt);
  look.target = $('tLook').checked ? lantern.worldPosition() : null;
  look.update(dt);
  hits.update(dt);
  particles.update(dt);
  // camera: orbit behind, eased
  const tgt = [cc.position[0], cc.position[1] + 1.35, cc.position[2]], cp = Math.cos(state.camPitch);
  const want = [tgt[0] + Math.sin(state.camYaw) * cp * state.camDist, tgt[1] + Math.sin(state.camPitch) * state.camDist, tgt[2] + Math.cos(state.camYaw) * cp * state.camDist];
  E.vec3.lerp(camera.position, camera.position, want, Math.min(1, dt * 8)); camera.position[1] = Math.max(0.3, camera.position[1]);
  E.vec3.copy(camera.target, tgt);
  env.shadowCenter = [cc.position[0], 1, cc.position[2]];
  const lines = $('tSkel').checked ? [{ data: E.skeletonLines(sk, cowboy.world), depthTest: false }] : undefined;
  renderer.render(scene, camera, { background: 'sky', particles, lines });
  hudT += dt;
  if (hudT > 0.1) {
    hudT = 0;
    document.querySelectorAll('[data-st]').forEach((el) => el.classList.toggle('on', el.dataset.st === sm.current));
    for (const n of BLEND) setBar(n, cowboy.mixer.action(n)?.weight || 0);
    const gw = [...upper.actions.values()].reduce((m, a) => Math.max(m, a.weight), 0), aw = [...additive.actions.values()].reduce((m, a) => Math.max(m, a.weight), 0);
    setBar('Gestures', gw); setBar('Flinch', aw); setBar('Foot IK drop', footIK.pelvis / 0.3, (footIK.pelvis * 100).toFixed(0) + ' cm'); setBar('Look-at', look.yaw / 75, look.yaw.toFixed(0) + '°'); setBar('Lean', state.lean / 14, state.lean.toFixed(0) + '°');
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__lab3 = { sm, cc, cowboy, state, gesture, hit, world, camera };
