// Async scripting: story code awaits conditions that the game loop resolves.
// reset() cancels every pending wait so a chapter can be torn down safely.
export class Cancelled extends Error {
  constructor() { super('cancelled'); this.cancelled = true; }
}

export class Director {
  constructor(game) {
    this.game = game;
    this.waiters = [];
    this.token = 0;
  }

  reset() {
    this.token++;
    const ws = this.waiters;
    this.waiters = [];
    for (const w of ws) w.rej(new Cancelled());
  }

  until(pred) {
    const tok = this.token;
    const p = new Promise((res, rej) => {
      let ok = false;
      try { ok = pred(); } catch (e) { rej(e); return; }
      if (ok) { res(); return; }
      this.waiters.push({ pred, res, rej, tok });
    });
    // Fire-and-forget waits (an NPC walking off) shouldn't report a
    // cancellation as unhandled; anyone awaiting still receives it.
    p.catch((e) => { if (!e || !e.cancelled) console.error(e); });
    return p;
  }

  wait(sec) {
    const end = this.game.time + sec;
    return this.until(() => this.game.time >= end);
  }

  // Resolve with whichever id's predicate is true first.
  race(map) {
    let hit = null;
    return this.until(() => {
      for (const k in map) if (map[k]()) { hit = k; return true; }
      return false;
    }).then(() => hit);
  }

  update() {
    if (!this.waiters.length) return;
    const list = this.waiters.slice();
    for (const w of list) {
      let ok = false;
      try { ok = w.pred(); } catch (e) { this.remove(w); w.rej(e); continue; }
      if (ok) { this.remove(w); w.res(); }
    }
  }

  remove(w) {
    const i = this.waiters.indexOf(w);
    if (i >= 0) this.waiters.splice(i, 1);
  }

  // Throw Cancelled if this script's session ended (use in long loops).
  check(tok) { if (tok !== this.token) throw new Cancelled(); }
}
