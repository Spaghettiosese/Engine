// V5 checks: mechanisms, guns (ammo, reloads, events), tools, openable buildings, prop
// handling (grips reach), ECS pickups/inventory/doors, prop GLB export with animations,
// automatic instancing and the WGSL sources.
import * as E from '../src/engine/index.js';
import { createCowboy } from '../src/content/cowboy.js';
import { makeGun, GUN_KINDS } from '../src/content/armory.js';
import { makeTool, TOOL_KINDS } from '../src/content/tools.js';
import * as W from '../src/engine/wgsl.js';
const results = [];
const check = (name, ok, info = '') => results.push([name, ok, info]);
const run = async (prop, promise, max = 900) => { let done = false; promise.then(() => (done = true)); for (let i = 0; i < max && !done; i++) { prop.update(1 / 60); await 0; } return promise; };

{ // a spring hinge settles on its target; a clip drives parts exactly and fires its events on time
  const n = new E.Node('door'), rig = new E.Rig();
  rig.add('door', n, { axis: [0, 1, 0], min: 0, max: 100 });
  rig.set('door', 90);
  for (let i = 0; i < 90; i++) rig.update(1 / 60);
  const settled = rig.get('door').value;
  const ev = [];
  rig.play(E.MechClip.sequence('Shut', [{ set: { door: 30 }, duration: 0.5, event: 'half' }, { set: { door: 0 }, duration: 0.25, event: 'shut' }]), { onEvent: (e) => ev.push(e.name + '@' + e.t.toFixed(2)) });
  for (let i = 0; i < 60; i++) rig.update(1 / 60);
  check('mechanisms', Math.abs(settled - 90) < 0.5 && rig.get('door').value === 0 && ev.join() === 'half@0.50,shut@0.75' && !rig.playing, `spring door settles at ${settled.toFixed(1)}°, clip events ${ev.join(' ')}`);
}
{ // every gun fires until empty, clicks dry, reloads to capacity through its own events
  const out = [];
  let ok = true;
  for (const k of GUN_KINDS) {
    const g = makeGun(k), ev = new Set();
    g.onEvent = (e) => ev.add(e.name);
    let shots = 0, dry = 0;
    for (let i = 0; i < 24; i++) { if (await run(g, g.fire())) shots++; else dry++; for (let j = 0; j < 20; j++) g.update(1 / 60); }
    await run(g, g.reload()); for (let j = 0; j < 20; j++) g.update(1 / 60);
    const after = g.ammo();
    const need = { revolver: ['shot', 'dryfire', 'eject', 'load'], lever: ['shot', 'chamber', 'feedIn'], bolt: ['shot', 'eject', 'chamber', 'loadMag'], shotgun: ['shot', 'eject', 'load'] }[k];
    const good = shots === g.state.capacity && dry > 0 && after >= g.state.capacity - 1 && need.every((n) => ev.has(n));
    ok &&= good;
    out.push(`${k} ${shots}/${g.state.capacity} then reload to ${after}`);
  }
  check('guns: fire, run dry, reload', ok, out.join('; '));
}
{ // every tool builds, has a grip, and its moving parts work
  const knife = makeTool('knife'); const before = knife.rig.get('blade').value;
  await run(knife, knife.play('Open'));
  const lantern = makeTool('lantern'); lantern.update(1 / 60); const lit = lantern.lamp.intensity;
  lantern.toggle(false); lantern.update(1 / 60);
  const all = TOOL_KINDS.map((k) => makeTool(k)).filter((t) => t.grip && t.children.length);
  check('tools', all.length === TOOL_KINDS.length && before === 175 && knife.rig.get('blade').value === 0 && lit > 0 && lantern.lamp.intensity === 0, `${all.length} kinds; knife opens 175° → 0°; lantern ${lit.toFixed(1)} → off`);
}
{ // openable buildings: every door and shutter is on the rig; furnished interiors add geometry
  const counts = {}; let tris0 = 0, tris1 = 0;
  for (const use of E.BUILDING_USES) {
    const plain = E.building(new E.Kit(E.archPalette()), { use, floors: 2 }).toNode(), full = E.building(new E.Kit(E.archPalette(), { openable: true }), { use, floors: 2, interior: true, shutters: true, door: use === 'saloon' ? 'batwing' : 'door' }).toNode();
    plain.traverse((n) => n.geometry && (tris0 += n.geometry.indices.length / 3)); full.traverse((n) => n.geometry && (tris1 += n.geometry.indices.length / 3));
    for (const o of full.userData.openings) counts[o.kind] = (counts[o.kind] || 0) + 1;
    for (const o of full.userData.openings) if (!o.swing) o.toggle();
    for (let i = 0; i < 120; i++) full.userData.rig.update(1 / 60);
    if (full.userData.openings.some((o) => !o.swing && Math.abs(o.part.value - o.part.target) > 1)) counts.bad = (counts.bad || 0) + 1;
  }
  check('openable buildings + interiors', counts.door >= 5 && counts.batwing === 2 && counts.cell === 1 && counts.shutter > 20 && !counts.bad && tris1 > tris0 * 1.4, Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') + `; interiors ${(tris1 / tris0).toFixed(1)}× the triangles`);
}
{ // the sheriff holds everything: the prop sits in the hand and the support hand reaches the support grip
  const c = createCowboy(); c.play('Idle');
  const sk = c.skeleton, rows = []; let worst = 0;
  for (const [item, hold] of [[makeGun('lever'), 'rifleAim'], [makeGun('bolt', { scope: true }), 'rifleAim'], [makeGun('shotgun'), 'rifleAim'], [makeGun('revolver'), 'pistolAim'], [makeTool('axe'), 'toolReady']]) {
    const h = c.equip(item, { hold });
    for (let i = 0; i < 20; i++) c.update(1 / 30);
    const hand = Float32Array.from(sk.world.subarray(sk.boneIndex('hand.R') * 16, sk.boneIndex('hand.R') * 16 + 16));
    const seat = E.mat4.multiply(E.mat4.create(), hand, h.socketM);
    const gripErr = E.vec3.dist(E.mat4.getTranslation([0, 0, 0], seat), item.position);
    let supErr = 0;
    if (item.twoHanded && item.support) supErr = E.vec3.dist(sk.worldHead(sk.boneIndex('hand.L')), E.vec3.transformMat4([0, 0, 0], item.support.position, E.mat4.fromRTS(E.mat4.create(), item.rotation, item.position)));
    worst = Math.max(worst, gripErr, supErr);
    rows.push(`${item.gunKind || item.toolKind} ${(supErr * 100).toFixed(1)} cm`);
  }
  // an action fires its events with the world position of the business end
  const axe = makeTool('axe'), h = c.equip(axe); const hits = [];
  h.play('chop', { onEvent: (e) => hits.push(e) }); for (let i = 0; i < 40; i++) c.update(1 / 30);
  check('prop handling (IK grips)', worst < 0.03 && hits.length === 1 && hits[0].point && hits[0].point[1] < 0.8, `support hand error: ${rows.join(', ')}; chop hits at height ${hits[0]?.point?.[1].toFixed(2)} m`);
}
{ // ECS: pick things up, switch, drop, open a door by facing it
  const w = new E.World(), scene = new E.Scene(), c = createCowboy(); scene.add(c);
  const me = w.create({ actor: { character: c, yaw: 0 }, inventory: { items: [], active: -1, capacity: 2 } });
  w.system(E.interactionSystem({ actor: me })); w.system(E.pickupSystem());
  const log = []; w.on('pickup', (e) => log.push('+' + e.name)); w.on('inventoryFull', () => log.push('full'));
  for (const [k, z] of [['axe', 1], ['hammer', 1.2], ['saw', 1.4]]) E.spawnPickup(w, scene, makeTool(k), [0, 0, z]);
  for (let i = 0; i < 3; i++) { w.update(1 / 30); E.interact(w, me); }
  const inv = w.get(me, 'inventory'), held1 = c.equipped()?.name;
  E.select(w, me, 1); const held2 = c.equipped()?.name;
  E.drop(w, me, scene); const left = w.count('pickup');
  const b = E.building(new E.Kit(E.archPalette(), { openable: true }), { door: 'door', porch: false }).toNode(); b.position.set([0, 0, 4]); b.setEuler(0, 180, 0); scene.add(b); scene.updateWorld();
  E.addOpenings(w, b); c.position.set([0.1, 0, 2.6]);
  w.update(1 / 30); const prompt = w.focus?.prompt; E.interact(w, me); for (let i = 0; i < 90; i++) b.userData.rig.update(1 / 30); w.update(1 / 30);
  check('ECS: pickups, inventory, doors', log.join() === '+Axe,+Hammer,full' && held1 === 'Axe' && held2 === 'Hammer' && inv.items.length === 1 && left === 2 && prompt === 'Open door' && w.focus?.prompt === 'Close door', `${log.join(' ')}; held ${held1} → ${held2}; drop leaves ${left} pickups; door: "${prompt}" → "${w.focus?.prompt}"`);
}
{ // a gun exports to .glb with its recorded animations and loads back
  const g = makeGun('shotgun');
  const anims = [await E.recordAnimation(g, 'Fire', () => g.fire())];
  await run(g, g.fire()); for (let i = 0; i < 30; i++) g.update(1 / 60); // let the fire clip finish
  anims.push(await E.recordAnimation(g, 'Reload', () => g.reload()));
  const glb = E.exportSceneGLB(g, { animations: anims });
  const m = await E.loadGLTF(glb.buffer, { textures: false });
  let meshes = 0; g.traverse((n) => n.geometry && meshes++);
  const reload = m.animations.find((a) => a.name === 'Reload');
  check('prop glTF export', m.meshes.length === meshes && m.animations.length === 2 && reload && reload.duration > 1, `${(glb.length / 1024).toFixed(0)} KB, ${m.meshes.length} meshes, animations ${m.animations.map((a) => a.name + ' ' + a.duration.toFixed(2) + ' s').join(', ')}`);
}
{ // automatic instancing groups meshes that share geometry and material (WebGL2 path, no GL needed)
  const geo = E.box(), mat = new E.Material(), other = [new E.Material(), new E.Material()];
  const list = [...Array(10)].map((_, i) => { const m = new E.Mesh(geo, i < 8 ? mat : other[i - 8]); m.position.set([i, 0, 0]); m.updateWorld(null); return m; });
  const fake = { settings: { autoInstancing: true }, stats: { batched: 0 } };
  const out = E.Renderer.prototype._autoBatch.call(fake, list, 'main');
  const batch = out.find((x) => x.autoBatch);
  check('automatic instancing', out.length === 3 && batch.count === 8 && fake.stats.batched === 7 && batch.instanceMatrices[12 * 1 + 16 * 3] === 3, `10 meshes → ${out.length} draws (${batch.count} instanced + ${out.length - 1} other)`);
}
{ // WGSL: every entry point the WebGPU backend uses exists (compilation happens in the browser)
  const need = { MAIN_WGSL: ['fn vs', 'fn fs'], SHADOW_WGSL: ['fn vs'], SKY_WGSL: ['fn fs', 'fn fsv'], PARTICLE_WGSL: ['fn vs', 'fn fs'], BLOOM_WGSL: ['fn fs'], POST_WGSL: ['fn fs'], CULL_WGSL: ['fn main'], FX_WGSL: ['fn gdepth', 'fn ssao', 'fn aoblur', 'fn volume', 'fn volblur', 'fn composite'] };
  const missing = Object.entries(need).flatMap(([k, fns]) => fns.filter((f) => !W[k].includes(f)).map((f) => k + ':' + f));
  const patterns = [...W.MAIN_WGSL.matchAll(/P == (\d+)/g)].map((m) => +m[1]).sort((a, b) => a - b);
  check('WGSL sources', !missing.length && patterns.length === 20, `${Object.keys(need).length} modules; ${patterns.length} procedural materials ported${missing.length ? '; missing ' + missing : ''}`);
}
let fail = 0;
for (const [name, ok, info] of results) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); if (!ok) fail++; }
if (fail) process.exit(1);
