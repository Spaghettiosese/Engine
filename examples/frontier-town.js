// Frontier Town: a small playable V2 scene. Third-person Cowboy with a speed-driven blend
// tree, collisions against the generated town, a live day/night cycle with lamps, and the
// Grinner, who comes out at night and chases you when you get close.
import * as E from '../src/engine/index.js';
import { createCowboy } from '../src/content/cowboy.js';
import { createGrinner } from '../src/content/monster.js';
import { westernTown, collide } from '../src/content/town.js';

const $ = (id) => document.getElementById(id);
let renderer;
try { renderer = new E.Renderer($('stage')); } catch (e) { $('fatal').hidden = false; $('fatal').textContent = 'Frontier Town needs WebGL2. ' + e.message; throw e; }
renderer.settings.vignette = 0.3;

const scene = new E.Scene();
const town = westernTown({ seed: 7 });
scene.add(town.root);
const env = scene.environment;
env.shadowRadius = 16; env.fogHeight = 0.35; env.fogDensity = 0.006;

const cowboy = createCowboy(); cowboy.position.set([0, 0, 30]); scene.add(cowboy);
const grinner = createGrinner(); grinner.position.set([0, 0, -60]); grinner.visible = false; scene.add(grinner);
cowboy.play('Idle', { fade: 0 }); grinner.play('Walk', { fade: 0 });
const particles = new E.Particles(2000);
const camera = new E.Camera(); camera.fov = 50 * E.DEG; camera.far = 400;

const state = { hours: +$('tod').value, rate: 4, paused: false, keys: new Set(), yaw: Math.PI, speed: 0, crawl: false, camYaw: 0, camPitch: 0.28, camDist: 6.5, grinner: { mode: 'hidden', yaw: 0, target: null, cool: 0 } };

// ---------------------------------------------------------------- input
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase(); state.keys.add(k);
  if (k === 'c') state.crawl = !state.crawl;
  if (k === 't') state.paused = !state.paused;
  if (k === '[' || k === ']') { state.hours = (state.hours + (k === ']' ? 1 : -1) + 24) % 24; $('tod').value = state.hours; }
});
addEventListener('keyup', (e) => state.keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => state.keys.clear());
const cv = $('stage');
let drag = null;
cv.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { if (!drag) return; state.camYaw -= (e.clientX - drag[0]) * 0.006; state.camPitch = E.clamp(state.camPitch + (e.clientY - drag[1]) * 0.004, -0.1, 1.2); drag = [e.clientX, e.clientY]; });
cv.addEventListener('pointerup', () => (drag = null));
cv.addEventListener('wheel', (e) => { e.preventDefault(); state.camDist = E.clamp(state.camDist * Math.exp(Math.sign(e.deltaY) * 0.1), 2.5, 18); }, { passive: false });
$('tod').oninput = (e) => (state.hours = +e.target.value);
$('rate').oninput = (e) => { state.rate = +e.target.value; $('rateOut').textContent = state.rate ? state.rate + ' min' : 'frozen'; };
const tog = (id, fn) => { $(id).onchange = (e) => fn(e.target.checked); };
tog('tAO', (v) => (renderer.settings.ssao = v));
tog('tRays', (v) => (renderer.settings.godRays = v));
tog('tShadows', (v) => (state.shadows = v)); state.shadows = true;
tog('tLights', (v) => (env.lights = v));
tog('tFog', (v) => (env.fogHeight = v ? 0.35 : 0));
tog('tVol', (v) => (renderer.settings.volumetrics = v));
state.wet = 0;
// V3 rain: falling streaks around the camera, wet ground that builds up and dries off
const DROPS = 1400, drops = new Float32Array(DROPS * 3), rainLines = new Float32Array(DROPS * 14);
for (let i = 0; i < DROPS; i++) drops.set([(Math.random() - 0.5) * 30, Math.random() * 14, (Math.random() - 0.5) * 30], i * 3);
function rain(dt, amount) {
  if (amount <= 0.01) return null;
  const c = camera.position, fall = 11, wind = 1.5;
  for (let i = 0; i < DROPS; i++) {
    const o = i * 3;
    drops[o] += wind * dt; drops[o + 1] -= fall * dt;
    if (drops[o + 1] < 0) { drops[o + 1] += 14; if (Math.random() < 0.02) particles.emit([c[0] + drops[o], 0.02, c[2] + drops[o + 2]], { count: 2, spread: 0.3, up: 0.8, size: 0.04, color: [0.75, 0.8, 0.85, 0.4], life: 0.3 }); }
    if (drops[o] > 15) drops[o] -= 30;
    const x = c[0] + drops[o], y = drops[o + 1], z = c[2] + drops[o + 2], a = 0.28 * amount;
    rainLines.set([x, y, z, 0.72, 0.76, 0.82, a, x - wind * 0.035, y + fall * 0.035, z, 0.72, 0.76, 0.82, 0], i * 14);
  }
  return rainLines;
}

// footstep dust
for (const ch of [cowboy, grinner]) ch.mixer.on((ev) => {
  if (ev.name !== 'footstep' && ev.name !== 'handplant') return;
  const b = ch.skeleton.boneIndex((ev.name === 'handplant' ? 'hand.' : 'foot.') + ev.side); if (b < 0) return;
  const p = E.vec3.transformMat4([0, 0, 0], ch.skeleton.worldHead(b), ch.world); p[1] = 0.02;
  const v = ch.mixer.rootVelocity()[2];
  particles.emit(p, { count: 5 + Math.round(v * 3), spread: 0.25 + v * 0.12, up: 0.2 + v * 0.08, size: 0.1 + v * 0.02, color: env.night > 0.5 ? [0.35, 0.33, 0.4, 0.35] : [0.78, 0.64, 0.48, 0.45], life: 1.1 });
});

// ---------------------------------------------------------------- locomotion
function locomotion(ch, dt, moveDir, wantSpeed, crawl, roles, turnRate = 8) {
  const spd = (r) => ch.mixer.clips.get(roles[r])?.rootMotion[2] || 1;
  const vWalk = spd('walk'), vRun = spd('run');
  const st = ch.userData.loco || (ch.userData.loco = { speed: 0, yaw: 0 });
  st.speed += (wantSpeed - st.speed) * Math.min(1, dt * 4);
  if (moveDir) { let d = Math.atan2(moveDir[0], moveDir[1]) - st.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); st.yaw += d * Math.min(1, dt * turnRate); }
  const s = st.speed; let w;
  if (crawl) w = { [roles.crawl]: 1 };
  else if (s < vWalk) w = { [roles.idle]: Math.max(0, 1 - s / vWalk), [roles.walk]: Math.min(1, s / vWalk) };
  else w = { [roles.walk]: Math.max(0, 1 - (s - vWalk) / (vRun - vWalk)), [roles.run]: Math.min(1, (s - vWalk) / (vRun - vWalk)) };
  ch.mixer.setWeights(w, 0.25);
  const v = ch.mixer.rootVelocity()[2] * (crawl && !moveDir ? 0 : 1);
  ch.mixer.timeScale = crawl && !moveDir ? 0 : 1;
  const f = [Math.sin(st.yaw), 0, Math.cos(st.yaw)];
  ch.position[0] += f[0] * v * dt; ch.position[2] += f[2] * v * dt;
  collide(ch.position, crawl ? 0.5 : 0.38, town.colliders);
  ch.setEuler(0, st.yaw * 180 / Math.PI, 0);
  return v;
}
const COWBOY_ROLES = { idle: 'Idle', walk: 'Walk', run: 'Run', crawl: 'Crawl' };
const GRIN_ROLES = { idle: 'Idle', walk: 'Walk', run: 'Chase', crawl: 'Crawl' };

// ---------------------------------------------------------------- the Grinner
function banner(text, ms = 1800) { const b = $('banner'); b.textContent = text; b.hidden = false; clearTimeout(banner.t); banner.t = setTimeout(() => (b.hidden = true), ms); }
function updateGrinner(dt) {
  const G = state.grinner, dark = env.night > 0.55 && $('tGrinner').checked;
  if (!dark) { if (G.mode !== 'hidden') { G.mode = 'hidden'; grinner.visible = false; $('status').textContent = 'Morning. Whatever was out there has gone back to the dark.'; } return; }
  if (G.mode === 'hidden') { // spawn out past the church
    G.mode = 'wander'; grinner.visible = true; grinner.position.set([(Math.random() - 0.5) * 30, 0, -62]); grinner.userData.loco = { speed: 0, yaw: 0 };
    $('status').textContent = 'Night. Keep to the lamplight. It walks the street after dark.';
  }
  const to = [cowboy.position[0] - grinner.position[0], cowboy.position[2] - grinner.position[2]], dist = Math.hypot(to[0], to[1]);
  G.cool = Math.max(0, G.cool - dt);
  if (G.mode === 'wander' && dist < 22 && G.cool <= 0) { G.mode = 'chase'; $('status').textContent = 'It has seen you. Run.'; }
  if (G.mode === 'chase' && dist > 40) { G.mode = 'wander'; $('status').textContent = 'You lost it. For now.'; }
  let dir, speed;
  if (G.mode === 'chase') { dir = [to[0] / dist, to[1] / dist]; speed = 4.2; }
  else {
    if (!G.target || Math.hypot(G.target[0] - grinner.position[0], G.target[1] - grinner.position[2]) < 2) G.target = [(Math.random() - 0.5) * 12, -40 + Math.random() * 75];
    const d = [G.target[0] - grinner.position[0], G.target[1] - grinner.position[2]], l = Math.hypot(...d) || 1; dir = [d[0] / l, d[1] / l]; speed = 0.9;
  }
  locomotion(grinner, dt, dir, speed, false, GRIN_ROLES, 5);
  if (G.mode === 'chase' && dist < 1.3) {
    $('flash').style.opacity = 0.75; setTimeout(() => ($('flash').style.opacity = 0), 250);
    banner('CAUGHT'); G.mode = 'wander'; G.cool = 6;
    grinner.position.set([(Math.random() - 0.5) * 30, 0, -62]); grinner.userData.loco = { speed: 0, yaw: 0 };
    cowboy.position.set([0, 0, 30]);
    $('status').textContent = 'You woke up at the edge of town. It is still out there.';
  }
}

// ---------------------------------------------------------------- frame
let last = performance.now(), fps = 60, hudT = 0;
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  // clock: `rate` real minutes per game day
  if (!state.paused && state.rate > 0) { state.hours = (state.hours + dt * 24 / (state.rate * 60)) % 24; $('tod').value = state.hours; }
  E.applyTimeOfDay(env, state.hours);
  // weather: overcast light while it rains; puddles fill up over ~10 s and dry over ~40 s
  const raining = $('tRain').checked;
  state.wet = E.clamp(state.wet + (raining ? dt / 10 : -dt / 40), 0, 1);
  const storm = raining ? 1 : 0;
  env.wetness = state.wet; env.rain = storm;
  if (state.wet > 0 || raining) {
    const k = Math.max(storm, state.wet * 0.6);
    env.sunIntensity *= 1 - 0.65 * k; env.godRays *= 1 - k;
    env.fogColor = env.fogColor.map((v, i) => v * (1 - 0.4 * k) + [0.34, 0.36, 0.4][i] * 0.4 * k * (1 - env.night));
    env.horizonColor = env.horizonColor.map((v, i) => v * (1 - 0.35 * k) + [0.45, 0.47, 0.52][i] * 0.35 * k * (1 - env.night));
    env.fogDensity = 0.006 + 0.012 * k; env.volumeDensity = 0.03 + 0.04 * k; env.clouds = true;
  } else { env.fogDensity = 0.006; env.volumeDensity = 0.03; }
  town.setNight(E.smoothstep(0.1, 0.7, env.night + (state.hours > 18.5 || state.hours < 6.5 ? 0.35 : 0)));
  // player input, camera-relative
  const k = state.keys;
  const ix = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
  const iz = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
  let dir = null;
  if (ix || iz) { const f = [-Math.sin(state.camYaw), -Math.cos(state.camYaw)], rt = [-f[1], f[0]]; dir = [f[0] * iz - rt[0] * ix, f[1] * iz - rt[1] * ix]; const l = Math.hypot(...dir); dir = [dir[0] / l, dir[1] / l]; }
  const want = !dir ? 0 : state.crawl ? 1 : k.has('shift') ? 2.9 : 1.15;
  const v = locomotion(cowboy, dt, dir, want, state.crawl, COWBOY_ROLES);
  cowboy.update(dt);
  updateGrinner(dt);
  if (grinner.visible) grinner.update(dt);
  town.update(dt);
  particles.update(dt);
  // camera: orbit behind the player, eased
  const target = [cowboy.position[0], cowboy.position[1] + (state.crawl ? 0.8 : 1.45), cowboy.position[2]];
  // orbit in spherical coordinates (lerping positions would swing the camera
  // through the player when the yaw flips), then pull in against buildings
  const C = state.cam || (state.cam = { yaw: state.camYaw, pitch: state.camPitch, dist: state.camDist });
  const ease = Math.min(1, dt * 6);
  C.yaw += (Math.atan2(Math.sin(state.camYaw - C.yaw), Math.cos(state.camYaw - C.yaw))) * ease;
  C.pitch += (state.camPitch - C.pitch) * ease;
  let reach = state.camDist;
  const cp = Math.cos(C.pitch), dx = Math.sin(C.yaw) * cp, dz = Math.cos(C.yaw) * cp;
  for (let s = 0.5; s <= state.camDist; s += 0.25) {
    const px = target[0] + dx * s, pz = target[2] + dz * s;
    if (town.colliders.some((c) => px > c.min[0] - 0.3 && px < c.max[0] + 0.3 && pz > c.min[1] - 0.3 && pz < c.max[1] + 0.3)) { reach = Math.max(1.2, s - 0.4); break; }
  }
  C.dist += (reach - C.dist) * (reach < C.dist ? Math.min(1, dt * 14) : ease);
  if (!state.camInit) { C.yaw = state.camYaw; C.pitch = state.camPitch; C.dist = reach; state.camInit = true; }
  camera.position.set([target[0] + dx * C.dist, target[1] + Math.sin(C.pitch) * C.dist, target[2] + dz * C.dist]);
  camera.position[1] = Math.max(0.4, camera.position[1]);
  E.vec3.copy(camera.target, target);
  env.shadowCenter = [cowboy.position[0], 1, cowboy.position[2]];
  const rl = rain(dt, $('tRain').checked ? 1 : 0);
  renderer.render(scene, camera, { background: 'sky', particles, shadows: state.shadows, lines: rl ? [{ data: rl }] : undefined });
  // HUD
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05; hudT += dt;
  if (hudT > 0.25) {
    hudT = 0;
    const h = Math.floor(state.hours), m = Math.floor((state.hours - h) * 60);
    $('todOut').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const S = renderer.stats;
    $('stats').innerHTML = `<b>${fps.toFixed(0)}</b> fps<br>draws <b>${S.drawCalls}</b> · culled <b>${S.culled}</b><br>tris <b>${Math.round(S.triangles).toLocaleString()}</b><br>lights <b>${Math.min(16, town.lamps.length + town.interior.length)}</b> nearest of ${town.lamps.length + town.interior.length}<br>speed <b>${v.toFixed(1)}</b> m/s`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__town = { scene, camera, renderer, state, cowboy, grinner, town };
