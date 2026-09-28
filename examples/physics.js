// Physics Playground: the V3 rigid-body engine. Stacks, dominoes, a wrecking ball on a
// chain, a rope bridge, Newton's cradle and Cowboys that go limp when hit and get back up.
// Drag anything to throw it; Space fires a cannonball; E sets off an explosion.
import * as E from '../src/engine/index.js';
import { createCowboy } from '../src/content/cowboy.js';

const $ = (id) => document.getElementById(id);
let renderer;
try { renderer = new E.Renderer($('stage')); } catch (e) { $('fatal').hidden = false; $('fatal').textContent = 'The playground needs WebGL2. ' + e.message; throw e; }
const scene = new E.Scene(), env = scene.environment;
E.applyTimeOfDay(env, 16.2); env.shadowRadius = 14; env.fogDensity = 0.004; env.volumetric = 0.25;
const camera = new E.Camera(); camera.fov = 45 * E.DEG; camera.far = 300;
const controls = new E.OrbitControls(camera, $('stage'), { leftButtonOrbit: true }); controls.minDistance = 3; controls.maxDistance = 60;
const particles = new E.Particles(3000);
const world = new E.PhysicsWorld({ iterations: 10, substeps: 2 });

// ---------------------------------------------------------------- materials & helpers
const M = (o) => new E.Material(o);
const MAT = {
  ground: M({ name: 'Ground', color: '#a88a68', pattern: 'dirt', patternScale: 1, patternColor: '#76593d', roughness: 1 }),
  crate: M({ name: 'Crate', color: '#a0764a', pattern: 'planks', patternScale: 6, patternColor: '#3c2816', roughness: 0.8 }),
  stone: M({ name: 'Stone', color: '#9a9288', pattern: 'stucco', patternScale: 3, patternColor: '#6c655c', roughness: 0.85 }),
  red: M({ name: 'Red', color: '#b33a2a', roughness: 0.45 }), cream: M({ name: 'Cream', color: '#e8dcc2', roughness: 0.4 }),
  iron: M({ name: 'Iron', color: '#4a4a4e', metallic: 0.9, roughness: 0.35, pattern: 'metal', patternScale: 2 }),
  chrome: M({ name: 'Chrome', color: '#dadade', metallic: 1, roughness: 0.08 }),
  rope: M({ name: 'Rope', color: '#b69a64', roughness: 0.9, pattern: 'hair', patternScale: 6 }),
  plank: M({ name: 'Plank', color: '#8c6a47', pattern: 'planks', patternScale: 7, patternColor: '#2e2012', roughness: 0.85 }),
  barrel: M({ name: 'Barrel', color: '#7a5130', pattern: 'wood', patternScale: 4, patternColor: '#4a2e18', roughness: 0.7 }),
  ball: M({ name: 'Ball', color: '#2a2a2e', metallic: 0.8, roughness: 0.25 }),
};
scene.add(new E.Mesh(E.plane({ width: 200, depth: 200 }), MAT.ground, 'Ground'));
const geoCache = new Map();
const geoFor = (shape) => {
  const key = shape.type + ':' + (shape.half ? shape.half.join() : shape.radius + ',' + (shape.halfHeight || 0));
  if (!geoCache.has(key)) geoCache.set(key, shape.type === 'box' ? E.box({ width: shape.half[0] * 2, height: shape.half[1] * 2, depth: shape.half[2] * 2, bevel: Math.min(0.03, Math.min(...shape.half) * 0.2), bevelSegments: 2 })
    : shape.type === 'sphere' ? E.sphere({ radius: shape.radius, widthSegments: 28, heightSegments: 16 }) : E.capsule({ radius: shape.radius, length: shape.halfHeight * 2, radialSegments: 18, capSegments: 5 }));
  return geoCache.get(key);
};
let dynamic = []; // { body, mesh }
function spawn(shape, mat, o = {}) {
  const body = new E.Body({ shape, ...o });
  const mesh = new E.Mesh(o.geometry || geoFor(shape), mat, o.name || shape.type);
  body.node = mesh; world.add(body); scene.add(mesh);
  dynamic.push({ body, mesh });
  world.syncNodes();
  return body;
}
function staticBox(half, pos, mat = MAT.stone, rot) { return spawn(new E.Box(half), mat, { type: 'static', position: pos, rotation: rot }); }
world.add(new E.Body({ shape: new E.Plane([0, 1, 0], 0), friction: 0.7 }));
// visible ropes/chains: drawn as lines between joint anchors
let ropes = [];

// ---------------------------------------------------------------- cowboys (ragdoll targets)
let cowboys = [];
function addCowboy(pos, yaw) {
  const c = createCowboy(); c.position.set(pos); c.setEuler(0, yaw, 0); c.play('Idle', { fade: 0 }); scene.add(c); c.update(0);
  const hurt = new E.Body({ shape: new E.Capsule(0.3, 0.6), type: 'kinematic', position: [pos[0], pos[1] + 0.95, pos[2]], group: 8, name: 'cowboy' });
  hurt.userData.cowboy = c; world.add(hurt);
  const rag = new E.Ragdoll(world, c);
  const entry = { c, hurt, rag, down: 0, look: new E.LookAt(c) };
  cowboys.push(entry);
  return entry;
}
function knockDown(entry, impulse, at) {
  if (entry.rag.active && entry.rag.weight > 0.5) return;
  world.remove(entry.hurt);
  entry.rag.activate({ impulse, at: at || 'torso' });
  entry.down = 0; entry.c.autoAnimate = true;
  status(`Down he goes. He'll get back up once he stops moving.`);
}
world.on('contact', (e) => {
  for (const x of [e.a, e.b]) if (x.userData.cowboy) {
    const other = x === e.a ? e.b : e.a, entry = cowboys.find((k) => k.c === x.userData.cowboy);
    if (entry && e.speed > 2.5) knockDown(entry, E.physicsMath.scl(e.normal, (x === e.a ? 1 : -1) * Math.min(400, other.mass * e.speed * 0.5)), 'torso');
  }
  if (e.speed > 3 && e.impulse > 2) particles.emit(e.point, { count: Math.min(14, 3 + Math.round(e.speed)), spread: 0.4 + e.speed * 0.05, up: 0.3 + e.speed * 0.05, size: 0.1, color: [0.72, 0.62, 0.5, 0.45], life: 0.9 });
});

// ---------------------------------------------------------------- scenarios
function clear() {
  for (const d of dynamic) { scene.remove(d.mesh); world.remove(d.body); }
  for (const k of cowboys) { if (k.rag.active) k.rag._release(); world.remove(k.hurt); scene.remove(k.c); }
  for (const j of [...world.joints]) world.remove(j);
  dynamic = []; cowboys = []; ropes = []; drag = null;
}
const view = (pos, target) => { camera.position.set(pos); camera.target.set(target); controls.target = camera.target; controls.fromCamera(); };
const S = {
  tower() {
    for (let i = 0; i < 12; i++) spawn(new E.Box([0.45, 0.3, 0.45]), i % 2 ? MAT.crate : MAT.stone, { position: [0, 0.3 + i * 0.6, 0], rotation: quatY(i * 7), mass: 20 });
    for (let i = 0; i < 6; i++) spawn(new E.Box([0.25, 0.25, 0.25]), MAT.crate, { position: [2.5 + (i % 2) * 0.1, 0.25 + i * 0.5, 1.5], mass: 8 });
    view([9, 5, 12], [0.5, 3.3, 0]); return 'A 12-box tower. Fire at it, or drag a box out of the middle.';
  },
  pyramid() {
    const n = 9, s = 0.5;
    for (let row = 0; row < n; row++) for (let i = 0; i < n - row; i++) spawn(new E.Box([s / 2, s / 2, s / 2]), (row + i) % 3 ? MAT.crate : MAT.red, { position: [(i - (n - row - 1) / 2) * (s + 0.01), s / 2 + row * s, 0], mass: 6 });
    view([6, 3.5, 8], [0, 1.8, 0]); return `${(n * (n + 1)) / 2} boxes. It settles, then falls asleep (blue in collider view).`;
  },
  dominoes() {
    const N = 70;
    for (let i = 0; i < N; i++) {
      const a = i * 0.16, r = 1.2 + i * 0.075, p = [Math.cos(a) * r, 0.5, Math.sin(a) * r];
      spawn(new E.Box([0.05, 0.5, 0.25]), i % 2 ? MAT.cream : MAT.red, { position: p, rotation: quatY(-a * 57.2958), mass: 2, friction: 0.5 });
    }
    spawn(new E.Sphere(0.22), MAT.chrome, { position: [Math.cos(0) * 1.2, 1.6, Math.sin(0) * 1.2 - 0.5], mass: 4, velocity: [0, 0, 2.2] });
    view([0, 9, 10], [0, 0, 0]); return 'A spiral of 70 dominoes. A chrome ball starts the chain.';
  },
  wrecking() {
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) spawn(new E.Box([0.3, 0.2, 0.2]), (x + y) % 2 ? MAT.red : MAT.cream, { position: [(x - 2.5) * 0.61 + (y % 2) * 0.3, 0.2 + y * 0.405, 0], mass: 5 });
    // gantry and a chain of links ending in a heavy ball
    staticBox([0.15, 3.5, 0.15], [0, 3.5, -5.5], MAT.iron); staticBox([0.15, 0.15, 3], [0, 7.1, -3], MAT.iron);
    let prev = null; const top = [0, 7, -1.5], links = 7, L = 0.5;
    for (let i = 0; i < links; i++) {
      const p = [0, top[1] - L / 2 - i * L, top[2]];
      const b = spawn(new E.Capsule(0.06, L / 2 - 0.06), MAT.iron, { position: p, mass: 3, angularDamping: 0.3 });
      world.add(new E.BallJoint(prev, b, prev ? [0, top[1] - i * L, top[2]] : top));
      ropes.push([prev, b]); prev = b;
    }
    const ball = spawn(new E.Sphere(0.55), MAT.ball, { position: [0, top[1] - links * L - 0.55, top[2]], mass: 400, angularDamping: 0.3 });
    world.add(new E.BallJoint(prev, ball, [0, top[1] - links * L, top[2]]));
    // pull the chain back 65° so it swings into the wall: links and ball laid out along the rope
    const dir = [0, -Math.cos(1.13), -Math.sin(1.13)], chainLinks = dynamic.filter((d) => d.body.shape.type === 'capsule').map((d) => d.body);
    chainLinks.forEach((b, i) => { b.position = E.physicsMath.madd(top, dir, (i + 0.5) * L); b.quaternion = E.physicsMath.qFromTo([0, 1, 0], E.physicsMath.scl(dir, -1)); });
    ball.position = E.physicsMath.madd(top, dir, links * L + 0.55);
    view([8, 4, 6], [0, 2, -1.5]); return 'A 400 kg wrecking ball on a seven-link chain.';
  },
  bridge() {
    staticBox([0.3, 1.5, 0.3], [-5.5, 1.5, -0.9], MAT.plank); staticBox([0.3, 1.5, 0.3], [-5.5, 1.5, 0.9], MAT.plank);
    staticBox([0.3, 1.5, 0.3], [5.5, 1.5, -0.9], MAT.plank); staticBox([0.3, 1.5, 0.3], [5.5, 1.5, 0.9], MAT.plank);
    staticBox([1.5, 1.4, 1.2], [-7, 1.4, 0], MAT.stone); staticBox([1.5, 1.4, 1.2], [7, 1.4, 0], MAT.stone);
    const n = 14, span = 10.4, w = span / n; let prev = null;
    for (let i = 0; i < n; i++) {
      const x = -span / 2 + w / 2 + i * w;
      const b = spawn(new E.Box([w / 2 - 0.03, 0.05, 0.8]), MAT.plank, { position: [x, 2.8, 0], mass: 4, angularDamping: 0.4 });
      for (const z of [-0.7, 0.7]) world.add(new E.BallJoint(prev, b, [x - w / 2, 2.8, z]));
      ropes.push([prev, b]); prev = b;
    }
    for (const z of [-0.7, 0.7]) world.add(new E.BallJoint(prev, null, [span / 2, 2.8, z]));
    for (let i = 0; i < 4; i++) spawn(new E.Box([0.25, 0.25, 0.25]), MAT.crate, { position: [-3 + i * 2, 4 + i, 0], mass: 10 });
    view([3, 5, 11], [0, 2, 0]); return 'Fourteen planks hung between four posts. Drop crates on it, or drag a plank.';
  },
  cradle() {
    staticBox([1.6, 0.08, 0.08], [0, 4, -0.8], MAT.iron); staticBox([1.6, 0.08, 0.08], [0, 4, 0.8], MAT.iron);
    for (const x of [-1.6, 1.6]) for (const z of [-0.8, 0.8]) staticBox([0.07, 2, 0.07], [x, 2, z], MAT.iron);
    const r = 0.25;
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * (2 * r + 0.001);
      const b = spawn(new E.Sphere(r), MAT.chrome, { position: [x, 1.5, 0], mass: 2, restitution: 0.97, friction: 0.0, linearDamping: 0, angularDamping: 0.5, allowSleep: false });
      for (const z of [-0.8, 0.8]) world.add(new E.DistanceJoint(null, b, [x, 3.92, z], [x, 1.5, 0]));
      ropes.push([{ fixed: [x, 3.92, -0.8] }, b], [{ fixed: [x, 3.92, 0.8] }, b]);
      if (i === 0) { b.position = [x - 1.5, 2.9, 0]; }
    }
    world.iterations = 30;
    view([0, 2.4, 6], [0, 2, 0]); return "Newton's cradle: five chrome balls on wires, restitution 0.97.";
  },
  ragdolls() {
    for (let i = 0; i < 6; i++) staticBox([2.6, 0.15 * (i + 1), 0.4], [0, 0.15 * (i + 1), -2 - i * 0.8], MAT.stone);
    addCowboy([-1.2, 0.9, -6.05], 0); addCowboy([1.2, 0.9, -6.05], 0); addCowboy([0, 0, 1.5], 180);
    view([6, 3.5, 7], [0, 1, -2]); return 'Three Cowboys. Fire a cannonball or throw a crate at one: he goes limp, tumbles, then gets back up.';
  },
};
let current = 'tower';
function load(name) {
  clear(); world.iterations = 10; current = name;
  document.querySelectorAll('[data-s]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.s === name));
  status(S[name]());
}
const quatY = (deg) => { const a = (deg * Math.PI) / 360; return [0, Math.sin(a), 0, Math.cos(a)]; };
function status(t) { $('status').textContent = t; }
document.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => load(b.dataset.s)));

// ---------------------------------------------------------------- interaction
const cv = $('stage');
let drag = null, pointer = [0, 0], paused = false, timeScale = 1;
const rayAt = (x, y) => { const r = cv.getBoundingClientRect(); return camera.ray(((x - r.left) / r.width) * 2 - 1, 1 - ((y - r.top) / r.height) * 2); };
cv.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.altKey) return;
  const { origin, dir } = rayAt(e.clientX, e.clientY);
  const hit = world.raycast(origin, dir, 200);
  if (!hit || !hit.body.isDynamic) return;
  e.stopImmediatePropagation(); controls.enabled = false; cv.setPointerCapture(e.pointerId);
  drag = { joint: world.add(new E.DragJoint(hit.body, hit.point, { maxForce: hit.body.mass * 80 })), dist: hit.distance, body: hit.body };
}, { capture: true });
cv.addEventListener('pointermove', (e) => {
  pointer = [e.clientX, e.clientY];
  if (!drag) return;
  const { origin, dir } = rayAt(e.clientX, e.clientY);
  const t = E.physicsMath.madd(origin, dir, drag.dist); t[1] = Math.max(0.1, t[1]);
  drag.joint.setTarget(t);
});
const endDrag = () => { if (drag) { world.remove(drag.joint); drag = null; controls.enabled = true; } };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
function fire() {
  const { origin, dir } = rayAt(pointer[0] || innerWidth / 2, pointer[1] || innerHeight / 2);
  const b = spawn(new E.Sphere(0.18), MAT.ball, { position: E.physicsMath.madd(origin, dir, 1), velocity: E.physicsMath.scl(dir, 32), mass: 12, restitution: 0.3 });
  b.userData.cannon = true;
}
function explode() {
  const { origin, dir } = rayAt(pointer[0], pointer[1]);
  const hit = world.raycast(origin, dir, 200); if (!hit) return;
  world.explode(hit.point, 4, 14);
  for (const k of cowboys) if (E.vec3.dist(k.c.position, hit.point) < 4) knockDown(k, E.physicsMath.scl(E.physicsMath.norm(E.physicsMath.sub(k.c.position, hit.point)), 300));
  particles.emit(hit.point, { count: 60, spread: 3, up: 2.5, size: 0.35, color: [0.45, 0.4, 0.36, 0.55], life: 1.6 });
}
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); fire(); }
  if (k === 'e') explode();
  if (k === 'p') paused = !paused;
  if (k === 'r') load(current);
});
$('fire').onclick = fire;
const drop = (shape, mat, o) => spawn(shape, mat, { position: [(Math.random() - 0.5) * 2, 6, (Math.random() - 0.5) * 2], ...o });
$('spawnCrate').onclick = () => drop(new E.Box([0.35, 0.35, 0.35]), MAT.crate, { mass: 12, rotation: quatY(Math.random() * 90) });
$('spawnBall').onclick = () => drop(new E.Sphere(0.3), MAT.red, { mass: 4, restitution: 0.6 });
$('spawnBarrel').onclick = () => drop(new E.Capsule(0.3, 0.25), MAT.barrel, { mass: 20, rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] });
const bind = (id, fmt, fn) => { const el = $(id), out = $(id + 'Out'); const f = () => { fn(+el.value); out.textContent = fmt(+el.value); }; el.oninput = f; f(); };
bind('gravity', (v) => v.toFixed(1) + ' m/s²', (v) => { world.gravity[1] = -v; for (const b of world.bodies) b.wake(); });
bind('slowmo', (v) => v.toFixed(2) + '×', (v) => (timeScale = v));
$('tSleep').onchange = (e) => { for (const b of world.bodies) b.allowSleep = e.target.checked; world.sleepTime = e.target.checked ? 0.6 : Infinity; };

// ---------------------------------------------------------------- loop
load(new URLSearchParams(location.search).get('s') || 'tower');
let last = performance.now(), fps = 60, hudT = 0;
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  if (!paused) world.step(dt * timeScale);
  // cowboys: animation, ragdoll blending, getting up
  for (const k of cowboys) {
    if (k.rag.active && k.rag.weight >= 1) { k.down += dt; if (k.down > 2.2 && k.rag.settled) { k.c.play('Idle', { fade: 0 }); k.rag.deactivate(0.9); k.getUp = 0.9; } }
    if (k.getUp !== undefined) { k.getUp -= dt; if (k.getUp <= 0 && !k.rag.active) { delete k.getUp; k.hurt.position = [k.c.position[0], k.c.position[1] + 0.95, k.c.position[2]]; world.add(k.hurt); } }
    k.c.update(dt * timeScale);
    if (!k.rag.active) { k.look.target = camera.position; k.look.update(dt); }
    k.rag.update(dt * timeScale);
  }
  particles.update(dt);
  const lines = [];
  // ropes and chains
  const L = [];
  for (const [a, b] of ropes) { const pa = a ? (a.fixed || a.position) : null; if (!pa) continue; L.push(...pa, 0.25, 0.2, 0.15, 1, ...b.position, 0.25, 0.2, 0.15, 1); }
  if (current === 'cradle' && L.length) lines.push({ data: new Float32Array(L) });
  if ($('tDebug').checked) lines.push({ data: world.debugLines(), depthTest: false, alpha: 0.9 });
  if (drag) { const pa = drag.body.toWorld(drag.joint.localB); lines.push({ data: new Float32Array([...pa, 1, 0.8, 0.3, 1, ...drag.joint.localA, 1, 0.8, 0.3, 1]), depthTest: false }); }
  env.shadowCenter = [controls.target[0], 1, controls.target[2]];
  renderer.render(scene, camera, { background: 'sky', particles, lines });
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05; hudT += dt;
  if (hudT > 0.25) {
    hudT = 0; const P = world.stats;
    $('stats').innerHTML = `<b>${fps.toFixed(0)}</b> fps${paused ? ' · <b>paused</b>' : ''}<br>bodies <b>${P.bodies}</b> · awake <b>${P.awake}</b><br>contacts <b>${P.contacts}</b> · joints <b>${world.joints.length}</b><br>physics <b>${P.stepMs.toFixed(1)}</b> ms · draws <b>${renderer.stats.drawCalls}</b>`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__phys = { world, scene, camera, load, fire, explode, cowboys, renderer, knockDown };
