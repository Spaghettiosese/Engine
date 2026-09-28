// Architect: the architecture kit's building() generator with every parameter on a
// control. Each change rebuilds the building from scratch; the kit merges its geometry
// per material, so a whole two-storey saloon is only a couple of dozen draw calls.
import * as E from '../src/engine/index.js';

const $ = (id) => document.getElementById(id);
let renderer;
try { renderer = new E.Renderer($('stage')); } catch (e) { $('fatal').hidden = false; $('fatal').textContent = 'Architect needs WebGL2. ' + e.message; throw e; }

const scene = new E.Scene();
const env = scene.environment;
env.fogDensity = 0.0025; env.fogHeight = 0.2; env.shadowRadius = 14; env.shadowCenter = [0, 3, -4];
const camera = new E.Camera(); camera.fov = 42 * E.DEG; camera.far = 300;
camera.position.set([13, 7, 16]); camera.target.set([-1.5, 3, -4]);
const controls = new E.OrbitControls(camera, $('stage'), { leftButtonOrbit: true });
controls.minDistance = 4; controls.maxDistance = 70;

const palette = E.archPalette();
// the street: dirt ground and a lamp post in front of the lot
const ground = new E.Mesh(E.plane({ width: 160, depth: 160 }), new E.Material({ name: 'Street', color: '#b08a62', pattern: 'dirt', patternScale: 1, patternColor: '#7c5d40', roughness: 1 }), 'Street');
scene.add(ground);
const props = new E.Kit(palette);
E.lampPost(props, [5.5, 0, 5]);
E.barrel(props, [-5.8, 0, 3.2]); E.crate(props, [-6.6, 0, 4.1], 0.7, 20); E.crate(props, [-6.4, 0.7, 4], 0.55, -10);
const propsNode = props.toNode('Props'); scene.add(propsNode);
const lamps = []; propsNode.traverse((n) => n.isLight && lamps.push(n));

// ---------------------------------------------------------------- parameters
const P = { ...E.BUILDING_DEFAULTS, width: 9, depth: 11, sign: 'SALOON', door: 'batwing', seed: 3, facade: 'stepped' };
const FIELDS = ['width', 'depth', 'floors', 'floorHeight', 'windows', 'porchDepth'];
const SELECTS = ['siding', 'roof', 'facade', 'door'];
const CHECKS = ['porch', 'balcony', 'shutters', 'chimney', 'lanterns'];
const SIGNS = ['SALOON', 'HOTEL', 'BANK', 'GENERAL STORE', 'SHERIFF', 'BARBER', 'ASSAY OFFICE', 'LIVERY', 'POST OFFICE', 'GUNSMITH', 'BAKERY', 'TELEGRAPH', ''];
let lots = 1, built = null, buildMs = 0, dirty = true;

function sync() {
  for (const k of FIELDS) { $(k).value = P[k]; $(k).nextElementSibling.textContent = (+P[k]).toFixed(k === 'floorHeight' || k === 'porchDepth' ? 1 : k === 'width' || k === 'depth' ? 1 : 0); }
  for (const k of SELECTS) $(k).value = P[k];
  for (const k of CHECKS) $(k).checked = !!P[k];
  $('sign').value = P.sign;
  $('facade').disabled = P.roof !== 'falseFront';
}
for (const k of FIELDS) $(k).oninput = (e) => { P[k] = +e.target.value; sync(); dirty = true; };
for (const k of SELECTS) $(k).onchange = (e) => { P[k] = e.target.value; sync(); dirty = true; };
for (const k of CHECKS) $(k).onchange = (e) => { P[k] = e.target.checked; dirty = true; };
$('sign').oninput = (e) => { P.sign = e.target.value.toUpperCase().replace(/[^A-Z18&. ]/g, ''); dirty = true; };
$('lots').oninput = (e) => { lots = +e.target.value; $('lots').nextElementSibling.textContent = lots; dirty = true; };
$('lots').nextElementSibling.textContent = lots;
let hours = 17.2;
const hhmm = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
$('tod').oninput = (e) => { hours = +e.target.value; $('tod').nextElementSibling.textContent = hhmm(hours); };
$('tod').nextElementSibling.textContent = hhmm(hours);

let rs = 1;
const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
function randomize(seed = Date.now() % 100000) {
  rs = seed || 1;
  Object.assign(P, {
    width: 6 + Math.round(rnd() * 12) / 2, depth: 8 + Math.round(rnd() * 12) / 2, floors: 1 + Math.floor(rnd() * 2.6), floorHeight: 3 + Math.round(rnd() * 8) / 10,
    windows: 2 + Math.floor(rnd() * 3), porchDepth: 1.8 + Math.round(rnd() * 12) / 10,
    siding: pick(['siding', 'paint', 'paintRed', 'paintCream', 'brick', 'stucco', 'siding']), roof: pick(['falseFront', 'falseFront', 'gable', 'hip', 'flat']),
    facade: pick(['stepped', 'curved', 'square']), door: pick(['door', 'door', 'batwing']), sign: pick(SIGNS),
    porch: rnd() > 0.2, balcony: rnd() > 0.4, shutters: rnd() > 0.5, chimney: rnd() > 0.6, lanterns: rnd() > 0.25, seed: Math.floor(rnd() * 999),
  });
  sync(); dirty = true;
}
$('rand').onclick = () => randomize();
$('obj').onclick = () => {
  const meshes = []; built?.traverse((n) => n.geometry && meshes.push(n));
  E.download('building.obj', E.exportOBJ(meshes), 'text/plain');
};

// ---------------------------------------------------------------- build
function rebuild() {
  const t0 = performance.now();
  if (built) scene.remove(built);
  built = new E.Node('Street');
  // the lot you are editing sits in the middle; extra lots are seeded variations on both sides
  const order = [0, -1, 1, -2, 2].slice(0, lots);
  let saved = rs;
  for (const slot of order) {
    let o = P;
    if (slot !== 0) {
      rs = 1000 + slot * 77 + P.seed;
      o = { ...P, seed: P.seed + slot * 31, width: E.clamp(P.width + (rnd() - 0.5) * 4, 5, 14), floors: E.clamp(P.floors + Math.round(rnd() * 2 - 1), 1, 3), siding: pick(['siding', 'paint', 'paintRed', 'paintCream', 'brick']), roof: pick(['falseFront', 'gable', 'falseFront', 'hip']), facade: pick(['stepped', 'curved', 'square']), sign: pick(SIGNS) };
    }
    const node = E.building(new E.Kit(palette), o).toNode(slot === 0 ? 'Building' : 'Neighbour');
    node.position.set([slot * 14.5, 0, 0]);
    built.add(node);
  }
  rs = saved;
  // several lots: collapse the whole street to one mesh per material (lights are kept)
  if (lots > 1) built = E.batchStatic(built, 'Street (batched)');
  scene.add(built);
  buildMs = performance.now() - t0;
  dirty = false;
}

// ---------------------------------------------------------------- loop
sync();
let last = performance.now(), fps = 60, hudT = 0;
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  if (dirty) rebuild();
  E.applyTimeOfDay(env, hours);
  const n = E.smoothstep(0.1, 0.7, env.night + (hours > 18.5 || hours < 6.5 ? 0.35 : 0));
  E.setNightLights(palette, n);
  built.traverse((x) => { if (x.isLight) x.intensity = (x.userData.interior ? 5 : 12) * n; });
  for (const l of lamps) l.intensity = 14 * n;
  controls.update(dt);
  renderer.render(scene, camera, { background: 'sky', shadows: true });
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05; hudT += dt;
  if (hudT > 0.25) {
    hudT = 0;
    let meshes = 0, tris = 0; built.traverse((x) => { if (x.geometry) { meshes++; tris += x.geometry.indices.length / 3; } });
    const S = renderer.stats;
    $('stats').innerHTML = `<b>${fps.toFixed(0)}</b> fps<br>built in <b>${buildMs.toFixed(1)}</b> ms<br>meshes <b>${meshes}</b>${lots > 1 ? ' (batched)' : ''}<br>building tris <b>${Math.round(tris).toLocaleString()}</b><br>frame draws <b>${S.drawCalls}</b>`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__arch = { scene, camera, renderer, P, randomize, rebuild: () => (dirty = true), setLots: (v) => { lots = v; $('lots').value = v; $('lots').nextElementSibling.textContent = v; dirty = true; }, setHours: (h) => { hours = h; $('tod').value = h; $('tod').nextElementSibling.textContent = hhmm(h); } };
