// Ray Tracing: a small gallery at golden hour, path traced on the GPU. Polished floor,
// chrome, gold and copper spheres, a glass window, a neon sign and a lantern light each
// other with real bounced light. Split view shows the real-time renderer on the left.
import * as E from '../src/engine/index.js';
import { createCowboy } from '../src/content/cowboy.js';

const $ = (id) => document.getElementById(id);
let renderer, pt;
try { renderer = new E.Renderer($('stage'), { preserveDrawingBuffer: false }); pt = new E.PathTracer(renderer, { maxBounces: 4 }); }
catch (e) { $('fatal').hidden = false; $('fatal').textContent = 'The path tracer needs WebGL2 with float render targets. ' + e.message; throw e; }

const scene = new E.Scene(), env = scene.environment;
env.shadowRadius = 9; env.shadowCenter = [0, 1, 0]; env.fogDensity = 0.004; env.volumetric = 0.3;
const camera = new E.Camera(); camera.fov = 42 * E.DEG; camera.position.set([4.6, 2.1, 6.4]); camera.target.set([0, 1.1, 0]);
const controls = new E.OrbitControls(camera, $('stage'), { leftButtonOrbit: true }); controls.minDistance = 2; controls.maxDistance = 25;

// ---------------------------------------------------------------- the gallery
const M = (o) => new E.Material(o);
const palette = E.archPalette();
scene.add(new E.Mesh(E.plane({ width: 80, depth: 80 }), M({ name: 'Sand', color: '#b8906a', pattern: 'dirt', patternScale: 1, patternColor: '#80613f', roughness: 1 })));
const kit = new E.Kit(palette);
const floorMat = M({ name: 'Polished floor', color: '#3a2a1f', pattern: 'checker', patternScale: 1, patternColor: '#d8cdb8', roughness: 0.12, patternStrength: 1 });
kit.span(floorMat, [-4, 0, -3], [4, 0.12, 3]);
E.wall(kit, { x0: -4, x1: 4, y0: 0.12, y1: 3.6, z: -3, mat: palette.stucco, openings: [{ x: 1.8, y: 0.9, w: 1.6, h: 1.6, kind: 'window' }] });
E.wall(kit, { x0: -3, x1: 3, y0: 0.12, y1: 3.6, z: 0, mat: palette.brick, rotY: 90, origin: [-4, 0, 0] });
kit.span(palette.darkWood, [-4.1, 3.6, -3.1], [4.1, 3.8, 0.4]); // half roof: sun comes in low from the side
for (const x of [-3.8, 3.8]) kit.box(palette.darkWood, [x, 1.86, 2.8], [0.16, 3.5, 0.16]);
const neonMat = M({ name: 'Neon', color: '#ff5a8a', emissive: '#ff3a78', emissiveStrength: 6 });
E.lettering(kit, 'SALOON', [-0.6, 2.9, -2.9], 0.34, 0, neonMat);
E.lantern(kit, [2.6, 2.4, 1.2]);
scene.add(kit.toNode('Gallery'));
const sphere = (r, pos, mat) => { const m = new E.Mesh(E.sphere({ radius: r, widthSegments: 48, heightSegments: 24 }), mat); m.position.set(pos); scene.add(m); return m; };
sphere(0.45, [-2.2, 0.57, -0.8], M({ name: 'Chrome', color: '#e8e8ea', metallic: 1, roughness: 0.03 }));
sphere(0.35, [-1.3, 0.47, 0.6], M({ name: 'Gold', color: '#ffc658', metallic: 1, roughness: 0.18 }));
sphere(0.3, [2.1, 0.42, -0.4], M({ name: 'Copper', color: '#e08a5a', metallic: 1, roughness: 0.38 }));
sphere(0.28, [1.4, 0.4, 1.1], M({ name: 'Red plastic', color: '#b0241c', roughness: 0.25 }));
const plinth = new E.Mesh(E.box({ width: 0.9, height: 0.6, depth: 0.9, bevel: 0.03 }), M({ name: 'Marble', color: '#e9e4dc', roughness: 0.2, pattern: 'stucco', patternScale: 3, patternColor: '#b8b2a6' }));
plinth.position.set([2.6, 0.42, -1.9]); scene.add(plinth);
sphere(0.25, [2.6, 0.97, -1.9], M({ name: 'Glow orb', color: '#9fd8ff', emissive: '#6fc4ff', emissiveStrength: 4 }));
const cowboy = createCowboy(); cowboy.position.set([0.2, 0.12, 0]); cowboy.setEuler(0, 20, 0); cowboy.springs = false; scene.add(cowboy);
const lamps = []; scene.traverse((n) => n.isLight && lamps.push(n));

// ---------------------------------------------------------------- state
const state = { mode: 'pt', hours: 17.8, dirty: true };
function pose() { const [name, t] = $('pose').value.split('@'); cowboy.mixer.stop(); cowboy.mixer.play(name, { fade: 0 }); cowboy.mixer.setTime(name, +t); cowboy.updateWorld(null); cowboy.mixer.evaluate(); state.dirty = true; }
pose();
function lighting() {
  E.applyTimeOfDay(env, state.hours);
  const n = E.smoothstep(0.1, 0.7, env.night + (state.hours > 18.5 || state.hours < 6.5 ? 0.35 : 0));
  E.setNightLights(palette, n);
  for (const l of lamps) l.intensity = $('tLamp').checked ? (l.userData.interior ? 0 : 10 + 4 * n) : 0;
  neonMat.emissiveStrength = $('tNeon').checked ? 6 : 0;
  state.dirty = true;
}
const bind = (id, fmt, fn) => { const el = $(id), out = $(id + 'Out'); const f = () => { fn(+el.value); if (out) out.textContent = fmt(+el.value); }; el.oninput = f; f(); };
const hhmm = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
bind('tod', hhmm, (v) => { state.hours = v; lighting(); });
bind('bounces', (v) => v, (v) => { pt.maxBounces = v; pt.reset(); });
bind('aperture', (v) => v.toFixed(3), (v) => { pt.aperture = v; pt.reset(); });
bind('focus', (v) => v.toFixed(1) + ' m', (v) => { pt.focus = v; pt.reset(); });
$('pose').onchange = pose;
for (const id of ['tLamp', 'tNeon']) $(id).onchange = lighting;
$('tDenoise').onchange = (e) => (pt.denoise = e.target.checked);
$('tHalf').onchange = (e) => { pt.scale = e.target.checked ? 0.5 : 1; pt.reset(); };
const modeBtns = [...document.querySelectorAll('[data-mode]')];
const setMode = (m) => { state.mode = m; modeBtns.forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === m)); $('splitLine').hidden = m !== 'split'; pt.reset(); };
modeBtns.forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
setMode(new URLSearchParams(location.search).get('mode') || 'pt');

// ---------------------------------------------------------------- loop
let last = performance.now(), hudT = 0, spsT = [0, 0];
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  controls.update(dt);
  if (state.dirty) { pt.build(scene); state.dirty = false; }
  if (state.mode === 'raster') renderer.render(scene, camera, { background: 'sky' });
  else {
    if (state.mode === 'split') renderer.render(scene, camera, { background: 'sky' });
    pt.render(scene, camera, { samplesPerFrame: 1, split: state.mode === 'split' ? 0.5 : 0 });
  }
  hudT += dt;
  if (hudT > 0.3) {
    const S = pt.stats; spsT = [S.samples, now];
    $('stats').innerHTML = state.mode === 'raster' ? `real-time<br>draws <b>${renderer.stats.drawCalls}</b><br>tris <b>${Math.round(renderer.stats.triangles).toLocaleString()}</b>`
      : `samples <b>${S.samples}</b> / px<br>triangles <b>${S.triangles.toLocaleString()}</b><br>BVH nodes <b>${S.nodes.toLocaleString()}</b><br>BVH build <b>${S.buildMs.toFixed(0)}</b> ms<br>lights <b>${S.lights}</b> + sun + sky<div class="meter"><i style="width:${Math.min(100, (S.samples / 256) * 100)}%"></i></div>`;
    hudT = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__rt = { scene, camera, renderer, pt, state, setMode, cowboy };
