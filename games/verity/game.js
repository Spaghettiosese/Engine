// The game: loop, level switching, save data, achievements, chapter flow. Rendering is the
// ShapeForge engine's; this class owns the story-facing pieces around it.
import * as E from '../../src/engine/index.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { UI } from './ui.js';
import { Director, Cancelled } from './director.js';
import { McHud } from './mchud.js';
import { Desktop } from './desktop.js';
import { Menus } from './menus.js';
import { Fx } from './fx.js';
import { CHAPTERS } from './chapters.js';
import { TitleLevel } from './title.js';
import { STICKERS } from './lore.js';

const SAVE_KEY = 'verity-sf-save-v1';
const DEG = Math.PI / 180;

export const ACHIEVEMENTS = {
  tape: ['Tracking', "Watch Dale's last tape."],
  looked: ['I Saw It', 'Catch the figure in the glass.'],
  fountain: ['Pennies and Regret', 'Drink from the school fountain.'],
  shoes: ['House Rules', 'Take your shoes off at the door.'],
  noshoes: ['Mom Will Know', 'Walk into the house wearing shoes.'],
  nainai: ['Respect', "Bow to Nai Nai's portrait."],
  kevin: ['Kevin?', 'Talk to the smart speaker.'],
  dumplings: ['Three Cold Waters', 'Cook the dumplings the right way.'],
  homework: ['Supervised', "Get 5/5 on Eric's math homework."],
  priya: ['Boba Later', 'Tell Priya the truth (sort of).'],
  piano: ['Two Tigers', 'Play the piano.'],
  homeVideos: ['Be Kind, Rewind', 'Watch all three home videos.'],
  beatEric: ['World Record', "Beat Eric's Dumpling Dash score."],
  dash: ['Dumpling Overflow', 'Score 15 in Dumpling Dash.'],
  bricks: ['Brick by Brick', 'Score 300 in Brick Breaker.'],
  simon: ['Verity Said So', 'Reach round 8 in Verity Says.'],
  kevinShip: ['Lo-Fi Defender', 'Score 200 in Space Kevin.'],
  chem: ['Actually Studied', 'Get 5 right in Chem Study.'],
  gamer: ['Arcade Rat', 'Play 5 arcade games.'],
  memory: ['July 14', 'Walk through the memory.'],
  static: ['Channel Surfer', 'Find every channel on the haunted TV.'],
  oui: ['Oui Oui Oui', 'Ask Verity the capital of France.'],
  baguette: ['Carb Loading', 'Eat the baguette Verity gave you.'],
  curious: ['Ask Me Anything', 'Ask Verity 15 questions.'],
  build: ['Verity Build™', 'Let Verity build a house.'],
  straightdown: ['Never Dig Straight Down', 'Dig straight down anyway.'],
  truth: ['The Hard Part', 'Tell Eric the truth.'],
  caught: ['Found You :)', 'Get caught.'],
  hider: ['Hide and Seek Champion', 'Hold your breath while she checks your hiding spot.'],
  breaker: ['Main Last', 'Restore the power on the first try.'],
  archivist: ['Devlog Archivist', "Find all seven of Dale's devlogs."],
  endTruth: ['Ending: Truth', 'Say it out loud.'],
  endLie: ["Ending: We'll See", 'Keep the secret.'],
  endOui: ['Ending: Oui', 'Find out what happened to Tyler.'],
};

function loadSave() {
  const def = { unlocked: 0, checkpoint: null, stickers: [], achievements: [], endings: [], settings: {} };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? { ...def, ...JSON.parse(raw) } : def;
  } catch (e) { return def; }
}

export class Game {
  constructor(renderer) {
    this.renderer = renderer;
    this.canvas = renderer.canvas;
    this.camera = new E.Camera();
    this.camera.fov = 70 * DEG; this.camera.near = 0.05; this.camera.far = 300;
    this.fx = new Fx();
    this.retro = this.fx; // story scripts poke retro.u.* like shader uniforms
    this.input = new Input(this.canvas);
    this.audio = new AudioSys();
    this.dir = new Director(this);
    this.ui = new UI(this);
    this.mc = new McHud(this);
    this.desktop = new Desktop(this);
    this.menus = new Menus(this);
    this.level = null;
    this.time = 0;
    this.clock = 15 * 60;
    this.clockRate = 1 / 12;
    this.control = 'none';
    this.paused = false;
    this.playing = false;
    this.flags = {};
    this.chapterIndex = -1;
    this.save = loadSave();
    this.settings = { sens: 1, invert: false, vhs: 0.7, lines: 540, tts: true, textSpeed: 42, volume: 0.8, difficulty: 'normal', quality: 'high', ...this.save.settings };
    this.lite = new URLSearchParams(location.search).has('lite');
    this.fx.bind(renderer, this.canvas);
    this.applySettings();
    this.onSpeak = (name, text) => { if (this.level && this.level.onSpeak) this.level.onSpeak(name, text); };
    this.input.onLockChange = (locked) => { if (!locked && this.needsLock() && !this.paused && !this.input.touch) this.pause(); };
    document.addEventListener('mousedown', (e) => {
      if (this.input.touch) return;
      if (e.target.closest('#menu, #desktop, #panel, #mc form, #gate, .ph-close, .choice')) return;
      if (this.needsLock() && !this.input.locked) this.input.requestLock();
    });
    window.addEventListener('keydown', (e) => {
      if (this.input.typing()) return;
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.playing) {
        if (performance.now() - (this.pausedAt || 0) < 400) return; // Esc also releases pointer lock, which pauses by itself
        if (this.paused) this.resume(); else if (!this.desktop.isOpen) this.pause();
      }
    });
    this.last = performance.now();
    window.__verity = this;
  }

  applySettings() {
    const s = this.settings, r = this.renderer.settings;
    this.input.sens = s.sens;
    this.input.invertY = s.invert;
    this.fx.u.uVhs.value = s.vhs;
    // resolution: "lines" is the vertical render resolution; the canvas scales up with crisp pixels below 480
    const h = Math.max(1, this.canvas.clientHeight || innerHeight);
    this.renderer.pixelRatio = 1;
    r.renderScale = Math.max(0.25, Math.min(1, (this.lite ? 360 : s.lines) / h));
    this.canvas.classList.toggle('pixel', s.lines <= 360);
    const high = s.quality !== 'low' && !this.lite;
    r.ssao = high; r.volumetrics = high; r.ssr = false; r.contactShadows = high; r.bloom = high; r.godRays = false;
    r.vignette = 0.42; r.grain = 0.03; r.aberration = 0.45; r.saturation = 0.95; r.contrast = 1.06;
    this.fx.base && Object.assign(this.fx.base, { exposure: r.exposure, aberration: r.aberration, grain: r.grain, vignette: r.vignette });
    this.audio.tts = s.tts;
    this.audio.setMaster(s.volume);
    this.ui.cps = s.textSpeed;
  }

  persist() {
    this.save.settings = this.settings;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* storage is optional */ }
  }

  // ------------------------------------------------------------ lifecycle
  boot() {
    const gate = document.getElementById('gate');
    const go = () => {
      this.audio.init();
      gate.hidden = true;
      this.input.buildTouch(document.getElementById('touch'));
      this.toTitle();
    };
    document.getElementById('gateBtn').addEventListener('click', go);
    this.setLevel(new TitleLevel(this));
    requestAnimationFrame((t) => this.frame(t));
  }

  setLevel(level) {
    if (this.level && this.level !== level) { try { this.level.dispose(); } catch (e) { console.warn(e); } }
    this.level = level;
    if (level) level.enter();
  }

  needsLock() {
    return this.playing && !this.paused && ['walk', 'look', 'hide', 'voxel'].includes(this.control) && !this.mc.chatOpen && !this.desktop.isOpen && document.getElementById('panel').hidden && !this.ui.phoneOpen;
  }

  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(this.lite ? 0.2 : 0.05, Math.max(0, (t - this.last) / 1000));
    this.last = t;
    if (!this.paused) {
      this.time += dt;
      this.clock += dt * this.clockRate;
      this.ui.update(dt);
      if (this.level) this.level.update(dt);
      this.dir.update();
      this.mc.update(dt);
      this.desktop.update();
      if (this.playing && this.input.wasHit('phone') && this.control === 'walk' && !this.ui.busy && this.ui.phoneMsgs.length) {
        this.dir.until(() => true).then(() => this.ui.openPhone()).catch(() => {});
      }
    }
    this.audio.update(dt);
    this.fx.update(dt);
    const wantLock = this.needsLock() && !this.input.locked && !this.input.touch && this.ui.blocking === 0;
    if (wantLock !== this.lockHintOn) { this.lockHintOn = wantLock; document.getElementById('lockHint').hidden = !wantLock; }
    const lv = this.level;
    if (lv) {
      const ps = lv.particles && lv.particles.length ? lv.particles : undefined;
      this.renderer.render(lv.scene, this.camera, { background: 'sky', shadows: lv.shadows !== false && !this.lite, particles: ps, lines: lv.lines || undefined });
    }
    this.input.endFrame();
  }

  pause() {
    if (!this.playing || this.paused) return;
    this.paused = true;
    this.pausedAt = performance.now();
    this.audio.stopSpeak();
    this.input.exitLock();
    this.menus.pause();
  }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.menus.hide();
    this.input.requestLock();
    this.input.consumeAll();
  }

  // ------------------------------------------------------------ chapters
  toTitle() {
    this.dir.reset();
    this.ui.reset();
    this.mc.show(false);
    this.desktop.close();
    this.playing = false;
    this.paused = false;
    this.control = 'none';
    this.input.setTouchMode('none');
    this.input.exitLock();
    if (this.input.touchRoot) this.input.touchRoot.hidden = true;
    this.ui.osd({ mode: 'none' });
    this.ui.setObjective(null);
    this.ui.crosshair(false);
    this.ui.camLight(false);
    this.ui.danger(0);
    this.fx.u.uGlitch.value = 0;
    this.fx.u.uFade.value = 0;
    document.getElementById('fader').style.opacity = 0;
    this.audio.heart = 0; this.audio.rain = 0; this.audio.radioMusic = false;
    this.audio.stopSpeak();
    if (!(this.level instanceof TitleLevel)) this.setLevel(new TitleLevel(this));
    this.audio.setAmbience('title');
    this.audio.setMusic('title');
    this.menus.title();
  }

  newGame() { this.flags = {}; this.save.checkpoint = null; this.playFrom(0); }
  continueGame() {
    const cp = this.save.checkpoint;
    if (!cp) return this.newGame();
    this.flags = { ...(cp.flags || {}) };
    this.playFrom(cp.ch, true);
  }

  async playFrom(index, keepFlags = false) {
    this.menus.hide();
    this.dir.reset();
    this.ui.reset();
    if (this.input.touchRoot) this.input.touchRoot.hidden = false;
    this.playing = true;
    this.paused = false;
    this.audio.setMusic('');
    this.audio.stopSpeak();
    if (!keepFlags && index > 0) this.flags = { ...(this.save.checkpoint?.flags || {}), ...this.flags };
    const token = ++this.runToken;
    try {
      for (let i = index; i < CHAPTERS.length; i++) {
        if (token !== this.runToken) return;
        this.chapterIndex = i;
        this.save.checkpoint = { ch: i, flags: { ...this.flags } };
        this.save.unlocked = Math.max(this.save.unlocked || 0, i);
        this.persist();
        this.resetFx();
        await CHAPTERS[i].run(this);
      }
      this.save.checkpoint = null;
      this.persist();
      this.toTitle();
    } catch (e) {
      if (!(e instanceof Cancelled) && !e?.cancelled) { console.error(e); this.toTitle(); }
    }
  }

  restartChapter() {
    const i = Math.max(0, this.chapterIndex);
    this.flags = { ...(this.save.checkpoint?.flags || {}) };
    this.playFrom(i, true);
  }

  resetFx() {
    this.ui.reset();
    this.mc.show(false);
    this.desktop.close();
    this.ui.danger(0);
    this.ui.camLight(false);
    this.ui.setObjective(null);
    this.fx.u.uGlitch.value = 0;
    this.fx.u.uBright.value = 1;
    this.audio.heart = 0; this.audio.rain = 0; this.audio.radioMusic = false;
    this.audio.setMusic('');
    this.camera.fov = 70 * DEG; this.camera.near = 0.05;
    this.flags.verityEvil = false; this.flags.verityWeird = false;
  }

  // ------------------------------------------------------------ rewards
  achieve(id) {
    if (this.save.achievements.includes(id)) return;
    this.save.achievements.push(id);
    const a = ACHIEVEMENTS[id];
    if (a) this.ui.toast(a[0], a[1]);
    this.persist();
  }

  async collectSticker(id) {
    const s = STICKERS.find((x) => x.id === id);
    if (!s) return;
    const fresh = !this.save.stickers.includes(id);
    if (fresh) { this.save.stickers.push(id); this.persist(); }
    this.audio.pickup();
    await this.ui.note(`<h3>${s.title}</h3>${s.body}`, { style: 'devlog' });
    if (fresh) this.ui.toast('Devlog found', `${this.save.stickers.length} / ${STICKERS.length}`);
    if (this.save.stickers.length >= STICKERS.length) this.achieve('archivist');
  }

  ending(id) {
    if (!this.save.endings.includes(id)) this.save.endings.push(id);
    this.persist();
  }

  // Small helpers used by the scripts
  wait(s) { return this.dir.wait(s); }
  until(f) { return this.dir.until(f); }

  // Tween the camera to a position, looking at a target (both [x, y, z]).
  camTo(pos, look, dur = 1.5) {
    const cam = this.camera;
    const p0 = [...cam.position], t0p = [...cam.target];
    const p1 = arr(pos), l1 = arr(look);
    const t0 = this.time;
    return this.dir.until(() => {
      const k = Math.min(1, (this.time - t0) / Math.max(0.001, dur)), e = k * k * (3 - 2 * k);
      for (let i = 0; i < 3; i++) { cam.position[i] = p0[i] + (p1[i] - p0[i]) * e; cam.target[i] = t0p[i] + (l1[i] - t0p[i]) * e; }
      return k >= 1;
    });
  }
  setClock(h, m) { this.clock = h * 60 + m; }
}
const arr = (v) => (Array.isArray(v) || ArrayBuffer.isView(v) ? v : [v.x, v.y, v.z]);
Game.prototype.runToken = 0;
Game.ACH = ACHIEVEMENTS;
