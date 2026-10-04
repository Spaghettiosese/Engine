// Stage: the level base class for Verity, built on ShapeForge's scene graph and Kit.
// Static geometry is collected in a Kit (one merged mesh per material); doors, lamps and
// actors are separate nodes. A stage owns the colliders, interaction targets, doors and
// hiding places that the first-person walker and the stalker AI work against.
import * as E from '../../src/engine/index.js';
import { Walker } from './walker.js';

const { Node, Mesh, Material, Light, Kit } = E;
const DEG = 180 / Math.PI;

// ------------------------------------------------------------------ small three-style handle
// Story scripts move things around with obj.position.x, obj.rotation.y, obj.visible...
class PosView {
  constructor(a) { this.a = a; }
  get x() { return this.a[0]; } set x(v) { this.a[0] = v; }
  get y() { return this.a[1]; } set y(v) { this.a[1] = v; }
  get z() { return this.a[2]; } set z(v) { this.a[2] = v; }
  set(x, y, z) { this.a[0] = x; this.a[1] = y; this.a[2] = z; return this; }
  copy(o) { return this.set(o.x, o.y, o.z); }
}
export class Obj3 {
  constructor(node) {
    this.node = node;
    this.position = new PosView(node.position);
    const self = this;
    this.rotation = { _y: 0, get y() { return this._y; }, set y(r) { this._y = r; node.setEuler(0, r * DEG, 0); } };
    this.scale = { get x() { return node.scale[0]; }, setScalar(s) { node.scale.set([s, s, s]); }, set(x, y, z) { node.scale.set([x, y, z]); } };
    Object.defineProperty(this, 'visible', { get: () => node.visible, set: (v) => { node.visible = v; } });
    void self;
  }
}

// rotate a local (x, z) offset by yaw (radians, about +Y)
export const rotXZ = (x, z, ry) => [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];

// A local coordinate frame for building furniture out of boxes: positions are relative to
// (x, y, z) and turned by ry about Y.
export class Frame {
  constructor(kit, x = 0, y = 0, z = 0, ry = 0) { this.kit = kit; this.o = [x, y, z]; this.ry = ry; }
  at(lx, ly, lz) { const [rx, rz] = rotXZ(lx, lz, this.ry); return [this.o[0] + rx, this.o[1] + ly, this.o[2] + rz]; }
  box(mat, c, size, bevel = 0, rot = [0, 0, 0]) { this.kit.box(mat, this.at(c[0], c[1], c[2]), size, [rot[0], rot[1] + this.ry * DEG, rot[2]], bevel); return this; }
  // box from its bottom-centre
  stand(mat, c, size, bevel = 0) { return this.box(mat, [c[0], c[1] + size[1] / 2, c[2]], size, bevel); }
  cyl(mat, c, r, h, segs = 14, r2 = r, rot = [0, 0, 0]) { this.kit.cyl(mat, this.at(c[0], c[1], c[2]), r, h, [rot[0], rot[1] + this.ry * DEG, rot[2]], segs, r2); return this; }
  shape(mat, spec, mods, c, rot = [0, 0, 0], scale = [1, 1, 1]) { this.kit.shape(mat, spec, mods, this.at(c[0], c[1], c[2]), [rot[0], rot[1] + this.ry * DEG, rot[2]], scale); return this; }
}

export const boundsOf = (cx, cy, cz, w, h, d) => ({ min: [cx - w / 2, cy, cz - d / 2], max: [cx + w / 2, cy + h, cz + d / 2] });

// A lamp: a point light plus glowing bulbs. `intensity` and `userData.base` mirror the old scripts.
export class Lamp {
  constructor(light, base) { this.light = light; this.ud = { base }; this.on = true; this.mats = []; }
  get base() { return this.ud.base; } set base(v) { this.ud.base = v; }
  get userData() { return this.ud; }
  get intensity() { return this.light.intensity; } set intensity(v) { this.light.intensity = v; }
}

// ------------------------------------------------------------------ the stage
export class Stage {
  constructor(game, { height = 2.7 } = {}) {
    this.game = game;
    this.scene = new E.Scene();
    this.pal = E.archPalette();
    this.kit = new Kit(this.pal);
    this.H = height;
    this.colliders = [];
    this.interacts = [];
    this.doors = [];
    this.hides = [];
    this.actors = [];
    this.updaters = [];
    this.lampList = [];
    this.used = new Map();
    this.surface = 'wood';
    this.focus = null;
    this.player = new Walker(game, this);
    this.particles = [];
    this.lines = null;
    this.disposed = false;
    this.built = false;
    this.env = this.scene.environment;
  }

  enter() {
    this.game.camera.fov = 70 * (Math.PI / 180);
    this.game.camera.near = 0.05;
    this.player.attach();
  }
  dispose() { this.disposed = true; }

  // ------------------------------------------------------------------ building
  // Finish static geometry. Call once after all walls, floors and furniture are added.
  build(name = 'Level') {
    const node = this.kit.toNode(name);
    node.userData.static = true;
    this.scene.add(node);
    this.staticNode = node;
    this.built = true;
    return node;
  }
  // an extra Kit for dynamic (separately transformed) objects: toNode() it and add it
  newKit() { return new Kit(this.pal); }

  add(node, x = 0, y = 0, z = 0, ry = 0) {
    node.position.set([x, y, z]); if (ry) node.setEuler(0, ry * DEG, 0);
    this.scene.add(node);
    return node;
  }
  addCollider(x0, z0, x1, z1, tag = 'solid') {
    const c = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), on: true, tag };
    this.colliders.push(c);
    return c;
  }
  // collider for a furniture footprint
  solid(cx, cz, w, d, tag = 'solid') { return this.addCollider(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, tag); }

  // wall along X at fixed z, or along Z at fixed x. gaps: [{a, b, y0, y1}] (openings)
  wallX(z, x0, x1, gaps = [], o = {}) { this._wall('x', z, x0, x1, gaps, o); }
  wallZ(x, z0, z1, gaps = [], o = {}) { this._wall('z', x, z0, z1, gaps, o); }
  wall2(axis, fixed, s0, s1, gaps, matNeg, matPos) { // two-sided: a different surface each side
    this._wall(axis, fixed - 0.045, s0, s1, gaps, { mat: matNeg, t: 0.09, noTrim: true });
    this._wall(axis, fixed + 0.045, s0, s1, gaps, { mat: matPos, t: 0.09, noTrim: true, trimDone: true });
    this._frames(axis, fixed, gaps, 0.2);
  }
  _wall(axis, fixed, s0, s1, gaps, o) {
    const H = o.h ?? this.H, t = o.t ?? 0.16, mat = o.mat || this.wallMat;
    const lo = Math.min(s0, s1), hi = Math.max(s0, s1), kit = this.kit;
    const seg = (a, b, y0, y1, collide) => {
      if (b - a < 0.001 || y1 - y0 < 0.001) return;
      if (axis === 'x') kit.span(mat, [a, y0, fixed - t / 2], [b, y1, fixed + t / 2]);
      else kit.span(mat, [fixed - t / 2, y0, a], [fixed + t / 2, y1, b]);
      if (collide && o.collide !== false) {
        if (axis === 'x') this.addCollider(a, fixed - t / 2, b, fixed + t / 2, 'wall');
        else this.addCollider(fixed - t / 2, a, fixed + t / 2, b, 'wall');
      }
    };
    let cur = lo;
    for (const gp of gaps.slice().sort((p, q) => p.a - q.a)) {
      if (gp.a > cur) seg(cur, gp.a, 0, H, true);
      const y0 = gp.y0 ?? 0, y1 = gp.y1 ?? 2.1;
      if (y0 > 0) seg(gp.a, gp.b, 0, y0, true);
      if (y1 < H) seg(gp.a, gp.b, y1, H, false);
      cur = gp.b;
    }
    if (cur < hi) seg(cur, hi, 0, H, true);
    if (!o.noTrim) this._frames(axis, fixed, gaps, t + 0.1);
  }
  // door frames and window sills/panes
  _frames(axis, fixed, gaps, depth) {
    const kit = this.kit, trim = this.pal.trim, f = 0.055;
    for (const gp of gaps) {
      const y0 = gp.y0 ?? 0, y1 = gp.y1 ?? 2.1, win = y0 > 0.2;
      const box = (a0, b0, a1, b1) => (axis === 'x' ? kit.span(trim, [a0, b0, fixed - depth / 2], [a1, b1, fixed + depth / 2]) : kit.span(trim, [fixed - depth / 2, b0, a0], [fixed + depth / 2, b1, a1]));
      box(gp.a - f, y0 - (win ? f : 0), gp.a, y1 + f); box(gp.b, y0 - (win ? f : 0), gp.b + f, y1 + f);
      box(gp.a - f, y1, gp.b + f, y1 + f);
      if (win) {
        box(gp.a - f, y0 - f, gp.b + f, y0);
        const mid = (gp.a + gp.b) / 2, c = (y0 + y1) / 2;
        // glass pane + muntins
        if (axis === 'x') { kit.span(this.pal.glass, [gp.a, y0, fixed - 0.01], [gp.b, y1, fixed + 0.01]); kit.span(trim, [mid - 0.02, y0, fixed - 0.03], [mid + 0.02, y1, fixed + 0.03]); kit.span(trim, [gp.a, c - 0.02, fixed - 0.03], [gp.b, c + 0.02, fixed + 0.03]); }
        else { kit.span(this.pal.glass, [fixed - 0.01, y0, gp.a], [fixed + 0.01, y1, gp.b]); kit.span(trim, [fixed - 0.03, y0, mid - 0.02], [fixed + 0.03, y1, mid + 0.02]); kit.span(trim, [fixed - 0.03, c - 0.02, gp.a], [fixed + 0.03, c + 0.02, gp.b]); }
      }
    }
  }
  floor(x0, z0, x1, z1, mat, y = 0) { this.kit.span(mat, [x0, y - 0.1, z0], [x1, y, z1]); }
  ceiling(x0, z0, x1, z1, mat, y = this.H) { this.kit.span(mat, [x0, y, z0], [x1, y + 0.12, z1]); }

  // ------------------------------------------------------------------ interaction
  hitbox(w, h, d, x, y, z) { return { min: [x - w / 2, y, z - d / 2], max: [x + w / 2, y + h, z + d / 2] }; }
  // target: a hitbox {min, max}, a function returning one, or an Actor / Obj3 / Node (a box round its position)
  addInteract(target, def) {
    def.target = target;
    def.enabled = def.enabled ?? true;
    def.range = def.range ?? 2.3;
    this.interacts.push(def);
    return def;
  }
  interact(id) { return this.interacts.find((d) => d.id === id); }
  optional(target, id, prompt, fn, opts = {}) {
    let running = false;
    return this.addInteract(target, {
      id, prompt, range: opts.range, enabled: opts.enabled,
      onUse: () => {
        if (running || this.game.ui.busy) return;
        running = true;
        const prev = this.game.control;
        Promise.resolve().then(fn).catch((e) => { if (!e || !e.cancelled) console.error(e); }).finally(() => {
          running = false;
          if (opts.restoreControl && this.game.control !== prev) this.game.control = prev;
        });
      },
    });
  }
  enable(id, on = true) { const d = this.interact(id); if (d) d.enabled = on; return d; }
  waitUse(id) {
    const start = this.used.get(id) || 0;
    return this.game.dir.until(() => (this.used.get(id) || 0) > start);
  }
  use(def) {
    this.used.set(def.id, (this.used.get(def.id) || 0) + 1);
    if (def.onUse) def.onUse(def);
  }
  _box(t) {
    if (!t) return null;
    if (typeof t === 'function') return t();
    if (t.min && t.max) return t;
    if (t.getBox) return t.getBox();
    const p = t.position && t.position.x !== undefined ? [t.position.x, t.position.y, t.position.z] : t.position;
    return p ? { min: [p[0] - 0.4, p[1], p[2] - 0.4], max: [p[0] + 0.4, p[1] + 1.8, p[2] + 0.4] } : null;
  }

  // ------------------------------------------------------------------ doors
  addDoor(o) {
    const w = o.w ?? 0.92, h = o.h ?? 2.08, hinge = o.hinge ?? 1;
    const along = o.axis === 'x' ? [1, 0] : [0, 1];
    const pivot = new Node('Door ' + (o.id || ''));
    pivot.position.set([o.x + along[0] * hinge * w / 2, 0, o.z + along[1] * hinge * w / 2]);
    const k = new Kit(this.pal);
    const mat = o.mat || this.doorMat || this.pal.door;
    const T = 0.045;
    // the leaf lies along the hinge axis, centred on the opening
    const c = [-along[0] * hinge * w / 2, 0, -along[1] * hinge * w / 2];
    const sz = o.axis === 'x' ? [w, h, T] : [T, h, w];
    k.box(mat, [c[0], h / 2, c[2]], sz, [0, 0, 0], 0.006);
    for (const fy of [0.28, 0.74]) k.box(mat, [c[0], h * fy, c[2]], o.axis === 'x' ? [w * 0.68, h * 0.3, T + 0.014] : [T + 0.014, h * 0.3, w * 0.68], [0, 0, 0], 0.006);
    const kn = [c[0] - along[0] * hinge * w * 0.4, 1.0, c[2] - along[1] * hinge * w * 0.4];
    k.box(this.pal.metal, kn, [0.06, 0.06, 0.06]);
    k.box(this.pal.metal, [kn[0] + (o.axis === 'x' ? 0 : 0.04), kn[1], kn[2] + (o.axis === 'x' ? 0.04 : 0)], [0.04, 0.04, 0.04]);
    pivot.add(k.toNode('Door leaf'));
    this.scene.add(pivot);
    const col = o.axis === 'x'
      ? this.addCollider(o.x - w / 2, o.z - 0.07, o.x + w / 2, o.z + 0.07, 'door')
      : this.addCollider(o.x - 0.07, o.z - w / 2, o.x + 0.07, o.z + w / 2, 'door');
    const door = {
      id: o.id, pivot, col, open: false, k: 0, target: 0, locked: !!o.locked, swing: o.swing ?? 1, x: o.x, z: o.z, axis: o.axis, name: o.name || 'door', onLocked: o.onLocked,
      setOpen: (v, silent) => {
        if (door.open === v) return;
        door.open = v; door.target = v ? 1 : 0; col.on = !v;
        if (!silent) this.game.audio.door(v);
      },
    };
    const box = o.axis === 'x' ? this.hitbox(w, h, 0.3, o.x, 0, o.z) : this.hitbox(0.3, h, w, o.x, 0, o.z);
    door.def = this.addInteract(box, {
      id: o.id,
      prompt: () => (door.locked ? `${door.name} (locked)` : door.open ? `Close ${door.name}` : `Open ${door.name}`),
      onUse: () => {
        if (door.locked) { this.game.audio.locked(); if (door.onLocked) door.onLocked(); return; }
        door.setOpen(!door.open);
        this.makeNoise(o.x, o.z, 4);
      },
    });
    if (o.open) { door.setOpen(true, true); door.k = 1; }
    this.doors.push(door);
    return door;
  }
  door(id) { return this.doors.find((d) => d.id === id); }

  // ------------------------------------------------------------------ hiding places
  addHide(o) {
    const h = { ...o };
    this.hides.push(h);
    this.addInteract(o.box, { id: o.id, prompt: () => (o.type === 'bed' ? 'Hide under bed' : 'Hide in closet'), onUse: () => this.player.enterHide(h) });
    return h;
  }
  setHidesEnabled(on) { for (const h of this.hides) { const d = this.interact(h.id); if (d) d.enabled = on; } }

  // ------------------------------------------------------------------ lights
  // A lamp: a point light and (optionally) a glowing bulb that can be switched with the power.
  addLamp(x, y, z, o = {}) {
    const light = new Light(o.type || 'point', { color: o.color || '#ffd9a0', intensity: o.intensity ?? 4, range: o.range ?? 8, angle: o.angle, flicker: o.flicker ?? 0 });
    light.position.set([x, y, z]);
    this.scene.add(light);
    const lamp = new Lamp(light, o.intensity ?? 4);
    if (o.bulb !== false) {
      const m = new Material({ name: 'Bulb', color: '#fff4d8', emissive: o.color || '#ffd9a0', emissiveStrength: 5, roughness: 0.4 });
      const bulb = new Mesh(E.sphere({ radius: o.bulbSize ?? 0.07, widthSegments: 10, heightSegments: 7 }), m, 'Bulb');
      bulb.position.set([x, y - 0.02, z]); bulb.castShadow = false; this.scene.add(bulb);
      lamp.mats.push({ m, on: 5 });
    }
    this.lampList.push(lamp);
    return lamp;
  }
  setPower(on) {
    this.power = on;
    for (const l of this.lampList) this._lampState(l, on && l.on);
    this.onPower && this.onPower(on);
  }
  _lampState(l, on) { l.light.intensity = on ? l.base : 0; for (const m of l.mats) m.m.emissiveStrength = on ? m.on : 0; }
  // speaking actors move their hands
  onSpeak(name, text) { const n = (name || '').replace(' (IRL)', ''); const a = this.actors.find((x) => x.name === n); if (a) a.talkFor(Math.min(5, 0.8 + text.length * 0.045)); }
  setLampOn(lamp, on) { lamp.on = on; this._lampState(lamp, on && this.power !== false); }
  makeNoise(x, z, radius) { if (this.onNoise) this.onNoise(x, z, radius); }

  // ------------------------------------------------------------------ collision + sight
  collide(pos, r) {
    for (let it = 0; it < 3; it++) {
      for (const c of this.colliders) {
        if (!c.on) continue;
        const cx = Math.max(c.x0, Math.min(pos.x, c.x1)), cz = Math.max(c.z0, Math.min(pos.z, c.z1));
        const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-9) { const d = Math.sqrt(d2); pos.x += dx / d * (r - d); pos.z += dz / d * (r - d); }
          else {
            const l = pos.x - c.x0, rr = c.x1 - pos.x, f = pos.z - c.z0, b = c.z1 - pos.z, m = Math.min(l, rr, f, b);
            if (m === l) pos.x = c.x0 - r; else if (m === rr) pos.x = c.x1 + r; else if (m === f) pos.z = c.z0 - r; else pos.z = c.z1 + r;
          }
        }
      }
    }
  }
  // line of sight between two points in XZ (walls and closed doors block)
  los(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    for (const c of this.colliders) {
      if (!c.on || (c.tag !== 'wall' && c.tag !== 'door')) continue;
      let t0 = 0, t1 = 1;
      if (Math.abs(dx) < 1e-9) { if (ax < c.x0 || ax > c.x1) continue; }
      else { let ta = (c.x0 - ax) / dx, tb = (c.x1 - ax) / dx; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue; }
      if (Math.abs(dz) < 1e-9) { if (az < c.z0 || az > c.z1) continue; }
      else { let ta = (c.z0 - az) / dz, tb = (c.z1 - az) / dz; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue; }
      return false;
    }
    return true;
  }
  near(x, z, r) { return Math.hypot(this.player.pos.x - x, this.player.pos.z - z) < r; }

  // ------------------------------------------------------------------ frame
  update(dt) {
    this.player.update(dt);
    for (const d of this.doors) {
      if (Math.abs(d.k - d.target) > 0.001) {
        d.k += Math.sign(d.target - d.k) * Math.min(Math.abs(d.target - d.k), dt * 2.8);
        d.pivot.setEuler(0, d.k * 92 * d.swing, 0);
      }
    }
    for (const a of this.actors) a.update(dt);
    for (const u of this.updaters) u(dt);
    this.checkInteract();
  }

  checkInteract() {
    const g = this.game;
    if (g.control !== 'walk' || g.ui.busy || g.paused) { g.ui.prompt(null); this.focus = null; return; }
    const cam = g.camera, o = cam.position, t = cam.target;
    const dir = [t[0] - o[0], t[1] - o[1], t[2] - o[2]], dl = Math.hypot(...dir) || 1;
    dir[0] /= dl; dir[1] /= dl; dir[2] /= dl;
    let best = null, bestT = Infinity;
    for (const d of this.interacts) {
      if (!d.enabled) continue;
      const b = this._box(d.target); if (!b) continue;
      const hit = rayBox(o, dir, b);
      if (hit === null || hit > d.range || hit >= bestT) continue;
      // something solid in the way?
      const px = o[0] + dir[0] * hit, pz = o[2] + dir[2] * hit;
      if (hit > 0.3 && !this.los(o[0], o[2], px, pz) && !(d.door)) {
        // allow targets that are part of the wall itself (doors)
        if (!this._touchesWall(b, px, pz)) continue;
      }
      best = d; bestT = hit;
    }
    this.focus = best;
    if (best) {
      const p = typeof best.prompt === 'function' ? best.prompt() : best.prompt;
      g.ui.prompt(p || 'Use');
      if (g.input.wasHit('interact')) { g.input.consume('interact'); g.input.consume('advance'); this.use(best); }
    } else g.ui.prompt(null);
  }
  _touchesWall(b, px, pz) {
    // a box that sits inside a wall collider (a door, a window, a picture) can be reached
    for (const c of this.colliders) if (c.on && (c.tag === 'wall' || c.tag === 'door') && px > c.x0 - 0.2 && px < c.x1 + 0.2 && pz > c.z0 - 0.2 && pz < c.z1 + 0.2) return true;
    return false;
  }
}

// ray vs axis-aligned box (slab test). Returns the entry distance or null.
export function rayBox(o, d, b) {
  let t0 = 0, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < b.min[i] || o[i] > b.max[i]) return null; continue; }
    let ta = (b.min[i] - o[i]) / d[i], tb = (b.max[i] - o[i]) / d[i];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return t0;
}
