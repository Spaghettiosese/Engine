// Lighting Lab: every procedural material pattern on a sphere, lit by orbiting point lights,
// a sweeping spot light, lights you drop by clicking, and the V2 post stack (SSAO, bloom,
// height fog, light shafts) with live toggles. The pebble field is one InstancedMesh.
import * as E from '../src/engine/index.js';
import { createCowboy } from '../src/content/cowboy.js';

const $ = (id) => document.getElementById(id);
let renderer;
try { renderer = new E.Renderer($('stage')); } catch (e) { $('fatal').hidden = false; $('fatal').textContent = 'The Lighting Lab needs WebGL2. ' + e.message; throw e; }

const scene = new E.Scene();
const env = scene.environment;
env.shadowRadius = 11; env.shadowCenter = [0, 1, -1]; env.fogDensity = 0.01; env.fogHeight = 0.3;
const camera = new E.Camera(); camera.fov = 45 * E.DEG; camera.position.set([1, 4.2, 10.5]); camera.target.set([-1.6, 1, -2]);
const controls = new E.OrbitControls(camera, $('stage'), { leftButtonOrbit: true });
controls.minDistance = 3; controls.maxDistance = 40;

// ---------------------------------------------------------------- stage
const M = (o) => new E.Material(o);
const floor = new E.Mesh(E.plane({ width: 40, depth: 40 }), M({ name: 'Floor', color: '#8a8278', pattern: 'stucco', patternScale: 1, patternColor: '#5e574f', roughness: 0.85 }), 'Floor');
scene.add(floor);
const wallMat = M({ name: 'Brick', color: '#8e4a36', pattern: 'brick', patternScale: 13, patternColor: '#cfc3b0', roughness: 0.9 });
const back = new E.Mesh(E.box({ width: 22, height: 6, depth: 0.5 }), wallMat, 'Back wall'); back.position.set([0, 3, -7]); scene.add(back);
for (const s of [-1, 1]) { // arches of columns either side
  for (let i = 0; i < 4; i++) {
    const c = new E.Mesh(E.cylinder({ radiusTop: 0.22, radiusBottom: 0.26, height: 4, radialSegments: 20 }), M({ name: 'Stone', color: '#c9bca8', pattern: 'stucco', patternScale: 1.5, roughness: 0.7 }), 'Column');
    c.position.set([s * 8.5, 2, -5.5 + i * 3]); scene.add(c);
  }
  const beam = new E.Mesh(E.box({ width: 0.7, height: 0.5, depth: 10, bevel: 0.05 }), M({ name: 'Beam', color: '#6a4a30', pattern: 'wood', patternScale: 2 }), 'Beam');
  beam.position.set([s * 8.5, 4.25, -1]); scene.add(beam);
}

// one sphere per material pattern, in a gentle arc
const LOOK = {
  none: { color: '#d8d2c8', roughness: 0.35 }, fabric: { color: '#46628a' }, denim: { color: '#34507a', patternColor: '#c9d4e8' },
  leather: { color: '#6b3d22', roughness: 0.55 }, metal: { color: '#b8b4ae', metallic: 1, roughness: 0.28 }, wood: { color: '#8a5a32' },
  skin: { color: '#c89478', sheen: 0.3 }, plaid: { color: '#8e2a22', patternColor: '#1d2a3a' }, stripes: { color: '#e6dccb', patternColor: '#8e2a22' },
  checker: { color: '#e8e2d8', patternColor: '#26211d' }, dirt: { color: '#7a6048' }, felt: { color: '#2f5a3a', sheen: 0.6 }, hair: { color: '#3a2618' },
  eye: { color: '#f2eee8', patternColor: '#3e6a8a', roughness: 0.15 }, walnut: { color: '#5a3620', roughness: 0.4 }, planks: { color: '#9a7048' },
  brick: { color: '#8e4a36', patternColor: '#cfc3b0' }, shingles: { color: '#5a4a40' }, stucco: { color: '#d8c8a8' },
  glass: { color: '#9ec0c8', roughness: 0.08, emissive: '#ffb266', emissiveStrength: 0.4 }, corrugated: { color: '#9aa0a4', metallic: 0.8, roughness: 0.4 },
};
const sphereGeo = E.sphere({ radius: 0.42, widthSegments: 40, heightSegments: 20 });
const pedGeo = E.cylinder({ radiusTop: 0.3, radiusBottom: 0.36, height: 0.5, radialSegments: 24 });
const pedMat = M({ name: 'Pedestal', color: '#3b3632', roughness: 0.5, metallic: 0.2 });
E.PATTERNS.forEach((pat, i) => {
  const row = Math.floor(i / 7), col = i % 7;
  const x = (col - 3) * 1.45 + (row % 2) * 0.35, z = -2.6 - row * 1.35, a = 0;
  const ped = new E.Mesh(pedGeo, pedMat, 'Pedestal'); ped.position.set([x, 0.25 + row * 0.175, z]); ped.scale.set([1, 1 + row * 0.7, 1]); scene.add(ped);
  const s = new E.Mesh(sphereGeo, M({ name: pat, pattern: pat, patternScale: pat === 'eye' ? 1 : 4, ...LOOK[pat] }), pat);
  s.position.set([x, 0.95 + row * 0.35, z]); scene.add(s);
});

// the Cowboy in the middle, so there is a skinned character to light
const cowboy = createCowboy(); cowboy.position.set([0, 0, 0.8]); cowboy.play('Idle', { fade: 0 }); scene.add(cowboy);

// 600 pebbles in a single instanced draw call
const pebbles = new E.InstancedMesh(E.sphere({ radius: 1, widthSegments: 10, heightSegments: 6 }), M({ name: 'Pebble', color: '#77706a', roughness: 0.8 }), 600, 'Pebbles');
{
  let s = 11; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < pebbles.count; i++) {
    const a = rnd() * Math.PI * 2, r = 7 + rnd() * 9, k = 0.05 + rnd() ** 3 * 0.25;
    pebbles.setTransformAt(i, [Math.cos(a) * r, k * 0.3, Math.sin(a) * r + 1], [rnd() * 360, rnd() * 360, 0], [k * 1.3, k * 0.6, k]);
  }
}
scene.add(pebbles);

// ---------------------------------------------------------------- lights
const bulbGeo = E.sphere({ radius: 0.08, widthSegments: 12, heightSegments: 8 });
function makeLight(color, opts = {}) {
  const l = new E.Light(opts.type || 'point', { color, intensity: 8, range: 7, ...opts });
  const bulb = new E.Mesh(bulbGeo, M({ name: 'Bulb', color, emissive: color, emissiveStrength: 6 }), 'Bulb');
  bulb.castShadow = false; bulb.pickable = false; l.add(bulb);
  return l;
}
const orbiters = ['#ff5a3a', '#3aa0ff', '#55ff88', '#ffcc55'].map((c, i) => { const l = makeLight(c); l.userData.phase = (i / 4) * Math.PI * 2; scene.add(l); return l; });
const spot = new E.Light('spot', { color: '#fff2da', intensity: 30, range: 16, angle: 22 });
const housing = new E.Mesh(E.cone({ radius: 0.2, height: 0.35, radialSegments: 16 }), M({ name: 'Housing', color: '#222', metallic: 0.8, roughness: 0.4 }), 'Housing');
housing.position.set([0, 0.1, 0]); spot.add(housing); spot.position.set([0, 5.5, -1]); scene.add(spot);
const placed = [];
const PALETTE = ['#ff8a3a', '#5ad0ff', '#c07aff', '#ff4a6a', '#9aff5a', '#ffe07a'];

// click the floor (without dragging) to drop a light
const cv = $('stage');
let down = null;
cv.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
cv.addEventListener('pointerup', (e) => {
  if (!down || e.button !== 0 || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
  const r = cv.getBoundingClientRect(), nx = ((e.clientX - r.left) / r.width) * 2 - 1, ny = 1 - ((e.clientY - r.top) / r.height) * 2;
  const f = E.vec3.normalize([0, 0, 0], E.vec3.sub([0, 0, 0], camera.target, camera.position));
  const rt = E.vec3.normalize([0, 0, 0], E.vec3.cross([0, 0, 0], f, [0, 1, 0])), up = E.vec3.cross([0, 0, 0], rt, f);
  const t = Math.tan(camera.fov / 2), asp = r.width / r.height;
  const d = [0, 1, 2].map((k) => f[k] + rt[k] * nx * t * asp + up[k] * ny * t);
  if (d[1] >= -1e-3) return;
  const s = -camera.position[1] / d[1], hit = [camera.position[0] + d[0] * s, 0.6, camera.position[2] + d[2] * s];
  if (Math.hypot(hit[0], hit[2]) > 18) return;
  if (placed.length >= 10) scene.remove(placed.shift());
  const l = makeLight(PALETTE[(placed.length + placed.total) % PALETTE.length || 0], { intensity: 6, range: 5, flicker: 0.4 });
  placed.total = (placed.total || 0) + 1;
  l.position.set(hit); scene.add(l); placed.push(l);
});

// ---------------------------------------------------------------- UI
const state = { hours: 20.4, lint: 1, orbit: true, sweep: true, shadows: true };
const bind = (id, fmt, fn) => { const el = $(id), out = $(id + 'Out'); const f = () => { fn(+el.value); out.textContent = fmt(+el.value); }; el.oninput = f; f(); };
const hhmm = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
bind('tod', hhmm, (v) => (state.hours = v));
bind('exp', (v) => v.toFixed(2), (v) => (renderer.settings.exposure = v));
bind('bloom', (v) => v.toFixed(2), (v) => (renderer.settings.bloomStrength = v));
bind('fog', (v) => v.toFixed(2), (v) => (env.fogHeight = v));
bind('lint', (v) => v.toFixed(2) + '×', (v) => (state.lint = v));
const tog = (id, fn) => { const el = $(id); el.onchange = () => fn(el.checked); fn(el.checked); };
tog('tAO', (v) => (renderer.settings.ssao = v));
tog('tRays', (v) => (renderer.settings.godRays = v));
tog('tShadows', (v) => (state.shadows = v));
tog('tBloom', (v) => (renderer.settings.bloom = v));
tog('tOrbit', (v) => { state.orbit = v; for (const l of orbiters) l.visible = v; });
tog('tSpot', (v) => { state.sweep = v; spot.visible = v; });
$('clear').onclick = () => { for (const l of placed) scene.remove(l); placed.length = 0; };
const setTime = (h) => { state.hours = h; $('tod').value = h; $('todOut').textContent = hhmm(h); };
$('night').onclick = () => setTime(21.5);
$('day').onclick = () => setTime(16.8);

// ---------------------------------------------------------------- loop
let last = performance.now(), fps = 60, hudT = 0, time = 0;
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; time += dt;
  E.applyTimeOfDay(env, state.hours);
  const dark = E.smoothstep(0.05, 0.6, env.night + (state.hours > 18.5 || state.hours < 6.5 ? 0.3 : 0));
  const power = state.lint * (0.35 + 0.65 * dark);
  orbiters.forEach((l, i) => {
    const a = time * 0.5 + l.userData.phase;
    l.position.set([Math.cos(a) * 3.2, 1.3 + Math.sin(time * 1.3 + i) * 0.6, Math.sin(a) * 2.4 + 0.8]);
    l.intensity = state.orbit ? 8 * power : 0;
  });
  spot.setEuler(Math.sin(time * 0.6) * 35, 0, Math.cos(time * 0.43) * 30);
  spot.intensity = state.sweep ? 30 * power : 0;
  for (const l of placed) l.intensity = 6 * power;
  cowboy.update(dt);
  controls.update(dt);
  renderer.render(scene, camera, { background: 'sky', shadows: state.shadows });
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05; hudT += dt;
  if (hudT > 0.25) {
    hudT = 0;
    const S = renderer.stats, n = orbiters.length * state.orbit + state.sweep + placed.length;
    $('stats').innerHTML = `<b>${fps.toFixed(0)}</b> fps<br>draws <b>${S.drawCalls}</b> · culled <b>${S.culled}</b><br>tris <b>${Math.round(S.triangles).toLocaleString()}</b><br>local lights <b>${n}</b> / 16<br>pebbles <b>600</b> in 1 draw`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__lab = { scene, camera, renderer, state, controls, placed };
