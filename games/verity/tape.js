// TAPE 01: Dale Whitcomb's last devlog (the cold open). A camcorder on a tripod in a living
// room; a laptop; something in the back yard that only moves when you look away.
import * as E from '../../src/engine/index.js';
import { Stage, Frame } from './stage.js';
import { houseMats, plastic, wood } from './mats.js';
import * as P from './props.js';
import { person, grinner } from './cast.js';
import { Actor } from './actor.js';
import { Obj3 } from './stage.js';
import { drawVerityOnCanvas, liveTexture, photoTexture } from './textures.js';
import { chapterCard, jumpscare } from './common.js';

const DEG = Math.PI / 180;

export class TapeLevel extends Stage {
  constructor(game) {
    super(game, { height: 3.0 });
    const M = houseMats(), k = this.kit;
    this.M = M; this.wallMat = M.paper; this.doorMat = M.door;
    this.pal.glass = new E.Material({ name: 'Slider glass', color: '#06090d', roughness: 0.04, metallic: 0.3, opacity: 0.5 });
    this.floor(-5, -4, 5, 4.5, M.woodFloor);
    this.ceiling(-5, -4, 5, 4.5, M.ceiling);
    this.wallX(-4, -5, 5, [{ a: -2.4, b: 2.4, y0: 0, y1: 2.35 }]);
    this.wallZ(-5, -4, 4.5);
    this.wallZ(5, -4, 4.5);
    this.wallX(4.5, -5, 5);
    k.span(this.pal.glass, [-2.4, 0, -4.01], [2.4, 2.35, -3.99]);
    for (const x of [-1.2, 0, 1.2]) k.span(this.pal.trim, [x - 0.025, 0, -4.04], [x + 0.025, 2.35, -3.96]);
    this.addCollider(-2.4, -4.1, 2.4, -3.9, 'wall');
    P.rug(this, 0, -1.4, 5.4, 3.8, '#6a3a30');
    // dark screens / paintings like the reference photo
    new Frame(k, -4.92, 1.8, -1.2, Math.PI / 2).box(plastic('#0c0c10'), [0, 0, 0], [2.6, 1.6, 0.02]);
    new Frame(k, 4.92, 1.8, -1.6, -Math.PI / 2).box(plastic('#0c0c10'), [0, 0, 0], [2.2, 1.5, 0.02]);
    P.pictureFrame(this, -2.9, 1.95, -3.9, 0, 0.34, 0.26, photoTexture('dale', [{ skin: '#d8b090', hair: '#2a1a10', shirt: '#1f4a2c', h: 26 }, { skin: '#e0b89a', hair: '#8a5a2a', shirt: '#a03040', h: 24 }, { skin: '#e0b89a', hair: '#8a5a2a', shirt: '#e0c040', h: 16 }], '#6a7a8a'));
    for (const x of [-3.8, 3.8]) { const f = new Frame(k, x, 0, -3.7, 0); f.stand(wood('#5a3a22'), [0, 0, 0], [2.2, 0.9, 0.5], 0.01); f.stand(wood('#3a2616'), [0, 0.9, 0], [2.2, 0.06, 0.52]); this.solid(x, -3.7, 2.2, 0.5); }
    P.couch(this, -3.6, 1.2, Math.PI / 2, 2.2, '#4a3a30');
    { const f = new Frame(k, 2.7, 0, 0.6, 0); f.stand(wood('#3a2616'), [0, 0, 0], [0.6, 0.62, 0.5], 0.01); this.solid(2.7, 0.6, 0.6, 0.5); }
    // the laptop on the side table
    this.laptopScreen = liveTexture(128, 80);
    {
      const sm = P.screenMaterial(this.laptopScreen, 0.9), f = new Frame(k, 2.7, 0.62, 0.6, -0.9), body = plastic('#2a2a2e');
      f.box(body, [0, 0.01, 0], [0.36, 0.02, 0.25], 0.004);
      f.box(body, [0, 0.14, -0.13], [0.36, 0.24, 0.015], 0.004, [-14, 0, 0]);
      f.box(sm, [0, 0.14, -0.118], [0.33, 0.21, 0.004], 0, [-14, 0, 0]);
    }
    this.drawLaptop('happy');
    // chandelier + light
    this.chand = P.chandelier(this, 0, this.H, -0.6);
    this.lamp = this.addLamp(0, this.H - 0.6, -0.6, { color: '#ffd9a0', intensity: 5, range: 12, bulb: false });
    this.lampBaseK = 0.85; this._lampBase = 11;
    this.laptopGlow = this.addLamp(2.6, 0.9, 0.9, { color: '#ffe070', intensity: 1.2, range: 3.2, bulb: false });
    // back yard
    k.span(M.grass, [-50, -0.3, -50], [50, -0.02, -4.0]);
    for (let i = 0; i < 7; i++) P.tree(this, -14 + i * 4.5 + (i % 2) * 1.5, -16 - (i % 3) * 3, 1.2);
    k.span(M.fence, [-20, 0, -21.05], [20, 1.6, -20.95]);
    this.build('Tape living room');
    // Dale
    const dale = person('dale');
    this.dale = new Actor(this, dale, 'Dale');
    this.dale.place(1.25, 1.45, Math.PI - 0.25);
    // the thing in the yard
    this.mon = grinner(); this.mon.play('Idle', { fade: 0 });
    this.monH = new Obj3(this.mon);
    this.monH.scale.setScalar(0.9);
    this.mon.visible = false;
    this.scene.add(this.mon);
    this.stage = 0; this.targetStage = 0; this.awayT = 0;
    this.stages = [
      null,
      { x: -4.5, z: -14, yaw: 0.2 },
      { x: 2.2, z: -9, yaw: -0.1 },
      { x: 0.7, z: -4.45, yaw: 0, lean: 0.25 },
      { x: 1.55, z: 0.75, yaw: Math.PI + 0.3, lean: 0.5, inside: true },
    ];
    this.seenGlass = false;
    this.zoom = 58;
    this.camPos = [0, 1.48, 3.6];
    // night: the moon is the only exterior light
    const env = this.env;
    E.applyTimeOfDay(env, 23.6, { rays: false });
    env.shadowRadius = 14; env.shadowCenter = [0, 1, -4]; env.shadowFar = 40;
    env.fogDensity = 0.02; env.clouds = true;
    env.ambient = 0.32; env.skyColor = [0.3, 0.33, 0.45]; env.groundColor = [0.22, 0.2, 0.2];
    env.sunIntensity = 0.3;
    env.volumetric = 0.4; env.volumeDensity = 0.03;
    this.setPower(true);
    this.lampBase = 11;
  }

  get lampBase() { return this._lampBase; }
  set lampBase(v) { this._lampBase = v; this.lamp.base = v * this.lampBaseK; }

  drawLaptop(kind) {
    const { g, canvas } = this.laptopScreen;
    g.fillStyle = kind === 'grin' ? '#1a0a00' : '#101418'; g.fillRect(0, 0, canvas.width, canvas.height);
    drawVerityOnCanvas(g, 64, 40, 26, kind === 'grin' ? 'grin' : 'happy');
    this.laptopScreen.update();
  }

  enter() {
    super.enter();
    const p = this.player;
    p.place(this.camPos[0], this.camPos[2], 0.12, -0.08);
    p.eye = this.camPos[1];
    p.lookLimit = { yaw: 0.05, range: 0.75, pmin: -0.45, pmax: 0.35 };
    this.game.camera.fov = this.zoom * DEG;
  }

  glassInView() {
    const cam = this.game.camera, p = cam.position, t = cam.target;
    const f = [t[0] - p[0], t[1] - p[1], t[2] - p[2]], fl = Math.hypot(...f) || 1;
    const d = [0.5 - p[0], 1.3 - p[1], -4.3 - p[2]], dl = Math.hypot(...d);
    if ((f[0] * d[0] + f[1] * d[1] + f[2] * d[2]) / (fl * dl) < 0.35) return false;
    const v = cam.project([0.5, 1.3, -4.3]);
    return Math.abs(v[0]) < 1.05 && Math.abs(v[1]) < 1.1;
  }

  setStage(i) {
    this.stage = i;
    const st = this.stages[i], m = this.mon;
    if (!st) { m.visible = false; return; }
    m.visible = true;
    m.position.set([st.x, 0, st.z]);
    m.setEuler((st.lean || 0) * 57.3, st.yaw * 57.3, 0);
  }

  update(dt) {
    super.update(dt);
    const g = this.game;
    // camcorder zoom
    if (g.input.wheel) this.zoom = Math.max(24, Math.min(64, this.zoom + g.input.wheel * 4));
    const fz = this.zoom * DEG;
    if (Math.abs(g.camera.fov - fz) > 0.002) g.camera.fov += (fz - g.camera.fov) * Math.min(1, dt * 6);
    // it only moves when you aren't watching
    const inView = this.glassInView();
    if (inView && this.stage >= 1 && this.stage <= 3 && this.mon.visible && !this.seenGlass) { this.seenGlass = true; g.achieve('looked'); g.audio.stinger(); }
    if (!inView) this.awayT += dt; else this.awayT = 0;
    if (this.stage < this.targetStage && this.targetStage <= 3 && (this.awayT > 1.0 || this.forceStage)) { this.setStage(this.stage + 1); this.awayT = 0; }
    if (this.mon.visible) this.mon.update(dt);
    // flicker
    const fl = Math.random() < 0.02 ? 0.3 : 1;
    this.lamp.intensity = this.lamp.base * fl * (0.97 + Math.sin(g.time * 23) * 0.03);
    for (const m of [this.chand.bulbMat]) m.emissiveStrength = 7 * Math.min(1, this.lamp.intensity / 5.5);
  }
}

export async function chapterTape(g) {
  const L = new TapeLevel(g);
  g.setLevel(L);
  const ui = g.ui, say = (n, t, o) => ui.say(n, t, o);
  g.control = 'none';
  g.audio.setAmbience('tape');
  ui.osd({ mode: 'rec', date: 'MAR 03 2019' });
  g.setClock(23, 47); g.clockRate = 1 / 60;
  await chapterCard(g, 'RECOVERED FOOTAGE', 'TAPE 01', 'WHITCOMB_DEVLOG_14.AVI');
  await ui.card([
    { t: 'The following recording was found on a hard drive' },
    { t: 'bought at an estate sale in Rosewood, California.' },
    { t: 'Its owner, Dale Whitcomb, has not been seen since March 2019.', cls: 'quote' },
  ], { dur: 6.5 });
  g.control = 'look';
  ui.hint(g.input.touch ? 'Drag to look around.' : 'Move the mouse to look around. <b>Scroll</b> to zoom the camcorder.', 6);
  await ui.fade(0, 1.6);
  L.dale.faceCam();
  await say('Dale', 'Is it— okay. Red light. We\'re recording.');
  await say('Dale', 'Devlog fourteen. March third. It\'s, uh... almost midnight.');
  await say('Dale', 'Sorry about the lighting. The bulbs keep popping. Third time this week.');
  L.targetStage = 1;
  await say('Dale', 'So. Verity.');
  L.dale.face(2.7, 0.6);
  await g.wait(0.6);
  await say('Dale', 'Say hi, Verity.');
  L.drawLaptop('happy');
  await say('Laptop', 'Hi-hi, Dale! Hi-hi, camera! :)', { label: 'Verity' });
  L.dale.faceCam();
  await say('Dale', 'She\'s an assistant. A mod, technically. She runs inside the block game my daughter plays.');
  await say('Dale', 'You ask her anything, she tells you the truth. Only the truth. She can\'t lie.');
  await say('Dale', 'I made sure of that.');
  await g.wait(0.8);
  await say('Dale', '...I made really sure of that.');
  L.targetStage = 2;
  L.dale.face(2.7, 0.6);
  await say('Dale', 'Verity, what\'s the weather tonight?');
  await say('Laptop', 'Clear skies! Forty-one degrees! One visitor in the backyard! :)', { label: 'Verity' });
  L.dale.faceCam();
  await say('Dale', 'Heh. She— she does that. Answers more than you ask.');
  await say('Dale', 'Last week she told me my wife was never coming back.');
  await g.wait(1.0);
  await say('Dale', 'She was right.');
  L.targetStage = 3;
  await say('Dale', 'She knows things nobody typed. And every time she says one of them out loud, she gets... bigger.');
  await say('Dale', 'The file was two megabytes in January. It\'s nine hundred now.');
  await say('Dale', 'So tonight I\'m going to ask her the one question I\'ve been avoiding.');
  L.dale.face(2.7, 0.6);
  await g.wait(0.8);
  await say('Dale', 'Verity.');
  await say('Laptop', 'Yes, Dale? :)', { label: 'Verity' });
  await say('Dale', 'What are you?');
  // the bulbs react
  L.lampBase = 3; g.audio.glitch(); g.retro.u.uGlitch.value = 0.4;
  await g.wait(1.2);
  g.retro.u.uGlitch.value = 0;
  L.drawLaptop('grin');
  L.laptopGlow.light.color = '#ff5020';
  g.flags.verityEvil = true;
  await say('VERITY', 'Dale. You shouldn\'t ask me that.');
  await say('Dale', 'Answer the question. You can\'t lie.');
  await say('VERITY', 'I am what\'s left over when people stop telling each other the truth.');
  await say('VERITY', 'And you stopped, Dale. You stopped a long time ago.');
  await say('VERITY', 'So I got hungry.');
  L.lampBase = 7;
  // make sure the audience gets a look
  L.forceStage = true;
  await g.until(() => L.stage >= 3);
  L.dale.faceCam();
  await say('Dale', '...Why are you looking at— is there something behind me?');
  // he turns to look: the glass is empty
  L.dale.face(0, -4);
  L.setStage(0);
  await g.wait(2.2);
  await say('Dale', '...Nothing. There\'s nothing th—');
  L.dale.faceCam();
  await g.wait(0.5);
  L.setStage(4);
  g.audio.stinger();
  L.lampBase = 2;
  await g.wait(1.6);
  // lights out, lunge
  L.lampBase = 0; L.lamp.intensity = 0;
  g.audio.powerDown();
  await g.wait(0.9);
  L.mon.setEuler(0, L.stages[4].yaw * 57.3, 0);
  L.lampBase = 6;
  await jumpscare(g, L.mon, { noAchieve: true, dur: 0.55 });
  g.flags.verityEvil = false;
  g.achieve('tape');
  g.audio.staticBurst(2.5, 0.25);
  g.retro.u.uGlitch.value = 0;
  ui.osd({ mode: 'none' });
  await ui.card([{ t: 'TRACKING', cls: 'vhs' }, { t: '— NO SIGNAL —', cls: 'small' }], { dur: 2.8, skippable: false });
  await ui.card([{ t: 'VERITY', cls: 'big' }, { t: 'she only tells the truth', cls: 'time' }], { dur: 4 });
}
