// Asset Workshop: design guns, tools and buildings with the V5 generators, try their
// moving parts, see them in the sheriff's hands, and export them (with their animations)
// as .glb. The design lives in the URL, so a link reproduces it.
import * as E from '../src/engine/index.js';
import { makeGun, GUN_KINDS, GUN_DEFAULTS, GUN_FINISHES, WOODS } from '../src/content/armory.js';
import { makeTool, TOOL_KINDS, TOOL_DEFAULTS } from '../src/content/tools.js';
import { createCowboy } from '../src/content/cowboy.js';

const $ = (id) => document.getElementById(id);
let renderer;
try { renderer = await E.createRenderer($('stage')); } catch (e) { $('fatal').hidden = false; $('fatal').textContent = 'The Workshop needs WebGPU or WebGL2. ' + e.message; throw e; }
window.__r = renderer;

// ------------------------------------------------------------------ what can be designed
const titleCase = (s) => s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
const CATS = {
  guns: {
    kinds: GUN_KINDS, label: { revolver: 'Revolver', lever: 'Lever-action carbine', bolt: 'Bolt-action rifle', shotgun: 'Double-barrel shotgun' },
    defaults: (k) => ({ ...GUN_DEFAULTS[k] }),
    fields: (k) => [
      { key: 'barrel', label: 'Barrel', min: k === 'revolver' ? 0.07 : 0.35, max: k === 'revolver' ? 0.2 : 0.85, step: 0.01, fmt: (v) => (v * 100).toFixed(0) + ' cm' },
      { key: 'finish', options: GUN_FINISHES.filter((f) => f !== 'brass') }, { key: 'frame', options: GUN_FINISHES }, { key: 'wood', options: Object.keys(WOODS) },
      ...(k === 'bolt' ? [{ key: 'scope', bool: true }] : []),
      ...(k === 'shotgun' ? [{ key: 'stock', options: ['straight', 'pistol'] }, { key: 'hammers', bool: true }] : []),
      { key: 'engraved', bool: true },
    ],
    make: (k, p) => makeGun(k, p),
  },
  tools: {
    kinds: TOOL_KINDS, label: {},
    defaults: () => ({ ...TOOL_DEFAULTS }),
    fields: () => [
      { key: 'size', min: 0.6, max: 1.5, step: 0.05, fmt: (v) => '×' + v.toFixed(2) }, { key: 'handle', label: 'Handle', min: 0.6, max: 1.6, step: 0.05, fmt: (v) => '×' + v.toFixed(2) },
      { key: 'wood', options: ['ash', 'hickory', 'walnut', 'painted'] }, { key: 'metal', options: ['steel', 'rusty', 'black', 'brass', 'tin'] }, { key: 'wear', min: 0, max: 1, step: 0.05, fmt: (v) => (v * 100).toFixed(0) + '%' },
    ],
    make: (k, p) => makeTool(k, p),
  },
  buildings: {
    kinds: E.BUILDING_USES, label: { house: 'House', saloon: 'Saloon', store: 'General store', sheriff: "Sheriff's office", hotel: 'Hotel' },
    defaults: (k) => ({ width: k === 'saloon' ? 10 : 8, depth: 10, floors: k === 'house' ? 1 : 2, roof: k === 'house' ? 'gable' : 'falseFront', facade: 'stepped', siding: { saloon: 'paintCream', store: 'siding', sheriff: 'brick', hotel: 'paint', house: 'siding' }[k], porch: true, balcony: k !== 'house', windows: 3, door: k === 'saloon' ? 'batwing' : 'door', shutters: k === 'house' || k === 'hotel', chimney: k === 'house', sign: { saloon: 'SALOON', store: 'GENERAL STORE', sheriff: 'SHERIFF', hotel: 'HOTEL', house: '' }[k], interior: true, seed: 1 }),
    fields: () => [
      { key: 'width', min: 5, max: 14, step: 0.5, fmt: (v) => v + ' m' }, { key: 'depth', min: 6, max: 16, step: 0.5, fmt: (v) => v + ' m' }, { key: 'floors', min: 1, max: 3, step: 1, fmt: (v) => v },
      { key: 'windows', min: 1, max: 5, step: 1, fmt: (v) => v }, { key: 'roof', options: E.ROOF_STYLES }, { key: 'facade', options: ['stepped', 'curved', 'flat'] },
      { key: 'siding', options: ['siding', 'paint', 'paintRed', 'paintCream', 'brick', 'stucco', 'stone'] }, { key: 'door', options: ['door', 'batwing'] },
      { key: 'sign', text: true }, { key: 'porch', bool: true }, { key: 'balcony', bool: true }, { key: 'shutters', bool: true }, { key: 'chimney', bool: true }, { key: 'interior', bool: true },
      { key: 'seed', min: 1, max: 50, step: 1, fmt: (v) => v },
    ],
    make: (k, p) => { const palette = E.archPalette(); const kit = E.building(new E.Kit(palette, { openable: true }), { ...p, use: k, openable: true }); const n = kit.toNode(CATS.buildings.label[k]); n.userData.palette = palette; return n; },
  },
};

// ------------------------------------------------------------------ scene
const scene = new E.Scene(), env = scene.environment, camera = new E.Camera();
env.shadowRadius = 4;
scene.add(new E.Mesh(E.plane({ width: 80, depth: 80 }), new E.Material({ name: 'Floor', color: '#9c7b5a', pattern: 'dirt', patternScale: 1, roughness: 0.95 })));
const bench = new E.Node('Bench');
{ const k = new E.Kit(E.archPalette()); E.table(k, [0, 0, 0], { w: 1.6, d: 0.8, h: 0.86 }); bench.add(k.toNode('Workbench')); }
scene.add(bench);
const controls = new E.OrbitControls(camera, renderer.canvas, { leftButtonOrbit: true });
const cowboy = createCowboy(); cowboy.play('Idle'); cowboy.position.set([0, 0, 0.9]);
const particles = new E.Particles(1500); particles.gravity = -1.2;
const flash = new E.Light('point', { color: '#ffc27a', intensity: 0, range: 6 }); scene.add(flash);
let flashT = 0;

const state = { cat: 'guns', kind: 'revolver', params: {}, hand: false, hold: '', night: false };
let item = null, handler = null, busy = false;
// designs live in the URL hash: #cat=guns&kind=lever&barrel=0.6...
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('cat') && CATS[h.get('cat')]) state.cat = h.get('cat');
  const C = CATS[state.cat];
  state.kind = C.kinds.includes(h.get('kind')) ? h.get('kind') : C.kinds[0];
  state.params = C.defaults(state.kind);
  for (const f of C.fields(state.kind)) if (h.has(f.key)) { const v = h.get(f.key); state.params[f.key] = f.bool ? v === '1' : f.options || f.text ? v : +v; }
  state.hand = h.get('hand') === '1'; state.night = h.get('night') === '1';
}
function writeHash() {
  const h = new URLSearchParams({ cat: state.cat, kind: state.kind });
  for (const f of CATS[state.cat].fields(state.kind)) { const v = state.params[f.key]; h.set(f.key, f.bool ? (v ? '1' : '0') : String(v)); }
  if (state.hand) h.set('hand', '1'); if (state.night) h.set('night', '1');
  history.replaceState(null, '', '#' + h);
}

// ------------------------------------------------------------------ UI
function buildParams() {
  const C = CATS[state.cat], box = $('params');
  box.innerHTML = '';
  for (const f of C.fields(state.kind)) {
    const id = 'p_' + f.key, label = f.label || titleCase(f.key);
    let el;
    if (f.bool) {
      el = document.createElement('label'); el.style.cssText = 'display:flex;gap:6px;align-items:center;font-size:13px;color:var(--ink-2)';
      el.innerHTML = `<input type="checkbox" id="${id}"> ${label}`;
      el.querySelector('input').checked = !!state.params[f.key];
      el.querySelector('input').onchange = (e) => { state.params[f.key] = e.target.checked; rebuild(); };
    } else if (f.options || f.text) {
      el = document.createElement('div'); el.className = 'sel';
      el.innerHTML = `<label for="${id}">${label}</label>` + (f.text ? `<input type="text" id="${id}" maxlength="16">` : `<select id="${id}">${f.options.map((o) => `<option value="${o}">${titleCase(o)}</option>`).join('')}</select>`);
      const inp = el.querySelector(f.text ? 'input' : 'select'); inp.value = state.params[f.key] ?? '';
      inp.onchange = inp.oninput = (e) => { state.params[f.key] = f.text ? e.target.value.toUpperCase().replace(/[^A-Z0-9 &.]/g, '') : e.target.value; rebuild(); };
    } else {
      el = document.createElement('div'); el.className = 'row';
      el.innerHTML = `<label for="${id}">${label}</label><input type="range" id="${id}" min="${f.min}" max="${f.max}" step="${f.step}"><output></output>`;
      const inp = el.querySelector('input'), out = el.querySelector('output');
      inp.value = state.params[f.key]; out.textContent = f.fmt(+inp.value);
      inp.oninput = (e) => { state.params[f.key] = +e.target.value; out.textContent = f.fmt(+e.target.value); rebuild(); };
    }
    box.appendChild(el);
  }
}
function buildKinds() {
  const C = CATS[state.cat];
  $('kind').innerHTML = C.kinds.map((k) => `<option value="${k}">${C.label[k] || titleCase(k)}</option>`).join('');
  $('kind').value = state.kind;
  document.querySelectorAll('#cats .btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === state.cat)));
}
document.querySelectorAll('#cats .btn').forEach((b) => (b.onclick = () => { state.cat = b.dataset.cat; state.kind = CATS[state.cat].kinds[0]; state.params = CATS[state.cat].defaults(state.kind); buildKinds(); buildParams(); rebuild(true); }));
$('kind').onchange = (e) => { state.kind = e.target.value; state.params = CATS[state.cat].defaults(state.kind); buildParams(); rebuild(true); };
$('reset').onclick = () => { state.params = CATS[state.cat].defaults(state.kind); buildParams(); rebuild(); };
$('random').onclick = () => {
  const C = CATS[state.cat], r = Math.random;
  for (const f of C.fields(state.kind)) {
    if (f.text) continue;
    state.params[f.key] = f.bool ? r() < 0.5 : f.options ? f.options[Math.floor(r() * f.options.length)] : +(f.min + Math.round((r() * (f.max - f.min)) / f.step) * f.step).toFixed(3);
  }
  buildParams(); rebuild();
};
$('tHand').onchange = (e) => { state.hand = e.target.checked; rebuild(true); };
$('tNight').onchange = (e) => { state.night = e.target.checked; writeHash(); };
$('hold').onchange = (e) => { if (handler) handler.setHold(e.target.value); };

function status(msg) { $('status').textContent = msg; }
const act = (label, fn, primary = false) => { const b = document.createElement('button'); b.className = 'btn' + (primary ? ' primary' : ''); b.textContent = label; b.onclick = fn; $('acts').appendChild(b); return b; };

// muzzle flash, smoke and dust
function muzzleFlash(gun) {
  const p = gun.socketWorld('muzzle'); if (!p) return;
  flash.position.set(p); flashT = 0.06;
  const dir = E.vec3.normalize([0, 0, 0], E.vec3.transformDir([0, 0, 0], [0, 0, 1], gun.world));
  particles.emit(p, { count: 16, color: [3, 2.2, 1.2, 0.9], colorEnd: [0.3, 0.3, 0.3, 0.1], size: 0.03, grow: 3, spread: 0.3, up: 0.2, life: 0.25, vel: dir.map((v) => v * 2.5) });
  particles.emit(p, { count: 10, color: [0.6, 0.58, 0.55, 0.35], colorEnd: [0.7, 0.7, 0.7, 0], size: 0.05, grow: 6, spread: 0.15, up: 0.25, life: 1.6, vel: dir.map((v) => v * 0.8) });
}
function dust(p, n = 18) { particles.emit(p, { count: n, color: [0.55, 0.43, 0.32, 0.6], colorEnd: [0.6, 0.5, 0.4, 0], size: 0.05, grow: 4, spread: 0.8, up: 0.8, life: 1.2 }); }

function buildActions() {
  $('acts').innerHTML = ''; $('ammo').hidden = true;
  const holds = [];
  if (!item) return;
  if (state.cat === 'guns') {
    const g = item;
    const shoot = async () => {
      if (busy) return;
      const fired = await g.fire();
      if (fired) { muzzleFlash(g); if (handler) handler.play(g.twoHanded ? 'recoilRifle' : 'recoilPistol'); }
      status(fired ? 'Bang.' : 'Click. Empty.');
    };
    g.handlers.shot = () => {};
    act('Fire', shoot, true);
    act('Cock', () => g.cock());
    act('Reload', async () => {
      if (busy) return; busy = true; status('Reloading...');
      const p = g.reload();
      if (handler) await handler.during(g.twoHanded ? 'reloadRifle' : 'reloadPistol', p); else await p;
      busy = false; status('Loaded: ' + g.ammo() + ' / ' + g.state.capacity);
    });
    $('ammo').hidden = false;
    holds.push(...(g.twoHanded ? ['rifleReady', 'rifleAim'] : ['pistolReady', 'pistolAim']));
  } else if (state.cat === 'tools') {
    const t = item;
    const a = E.defaultAction(t);
    act(titleCase(a), () => { if (handler) handler.play(a, { onEvent: (e) => e.point && e.name !== 'toss' && dust(e.point) }); else status('Hold it to use it.'); }, true);
    for (const c of t.clips.keys()) act(c, () => t.play(c));
    if (t.toggle) act('Light', () => t.toggle());
    if (t.setWick) act('Wick', () => t.setWick(t.state.wick > 0.5 ? 0.3 : 1));
    holds.push(E.defaultHold(t));
    if (t.twoHanded) holds.push('toolRest');
  } else {
    const o = item.userData.openings || [];
    act('Open doors', () => o.forEach((x) => x.kind !== 'shutter' && x.open()), true);
    act('Close doors', () => o.forEach((x) => x.kind !== 'shutter' && x.close()));
    if (o.some((x) => x.kind === 'shutter')) act('Shutters', () => o.forEach((x) => x.kind === 'shutter' && x.toggle()));
    act('Look inside', () => { const p = state.params; controls.target.set([0, 1.4, -p.depth / 2]); controls.distance = Math.max(p.width, p.depth) * 0.45; controls.pitch = 0.5; });
  }
  $('holdRow').hidden = !(state.hand && holds.length);
  $('hold').innerHTML = holds.map((h) => `<option value="${h}">${titleCase(h.replace(/^(pistol|rifle|tool|shovel|knife)/, ''))}</option>`).join('');
  if (handler) $('hold').value = handler.hold;
}

// ------------------------------------------------------------------ build and frame
function frame(n, keepView) {
  n.updateWorld(null);
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], p = [0, 0, 0];
  n.traverse((m) => { if (!m.geometry || !m.visible) return; const g = m.geometry; for (let i = 0; i < g.vertexCount; i += 7) { E.vec3.transformMat4(p, [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]], m.world); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); } } });
  const size = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  if (!keepView) { controls.target.set([(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2]); controls.distance = state.cat === 'buildings' ? size * 1.7 + 0.3 : size * 1.05 + 0.25; controls.pitch = state.cat === 'buildings' ? 0.28 : 0.35; }
  env.shadowRadius = Math.max(1.5, size * 0.9); env.shadowCenter = [(mn[0] + mx[0]) / 2, 0, (mn[2] + mx[2]) / 2];
  return { mn, mx, size };
}
let spin = 0;
function rebuild(reframe = false) {
  if (item) { if (handler) { cowboy.unequip('R'); handler = null; } if (item.parent) item.parent.remove(item); }
  if (cowboy.parent) scene.remove(cowboy);
  const C = CATS[state.cat];
  item = C.make(state.kind, state.params);
  const building = state.cat === 'buildings';
  bench.visible = !building && !state.hand;
  $('lHand').hidden = building;
  if (state.hand && !building) {
    scene.add(cowboy);
    handler = cowboy.equip(item, state.cat === 'guns' ? { hold: item.twoHanded ? 'rifleAim' : 'pistolAim' } : {});
    for (let i = 0; i < 10; i++) cowboy.update(1 / 30);
    if (reframe) { controls.target.set([0, 1.25, 1.1]); controls.distance = 2.6; controls.pitch = 0.18; controls.yaw = -1.0; }
    env.shadowRadius = 2.5; env.shadowCenter = [0, 0, 0.9];
  } else {
    scene.add(item);
    if (!building) {
      // lay it on the workbench, long axis across the bench
      const long = state.cat === 'guns' ? 'z' : 'y';
      // lie flat: the thin axis (X) points up, the long axis runs along the bench
      if (state.kind === 'lantern' || state.kind === 'bucket') item.setEuler(0, 0, 0);
      else if (long === 'y') E.quat.setAxisAngle(item.rotation, [Math.SQRT1_2, Math.SQRT1_2, 0], Math.PI);
      else E.quat.setAxisAngle(item.rotation, [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)], (2 * Math.PI) / 3);
      item.updateWorld(null);
      const f = frame(item, true); item.position.set([-(f.mn[0] + f.mx[0]) / 2, 0.88 - f.mn[1] + 0.005, -(f.mn[2] + f.mx[2]) / 2]);
    }
    frame(item, !reframe && !!rebuild.done);
  }
  $('tHand').checked = state.hand; $('tNight').checked = state.night;
  buildActions(); writeHash();
  rebuild.done = true;
  let tris = 0, parts = item.rig ? item.rig.parts.size : (item.userData.rig ? item.userData.rig.parts.size : 0), meshes = 0;
  item.traverse((m) => { if (m.geometry) { tris += m.geometry.indices.length / 3; meshes++; } });
  state.info = { tris, parts, meshes };
}

// ------------------------------------------------------------------ export
$('export').onclick = async () => {
  if (!item || busy) return;
  busy = true; status('Recording animations...');
  try {
    // export a fresh copy so the preview keeps its state
    const C = CATS[state.cat], copy = C.make(state.kind, state.params), anims = [];
    if (state.cat === 'guns') {
      anims.push(await E.recordAnimation(copy, 'Cock', () => copy.cock()));
      anims.push(await E.recordAnimation(copy, 'Fire', () => copy.fire()));
      while (copy.ammo() > 0) { const p = copy.fire(); for (let i = 0; i < 40; i++) { copy.update(1 / 30); await 0; } await p; }
      anims.push(await E.recordAnimation(copy, 'Reload', () => copy.reload()));
    } else if (state.cat === 'tools') {
      for (const name of copy.clips.keys()) anims.push(await E.recordAnimation(copy, name, () => copy.play(name)));
    } else {
      const o = copy.userData.openings || [], rig = copy.userData.rig;
      const upd = (dt) => rig && rig.update(dt);
      if (o.length) {
        anims.push(await E.recordAnimation(copy, 'Open', () => { o.forEach((x) => x.kind !== 'shutter' && !x.swing && x.open()); return new Promise((r) => setTimeout(r, 0)); }, { update: upd, maxTime: 2.5 }));
        anims.push(await E.recordAnimation(copy, 'Close', () => { o.forEach((x) => x.kind !== 'shutter' && !x.swing && x.close()); return Promise.resolve(); }, { update: upd, maxTime: 2.5 }));
      }
    }
    const glb = E.exportSceneGLB(copy, { animations: anims });
    const name = (CATS[state.cat].label[state.kind] || state.kind).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    E.download(name + '.glb', glb, 'model/gltf-binary');
    status(`Exported ${name}.glb · ${(glb.length / 1024).toFixed(0)} KB · ${anims.length} animation${anims.length === 1 ? '' : 's'}`);
  } catch (e) { status('Export failed: ' + e.message); console.error(e); }
  busy = false;
};
$('copy').onclick = async () => { writeHash(); try { await navigator.clipboard.writeText(location.href); status('Link copied.'); } catch { status('Copy the address bar to share this design.'); } };

// ------------------------------------------------------------------ loop
readHash(); buildKinds(); buildParams(); rebuild(true);
let hudT = 0;
E.runLoop((dt) => {
  E.applyTimeOfDay(env, state.night ? 22 : 15.5);
  if (state.cat === 'buildings' && item.userData.palette) E.setNightLights(item.userData.palette, state.night ? 1 : 0);
  if (state.cat === 'buildings') item.traverse((n) => { if (n.isLight) n.intensity = state.night ? 6 : 0; });
  if ($('tSpin').checked && !state.hand && state.cat !== 'buildings') { spin += dt * 0.25; controls.yaw = spin; } else spin = controls.yaw;
  if (state.hand) cowboy.update(dt); else if (item.update) item.update(dt);
  if (item.userData.rig) item.userData.rig.update(dt);
  flashT -= dt; flash.intensity = flashT > 0 ? 40 : 0;
  particles.update(dt);
  controls.update(dt); controls.apply();
  renderer.render(scene, camera, { background: 'sky', particles });
  hudT += dt;
  if (hudT > 0.25) {
    hudT = 0;
    const S = renderer.stats, I = state.info || {};
    $('stats').innerHTML = `${renderer.backend === 'webgpu' ? 'WebGPU' : 'WebGL2'}<br>triangles <b>${(I.tris || 0).toLocaleString()}</b><br>meshes <b>${I.meshes || 0}</b> · moving parts <b>${I.parts || 0}</b><br>draws <b>${S.drawCalls}</b>`;
    if (state.cat === 'guns' && item.ammo) {
      const cap = item.state.capacity, n = item.ammo();
      $('ammo').innerHTML = Array.from({ length: cap }, (_, i) => `<i class="${i < n ? '' : 'empty'}"></i>`).join('');
    }
  }
});
window.__ws = { state, get item() { return item; }, get handler() { return handler; }, rebuild, cowboy, controls, camera };
