// A small entity-component system. Entities are numbers; components are plain objects
// stored per component name; systems are functions (or objects with update) run in order.
// It sits beside the scene graph rather than replacing it: an entity usually points at a
// Node ('node' component) and gameplay state lives in its other components.
//
//   const world = new World();
//   const e = world.create({ node: { node: crate }, pickup: { item } });
//   world.system((w, dt) => { for (const [id, p, n] of w.query('pickup', 'node')) ... });
//   world.update(dt);
export class World {
  constructor() { this.nextId = 1; this.stores = new Map(); this.systems = []; this.alive = new Set(); this.listeners = new Map(); this.time = 0; }
  create(components = {}) {
    const e = this.nextId++;
    this.alive.add(e);
    for (const [name, data] of Object.entries(components)) this.add(e, name, data);
    this.emit('create', { entity: e });
    return e;
  }
  destroy(e) {
    if (!this.alive.has(e)) return;
    this.emit('destroy', { entity: e });
    for (const s of this.stores.values()) s.delete(e);
    this.alive.delete(e);
  }
  add(e, name, data = {}) {
    let s = this.stores.get(name);
    if (!s) this.stores.set(name, (s = new Map()));
    s.set(e, data);
    return data;
  }
  get(e, name) { return this.stores.get(name)?.get(e); }
  has(e, name) { return !!this.stores.get(name)?.has(e); }
  remove(e, name) { this.stores.get(name)?.delete(e); }
  count(name) { return this.stores.get(name)?.size || 0; }
  // iterate entities that have every named component: yields [entity, compA, compB, ...]
  *query(...names) {
    const stores = names.map((n) => this.stores.get(n));
    if (stores.some((s) => !s)) return;
    const [first, ...rest] = stores.slice().sort((a, b) => a.size - b.size);
    for (const e of [...first.keys()]) {
      if (rest.some((s) => !s.has(e))) continue;
      yield [e, ...stores.map((s) => s.get(e))];
    }
  }
  first(...names) { for (const r of this.query(...names)) return r; return null; }
  system(fn, name = fn.name || 'system') { const s = typeof fn === 'function' ? { name, update: fn } : fn; this.systems.push(s); return s; }
  update(dt) { this.time += dt; for (const s of this.systems) if (s.enabled !== false) s.update(this, dt); }
  on(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); return () => this.listeners.get(type).delete(fn); }
  emit(type, data) { const l = this.listeners.get(type); if (l) for (const fn of l) fn(data); }
}
