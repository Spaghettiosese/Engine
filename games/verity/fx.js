// Screen effects on top of the ShapeForge renderer: VHS scanlines and noise, glitch jitter,
// the red "danger" pulse, brightness. Story scripts poke fx.u.* like shader uniforms; the
// values are applied to CSS layers and the engine's own post settings every frame.
export class Fx {
  constructor() {
    this.u = {
      uTime: { value: 0 }, uGlitch: { value: 0 }, uFade: { value: 0 }, uDanger: { value: 0 }, uVhs: { value: 1 },
      uBright: { value: 1 }, uTint: { value: { set() {} } }, uDither: { value: 1 },
    };
    this.base = null;
  }
  bind(renderer, canvas) {
    this.renderer = renderer; this.canvas = canvas;
    this.danger = document.getElementById('danger');
    this.vhs = document.getElementById('vhs');
    this.base = { exposure: renderer.settings.exposure, aberration: renderer.settings.aberration, grain: renderer.settings.grain, vignette: renderer.settings.vignette };
  }
  update(dt) {
    const u = this.u, r = this.renderer;
    u.uTime.value += dt;
    if (!r || !this.base) return;
    const g = u.uGlitch.value, d = u.uDanger.value;
    r.settings.exposure = this.base.exposure * u.uBright.value;
    r.settings.aberration = this.base.aberration + g * 4;
    r.settings.grain = this.base.grain + u.uVhs.value * 0.02 + g * 0.2;
    r.settings.vignette = this.base.vignette + d * 0.5;
    if (this.vhs) this.vhs.style.opacity = String(Math.max(0, Math.min(1, u.uVhs.value)));
    if (this.danger) { this.danger.style.opacity = String(Math.min(1, d * (0.75 + 0.25 * Math.sin(u.uTime.value * (4 + d * 8))))); }
    if (this.canvas) {
      if (g > 0.02) {
        const j = g * 14, sx = (Math.random() - 0.5) * j, sy = (Math.random() - 0.5) * j * 0.3;
        this.canvas.style.transform = `translate(${sx}px, ${sy}px) scale(${1 + g * 0.015})`;
        this.canvas.style.filter = `hue-rotate(${(Math.random() - 0.5) * g * 90}deg) contrast(${1 + g * 0.5}) saturate(${1 + g})`;
      } else if (this.canvas.style.transform) { this.canvas.style.transform = ''; this.canvas.style.filter = ''; }
    }
  }
}
