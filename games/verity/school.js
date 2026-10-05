// CHAPTER ONE: LAST BELL. Rosewood High, 3:04 PM. A classroom, a hallway, the front lot.
import * as E from '../../src/engine/index.js';
import { Stage, Frame, Obj3 } from './stage.js';
import { houseMats, plastic, wood, paint, metal, emissive, fabric } from './mats.js';
import * as P from './props.js';
import { person } from './cast.js';
import { Actor } from './actor.js';
import { photoTexture, signTexture, paintTexture } from './textures.js';
import { chapterCard } from './common.js';

const PI = Math.PI, RAD = 180 / PI;
const FAMILY = [
  { skin: '#d8a880', hair: '#141010', shirt: '#3a4a6a', h: 26 },
  { skin: '#dcb08a', hair: '#141010', shirt: '#b03040', h: 22 },
  { skin: '#d8a880', hair: '#141010', shirt: '#4a4e56', h: 21 },
  { skin: '#e2b48c', hair: '#121010', shirt: '#4f9a3f', h: 15 },
];

// a small flat Mesh (stickers, a test paper) that scripts can hide
function flat(w, d, mat, x, y, z, ryDeg = 0) {
  const m = new E.Mesh(E.plane({ width: w, depth: d }), mat, 'Flat');
  m.position.set([x, y, z]); m.setEuler(0, ryDeg, 0); m.castShadow = false;
  return m;
}

export class SchoolLevel extends Stage {
  constructor(game) {
    super(game, { height: 3.0 });
    const M = houseMats(), k = this.kit, H = this.H;
    this.M = M;
    const cinder = paint('#d9d2bd', { pattern: 'brick', patternScale: 8, patternColor: '#b8b09a', patternStrength: 0.35 });
    this.wallMat = cinder; this.doorMat = M.door;
    this.pal.glass = new E.Material({ name: 'Classroom glass', color: '#e8a070', roughness: 0.05, emissive: '#ffb070', emissiveStrength: 1.6 });
    const lino = new E.Material({ name: 'Linoleum', color: '#bdb8a4', roughness: 0.3, pattern: 'checker', patternScale: 12, patternColor: '#8f8b78', patternStrength: 0.9 });
    const ceil = paint('#cfcfc6', { pattern: 'checker', patternScale: 2.4, patternColor: '#b4b4aa', patternStrength: 0.4 });
    const brick = new E.Material({ name: 'Brick', color: '#8a4a3a', roughness: 0.9, pattern: 'brick', patternScale: 6, patternColor: '#4a2a22', patternStrength: 0.7 });
    const locker = new E.Material({ name: 'Locker', color: '#3d5f86', roughness: 0.45, metallic: 0.5, pattern: 'stripes', patternScale: 7, patternColor: '#243a56', patternStrength: 0.8 });
    // floors & ceilings
    this.floor(-5, -8, 5, 0, lino); this.floor(-18, 0, 24, 4, lino);
    this.ceiling(-5, -8, 5, 0, ceil); this.ceiling(-18, 0, 24, 4, ceil);
    // classroom
    this.wallX(-8, -5, 5);
    this.wallZ(-5, -8, 0, [{ a: -7, b: -5.4, y0: 0.9, y1: 2.4 }, { a: -4.6, b: -3, y0: 0.9, y1: 2.4 }, { a: -2.2, b: -0.8, y0: 0.9, y1: 2.4 }]);
    this.wallZ(5, -8, 0);
    // hallway + front of the building
    this.wallX(0, -18, 24, [{ a: 3.5, b: 4.6 }]);
    this.wallX(4, -18, 24);
    this.wallZ(-18, 0, 4);
    this.wallZ(24, 0, 4, [{ a: 1, b: 3, y0: 0, y1: 2.3 }], { mat: brick });
    this.wallZ(24.3, -14, 0, [], { mat: brick, h: 6, t: 0.6 });
    this.wallZ(24.3, 4, 18, [], { mat: brick, h: 6, t: 0.6 });
    k.span(brick, [24, 3, 0], [24.6, 6, 4]);
    // whiteboard + posters
    const wb = (key, w, h, bg, lines, opt) => signTexture(key, w, h, bg, lines, opt);
    new Frame(k, 0, 1.6, -7.9, 0).box(new E.Material({ name: 'Whiteboard', color: '#fff', map: wb('board', 256, 90, '#f2f2ee', [
      { t: 'Ch. 7 — STOICHIOMETRY', y: 16, size: 13, color: '#1a3aa0' },
      { t: 'HW: p. 214, #1-19 (odd)', y: 36, size: 11, color: '#1a3aa0' },
      { t: 'Mole jokes = detention. I mean it.', y: 56, size: 10, color: '#b02020' },
      { t: '— Mr. D', y: 74, size: 10, color: '#b02020' }], { noise: 0.04 }), roughness: 0.3 }), [0, 0, 0], [3.6, 1.25, 0.03]);
    new Frame(k, 0, 0.95, -7.86, 0).box(plastic('#999'), [0, 0, 0], [3.8, 0.05, 0.12]);
    const ptable = paintTexture('ptable', 96, 56, (g) => {
      g.fillStyle = '#e8e4d8'; g.fillRect(0, 0, 96, 56);
      const cols = ['#e89090', '#90c0e8', '#a0e090', '#e8d890', '#c8a0e8'];
      for (let y = 0; y < 7; y++) for (let x = 0; x < 18; x++) {
        if (y === 0 && x > 0 && x < 17) continue;
        if ((y === 1 || y === 2) && x > 1 && x < 12) continue;
        g.fillStyle = cols[(x + y) % 5]; g.fillRect(3 + x * 5, 6 + y * 6, 4, 5);
      }
      g.fillStyle = '#ffd21e'; g.fillRect(58, 30, 4, 5);
      g.fillStyle = '#000'; g.fillRect(59, 31, 1, 1); g.fillRect(61, 31, 1, 1); g.fillRect(59, 33, 3, 1);
    });
    new Frame(k, -3.4, 1.9, -7.9, 0).box(new E.Material({ name: 'Periodic table', color: '#fff', map: ptable }), [0, 0, 0], [1.6, 0.95, 0.02]);
    new Frame(k, 3.4, 2.3, -7.9, 0).box(new E.Material({ name: 'Clock', color: '#fff', map: signTexture('clock', 32, 32, '#f4f4f0', [{ t: '3:04', y: 16, size: 9, color: '#111' }]) }), [0, 0, 0], [0.4, 0.4, 0.03]);
    // desks
    const desk = (x, z) => {
      const f = new Frame(k, x, 0, z, 0), w = wood('#b89a6a'), m = metal('#6a6e74');
      f.box(w, [0, 0.74, 0], [0.62, 0.04, 0.46], 0.006);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(m, [sx * 0.27, 0.36, sz * 0.18], [0.03, 0.72, 0.03]);
      f.box(plastic('#c8782a'), [0, 0.45, 0.45], [0.4, 0.04, 0.38], 0.01); f.box(plastic('#c8782a'), [0, 0.7, 0.62], [0.4, 0.3, 0.04], 0.01);
      for (const sx of [-1, 1]) f.box(m, [sx * 0.17, 0.22, 0.56], [0.025, 0.44, 0.025]);
      this.addCollider(x - 0.3, z - 0.23, x + 0.3, z + 0.25);
    };
    for (const z of [-5, -3.5, -2]) for (const x of [-3.2, -1.2, 0.8, 2.8]) desk(x, z);
    { const f = new Frame(k, 2.6, 0, -6.6, 0); f.stand(wood('#6a4a2a'), [0, 0, 0], [1.6, 0.78, 0.8], 0.01); f.box(new E.Material({ name: 'Test box', color: '#a98456', roughness: 0.95, pattern: 'fabric', patternScale: 90, patternColor: '#7a5c36' }), [-0.4, 0.93, 0], [0.4, 0.3, 0.3]); this.solid(2.6, -6.6, 1.6, 0.8); }
    // Harry's desk: sticker + the test
    const sticker = () => new E.Material({ name: 'Smiley sticker', color: '#ffd21e', emissive: '#3a2a00', emissiveStrength: 1, roughness: 0.4 });
    this.sticker1 = flat(0.07, 0.07, sticker(), -1.05, 0.762, -3.62);
    this.testPaper = flat(0.22, 0.28, new E.Material({ name: 'Test paper', color: '#f4f2ea', roughness: 0.9 }), -1.25, 0.762, -3.62, 12); this.testPaper.visible = false;
    this.scene.add(this.sticker1); this.scene.add(this.testPaper);
    // fluorescent lights
    const tube = emissive('#f4fff0', 3.5);
    const fl = (x, z, rot) => new Frame(k, x, H - 0.04, z, rot).box(tube, [0, 0, 0], [0.2, 0.05, 1.3]);
    for (const [x, z] of [[-2.5, -5.5], [2.5, -5.5], [-2.5, -2], [2.5, -2]]) fl(x, z, 0);
    for (let x = -16; x <= 22; x += 4) fl(x, 2, PI / 2);
    this.addLamp(0, 2.7, -4.5, { color: '#f0fff0', intensity: 7, range: 11, bulb: false });
    this.addLamp(-2, 2.7, -2, { color: '#f0fff0', intensity: 4, range: 8, bulb: false });
    for (const x of [-12, 0, 12, 21]) this.addLamp(x, 2.8, 2, { color: '#eef8ee', intensity: 6, range: 12, bulb: false });
    // lockers
    k.span(locker, [-16, 0, 3.52], [9.99, 1.9, 4]); k.span(locker, [10.51, 0, 3.52], [22, 1.9, 4]);
    this.addCollider(-16, 3.52, 22, 4, 'wall');
    k.box(plastic('#1a2a40'), [10.25, 0.95, 3.78], [0.5, 1.9, 0.44]);
    new Frame(k, 10.25, 1.45, 3.75, PI).box(new E.Material({ name: 'Family photo', color: '#fff', map: photoTexture('family', FAMILY) }), [0, 0, 0], [0.2, 0.15, 0.01]);
    k.box(plastic('#2a2a30'), [10.25, 0.22, 3.8], [0.34, 0.4, 0.2]);
    { // Harry's locker door: a hinged leaf with the number on it
      const lk = this.newKit(); lk.box(new E.Material({ name: 'Locker 217', color: '#4a6a92', roughness: 0.45, metallic: 0.5, pattern: 'stripes', patternScale: 7, patternColor: '#243a56' }), [0.25, 0.95, 0], [0.5, 1.9, 0.03], [0, 0, 0], 0.004);
      lk.box(plastic('#d0d0d0'), [0.42, 1.0, -0.02], [0.03, 0.12, 0.02]);
      this.lockerDoor = lk.toNode('Locker door'); this.lockerDoor.position.set([10.0, 0, 3.52]); this.scene.add(this.lockerDoor); this.lockerAng = 0;
    }
    // hallway posters (on the classroom-side wall of the hall)
    const poster = (key, x, lines, bg, w = 0.6, h = 0.8) => new Frame(k, x, 1.7, 0.09, 0).box(new E.Material({ name: 'Poster ' + key, color: '#fff', map: signTexture(key, 48, 64, bg, lines) }), [0, 0, 0], [w, h, 0.01]);
    const missingTex = signTexture('missing', 48, 64, '#f2f0e6', [{ t: 'MISSING', y: 8, size: 9, color: '#b01010' }, { rect: [12, 14, 24, 26], color: '#c8a888' }, { t: 'TYLER MOSS', y: 46, size: 6, color: '#111' }, { t: 'age 11', y: 53, size: 5, color: '#111' }, { t: 'call anytime', y: 60, size: 4, color: '#333' }]);
    new Frame(k, 6.6, 1.65, 0.09, 0).box(new E.Material({ name: 'Missing poster', color: '#fff', map: missingTex }), [0, 0, 0], [0.6, 0.8, 0.01]);
    this.missingBox = this.hitbox(0.6, 0.8, 0.2, 6.6, 1.25, 0.1);
    poster('formal', 1.6, [{ t: 'FALL', y: 14, size: 11, color: '#ffe8a0' }, { t: 'FORMAL', y: 27, size: 11, color: '#ffe8a0' }, { t: 'OCT 24 · GYM', y: 44, size: 5, color: '#fff' }, { t: 'tickets $15', y: 52, size: 5, color: '#fff' }], '#6a1a4a');
    poster('robotics', -8.5, [{ t: 'ROBOTICS', y: 12, size: 8, color: '#fff' }, { t: 'CLUB', y: 22, size: 8, color: '#fff' }, { t: 'we miss you', y: 38, size: 5, color: '#ffe060' }, { t: 'HARRY', y: 46, size: 7, color: '#ffe060' }, { t: '(not really) -P', y: 56, size: 4, color: '#ddd' }], '#1a3a6a');
    poster('boba', 13.6, [{ t: 'BOBA', y: 14, size: 11, color: '#3a2a1a' }, { t: 'FUNDRAISER', y: 26, size: 6, color: '#3a2a1a' }, { t: 'FRI · QUAD', y: 44, size: 5, color: '#3a2a1a' }], '#e8c8a0');
    poster('kind', -14, [{ t: 'BE', y: 16, size: 11, color: '#fff' }, { t: 'KIND', y: 30, size: 11, color: '#fff' }, { t: '& tell the truth', y: 48, size: 4, color: '#fff' }], '#2a7a5a');
    // classroom doors (decor)
    for (const x of [-12, -4.5, 9, 17]) { const f = new Frame(k, x, 0, 0.09, 0); f.box(M.door, [0, 1.05, 0], [1.0, 2.1, 0.04], 0.006); f.box(plastic('#1a2230'), [-0.2, 1.55, 0.03], [0.25, 0.4, 0.01]); f.box(M.steel, [0.38, 1.0, 0.05], [0.05, 0.05, 0.05]); }
    new Frame(k, -17.9, 0, 2, PI / 2).box(wood('#8a8a90'), [0, 1.15, 0], [1.8, 2.3, 0.04]);
    // water fountain
    { const f = new Frame(k, -2.5, 0, 0.3, 0); f.box(metal('#c8ccd0'), [0, 0.85, 0.1], [0.6, 0.12, 0.4], 0.02); f.box(metal('#9aa0a6'), [0, 0.42, -0.06], [0.5, 0.85, 0.08]); this.solid(-2.5, 0.3, 0.6, 0.4); this.fountainBox = this.hitbox(0.7, 1.0, 0.5, -2.5, 0, 0.3); }
    // trophy case
    { const f = new Frame(k, 19, 0, 0.35, 0); f.box(wood('#3a2616'), [0, 0.5, 0], [1.6, 1.0, 0.4], 0.01); f.box(new E.Material({ name: 'Case glass', color: '#9bb4c0', opacity: 0.25, roughness: 0.05 }), [0, 1.35, 0.02], [1.5, 0.7, 0.3]); for (const x of [-0.5, 0, 0.5]) f.cyl(metal('#d8b040', { roughness: 0.2 }), [x, 1.2, 0.02], 0.07, 0.25, 10, 0.02); this.solid(19, 0.35, 1.6, 0.4); this.trophyBox = this.hitbox(1.6, 1.4, 0.5, 19, 0, 0.35); }
    // mop bucket + wet floor sign
    { const f = new Frame(k, -6.2, 0, 1.3, 0); f.cyl(plastic('#e8c020'), [0, 0.2, 0], 0.22, 0.4, 10, 0.18); f.cyl(wood('#8a6a4a'), [0.15, 0.7, 0.1], 0.015, 1.4, 5, 0.015, [0, 0, 14]); this.solid(-6.2, 1.3, 0.5, 0.5); }
    new Frame(k, -8.5, 0, 2.2, 0.4).box(new E.Material({ name: 'Wet floor', color: '#fff', map: signTexture('wet', 24, 32, '#f0d020', [{ t: 'CAUTION', y: 8, size: 5, color: '#111' }, { t: 'WET', y: 18, size: 8, color: '#111' }, { t: 'FLOOR', y: 26, size: 6, color: '#111' }]) }), [0, 0.35, 0], [0.5, 0.7, 0.03]);

    // ------------------------------------------------------------ outside
    k.span(M.asphalt, [31, -0.28, -14], [90, -0.01, 18]);
    k.span(new E.Material({ name: 'Sidewalk', color: '#a8a49a', roughness: 0.95, pattern: 'checker', patternScale: 3, patternColor: '#8e8a80', patternStrength: 0.5 }), [24, -0.28, -14], [31, -0.01, 18]);
    k.span(M.grass, [24, -0.3, -50], [100, -0.02, -14]); k.span(M.grass, [24, -0.3, 18], [100, -0.02, 50]);
    for (let z = -12; z <= 16; z += 5) k.box(plastic('#d8d8d0'), [40, 0.005, z], [0.1, 0.01, 2.5]);
    new Frame(k, 24.62, 3.3, 2, PI / 2).box(new E.Material({ name: 'RHS sign', color: '#fff', map: signTexture('rhs', 128, 20, '#1a2a4a', [{ t: 'ROSEWOOD HIGH SCHOOL', y: 10, size: 10, color: '#e8d8a0' }]) }), [0, 0, 0], [4.2, 0.6, 0.02]);
    { // bench where Eric waits
      const f = new Frame(k, 28.5, 0, 7.5, -PI / 2), w = wood('#6a4a2a');
      f.box(w, [0, 0.45, 0], [1.6, 0.06, 0.4], 0.008); f.box(w, [0, 0.8, -0.2], [1.6, 0.4, 0.05], 0.008);
      for (const sx of [-0.7, 0.7]) f.box(metal('#2a2a2e'), [sx, 0.22, 0], [0.05, 0.44, 0.36]);
      this.addCollider(28.2, 6.6, 28.9, 8.4);
    }
    this.sticker2 = flat(0.08, 0.08, sticker(), 28.45, 0.485, 7.1); this.scene.add(this.sticker2);
    P.carProp(this, 36, 2, 0, '#8a98a8');
    for (const [x, z, c] of [[36, -6, '#8a2020'], [36, 10, '#d8d8d0'], [44, 2, '#2a2a30'], [44, -9, '#3a5a3a']]) P.carProp(this, x, z, 0, c);
    for (const [x, z, s] of [[27, -12, 1], [29, -6, 1.1], [27, 14, 1.2], [30, 16, 1], [50, -12, 1.2], [52, 14, 1], [58, 0, 1.1]]) P.tree(this, x, z, s);
    for (const [x, z] of [[26, -3], [26, 10]]) k.shape(M.plant, { type: 'sphere', radius: 0.5, widthSegments: 8, heightSegments: 6 }, [], [x, 0.4, z], [0, 0, 0], [1.2, 0.8, 1.2]);
    for (const z of [-8, 12]) P.lampPost(this, 31, z, false);
    this.addCollider(24.6, -14.5, 60, -14, 'wall'); this.addCollider(24.6, 18, 60, 18.5, 'wall'); this.addCollider(56, -14, 56.5, 18, 'wall');
    this.build('Rosewood High');

    this.surfaceAt = (x) => (x > 24.4 ? 'concrete' : 'tile');

    // environment: low sun, orange sky
    const env = this.env;
    E.applyTimeOfDay(env, 17.7, { rays: false });
    env.shadowRadius = 30; env.shadowCenter = [20, 1, 2]; env.shadowFar = 80;
    env.fogDensity = 0.004; env.clouds = true;
    env.skyColor = [0.62, 0.56, 0.52]; env.groundColor = [0.5, 0.44, 0.38]; env.ambient = 0.62;
    env.volumetric = 0.3;

    // ------------------------------------------------------------ people
    this.delgado = new Actor(this, person('delgado'), 'Mr. Delgado'); this.delgado.place(2.6, -7.3, 0);
    this.priya = new Actor(this, person('priya'), 'Priya'); this.priya.place(-3.2, -3.15, PI); this.priya.sit(true, -0.36);
    this.students = [];
    [[0.8, -3.5], [2.8, -5], [-1.2, -5], [0.8, -2], [2.8, -2]].forEach(([x, z], i) => {
      const a = new Actor(this, person('student', { seed: i * 13 + 3 }), 'student'); a.place(x, z + 0.35, PI); a.sit(true, -0.4); this.students.push(a);
    });
    this.gus = new Actor(this, person('gus'), 'Gus'); this.gus.place(-7, 1.6, PI / 2);
    this.eric = new Actor(this, person('ericBackpack'), 'Eric'); this.eric.place(28.5, 7.5, -PI / 2); this.eric.sit(true, -0.2);
    this.t = 0; this.chirpT = 12; this.lockerOpen = false;
  }

  enter() { super.enter(); this.game.camera.far = 400; }

  update(dt) {
    super.update(dt);
    this.t += dt;
    this.chirpT -= dt;
    if (this.chirpT <= 0) { this.chirpT = 18 + Math.random() * 10; this.game.audio.tone({ f: 3200, type: 'sine', dur: 0.08, vol: 0.03 }); }
    const tgt = this.lockerOpen ? -1.7 : 0;
    this.lockerAng += (tgt - this.lockerAng) * Math.min(1, dt * 8);
    this.lockerDoor.setEuler(0, this.lockerAng * RAD, 0);
  }
}

export async function chapterSchool(g) {
  const L = new SchoolLevel(g);
  g.setLevel(L);
  const ui = g.ui, say = (n, t, o) => ui.say(n, t, o), think = (t) => ui.think(t);
  const P_ = L.player;
  g.control = 'none';
  g.setClock(15, 4); g.clockRate = 1 / 8;
  g.audio.setAmbience('school');
  ui.osd({ mode: 'play', date: 'TUE OCT 13 2026' });
  await chapterCard(g, 'CHAPTER ONE', 'LAST BELL', 'TUESDAY · OCTOBER 13 · 3:04 PM');
  // seated at the desk
  P_.place(-1.2, -3.15, 0, -0.25);
  P_.eye = 1.12;
  P_.lookLimit = { yaw: 0, range: 1.5, pmin: -1.0, pmax: 0.6 };
  g.control = 'look';
  await ui.fade(0, 1.2);
  ui.hint(g.input.touch ? 'Drag to look around.' : 'Click to capture the mouse, then look around.', 4);
  await g.wait(1.2);
  L.delgado.walkPath([[1.6, -6.2], [0.3, -4.4], [-0.35, -3.6]], 1.1);
  await g.wait(1.0);
  await say('Mr. Delgado', 'Unit six tests. Some of you studied. Some of you... had other priorities.');
  await g.until(() => L.delgado.arrived);
  L.delgado.faceCam();
  L.testPaper.visible = true;
  g.audio.paper();
  await say('Mr. Delgado', 'Mr. Zhong.');
  await ui.note(`
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><b>CHEM 2 · UNIT 6 TEST</b><span>Name: <u>Harry Zhong</u> · Per. 6</span></div>
    <p>1. How many moles are in 36 g of H₂O? &nbsp;<u>2 mol</u> ✓</p>
    <p>2. Balance: C₃H₈ + O₂ → CO₂ + H₂O &nbsp;<u>(blank)</u> ✗</p>
    <p>3. Identify the limiting reagent in... &nbsp;<u>idk</u> ✗</p>
    <p>4. Calculate the percent yield of... &nbsp;<u>my brother has a dentist appt at 4 i have to go</u> ✗</p>
    <div style="display:flex;align-items:center;gap:18px"><span class="grade">64</span><span class="see">See me. — D.</span></div>`, { style: 'test' });
  await say('Mr. Delgado', 'Sixty-four. Last year you were my best student. This year your brain is somewhere else.');
  const c1 = await ui.choose(["It's been a weird year.", 'My brain is on vacation.', '(Say nothing.)']);
  if (c1 === 0) {
    await say('Mr. Delgado', '...Yeah. I heard some things. My door is open if you want to talk. About anything.');
    g.flags.delgadoKind = true;
  } else if (c1 === 1) {
    await say('Mr. Delgado', 'Tell it to come back before the final. It has a round-trip ticket.');
    await say('Priya', '*snort*');
  } else {
    await say('Mr. Delgado', '...Right.');
  }
  L.delgado.walkPath([[0.3, -4.4], [1.6, -6.4], [2.6, -7.3]], 1.1).then(() => L.delgado.face(0, 0)).catch(() => {});
  P_.lookLimit.yaw = 0.8;
  await g.wait(0.4);
  await say('Priya', 'Dude. Sixty-four? You literally tutored me last year.');
  await say('Harry', 'Tutored. Past tense. I\'ve been busy.');
  await say('Priya', 'With what? You quit robotics. You skip boba. You\'re like a ghost with a backpack.');
  await say('Harry', 'I have a nine-year-old brother and a mom who works doubles. I\'m a ghost with a job.');
  await say('Priya', '...Okay, ghost.');
  // the bell
  g.audio.bell();
  P_.shake = 0.3;
  await g.wait(1.0);
  await say('Mr. Delgado', 'Chapter seven by Thursday! And would somebody please tell me why that smoke detector keeps chirping!');
  // everyone leaves
  L.students.forEach((a, i) => {
    a.sit(false);
    setTimeout(() => a.walkPath([[a.pos.x > 0 ? 3.8 : 3.4, -1], [4, 0.6], [4 - 6 - i * 2, 2.2 + (i % 2) * 0.8], [-17, 2]], 1.5 + i * 0.1).then(() => { a.visible = false; }).catch(() => {}), i * 450);
  });
  L.priya.sit(false);
  L.priya.walkPath([[-3.2, -1.2], [3.4, -1], [4, 0.6], [12.5, 2.6], [12.5, 3.1]], 1.3).then(() => L.priya.face(12.5, 4)).catch(() => {});
  ui.bark('Priya', 'See you tomorrow, ghost.');
  // stand up
  const t0 = g.time;
  await g.until(() => { P_.eye = 1.12 + Math.min(1, (g.time - t0) / 0.8) * 0.5; return g.time - t0 > 0.8; });
  P_.lookLimit = null;
  P_.place(-1.2, -2.7, P_.yaw, P_.pitch);
  g.control = 'walk';
  g.input.setTouchMode('walk');
  ui.crosshair(true);
  ui.setObjective('Grab your stuff from locker 217');
  ui.hint(g.input.touch ? 'Left thumb to move. Tap <b>USE</b> to interact.' : '<b>WASD</b> to move · <b>E</b> to interact · <b>Shift</b> to run', 6);

  // --------------------------------------------------- optional stuff
  L.optional(L.hitbox(0.3, 0.2, 0.3, -1.05, 0.72, -3.62), 'sticker1', 'Smiley sticker', async () => {
    await think('Someone stuck a smiley sticker on my desk. There\'s tiny writing on the back.');
    L.sticker1.visible = false; L.enable('sticker1', false);
    await g.collectSticker('s1');
  }, { range: 2.2 });
  L.optional(L.hitbox(3.6, 1.3, 0.2, 0, 0.95, -7.9), 'board', 'Read the whiteboard', async () => {
    await think('"Mole jokes equal detention." He says that every year. Someone always makes a mole joke.');
    await think('It\'s usually me. Was me.');
  });
  L.optional(L.hitbox(1.6, 1.0, 0.2, -3.4, 1.4, -7.9), 'ptable', 'Look at the periodic table', async () => {
    await think('Somebody drew a smiley face on gold. Au. It\'s yellow. It\'s smiling.');
    await think('...Weird thing to notice.');
  });
  L.optional(L.hitbox(1.6, 1.6, 0.4, -5.2, 0.9, -4), 'windows', 'Look outside', async () => {
    await think('The sun\'s already going down. October in Rosewood. It gets dark at like six now.');
  });
  L.optional(L.delgado, 'delgado', 'Talk to Mr. Delgado', async () => {
    L.delgado.faceCam();
    await say('Mr. Delgado', 'Your mom still at Rosewood General? She took care of my dad last spring. Tell her I said thanks.');
    await say('Harry', 'She\'s at Rosewood General a lot. Like, a lot a lot.');
    await say('Mr. Delgado', '...Go home, Zhong. Eat something. Do chapter seven.');
    L.delgado.face(0, 0);
  });
  L.optional(L.missingBox, 'missing', 'Read the poster', async () => {
    await think('MISSING. Tyler Moss, age 11. Last seen Sunday night.');
    await think('He lives on Birch. Two streets from us. Eric\'s friend Jayden knows him.');
    await think('The picture is from school photo day. He\'s trying really hard to smile.');
  });
  L.optional(L.fountainBox, 'fountain', 'Drink from the fountain', async () => {
    g.audio.noise({ f: 1200, q: 0.5, dur: 1.2, vol: 0.05 });
    await think('Tastes like pennies and regret.');
    g.achieve('fountain');
  });
  L.optional(L.trophyBox, 'trophy', 'Look at the trophy case', async () => {
    await think('Robotics, regional finalists, last year. That\'s me in the photo, holding the robot like a baby.');
    await think('Priya named it "Sir Beeps-a-Lot." I wanted "The Destroyer." We compromised on Sir Beeps-a-Lot.');
    await think('That was before July.');
  });
  L.optional(L.gus, 'gus', 'Talk to Gus', async () => {
    L.gus.faceCam();
    await say('Gus', 'Careful, Zhong. Floor\'s wet. I just did that whole stretch.');
    await say('Gus', 'Hey. You live over on Alder, right? That Moss kid was two streets over.');
    await say('Gus', 'Lady cop came by today asking if he ever talked about some game. Some "assistant" thing he played with at night.');
    await say('Harry', 'An assistant? Like Siri?');
    await say('Gus', 'Didn\'t say. Kids and their computers. Get home safe, okay? Before dark.');
    L.gus.face(-8, 1.6);
  });
  L.optional(L.priya, 'priya', 'Talk to Priya', async () => {
    L.priya.faceCam();
    const c = await ui.choose(['Boba later?', 'Can I ask you something weird?', 'Never mind.'], { prompt: 'Priya\'s spinning her combination lock.' });
    if (c === 0) {
      await say('Priya', 'YOU are asking ME to boba? ...Wait. Let me guess. Eric.');
      await say('Harry', 'Eric.');
      await say('Priya', 'Tell him his Minecraft house looks like a shoebox.');
      await say('Harry', 'He\'s going to cry.');
      await say('Priya', 'Good. Character building.');
    } else if (c === 1) {
      await say('Harry', 'If you knew something that would hurt someone... would you tell them?');
      await say('Priya', '...Would it hurt them more later?');
      await say('Harry', 'Probably.');
      await say('Priya', 'Then you already know the answer, ghost. You just don\'t like it.');
      g.flags.priyaAdvice = true;
    } else {
      await say('Priya', 'Bye, weirdo.');
    }
    L.priya.face(12.5, 4);
  });
  for (const x of [-12, -4.5, 9, 17]) L.optional(L.hitbox(1, 2.1, 0.2, x, 0, 0.1), 'door' + x, 'Classroom door', async () => { g.audio.locked(); await think('Locked. Everyone else already went home. Must be nice.'); });
  L.optional(L.hitbox(0.2, 2.3, 1.8, -17.9, 0, 2), 'gym', 'Gym doors', async () => { g.audio.locked(); await think('The gym is locked. Thank god.'); });

  // --------------------------------------------------- the locker
  L.addInteract(L.hitbox(0.5, 1.9, 0.3, 10.25, 0, 3.4), { id: 'locker', prompt: 'Open locker 217' });
  await L.waitUse('locker');
  L.enable('locker', false);
  g.audio.door(true);
  L.lockerOpen = true;
  await g.wait(0.5);
  await think('Backpack. Car keys. The photo I taped up last spring.');
  const img = photoTexture('family', FAMILY).image.toDataURL();
  await ui.note(`<img src="${img}" alt="A family photo: Mom, Dad, Harry and Eric."><p>Chinese New Year. All four of us.<br>Dad did the lion dance with a dish towel on his head.</p>`, { style: 'photo' });
  await think('...Okay. Keys. Go.');
  L.lockerOpen = false;
  g.audio.door(false);
  // Mom texts
  await g.wait(0.6);
  ui.phoneNotify('Mom', 'Harry pick up Eric 3:15!!! 🙏');
  await g.wait(1.4);
  ui.phoneNotify('Mom', 'Im on double shift tonight. dumplings in freezer. Eric homework BEFORE games', { silent: true });
  ui.phoneNotify('Mom', "don't tell Eric about the call with your dad. I will do it this weekend. I promise", { silent: true });
  ui.phoneNotify('Mom', '爱你 ❤️');
  await g.wait(0.8);
  await ui.openPhone();
  const r = await ui.choose(['Reply: "ok"', 'Reply: "ok. love you too"', 'Reply: "when is \'this weekend\' going to be, Ma"']);
  const reply = ['ok', 'ok. love you too', "when is 'this weekend' going to be, Ma"][r];
  ui.phoneNotify('Harry', reply, { me: true, silent: true });
  g.audio.click();
  if (r === 2) { await g.wait(1.2); ui.phoneNotify('Mom', 'Harry. Please.'); g.flags.pushedMom = true; }
  await think('She\'s been saying "this weekend" since July.');
  ui.setObjective('Pick up Eric out front');
  // outside: Eric
  L.optional(L.hitbox(0.4, 0.2, 0.4, 28.45, 0.45, 7.1), 'sticker2', 'Smiley sticker', async () => {
    await think('Another one of those stickers. On the bench where Eric sits.');
    L.sticker2.visible = false; L.enable('sticker2', false);
    await g.collectSticker('s2');
  });
  L.enable('sticker2', false);
  await g.until(() => P_.pos.x > 24.3);
  g.audio.setAmbience('outside');
  ui.setObjective('Pick up Eric');
  await g.until(() => Math.hypot(P_.pos.x - 28.5, P_.pos.z - 7.5) < 5.5);
  g.control = 'look';
  L.eric.sit(false);
  await L.eric.walkTo(P_.pos.x + 1.4, P_.pos.z + 0.4, 2.6);
  L.eric.faceCam();
  const E_ = (t) => say('Eric', t), H = (t) => say('Harry', t);
  await E_('HARRY. You\'re four minutes late. I could have been kidnapped.');
  await H('Nobody would kidnap you. They\'d have to listen to you.');
  await E_('Rude. ANYWAY. Did you see TheBlockBoyz\' new video?');
  await H('I don\'t watch TheBlockBoyz, Eric. I\'m sixteen.');
  await E_('There\'s a new mod. It\'s called VERITY. It\'s an AI assistant, in Minecraft, and you can ask it ANYTHING and it tells you the TRUTH.');
  await E_('It\'s a little yellow ball with a smiley face. It\'s so cute, Harry.');
  await H('Is this like the Herobrine seed?');
  await E_('That was REAL. Jayden saw him! ...Okay, this one is actually real. TheBlockBoyz asked it his mom\'s maiden name and it KNEW.');
  await H('That\'s a security question, Eric. That\'s how you get hacked.');
  await E_('Can we play it tonight? Pleeeeease? You never play with me anymore.');
  const c2 = await ui.choose(['"Homework first."', '"Fine. One hour."', '"We\'ll see."']);
  if (c2 === 0) { await E_('I DID it. At lunch. Mostly.'); await H('Mostly.'); await E_('The math was mostly. The spelling was fully.'); }
  else if (c2 === 1) { await E_('YESSS. You\'re the best brother in the whole solar system.'); await H('I\'m your only brother.'); await E_('Still counts.'); }
  else { await E_('"We\'ll see" means yes. When Mom says "we\'ll see" it means yes. It\'s genetic.'); }
  await E_('Also you have to carry my backpack. My arms are tired from learning.');
  await H('Get in the car.');
  L.eric.walkTo(35.1, 4.2, 2.4).then(() => { L.eric.visible = false; g.audio.carDoor(); }).catch(() => {});
  L.enable('sticker2', true);
  g.control = 'walk';
  ui.setObjective('Get in the car');
  L.addInteract(L.hitbox(0.4, 1.4, 1.4, 35.0, 0, 1.6), { id: 'car', prompt: 'Drive home', range: 2.6 });
  await L.waitUse('car');
  g.control = 'none';
  g.audio.carDoor();
  ui.setObjective(null);
  ui.crosshair(false);
  await ui.fade(1, 1.2);
}
