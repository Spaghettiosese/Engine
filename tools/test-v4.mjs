// V4 checks: photometric lights, fire spread and smoke, flashlight battery, glTF round trip.
import * as E from '../src/engine/index.js';
import { createCowboy } from '../src/content/cowboy.js';
const results = [];
const check = (name, ok, info = '') => results.push([name, ok, info]);

{ // photometric units: an 800 lm bulb is ~64 cd and puts ~16 lux on a surface 2 m away
  const bulb = new E.Light('point', { lumens: 800, range: 20, physical: true }); bulb.updateWorld(null);
  const lux = bulb.luxAt([0, -2, 0]);
  const spot = new E.Light('spot', { lumens: 800, angle: 20, range: 30 }); spot.updateWorld(null);
  const inBeam = spot.luxAt([0, -3, 0]), outside = spot.luxAt([3, -3, 0]);
  check('photometric units', Math.abs(bulb.candela - 63.66) < 0.1 && Math.abs(lux - 15.9) < 0.2 && inBeam > lux * 5 && outside === 0, `bulb ${bulb.candela.toFixed(1)} cd, ${lux.toFixed(1)} lux at 2 m; 20° spot ${inBeam.toFixed(0)} lux in the beam, ${outside} outside`);
}
{ // fire spreads along a row of crates 1 m apart but not to one 12 m away; everything burns out and chars
  const scene = new E.Scene(), fire = new E.FireSystem(scene);
  const crates = [];
  for (let i = 0; i < 5; i++) { const m = new E.Mesh(E.box({ width: 0.8, height: 0.8, depth: 0.8 }), new E.Material({ color: '#a0764a' })); m.position.set([i * 1.1, 0.4, 0]); scene.add(m); scene.updateWorld(); crates.push(fire.add(m, { radius: 0.45, fuel: 12 })); }
  const far = new E.Mesh(E.box(), new E.Material({ color: '#a0764a' })); far.position.set([16, 0.5, 0]); scene.add(far); scene.updateWorld();
  const farB = fire.add(far, { radius: 0.5 });
  fire.wind = [0, 0, 0];
  fire.ignite(crates[0]);
  let allLit = -1, maxSmoke = 0;
  for (let t = 0; t < 120; t += 1 / 30) { fire.update(1 / 30); maxSmoke = Math.max(maxSmoke, fire.smoke.count); if (allLit < 0 && crates.every((c) => c.state !== 'fresh' && c.state !== 'hot')) allLit = t; }
  const charred = crates[0].mats[0].m.color;
  check('fire spreads and burns out', allLit > 0 && farB.state === 'fresh' && crates.every((c) => c.state === 'burnt') && charred !== '#a0764a' && maxSmoke > 50, `row alight after ${allLit.toFixed(1)} s, far crate untouched, all burnt out, charred to ${charred}, up to ${maxSmoke} smoke puffs`);
}
{ // flashlight: lumens -> intensity, battery drains, weak battery flickers, dead battery turns it off
  const f = new E.Flashlight({ lumens: 600, drain: 1 / 10 }); f.toggle(true);
  const full = f.update(0.1); const I = f.beam.intensity;
  let flick = 0, min = 1;
  for (let t = 0; t < 12; t += 0.02) { const k = f.update(0.02); if (f.battery < 0.25 && f.on) { min = Math.min(min, k); if (k < 0.1) flick++; } }
  check('flashlight', full === 1 && I > 5 && flick > 0 && !f.on && f.battery === 0, `${I.toFixed(0)} engine units at full charge, ${flick} dropouts while dying, off when empty`);
}
{ // glTF round trip: export the Cowboy, import it, play Walk, compare skinned vertices with the engine's
  const c = createCowboy(); c.updateWorld(null);
  const glb = E.exportGLB(c);
  const model = await E.loadGLTF(glb);
  const verts = model.meshes.reduce((s, m) => s + m.geometry.vertexCount, 0), mine = c.parts.reduce((s, p) => s + p.meshes.reduce((a, m) => a + m.geometry.vertexCount, 0), 0);
  c.play('Walk', { fade: 0 }); c.mixer.setTime('Walk', 0.37); c.mixer.evaluate(); c.updateWorld(null);
  model.animator.play('Walk', { fade: 0 }); model.animator.current.time = 0.37 - 1e-6; model.update(1e-6);
  // CPU-skin one mesh both ways
  const pick = c.parts.find((p) => p.def.name === 'Head').meshes[0], ours = E.skinnedPositions(pick).positions;
  const theirs = model.meshes.find((m) => m.name === pick.name), g = theirs.geometry, S = theirs.skeleton.joints;
  let maxErr = 0;
  for (let i = 0; i < g.vertexCount; i += 7) {
    const p = [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]], acc = [0, 0, 0];
    for (let k = 0; k < 4; k++) { const w = g.weights[i * 4 + k]; if (!w) continue; const v = E.vec3.transformMat4([0, 0, 0], p, S.subarray(g.joints[i * 4 + k] * 16, g.joints[i * 4 + k] * 16 + 16)); E.vec3.scaleAdd(acc, acc, v, w); }
    maxErr = Math.max(maxErr, E.vec3.dist(acc, [ours[i * 3], ours[i * 3 + 1], ours[i * 3 + 2]]));
  }
  check('glTF round trip', verts === mine && model.animations.length === c.mixer.clips.size && model.skins[0].length === c.skeleton.length && maxErr < 0.003, `${verts.toLocaleString()} vertices, ${model.animations.length} animations, ${model.skins[0].length} joints; posed Walk matches within ${(maxErr * 1000).toFixed(2)} mm`);
}
let fail = 0;
for (const [name, ok, info] of results) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); if (!ok) fail++; }
if (fail) process.exit(1);
