// Tiny CPU particle system (dust puffs, sparks). Rendered as soft point sprites.
import { rng } from './math.js';

export class Particles {
  // additive: true blends by adding light (fire, sparks, magic) instead of alpha (dust, smoke)
  constructor(max = 2000, { additive = false } = {}) {
    this.max = max; this.list = []; this.data = new Float32Array(max * 8); this.count = 0; this.rand = rng(7);
    this.gravity = -0.6; this.drag = 1.8; this.additive = additive; this.wind = [0, 0, 0];
  }
  // burst of dust at position p (world), moving roughly along vel
  // colorEnd: colour at end of life; grow: size multiplier at end of life; buoyancy: upward
  // acceleration (hot gas rises); jitter: random start offset radius
  emit(p, { count = 12, color = [0.72, 0.6, 0.46, 0.5], colorEnd = null, size = 0.12, grow = 2.4, spread = 0.6, up = 0.6, life = 1.2, vel = [0, 0, 0], buoyancy = 0, jitter = 0.04 } = {}) {
    const r = this.rand;
    for (let i = 0; i < count && this.list.length < this.max; i++) {
      const a = r() * Math.PI * 2, s = spread * (0.3 + r() * 0.7);
      this.list.push({
        p: [p[0] + (r() - 0.5) * jitter * 2, p[1] + r() * 0.03, p[2] + (r() - 0.5) * jitter * 2],
        v: [Math.cos(a) * s + vel[0], up * (0.4 + r() * 0.6) + vel[1], Math.sin(a) * s + vel[2]],
        age: 0, life: life * (0.6 + r() * 0.6), size: size * (0.6 + r() * 0.8), color, colorEnd, grow, buoyancy,
      });
    }
  }
  update(dt) {
    const out = [];
    for (const q of this.list) {
      q.age += dt; if (q.age >= q.life) continue;
      const k = Math.exp(-this.drag * dt);
      q.v[0] = q.v[0] * k + this.wind[0] * dt; q.v[2] = q.v[2] * k + this.wind[2] * dt; q.v[1] = q.v[1] * k + (this.gravity * 0.2 + q.buoyancy) * dt;
      q.p[0] += q.v[0] * dt; q.p[1] = Math.max(0.01, q.p[1] + q.v[1] * dt); q.p[2] += q.v[2] * dt;
      out.push(q);
    }
    this.list = out;
    this.count = out.length;
    for (let i = 0; i < out.length; i++) {
      const q = out[i], t = q.age / q.life, o = i * 8;
      const c = q.color, e = q.colorEnd || c;
      this.data[o] = q.p[0]; this.data[o + 1] = q.p[1]; this.data[o + 2] = q.p[2]; this.data[o + 3] = q.size * (0.6 + t * (q.grow - 0.6));
      this.data[o + 4] = c[0] + (e[0] - c[0]) * t; this.data[o + 5] = c[1] + (e[1] - c[1]) * t; this.data[o + 6] = c[2] + (e[2] - c[2]) * t;
      this.data[o + 7] = (c[3] + (e[3] - c[3]) * t) * (1 - t) * Math.min(1, t * 8);
    }
  }
}
