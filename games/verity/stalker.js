// The thing that walks the Zhong house at night. Patrols a waypoint graph,
// investigates noises, chases on sight, and checks hiding spots.
import { grinner } from './cast.js';
import { Obj3 } from './stage.js';

const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
// Locomotion for the Grinner: Idle -> Walk -> Chase by speed (the clips are 0.9 and 5.0 m/s at full size).
function poseGrinner(m, dt, speed, scale) {
  const v = speed / scale, vWalk = 0.9, vRun = 5.0;
  const w = v < vWalk ? { Idle: Math.max(0, 1 - v / vWalk), Walk: Math.min(1, v / vWalk) } : { Walk: Math.max(0, 1 - (v - vWalk) / (vRun - vWalk)), Chase: Math.min(1, (v - vWalk) / (vRun - vWalk)) };
  m.mixer.setWeights(w, 0.25);
  m.update(dt);
}

export class Stalker {
  constructor(level, opts = {}) {
    this.level = level;
    this.game = level.game;
    this.m = grinner();
    this.m.play('Idle', { fade: 0 });
    this.group = new Obj3(this.m);
    this.scale = opts.scale ?? 0.95;
    this.group.scale.setScalar(this.scale);
    level.scene.add(this.m);
    this.nodes = opts.nodes || [];
    this.edges = opts.edges || [];
    this.adj = this.nodes.map(() => []);
    for (const [a, b] of this.edges) { this.adj[a].push(b); this.adj[b].push(a); }
    this.pos = this.group.position;
    this.yaw = 0;
    this.state = 'idle';
    this.active = false;
    // Difficulty: easy / normal / hard
    const diff = { easy: { see: 0.7, speed: 0.85, aggro: 0.15, notice: 0.55 }, normal: { see: 1, speed: 1, aggro: 0.3, notice: 1 }, hard: { see: 1.3, speed: 1.12, aggro: 0.55, notice: 1.5 } }[level.game.settings.difficulty || 'normal'] || { see: 1, speed: 1, aggro: 0.3, notice: 1 };
    this.diff = diff;
    this.speeds = { patrol: 1.05 * diff.speed, investigate: 1.5 * diff.speed, chase: 2.85 * diff.speed, search: 1.3 * diff.speed };
    this.path = [];
    this.waitT = 0;
    this.seeT = 0;
    this.lostT = 0;
    this.lastSeen = { x: 0, y: 0, z: 0, copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; } };
    this.stepAcc = 0;
    this.curSpeed = 0;
    this.sawHide = null;
    this.checkQueue = [];
    this.checking = null;
    this.checkT = 0;
    this.catchCooldown = 0;
    this.aggro = diff.aggro; // chance to patrol toward the player
    this.onCatch = null;
    this.onSpot = null;
    this.visible = true;
    this.lightFlicker = opts.flickerLights || null;
    level.onNoise = (x, z, r) => this.hear(x, z, r);
    level.onHide = (h, entering) => {
      if (!this.active) return;
      if (entering && this.state === 'chase' && this.canSeePoint(h.exit.x, h.exit.z, 12)) this.sawHide = h;
    };
  }

  place(x, z, yaw = 0) { this.pos.set(x, 0, z); this.yaw = yaw; this.group.rotation.y = yaw; this.path = []; }

  start(state = 'patrol') {
    this.active = true; this.group.visible = true;
    this.state = state; this.waitT = 0.5; this.path = []; this.seeT = 0;
    this.grace = 2.5; // a moment before it can notice you (fair respawns)
  }

  stop() { this.active = false; this.state = 'idle'; this.path = []; this.game.audio.heart = 0; this.game.ui.danger(0); }

  hide() { this.group.visible = false; this.stop(); }

  // ------------------------------------------------------------ navigation
  nearestNode(x, z) {
    let best = -1, bd = 1e9;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const d = Math.hypot(n.x - x, n.z - z);
      const pen = this.level.los(x, z, n.x, n.z) ? 0 : 50;
      if (d + pen < bd) { bd = d + pen; best = i; }
    }
    return best;
  }

  route(x, z) {
    const s = this.nearestNode(this.pos.x, this.pos.z), t = this.nearestNode(x, z);
    if (s < 0 || t < 0) return [[x, z]];
    const dist = this.nodes.map(() => 1e9), prev = this.nodes.map(() => -1), done = this.nodes.map(() => false);
    dist[s] = 0;
    for (;;) {
      let u = -1, bd = 1e9;
      for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
      if (u < 0 || u === t) break;
      done[u] = true;
      for (const v of this.adj[u]) {
        const w = Math.hypot(this.nodes[u].x - this.nodes[v].x, this.nodes[u].z - this.nodes[v].z);
        if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
      }
    }
    const out = [];
    for (let v = t; v >= 0; v = prev[v]) { out.unshift([this.nodes[v].x, this.nodes[v].z]); if (v === s) break; }
    // skip the first node if we can already see the second
    if (out.length > 1 && this.level.los(this.pos.x, this.pos.z, out[1][0], out[1][1])) out.shift();
    out.push([x, z]);
    return out;
  }

  goTo(x, z) { this.path = this.route(x, z); }

  // ------------------------------------------------------------- senses
  canSeePoint(x, z, range) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > range) return false;
    const a = Math.atan2(dx, dz);
    if (Math.abs(angDiff(a, this.yaw)) > 0.85 && d > 1.4) return false;
    return this.level.los(this.pos.x, this.pos.z, x, z);
  }

  canSeePlayer() {
    const p = this.level.player;
    if (p.hidden) return false;
    let range = 6.5;
    if (p.flashOn) range = 10;
    if (p.crouching && !p.flashOn) range = 3.2;
    if (this.level.lightsOn) range += 2;
    range *= this.diff.see;
    return this.canSeePoint(p.pos.x, p.pos.z, range);
  }

  hear(x, z, r) {
    if (!this.active || this.state === 'chase' || this.state === 'scripted') return;
    const d = Math.hypot(x - this.pos.x, z - this.pos.z);
    if (d < r * 1.7) {
      this.state = 'investigate';
      this.goTo(x, z);
      this.waitT = 0;
    }
  }

  // Walk to a hiding spot and listen.
  checkHide(h) {
    this.state = 'search';
    this.checking = h;
    this.goTo(h.exit.x, h.exit.z);
    this.checkT = 0;
  }

  // -------------------------------------------------------------- update
  update(dt) {
    const g = this.game;
    const p = this.level.player;
    const dPlayer = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    if (!this.active) {
      poseGrinner(this.m, dt, 0, this.scale);
      return;
    }
    this.catchCooldown -= dt;
    // vision
    if (this.grace > 0) this.grace -= dt;
    if (this.state !== 'scripted' && !(this.grace > 0)) {
      if (this.canSeePlayer()) {
        this.seeT += dt * (dPlayer < 2.5 ? 2.2 : 0.9) * this.diff.notice;
        if (this.seeT > 0.8 && this.state !== 'chase') {
          this.state = 'chase';
          g.audio.stinger();
          if (this.onSpot) this.onSpot();
        }
        if (this.state === 'chase') { this.lastSeen.copy(p.pos); this.lostT = 0; }
      } else this.seeT = Math.max(0, this.seeT - dt * 0.8);
    }

    let speed = 0;
    let tx = null, tz = null;
    switch (this.state) {
      case 'patrol': {
        if (!this.path.length) {
          this.waitT -= dt;
          if (this.waitT <= 0) {
            let pick;
            if (Math.random() < this.aggro) {
              const near = this.nodes.map((n, i) => [i, Math.hypot(n.x - p.pos.x, n.z - p.pos.z)]).sort((a, b) => a[1] - b[1]).slice(0, 4);
              pick = near[Math.floor(Math.random() * near.length)][0];
            } else pick = Math.floor(Math.random() * this.nodes.length);
            const n = this.nodes[pick];
            this.goTo(n.x, n.z);
            this.waitT = 1 + Math.random() * 2.5;
            // sometimes check a hiding spot near the player
            if (p.hidden && Math.random() < 0.12 && Math.hypot(p.hidden.exit.x - this.pos.x, p.hidden.exit.z - this.pos.z) < 6) this.checkHide(p.hidden);
          }
        }
        speed = this.speeds.patrol;
        break;
      }
      case 'investigate':
        speed = this.speeds.investigate;
        if (!this.path.length) {
          this.waitT += dt;
          if (this.waitT > 2.5) {
            if (p.hidden && Math.hypot(p.hidden.exit.x - this.pos.x, p.hidden.exit.z - this.pos.z) < 4) this.checkHide(p.hidden);
            else { this.state = 'patrol'; this.waitT = 0.5; }
          }
        }
        break;
      case 'chase': {
        speed = this.speeds.chase;
        if (p.hidden) {
          if (this.sawHide === p.hidden) { this.checkHide(p.hidden); this.checking.seen = true; break; }
        }
        if (!p.hidden && dPlayer < 11 && this.level.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z) && (dPlayer < 4 || this.canSeePoint(p.pos.x, p.pos.z, 11))) {
          this.path = [];
          tx = p.pos.x; tz = p.pos.z;
          this.lastSeen.copy(p.pos);
        } else {
          this.lostT += dt;
          if (!this.path.length) this.goTo(this.lastSeen.x, this.lastSeen.z);
          if (this.lostT > 3.5) {
            this.state = 'patrol'; this.waitT = 2.5; this.path = [];
            g.audio.jingle(1);
            if (this.onLost) this.onLost();
            // only sometimes checks a nearby hiding spot, and never from across the house
            const near = this.level.hides.filter((h) => Math.hypot(h.exit.x - this.lastSeen.x, h.exit.z - this.lastSeen.z) < 3.5);
            if (near.length && Math.random() < 0.4) this.checkHide(near[Math.floor(Math.random() * near.length)]);
          }
        }
        break;
      }
      case 'search': {
        speed = this.speeds.search;
        if (!this.path.length && this.checking) {
          const h = this.checking;
          this.targetYaw = Math.atan2(h.inside.x - this.pos.x, h.inside.z - this.pos.z);
          this.checkT += dt;
          const inside = p.hidden === h;
          if (inside) {
            g.ui.hint(g.input.touch ? '<b>HOLD YOUR BREATH</b>' : 'Hold <b>SPACE</b> — <b>HOLD YOUR BREATH</b>', 0.3);
            if (h.seen || (!p.holding && this.checkT > 2.2 && this.checkT < 2.6)) { this.catchPlayer(); return; }
          }
          if (this.checkT > 3.2) {
            if (inside) g.achieve('hider');
            this.checking = null; this.state = 'patrol'; this.waitT = 1;
          }
        }
        break;
      }
      case 'scripted':
        speed = this.path.length ? this.speeds.investigate : 0;
        break;
    }

    // movement
    let moved = 0;
    if (tx === null && this.path.length) { [tx, tz] = this.path[0]; }
    if (tx !== null) {
      const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.2) { if (this.path.length) this.path.shift(); }
      else {
        const s = Math.min(d, speed * dt);
        this.pos.x += dx / d * s; this.pos.z += dz / d * s;
        moved = s / dt;
        this.targetYaw = Math.atan2(dx, dz);
      }
      // open doors on the way
      for (const door of this.level.doors) {
        if (!door.open && !door.noMonster && Math.hypot(door.x - this.pos.x, door.z - this.pos.z) < 1.2) {
          door.setOpen(true); g.audio.slam();
        }
      }
    }
    if (this.targetYaw !== undefined) {
      const dy = angDiff(this.targetYaw, this.yaw);
      this.yaw += dy * Math.min(1, dt * (this.state === 'chase' ? 8 : 4));
      this.group.rotation.y = this.yaw;
    }
    this.curSpeed = moved;
    poseGrinner(this.m, dt, moved, this.scale);
    // footsteps
    if (moved > 0.1) {
      this.stepAcc += moved * dt;
      if (this.stepAcc > 0.9) { this.stepAcc = 0; g.audio.monsterStep(dPlayer); }
    }
    // dread feedback
    const near = Math.max(0, 1 - dPlayer / 11);
    g.audio.heart = this.state === 'chase' ? Math.max(0.8, near) : near * 0.8;
    g.ui.danger(this.state === 'chase' ? 0.55 + near * 0.4 : near * 0.45);
    g.retro.u.uGlitch.value = Math.max(g.retro.u.uGlitch.value * 0.9, near > 0.7 ? (near - 0.7) * 0.5 : 0);
    // catch
    if (!p.hidden && dPlayer < 0.8 && this.catchCooldown <= 0 && this.group.visible) this.catchPlayer();
  }

  catchPlayer() {
    if (this.catchCooldown > 0) return;
    this.catchCooldown = 5;
    this.active = false;
    if (this.onCatch) this.onCatch();
  }
}
