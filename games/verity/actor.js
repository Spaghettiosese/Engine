// Actor: drives a ShapeForge Character as a story NPC. It walks paths, follows the player,
// faces things, sits, talks (gesture clips) and plays one-shot animations. Locomotion is a
// speed-driven blend of the Idle / Walk / Run clips, like the engine's Frontier Town.
import { Obj3 } from './stage.js';

const DEG = 180 / Math.PI;
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export class Actor {
  constructor(level, character, name) {
    this.level = level; this.ch = character; this.name = name;
    this.group = new Obj3(character);
    level.scene.add(character);
    level.actors.push(this);
    this.s = character.userData.rootScale || 1;
    this.height = (character.userData.spec && character.userData.spec.height) || 1.7;
    this.path = [];
    this.speed = 1.3;
    this.yaw = 0;
    this.targetYaw = null;
    this.lookAtCam = false;
    this.arrived = true;
    this.follow = null;
    this.sitting = false;
    this.talkT = 0;
    this.anim = null;        // forced clip name (Wave, Scared, Cry, Type...)
    this.cur = null;         // clip currently playing as a one-shot/pose (null = locomotion blend)
    this.h = this;           // old scripts say actor.h.sitting / actor.h.talk
  }
  get talk() { return this.talkT; }
  set talk(v) { this.talkT = v; }

  place(x, z, yaw = 0) {
    const p = this.ch.position; p[0] = x; p[2] = z;
    this.yaw = yaw; this.ch.setEuler(0, yaw * DEG, 0); this.targetYaw = null;
    this.path = []; this.arrived = true;
  }
  get pos() { const p = this.ch.position; return { x: p[0], y: p[1], z: p[2] }; }
  setY(y) { this.ch.position[1] = y; }
  getBox() { const p = this.ch.position; return { min: [p[0] - 0.4, p[1], p[2] - 0.4], max: [p[0] + 0.4, p[1] + this.height, p[2] + 0.4] }; }

  walkTo(x, z, speed = 1.3) { return this.walkPath([[x, z]], speed); }
  walkPath(pts, speed = 1.3) {
    this.path = pts.slice(); this.speed = speed; this.arrived = false;
    return this.level.game.dir.until(() => this.arrived);
  }
  face(x, z) { const p = this.ch.position; this.targetYaw = Math.atan2(x - p[0], z - p[2]); }
  faceCam() { const c = this.level.game.camera.position; this.face(c[0], c[2]); }
  talkFor(sec = 2) { this.talkT = Math.max(this.talkT, sec); }
  sit(on, yOffset = 0) { this.sitting = on; this.ch.position[1] = on ? yOffset : 0; }
  play(clip) { this.anim = clip; }
  stopAnim() { this.anim = null; }
  get visible() { return this.ch.visible; }
  set visible(v) { this.ch.visible = v; }

  update(dt) {
    const ch = this.ch;
    if (!ch.visible) return;
    const p = ch.position;
    let sp = 0;
    if (this.follow) {
      const f = this.follow();
      if (f) {
        const dx = f.x - p[0], dz = f.z - p[2], d = Math.hypot(dx, dz), gap = f.gap ?? 1.4;
        if (d > gap) {
          const s = Math.min(d - gap, (f.speed ?? 2.6) * dt * Math.min(2, d / 2));
          p[0] += dx / d * s; p[2] += dz / d * s; sp = s / dt;
          this.targetYaw = Math.atan2(dx, dz);
        }
      }
    } else if (this.path.length) {
      const [tx, tz] = this.path[0];
      const dx = tx - p[0], dz = tz - p[2], d = Math.hypot(dx, dz);
      if (d < 0.05) { this.path.shift(); if (!this.path.length) this.arrived = true; }
      else {
        const s = Math.min(d, this.speed * dt);
        p[0] += dx / d * s; p[2] += dz / d * s;
        sp = this.speed;
        this.targetYaw = Math.atan2(dx, dz);
      }
    }
    if (this.lookAtCam && !sp) this.faceCam();
    if (this.targetYaw !== null) {
      this.yaw += angDiff(this.yaw, this.targetYaw) * Math.min(1, dt * 6);
      ch.setEuler(0, this.yaw * DEG, 0);
    }
    if (this.talkT > 0) this.talkT -= dt;
    this.animate(sp);
    ch.update(dt);
  }

  animate(sp) {
    const ch = this.ch, mx = ch.mixer;
    let want = this.anim;
    if (!want) {
      if (this.sitting) want = this.talkT > 0 ? 'SitTalk' : 'Sit';
      else if (sp > 0.05) want = null;
      else want = this.talkT > 0 ? 'Talk' : 'Idle';
    }
    if (want) {
      if (this.cur !== want) { this.cur = want; ch.play(want, { fade: 0.3 }); }
      return;
    }
    // locomotion blend: idle -> walk -> run by speed relative to the rig's scale
    this.cur = null;
    const v = sp / this.s, vWalk = 1.15, vRun = 2.9;
    const w = v < vWalk ? { Idle: Math.max(0, 1 - v / vWalk), Walk: Math.min(1, v / vWalk) } : { Walk: Math.max(0, 1 - (v - vWalk) / (vRun - vWalk)), Run: Math.min(1, (v - vWalk) / (vRun - vWalk)) };
    mx.setWeights(w, 0.25);
  }
}
