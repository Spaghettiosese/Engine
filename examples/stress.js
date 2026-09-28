// Stress test: tens of thousands of instances and thousands of repeated props, drawn with
// GPU frustum culling (WebGPU) and automatic instancing (both backends).
import * as E from '../src/engine/index.js';

const $ = (id) => document.getElementById(id);
let renderer;
try { renderer = await E.createRenderer($('stage')); } catch (e) { $('fatal').hidden = false; $('fatal').textContent = 'Needs WebGPU or WebGL2. ' + e.message; throw e; }
const gpu = renderer.backend === 'webgpu';
$('swap').href = '?backend=' + (gpu ? 'webgl2' : 'webgpu');
$('swap').textContent = gpu ? 'Switch to WebGL2' : 'Switch to WebGPU';
if (!gpu) { $('tCull').disabled = true; $('tCull').parentElement.title = 'GPU culling needs WebGPU'; }

const scene = new E.Scene(), env = scene.environment, camera = new E.Camera();
E.applyTimeOfDay(env, 16.2);
env.shadowRadius = 22; env.fogDensity = 0.004;
camera.far = 900;
const SIZE = 420;
scene.add(new E.Mesh(E.plane({ width: SIZE * 2, depth: SIZE * 2 }), new E.Material({ color: '#b58c63', pattern: 'dirt', patternScale: 1 })));

// instanced vegetation and rocks
const rockGeo = E.superquadric({ rx: 0.9, ry: 0.55, rz: 0.75, e1: 0.7, e2: 0.8, widthSegments: 14, heightSegments: 8 });
const cactusGeo = E.Geometry.merge([
  E.capsule({ radius: 0.28, length: 2.6, radialSegments: 10, capSegments: 4 }).applyMatrix(E.mat4.fromRTS(E.mat4.create(), E.quat.create(), [0, 1.6, 0], [1, 1, 1])),
  E.capsule({ radius: 0.18, length: 0.9, radialSegments: 8, capSegments: 3 }).applyMatrix(E.mat4.fromRTS(E.mat4.create(), E.quat.fromEuler(E.quat.create(), 0, 0, 90), [0.55, 1.5, 0], [1, 1, 1])),
  E.capsule({ radius: 0.16, length: 0.8, radialSegments: 8, capSegments: 3 }).applyMatrix(E.mat4.fromRTS(E.mat4.create(), E.quat.create(), [0.95, 2.0, 0], [1, 1, 1])),
]);
const rockMat = new E.Material({ name: 'Rock', color: '#8c7058', roughness: 0.9, pattern: 'stucco', patternColor: '#5e4a3a', patternScale: 2 });
const cactusMat = new E.Material({ name: 'Cactus', color: '#4f6b3a', roughness: 0.7, pattern: 'stripes', patternColor: '#3b5230', patternScale: 14 });
let rocks, cacti;
function scatter(n) {
  if (rocks) { scene.remove(rocks); scene.remove(cacti); }
  const nr = Math.round(n * 0.7), nc = n - nr;
  rocks = new E.InstancedMesh(rockGeo, rockMat, nr, 'Rocks'); cacti = new E.InstancedMesh(cactusGeo, cactusMat, nc, 'Cacti');
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const place = (im, count, sMin, sMax) => { for (let i = 0; i < count; i++) { const s = sMin + rnd() * (sMax - sMin); im.setTransformAt(i, [(rnd() * 2 - 1) * SIZE, 0, (rnd() * 2 - 1) * SIZE], [0, rnd() * 360, 0], [s, s * (0.7 + rnd() * 0.6), s]); } };
  place(rocks, nr, 0.3, 1.6); place(cacti, nc, 0.6, 1.3);
  scene.add(rocks); scene.add(cacti);
  $('nInst').textContent = n.toLocaleString(); $('densityOut').textContent = (n / 1000).toFixed(0) + 'k';
}
scatter(40000);
$('density').oninput = (e) => scatter(+e.target.value);

// 2,000 separate props sharing two geometries: auto-instancing turns them into a few draws
const crateGeo = E.box({ width: 0.8, height: 0.8, depth: 0.8, bevel: 0.03 }), barrelGeo = E.cylinder({ radiusTop: 0.36, radiusBottom: 0.36, height: 1, radialSegments: 16 });
const crateMat = new E.Material({ name: 'Crate', color: '#8a5d34', pattern: 'planks', patternColor: '#3d2814', patternScale: 5 });
const barrelMat = new E.Material({ name: 'Barrel', color: '#6e4526', pattern: 'wood', patternColor: '#3a2412', patternScale: 3 });
const props = new E.Node('Props');
for (let i = 0; i < 2000; i++) {
  const a = (i / 2000) * Math.PI * 2 * 7, r = 12 + i * 0.09;
  const m = new E.Mesh(i % 3 ? crateGeo : barrelGeo, i % 3 ? crateMat : barrelMat);
  m.position.set([Math.cos(a) * r, i % 3 ? 0.4 : 0.5, Math.sin(a) * r]); m.setEuler(0, (i * 37) % 360, 0);
  props.add(m);
}
scene.add(props);

$('tCull').onchange = (e) => (renderer.settings.gpuCulling = e.target.checked);
$('tAuto').onchange = (e) => (renderer.settings.autoInstancing = e.target.checked);
let t = 0, fps = 60, hudT = 0, survivors = null;
const controls = new E.OrbitControls(camera, renderer.canvas, { leftButtonOrbit: true });
controls.distance = 40; controls.pitch = 0.3;
E.runLoop((dt) => {
  t += dt;
  if ($('tFly').checked) {
    const r = 60 + 30 * Math.sin(t * 0.07);
    camera.position.set([Math.cos(t * 0.05) * r, 9 + 4 * Math.sin(t * 0.11), Math.sin(t * 0.05) * r]);
    camera.target.set([Math.cos(t * 0.05 + 0.6) * r * 0.6, 1.5, Math.sin(t * 0.05 + 0.6) * r * 0.6]);
  } else controls.update(dt);
  env.shadowCenter = [camera.target[0], 0, camera.target[2]];
  renderer.render(scene, camera, { background: 'sky', shadows: $('tShadows').checked });
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05; hudT += dt;
  if (hudT > 0.5) {
    hudT = 0;
    if (gpu && renderer.settings.gpuCulling) Promise.all([renderer.readCulledCount(rocks), renderer.readCulledCount(cacti)]).then(([a, b]) => { survivors = a == null || b == null ? null : a + b; });
    else survivors = null;
    const S = renderer.stats, total = rocks.count + cacti.count;
    $('stats').innerHTML = `<b>${fps.toFixed(0)}</b> fps · ${gpu ? 'WebGPU' : 'WebGL2'}<br>draws <b>${S.drawCalls}</b> · merged <b>${S.batched}</b><br>tris <b>${(S.triangles / 1e6).toFixed(2)}M</b> submitted<br>instances <b>${survivors == null ? total.toLocaleString() : survivors.toLocaleString() + ' / ' + total.toLocaleString()}</b>${survivors == null ? '' : ' after GPU culling'}<br>cpu <b>${S.cpuMs.toFixed(1)}</b> ms/frame`;
  }
});
window.__stress = { renderer, scene, camera, get survivors() { return survivors; }, get rocks() { return rocks; }, get cacti() { return cacti; } };
