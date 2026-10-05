// CHAPTER SEVEN: JULY 14. Verity rebuilds the night Dad left, out of blocks.
// Five memories. One of them is the reason Harry has been lying.
import * as E3 from '../../src/engine/index.js';
import { Stage, Obj3 } from './stage.js';
import { VoxelWorld, VoxelPlayer, BlockParticles, makeBlockPerson, poseBlockPerson, blockSkin, nameTag, B } from './voxel.js';
import { grinner } from './cast.js';
import { chapterCard } from './common.js';

const DEG = 180 / Math.PI;
const W = 48, HH = 10, D = 40;

export class MemoryLevel extends Stage {
  constructor(game) {
    super(game, { height: 3 });
    const s = this.scene, env = this.env;
    this.world = new VoxelWorld(W, HH, D, s);
    this.build();
    this.world.buildAll();
    this.vp = new VoxelPlayer(game, this.world);
    this.fx = new BlockParticles();
    this.particles = [this.fx.ps];
    this.lampsL = [];
    for (const [x, z, c] of [[9, 29, '#ffc070'], [23, 29, '#fff0d0'], [38, 29, '#90a0ff'], [7, 9, '#ffc070'], [20, 9, '#ffd8a0'], [37, 9, '#ffc0a0'], [24, 19.5, '#ffe0b0']]) {
      const l = this.addLamp(x, 4.6, z, { color: c, intensity: 7, range: 12, bulb: false }); this.lampsL.push(l);
    }
    // people of the memory
    this.dad = this.person('#161212', '#3a4a6a', '#2a2a30', 'DAD');
    this.mom = this.person('#141010', '#8a6a9a', '#4a3a5a', 'MOM');
    this.ericP = this.person('#121010', '#4f9a3f', '#34466a', 'ERIC');
    this.ericP.group.scale.setScalar(0.72);
    this.ericP.group.position.set(40.5, 3.0, 33.5); this.ericP.node.setEuler(-90, 0, 0);
    this.mom.group.position.set(23.5, 2, 33); this.mom.group.rotation.y = Math.PI;
    this.dad.group.position.set(9.5, 2, 30); this.dad.group.rotation.y = Math.PI * 0.8;
    // Verity
    this.mon = grinner(); this.mon.play('Idle', { fade: 0 }); this.mon.visible = false;
    this.monH = new Obj3(this.mon); this.monH.scale.setScalar(0.62); s.add(this.mon);
    // memory fragments
    this.frags = [];
    const fm = new E3.Material({ name: 'Memory', color: '#ffd21e', emissive: '#ffd21e', emissiveStrength: 3, roughness: 0.4 });
    const addFrag = (id, x, y, z, hidden = false) => {
      const m = new E3.Mesh(E3.box({ width: 0.4, height: 0.4, depth: 0.4 }), fm, 'Fragment ' + id);
      m.castShadow = false; m.position.set([x, y, z]); m.visible = !hidden; s.add(m);
      const glow = new E3.Light('point', { color: '#ffd21e', intensity: 2.5, range: 4 }); m.add(glow);
      this.frags.push({ id, m: new Obj3(m), node: m, ang: 0, done: false, hidden });
    };
    addFrag('kitchen', 23.5, 3.4, 27.5);
    addFrag('living', 9.5, 3.4, 27.5);
    addFrag('eric', 38.5, 3.4, 31.5);
    addFrag('harry', 20.5, 3.4, 9.5);
    addFrag('door', 7.5, 3.4, 5.5, true);
    // exit: the family PC glowing at the end of the hall
    this.exitMat = new E3.Material({ name: 'Exit screen', color: '#9ac0ff', emissive: '#9ac0ff', emissiveStrength: 3, roughness: 0.2 });
    const scr = new E3.Mesh(E3.box({ width: 0.06, height: 1.0, depth: 1.4 }), this.exitMat, 'Exit screen');
    scr.position.set([45.9, 3.4, 19.5]); scr.castShadow = false; s.add(scr);
    this.t = 0; this.chase = null;
    // a rainy night
    E3.applyTimeOfDay(env, 0.2, { rays: false });
    env.ambient = 0.3; env.skyColor = [0.3, 0.36, 0.6]; env.groundColor = [0.18, 0.15, 0.12];
    env.sunIntensity = 0.12; env.fogDensity = 0.03; env.clouds = true; env.rain = 0.6; env.shadowRadius = 30; env.shadowCenter = [24, 2, 20]; env.shadowFar = 70;
  }

  person(hair, shirt, pants, tag) {
    const p = makeBlockPerson(blockSkin(hair, shirt, pants));
    const nt = nameTag(tag, '#9ab0ff'); nt.position.set([0, 2.25, 0]); p.node.add(nt); p.tag = nt;
    this.scene.add(p.node);
    return p;
  }

  build() {
    const w = this.world;
    const box = (x0, y0, z0, x1, y1, z1, b) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) w.set(x, y, z, b, false); };
    box(0, 0, 0, W - 1, 0, D - 1, B.BEDROCK);
    box(0, 1, 0, W - 1, 1, D - 1, B.PLANKS);
    // outer walls y 2..5, ceiling y 6
    const wallsH = [2, 5];
    const wallX = (z, x0, x1, gaps = []) => { for (let x = x0; x <= x1; x++) for (let y = wallsH[0]; y <= wallsH[1]; y++) { if (gaps.some(([a, b, h]) => x >= a && x <= b && y < 2 + (h || 3))) continue; w.set(x, y, z, B.PLANKS, false); } };
    const wallZ = (x, z0, z1, gaps = []) => { for (let z = z0; z <= z1; z++) for (let y = wallsH[0]; y <= wallsH[1]; y++) { if (gaps.some(([a, b, h]) => z >= a && z <= b && y < 2 + (h || 3))) continue; w.set(x, y, z, B.PLANKS, false); } };
    wallX(0, 0, W - 1, [[7, 8]]);
    wallX(D - 1, 0, W - 1);
    wallZ(0, 0, D - 1); wallZ(W - 1, 0, D - 1);
    box(0, 6, 0, W - 1, 6, D - 1, B.PLANKS);
    // hallway z 18..21 walls
    wallX(17, 1, W - 2, [[6, 7], [20, 21], [36, 37]]);
    wallX(22, 1, W - 2, [[8, 9], [23, 24], [38, 39]]);
    wallZ(16, 23, 38); wallZ(31, 23, 38);
    wallZ(13, 1, 16); wallZ(29, 1, 16);
    // windows (glass) with night outside
    for (const [x, z] of [[4, 39], [12, 39], [23, 39], [36, 39], [43, 39], [20, 0], [36, 0]]) { w.set(x, 3, z, B.GLASS, false); w.set(x + 1, 3, z, B.GLASS, false); w.set(x, 4, z, B.GLASS, false); w.set(x + 1, 4, z, B.GLASS, false); }
    // rugs
    box(4, 1, 25, 12, 1, 33, B.WOOL);
    box(3, 1, 18, W - 4, 1, 21, B.WOOL);
    // living room: couch (wool + planks), boxes (DAD'S THINGS), TV
    box(3, 2, 34, 9, 2, 36, B.WOOL); box(3, 3, 36, 9, 3, 36, B.WOOL);
    for (const [x, z, hgt] of [[11, 26, 2], [12, 26, 1], [11, 27, 1], [13, 28, 1], [6, 24, 2]]) box(x, 2, z, x, 1 + hgt, z, B.PLANKS);
    box(14, 2, 34, 15, 3, 35, B.OBSIDIAN || B.BEDROCK);
    // kitchen: counters (cobble), table (logs), fridge (glass)
    box(17, 2, 37, 30, 2, 38, B.COBBLE);
    box(21, 2, 29, 26, 2, 31, B.LOG);
    box(29, 2, 24, 30, 5, 25, B.GLASS);
    // Eric's room: bed (wool/planks), toys (smile? no) bookshelf
    box(38, 2, 32, 42, 2, 35, B.WOOL); box(43, 2, 32, 43, 3, 35, B.PLANKS);
    box(44, 2, 24, 45, 4, 24, B.BOOKSHELF);
    // Harry's room: desk, trophy (gold), bed
    box(15, 2, 2, 18, 2, 3, B.LOG); w.set(16, 3, 2, B.GOLD, false);
    box(24, 2, 2, 27, 2, 6, B.WOOL);
    box(15, 2, 14, 15, 4, 15, B.BOOKSHELF);
    // parents' room
    box(35, 2, 2, 41, 2, 7, B.WOOL); box(42, 2, 2, 42, 3, 7, B.PLANKS);
    box(31, 2, 14, 32, 3, 15, B.PLANKS);
    // foyer: shoe rack + the front door (open to the dark)
    box(2, 2, 3, 3, 2, 5, B.PLANKS);
    w.set(7, 2, 0, B.DOORB, false); w.set(7, 3, 0, B.DOORT, false);
  }

  enter() {
    super.enter();
    this.game.control = 'voxel';
    this.game.camera.fov = 70 * Math.PI / 180; this.game.camera.near = 0.05; this.game.camera.far = 120;
  }

  dispose() { this.disposed = true; this.world.dispose(); super.dispose(); }

  near(x, z, r) { return Math.hypot(this.vp.pos.x - x, this.vp.pos.z - z) < r; }

  update(dt) {
    const g = this.game, cam = g.camera;
    this.t += dt;
    if (g.control === 'voxel') this.vp.update(dt);
    this.world.update(2);
    this.fx.update(dt);
    for (const f of this.frags) if (f.m.visible) { f.ang += dt * 90; f.node.setEuler(f.ang * 0.6, f.ang, 0); f.node.position[1] += Math.sin(this.t * 2 + f.node.position[0]) * 0.003; }
    for (const p of [this.dad, this.mom]) { poseBlockPerson(p, dt, p.moving || 0); p.tag.userData.face(cam); }
    this.ericP.tag.userData.face(cam);
    for (const l of this.lampsL) l.intensity = l.base * (Math.random() < 0.02 ? 0.2 : 1);
    this.exitMat.emissiveStrength = 2.6 + Math.sin(this.t * 3) * 0.6;
    if (this.chase && this.chase.active) {
      const m = this.monH, p = this.vp.pos;
      const dx = p.x - m.position.x, dz = p.z - m.position.z, d = Math.hypot(dx, dz) || 1;
      this.chase.delay = (this.chase.delay || 0) - dt;
      const sp = this.chase.delay > 0 ? 0 : this.chase.speed;
      m.position.x += dx / d * sp * dt; m.position.z += dz / d * sp * dt;
      m.rotation.y = Math.atan2(dx, dz);
      this.monPlay(sp ? 'Run' : 'Idle');
      g.audio.heart = Math.max(0.4, 1 - d / 12);
      g.ui.danger(0.25 + Math.max(0, 1 - d / 12) * 0.5);
      this.chase.stepT = (this.chase.stepT || 0) - dt;
      if (this.chase.stepT <= 0) { this.chase.stepT = 0.5; g.audio.monsterStep(d); }
      if (d < 1.1) { this.chase.active = false; this.chase.caught = true; }
    } else this.monPlay('Idle');
    if (this.mon.visible) this.mon.update(dt);
  }
  monPlay(n) { if (this.monClip !== n) { this.monClip = n; this.mon.play(n, { fade: 0.25 }); } }
}

export async function chapterMemory(g) {
  const L = new MemoryLevel(g);
  g.setLevel(L);
  const ui = g.ui;
  const say = (n, t, o) => ui.say(n, t, o), think = (t) => ui.think(t);
  const DAD = (t) => say('Dad', t, { label: 'Dad (memory)' }), MOM = (t) => say('Mom', t, { label: 'Mom (memory)' });
  const V = (t, evil) => { ui.bark(evil ? 'VERITY' : 'Verity', t); g.audio.speak(t, evil ? { pitch: 0.1, rate: 0.72 } : { pitch: 1.2, rate: 0.95 }); return g.wait(1.5 + t.length * 0.045); };
  g.control = 'none';
  g.setClock(23, 52); g.clockRate = 0;
  g.audio.setAmbience('mcCorrupt');
  g.audio.rain = 0.6;
  g.audio.setMusic('mcNight');
  ui.osd({ mode: 'rec', date: 'JUL 14 2026' });
  await ui.card([{ t: 'The screen doesn\'t just glow. It pulls.', cls: 'quote' }, { t: 'The den folds up into little squares.', cls: 'quote' }], { dur: 5 });
  await chapterCard(g, 'CHAPTER SEVEN', 'JULY 14', '11:52 PM · THREE MONTHS AGO');
  L.vp.place(24.5, 2.05, 19.5, Math.PI / 2);
  g.control = 'voxel';
  g.input.setTouchMode('chase');
  g.input.requestLock();
  await ui.fade(0, 1.6);
  await V('Welcome home, Harry! Well. The OLD home! The one from July! :)');
  await V('Let\'s play a game! It\'s called REMEMBER! Find the five saddest things in this house! :)');
  await think('It\'s our house. Built out of blocks. Same hallway, same rug. It\'s raining on the windows. It\'s the night Dad left.');
  let found = 0;
  const scenes = {
    kitchen: async () => {
      L.mom.group.rotation.y = 0;
      await MOM('Wei. The boys. What do we tell the boys?');
      await DAD('I\'ll tell them. When I have the apartment. When it\'s... real.');
      await MOM('It\'s real now. You\'re taping boxes in the living room at midnight. That\'s real.');
      await DAD('Eric has his school play Friday. Let him have the play. Then.');
      await think('Then came and went. So did the next "then."');
    },
    living: async () => {
      L.dad.group.rotation.y = Math.atan2(L.vp.pos.x - 9.5, L.vp.pos.z - 30);
      await DAD('Harry. Hey. You\'re up. I— you shouldn\'t see this.');
      await DAD('Can I ask you something big? The biggest thing I\'ve ever asked you?');
      await DAD('Don\'t tell Eric. Not yet. Let me and your mom do it. When it\'s the right time.');
      await say('Harry', 'When\'s the right time?', { label: 'Harry (memory)' });
      await DAD('...I\'ll know it when I see it.');
      await think('That\'s it. That\'s where it started. It was never my secret. He handed it to me like a box and walked out the door.');
      g.flags.dadAsked = true;
    },
    eric: async () => {
      L.dad.group.position.set(40.5, 2, 30); L.dad.group.rotation.y = 0;
      await DAD('Night, buddy. General Dumpling\'s on duty. You\'re safe.');
      await think('Eric was asleep. He never knew Dad said goodbye. He thinks Dad just... left for a trip.');
      await think('Dad said goodbye to him. He just didn\'t wait for him to wake up.');
      L.dad.group.position.set(9.5, 2, 30);
    },
    harry: async () => {
      await DAD('Your mom\'s going to need help. With pickups. With Eric. I\'m sorry, kiddo.');
      await say('Harry', 'I\'ll quit robotics. Practice ends too late anyway.', { label: 'Harry (memory)' });
      await DAD('You don\'t have to—');
      await say('Harry', 'I\'ll do it.', { label: 'Harry (memory)' });
      await think('I was so proud of how grown-up that sounded. I went to my room and cried into the regional trophy.');
    },
    door: async () => {
      L.dad.group.position.set(7.5, 2, 2.5); L.dad.group.rotation.y = Math.atan2(L.vp.pos.x - 7.5, L.vp.pos.z - 2.5);
      await DAD('I\'m not going far, Harry. San Jose. Forty minutes. You can call me whenever.');
      await DAD('Take care of your brother.');
      const c = await ui.choose(['"Why didn\'t you tell him yourself?"', '"Bye, Dad."', '(Say what I never said.) "You shouldn\'t have asked me to keep it."']);
      if (c === 0) { await DAD('...Because I\'m a coward, kiddo. That\'s the truth.'); g.flags.truth = (g.flags.truth || 0) + 1; }
      else if (c === 1) { await DAD('Bye, Harry.'); }
      else { g.flags.truth = (g.flags.truth || 0) + 2; await DAD('...No. I shouldn\'t have. I\'m sorry. It was never yours to carry.'); }
      await think('He walks out into the rain. The door stays open. The dark outside is made of blocks too.');
      L.dad.group.visible = false;
      g.achieve('memory');
    },
  };
  ui.setObjective('Find the memories (0/4)');
  for (;;) {
    await g.until(() => L.frags.some((f) => f.m.visible && !f.done && L.near(f.m.position.x, f.m.position.z, 2.2)) && !ui.busy);
    const f = L.frags.find((q) => q.m.visible && !q.done && L.near(q.m.position.x, q.m.position.z, 2.2));
    f.done = true; f.m.visible = false;
    g.audio.chime();
    L.fx.burst(f.m.position.x - 0.5, f.m.position.y - 0.5, f.m.position.z - 0.5, 0xffd21e, 14, 2);
    g.control = 'none';
    await scenes[f.id]();
    g.control = 'voxel';
    if (f.id === 'door') break;
    found++;
    if (found < 4) ui.setObjective(`Find the memories (${found}/4)`);
    else {
      L.frags.find((q) => q.id === 'door').m.visible = true;
      ui.setObjective('The front door');
      await V('One more! The saddest one! It\'s by the door! :)');
    }
  }
  // she comes for him
  ui.setObjective(null);
  L.monH.visible = true;
  L.monH.position.set(7.5, 2, 1.2);
  L.monH.rotation.y = 0;
  g.audio.stinger();
  await V('That\'s all of them, Harry. Now you remember everything. Now there\'s nothing left for you to hide. That makes me SO hungry. :)', true);
  await think('She came in through the front door. The computer at the far end of the hall is still glowing. That\'s the way out. RUN.');
  for (;;) {
    ui.setObjective('RUN to the glowing computer at the end of the hall');
    L.chase = { active: true, speed: 3.5, delay: 1.6 };
    L.monH.position.set(7.5, 2, 1.2);
    const r = await g.dir.race({ out: () => L.vp.pos.x > 44.4 && Math.abs(L.vp.pos.z - 19.5) < 2.5, caught: () => L.chase.caught });
    if (r === 'out') break;
    g.audio.jumpscare(); g.retro.u.uGlitch.value = 1;
    await g.wait(0.8);
    g.retro.u.uGlitch.value = 0; g.audio.heart = 0; ui.danger(0);
    g.achieve('caught');
    await V('Again! Again! :)', true);
    L.vp.place(8.5, 2.05, 8.5, Math.PI);
  }
  L.chase.active = false;
  g.audio.heart = 0; ui.danger(0);
  g.control = 'none';
  g.audio.whoosh();
  g.retro.u.uGlitch.value = 0.8;
  await ui.fade(1, 0.8);
  g.retro.u.uGlitch.value = 0;
  g.audio.rain = 0;
  await ui.card([{ t: 'Now I remember why I lied.', cls: 'quote' }, { t: 'And I know exactly what I have to say.', cls: 'quote' }], { dur: 5 });
}
