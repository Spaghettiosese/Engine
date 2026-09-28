// Ragdoll checks: the bodies start on the pose, the character falls flat, stays in one
// piece (joint separation), and blending back restores the animation pose.
import * as E from '../src/engine/index.js';
import { createCowboy } from '../src/content/cowboy.js';
const results = [];
const check = (name, ok, info = '') => results.push([name, ok, info]);
const world = new E.PhysicsWorld();
world.add(new E.Body({ shape: new E.Plane([0, 1, 0], 0), friction: 0.8 }));
const cowboy = createCowboy(); cowboy.play('Run', { fade: 0 }); cowboy.update(0.3);
const rag = new E.Ragdoll(world, cowboy);
check('ragdoll parts', rag.parts.size === 11 && rag.joints.length === 10, `${rag.parts.size} bodies, ${rag.joints.length} joints`);
// activation keeps the pose: the head bone should not move when physics takes over
const headIdx = cowboy.skeleton.boneIndex('head');
const before = E.vec3.transformMat4([0, 0, 0], cowboy.skeleton.worldHead(headIdx), cowboy.world);
rag.activate({ velocity: [0, 0, 2.9] });
rag.update(0);
cowboy.updateWorld(null);
const after = E.vec3.transformMat4([0, 0, 0], cowboy.skeleton.worldHead(headIdx), cowboy.world);
check('activation matches pose', E.vec3.dist(before, after) < 0.01, `head moved ${(E.vec3.dist(before, after) * 100).toFixed(2)} cm`);
let maxSep = 0;
for (let i = 0; i < 240; i++) {
  world.step(1 / 60); rag.update(1 / 60);
  for (const j of rag.joints) { const d = E.physicsMath.len(E.physicsMath.sub(j.A.toWorld(j.localA), j.B.toWorld(j.localB))); maxSep = Math.max(maxSep, d); }
}
const hy = E.vec3.transformMat4([0, 0, 0], cowboy.skeleton.worldHead(headIdx), cowboy.world)[1];
const lowest = Math.min(...rag.bodies.map((b) => b.position[1]));
check('falls flat and holds together', hy < 0.4 && lowest > -0.05 && maxSep < 0.05, `head at ${hy.toFixed(2)} m, lowest body ${lowest.toFixed(2)} m, max joint gap ${(maxSep * 100).toFixed(1)} cm, settled ${rag.settled}`);
let nan = 0; for (const v of cowboy.skeleton.rot) if (!Number.isFinite(v)) nan++;
check('pose is finite', nan === 0, `${nan} NaN`);
rag.deactivate(0.5); cowboy.play('Idle', { fade: 0 });
for (let i = 0; i < 60; i++) { world.step(1 / 60); cowboy.update(1 / 60); rag.update(1 / 60); }
cowboy.updateWorld(null);
const hy2 = E.vec3.transformMat4([0, 0, 0], cowboy.skeleton.worldHead(headIdx), cowboy.world)[1];
check('blends back to animation', !rag.active && rag.weight === 0 && hy2 > 1.5 && world.bodies.length === 1, `head at ${hy2.toFixed(2)} m, bodies left ${world.bodies.length}`);
let fail = 0;
for (const [name, ok, info] of results) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); if (!ok) fail++; }
if (fail) process.exit(1);
