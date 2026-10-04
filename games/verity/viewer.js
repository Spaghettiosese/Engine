// Model & animation viewer for the Verity cast: every character on a turntable with all of
// their animations. Built on the engine's Character, Mixer and OrbitControls.
import * as E from '../../src/engine/index.js';
import { CAST, person, makeVeritySphere, grinner } from './cast.js';
import { HUMAN_CLIP_NAMES } from './people.js';

const $ = (id) => document.getElementById(id);
let renderer;
try { renderer = await E.createRenderer($('stage'), { backend: 'webgl2' }); } catch (e) { $('fatal').hidden = false; $('fatal').textContent = 'The viewer needs WebGL2. ' + e.message; throw e; }
renderer.settings.vignette = 0.35; renderer.settings.bloomStrength = 0.15;

const scene = new E.Scene();
const env = scene.environment;
E.applyTimeOfDay(env, 15.5);
env.shadowRadius = 5; env.sunIntensity = 2.6; env.fogDensity = 0.004; env.clouds = false; env.exposure = 1.05;
const floor = new E.Mesh(E.plane({ width: 40, depth: 40 }), new E.Material({ name: 'Studio floor', color: '#3a3430', roughness: 0.7, pattern: 'planks', patternScale: 4, patternColor: '#1a1511' }), 'Floor');
floor.castShadow = false; scene.add(floor);
const disc = new E.Mesh(E.cylinder({ radiusTop: 1.05, radiusBottom: 1.1, height: 0.05, radialSegments: 48 }), new E.Material({ color: '#201c19', roughness: 0.5, metallic: 0.2 }), 'Plinth');
disc.position.set([0, 0.025, 0]); scene.add(disc);
const rim = new E.Light('point', { color: '#ffd8a0', intensity: 5, range: 9 }); rim.position.set([-2.4, 2.6, -2.6]); scene.add(rim);
const fill = new E.Light('point', { color: '#a0b8ff', intensity: 3, range: 9 }); fill.position.set([2.6, 1.8, 2.2]); scene.add(fill);

const camera = new E.Camera(); camera.fov = 38 * E.DEG;
const controls = new E.OrbitControls(camera, renderer.canvas, { leftButtonOrbit: true });
controls.yaw = 0.5; controls.pitch = 0.12;

const ROSTER = [
  ...['harry', 'eric', 'ericSad', 'ericBackpack', 'mom', 'dad', 'priya', 'delgado', 'gus', 'tyler', 'dale'].map((k) => ({ id: k, name: CAST[k].name, bio: CAST[k].bio, make: () => person(k, { detail: 1.15 }), kind: 'human' })),
  { id: 'student', name: 'Student', bio: 'A random student. Click again for a different one.', make: () => person('student', { seed: Math.floor(Math.random() * 60), detail: 1 }), kind: 'human' },
  { id: 'verity', name: 'Verity', bio: 'Your personal assistant! She only tells the truth! :)', make: () => makeVeritySphere(0.5), kind: 'sphere' },
  { id: 'grinner', name: 'VERITY (true form)', bio: 'What she becomes when she is hungry. She eats secrets.', make: () => grinner(), kind: 'monster' },
];
const FACES = ['happy', 'wink', 'surprised', 'sad', 'grin', 'glitch', 'crack', 'off'];
let idx = 0, model = null, clipNames = [], clip = 0, faceI = 0, height = 1.7;

function buildRoster() {
  $('roster').innerHTML = ROSTER.map((r, i) => `<button class="btn" data-i="${i}" aria-pressed="false">${r.name}</button>`).join('');
  $('roster').querySelectorAll('button').forEach((b) => (b.onclick = () => select(+b.dataset.i)));
}
function select(i) {
  idx = (i + ROSTER.length) % ROSTER.length;
  if (model) scene.remove(model);
  const r = ROSTER[idx];
  model = r.make();
  scene.add(model);
  if (r.kind === 'sphere') { model.position.set([0, 1.3, 0]); height = 1.7; }
  else { model.position.set([0, 0.05, 0]); height = (model.userData.spec?.height) || 2.5; }
  $('name').textContent = r.name; $('bio').textContent = r.bio;
  [...$('roster').children].forEach((b, k) => b.setAttribute('aria-pressed', k === idx));
  clipNames = r.kind === 'human' ? HUMAN_CLIP_NAMES.filter((n) => model.mixer.clips.has(n)) : r.kind === 'monster' ? [...model.mixer.clips.keys()] : ['Float', 'Spin', 'Talk', 'Glitch', 'Stare'];
  $('clips').innerHTML = clipNames.map((n, k) => `<button class="btn" data-k="${k}" aria-pressed="false">${k < 9 ? k + 1 + ' · ' : ''}${n}</button>`).join('') + (r.kind === 'sphere' ? FACES.map((f, k) => `<button class="btn" data-f="${k}">${f}</button>`).join('') : '');
  $('clips').querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => play(+b.dataset.k)));
  $('clips').querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { faceI = +b.dataset.f; model.userData.setFace(FACES[faceI]); }));
  play(0);
  const d = Math.max(2.4, height * 2.2);
  controls.distance = d; controls.target.set([0, height * 0.5, 0]); controls.apply();
}
function play(k) {
  clip = k;
  [...$('clips').querySelectorAll('[data-k]')].forEach((b) => b.setAttribute('aria-pressed', +b.dataset.k === k));
  if (model.mixer) model.play(clipNames[k], { fade: 0.35 });
}
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') select(idx + 1); else if (e.key === 'ArrowLeft') select(idx - 1);
  else if (/^[1-9]$/.test(e.key) && +e.key <= clipNames.length) play(+e.key - 1);
  else if (e.key === ' ') { $('tSpin').checked = !$('tSpin').checked; e.preventDefault(); }
  else if (e.key === '[') $('spd').value = Math.max(0, +$('spd').value - 0.25), $('spd').oninput();
  else if (e.key === ']') $('spd').value = Math.min(2, +$('spd').value + 0.25), $('spd').oninput();
});
$('spd').oninput = () => { $('spdOut').textContent = (+$('spd').value).toFixed(2) + '×'; };

buildRoster();
select(0);
const q = new URLSearchParams(location.search);
if (q.get('c')) { const i = ROSTER.findIndex((r) => r.id === q.get('c')); if (i >= 0) select(i); }
if (q.get('clip') && model.mixer) { const k = clipNames.indexOf(q.get('clip')); if (k >= 0) play(k); }
if (q.get('spin') === '0') $('tSpin').checked = false;
if (q.get('yaw')) { controls.yaw = +q.get('yaw'); controls.apply(); }
if (q.get('dist')) { controls.distance = +q.get('dist'); controls.apply(); }
if (q.get('ty')) { controls.target.set([0, +q.get('ty'), 0]); controls.apply(); }

let last = performance.now(), t = 0, fps = 60;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
  const spd = +$('spd').value;
  if ($('tSpin').checked) model.rotation && (model.setEuler ? (model.userData.spin = (model.userData.spin || 0) + dt * 18, model.setEuler(0, model.userData.spin, 0)) : 0);
  const r = ROSTER[idx];
  if (model.mixer) { model.update(dt * spd); }
  else {
    const c = clipNames[clip];
    const ball = model.children[0];
    model.position[1] = 1.3 + (c === 'Stare' ? 0 : Math.sin(t * 1.3) * 0.08);
    if (c === 'Spin') ball.setEuler(0, 90 + t * 240 * spd, 0); else ball.setEuler(0, 90, 0);
    const k = c === 'Talk' ? 1 + Math.abs(Math.sin(t * 11)) * 0.05 : 1; ball.scale.set([k, k, k]);
    if (c === 'Glitch') { model.userData.setFace(Math.random() < 0.08 ? 'glitch' : FACES[faceI]); model.position[0] = Math.random() < 0.1 ? (Math.random() - 0.5) * 0.3 : 0; } else model.position[0] = 0;
  }
  void r;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  $('stats').innerHTML = `<b>${fps.toFixed(0)}</b> fps<br>${model.triangleCount ? 'tris <b>' + Math.round(model.triangleCount).toLocaleString() + '</b>' : ''}`;
  env.shadowCenter = [0, 1, 0];
  renderer.render(scene, camera, { background: 'sky' });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__v = { select, play, controls, camera, renderer, scene, get model() { return model; } };
