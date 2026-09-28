// Animation Viewer: clip browser with phase-synced crossfades, root-motion roaming,
// a playable WASD mode (idle/walk/run blend tree + crawl), onion skins and exports.
import * as E from '../engine/index.js';
import { createCowboy } from '../content/cowboy.js';
import { westernSet } from '../content/scenery.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');
let renderer;
try { renderer = new E.Renderer(canvas, { preserveDrawingBuffer: true }); } catch (e) { $('fatal').hidden = false; $('fatal').textContent = 'This viewer needs WebGL2. ' + e.message; throw e; }

const scene = new E.Scene();
const set = westernSet();
scene.add(set);
const camera = new E.Camera();
camera.position.set([2.6, 1.7, 4.2]); camera.target.set([0, 1.0, 0]);
const controls = new E.OrbitControls(camera, canvas, { leftButtonOrbit: true });
controls.distance = 5; controls.pitch = 0.18; controls.yaw = 0.6; controls.apply();
const particles = new E.Particles(3000);

const state = { focus: 'body', mode: 'roam', paused: false, speed: 1, fade: 0.4, skeleton: false, onion: false, wire: false, toon: false, shadows: true, dust: true, turntable: false, yaw: 0, velocity: [0, 0, 0], crawl: false, keys: new Set(), moveSpeed: 0 };
let character, ghost, clipNames = [];

function loadCharacter(ch) {
  if (character) scene.remove(character);
  character = ch;
  scene.add(character);
  ghost = new E.GhostPoser(character.skeleton);
  clipNames = [...character.mixer.clips.keys()];
  character.mixer.on(onEvent);
  const first = clipNames.includes('Walk') ? 'Walk' : clipNames[0];
  if (first) character.play(first, { fade: 0 });
  buildClipList();
  const bones = character.skeleton.length, parts = character.parts.reduce((a, p) => a + p.meshes.length, 0);
  $('modelMeta').textContent = `${parts} parts · ${bones} bones · ${character.triangleCount.toLocaleString()} tris · ${clipNames.length} clips`;
}

function buildClipList() {
  const box = $('clips');
  box.innerHTML = '';
  clipNames.forEach((n, i) => {
    const c = character.mixer.clips.get(n);
    const b = document.createElement('button');
    b.className = 'clip'; b.dataset.clip = n;
    const sp = c.rootMotion[2] ? `${c.rootMotion[2].toFixed(2)} m/s` : 'in place';
    b.innerHTML = `<span class="key">${i + 1}</span><span class="name">${n}</span><span class="info">${c.duration.toFixed(2)}s<br>${sp}</span><span class="w"></span>`;
    b.onclick = () => playClip(n);
    box.appendChild(b);
  });
}
function playClip(n) {
  if (state.mode === 'play') setMode('roam');
  character.play(n, { fade: state.fade });
  state.paused = false; updatePlayBtn();
}

// footstep dust + event log
function onEvent(e) {
  const log = document.createElement('div');
  log.textContent = `${e.name} ${e.side || ''}`;
  $('events').appendChild(log);
  setTimeout(() => log.remove(), 1400);
  if (!state.dust) return;
  const sk = character.skeleton;
  const bone = e.name === 'handplant' ? 'hand.' + e.side : 'foot.' + e.side;
  const i = sk.boneIndex(bone); if (i < 0) return;
  const p = E.vec3.transformMat4([0, 0, 0], sk.worldHead(i), character.world);
  p[1] = 0.02;
  const run = (character.mixer.action('Run')?.weight || 0);
  particles.emit(p, { count: e.name === 'handplant' ? 6 : 8 + Math.round(run * 12), spread: 0.3 + run * 0.5, up: 0.25 + run * 0.4, size: 0.1 + run * 0.08, color: [0.78, 0.64, 0.48, 0.45], life: 1.0 + run * 0.6 });
}

// ------------------------------------------------------------------ UI wiring
const setMode = (m) => {
  state.mode = m;
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  $('modeHint').textContent = {
    inplace: 'Clips play on the spot. Good for inspecting poses frame by frame.',
    roam: 'Root motion drives the cowboy around a loop; the camera follows.',
    play: 'WASD / arrows to move, Shift to run, C to crawl. Speed blends Idle → Walk → Run.',
  }[m];
  if (m === 'inplace') { character.position.set([0, 0, 0]); }
  if (m === 'play') { state.moveSpeed = 0; character.mixer.setWeights({ Idle: 1 }, 0.3); }
};
document.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
const bindToggle = (id, key, fn) => { const el = $(id); el.checked = !!state[key]; el.onchange = () => { state[key] = el.checked; fn && fn(el.checked); }; };
bindToggle('tSkeleton', 'skeleton'); bindToggle('tOnion', 'onion'); bindToggle('tWire', 'wire'); bindToggle('tToon', 'toon');
bindToggle('tShadows', 'shadows'); bindToggle('tDust', 'dust'); bindToggle('tTurn', 'turntable');
$('tSprings').onchange = (e) => { character.springs = e.target.checked; if (!e.target.checked) { character.skeleton.resetSprings(); } };
$('tSet').onchange = (e) => { for (const c of set.children) if (c.name !== 'Ground') c.visible = e.target.checked; };
$('tBloom').onchange = (e) => (renderer.settings.bloom = e.target.checked);
const slider = (id, out, fmt, fn) => { const el = $(id); const upd = () => { $(out).textContent = fmt(+el.value); fn(+el.value); }; el.oninput = upd; upd(); };
slider('fade', 'fadeOut', (v) => v.toFixed(2) + ' s', (v) => (state.fade = v));
slider('speed', 'speedOut', (v) => v.toFixed(2) + '×', (v) => (state.speed = v));
slider('sun', 'sunOut', (v) => v + '°', (v) => {
  const a = v * Math.PI / 180, az = 0.65;
  E.vec3.normalize(scene.environment.sunDirection, [Math.cos(a) * Math.sin(az), Math.sin(a), Math.cos(a) * Math.cos(az)]);
  const warm = 1 - Math.min(1, v / 50);
  scene.environment.sunColor = [1.0, 0.9 - warm * 0.25, 0.78 - warm * 0.4];
  scene.environment.horizonColor = [0.95, 0.76 - warm * 0.18, 0.58 - warm * 0.25];
});
document.querySelectorAll('[data-focus]').forEach((b) => (b.onclick = () => {
  state.focus = b.dataset.focus; state.follow = true;
  document.querySelectorAll('[data-focus]').forEach((x) => x.classList.toggle('on', x === b));
  controls.animateTo({ distance: { body: 5, hands: 0.75, face: 0.9 }[state.focus] }, 0.6);
}));
$('play').onclick = () => { state.paused = !state.paused; updatePlayBtn(); };
function updatePlayBtn() { $('play').textContent = state.paused ? '▶' : '❚❚'; $('play').setAttribute('aria-label', state.paused ? 'Play' : 'Pause'); }
$('panelToggle').onclick = () => { const p = $('panel'); p.classList.toggle('open'); $('panelToggle').setAttribute('aria-expanded', p.classList.contains('open')); };
$('fileInput').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { const def = JSON.parse(await f.text()); loadCharacter(new E.Character(def)); const o = document.createElement('option'); o.textContent = def.name || f.name; o.value = 'file'; $('modelSelect').appendChild(o); $('modelSelect').value = 'file'; }
  catch (err) { $('modelMeta').textContent = 'Could not load that file: ' + err.message; }
};
$('modelSelect').onchange = (e) => { if (e.target.value === 'cowboy') loadCharacter(createCowboy()); if (e.target.value === 'studio' && handoff) loadCharacter(new E.Character(handoff)); };
function exportMsg(ok, name) { $('exportMsg').textContent = ok ? `Saved ${name}` : 'Downloads are blocked here. Open the viewer from the repository to export.'; }
$('exportGLB').onclick = () => { const bytes = E.exportGLB(character); exportMsg(E.download(character.name.toLowerCase() + '.glb', bytes, 'model/gltf-binary'), character.name.toLowerCase() + '.glb (' + (bytes.length / 1024).toFixed(0) + ' KB)'); };
$('exportJSON').onclick = () => exportMsg(E.download(character.name.toLowerCase() + '.json', JSON.stringify(character.toJSON()), 'application/json'), character.name.toLowerCase() + '.json');
$('shot').onclick = () => canvas.toBlob((b) => exportMsg(E.download('shapeforge.png', b, 'image/png'), 'shapeforge.png'));

// timeline scrubbing
const track = $('track');
let scrubbing = false;
const scrub = (e) => {
  const a = character.mixer.dominant(); if (!a) return;
  const r = track.getBoundingClientRect(), f = E.clamp((e.clientX - r.left) / r.width, 0, 1);
  // keep sync group members aligned
  for (const b of character.mixer.actions.values()) if (b === a || (b.weight > 0 && b.clip.syncGroup && b.clip.syncGroup === a.clip.syncGroup)) b.time = f * b.clip.duration;
  state.paused = true; updatePlayBtn();
};
track.addEventListener('pointerdown', (e) => { scrubbing = true; track.setPointerCapture(e.pointerId); scrub(e); });
track.addEventListener('pointermove', (e) => scrubbing && scrub(e));
track.addEventListener('pointerup', () => (scrubbing = false));

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
  const k = e.key.toLowerCase();
  state.keys.add(k);
  if (/^[1-9]$/.test(k) && clipNames[+k - 1] && state.mode !== 'play') playClip(clipNames[+k - 1]);
  if (k === ' ') { e.preventDefault(); state.paused = !state.paused; updatePlayBtn(); }
  if (k === 'c' && state.mode === 'play') state.crawl = !state.crawl;
  if (state.paused && (k === 'arrowright' || k === 'arrowleft') && state.mode !== 'play') {
    const a = character.mixer.dominant(); if (a) { a.time = ((a.time + (k === 'arrowright' ? 1 : -1) / 30) % a.clip.duration + a.clip.duration) % a.clip.duration; }
  }
});
window.addEventListener('keyup', (e) => state.keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => state.keys.clear());

// ------------------------------------------------------------------ simulation
function updateRoam(dt) {
  const v = character.mixer.rootVelocity();
  const speed = v[2];
  const R = 5.5;
  state.yaw += (speed / R) * dt;
  const f = [Math.sin(state.yaw), 0, Math.cos(state.yaw)];
  character.position[0] += f[0] * speed * dt; character.position[2] += f[2] * speed * dt;
  character.setEuler(0, state.yaw * 180 / Math.PI, 0);
}
function updatePlay(dt) {
  const k = state.keys;
  let ix = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
  let iz = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
  const moving = ix || iz;
  const run = k.has('shift');
  const target = !moving ? 0 : state.crawl ? 1 : run ? 3 : 1.15;
  state.moveSpeed += (target - state.moveSpeed) * Math.min(1, dt * 4);
  if (moving) {
    // camera-relative direction
    const fwd = E.vec3.normalize([0, 0, 0], [camera.target[0] - camera.position[0], 0, camera.target[2] - camera.position[2]]);
    const right = [-fwd[2], 0, fwd[0]];
    const dir = [fwd[0] * iz + right[0] * ix, 0, fwd[2] * iz + right[2] * ix];
    const want = Math.atan2(dir[0], dir[2]);
    let d = want - state.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    state.yaw += d * Math.min(1, dt * (state.crawl ? 3 : 8));
  }
  // blend tree: idle / walk / run by speed, or crawl
  const s = state.moveSpeed;
  let w;
  if (state.crawl) w = { Crawl: 1 };
  else if (s < 1.15) w = { Idle: Math.max(0, 1 - s / 1.15), Walk: Math.min(1, s / 1.15) };
  else w = { Walk: Math.max(0, 1 - (s - 1.15) / 1.85), Run: Math.min(1, (s - 1.15) / 1.85) };
  character.mixer.setWeights(w, state.crawl ? 0.6 : 0.25);
  if (state.crawl && !moving) character.mixer.timeScale = 0; // hold the crawl pose when stopped
  const v = character.mixer.rootVelocity()[2];
  const f = [Math.sin(state.yaw), 0, Math.cos(state.yaw)];
  character.position[0] += f[0] * v * dt; character.position[2] += f[2] * v * dt;
  character.setEuler(0, state.yaw * 180 / Math.PI, 0);
}

// ------------------------------------------------------------------ HUD / timeline
let fps = 60, hudT = 0;
function updateHUD(dt) {
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  const a = character.mixer.dominant();
  if (a) {
    $('clipName').textContent = a.clip.name;
    const f = a.time / a.clip.duration;
    $('fill').style.width = (f * 100).toFixed(2) + '%';
    $('head').style.left = `calc(${(f * 100).toFixed(2)}% - 1px)`;
    $('time').textContent = `${a.time.toFixed(2)} / ${a.clip.duration.toFixed(2)} s`;
    if ($('marks').dataset.clip !== a.clip.name) {
      $('marks').dataset.clip = a.clip.name;
      $('marks').innerHTML = a.clip.events.map((e) => `<span class="${e.side || ''}" style="left:${(e.t / a.clip.duration) * 100}%" title="${e.name} ${e.side || ''}"></span>`).join('');
    }
  }
  document.querySelectorAll('.clip').forEach((b) => {
    const act = character.mixer.action(b.dataset.clip);
    b.querySelector('.w').style.width = ((act?.weight || 0) * 100).toFixed(1) + '%';
    b.classList.toggle('on', act === a);
  });
  hudT += dt; if (hudT < 0.25) return; hudT = 0;
  const v = character.mixer.rootVelocity()[2] * (state.mode === 'inplace' ? 0 : 1);
  $('hud').innerHTML = `<b>${fps.toFixed(0)}</b> fps<br>draws <b>${renderer.stats.drawCalls}</b><br>tris <b>${Math.round(renderer.stats.triangles).toLocaleString()}</b><br>speed <b>${v.toFixed(2)}</b> m/s` + (state.mode === 'play' ? `<br>stance <b>${state.crawl ? 'crawl' : 'upright'}</b>` : '');
}

// ------------------------------------------------------------------ frame
// Characters handed over from the Studio ("Open in Viewer")
let handoff = null;
try { handoff = JSON.parse(localStorage.getItem('shapeforge.handoff') || 'null'); } catch { handoff = null; }
if (handoff) { const o = document.createElement('option'); o.value = 'studio'; o.textContent = 'From Studio: ' + (handoff.name || 'Character'); $('modelSelect').appendChild(o); }
if (handoff && location.hash === '#studio') { loadCharacter(new E.Character(handoff)); $('modelSelect').value = 'studio'; }
else loadCharacter(createCowboy());
setMode('roam');
let last = performance.now();
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  const sdt = state.paused ? 0 : dt * state.speed;
  character.mixer.timeScale = 1;
  if (state.mode === 'roam') updateRoam(sdt);
  else if (state.mode === 'play') updatePlay(sdt);
  else { character.position.set([0, 0, 0]); character.setEuler(0, state.turntable ? (now / 1000) * 25 : 0, 0); }
  if (state.turntable && state.mode !== 'inplace') controls.rotate(dt * 0.35, 0);
  character.update(sdt);
  if (state.paused) character.mixer.update(0);
  particles.update(dt);
  // camera follows the hips
  const hips = E.vec3.transformMat4([0, 0, 0], character.skeleton.worldHead(Math.max(0, character.skeleton.boneIndex('hips'))), character.world);
  let tgt = [hips[0], Math.max(0.55, hips[1] * 0.85 + 0.15), hips[2]];
  const fb = state.focus === 'hands' ? 'hand.R' : state.focus === 'face' ? 'head' : null;
  if (fb && character.skeleton.boneIndex(fb) >= 0) {
    const sk = character.skeleton, i = sk.boneIndex(fb);
    tgt = E.vec3.transformMat4([0, 0, 0], E.vec3.lerp([0, 0, 0], sk.worldHead(i), sk.worldTail(i), 0.6), character.world);
  }
  if (state.follow !== false) E.vec3.lerp(controls.target, controls.target, tgt, Math.min(1, dt * 5));
  controls.update(dt); controls.apply();
  scene.environment.shadowCenter = [hips[0], 1, hips[2]]; scene.environment.shadowRadius = 7;
  const lines = [];
  if (state.skeleton) lines.push({ data: E.skeletonLines(character.skeleton, character.world), depthTest: false });
  const ghosts = [];
  if (state.onion) {
    const a = character.mixer.dominant();
    if (a) for (const [dtG, col] of [[-0.12, [1, 0.45, 0.25, 0.9]], [0.12, [0.35, 0.8, 1, 0.9]]]) {
      const t = ((a.time + dtG * a.clip.duration) % a.clip.duration + a.clip.duration) % a.clip.duration;
      ghosts.push({ meshes: character.parts.flatMap((p) => p.meshes), joints: ghost.joints(a.clip, t), color: col });
    }
  }
  renderer.render(scene, camera, { shading: state.toon ? 'toon' : 'rendered', shadows: state.shadows, wireOverlay: state.wire, lines, ghosts, particles, background: 'sky' });
  updateHUD(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__viewer = { character, scene, camera, controls, renderer, state, setMode, playClip: (n) => playClip(n) };
