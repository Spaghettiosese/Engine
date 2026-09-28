// First-person M1 Garand: the actions leave the rifle in consistent states, the clip goes
// where it should, and the hands stay on the weapon when they are meant to.
import { createGarand } from '../src/content/garand.js';
import { sampleClip } from '../src/engine/animation.js';
import { vec3, mat4 } from '../src/engine/math.js';
const ch = createGarand(), sk = ch.skeleton, idx = (n) => sk.boneIndex(n);
let fail = 0;
const at = (clip, t) => { sampleClip(clip, sk, t, ch.mixer.pose); sk.copyPose(ch.mixer.pose); sk.update(); };
const check = (ok, msg) => { if (!ok) fail++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const clipOffset = () => vec3.dist(sk.worldHead(idx('clip')), vec3.transformMat4([0, 0, 0], [0, 0.012, 0.03], sk.world.subarray(idx('weapon') * 16, idx('weapon') * 16 + 16)));
const posZ = (b) => sk.pos[idx(b) * 3 + 2];
for (const clip of ch.mixer.clips.values()) {
  let finite = true;
  for (let k = 0; k <= 60; k++) { at(clip, (k / 60) * clip.duration); if (![...sk.world, ...sk.pos].every(Number.isFinite)) finite = false; }
  check(finite, `${clip.name.padEnd(8)} ${clip.duration}s, ${clip.tracks.length} tracks, all transforms finite`);
}
const C = (n) => ch.mixer.clips.get(n);
at(C('Idle'), 0); check(clipOffset() < 0.002 && Math.abs(posZ('bolt')) < 1e-3, 'Idle: clip seated, bolt closed');
at(C('Fire'), 0.02); check(sk.pos[idx('flash') * 3 + 2] === 0, 'Fire: muzzle flash visible on the shot');
at(C('Fire'), 0.2); check(sk.pos[idx('flash') * 3 + 2] < -1, 'Fire: muzzle flash gone after the shot');
at(C('Fire'), 1.0); check(posZ('bolt') < -0.08 && clipOffset() > 0.5, 'Fire: last round leaves the bolt locked open and the empty clip ejected');
at(C('Reload'), 0); check(posZ('bolt') < -0.08 && clipOffset() > 0.5, 'Reload: starts empty with the bolt open');
at(C('Reload'), 1.45); check(clipOffset() < 0.03, 'Reload: clip is at the magazine well while the thumb pushes');
at(C('Reload'), 3.0); check(clipOffset() < 0.002 && Math.abs(posZ('bolt')) < 1e-3 && Math.abs(posZ('opRod')) < 1e-3, 'Reload: ends loaded, bolt and op rod home');
at(C('Inspect'), 1.7); check(posZ('opRod') < -0.05, 'Inspect: op rod pulled back to check the chamber');
// hands stay on the rifle while gripping: the left wrist tracks the handguard
let drift = 0;
for (const n of ['Idle', 'Fire', 'Inspect', 'Reload']) for (let k = 0; k <= 30; k++) {
  at(C(n), (k / 30) * C(n).duration);
  const W = sk.world.subarray(idx('weapon') * 16, idx('weapon') * 16 + 16), inv = mat4.invert(mat4.create(), W);
  const local = vec3.transformMat4([0, 0, 0], sk.worldHead(idx('hand.L')), inv);
  const z = Math.min(0.33, Math.max(0.24, local[2])); // anywhere along the rear of the handguard
  drift = Math.max(drift, vec3.dist(local, [0.048, -0.066, z]));
}
check(drift < 0.02, `Support hand stays on the handguard (max drift ${(drift * 100).toFixed(1)} cm)`);
process.exit(fail ? 1 : 0);
