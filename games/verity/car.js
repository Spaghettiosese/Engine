// CHAPTER TWO: THE DRIVE HOME. Mom's old Camry, Rosewood at dusk. The street is three long
// chunks of merged scenery (houses, trees, lamps, parked cars) that scroll past the windshield.
import * as E from '../../src/engine/index.js';
import { Stage, Frame } from './stage.js';
import { houseMats, plastic, emissive } from './mats.js';
import * as P from './props.js';
import { person } from './cast.js';
import { Actor } from './actor.js';
import { signTexture } from './textures.js';
import { chapterCard } from './common.js';

const PI = Math.PI;
const CHUNK = 64, NCH = 3, SPAN = CHUNK * NCH;

export class CarLevel extends Stage {
  constructor(game) {
    super(game, { height: 3 });
    const M = houseMats(), k = this.kit;
    this.M = M;
    this.speed = 12;
    // static ground
    k.span(M.asphalt, [-4.5, -0.3, -140], [4.5, -0.01, 300]);
    k.span(new E.Material({ name: 'Sidewalk', color: '#a8a49a', roughness: 0.95 }), [-7, -0.3, -140], [-4.5, 0.02, 300]);
    k.span(new E.Material({ name: 'Sidewalk', color: '#a8a49a', roughness: 0.95 }), [4.5, -0.3, -140], [7, 0.02, 300]);
    k.span(M.grass, [-90, -0.4, -140], [-7, -0.02, 300]); k.span(M.grass, [7, -0.4, -140], [90, -0.02, 300]);
    this.build('Road');
    this.interior = P.carInterior(this, '#8a98a8', true);
    this.scene.add(this.interior);
    // scrolling scenery: each chunk is one merged node
    const colors = ['#8a98a8', '#a89a80', '#98a888', '#b8a8a0', '#7a8a9a', '#c8b898'];
    this.chunks = [];
    for (let c = 0; c < NCH; c++) {
      const ck = this.newKit(), ctx = { kit: ck, pal: this.pal, scene: this.scene, solid() {}, newKit: () => ck };
      for (let i = 0; i < 4; i++) {
        P.houseFacade(ctx, -16, i * 16 + 4, PI / 2, colors[(i + c * 4) % 6], (i + c) % 3 !== 1);
        P.houseFacade(ctx, 16, i * 16 + 12, -PI / 2, colors[(i + c * 4 + 3) % 6], (i + c) % 2 === 0);
      }
      for (let i = 0; i < 6; i++) P.tree(ctx, (i % 2 ? 9 : -9) + (i % 3) * 0.6, i * 11 + 3, 0.9);
      for (let i = 0; i < 2; i++) P.lampPost(ctx, i % 2 ? 5.8 : -5.8, i * 32 + 8, true);
      for (let z = 0; z < CHUNK; z += 8) { ck.box(plastic('#d8d070'), [0, 0.012, z + 2], [0.14, 0.012, 3]); }
      for (let z = 0; z < CHUNK; z += 6) { for (const s of [-1, 1]) ck.box(plastic('#8a867c'), [s * 5.75, 0.025, z], [2.5, 0.01, 0.05]); }
      if (c % 2 === 0) P.carProp(ctx, c ? 5.6 : -5.6, 20 + c * 7, 0, colors[(c * 2) % 6], ck, false);
      if (c === 1) {
        ck.box(plastic('#3a3a3a'), [-11, 2.5, 30], [0.25, 5, 0.25]);
        new Frame(ck, -11, 6, 30.2, PI * 0.15).box(new E.Material({ name: 'Billboard', color: '#fff', map: signTexture('hospital', 128, 48, '#e8eef4', [{ t: 'ROSEWOOD GENERAL', y: 14, size: 13, color: '#1a4a8a' }, { t: 'We\'re here for you. 24/7.', y: 32, size: 9, color: '#333' }]) }), [0, 0, 0], [8, 3, 0.1]);
      }
      const node = ck.toNode('Street chunk ' + c);
      node.position.set([0, 0, -CHUNK + c * CHUNK]);
      this.scene.add(node); this.chunks.push(node);
    }
    // police car (hidden until the script calls it)
    { const pk = this.newKit(), ctx = { kit: pk, pal: this.pal, solid() {} };
      P.carProp(ctx, 0, 0, 0, '#1a1a1e', pk, false);
      this.redM = new E.Material({ name: 'Police red', color: '#ff3030', emissive: '#ff2020', emissiveStrength: 0 });
      this.blueM = new E.Material({ name: 'Police blue', color: '#3050ff', emissive: '#2040ff', emissiveStrength: 0 });
      pk.box(this.redM, [-0.4, 1.5, -0.2], [0.5, 0.1, 0.3]); pk.box(this.blueM, [0.4, 1.5, -0.2], [0.5, 0.1, 0.3]);
      this.police = pk.toNode('Police car'); this.police.position.set([5.6, 0, 400]);
      this.policeLight = new E.Light('point', { color: '#ff2020', intensity: 0, range: 14 }); this.policeLight.position.set([0, 2, 0]); this.police.add(this.policeLight);
      this.scene.add(this.police);
      const sk = this.newKit();
      sk.box(plastic('#5a4a3a'), [0, 0.8, 0], [0.08, 1.6, 0.08]);
      new Frame(sk, 0, 1.5, 0.05, 0).box(new E.Material({ name: 'Missing sign', color: '#fff', map: signTexture('missing2', 48, 64, '#eeeae0', [{ t: 'MISSING', y: 8, size: 9, color: '#b01010' }, { t: 'TYLER', y: 44, size: 7, color: '#111' }, { t: 'MOSS', y: 54, size: 7, color: '#111' }]) }), [0, 0, 0], [0.5, 0.66, 0.02]);
      this.tylerSign = sk.toNode('Tyler sign'); this.tylerSign.position.set([6.6, 0, 400]); this.tylerSign.setEuler(0, -90, 0); this.scene.add(this.tylerSign);
    }
    this.policeOn = false;
    this.dash = this.addLamp(0, 0.95, 0.8, { color: '#ff9a40', intensity: 1.2, range: 2.2, bulb: false });
    // Eric riding shotgun
    this.eric = new Actor(this, person('ericBackpack'), 'Eric');
    this.eric.place(0.75, -0.05, 0.1); this.eric.sit(true, -0.2);
    this.t = 0; this.talkLook = 0;
    const env = this.env;
    E.applyTimeOfDay(env, 18.1, { rays: false });
    env.fogDensity = 0.005; env.clouds = true; env.shadowRadius = 20; env.shadowCenter = [0, 0, 10]; env.shadowFar = 60;
    env.skyColor = [0.62, 0.5, 0.52]; env.groundColor = [0.36, 0.3, 0.3]; env.ambient = 0.72;
    env.volumetric = 0.2;
  }

  enter() {
    super.enter();
    this.game.camera.far = 500;
    const p = this.player;
    p.place(0, -0.05, PI, -0.08);
    p.eye = 1.16;
    p.lookLimit = { yaw: PI, range: 1.7, pmin: -0.7, pmax: 0.45 };
    this.game.control = 'look';
  }

  update(dt) {
    super.update(dt);
    this.t += dt;
    const d = this.speed * dt;
    for (const n of this.chunks) { n.position[2] -= d; if (n.position[2] < -CHUNK - 8) n.position[2] += SPAN; }
    if (this.policeOn) { this.police.position[2] -= d; this.tylerSign.position[2] -= d; }
    // road feel
    this.interior.position[1] = Math.sin(this.t * 13) * 0.004 + Math.sin(this.t * 3.1) * 0.006;
    // police lights
    if (this.policeOn) {
      const ph = Math.floor(this.t * 6) % 2;
      this.policeLight.intensity = 9; this.policeLight.color = ph ? '#ff2020' : '#2040ff';
      this.redM.emissiveStrength = ph ? 6 : 0.3; this.blueM.emissiveStrength = ph ? 0.3 : 6;
    }
    // Eric turns to Harry when he talks
    const talking = this.eric.talkT > 0;
    this.talkLook += ((talking ? 1 : 0) - this.talkLook) * Math.min(1, dt * 5);
    this.eric.targetYaw = 0.1 - this.talkLook * 0.95;
  }
}

export async function chapterDrive(g) {
  const L = new CarLevel(g);
  g.setLevel(L);
  const ui = g.ui, say = (n, t, o) => ui.say(n, t, o), E_ = (t) => say('Eric', t), H = (t) => say('Harry', t);
  g.setClock(15, 22); g.clockRate = 1 / 6;
  g.audio.setAmbience('car');
  ui.osd({ mode: 'play', date: 'TUE OCT 13 2026' });
  await chapterCard(g, 'CHAPTER TWO', 'THE DRIVE HOME', '3:22 PM');
  g.control = 'look';
  ui.hint(g.input.touch ? 'Drag to look around.' : 'Look around while you drive.', 4);
  await ui.fade(0, 1.5);
  g.audio.radioTune();
  await g.wait(0.6);
  const radio = async (t) => { g.audio.radioVoice(Math.min(4, t.length / 18)); await say('Radio', t, { label: 'KRSW 88.1' }); };
  await radio('—eighty-eight point one, KRSW. Rosewood news at the half hour.');
  await radio('Police are still asking for information about eleven-year-old Tyler Moss, missing since Sunday night.');
  await radio('His mother says he was playing a video game in his room. When she checked on him, the game was still running. Tyler was gone.');
  await radio('Investigators say the only thing on the screen was a— a smiley face—');
  g.audio.radioTune();
  await E_('Boring. Music.');
  g.audio.radioMusic = true;
  await E_('Tyler\'s in Jayden\'s cousin\'s class. Jayden says he ran away to become a streamer.');
  await H('You can\'t run away to become a streamer. You need Wi-Fi.');
  await E_('That\'s what I SAID.');
  await g.wait(1.5);
  await E_('Harry.');
  await H('What.');
  await E_('Is Dad calling tonight?');
  const c = await ui.choose(['"He\'s busy. It\'s morning in Shenzhen."', '"I don\'t know, bud."', '"...Want McDonald\'s?"']);
  if (c === 0) {
    g.flags.truth = (g.flags.truth || 0) - 1;
    await E_('He\'s always busy.');
    await ui.think('Shenzhen. We\'ve been saying Shenzhen for three months. It\'s forty minutes away. It\'s San Jose.');
  } else if (c === 1) {
    await E_('You always say that.');
    await ui.think('Because "I don\'t know" is technically true. I don\'t know if he\'s calling. I know where he is.');
  } else {
    await E_('Mom said dumplings.');
    await H('Mom\'s not here.');
    await E_('...Are you trying to bribe me?');
    await H('Yes.');
    await E_('Twenty-piece nuggets.');
    await H('We\'ll see.');
    await E_('That means yes. ...You didn\'t answer about Dad, though.');
  }
  await E_('When he comes back for New Year I\'m gonna show him my castle. It has a moat. With lava in it.');
  await g.wait(1.2);
  await E_('Verity could tell us when he\'s coming back. It knows EVERYTHING.');
  await H('It\'s a Minecraft mod, Eric. It doesn\'t know when Dad\'s coming back.');
  await E_('Bet.');
  // police
  L.police.position[2] = 70; L.tylerSign.position[2] = 64; L.policeOn = true;
  await g.until(() => L.police.position[2] < 26);
  await E_('Whoa. Cops.');
  await g.until(() => L.police.position[2] < 6);
  await E_('...That\'s Tyler\'s house.');
  g.audio.radioMusic = false;
  g.audio.click();
  await g.wait(2.0);
  await H('Lock your door tonight.');
  await E_('We don\'t have locks on our doors.');
  await H('Then... lock your heart.');
  await E_('What does that even MEAN.');
  await H('I don\'t know. It sounded cool.');
  await E_('It did NOT.');
  await g.wait(1.4);
  await E_('Harry?');
  await H('What.');
  await E_('Thanks for picking me up. Every day.');
  await H('...Yeah. Of course.');
  await g.wait(0.8);
  // slow down, pull in
  const t0 = g.time;
  await g.until(() => { L.speed = Math.max(0, 12 - (g.time - t0) * 4); return L.speed <= 0; });
  await ui.fade(1, 1.2);
}
