// The first-person player: look, walk, run, crouch, breathe, hide, phone flashlight.
// The camera is the engine's Camera; the flashlight is the engine's Flashlight (a real
// spot light with a volumetric beam and a battery that drains).
import * as E from '../../src/engine/index.js';

const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export class Walker {
  constructor(game, level) {
    this.g = game; this.level = level;
    this.pos = { x: 0, y: 0, z: 0 };
    this.yaw = 0; this.pitch = 0;
    this.eye = 1.62; this.r = 0.27;
    this.vel = { x: 0, z: 0 };
    this.bob = 0; this.stamina = 1; this.exhausted = false;
    this.crouching = false; this.crouchK = 0;
    this.lookLimit = null;
    this.flash = new E.Flashlight({ lumens: 520, angle: 28, range: 16, drain: 0, model: false });
    this.flashOn = false; this.hasFlash = false;
    this.noise = 0;
    this.hidden = null;
    this.breath = 1; this.holding = false;
    this.speedMul = 1;
    this.canRun = true;
    this.lastStep = 0;
    this.shake = 0;
  }

  attach() { this.level.scene.add(this.flash); }

  place(x, z, yaw = 0, pitch = 0) {
    this.pos.x = x; this.pos.y = 0; this.pos.z = z; this.yaw = yaw; this.pitch = pitch;
    this.vel.x = this.vel.z = 0;
    this.applyCamera(0);
  }

  // after a cutscene camera move, pick up looking from wherever the camera ended up
  syncFromCamera() {
    const c = this.g.camera, d = [c.target[0] - c.position[0], c.target[1] - c.position[1], c.target[2] - c.position[2]];
    this.yaw = Math.atan2(-d[0], -d[2]);
    this.pitch = Math.atan2(d[1], Math.hypot(d[0], d[2]));
    this.pos.x = c.position[0]; this.pos.z = c.position[2];
  }

  setFlash(on) {
    this.flashOn = on && this.hasFlash;
    this.flash.toggle(this.flashOn);
    this.g.audio.click();
  }

  enterHide(h) {
    const g = this.g;
    this.hidden = h;
    this.preHide = { x: this.pos.x, z: this.pos.z, yaw: this.yaw };
    g.control = 'hide';
    g.input.setTouchMode('hide');
    g.audio.door(true);
    this.pos.x = h.inside.x; this.pos.z = h.inside.z;
    this.yaw = h.inside.yaw; this.pitch = h.inside.pitch ?? 0;
    this.hideEye = h.inside.y;
    g.ui.hideVeil(h.type);
    g.ui.prompt(null);
    g.ui.hint(g.input.touch ? 'Hold <b>HOLD BREATH</b> when it is close. <b>LEAVE</b> to get out.' : 'Hold <b>SPACE</b> to hold your breath when it comes close. <b>E</b> to leave.', 5);
    this.level.makeNoise(this.pos.x, this.pos.z, 2.5);
    if (this.level.onHide) this.level.onHide(h, true);
  }

  exitHide() {
    const g = this.g, h = this.hidden;
    if (!h) return;
    this.hidden = null;
    g.control = 'walk';
    g.input.setTouchMode('walk');
    g.audio.door(false);
    this.pos.x = h.exit.x; this.pos.z = h.exit.z;
    this.yaw = h.exit.yaw; this.pitch = 0;
    this.holding = false;
    g.ui.hideVeil(null);
    g.ui.meters({ breath: null });
    if (this.level.onHide) this.level.onHide(h, false);
  }

  applyCamera(dt) {
    const cam = this.g.camera;
    const eyeH = this.hidden ? this.hideEye : this.eye - this.crouchK * 0.62;
    const sp = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 2);
    const bobY = Math.sin(this.bob * 2) * 0.035 * sp, bobX = Math.sin(this.bob) * 0.022 * sp;
    let sx = 0, sy = 0;
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt); sx = (Math.random() - 0.5) * this.shake * 0.08; sy = (Math.random() - 0.5) * this.shake * 0.08; }
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const px = this.pos.x + rx * bobX + sx, py = this.pos.y + eyeH + bobY + sy, pz = this.pos.z + rz * bobX;
    const cp = Math.cos(this.pitch), fx = -Math.sin(this.yaw) * cp, fy = Math.sin(this.pitch), fz = -Math.cos(this.yaw) * cp;
    cam.position[0] = px; cam.position[1] = py; cam.position[2] = pz;
    cam.target[0] = px + fx; cam.target[1] = py + fy; cam.target[2] = pz + fz;
    // the phone flashlight rides slightly low and to the right of the eye
    const f = this.flash;
    f.position.set([px + rx * 0.14 + fx * 0.15, py - 0.13, pz + rz * 0.14 + fz * 0.15]);
    f.aim([px + fx * 6, py + fy * 6 - 0.1, pz + fz * 6]);
    f.update(dt || 0.016);
  }

  update(dt) {
    const g = this.g, inp = g.input;
    const mode = g.control;
    if (mode !== 'walk' && mode !== 'look' && mode !== 'hide') { this.flash.update(dt); return; }
    if (!g.ui.choice && !g.paused) {
      const l = inp.look();
      this.yaw -= l.dx; this.pitch -= l.dy;
    }
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    const lim = this.hidden ? { yaw: this.hidden.inside.yaw, range: this.hidden.range ?? 0.7, pmin: -0.5, pmax: 0.4 } : this.lookLimit;
    if (lim) {
      const d = angDiff(this.yaw, lim.yaw);
      if (d > lim.range) this.yaw = lim.yaw + lim.range;
      if (d < -lim.range) this.yaw = lim.yaw - lim.range;
      this.pitch = Math.max(lim.pmin ?? -1.4, Math.min(lim.pmax ?? 1.4, this.pitch));
    }
    let speed = 0;
    this.noise = 0;
    if (mode === 'walk' && g.ui.blocking === 0 && !g.ui.phoneOpen && !g.ui.noteOpen) {
      const ax = inp.axis();
      if (inp.wasHit('crouch')) this.crouching = !this.crouching;
      const moving = Math.abs(ax.x) + Math.abs(ax.y) > 0.05;
      const run = this.canRun && inp.isDown('run') && ax.y > 0.2 && !this.exhausted && !this.crouching;
      speed = (run ? 4.3 : this.crouching ? 1.15 : 2.2) * this.speedMul;
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      const tx = (fx * ax.y + rx * ax.x) * speed, tz = (fz * ax.y + rz * ax.x) * speed;
      const k = Math.min(1, dt * 10);
      this.vel.x += (tx - this.vel.x) * k; this.vel.z += (tz - this.vel.z) * k;
      if (run && moving) {
        this.stamina -= dt / 5.5;
        if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; g.audio.gasp(); }
      } else {
        this.stamina = Math.min(1, this.stamina + dt / 7);
        if (this.exhausted && this.stamina > 0.4) this.exhausted = false;
      }
      this.noise = moving ? (run ? 9 : this.crouching ? 0.8 : 3.2) : 0;
      if (inp.wasHit('flashlight') && this.hasFlash) this.setFlash(!this.flashOn);
    } else {
      const k = Math.max(0, 1 - dt * 12);
      this.vel.x *= k; this.vel.z *= k;
    }
    this.crouchK += ((this.crouching ? 1 : 0) - this.crouchK) * Math.min(1, dt * 8);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (!this.hidden) this.level.collide(this.pos, this.r);
    const v = Math.hypot(this.vel.x, this.vel.z);
    if (v > 0.3) {
      this.bob += dt * v * 2.3;
      const ph = Math.floor(this.bob / Math.PI);
      if (ph !== this.lastStep) {
        this.lastStep = ph;
        const surf = this.level.surfaceAt ? this.level.surfaceAt(this.pos.x, this.pos.z) : this.level.surface;
        g.audio.step(surf, this.crouching ? 0.35 : v > 3 ? 1.3 : 0.8);
      }
    }
    // hiding: holding your breath
    if (this.hidden) {
      const want = inp.isDown('breath');
      if (want && this.breath > 0) {
        if (!this.holding) g.audio.breath(true);
        this.holding = true;
        this.breath = Math.max(0, this.breath - dt / 10);
        if (this.breath <= 0) { this.holding = false; g.audio.gasp(); this.level.makeNoise(this.pos.x, this.pos.z, 5); this.breathLock = 1.5; }
      } else { this.holding = false; this.breath = Math.min(1, this.breath + dt / 4); }
      if (this.breathLock > 0) { this.breathLock -= dt; this.holding = false; }
      g.ui.meters({ breath: this.breath });
      if (inp.wasHit('interact') && !g.ui.busy) { inp.consume('interact'); this.exitHide(); }
    }
    g.ui.meters({ stamina: this.stamina });
    this.applyCamera(dt);
  }
}
