// Mechanisms: the moving parts of props. A hinge turns a node about an axis (doors,
// shutters, hammers, levers, a shotgun's barrels), a slide moves it along one (bolts,
// ejector rods, a wrench jaw) and a spin turns it without limits (a revolver's cylinder,
// a windmill). Each part has a spring that eases it toward a target, so a door you open
// swings and settles; clips drive parts on a timeline with events (a round goes in, the
// hammer falls) for reloads and other animations.
//
// A Prop is a Node that owns a rig of parts, a set of clips and the information a character
// needs to hold it: which hand pose to use and where the grip and support points are.
import { Node } from './scene.js';
import { quat, vec3, clamp } from './math.js';

const DEG = Math.PI / 180;
export const EASE = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
  snap: (t) => 1 - Math.pow(1 - t, 4), // fast start, soft landing (hammers, bolts)
  step: (t) => (t < 1 ? 0 : 1),
};

export class Part {
  // type: 'hinge' (value in degrees), 'slide' (metres) or 'spin' (degrees, unbounded)
  constructor(node, { type = 'hinge', axis = [1, 0, 0], min = -Infinity, max = Infinity, value = 0, stiffness = 90, damping = 2 * Math.sqrt(90), name } = {}) {
    this.node = node; this.type = type; this.axis = vec3.normalize([0, 0, 0], axis);
    this.min = min; this.max = max; this.stiffness = stiffness; this.damping = damping;
    this.name = name || node.name;
    this.baseRot = Float32Array.from(node.rotation); this.basePos = Float32Array.from(node.position);
    this.value = value; this.target = value; this.vel = 0; this.driven = false;
    this.apply();
  }
  // spring toward a target (interactive: open a door, pull a trigger)
  set(target) { this.target = clamp(target, this.min, this.max); this.driven = false; return this; }
  // jump straight there (clips, loading a saved state)
  snap(value) { this.value = this.target = clamp(value, this.min, this.max); this.vel = 0; this.apply(); return this; }
  // 0..1 across the part's range (handy for UI sliders and grips)
  get amount() { return Number.isFinite(this.max - this.min) ? (this.value - this.min) / (this.max - this.min) : this.value; }
  setAmount(a) { return this.set(this.min + (this.max - this.min) * a); }
  get moving() { return Math.abs(this.vel) > 1e-3 || Math.abs(this.target - this.value) > 1e-3; }
  update(dt) {
    if (this.driven || !this.moving) return;
    // semi-implicit spring-damper, substepped so stiff parts stay stable at low frame rates
    const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
    for (let i = 0; i < n; i++) {
      this.vel += (this.stiffness * (this.target - this.value) - this.damping * this.vel) * h;
      this.value += this.vel * h;
      if (this.value < this.min) { this.value = this.min; this.vel = Math.abs(this.vel) * 0.25; } // bounce off the stop
      if (this.value > this.max) { this.value = this.max; this.vel = -Math.abs(this.vel) * 0.25; }
    }
    this.apply();
  }
  apply() {
    if (this.type === 'slide') {
      vec3.scaleAdd(this.node.position, this.basePos, this.axis, this.value);
    } else {
      const q = quat.setAxisAngle(quat.create(), this.axis, this.value * DEG);
      quat.multiply(this.node.rotation, this.baseRot, q);
    }
  }
}

// A clip: tracks of [time, value, ease] keys per part, plus timed events.
//   new MechClip('Cock', 0.3, { hammer: [[0, 0], [0.3, -38, 'snap']] }, [{ t: 0.3, name: 'click' }])
export class MechClip {
  constructor(name, duration, tracks = {}, events = []) {
    this.name = name; this.duration = duration; this.tracks = tracks;
    this.events = events.slice().sort((a, b) => a.t - b.t);
  }
  sample(part, t) {
    const keys = this.tracks[part];
    if (!keys || !keys.length) return undefined;
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, ease = 'inOut'] = keys[i];
      if (t <= t1) {
        const [t0, v0] = keys[i - 1];
        const s = t1 > t0 ? (EASE[ease] || EASE.inOut)((t - t0) / (t1 - t0)) : 1;
        return v0 + (v1 - v0) * s;
      }
    }
    return keys[keys.length - 1][1];
  }
  // helper to build long clips: step through actions in sequence
  static sequence(name, steps) {
    const tracks = {}, events = []; let t = 0;
    for (const s of steps) {
      const d = s.duration ?? 0.2;
      for (const [part, v] of Object.entries(s.set || {})) {
        (tracks[part] ||= [[0, s.from?.[part] ?? v]]);
        const k = tracks[part]; const last = k[k.length - 1];
        if (last[0] < t) k.push([t, last[1], 'step']);
        k.push([t + d, v, s.ease || 'inOut']);
      }
      if (s.event) events.push({ t: t + (s.eventAt ?? d), name: s.event, data: s.data });
      t += d + (s.pause || 0);
    }
    return new MechClip(name, t, tracks, events);
  }
}

// Owns the parts of one prop and plays clips on them.
export class Rig {
  constructor() { this.parts = new Map(); this.clip = null; this.time = 0; this.speed = 1; this.queue = []; this.onEvent = null; }
  add(name, node, opts) { const p = new Part(node, { ...opts, name }); this.parts.set(name, p); return p; }
  get(name) { return this.parts.get(name); }
  set(name, v) { this.parts.get(name)?.set(v); return this; }
  play(clip, { speed = 1, onEvent = null, onDone = null, queue = false } = {}) {
    if (queue && this.clip) { this.queue.push({ clip, speed, onEvent, onDone }); return this; }
    this.clip = clip; this.time = 0; this.speed = speed; this._onEvent = onEvent; this._onDone = onDone; this._ev = 0;
    for (const name of Object.keys(clip.tracks)) { const p = this.parts.get(name); if (p) p.driven = true; }
    return this;
  }
  stop() {
    if (this.clip) for (const name of Object.keys(this.clip.tracks)) { const p = this.parts.get(name); if (p) { p.driven = false; p.target = p.value; p.vel = 0; } }
    this.clip = null; this.queue.length = 0;
  }
  get playing() { return !!this.clip; }
  update(dt) {
    if (this.clip) {
      const c = this.clip;
      this.time = Math.min(c.duration, this.time + dt * this.speed);
      for (const name of Object.keys(c.tracks)) { const p = this.parts.get(name); if (p) { p.value = p.target = c.sample(name, this.time); p.vel = 0; p.apply(); } }
      while (this._ev < c.events.length && c.events[this._ev].t <= this.time) {
        const e = c.events[this._ev++];
        if (this._onEvent) this._onEvent(e); if (this.onEvent) this.onEvent(e);
      }
      if (this.time >= c.duration) {
        const done = this._onDone; this.stop();
        const next = this.queue.shift(); if (next) this.play(next.clip, next);
        if (done) done(c);
      }
    }
    for (const p of this.parts.values()) p.update(dt);
  }
}

// A prop: a node with a rig, clips, actions and grip information. Generators (guns, tools)
// build these; Character.equip() reads grip/support to hold them.
export class Prop extends Node {
  constructor(name, { kind = 'prop', params = {}, grip = null, support = null, sockets = {} } = {}) {
    super(name);
    this.isProp = true; this.kind = kind; this.params = params;
    this.rig = new Rig(); this.clips = new Map(); this.handlers = {};
    // grip: { pose: hand pose name or {curl, spread}, socket: {position, rotation} in hand-bone space }
    this.grip = grip; this.support = support; this.sockets = sockets; this.state = {};
    this.rig.onEvent = (e) => { const h = this.handlers[e.name]; if (h) h(e.data, e); if (this.onEvent) this.onEvent(e); };
  }
  addClip(clip) { this.clips.set(clip.name, clip); return clip; }
  // play a clip by name; returns a promise that resolves when it ends
  play(name, opts = {}) {
    const c = this.clips.get(name);
    if (!c) return Promise.resolve(null);
    return new Promise((res) => this.rig.play(c, { ...opts, onDone: (x) => { opts.onDone?.(x); res(x); } }));
  }
  update(dt) { this.rig.update(dt); if (this.onUpdate) this.onUpdate(dt); }
  // world-space position of a named socket (muzzle, blade, lamp...)
  socketWorld(name) { const s = this.sockets[name]; if (!s) return null; this.updateWorld(this.parent ? this.parent.world : null); return vec3.transformMat4([0, 0, 0], s, this.world); }
}

// Update every prop and rig under a root (props nested in characters, buildings with doors).
export function updateMechanisms(root, dt) {
  root.traverse((n) => { if (n.isProp) n.update(dt); else if (n.userData?.rig) n.userData.rig.update(dt); });
}
