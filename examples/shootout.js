// Showdown: a small third-person shooter built on ShapeForge. The Sheriff draws his Colt
// from the holster (bone sockets + a masked animation layer), aim IK puts the barrel on the
// crosshair, recoil plays on an additive layer, and every shot is a physics hitscan:
// bottles shatter (fracture), cans fly, steel plates swing on hinges, outlaws go down as
// ragdolls and drop their guns. Bullet holes are decals; muzzle flashes light the street.
import * as E from '../src/engine/index.js';
import { cowboyDefinition, cowboyClips } from '../src/content/cowboy.js';
import { westernTown } from '../src/content/town.js';
import { createRevolver, revolverFired, updateRevolver, HAND_SOCKET, HOLSTER_SOCKET } from '../src/content/revolver.js';

const $ = (id) => document.getElementById(id);
const PM = E.physicsMath;
let renderer;
try { renderer = new E.Renderer($('stage')); } catch (e) { $('fatal').hidden = false; $('fatal').textContent = 'Showdown needs WebGL2. ' + e.message; throw e; }

// ---------------------------------------------------------------- world
const scene = new E.Scene(), env = scene.environment;
const town = westernTown({ seed: 7 });
scene.add(town.root);
E.applyTimeOfDay(env, 17.6); town.setNight(0.15);
env.shadowRadius = 14; env.shadowFar = 60; env.fogHeight = 0.35; env.fogDensity = 0.006;
const camera = new E.Camera(); camera.fov = 50 * E.DEG; camera.far = 400;
const particles = new E.Particles(4000);
const decals = new E.Decals({ max: 200 }); scene.add(decals);
const world = new E.PhysicsWorld({ iterations: 8 });
world.add(new E.Body({ shape: new E.Plane(), friction: 0.8 }));
for (const c of town.colliders) {
  const hx = (c.max[0] - c.min[0]) / 2, hz = (c.max[1] - c.min[1]) / 2, h = hx > 20 || hz > 20 ? 6 : hx < 2.5 && hz < 2.5 ? 0.55 : 4.5; // wells, wagons, troughs are waist-high
  const b = world.add(new E.Body({ shape: new E.Box([hx, h, hz]), type: 'static', position: [(c.min[0] + c.max[0]) / 2, h, (c.min[1] + c.max[1]) / 2] }));
  b.userData.kind = 'wood';
}
const CLIPS = cowboyClips(); // synthesized once and shared by every character
const makeCowboy = () => new E.Character({ ...cowboyDefinition({ withClips: false }), clips: CLIPS });

// ---------------------------------------------------------------- the Sheriff
const sheriff = makeCowboy(); scene.add(sheriff);
const sk = sheriff.skeleton;
const gun = createRevolver();
sheriff.attach(gun, 'holster', HOLSTER_SOCKET);
const MUZZLE = gun.userData.muzzle;
const barrelIK = (socket) => ({ axis: [0, -1, 0], offset: [socket.position[0], socket.position[1] - MUZZLE[2], socket.position[2] + MUZZLE[1]] });
// muzzle flash: an emissive burst parented to the gun, plus a light that pops for a frame or two
const flashMat = new E.Material({ name: 'Muzzle flash', color: '#ffd28a', emissive: '#ffb04a', emissiveStrength: 0 });
const flashMesh = new E.Mesh(E.sphere({ radius: 1, widthSegments: 10, heightSegments: 6 }), flashMat, 'Flash');
flashMesh.castShadow = false; flashMesh.position.set([0, MUZZLE[1], MUZZLE[2] + 0.05]); flashMesh.scale.set([0.02, 0.02, 0.07]); flashMesh.visible = false;
gun.add(flashMesh);
const flashLight = new E.Light('point', { color: '#ffb866', intensity: 0, range: 7 }); scene.add(flashLight);
const cc = new E.CharacterController(world, { position: [0, 0, 31], radius: 0.3 });
cc.body.userData.player = true;
const blend = new E.BlendSpace2D(sheriff.mixer, [
  { clip: 'Idle', x: 0, y: 0 }, { clip: 'Walk', x: 0, y: 1.15 }, { clip: 'Run', x: 0, y: 2.9 },
  { clip: 'Walk Back', x: 0, y: -0.95 }, { clip: 'Strafe Left', x: 0.9, y: 0 }, { clip: 'Strafe Right', x: -0.9, y: 0 },
]);
const gunLayer = sheriff.mixer.addLayer('gun', { mask: E.boneMask(sk, ['spine'], { weights: { spine: 0.4, chest: 0.8 } }) });
gunLayer.weight = 0;
const recoilLayer = sheriff.mixer.addLayer('recoil', { additive: true, mask: E.boneMask(sk, ['spine']) });
const aimIK = new E.AimIK(sheriff, barrelIK(HAND_SOCKET));
const hitReact = new E.HitReaction(sheriff);
let sheriffRag = null;
sheriff.mixer.on((e) => {
  if (e.name === 'grab') sheriff.attach(gun, 'hand.R', HAND_SOCKET);
  if (e.name === 'release') sheriff.attach(gun, 'holster', HOLSTER_SOCKET);
  if (e.name === 'load' && P.gun === 'reloading') { P.ammo = Math.min(6, P.ammo + 1); }
  if (e.name === 'footstep' && cc.grounded) dust(footPos(sheriff, e.side), 3);
});

// ---------------------------------------------------------------- state
const P = { hp: 100, ammo: 6, gun: 'holstered', gunT: 0, cooldown: 0, aimT: 0, aimW: 0, lastHurt: 99, idleGun: 0, queuedShot: false, dead: false, shots: 0, hits: 0 };
const G = { mode: null, playing: false, paused: true, score: 0, time: 0, wave: 0, slowmo: 0, targets: [], outlaws: [], debris: [], tracers: [], waveDelay: 0 };
const input = { keys: new Set(), aimHeld: false, aimToggle: false, yaw: 0, pitch: 0.12, fire: false };
const view = { yaw: Math.PI, kick: 0, shake: 0, dist: 4.2 };

// ---------------------------------------------------------------- helpers
const footPos = (ch, side) => { const i = ch.skeleton.boneIndex('foot.' + side); const p = E.vec3.transformMat4([0, 0, 0], ch.skeleton.worldHead(i), ch.world); p[1] = Math.max(0.02, p[1] - 0.08); return p; };
const dust = (p, n = 8, color = [0.72, 0.62, 0.5, 0.45], spread = 0.5) => particles.emit(p, { count: n, spread, up: 0.35, size: 0.1, color, life: 1 });
const sparks = (p) => particles.emit(p, { count: 10, spread: 1.6, up: 1.4, size: 0.035, color: [3, 2.2, 0.9, 1], life: 0.35 });
function feed(text) { const d = document.createElement('div'); d.textContent = text; $('feed').prepend(d); setTimeout(() => d.remove(), 3000); }
function banner(text, ms = 1600) { const b = $('banner'); b.textContent = text; b.hidden = false; clearTimeout(banner.t); banner.t = setTimeout(() => (b.hidden = true), ms); }
function hitmark(kill) { const h = $('hitmark'); h.classList.toggle('kill', !!kill); h.style.transition = 'none'; h.style.opacity = 1; requestAnimationFrame(() => { h.style.transition = 'opacity .35s'; h.style.opacity = 0; }); }
function addScore(n, why) { G.score += n; if (why) feed(`+${n}  ${why}`); }
function muzzleWorld(g) { g.parent.updateWorld(g.parent.parent ? g.parent.parent.world : null); return E.vec3.transformMat4([0, 0, 0], MUZZLE, g.world); }
function tracer(a, b, color = [5, 3.6, 1.6]) { G.tracers.push({ a, b, t: 0.07, color }); }
function muzzleFlash(p) { flashMesh.visible = true; flashMat.emissiveStrength = 45; flashMesh.setEuler(0, 0, Math.random() * 360); flashLight.position.set(p); flashLight.intensity = 60; P.flashT = 0.05; particles.emit(p, { count: 6, spread: 0.25, up: 0.3, size: 0.09, color: [0.8, 0.78, 0.74, 0.35], life: 1.2 }); }

// ---------------------------------------------------------------- targets (range mode)
const MAT = {
  glass: new E.Material({ name: 'Bottle glass', color: '#2f6b3a', roughness: 0.06, metallic: 0.2 }),
  amber: new E.Material({ name: 'Amber glass', color: '#8a4a12', roughness: 0.06, metallic: 0.2 }),
  tin: new E.Material({ name: 'Tin', color: '#b8b8bc', metallic: 0.9, roughness: 0.3 }),
  label: new E.Material({ name: 'Label', color: '#b02a1e', roughness: 0.5 }),
  steel: new E.Material({ name: 'Steel plate', color: '#d8d6cf', metallic: 0.6, roughness: 0.35 }),
  rail: town.palette.darkWood,
};
const bottleGeo = E.lathe({ points: [[0, -0.11], [0.034, -0.11], [0.036, 0.02], [0.03, 0.05], [0.012, 0.08], [0.011, 0.11], [0, 0.11]], segments: 16, smooth: 1 });
const canGeo = E.cylinder({ radiusTop: 0.033, radiusBottom: 0.033, height: 0.12, radialSegments: 16 });
const shardGeo = E.box({ width: 1, height: 1, depth: 1 });
function addTarget(kind, pos) {
  let body, mesh;
  if (kind === 'bottle') { body = new E.Body({ shape: new E.Box([0.035, 0.11, 0.035]), position: pos, mass: 0.4, friction: 0.6 }); mesh = new E.Mesh(bottleGeo, Math.random() < 0.3 ? MAT.amber : MAT.glass, 'Bottle'); }
  else { body = new E.Body({ shape: new E.Box([0.033, 0.06, 0.033]), position: pos, mass: 0.12, friction: 0.5 }); mesh = new E.Mesh(canGeo, Math.random() < 0.5 ? MAT.tin : MAT.label, 'Can'); }
  body.userData = { kind, start: [...pos], scored: false }; body.node = mesh;
  world.add(body); scene.add(mesh);
  G.targets.push({ body, mesh });
}
function buildRange() {
  const kit = new E.Kit(town.palette);
  const rail = (y) => { kit.box(MAT.rail, [0, y, 22.5], [9, 0.08, 0.22]); world.add(new E.Body({ shape: new E.Box([4.5, 0.04, 0.11]), type: 'static', position: [0, y, 22.5] })); };
  rail(1.05); rail(0.6);
  for (const x of [-4.4, -1.5, 1.5, 4.4]) { kit.box(MAT.rail, [x, 0.55, 22.5], [0.12, 1.1, 0.12]); world.add(new E.Body({ shape: new E.Box([0.06, 0.55, 0.06]), type: 'static', position: [x, 0.55, 22.5] })); }
  kit.box(MAT.rail, [0, 2.55, 18.5], [8, 0.1, 0.1]);
  for (const x of [-4, 4]) kit.box(MAT.rail, [x, 1.27, 18.5], [0.12, 2.55, 0.12]);
  const n = kit.toNode('Range'); scene.add(n); G.rangeNode = n;
  // steel plates on hinges: they swing back when hit and settle again
  G.plates = [];
  for (const x of [-3, -1, 1, 3]) {
    const plate = new E.Body({ shape: new E.Box([0.15, 0.15, 0.012]), position: [x, 2.3, 18.5], mass: 3, angularDamping: 0.5, allowSleep: false });
    const mesh = new E.Mesh(E.box({ width: 0.3, height: 0.3, depth: 0.024, bevel: 0.01 }), MAT.steel, 'Plate');
    plate.node = mesh; plate.userData = { kind: 'plate', cool: 0 };
    world.add(plate); scene.add(mesh);
    world.add(new E.HingeJoint(null, plate, [x, 2.5, 18.5], [1, 0, 0]));
    G.plates.push({ body: plate, mesh });
  }
}
function setTargets() {
  for (const t of G.targets) { world.remove(t.body); scene.remove(t.mesh); }
  G.targets = [];
  for (let i = 0; i < 9; i++) addTarget('bottle', [-4 + i, 1.2, 22.5]);
  for (let i = 0; i < 8; i++) addTarget('can', [-3.5 + i, 0.705, 22.5]);
}

// ---------------------------------------------------------------- outlaws
const OUTLAW_COLORS = { hatFelt: '#1d1a18', hatBand: '#6a1f1a', shirt: '#6e2a20', vest: '#191512', bandana: '#141414', chaps: '#3a2a20', jeans: '#2a2a2e', gold: '#3a2417' };
function spawnOutlaw(pos) {
  const c = makeCowboy();
  for (const [k, col] of Object.entries(OUTLAW_COLORS)) { const m = c.materials.get(k); if (m) { m.color = col; if (k === 'shirt') m.patternColor = '#140a08'; } }
  c.position.set(pos); scene.add(c);
  const g = createRevolver(); c.attach(g, 'hand.R', HAND_SOCKET);
  const ctl = new E.CharacterController(world, { position: pos, radius: 0.3 });
  const bs = new E.BlendSpace2D(c.mixer, [{ clip: 'Idle', x: 0, y: 0 }, { clip: 'Walk', x: 0, y: 1.15 }, { clip: 'Run', x: 0, y: 2.9 }, { clip: 'Strafe Left', x: 0.9, y: 0 }, { clip: 'Strafe Right', x: -0.9, y: 0 }]);
  const layer = c.mixer.addLayer('gun', { mask: E.boneMask(c.skeleton, ['spine'], { weights: { spine: 0.4, chest: 0.8 } }) });
  layer.weight = 0; layer.play('Aim Revolver', { fade: 0 });
  const recoil = c.mixer.addLayer('recoil', { additive: true, mask: E.boneMask(c.skeleton, ['spine']) });
  const o = { c, gun: g, ctl, bs, layer, recoil, aim: new E.AimIK(c, barrelIK(HAND_SOCKET)), rag: new E.Ragdoll(world, c), yaw: 0, state: 'advance', t: 0, goal: null, shotsLeft: 0, alive: true, dieT: 0, react: new E.HitReaction(c) };
  ctl.body.userData.outlaw = o;
  G.outlaws.push(o);
  return o;
}
function killOutlaw(o, dir, point, head) {
  if (!o.alive) return;
  o.alive = false; o.dieT = 0;
  world.remove(o.ctl.body);
  o.layer.fadeWeight(0, 0.1);
  o.rag.activate({ velocity: [0, 0, 0], impulse: PM.scl(dir, head ? 160 : 230), at: head ? 'head' : 'torso' });
  // the gun drops and bounces
  const gp = muzzleWorld(o.gun); o.c.detach(o.gun); scene.add(o.gun);
  const gb = world.add(new E.Body({ shape: new E.Box([0.02, 0.06, 0.1]), position: gp, rotation: o.gun.rotation, mass: 1.1, velocity: [dir[0] * 2, 1.5, dir[2] * 2], angularVelocity: [4, 2, 6], ccd: true }));
  o.gun.position.set(gp); gb.node = o.gun; o.gunBody = gb; gb.userData.kind = 'metal';
  addScore(head ? 150 : 100, head ? 'Headshot' : 'Outlaw down');
  hitmark(true);
  if (G.outlaws.every((x) => !x.alive) && G.wave > 0) { G.slowmo = 1.3; G.waveDelay = 3.2; }
}
function outlawShoot(o) {
  o.recoil.playOnce('Revolver Recoil', { fadeIn: 0.01, fadeOut: 0.2 }); revolverFired(o.gun);
  const m = muzzleWorld(o.gun), chest = [cc.position[0], cc.position[1] + 1.25, cc.position[2]];
  const d = E.vec3.dist(m, chest), speed = Math.hypot(cc.velocity[0], cc.velocity[2]);
  const chance = E.clamp(0.62 - d * 0.018 - speed * 0.1 + (P.aimT > 0.5 ? 0.08 : 0), 0.08, 0.7);
  const target = Math.random() < chance ? chest : [chest[0] + (Math.random() - 0.5) * 2.2, chest[1] + (Math.random() - 0.3) * 1.2, chest[2] + (Math.random() - 0.5) * 2.2];
  const dir = E.vec3.normalize([0, 0, 0], E.vec3.sub([0, 0, 0], target, m));
  const hit = world.raycast(m, dir, 120, { ignore: o.ctl.body });
  particles.emit(m, { count: 4, spread: 0.2, up: 0.2, size: 0.08, color: [0.8, 0.78, 0.74, 0.3], life: 1 });
  flashLight.position.set(m); flashLight.intensity = 40; P.flashT = 0.05;
  tracer(m, hit ? hit.point : PM.madd(m, dir, 120), [4, 2.2, 1.2]);
  if (!hit) return;
  if (hit.body === cc.body) hurtPlayer(18, dir);
  else impact(hit, dir, false);
}
function hurtPlayer(dmg, dir) {
  if (P.dead) return;
  P.hp -= dmg; P.lastHurt = 0; view.shake = 0.35;
  hitReact.hit(dir, 7);
  $('hurt').style.boxShadow = 'inset 0 0 160px 50px rgba(170, 20, 10, .55)'; setTimeout(() => ($('hurt').style.boxShadow = ''), 250);
  if (P.hp <= 0) {
    P.hp = 0; P.dead = true;
    world.remove(cc.body);
    sheriffRag = sheriffRag || new E.Ragdoll(world, sheriff);
    sheriffRag.activate({ impulse: PM.scl(dir, 180) });
    setTimeout(() => endGame(`You were shot down in the street.`), 2600);
  }
}

// ---------------------------------------------------------------- shooting
function aimPoint() {
  camera.update(renderer.width / Math.max(1, renderer.height));
  const r = camera.ray(0, 0), ignore = new Set([cc.body, ...(sheriffRag ? sheriffRag.bodies : [])]);
  const hit = world.raycast(r.origin, r.dir, 300, { ignore });
  return hit ? hit.point : PM.madd(r.origin, r.dir, 300);
}
function shoot() {
  P.ammo--; P.cooldown = 0.32; P.shots++; P.idleGun = 0;
  revolverFired(gun);
  recoilLayer.playOnce('Revolver Recoil', { fadeIn: 0.01, fadeOut: 0.2 });
  const m = muzzleWorld(gun), tgt = aimPoint();
  const moving = Math.hypot(cc.velocity[0], cc.velocity[2]);
  const spread = (P.aimT > 0.8 ? 0.004 : 0.03) + moving * 0.006;
  let dir = E.vec3.normalize([0, 0, 0], E.vec3.sub([0, 0, 0], tgt, m));
  dir = E.vec3.normalize(dir, [dir[0] + (Math.random() - 0.5) * spread, dir[1] + (Math.random() - 0.5) * spread, dir[2] + (Math.random() - 0.5) * spread]);
  const hit = world.raycast(m, dir, 300, { ignore: new Set([cc.body]) });
  muzzleFlash(m);
  tracer(m, hit ? hit.point : PM.madd(m, dir, 300));
  view.kick += 0.035; view.shake = Math.max(view.shake, 0.12);
  P.last = { muzzle: m, target: tgt, hit: hit && { kind: hit.body.userData.kind || hit.body.shape.type, point: hit.point, name: hit.body.name } };
  if (hit) impact(hit, dir, true);
}
function impact(hit, dir, byPlayer) {
  const b = hit.body, k = b.userData.kind;
  if (b.userData.outlaw) {
    const o = b.userData.outlaw, head = hit.point[1] - o.ctl.position[1] > 1.5;
    if (byPlayer) { P.hits++; killOutlaw(o, dir, hit.point, head); }
    dust(hit.point, 6, [0.45, 0.25, 0.2, 0.5], 0.4);
    return;
  }
  if (b.userData.ragdoll) { b.applyImpulse(PM.scl(dir, 40), hit.point); dust(hit.point, 4); return; }
  if (k === 'bottle') {
    const mesh = b.node; scene.remove(mesh); G.targets = G.targets.filter((t) => t.body !== b);
    const shards = E.fracture(world, b, { pieces: [2, 3, 2], point: PM.madd(hit.point, dir, -0.05), speed: 3.5 });
    for (const s of shards) { const m = new E.Mesh(shardGeo, mesh.material, 'Shard'); m.scale.set(s.shape.half.map((h) => h * 2)); s.node = m; scene.add(m); G.debris.push({ body: s, mesh: m, t: 6 }); }
    particles.emit(hit.point, { count: 14, spread: 1.2, up: 1, size: 0.03, color: [0.6, 0.9, 0.7, 0.9], life: 0.6 });
    if (byPlayer) { P.hits++; addScore(10, 'Bottle'); hitmark(); }
    return;
  }
  if (k === 'can') { b.applyImpulse(PM.add(PM.scl(dir, 0.55), [0, 0.45, 0]), hit.point); b.angularVelocity = [Math.random() * 20 - 10, 8, Math.random() * 20 - 10]; sparks(hit.point); if (byPlayer) { P.hits++; hitmark(); addScore(b.userData.scored ? 5 : 10, b.userData.scored ? 'Juggle' : 'Can'); b.userData.scored = true; } return; }
  if (k === 'plate') { b.applyImpulse(PM.scl(dir, 5), hit.point); sparks(hit.point); if (byPlayer && b.userData.cool <= 0) { P.hits++; hitmark(); addScore(15, 'Ding'); b.userData.cool = 0.3; } return; }
  if (b.isDynamic) { b.applyImpulse(PM.scl(dir, 6), hit.point); sparks(hit.point); return; }
  // static: bullet hole and a puff of dust or splinters
  decals.add(hit.point, hit.normal, 0.035 + Math.random() * 0.015);
  dust(hit.point, 7, b.shape.type === 'plane' ? [0.72, 0.62, 0.5, 0.5] : [0.55, 0.42, 0.3, 0.5], 0.6);
}

// ---------------------------------------------------------------- game flow
function clearLevel() {
  for (const t of G.targets) { world.remove(t.body); scene.remove(t.mesh); }
  for (const d of G.debris) { world.remove(d.body); scene.remove(d.mesh); }
  for (const o of G.outlaws) removeOutlaw(o);
  if (G.rangeNode) { scene.remove(G.rangeNode); G.rangeNode = null; }
  for (const p of G.plates || []) { world.remove(p.body); scene.remove(p.mesh); }
  for (const j of [...world.joints]) if (!sheriffRag || !sheriffRag.joints.includes(j)) world.remove(j);
  G.targets = []; G.debris = []; G.outlaws = []; G.plates = []; decals.clear();
}
function removeOutlaw(o) {
  if (o.rag.active) o.rag._release();
  world.remove(o.ctl.body); scene.remove(o.c);
  if (o.gunBody) { world.remove(o.gunBody); scene.remove(o.gun); }
}
function start(mode) {
  clearLevel();
  if (sheriffRag && sheriffRag.active) sheriffRag._release();
  if (sheriffRag) { sheriffRag.weight = 0; sheriffRag._fade = null; }
  Object.assign(P, { hp: 100, ammo: 6, gun: 'holstered', gunT: 0, cooldown: 0, dead: false, shots: 0, hits: 0, lastHurt: 99 });
  if (!world.bodies.includes(cc.body)) world.add(cc.body);
  cc.position = [0, 0, 31]; cc.velocity = [0, 0, 0]; input.yaw = 0; input.pitch = 0.1; view.yaw = Math.PI;
  sheriff.attach(gun, 'holster', HOLSTER_SOCKET); gunLayer.weight = 0;
  Object.assign(G, { mode, playing: true, paused: false, score: 0, time: mode === 'range' ? 60 : 0, wave: 0, slowmo: 0, waveDelay: mode === 'outlaws' ? 1.5 : 0 });
  if (mode === 'range') { buildRange(); setTargets(); banner('Target practice', 1400); }
  else banner('Outlaws are coming', 1400);
  $('menu').hidden = true; for (const id of ['xhair', 'top', 'bar', 'ammo']) $(id).hidden = false;
  lock();
}
function nextWave() {
  G.wave++;
  if (G.wave > 3) { endGame('The town is safe. The outlaws are gone.', true); return; }
  const spots = [[-3, -16], [3, -15], [0, -22], [-6, -10], [6, -9], [-2, -28], [4, -26]];
  const n = G.wave + 1;
  for (let i = 0; i < n; i++) { const s = spots[(i * 3 + G.wave) % spots.length]; spawnOutlaw([s[0] + (Math.random() - 0.5), 0, s[1] + (Math.random() - 0.5) * 3]); }
  banner(`Wave ${G.wave}`, 1500);
}
function endGame(text, won = false) {
  G.playing = false; unlock();
  const acc = P.shots ? Math.round((P.hits / P.shots) * 100) : 0;
  $('menuText').innerHTML = `${text}<br><b style="color:var(--brass);font:400 28px Rye,Georgia,serif">Score ${G.score}</b><br>${P.shots} shots, ${acc}% accuracy${G.mode === 'outlaws' && won ? `, ${G.time.toFixed(0)} s` : ''}. Pick a mode to play again.`;
  $('menu').hidden = false;
  for (const id of ['xhair', 'bar', 'ammo']) $(id).hidden = true;
}
document.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => start(b.dataset.mode)));

// ---------------------------------------------------------------- input (pointer lock, with a drag fallback)
const cv = $('stage');
const lock = () => { try { cv.requestPointerLock?.(); } catch { /* sandboxed: fall back to dragging */ } };
const unlock = () => { if (document.pointerLockElement) document.exitPointerLock(); };
const locked = () => document.pointerLockElement === cv;
let drag = null;
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('pointerdown', (e) => {
  if (!G.playing) return;
  if (!locked()) lock();
  if (e.button === 2) input.aimHeld = true;
  if (e.button === 0) { input.fire = true; drag = { x: e.clientX, y: e.clientY, moved: 0 }; }
  if (e.button === 2) drag = { x: e.clientX, y: e.clientY, moved: 0 };
});
addEventListener('pointerup', (e) => { if (e.button === 2) input.aimHeld = false; drag = null; });
addEventListener('pointermove', (e) => {
  if (!G.playing || G.paused) return;
  let dx = 0, dy = 0;
  if (locked()) { dx = e.movementX; dy = e.movementY; }
  else if (drag) { dx = e.clientX - drag.x; dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; }
  const sens = P.aimT > 0.5 ? 0.0012 : 0.0022;
  input.yaw -= dx * sens; input.pitch = E.clamp(input.pitch + dy * sens, -0.55, 0.8);
});
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase(); input.keys.add(k);
  if (k === 'q') input.aimToggle = !input.aimToggle;
  if (k === 'r' && G.playing) reload();
  if ((k === 'p' || k === 'escape') && G.playing) { G.paused = !G.paused; banner(G.paused ? 'Paused' : 'Go', G.paused ? 60000 : 500); if (!G.paused) lock(); }
});
addEventListener('keyup', (e) => input.keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => { input.keys.clear(); input.aimHeld = false; });
function reload() { if ((P.gun === 'ready' || P.gun === 'holstered') && P.ammo < 6 && !P.dead) { if (P.gun === 'holstered') { draw(); P.pendingReload = true; return; } gunLayer.play('Reload Revolver', { fade: 0.12, restart: true }); P.gun = 'reloading'; P.gunT = 0; } }
function draw() { gunLayer.fadeWeight(1, 0.1); gunLayer.play('Draw Revolver', { fade: 0.06, restart: true }); P.gun = 'drawing'; P.gunT = 0; }

// ---------------------------------------------------------------- HUD
const ammoEl = $('ammo');
for (let i = 0; i < 6; i++) { const a = (i / 6) * 360; const d = document.createElement('i'); d.style.transform = `rotate(${a}deg) translate(0, -27px) rotate(${-a}deg)`; ammoEl.append(d); }
function hud() {
  $('score').textContent = G.score;
  $('goal').textContent = G.mode === 'range' ? `${Math.max(0, G.time).toFixed(0)} s left` : `Wave ${Math.max(1, G.wave)} / 3 · ${G.outlaws.filter((o) => o.alive).length} left`;
  $('hp').style.width = P.hp + '%';
  [...ammoEl.querySelectorAll('i')].forEach((d, i) => d.classList.toggle('spent', i >= P.ammo));
  const x = $('xhair'), size = 18 + (1 - P.aimT) * 18 + Math.hypot(cc.velocity[0], cc.velocity[2]) * 4;
  x.style.width = x.style.height = size + 'px';
  $('hint').innerHTML = P.gun === 'reloading' ? 'Reloading…' : P.ammo === 0 ? 'Empty: press <kbd>R</kbd> to reload' : 'Right mouse or <kbd>Q</kbd> aim · click fire · <kbd>R</kbd> reload';
}

// ---------------------------------------------------------------- update
function updatePlayer(dt) {
  const k = input.keys;
  const aiming = !P.dead && (input.aimHeld || input.aimToggle || (input.fire && P.gun !== 'reloading'));
  // gun handling state machine
  P.gunT += dt; P.cooldown -= dt;
  if (aiming && P.gun === 'holstered') draw();
  if (P.gun === 'drawing' && P.gunT > 0.44) { gunLayer.play('Aim Revolver', { fade: 0.1 }); P.gun = 'ready'; P.gunT = 0; if (P.pendingReload) { P.pendingReload = false; reload(); } }
  if (P.gun === 'reloading' && P.gunT > 2.05) { P.ammo = 6; gunLayer.play('Aim Revolver', { fade: 0.15 }); P.gun = 'ready'; P.gunT = 0; }
  if (P.gun === 'ready') {
    P.idleGun = aiming ? 0 : P.idleGun + dt;
    if (input.fire && P.cooldown <= 0) {
      if (P.ammo > 0) { if (P.aimT > 0.35) shoot(); else P.queued = true; } else { reload(); }
    }
    if (P.queued && P.aimT > 0.35 && P.cooldown <= 0 && P.ammo > 0) { P.queued = false; shoot(); }
    if (P.idleGun > 4) { gunLayer.play('Holster Revolver', { fade: 0.1, restart: true }); P.gun = 'holstering'; P.gunT = 0; }
  }
  if (P.gun === 'holstering' && P.gunT > 0.68) { gunLayer.fadeWeight(0, 0.25); P.gun = 'holstered'; }
  input.fire = false;
  const wantAim = aiming && (P.gun === 'ready' || (P.gun === 'drawing' && P.gunT > 0.3));
  P.aimT = E.clamp(P.aimT + (wantAim ? dt * 6 : -dt * 4), 0, 1);
  // movement (camera-relative); aiming slows you and keeps you facing the crosshair
  const ix = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0), iz = (k.has('w') ? 1 : 0) - (k.has('s') ? 1 : 0);
  const fwd = [-Math.sin(input.yaw), -Math.cos(input.yaw)], right = [-fwd[1], fwd[0]];
  let wish = [0, 0];
  if ((ix || iz) && !P.dead) {
    const d = [fwd[0] * iz - right[0] * ix, fwd[1] * iz - right[1] * ix], l = Math.hypot(...d);
    const sp = P.aimT > 0.3 || P.gun === 'reloading' ? 1.1 : k.has('shift') ? 2.9 : 1.15;
    wish = [(d[0] / l) * sp, (d[1] / l) * sp];
  }
  if (!P.dead) cc.move(wish, dt);
  const v = cc.velocity, sp = Math.hypot(v[0], v[2]);
  const face = P.aimT > 0.05 || P.gun === 'reloading' ? Math.atan2(fwd[0], fwd[1]) : sp > 0.2 ? Math.atan2(v[0], v[2]) : view.yaw;
  view.yaw += Math.atan2(Math.sin(face - view.yaw), Math.cos(face - view.yaw)) * Math.min(1, dt * (P.aimT > 0.05 ? 16 : 9));
  const c = Math.cos(view.yaw), s = Math.sin(view.yaw);
  let lx = v[0] * c - v[2] * s, ly = v[0] * s + v[2] * c;
  if (sp < 0.05) lx = ly = 0;
  if (!P.dead) blend.set(lx, ly, 0.15);
  sheriff.position.set(cc.position); sheriff.setEuler(0, (view.yaw * 180) / Math.PI, 0);
  sheriff.update(dt);
  if (!P.dead) {
    aimIK.weight = P.aimT; aimIK.target = aimPoint(); aimIK.update();
    hitReact.update(dt);
    sheriff.updateSockets();
  }
  if (sheriffRag) sheriffRag.update(dt);
  updateRevolver(gun, dt);
  if (!P.dead && P.lastHurt > 4) P.hp = Math.min(100, P.hp + dt * 6);
  P.lastHurt += dt;
}
function updateOutlaws(dt) {
  for (const o of G.outlaws) {
    if (!o.alive) { o.dieT += dt; o.c.update(dt); o.rag.update(dt); if (o.dieT > 14) { removeOutlaw(o); o.removed = true; } continue; }
    o.t += dt;
    const toP = [cc.position[0] - o.ctl.position[0], cc.position[2] - o.ctl.position[2]], dist = Math.hypot(...toP);
    let wish = [0, 0];
    if (o.state === 'advance') {
      if (!o.goal) { const zz = cc.position[2] - 11 - Math.random() * 9; o.goal = [E.clamp(cc.position[0] + (Math.random() - 0.5) * 9, -6.5, 6.5), E.clamp(zz, -30, 26)]; }
      const d = [o.goal[0] - o.ctl.position[0], o.goal[1] - o.ctl.position[2]], l = Math.hypot(...d);
      if (l < 0.6 || o.t > 7) { o.state = 'aim'; o.t = 0; o.shotsLeft = 1 + Math.floor(Math.random() * 3); o.aimFor = 0.8 + Math.random() * 0.7; }
      else wish = [(d[0] / l) * (dist > 18 ? 2.4 : 1.15), (d[1] / l) * (dist > 18 ? 2.4 : 1.15)];
    } else if (o.state === 'aim') {
      if (!P.dead && o.t > o.aimFor) { outlawShoot(o); o.shotsLeft--; o.t = 0; o.aimFor = 0.7 + Math.random() * 0.9; if (o.shotsLeft <= 0) { o.state = 'advance'; o.goal = null; o.t = -0.4; } }
      if (dist < 6) { o.state = 'advance'; o.goal = [o.ctl.position[0] - toP[0], o.ctl.position[2] - toP[1] - 4]; o.t = 0; }
    }
    o.ctl.move(wish, dt);
    const aiming = o.state === 'aim';
    o.layer.fadeWeight(aiming ? 1 : 0.35, 0.2);
    const faceYaw = aiming || dist < 25 ? Math.atan2(toP[0], toP[1]) : Math.atan2(wish[0] || toP[0], wish[1] || toP[1]);
    o.yaw += Math.atan2(Math.sin(faceYaw - o.yaw), Math.cos(faceYaw - o.yaw)) * Math.min(1, dt * 8);
    const v = o.ctl.velocity, c = Math.cos(o.yaw), s = Math.sin(o.yaw);
    o.bs.set(v[0] * c - v[2] * s, v[0] * s + v[2] * c, 0.15);
    o.c.position.set(o.ctl.position); o.c.setEuler(0, (o.yaw * 180) / Math.PI, 0);
    o.c.update(dt);
    o.aim.weight = aiming ? 1 : 0; o.aim.target = [cc.position[0], cc.position[1] + 1.2, cc.position[2]]; o.aim.update();
    o.react.update(dt); o.c.updateSockets();
    updateRevolver(o.gun, dt);
  }
  G.outlaws = G.outlaws.filter((o) => !o.removed);
}
function updateCamera(dt) {
  const a = P.aimT, cp = Math.cos(input.pitch), sp = Math.sin(input.pitch);
  view.dist += ((a > 0.2 ? 2.3 : 4.2) - view.dist) * Math.min(1, dt * 8);
  view.kick *= Math.exp(-dt * 12); view.shake *= Math.exp(-dt * 8);
  const pitch = input.pitch - view.kick;
  const back = [Math.sin(input.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(input.yaw) * Math.cos(pitch)];
  const right = [Math.cos(input.yaw), 0, -Math.sin(input.yaw)]; // camera's right: over the Sheriff's right shoulder
  const base = P.dead && sheriffRag ? sheriffRag.parts.get('pelvis').body.position : cc.position;
  const shoulder = 0.2 + a * 0.3, h = 1.5 + a * 0.12;
  const pivot = [base[0] + right[0] * shoulder, base[1] + h, base[2] + right[2] * shoulder];
  // pull the camera in front of walls between it and the Sheriff
  let dist = view.dist;
  const hit = world.raycast(pivot, back, dist + 0.3, { ignore: new Set([cc.body, ...G.outlaws.map((o) => o.ctl.body)]) });
  if (hit) dist = Math.max(0.6, hit.distance - 0.3);
  const sh = view.shake, jitter = () => (Math.random() - 0.5) * sh * 0.08;
  camera.position.set([pivot[0] + back[0] * dist + jitter(), Math.max(0.3, pivot[1] + back[1] * dist + jitter()), pivot[2] + back[2] * dist + jitter()]);
  camera.target.set([pivot[0] - back[0] * 10, pivot[1] - back[1] * 10, pivot[2] - back[2] * 10]);
  camera.fov = (50 - a * 16) * E.DEG;
  // depth of field while aiming, focused on what's under the crosshair
  const s = renderer.settings;
  s.dofAperture = a > 0.3 ? 0.16 * a : 0;
  if (a > 0.3) s.dofFocus += (Math.min(40, E.vec3.dist(camera.position, aimIK.target || camera.target)) - s.dofFocus) * Math.min(1, dt * 4);
  // there is no sheriff model at the aim point, so keep the aim camera from clipping into him
  void cp; void sp;
}
function updateGame(dt) {
  if (G.mode === 'range') {
    G.time -= dt;
    for (const t of G.targets) if (t.body.userData.kind === 'can' && !t.body.userData.scored && t.body.position[1] < 0.3) { t.body.userData.scored = true; }
    const standing = G.targets.filter((t) => E.vec3.dist(t.body.position, t.body.userData.start) < 0.25).length;
    if (standing === 0 && G.targets.length) { addScore(50, 'Clean sweep'); banner('Clean sweep', 1200); setTimeout(() => G.playing && setTargets(), 1400); G.targets = G.targets.map((t) => { t.body.userData.start = [0, -99, 0]; return t; }); }
    for (const p of G.plates) p.body.userData.cool -= dt;
    if (G.time <= 0) endGame('Time!');
  } else {
    G.time += dt;
    if (G.waveDelay > 0) { G.waveDelay -= dt; if (G.waveDelay <= 0) nextWave(); }
  }
  for (const d of G.debris) { d.t -= dt; if (d.t <= 0) { world.remove(d.body); scene.remove(d.mesh); } }
  G.debris = G.debris.filter((d) => d.t > 0);
}

// ---------------------------------------------------------------- loop
let last = performance.now(), hudT = 0;
function frame(now) {
  let dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  if (G.slowmo > 0) { G.slowmo -= dt; dt *= 0.3; }
  const run = G.playing && !G.paused;
  if (run) { updatePlayer(dt); updateOutlaws(dt); updateGame(dt); world.step(dt); }
  else if (!G.playing) { // attract mode: slow orbit around the Sheriff
    input.yaw += dt * 0.08; sheriff.position.set(cc.position); sheriff.update(dt); updateRevolver(gun, dt);
    for (const o of G.outlaws) { o.c.update(dt); if (!o.alive) o.rag.update(dt); }
    if (sheriffRag && sheriffRag.active) { world.step(dt); sheriffRag.update(dt); }
  }
  if (P.flashT !== undefined) { P.flashT -= dt; if (P.flashT <= 0) { flashLight.intensity = 0; flashMesh.visible = false; flashMat.emissiveStrength = 0; } }
  updateCamera(dt);
  town.update(dt); particles.update(dt);
  const lines = [];
  for (const t of G.tracers) { t.t -= dt; const a = Math.max(0, t.t / 0.07); lines.push(...t.a, ...t.color, a, ...t.b, ...t.color, a * 0.4); }
  G.tracers = G.tracers.filter((t) => t.t > 0);
  env.shadowCenter = [cc.position[0], 1, cc.position[2]];
  renderer.render(scene, camera, { background: 'sky', particles, lines: lines.length ? [{ data: new Float32Array(lines) }] : undefined });
  hudT += dt; if (hudT > 0.1 && G.playing) { hudT = 0; hud(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// test hook: advance the game without rendering (headless checks run at ~1 fps)
function simulate(seconds) { for (let t = 0; t < seconds; t += 1 / 60) { updatePlayer(1 / 60); updateOutlaws(1 / 60); updateGame(1 / 60); world.step(1 / 60); updateCamera(1 / 60); particles.update(1 / 60); } }
// test hook: point the camera at a world position
function lookAt(p) { for (let i = 0; i < 3; i++) { updateCamera(0); const d = E.vec3.normalize([0, 0, 0], E.vec3.sub([0, 0, 0], p, camera.position)); input.yaw = Math.atan2(-d[0], -d[2]); input.pitch = Math.asin(E.clamp(-d[1], -1, 1)); } }
window.__show = { simulate, lookAt, G, P, input, start, shoot: () => { input.fire = true; }, sheriff, world, camera, renderer, outlaws: () => G.outlaws };
