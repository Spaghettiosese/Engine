// Physics checks: resting contact, stacking, friction, restitution, joints, raycasts,
// sleeping and the character controller.
import * as P from '../src/engine/physics.js';
const results = [];
const check = (name, ok, info = '') => results.push([name, ok, info]);
const run = (w, seconds) => { for (let t = 0; t < seconds; t += 1 / 60) w.step(1 / 60); };
const ground = (w) => w.add(new P.Body({ shape: new P.Plane([0, 1, 0], 0) }));

{ // a sphere dropped on the ground comes to rest on it
  const w = new P.PhysicsWorld(); ground(w);
  const s = w.add(new P.Body({ shape: new P.Sphere(0.5), position: [0, 3, 0] }));
  run(w, 3);
  check('sphere rests on plane', Math.abs(s.position[1] - 0.5) < 0.02 && s.sleeping, `y=${s.position[1].toFixed(3)} sleeping=${s.sleeping}`);
}
{ // a tower of 8 boxes stays standing
  const w = new P.PhysicsWorld(); ground(w);
  const boxes = [];
  for (let i = 0; i < 8; i++) boxes.push(w.add(new P.Body({ shape: new P.Box([0.5, 0.5, 0.5]), position: [0, 0.5 + i * 1.001, 0], rotation: [0, Math.sin(i * 0.1) * 0.05, 0, 1] })));
  run(w, 6);
  const top = boxes[7].position, drift = Math.hypot(top[0], top[2]);
  check('box tower of 8 stands', drift < 0.05 && Math.abs(top[1] - 7.5) < 0.1, `top drift ${drift.toFixed(3)} m, y ${top[1].toFixed(2)}, asleep ${boxes.filter((b) => b.sleeping).length}/8`);
}
{ // a box on a 20° slope with friction 0.6 holds; with friction 0.1 it slides
  const res = [];
  for (const mu of [0.6, 0.1]) {
    const w = new P.PhysicsWorld();
    const a = (20 * Math.PI) / 180, q = [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
    w.add(new P.Body({ shape: new P.Box([4, 0.1, 2]), type: 'static', rotation: q, friction: mu }));
    const n = [-Math.sin(a), Math.cos(a), 0];
    const b = w.add(new P.Body({ shape: new P.Box([0.3, 0.3, 0.3]), position: [n[0] * 0.42, n[1] * 0.42, 0], rotation: q, friction: mu }));
    run(w, 2); res.push(Math.hypot(b.position[0] - n[0] * 0.42, b.position[1] - n[1] * 0.42));
  }
  check('friction on a slope', res[0] < 0.05 && res[1] > 1, `μ .6 moved ${res[0].toFixed(3)} m, μ .1 moved ${res[1].toFixed(2)} m`);
}
{ // restitution: a bouncy ball rebounds higher than a dead one
  const peaks = [];
  for (const e of [0.9, 0.0]) {
    const w = new P.PhysicsWorld(); w.add(new P.Body({ shape: new P.Plane(), restitution: e }));
    const s = w.add(new P.Body({ shape: new P.Sphere(0.2), position: [0, 2, 0], restitution: e }));
    let peak = 0, hit = false;
    for (let i = 0; i < 180; i++) { w.step(1 / 60); if (s.velocity[1] > 0) hit = true; if (hit) peak = Math.max(peak, s.position[1]); }
    peaks.push(peak);
  }
  check('restitution', peaks[0] > 1.2 && peaks[1] < 0.3, `e .9 rebound ${peaks[0].toFixed(2)} m, e 0 ${peaks[1].toFixed(2)} m`);
}
{ // pendulum on a ball joint keeps its length and swings with the right period
  const w = new P.PhysicsWorld({ substeps: 4 });
  const bob = w.add(new P.Body({ shape: new P.Sphere(0.1), position: [1, 2, 0], mass: 1, linearDamping: 0, angularDamping: 0 }));
  w.add(new P.BallJoint(null, bob, [0, 2, 0]));
  let maxErr = 0, crossings = [], prev = bob.position[0];
  for (let i = 0; i < 360; i++) { w.step(1 / 60); maxErr = Math.max(maxErr, Math.abs(Math.hypot(bob.position[0], bob.position[1] - 2, bob.position[2]) - 1)); if (prev > 0 && bob.position[0] <= 0) crossings.push(i / 60); prev = bob.position[0]; }
  const period = crossings.length > 1 ? crossings[1] - crossings[0] : 0;
  check('ball-joint pendulum', maxErr < 0.02 && period > 2.3 && period < 2.45, `length error ${(maxErr * 100).toFixed(1)} cm, period ${period.toFixed(2)} s (90° swing theory 2.37 s)`);
}
{ // hinge limit: a door stops at its limit
  const w = new P.PhysicsWorld();
  const door = w.add(new P.Body({ shape: new P.Box([0.5, 1, 0.05]), position: [0.5, 1, 0], mass: 10 }));
  const h = w.add(new P.HingeJoint(null, door, [0, 1, 0], [0, 1, 0], { min: -0.8, max: 0.8 }));
  door.applyImpulse([0, 0, 20], [1, 1, 0]);
  let maxA = 0; for (let i = 0; i < 120; i++) { w.step(1 / 60); maxA = Math.max(maxA, Math.abs(h.angle())); }
  const axisDrift = Math.abs(P.physicsMath.qrot(door.quaternion, [0, 1, 0])[1] - 1);
  check('hinge with limits', maxA < 0.9 && maxA > 0.6 && axisDrift < 0.01, `max angle ${maxA.toFixed(2)} rad (limit .80), axis drift ${axisDrift.toFixed(4)}`);
}
{ // capsule lying on boxes, rays, sleeping
  const w = new P.PhysicsWorld(); ground(w);
  const box = w.add(new P.Body({ shape: new P.Box([1, 0.25, 1]), type: 'static', position: [0, 0.25, 0] }));
  const cap = w.add(new P.Body({ shape: new P.Capsule(0.2, 0.5), position: [0, 1.5, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }));
  run(w, 3);
  const hit = w.raycast([0, 5, 0], [0, -1, 0]);
  const hit2 = w.raycast([3, 0.25, 0], [-1, 0, 0]);
  check('capsule on box + raycast', Math.abs(cap.position[1] - 0.7) < 0.03 && hit && hit.body === cap && Math.abs(hit.point[1] - 0.9) < 0.01 && hit2 && hit2.body === box && Math.abs(hit2.point[0] - 1) < 1e-3,
    `capsule y ${cap.position[1].toFixed(3)}, ray hit ${hit && hit.body.name} at ${hit && hit.point[1].toFixed(3)}, side ray ${hit2 && hit2.point[0].toFixed(3)}`);
}
{ // character controller walks, climbs a step, is blocked by a wall and pushes a crate
  const w = new P.PhysicsWorld(); ground(w);
  w.add(new P.Body({ shape: new P.Box([1, 0.1, 1]), type: 'static', position: [0, 0.1, 3] })); // 20 cm step
  w.add(new P.Body({ shape: new P.Box([3, 2, 0.2]), type: 'static', position: [0, 2, 6] }));    // wall
  const cc = new P.CharacterController(w, { position: [0, 0, 0] });
  let maxY = 0;
  for (let i = 0; i < 300; i++) { cc.move([0, 2], 1 / 60); w.step(1 / 60); if (Math.abs(cc.position[2] - 3) < 0.5) maxY = Math.max(maxY, cc.position[1]); }
  const stopZ = cc.position[2];
  const crate = w.add(new P.Body({ shape: new P.Box([0.3, 0.3, 0.3]), position: [2, 0.3, 5.3], mass: 20 }));
  const cz0 = crate.position[0];
  cc.position = [0.8, 0, 5.3]; for (let i = 0; i < 120; i++) { cc.move([2, 0], 1 / 60); w.step(1 / 60); }
  check('character controller', maxY > 0.18 && Math.abs(stopZ - 5.48) < 0.02 && crate.position[0] > cz0 + 0.3, `stepped to ${maxY.toFixed(2)} m, stopped at z ${stopZ.toFixed(2)} by the wall, crate pushed ${(crate.position[0] - cz0).toFixed(2)} m`);
}
{ // performance: 300 bodies
  const w = new P.PhysicsWorld(); ground(w);
  for (let i = 0; i < 300; i++) w.add(new P.Body({ shape: i % 2 ? new P.Box([0.2, 0.2, 0.2]) : new P.Sphere(0.2), position: [(i % 10) * 0.5 - 2.5, 1 + Math.floor(i / 100) * 0.5 + (i % 7) * 0.1, Math.floor(i / 10) % 10 * 0.5 - 2.5] }));
  const t0 = performance.now(); run(w, 2); const ms = (performance.now() - t0) / 120;
  check('300 bodies', ms < 16, `${ms.toFixed(2)} ms per frame, ${w.stats.contacts} contacts, ${w.stats.awake} awake`);
}
{ // CCD: a fast pellet doesn't tunnel through a 4 cm wall
  const res = [];
  for (const ccd of [false, true]) {
    const w = new P.PhysicsWorld({ gravity: [0, 0, 0] });
    w.add(new P.Body({ shape: new P.Box([1, 1, 0.02]), type: 'static', position: [0, 0, 2] }));
    const b = w.add(new P.Body({ shape: new P.Sphere(0.03), position: [0, 0, 0], velocity: [0, 0, 150], mass: 0.05, ccd }));
    run(w, 0.3); res.push(b.position[2]);
  }
  check('continuous collision', res[0] > 2.5 && res[1] < 2, `without CCD z ${res[0].toFixed(1)} (tunnelled), with CCD z ${res[1].toFixed(2)}`);
}
{ // rolling friction: a rolling ball comes to rest instead of rolling forever
  const w = new P.PhysicsWorld(); ground(w);
  const b = w.add(new P.Body({ shape: new P.Sphere(0.2), position: [0, 0.2, 0], velocity: [3, 0, 0], angularVelocity: [0, 0, -15], linearDamping: 0, angularDamping: 0, rollingFriction: 0.05 }));
  run(w, 8);
  check('rolling friction', P.physicsMath.len(b.velocity) < 0.05 && b.position[0] > 1, `rolled ${b.position[0].toFixed(1)} m then stopped (speed ${P.physicsMath.len(b.velocity).toFixed(3)})`);
}
{ // shooting and fracture
  const w = new P.PhysicsWorld(); ground(w);
  const can = w.add(new P.Body({ shape: new P.Box([0.04, 0.06, 0.04]), position: [0, 0.06, 5], mass: 0.1 }));
  run(w, 0.5);
  const hit = w.shoot([0, 0.06, 0], [0, 0, 1], { impulse: 0.8 });
  const bottle = w.add(new P.Body({ shape: new P.Box([0.04, 0.12, 0.04]), position: [1, 0.12, 5], mass: 0.4 }));
  const shards = P.fracture(w, bottle, { pieces: [2, 3, 2], point: [1, 0.12, 4.96] });
  run(w, 0.4);
  const flew = shards.filter((s) => s.position[2] > 5.05).length;
  check('shoot + fracture', hit && hit.body === can && can.velocity[2] > 3 && shards.length === 12 && !w.bodies.includes(bottle) && flew > 6, `can knocked away at ${can.velocity[2].toFixed(1)} m/s, bottle broke into ${shards.length} shards, ${flew} blown back`);
}
let fail = 0;
for (const [name, ok, info] of results) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); if (!ok) fail++; }
if (fail) process.exit(1);
