// Fire and smoke. Burnables are things that can catch fire: each has fuel, an ignition
// point and a size. A burning object heats everything flammable near it (inverse-square,
// pushed downwind and upward because flames rise); anything that gets hot enough ignites,
// so fire spreads across a street of crates on its own. Fires grow, burn their fuel, char
// their material, then die to embers and smoke. They give off light: a small pool of
// flickering point lights follows the strongest fires. Flames are additive particles that
// shift from white-yellow to deep red; smoke is soft, dark and rises and billows with the wind.
import { Particles } from './particles.js';
import { Light, Material } from './scene.js';
import { vec3, hexToRGB, rgbToHex, clamp } from './math.js';

let NEXT = 1;
export class FireSystem {
  constructor(scene, { maxLights = 6, maxFlames = 3000, maxSmoke = 2500, wind = [0.4, 0, 0.1] } = {}) {
    this.scene = scene;
    this.flames = new Particles(maxFlames, { additive: true });
    this.flames.gravity = 0; this.flames.drag = 2.2;
    this.smoke = new Particles(maxSmoke);
    this.smoke.gravity = 0; this.smoke.drag = 0.6;
    this.wind = [...wind];
    this.burnables = []; this.emitters = [];
    this.lights = [];
    for (let i = 0; i < maxLights; i++) { const l = new Light('point', { color: '#ff8a3a', intensity: 0, range: 9, flicker: 0.7, profile: 'smooth' }); l.name = 'Fire light'; scene.add(l); this.lights.push(l); }
    this.onIgnite = null; this.onBurntOut = null;
    this.time = 0;
    this.stats = { burning: 0, burnables: 0, flames: 0, smoke: 0 };
  }
  // Register something flammable. target: a Node (its meshes char as they burn) or a plain
  // position. radius: size of the fire it makes. fuel: seconds of burning at full size.
  add(target, { position = null, radius = 0.5, fuel = 25, ignition = 1, flammability = 1, height = null, char = true } = {}) {
    const node = target && target.isNode !== false && target.children ? target : null;
    const b = {
      id: NEXT++, node, position: position || (node ? node.worldPosition() : [...target]), radius, height: height ?? radius * 1.6,
      fuel, maxFuel: fuel, ignition, flammability, heat: 0, fire: 0, state: 'fresh', char, charred: 0, mats: null,
    };
    if (node && char) { // give the object its own materials so charring doesn't spread to shared ones
      b.mats = [];
      node.traverse((n) => { if (n.material && !n.userData.noChar) { const m = new Material({ ...n.material }); m.name = n.material.name + ' (burning)'; n.material = m; b.mats.push({ m, base: m.color, basePat: m.patternColor }); } });
    }
    this.burnables.push(b);
    return b;
  }
  // A permanent fire (campfire, torch, brazier) with endless fuel.
  addSource(position, { radius = 0.4, strength = 1 } = {}) { const b = this.add(position, { radius, fuel: Infinity, ignition: 0 }); b.fire = strength; b.state = 'burning'; b.permanent = true; return b; }
  // A smoke column without fire (chimney, smouldering ruin, smoke bomb).
  addSmoke(position, { rate = 20, size = 0.6, color = [0.28, 0.27, 0.26, 0.5], life = 6, duration = Infinity } = {}) { const e = { position: [...position], rate, size, color, life, t: 0, duration, acc: 0 }; this.emitters.push(e); return e; }
  ignite(b, amount = 0.25) { if (b.state === 'fresh' || b.state === 'hot') { b.state = 'burning'; b.fire = Math.max(b.fire, amount); if (this.onIgnite) this.onIgnite(b); } return b; }
  // Light whatever is flammable within `radius` of a point (a thrown torch, a spark).
  igniteAt(point, radius = 1) { let n = 0; for (const b of this.burnables) if (b.state !== 'burnt' && vec3.dist(b.position, point) < radius + b.radius) { this.ignite(b); n++; } return n; }
  extinguish(b) { if (b.state === 'burning') { b.state = b.fuel > 0 ? 'fresh' : 'burnt'; b.fire = 0; b.heat = 0; } }
  remove(b) { this.burnables = this.burnables.filter((x) => x !== b); }
  get burning() { return this.burnables.filter((b) => b.state === 'burning'); }

  update(dt, camera = null) {
    this.time += dt;
    const burning = this.burning, w = this.wind;
    this.flames.wind = [w[0] * 0.6, 0, w[2] * 0.6]; this.smoke.wind = [w[0] * 1.5, 0, w[2] * 1.5];
    // heat transfer from every fire to every flammable neighbour
    for (const b of this.burnables) {
      if (b.node && !b.permanent) b.position = b.node.worldPosition();
      if (b.state === 'burnt' || b.state === 'burning') continue;
      let q = 0;
      for (const f of burning) {
        const d = [b.position[0] - f.position[0], b.position[1] - (f.position[1] + f.height * 0.5), b.position[2] - f.position[2]];
        const dist = Math.max(0.3, vec3.len(d) - b.radius - f.radius * 0.5);
        const downwind = 1 + Math.max(0, (d[0] * w[0] + d[2] * w[2]) / (vec3.len(d) + 1e-6)) * 0.8, above = d[1] > 0 ? 1.6 : 1;
        q += (f.fire * f.radius * 1.3 * downwind * above) / (dist * dist);
      }
      b.heat = Math.max(0, b.heat + (q * b.flammability - b.heat * 0.35) * dt); // heats up, cools off
      if (b.heat > 0.4 * b.ignition && b.state === 'fresh') b.state = 'hot';
      if (b.heat < 0.2 * b.ignition && b.state === 'hot') b.state = 'fresh';
      if (b.heat >= b.ignition) this.ignite(b);
    }
    // grow, burn and die
    for (const b of burning) {
      const target = b.fuel === Infinity ? 1 : clamp(b.fuel / (b.maxFuel * 0.25), 0, 1);
      b.fire += ((target > b.fire ? 0.35 : 1) * (target - b.fire)) * dt; // grows slowly, dies quickly
      if (b.fuel !== Infinity) b.fuel -= dt * b.fire;
      if (b.mats) { b.charred = Math.min(1, b.charred + dt * b.fire * 0.08); this._char(b); }
      if (b.fuel !== Infinity && b.fuel <= 0 && b.fire < 0.03) { b.state = 'burnt'; b.fire = 0; this.addSmoke([...b.position], { rate: 6, size: b.radius, duration: 12, life: 5 }); if (this.onBurntOut) this.onBurntOut(b); continue; }
      this._emit(b, dt);
    }
    // smoke columns
    for (const e of this.emitters) {
      e.t += dt; if (e.t > e.duration) continue;
      e.acc += e.rate * dt * (e.duration === Infinity ? 1 : 1 - e.t / e.duration);
      while (e.acc >= 1) { e.acc--; this.smoke.emit(e.position, { count: 1, color: e.color, colorEnd: [e.color[0] * 1.3, e.color[1] * 1.3, e.color[2] * 1.3, 0.1], size: e.size, grow: 4, spread: 0.2, up: 0.8, buoyancy: 0.5, life: e.life, jitter: e.size * 0.4 }); }
    }
    this.emitters = this.emitters.filter((e) => e.t <= e.duration);
    this.flames.update(dt); this.smoke.update(dt);
    this._lights(camera);
    this.stats = { burning: burning.length, burnables: this.burnables.length, flames: this.flames.count, smoke: this.smoke.count };
  }
  _emit(b, dt) {
    const f = b.fire, r = b.radius, p = b.position;
    const n = Math.min(24, f * r * 160 * dt + Math.random());
    for (let i = 0; i < n; i++) {
      const hot = Math.random();
      this.flames.emit([p[0], p[1] + r * 0.2, p[2]], {
        count: 1, color: hot > 0.6 ? [3.2, 2.2, 1.0, 0.55] : [2.8, 1.2, 0.3, 0.5], colorEnd: [0.9, 0.12, 0.03, 0.2],
        size: r * (0.75 + f * 0.6), grow: 0.45, spread: r * 0.35, up: 0.9 + f * 1.1, buoyancy: 2.4, life: 0.5 + f * 0.4, jitter: r * 0.6,
      });
    }
    if (Math.random() < f * r * 3 * dt) this.flames.emit([p[0], p[1] + r * 0.5, p[2]], { count: 1, color: [6, 3, 1, 1], colorEnd: [3, 0.6, 0.1, 0.6], size: 0.025, grow: 0.5, spread: 1.2, up: 3, buoyancy: 1, life: 1.4, jitter: r * 0.5 }); // sparks
    if (Math.random() < f * r * 16 * dt) this.smoke.emit([p[0], p[1] + b.height * (0.6 + f * 0.5), p[2]], {
      count: 1, color: [0.09, 0.085, 0.08, 0.6 * Math.min(1, f + 0.3)], colorEnd: [0.3, 0.29, 0.28, 0.14], size: r * 1.1, grow: 5, spread: 0.25, up: 1.1, buoyancy: 0.6, life: 5 + r * 3, jitter: r * 0.4,
    });
  }
  _char(b) {
    const k = b.charred * 0.85, soot = [0.06, 0.045, 0.035];
    for (const { m, base, basePat } of b.mats) {
      const c = hexToRGB(base), pc = hexToRGB(basePat);
      m.color = rgbToHex(c.map((v, i) => v + (soot[i] - v) * k));
      m.patternColor = rgbToHex(pc.map((v, i) => v + (soot[i] - v) * k));
      m.emissive = '#ff3a08'; m.emissiveStrength = b.state === 'burning' ? b.fire * 0.12 * b.charred * b.charred : 0; // embers glow through the soot
      m.roughness = Math.min(1, m.roughness + 0.001);
    }
  }
  // The brightest fires (nearest the camera when there are too many) get the real lights.
  _lights(camera) {
    const cam = camera ? camera.position : [0, 0, 0];
    const lit = this.burning.map((b) => ({ b, score: b.fire * b.radius / (1 + vec3.dist(b.position, cam) * 0.05) })).sort((a, c) => c.score - a.score);
    this.lights.forEach((l, i) => {
      const e = lit[i];
      if (!e) { l.intensity = 0; return; }
      const b = e.b;
      l.position.set([b.position[0], b.position[1] + b.height * 0.55, b.position[2]]);
      l.setCandela(700 * b.fire * b.radius * 2); l.range = 5 + b.radius * 9 * Math.max(0.4, b.fire);
    });
  }
  // Particle systems to hand to renderer.render({ particles: [...] }); smoke first, then flames.
  get particles() { return [this.smoke, this.flames]; }
}
