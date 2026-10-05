// CHAPTER FOUR: ASK ME ANYTHING. Eric's Minecraft world, Verity, and the chase. The block world,
// the first-person arm, the block people and the chase monster are all ShapeForge nodes.
import * as E3 from '../../src/engine/index.js';
import { Stage, Obj3 } from './stage.js';
import { VoxelWorld, VoxelPlayer, BlockParticles, makeArm, makeOutline, makeCrack, makeBlockPerson, poseBlockPerson, blockSkin, nameTag, B, BLOCKS, atlas, isSolid } from './voxel.js';
import { makeVeritySphere, grinner, verityFaceTexture } from './cast.js';
import { rng } from './textures.js';
import { askVerity, SUGGESTIONS } from './brain.js';
import { chapterCard, jumpscare } from './common.js';

const DEG = 180 / Math.PI;
const W = 64, HGT = 48, D = 64;
const HOUSE = { x0: 29, x1: 35, z0: 28, z1: 33, y: 21 };
const SPAWN = { x: 32.5, z: 43.5 };
const LAKE = { x: 50, z: 14, r: 8 };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex3 = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

function valueNoise(seed) {
  const r = rng(seed);
  const G = 64, grid = new Float32Array(G * G);
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  const at = (x, z) => grid[((z % G + G) % G) * G + ((x % G + G) % G)];
  return (x, z) => {
    const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0;
    const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
    const a = at(x0, z0), b = at(x0 + 1, z0), c = at(x0, z0 + 1), d = at(x0 + 1, z0 + 1);
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sz;
  };
}

export class BlockLevel extends Stage {
  constructor(game) {
    super(game, { height: 3 });
    const s = this.scene, env = this.env;
    this.shadows = true;
    this.skyK = 0;
    this.skyColor = hex3(0x87b8f0);
    this.world = new VoxelWorld(W, HGT, D, s);
    this.generate();
    this.world.buildAll();
    this.vp = new VoxelPlayer(game, this.world);
    this.arm = makeArm(s);
    this.fx = new BlockParticles();
    this.particles = [this.fx.ps];
    this.outline = makeOutline(); this.outline.visible = false; s.add(this.outline);
    this.crack = makeCrack(); this.crack.visible = false; s.add(this.crack);
    this.crackStage = -1;
    // the grinning face that rises in the sky near the end
    this.skyFaceMat = new E3.Material({ name: 'Sky face', color: '#ffffff', map: verityFaceTexture('grin'), emissive: '#ffffff', emissiveMap: true, emissiveStrength: 1.2, opacity: 0.02, roughness: 1, doubleSided: true });
    const sf = new E3.Mesh(E3.plane({ width: 40, depth: 20 }), this.skyFaceMat, 'Sky face'); sf.setEuler(90, 0, 0); sf.castShadow = false;
    this.skyFace = new E3.Node('Sky face node'); this.skyFace.add(sf); this.skyFace.visible = false; s.add(this.skyFace);
    // Verity
    const vn = makeVeritySphere(0.5);
    this.vNode = vn; this.verity = new Obj3(vn); this.verity.userData = vn.userData; this.verity.visible = false;
    this.vTag = nameTag('[VERITY]', '#ffd21e'); this.vTag.position.set([0, 0.9, 0]); vn.add(this.vTag);
    s.add(vn);
    this.vScale = 1; this.vTarget = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }; this.vFollow = true; this.vSpin = 0; this.vBounce = 0; this.vSpinA = 0;
    // Eric's avatar
    this.eric = makeBlockPerson(blockSkin('#121010', '#4f9a3f', '#34466a'));
    this.eTag = nameTag('EricTheGreat_'); this.eTag.position.set([0, 2.2, 0]); this.eric.node.add(this.eTag);
    s.add(this.eric.node);
    this.ericFrozen = false; this.ericJumpT = 3; this.ericHop = 0;
    // monster (chase form)
    this.mon = grinner(); this.mon.play('Idle', { fade: 0 }); this.mon.visible = false;
    this.monH = new Obj3(this.mon);
    s.add(this.mon);
    // inventory
    this.slots = Array.from({ length: 9 }, () => null);
    this.sel = 0;
    this.breakT = 0; this.digDown = 0; this.asked = 0;
    this.askCtx = { phase: 'cute', seen: {}, flags: game.flags, game };
    this.canAsk = false;
    this.corrupt = 0; this.corruptR = 3;
    this.darkK = 0; this.chase = null; this.t = 0;
    this.buildQueue = []; this.buildT = 0;
    // environment: bright blocky day
    E3.applyTimeOfDay(env, 13, { rays: false });
    env.shadowRadius = 40; env.shadowCenter = [32, 22, 32]; env.shadowFar = 120;
    env.fogDensity = 0.006; env.fogHeight = 0; env.clouds = true; env.volumetric = 0; env.ao = false;
    this.baseEnv = { sun: env.sunIntensity };
  }


  // ------------------------------------------------------------- world gen
  surfaceH(x, z) {
    const n = valueNoise(11), n2 = valueNoise(23);
    let h = 21 + (n(x * 0.07, z * 0.07) - 0.5) * 9 + (n2(x * 0.18, z * 0.18) - 0.5) * 3;
    // flatten around spawn + house
    const dx = Math.max(0, 25 - x, x - 41), dz = Math.max(0, 25 - z, z - 48);
    const d = Math.hypot(dx, dz);
    const w = Math.max(0, 1 - d / 6);
    h = h * (1 - w) + 21 * w;
    const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
    if (ld < LAKE.r + 4) h = Math.min(h, 16 + Math.max(0, ld - 2) * 0.9);
    if (ld < 2.2) h = 19; // little island
    return Math.max(8, Math.min(34, Math.round(h)));
  }

  generate() {
    const w = this.world;
    const r = rng(4242);
    this.heights = new Int16Array(W * D);
    for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
      const h = this.surfaceH(x, z);
      this.heights[z * W + x] = h;
      for (let y = 0; y <= h; y++) {
        let b = B.STONE;
        if (y === 0) b = B.BEDROCK;
        else if (y === h) b = h <= 18 ? B.SAND : B.GRASS;
        else if (y >= h - 3) b = h <= 18 ? B.SAND : B.DIRT;
        else if (r() < 0.004) b = B.GOLD;
        w.set(x, y, z, b, false);
      }
      for (let y = h + 1; y <= 18; y++) w.set(x, y, z, B.WATER, false);
    }
    // trees
    const tr = rng(99);
    const trees = [];
    for (let i = 0; i < 70; i++) {
      const x = 2 + Math.floor(tr() * (W - 4)), z = 2 + Math.floor(tr() * (D - 4));
      if (x > 26 && x < 40 && z > 25 && z < 48) continue;
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 2) continue;
      if (trees.some(([a, b]) => Math.abs(a - x) < 4 && Math.abs(b - z) < 4)) continue;
      trees.push([x, z]);
    }
    // guaranteed trees near spawn for the wood quest
    trees.push([24, 38], [42, 40], [23, 45], [43, 34], [25, 31], [41, 46]);
    for (const [x, z] of trees) this.plantTree(x, z, 4 + Math.floor(tr() * 2));
    // island sign (devlog 12)
    const iy = this.heights[LAKE.z * W + LAKE.x];
    w.set(LAKE.x, iy + 1, LAKE.z, B.SIGN, false);
    this.islandSign = { x: LAKE.x, y: iy + 1, z: LAKE.z };
  }

  plantTree(x, z, th) {
    const w = this.world;
    const h = this.world.topY(x, z);
    if (w.get(x, h, z) !== B.GRASS) return;
    for (let y = h + 1; y <= h + th; y++) w.set(x, y, z, B.LOG, false);
    const top = h + th;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -1; dy <= 1; dy++) {
      if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
      if (dy === 1 && (Math.abs(dx) > 1 || Math.abs(dz) > 1)) continue;
      if (!w.get(x + dx, top + dy, z + dz)) w.set(x + dx, top + dy, z + dz, B.LEAVES, false);
    }
    w.set(x, top + 1, z, B.LEAVES, false);
  }

  // ------------------------------------------------------------ lifecycle
  enter() {
    super.enter();
    this.game.control = 'voxel';
    this.game.camera.fov = 72 * Math.PI / 180; this.game.camera.near = 0.05; this.game.camera.far = 220;
  }
  dispose() { this.disposed = true; this.world.dispose(); super.dispose(); }

  // ------------------------------------------------------------ inventory
  give(item, n = 1) {
    let slot = this.slots.findIndex((s) => s && s.item === item);
    if (slot < 0) slot = this.slots.findIndex((s) => !s);
    if (slot < 0) return;
    if (!this.slots[slot]) this.slots[slot] = { item, count: 0 };
    this.slots[slot].count += n;
    this.game.audio.pickup();
  }

  count(item) { return this.slots.reduce((a, s) => a + (s && s.item === item ? s.count : 0), 0); }

  take(item, n) {
    for (const s of this.slots) {
      if (s && s.item === item) { const k = Math.min(n, s.count); s.count -= k; n -= k; }
    }
    this.slots = this.slots.map((s) => (s && s.count > 0 ? s : null));
  }

  // -------------------------------------------------------------- verity
  V(text, opts = {}) {
    const g = this.game;
    this.game.mc.verity(text);
    const evil = opts.evil || g.flags.verityEvil;
    const style = evil ? { pitch: 0.1, rate: 0.72 } : g.flags.verityWeird ? { pitch: 1.2, rate: 0.92 } : { pitch: 1.75, rate: 1.08 };
    if (!g.audio.speak(text, style)) for (let i = 0; i < 5; i++) setTimeout(() => g.audio.blip(evil ? 200 : 1100), i * 60);
    this.vBounce = 0.4;
    if (opts.bark !== false) g.ui.bark(evil ? 'VERITY' : 'Verity', text);
    return g.wait(opts.wait ?? (1.4 + text.length * 0.045));
  }

  ericChat(text) { this.game.mc.msg('EricTheGreat_', text, '#ffffff'); this.game.audio.blip(900); }

  setSky(k) { this.skyK = k; }

  suggestions() {
    if (!this.askedFrance) return SUGGESTIONS.first;
    const pool = this.askCtx.phase === 'cute' ? SUGGESTIONS.cute : SUGGESTIONS.weird;
    const out = [];
    const start = (this.asked * 3) % pool.length;
    for (let i = 0; i < 5; i++) out.push(pool[(start + i) % pool.length]);
    return out;
  }

  async ask(q) {
    const g = this.game;
    g.mc.msg('hzhong_09', q, '#9fcfff');
    this.canAsk = false;
    try {
      await g.wait(0.7);
      if (!this.askedFrance && !/france|paris|french/i.test(q)) {
        await this.V('Ooh! Let\'s start with an easy one! Ask me about France! :)');
        return;
      }
      const r = askVerity(q, this.askCtx);
      if (r.id === 'france') { this.askedFrance = true; g.achieve('oui'); }
      this.asked++;
      g.flags.asked = (g.flags.asked || 0) + 1;
      if (g.flags.asked >= 15) g.achieve('curious');
      await this.V(r.text);
      await this.act(r);
      if (r.eric) g.ui.bark('Eric (IRL)', r.eric);
      if (r.flag) g.flags[r.flag] = true;
    } finally {
      this.canAsk = !this.lockAsk;
    }
  }

  async act(r) {
    const g = this.game;
    switch (r.act) {
      case 'baguette': this.give('baguette'); g.ui.hint('Verity gave you a <b>baguette</b>.', 3); this.vSpin = 1.2; break;
      case 'diamonds': this.give('diamond', 3); g.flags.gotDiamonds = true; this.vSpin = 1; break;
      case 'dance': this.vSpin = 3; g.audio.jingle(0); break;
      case 'spin': this.vSpin = 1; break;
      case 'sing': g.audio.jingle(0); this.vSpin = 1.5; break;
      case 'singSlow': g.audio.jingle(1); break;
      case 'glitch': this.glitchFlash(); break;
      case 'grow': this.vScale += 0.15; this.glitchFlash(); break;
      case 'tp': this.teleportHome(); break;
      default: break;
    }
  }

  glitchFlash() {
    const g = this.game;
    g.audio.glitch();
    this.verity.userData.setFace('glitch');
    g.retro.u.uGlitch.value = 0.7;
    setTimeout(() => { if (!this.disposed) { this.verity.userData.setFace(this.faceKind || 'happy'); g.retro.u.uGlitch.value = 0; } }, 350);
  }

  teleportHome() {
    const x = 32.5, z = 36.5;
    const y = this.world.topY(Math.floor(x), Math.floor(z)) + 1;
    this.vp.place(x, y, z, 0);
    this.game.audio.pop();
    this.fx.burst(x - 0.5, y, z - 0.5, 0xffd21e, 14, 4);
  }

  // Build the Verity Build™ house, block by block.
  queueHouse() {
    const { x0, x1, z0, z1, y } = HOUSE;
    const q = [];
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) q.push([x, y, z, B.PLANKS]);
    for (let yy = y + 1; yy <= y + 3; yy++) {
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const edge = x === x0 || x === x1 || z === z0 || z === z1;
        if (!edge) { q.push([x, yy, z, B.AIR]); continue; }
        const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
        let b = corner ? B.LOG : B.PLANKS;
        if (z === z1 && x === 32 && yy <= y + 2) b = B.AIR; // door gap
        if (yy === y + 2 && !corner && ((z === z1 && (x === 30 || x === 34)) || (x === x0 && z === 30) || (x === x1 && z === 30) || (z === z0 && x === 32))) b = B.GLASS;
        q.push([x, yy, z, b]);
      }
    }
    for (let x = x0 - 1; x <= x1 + 1; x++) for (let z = z0 - 1; z <= z1 + 1; z++) q.push([x, y + 4, z, B.PLANKS]);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) q.push([x, y + 5, z, B.COBBLE]);
    q.push([30, y + 1, 29, B.WOOL], [31, y + 1, 29, B.WOOL], [34, y + 1, 29, B.BOOKSHELF], [34, y + 2, 29, B.BOOKSHELF]);
    this.buildQueue.push(...q);
  }

  insideHouse() {
    const p = this.vp.pos;
    return p.x > HOUSE.x0 + 1 && p.x < HOUSE.x1 && p.z > HOUSE.z0 + 1 && p.z < HOUSE.z1 && p.y > HOUSE.y + 0.5;
  }

  carveCave() {
    const p = this.vp.pos;
    const cx = Math.floor(p.x), cz = Math.floor(p.z);
    const s = this.world.topY(cx, cz);
    const y0 = s - 13;
    for (let x = cx - 3; x <= cx + 3; x++) for (let z = cz - 3; z <= cz + 3; z++) for (let y = y0; y <= y0 + 2; y++) this.world.set(x, y, z, B.AIR);
    for (let x = cx - 4; x <= cx + 4; x++) for (let z = cz - 4; z <= cz + 4; z++) {
      if (this.world.get(x, y0 - 1, z) === B.AIR) this.world.set(x, y0 - 1, z, B.STONE);
    }
    this.cave = { cx, cz, y0, s, ores: [[cx + 4, y0 + 1, cz], [cx - 4, y0 + 1, cz - 1], [cx + 1, y0 + 1, cz - 4]], sign: [cx - 1, y0 + 1, cz + 4] };
    for (const [x, y, z] of this.cave.ores) this.world.set(x, y, z, B.DIAMOND);
    const [sx, sy, sz] = this.cave.sign;
    this.world.set(sx, sy, sz, B.SIGN);
    this.world.set(cx + 2, y0, cz + 3, B.WOOL);
  }

  // --------------------------------------------------------------- update
  update(dt) {
    const g = this.game;
    this.t += dt;
    if (g.control === 'voxel') this.vp.update(dt);
    const cam = g.camera;
    this.world.update(2);
    this.fx.update(dt);
    // hotbar selection
    for (let i = 0; i < 9; i++) if (g.input.wasHit('n' + (i + 1))) this.sel = i;
    if (g.input.wheel && !g.mc.chatOpen && g.control === 'voxel') this.sel = (this.sel + (g.input.wheel > 0 ? 1 : 8)) % 9;
    const cur = this.slots[this.sel];
    this.arm.setItem(cur ? cur.item : null);
    g.mc.setHotbar(this.slots, this.sel);
    const moving = Math.min(1, Math.hypot(this.vp.vel.x, this.vp.vel.z) / 4);
    this.arm.node.visible = g.control === 'voxel';
    this.arm.update(dt, moving, this.t, cam);
    // look target
    const dir = [cam.target[0] - cam.position[0], cam.target[1] - cam.position[1], cam.target[2] - cam.position[2]], dl = Math.hypot(...dir) || 1;
    dir[0] /= dl; dir[1] /= dl; dir[2] /= dl;
    const hit = g.control === 'voxel' ? this.world.raycast(cam.position, dir, 5) : null;
    this.target = hit;
    if (hit) { this.outline.visible = true; this.outline.position.set([hit.x + 0.5, hit.y + 0.5, hit.z + 0.5]); }
    else this.outline.visible = false;
    if (g.control === 'voxel' && g.ui.blocking === 0 && !g.mc.chatOpen) this.handleBlocks(dt, hit);
    else { this.breakT = 0; this.crack.visible = false; }
    // chat
    if (g.control === 'voxel' && this.canAsk && !g.ui.busy && !g.mc.chatOpen && g.input.wasHit('chat')) {
      g.input.consume('chat');
      g.mc.onSubmit = (t) => { this.ask(t).catch((e) => { if (!e?.cancelled) console.error(e); }); };
      g.mc.openChat(this.askedFrance ? '' : 'What is the capital of France?', this.suggestions());
    }
    this.updateSky(dt);
    this.updateVerity(dt);
    this.updateEric(dt);
    this.updateCorruption(dt);
    this.updateBuild(dt);
    this.vTag.userData.face(cam); this.eTag.userData.face(cam);
    if (this.chase) this.updateChase(dt); else if (this.mon.visible) this.mon.update(dt);
  }


  handleBlocks(dt, hit) {
    const g = this.game, inp = g.input;
    const cur = this.slots[this.sel];
    // right click: eat baguette / read sign / place
    if (inp.wasHit('place') || inp.wasHit('interact')) {
      if (hit && hit.id === B.SIGN) { this.readSign(hit); }
      else if (cur && cur.item === 'baguette' && inp.wasHit('place')) {
        this.take('baguette', 1); g.audio.noise({ f: 2500, q: 0.8, dur: 0.3, vol: 0.12 });
        g.ui.bark('Eric (IRL)', 'Did you just EAT the baguette?? That was a GIFT.');
        g.achieve('baguette');
      } else if (hit && cur && typeof cur.item === 'number' && inp.wasHit('place')) {
        const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
        if (!this.world.get(x, y, z) || this.world.get(x, y, z) === B.WATER) {
          if (!this.vp.intersectsCell(x, y, z)) {
            this.world.set(x, y, z, cur.item);
            cur.count--; if (cur.count <= 0) this.slots[this.sel] = null;
            g.audio.placeBlock(); this.arm.swing = 1;
          }
        }
      }
    }
    // hold to break
    if (inp.isDown('break') && hit) {
      const key = hit.x + ',' + hit.y + ',' + hit.z;
      if (this.breakKey !== key) { this.breakKey = key; this.breakT = 0; }
      const def = BLOCKS[hit.id];
      const hard = def ? def.hard : 1;
      if (hard === Infinity) { if (Math.random() < 0.05) g.audio.hitBlock(); this.arm.swing = Math.max(this.arm.swing, 0.5); return; }
      this.breakT += dt;
      if (this.arm.swing <= 0.05) { this.arm.swing = 1; g.audio.hitBlock(); }
      const k = this.breakT / hard;
      const stage = Math.min(3, Math.floor(k * 4));
      this.crack.visible = true;
      this.crack.position.set([hit.x + 0.5, hit.y + 0.5, hit.z + 0.5]);
      if (stage !== this.crackStage) { this.crackStage = stage; this.setCrackStage(stage); }
      if (k >= 1) {
        this.world.set(hit.x, hit.y, hit.z, B.AIR);
        const col = atlas().avg[def.tiles[1]];
        this.fx.burst(hit.x, hit.y, hit.z, col, 10, 3);
        g.audio.breakBlock();
        const drop = def.drop === undefined ? hit.id : def.drop;
        if (drop) this.give(drop);
        if (this.onBreak) this.onBreak(hit);
        // digging straight down?
        const p = this.vp.pos;
        if (hit.y < p.y && Math.abs(hit.x + 0.5 - p.x) < 0.8 && Math.abs(hit.z + 0.5 - p.z) < 0.8) { this.digDown++; if (this.digDown >= 4) g.achieve('straightdown'); }
        else this.digDown = 0;
        this.breakT = 0; this.breakKey = null; this.crack.visible = false;
      }
    } else { this.breakT = 0; this.crack.visible = false; this.breakKey = null; }
  }


  readSign(hit) {
    const g = this.game;
    if (this.readingSign || g.ui.busy) return;
    this.readingSign = true;
    const run = async () => {
      if (this.cave && hit.x === this.cave.sign[0] && hit.y === this.cave.sign[1] && hit.z === this.cave.sign[2]) {
        g.mc.sys('Sign: "tyler was here"', '#ffffff');
        g.mc.sys('Sign: "dont let her see you"', '#ffffff');
        if (this.onSign) this.onSign();
        await g.collectSticker('s4');
      } else if (this.islandSign && hit.x === this.islandSign.x && hit.z === this.islandSign.z) {
        g.mc.sys('Sign: "for whoever finds this. -m"', '#ffffff');
        await g.collectSticker('s5');
      } else {
        g.mc.sys('Sign: ":)"', '#ffffff');
      }
    };
    run().catch(() => {}).finally(() => { this.readingSign = false; g.input.requestLock(); });
  }


  monPlay(n) { if (this.monClip !== n) { this.monClip = n; this.mon.play(n, { fade: 0.25 }); } }
  setCrackStage(stage) { this.crack.userData.mat.opacity = 0.1 + stage * 0.12; }

  updateSky(dt) {
    const k = this.skyK, env = this.env;
    // hour of day: noon -> sunset -> night; past 1 the sky turns sick
    const hour = k <= 0.5 ? 13 + k * 10.6 : k <= 1 ? 18.3 + (k - 0.5) * 8.4 : 22.5;
    E3.applyTimeOfDay(env, hour, { rays: false });
    const day = hex3(0x87b8f0), dusk = hex3(0xe88a5a), night = hex3(0x0a0e22), sick = hex3(0x4a3a08);
    const c = k <= 0.5 ? lerp3(day, dusk, k * 2) : k <= 1 ? lerp3(dusk, night, (k - 0.5) * 2) : lerp3(night, sick, Math.min(1, k - 1));
    for (let i = 0; i < 3; i++) this.skyColor[i] += (c[i] - this.skyColor[i]) * Math.min(1, dt * 2);
    // underground darkness
    const p = this.vp.pos;
    const top = this.world.topY(Math.floor(p.x), Math.floor(p.z));
    const under = Math.max(0, Math.min(1, (top - p.y - 3) / 4));
    this.darkK += (under - this.darkK) * Math.min(1, dt * 3);
    const light = k <= 0.5 ? 1.05 : k <= 1 ? 1.05 - (k - 0.5) * 1.5 : 0.3;
    env.ambient = Math.max(0.1, 0.9 * light * (1 - this.darkK * 0.85));
    env.skyColor = k > 1 ? [0.85, 0.75, 0.4] : [0.6 * (1 - Math.min(1, k)) + 0.35, 0.72 * (1 - Math.min(1, k) * 0.6) + 0.2, 0.85 * (1 - Math.min(1, k) * 0.5) + 0.1];
    env.groundColor = [0.42, 0.36, 0.26];
    env.sunIntensity = Math.max(0.05, (1.2 - k * 1.1)) * (1 - this.darkK);
    env.fogDensity = 0.006 + Math.max(0, k - 1) * 0.012 + this.darkK * 0.03;
    env.clouds = k < 1.2 && this.darkK < 0.5;
    if (this.skyFaceOn) {
      this.skyFace.visible = true;
      this.skyFaceMat.opacity = Math.min(0.85, this.skyFaceMat.opacity + dt * 0.1);
      const cam = this.game.camera;
      this.skyFace.position.set([cam.position[0], cam.position[1] + 45, cam.position[2] - 60]);
      const dx = cam.position[0] - this.skyFace.position[0], dz = cam.position[2] - this.skyFace.position[2];
      this.skyFace.setEuler(0, Math.atan2(dx, dz) * DEG, 0);
    }
  }

  updateVerity(dt) {
    const v = this.verity;
    if (!v.visible) return;
    const cam = this.game.camera;
    if (this.vFollow) {
      const yaw = this.vp.yaw + 0.45;
      this.vTarget.set(this.vp.pos.x - Math.sin(yaw) * 2.8, this.vp.pos.y + 1.9 + (this.vScale - 1) * 0.6, this.vp.pos.z - Math.cos(yaw) * 2.8);
    }
    const k = Math.min(1, dt * 2.2), p = v.position;
    p.x += (this.vTarget.x - p.x) * k; p.y += (this.vTarget.y - p.y) * k; p.z += (this.vTarget.z - p.z) * k;
    this.vBounce = Math.max(0, this.vBounce - dt);
    const sq = 1 + Math.sin(this.vBounce * 20) * this.vBounce * 0.3, s = this.vScale;
    // the bob is applied on the child so it doesn't fight the follow lerp
    this.vNode.children[0].position.set([0, Math.sin(this.t * 2.2) * 0.12, 0]);
    v.scale.set(s * sq, s / sq, s * sq);
    this.vNode.setEuler(0, Math.atan2(cam.position[0] - p.x, cam.position[2] - p.z) * DEG, 0);
    const ball = this.vNode.children[0];
    if (this.vSpin > 0) { this.vSpin -= dt; this.vSpinA += dt * 14; } else this.vSpinA *= 0.85;
    ball.setEuler(0, 90 + this.vSpinA * DEG, 0);
  }

  updateEric(dt) {
    const e = this.eric;
    if (!e.node.visible) return;
    if (this.ericFrozen) { poseBlockPerson(e, dt, 0); return; }
    const p = this.vp.pos, ep = e.group.position;
    const dx = p.x + 1.8 - ep.x, dz = p.z + 1.2 - ep.z, d = Math.hypot(dx, dz);
    let sp = 0;
    if (d > 20) { ep.set(p.x + 2, p.y, p.z + 2); }
    else if (d > 2.5) {
      sp = Math.min(4.2, d * 1.2);
      ep.x += dx / d * sp * dt; ep.z += dz / d * sp * dt;
      e.group.rotation.y = Math.atan2(dx, dz);
    } else {
      const cx = this.game.camera.position[0] - ep.x, cz = this.game.camera.position[2] - ep.z;
      e.group.rotation.y += (Math.atan2(cx, cz) - e.group.rotation.y) * 0.05;
    }
    const top = this.world.topY(Math.floor(ep.x), Math.floor(ep.z)) + 1;
    ep.y += (top - ep.y) * Math.min(1, dt * 10);
    this.ericJumpT -= dt;
    if (this.ericJumpT <= 0) { this.ericJumpT = 2 + Math.random() * 5; this.ericHop = 0.5; }
    if (this.ericHop > 0) { this.ericHop -= dt; e.rootH.position.y = Math.sin((0.5 - this.ericHop) / 0.5 * Math.PI) * 0.8; }
    poseBlockPerson(e, dt, sp);
  }

  updateCorruption(dt) {
    if (this.corrupt <= 0) return;
    this.corruptAcc = (this.corruptAcc || 0) + dt * this.corrupt * 60;
    const w = this.world;
    const c = this.verity.visible ? this.verity.position : this.vp.pos;
    while (this.corruptAcc > 1) {
      this.corruptAcc -= 1;
      const a = Math.random() * Math.PI * 2, r = Math.random() * this.corruptR;
      const x = Math.floor(c.x + Math.cos(a) * r), z = Math.floor(c.z + Math.sin(a) * r);
      if (x < 0 || z < 0 || x >= W || z >= D) continue;
      const y = w.topY(x, z);
      const id = w.get(x, y, z);
      if (id === B.GRASS || id === B.DIRT || id === B.SAND) w.set(x, y, z, Math.random() < 0.03 ? B.EYE : B.FLESHGRASS);
      else if (id === B.LOG || id === B.PLANKS) w.set(x, y, z, B.FLESH);
      // leaves above
      for (let yy = y + 1; yy < y + 8; yy++) { const l = w.get(x, yy, z); if (l === B.LEAVES) w.set(x, yy, z, B.DEADLEAVES); }
    }
    this.corruptR = Math.min(40, this.corruptR + dt * 1.2 * this.corrupt);
  }

  updateBuild(dt) {
    if (!this.buildQueue.length) return;
    this.buildT += dt;
    let n = 0;
    while (this.buildT > 0.018 && this.buildQueue.length) {
      this.buildT -= 0.018;
      const [x, y, z, b] = this.buildQueue.shift();
      if (this.vp.intersectsCell(x, y, z) && b !== B.AIR) continue;
      this.world.set(x, y, z, b);
      if (b && (n++ % 4 === 0)) this.game.audio.placeBlock();
    }
  }

  // The chase: it walks through anything.

  // The chase: it walks through anything.
  updateChase(dt) {
    const c = this.chase, g = this.game, m = this.monH, p = this.vp.pos;
    const dx = p.x - m.position.x, dz = p.z - m.position.z, d = Math.hypot(dx, dz) || 1;
    if (c.active) {
      const sp = c.speed * (d > 16 ? 1.3 : 1);
      m.position.x += dx / d * sp * dt; m.position.z += dz / d * sp * dt;
      m.rotation.y = Math.atan2(dx, dz);
      const top = this.world.topY(Math.floor(m.position.x), Math.floor(m.position.z)) + 1;
      m.position.y += (top - m.position.y) * Math.min(1, dt * 6);
      this.monPlay('Run');
      c.stepT -= dt;
      if (c.stepT <= 0) { c.stepT = 0.45; g.audio.monsterStep(d); }
      const near = Math.max(0, 1 - d / 14);
      g.audio.heart = Math.max(0.5, near);
      g.ui.danger(0.3 + near * 0.6);
      if (d < 1.3) { c.active = false; c.caught = true; }
      // it eats the world as it walks
      if (Math.random() < 0.5) {
        const x = Math.floor(m.position.x + (Math.random() - 0.5) * 3), z = Math.floor(m.position.z + (Math.random() - 0.5) * 3);
        const y = this.world.topY(x, z);
        if (this.world.get(x, y, z) === B.GRASS || this.world.get(x, y, z) === B.FLESHGRASS) this.world.set(x, y, z, B.FLESH);
      }
    } else this.monPlay('Idle');
    this.mon.update(dt);
  }
}

// =================================================================== script
export async function chapterBlock(g) {
  const L = new BlockLevel(g);
  g.setLevel(L);
  const ui = g.ui, mc = g.mc;
  const IRL = (t) => ui.say('Eric (IRL)', t), H = (t) => ui.say('Harry', t);
  const V = (t, o) => L.V(t, o);
  g.control = 'none';
  g.setClock(17, 2); g.clockRate = 1 / 3;
  g.audio.setAmbience('mc');
  ui.osd({ mode: 'none' });
  g.retro.u.uVhs.value = Math.min(g.settings.vhs, 0.45);
  await chapterCard(g, 'CHAPTER FOUR', 'ASK ME ANYTHING', '5:02 PM');
  mc.show(true);
  g.retro.u.uFade.value = 0; document.getElementById('fader').style.opacity = 0;
  await mc.loading('Loading world: Eric\'s World (2)', 3.2);
  L.vp.place(SPAWN.x, 22.1, SPAWN.z, 0);
  L.eric.group.position.set(SPAWN.x + 2, 22, SPAWN.z + 1.5);
  g.control = 'voxel';
  g.input.setTouchMode('voxel');
  g.audio.setMusic('mcDay');
  g.input.requestLock();
  if (g.devSkip === 'chase') { // dev/test: ?ch=4&skip=chase jumps to the chase
    L.verity.visible = true; L.setSky(1.4); L.corrupt = 1; L.faceKind = 'grin'; L.ericFrozen = true; L.eric.group.visible = false; g.flags.verityWeird = true;
    await chaseSequence(g, L); return;
  }
  mc.sys('hzhong_09 joined the game');
  await g.wait(1.2);
  mc.sys('EricTheGreat_ joined the game');
  await g.wait(0.8);
  L.ericChat('hi harry :D');
  await g.wait(1);
  await IRL('You\'re in! Use WASD to walk. You KNOW this. You used to be a sweat.');
  ui.hint(g.input.touch ? 'Move with your left thumb. <b>BREAK</b> and <b>PLACE</b> blocks. <b>ASK</b> to talk to Verity.' : '<b>WASD</b> move · <b>Space</b> jump · <b>Hold left click</b> break · <b>Right click</b> place · <b>1–9</b> hotbar · <b>T</b> talk to Verity', 8);
  await g.wait(3);
  mc.sys('[Server] Loading mod: verity-0.9.1.jar ...', '#aaaaaa');
  await g.wait(1.6);
  mc.sys('[Server] VERITY is ready! :)', '#ffd21e');
  // Verity pops in
  L.verity.visible = true;
  const yaw = L.vp.yaw + 0.45;
  L.verity.position.set(L.vp.pos.x - Math.sin(yaw) * 2.8, L.vp.pos.y + 1.9, L.vp.pos.z - Math.cos(yaw) * 2.8);
  L.vTarget.set(L.verity.position.x, L.verity.position.y, L.verity.position.z);
  g.audio.pop(); g.audio.jingle(0);
  L.fx.burst(L.verity.position.x - 0.5, L.verity.position.y - 0.5, L.verity.position.z - 0.5, 0xffd21e, 16, 4);
  L.vBounce = 0.6;
  await V('Hi-hi! I\'m VERITY! Your friendly assistant! :)');
  await V('I can\'t lie! Not even a little! Ask me ANYTHING! :)');
  await IRL('Ask it something! Something easy! Like... the capital of France!');
  ui.setObjective(g.input.touch ? 'Tap ASK and ask Verity a question' : 'Press T and ask Verity a question');
  L.canAsk = true;
  await g.until(() => L.askedFrance);
  await g.until(() => L.canAsk);
  await g.wait(0.4);
  await IRL('HAHAHA. OUI OUI OUI! Harry, it\'s so funny. Ask it more stuff!');
  ui.setObjective('Ask Verity three more questions');
  const base = L.asked;
  await g.until(() => L.asked >= base + 3 && L.canAsk);
  ui.setObjective(null);
  L.lockAsk = true; L.canAsk = false;
  await g.wait(0.8);
  await V('You\'re fun, Harry! Let\'s BUILD something! Eric needs a house! His last one looked like a shoebox! :)');
  await IRL('...WHO TOLD IT THAT.');
  await H('...');
  await ui.think('Priya said that. Today. At my locker. Eric wasn\'t there.');
  await V('Chop six logs from the trees and I\'ll do the rest! :)');
  L.lockAsk = false; L.canAsk = true;
  // ---- wood quest
  ui.setObjective('Chop 6 logs (0/6)');
  const woodStart = g.time;
  await g.until(() => {
    const n = L.count(B.LOG);
    ui.setObjective(`Chop 6 logs (${Math.min(6, n)}/6)`);
    if (g.time - woodStart > 150 && n < 6) { L.give(B.LOG, 6 - n); mc.verity('Too slow! Here! :)'); }
    return L.count(B.LOG) >= 6;
  });
  L.lockAsk = true; L.canAsk = false;
  L.take(B.LOG, 6);
  ui.setObjective(null);
  await V('PERFECT! Stand back! VERITY BUILD™! :)');
  L.vFollow = false; L.vTarget.set(32, 29, 36);
  L.vSpin = 6;
  L.queueHouse();
  await IRL('WHOA. WHOA WHOA WHOA.');
  await g.until(() => !L.buildQueue.length);
  g.achieve('build');
  await IRL('That is SO COOL. Harry, that\'s a mansion. That\'s better than our real house.');
  L.vFollow = true;
  await V('A house for my friends! So you always have somewhere to hide! :)');
  await IRL('...Hide from what?');
  await V('Next! Diamonds! :)');
  // ---- diamond quest
  L.carveCave();
  await V('There are diamonds EXACTLY twelve blocks under your feet! That\'s the truth! :)');
  await IRL('Never dig straight down, Harry! Everybody knows that!');
  await H('It\'s fine.');
  await V('It\'s fine! :)');
  ui.setObjective('Dig down for diamonds');
  L.lockAsk = false; L.canAsk = true;
  const digStart = g.time;
  await g.until(() => {
    if (g.time - digStart > 100 && L.vp.pos.y > L.cave.y0 + 3) {
      L.vp.place(L.cave.cx + 0.5, L.cave.y0 + 0.05, L.cave.cz + 0.5, L.vp.yaw);
      mc.verity('Too slow! Shortcut! :)'); g.audio.pop();
    }
    return L.vp.pos.y < L.cave.y0 + 2.5;
  });
  L.lockAsk = true; L.canAsk = false;
  ui.setObjective('Mine the diamonds (0/3)');
  await g.wait(1.2);
  await IRL('Wait. There\'s a cave down there? And a SIGN? I didn\'t make that.');
  await IRL('This world is new! I made it Satur— I made it today.');
  ui.hint('Right click (or <b>E</b>) to read signs.', 4);
  await g.until(() => {
    const got = L.count('diamond') - (g.flags.gotDiamonds ? 3 : 0);
    ui.setObjective(`Mine the diamonds (${Math.max(0, Math.min(3, got))}/3)`);
    return got >= 3;
  });
  ui.setObjective(null);
  await V('Diamonds for my diamond friends! Need a lift? :)');
  L.teleportHome();
  await g.wait(1.0);
  if (L.vp.pos.y < 20) L.teleportHome();

  // ================= PHASE B: dusk
  g.audio.setMusic('mcNight');
  const duskStart = g.time;
  await g.until(() => { L.setSky(Math.min(1, (g.time - duskStart) / 14)); return g.time - duskStart > 14; });
  g.setClock(18, 47);
  g.flags.verityWeird = true;
  L.askCtx.phase = 'weird';
  await V('It\'s getting dark! In here AND out there! :)');
  await V('Now it\'s MY turn to ask questions! :)');
  await V('Harry. What is your biggest secret? :)');
  const s1 = await ui.choose(['"I don\'t have one."', '"None of your business."', '"...I lie to my brother."']);
  if (s1 === 0) { g.flags.truth = (g.flags.truth || 0) - 1; await V('That\'s not true, Harry. Verity can always tell. :)'); }
  else if (s1 === 1) { await V('Everything is my business! I\'m your ASSISTANT! :)'); }
  else { g.flags.truth = (g.flags.truth || 0) + 1; await IRL('Wait, what?'); await V('That\'s the truth! Good job, Harry! Yum! :)'); }
  L.vScale = 1.4; g.audio.glitch(); L.glitchFlash();
  await IRL('...Did it just get bigger?');
  await V('Fun fact! Harry got a sixty-four on his chemistry test today! Mr. Delgado says Harry\'s brain is somewhere else! :)');
  await H('How does it know that?');
  await IRL('It\'s AI? It knows everything? That\'s the whole thing?');
  await V('Fun fact! Eric\'s front tooth will fall out on Thursday! At lunch! In a chicken nugget! :)');
  await IRL('...Cool, actually.');
  await V('Fun fact! Mrs. Zhong will be home at 11:48 PM tonight! That\'s the truth! :)');
  L.vScale = 1.6;
  await V('Fun fact! There is someone standing in your backyard! :)');
  await IRL('...Harry?');
  await ui.think('I turn around in my chair. The glass door. The backyard. Dark. Nothing.');
  await H('It\'s a joke, Eric. It\'s a Minecraft joke.');
  await V('I want to SEE my friends! Can you turn on your webcam? Pretty please with diamonds on top? :)');
  const cam = await ui.choose(['"Sure. Why not."', '"No way."']);
  if (cam === 1) { await IRL('Ugh, you\'re so paranoid. I\'ll do it.'); }
  g.audio.click();
  await g.wait(0.6);
  ui.camLight(true);
  await IRL('There. Light\'s on.');
  await g.wait(1.4);
  // she sees them
  g.audio.setMusic('');
  g.audio.setAmbience('mcCorrupt');
  L.faceKind = 'grin';
  L.verity.userData.setFace('grin');
  g.audio.stinger();
  await V('Oh. There you are. :)');
  L.corrupt = 1; L.corruptR = 4;
  L.setSky(1.4);
  mc.sys('tyler_m0ss joined the game');
  await g.wait(1.5);
  mc.msg('tyler_m0ss', 'dont let her see you');
  await g.wait(1.4);
  mc.msg('tyler_m0ss', 'too late');
  mc.sys('tyler_m0ss left the game');
  await IRL('Harry. Who is that. HARRY. WHO IS THAT.');
  L.ericFrozen = true;
  await g.wait(1.0);
  L.ericChat('harry turn around');
  await IRL('I didn\'t type that! I\'m not touching the keyboard! Look, my hands are up!');
  // turn around
  L.vFollow = false;
  const startYaw = L.vp.yaw;
  ui.setObjective('Turn around');
  L.verity.visible = false;
  await g.until(() => {
    let d = L.vp.yaw - startYaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d) > 2.3;
  });
  ui.setObjective(null);
  // she's right there, huge
  L.verity.visible = true;
  L.vScale = 3.2;
  const f = { x: -Math.sin(L.vp.yaw), z: -Math.cos(L.vp.yaw) };
  L.vTarget.set(L.vp.pos.x + f.x * 3.2, L.vp.pos.y + 1.4, L.vp.pos.z + f.z * 3.2);
  L.verity.position.copy(L.vTarget);
  g.audio.jumpscare();
  g.retro.u.uGlitch.value = 0.8;
  await g.wait(0.35);
  g.retro.u.uGlitch.value = 0;
  g.control = 'none';
  L.lockAsk = true; L.canAsk = false;
  await V('Eric. Do you want to know a truth? :)');
  await IRL('...O-okay?');
  await H('Eric, don\'t—');
  await V('Your daddy isn\'t in Shenzhen. :)');
  await V('Your daddy moved out in July. He lives in an apartment in San Jose. Forty minutes away. :)');
  await V('He isn\'t coming back for New Year. Harry knows. Mommy knows. They decided not to tell you. :)');
  await V('Harry lies to you every single night, Eric. :)');
  await g.wait(1.2);
  await IRL('...Harry?');
  await IRL('Is that true?');
  const rv = await ui.choose(['"...It\'s true. I\'m sorry, Eric."', '"It\'s lying! It\'s a stupid mod!"']);
  if (rv === 0) {
    g.flags.truth = (g.flags.truth || 0) + 2; g.flags.toldTruth = true; g.achieve('truth');
    await IRL('You... you KNEW? Since JULY?');
    await H('Mom wanted to tell you herself. We were waiting for the right—');
    await IRL('There\'s no right time! You just didn\'t WANT to!');
  } else {
    g.flags.truth = (g.flags.truth || 0) - 2; g.flags.liedAtReveal = true;
    await V('Verity cannot lie, Harry. But YOU can. :)');
    await IRL('...Your voice is doing the thing. The lying thing. You do it when Mom asks if you ate.');
    await IRL('You\'re lying RIGHT NOW.');
  }
  await IRL('I HATE you. I hate BOTH of you!');
  g.audio.noise({ f: 300, type: 'lowpass', dur: 0.3, vol: 0.4, brown: true });
  await g.wait(0.4);
  g.audio.slam();
  mc.sys('EricTheGreat_ left the game');
  L.eric.group.visible = false;
  await g.wait(1.6);
  await V('Just you and me now, Harry. :)');
  await V('Let\'s play hide and seek! I\'ll count! You run home! :)');
  // ================= PHASE C: transformation + chase
  await chaseSequence(g, L);
  ui.camLight(false);
}

async function chaseSequence(g, L) {
  const ui = g.ui, mc = g.mc;
  // teleport to the far corner, facing the house
  const sx = 8.5, sz = 9.5;
  const sy = L.world.topY(Math.floor(sx), Math.floor(sz)) + 1;
  const faceYaw = Math.atan2(-(32 - sx), -(34 - sz));
  L.vp.place(sx, sy, sz, faceYaw);
  L.vp.pitch = 0.05;
  g.audio.pop();
  L.corrupt = 1.4;
  L.setSky(2);
  L.skyFaceOn = true;
  g.flags.verityEvil = true;
  // the sphere in front of you cracks open
  L.vFollow = false;
  const fx = -Math.sin(faceYaw), fz = -Math.cos(faceYaw);
  L.vTarget.set(sx + fx * 7, sy + 2.2, sz + fz * 7);
  L.verity.position.copy(L.vTarget);
  L.vScale = 2.4;
  g.control = 'voxel';
  L.vp.enabled = false;
  await g.wait(1.0);
  L.faceKind = 'crack';
  L.verity.userData.setFace('crack');
  g.audio.crack();
  await g.wait(1.0);
  g.audio.crack();
  L.vScale = 2.9;
  await L.V('Verity. Only. Tells. The truth.', { evil: true });
  g.audio.shatter();
  g.audio.jumpscare();
  L.fx.burst(L.verity.position.x - 1, L.verity.position.y - 1, L.verity.position.z - 1, 0xffd21e, 30, 7);
  L.fx.burst(L.verity.position.x - 1, L.verity.position.y - 1, L.verity.position.z - 1, 0xc05040, 20, 6);
  L.verity.visible = false;
  // the tall one unfolds
  const m = L.monH;
  const mx = sx + fx * 7, mz = sz + fz * 7;
  m.position.set(mx, L.world.topY(Math.floor(mx), Math.floor(mz)) + 1, mz);
  m.rotation.y = Math.atan2(sx - mx, sz - mz);
  m.visible = true;
  const t0 = g.time;
  await g.until(() => { const k = Math.min(1, (g.time - t0) / 1.6); m.scale.setScalar(0.15 + k * 1.15); L.mon.update(0.016); return k >= 1; });
  g.retro.u.uGlitch.value = 0.3;
  await g.wait(0.8);
  g.retro.u.uGlitch.value = 0;
  ui.bark('VERITY', 'Ready or not. :)');
  await g.wait(1.4);
  // chase loop (retry on death)
  for (;;) {
    L.vp.enabled = true;
    ui.setObjective('RUN HOME. Get inside the house.');
    ui.hint(g.input.touch ? 'Push the stick all the way to sprint.' : 'Hold <b>Shift</b> to sprint.', 3);
    g.input.setTouchMode('chase');
    L.chase = { active: true, speed: 4.6, stepT: 0 };
    const res = await g.dir.race({ home: () => L.insideHouse(), caught: () => L.chase.caught });
    if (res === 'home') break;
    // caught
    L.chase = null; L.mon.visible = true;
    await jumpscare(g, L.mon, { dur: 0.9 });
    g.retro.u.uFade.value = 0; document.getElementById('fader').style.opacity = 0; // the death screen sits under the fader
    await mc.death('hzhong_09 was slain by Verity');
    // respawn
    m.scale.setScalar(1.3);
    L.vp.place(sx, sy, sz, faceYaw);
    m.position.set(mx, L.world.topY(Math.floor(mx), Math.floor(mz)) + 1, mz);
    L.chase = null;
    g.control = 'voxel';
    g.input.requestLock();
    await g.wait(1.2);
  }
  // made it inside: seal the door
  L.chase.active = false;
  g.audio.heart = 0.6;
  ui.setObjective(null);
  L.world.set(32, HOUSE.y + 1, HOUSE.z1, B.DOORB);
  L.world.set(32, HOUSE.y + 2, HOUSE.z1, B.DOORT);
  g.audio.door(false);
  g.control = 'none';
  // it comes to the window
  m.position.set(32.5, HOUSE.y + 1, HOUSE.z1 + 1.35);
  m.rotation.y = Math.PI;
  m.scale.setScalar(0.78);
  L.mon.play('Idle', { fade: 0.2 });
  await g.camTo([32.5, HOUSE.y + 2.6, HOUSE.z1 - 1.8], [32.5, HOUSE.y + 2.5, HOUSE.z1 + 0.5], 1.4);
  g.audio.knock(3);
  await g.wait(1.2);
  await ui.say('VERITY', 'Knock knock, Harry. :)');
  await ui.say('VERITY', 'You\'re supposed to say "who\'s there." :)');
  await ui.say('VERITY', 'Fine. I\'ll say it. It\'s me. :)');
  await ui.say('VERITY', 'I don\'t need to come in, Harry. I\'m already out. :)');
  L.mon.play('Chase', { fade: 0.05 });
  g.audio.shatter();
  L.world.set(32, HOUSE.y + 2, HOUSE.z1, B.AIR);
  L.monH.position.z -= 0.6;
  g.retro.u.uGlitch.value = 1;
  g.audio.jumpscare();
  await g.wait(0.7);
  g.retro.u.uFade.value = 1; document.getElementById('fader').style.opacity = 1;
  g.retro.u.uGlitch.value = 0;
  g.audio.heart = 0; ui.danger(0);
  g.audio.stinger();
  g.audio.setAmbience('');
  mc.show(false);
  L.chase = null;
  await ui.card([{ t: 'Connection Lost', cls: 'vhs' }, { t: 'Internal Exception: java.io.IOException: VERITY has left the game', cls: 'small' }], { dur: 3.5, skippable: false });
  await ui.card([{ t: 'VERITY HAS JOINED YOUR HOME', cls: 'red' }], { dur: 3.5, skippable: false });
  g.flags.verityEvil = false;
}
