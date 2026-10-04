// Shared helpers for chapter scripts.
export class Caught extends Error { constructor() { super('caught'); this.caught = true; } }

export async function chapterCard(g, small, big, time, dur = 4.5) {
  g.retro.u.uFade.value = 1;
  document.getElementById('fader').style.opacity = 1;
  await g.ui.card([{ t: small, cls: 'small' }, { t: big, cls: 'big' }, { t: time, cls: 'time' }], { dur });
}

// Yaw for a camera at (fx,fz) looking at (tx,tz)
export function yawTo(fx, fz, tx, tz) { return Math.atan2(-(tx - fx), -(tz - fz)); }

export function lookAtPoint(g, x, y, z, dur = 0.8) {
  const pos = [...g.camera.position];
  return g.camTo(pos, [x, y, z], dur).then(() => { if (g.level && g.level.player) g.level.player.syncFromCamera(); });
}

// Puppet Combo style catch: the thing is suddenly in your face. `mon` is a Stalker or a bare
// Grinner Character.
export async function jumpscare(g, mon, opts = {}) {
  g.control = 'none';
  g.ui.prompt(null);
  g.ui.hideVeil(null);
  const cam = g.camera;
  const ch = mon.m || mon;
  let dx = cam.target[0] - cam.position[0], dz = cam.target[2] - cam.position[2];
  const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  const camY = cam.position[1];
  const s = Math.max(0.3, camY / 2.3);
  ch.visible = true;
  ch.scale.set([s, s, s]);
  ch.position.set([cam.position[0] + dx * 0.5 * s, 0, cam.position[2] + dz * 0.5 * s]);
  ch.setEuler(0, Math.atan2(-dx, -dz) * 180 / Math.PI, 0);
  ch.play('Chase', { fade: 0.05 });
  g.audio.jumpscare();
  g.retro.u.uGlitch.value = 1;
  g.ui.danger(1);
  const t0 = g.time, p0 = [...cam.position];
  await g.dir.until(() => {
    ch.update(0.016);
    cam.position[0] = p0[0] + (Math.random() - 0.5) * 0.01; cam.position[1] = p0[1] + (Math.random() - 0.5) * 0.01;
    cam.target[0] = p0[0] + dx * 0.5 * s + (Math.random() - 0.5) * 0.05; cam.target[1] = camY + (Math.random() - 0.5) * 0.05; cam.target[2] = p0[2] + dz * 0.5 * s;
    return g.time - t0 > (opts.dur ?? 1.0);
  });
  g.retro.u.uFade.value = 1;
  document.getElementById('fader').style.opacity = 1;
  g.retro.u.uGlitch.value = 0;
  g.ui.danger(0);
  g.audio.heart = 0;
  if (!opts.noAchieve) g.achieve('caught');
  await g.wait(0.7);
}

// Short helper: say a line and make an actor talk.
export function sayer(g) { return (name, text, opts) => g.ui.say(name, text, opts); }
