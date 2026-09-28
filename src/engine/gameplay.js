// Gameplay systems on the ECS: pickups lying in the world, an inventory with slots, and
// interaction prompts ("E  Pick up Axe", "E  Open door") for whatever the player faces.
//
// Components used here:
//   node         { node }                      the scene node for the entity
//   pickup       { item, name, base, phase }   a Prop lying in the world, waiting to be taken
//   interactable { prompt, radius, use }       prompt: string or (world, actor) => string
//   actor        { character, yaw }            someone who can pick things up and interact
//   inventory    { items, active, capacity }   what they carry; `active` is the item in hand
import { vec3 } from './math.js';

// Put a prop in the world as a pickup: it lies on the ground (or floats and turns slowly
// if `hover`), and interacting takes it into the actor's inventory.
export function spawnPickup(world, scene, item, position, { name = item.name, hover = true, yaw = 0 } = {}) {
  item.position.set(position); item.setEuler(0, yaw, hover ? 0 : 90);
  scene.add(item);
  const e = world.create({
    node: { node: item },
    pickup: { item, name, base: [...position], phase: Math.random() * 6.28, hover },
    interactable: {
      radius: 1.6,
      prompt: () => 'Pick up ' + name,
      use: (w, actor) => give(w, actor, e),
    },
  });
  return e;
}

// Move a pickup into an actor's inventory (and into their hand if nothing is there yet).
export function give(world, actor, pickupEntity) {
  const inv = world.get(actor, 'inventory'), p = world.get(pickupEntity, 'pickup');
  if (!inv || !p) return false;
  if (inv.items.length >= inv.capacity) { world.emit('inventoryFull', { actor }); return false; }
  if (p.item.parent) p.item.parent.remove(p.item);
  p.item.setEuler(0, 0, 0);
  inv.items.push({ item: p.item, name: p.name });
  world.destroy(pickupEntity);
  world.emit('pickup', { actor, item: p.item, name: p.name });
  if (inv.active < 0) select(world, actor, inv.items.length - 1);
  return true;
}

// Hold item `index` (or nothing with -1): equips it on the actor's character.
export function select(world, actor, index) {
  const inv = world.get(actor, 'inventory'), a = world.get(actor, 'actor');
  if (!inv || !a) return null;
  if (index >= inv.items.length) return null;
  if (inv.active === index) index = -1; // selecting the held item puts it away
  if (a.character.equipped('R')) a.character.unequip('R');
  inv.active = index;
  const slot = inv.items[index];
  if (slot) { a.handler = a.character.equip(slot.item, a.holdFor ? a.holdFor(slot.item) : {}); world.emit('equip', { actor, item: slot.item, name: slot.name }); }
  else { a.handler = null; world.emit('equip', { actor, item: null }); }
  return slot ? slot.item : null;
}
export function cycle(world, actor, dir = 1) {
  const inv = world.get(actor, 'inventory');
  if (!inv || !inv.items.length) return null;
  const n = inv.items.length, i = inv.active < 0 ? (dir > 0 ? 0 : n - 1) : (inv.active + dir + n) % n;
  return select(world, actor, i);
}
// Drop the held item in front of the actor.
export function drop(world, actor, scene) {
  const inv = world.get(actor, 'inventory'), a = world.get(actor, 'actor');
  if (!inv || inv.active < 0) return null;
  const slot = inv.items[inv.active];
  a.character.unequip('R'); a.handler = null;
  inv.items.splice(inv.active, 1); inv.active = -1;
  const c = a.character.position, yaw = a.yaw ?? 0;
  const p = [c[0] + Math.sin(yaw) * 0.9, 0.12, c[2] + Math.cos(yaw) * 0.9];
  world.emit('drop', { actor, item: slot.item });
  return spawnPickup(world, scene, slot.item, p, { name: slot.name, hover: true, yaw: (yaw * 180) / Math.PI });
}

// Interaction: each frame, find the nearest interactable the actor is facing.
// world.focus = { entity, prompt } or null; call interact() when the player presses E.
export function interactionSystem({ actor, maxAngle = 75 } = {}) {
  return {
    name: 'interaction',
    update(world) {
      const a = world.get(actor, 'actor');
      if (!a) return;
      const p = a.character.position, fwd = [Math.sin(a.yaw ?? 0), 0, Math.cos(a.yaw ?? 0)];
      let best = null, bestScore = Infinity;
      for (const [e, it, n] of world.query('interactable', 'node')) {
        const pos = it.at || n.node.worldPosition();
        const d = [pos[0] - p[0], 0, pos[2] - p[2]], dist = Math.hypot(d[0], d[2]);
        if (dist > (it.radius ?? 1.5)) continue;
        const cos = dist > 0.2 ? (d[0] * fwd[0] + d[2] * fwd[2]) / dist : 1;
        if (cos < Math.cos((maxAngle * Math.PI) / 180)) continue;
        const score = dist * (2 - cos);
        if (score < bestScore) { bestScore = score; best = e; }
      }
      if (best) { const it = world.get(best, 'interactable'); world.focus = { entity: best, prompt: typeof it.prompt === 'function' ? it.prompt(world, actor) : it.prompt }; }
      else world.focus = null;
    },
  };
}
export function interact(world, actor) {
  const f = world.focus; if (!f) return false;
  const it = world.get(f.entity, 'interactable'); if (!it) return false;
  it.use(world, actor, f.entity);
  world.emit('interact', { actor, entity: f.entity });
  return true;
}

// Pickups bob and turn so they read as "take me".
export function pickupSystem() {
  return {
    name: 'pickups',
    update(world, dt) {
      for (const [, p] of world.query('pickup')) {
        if (!p.hover) continue;
        p.phase += dt;
        p.item.position.set([p.base[0], p.base[1] + 0.35 + Math.sin(p.phase * 2) * 0.05, p.base[2]]);
        p.item.setEuler(0, p.phase * 40, 0);
        if (p.item.update) p.item.update(dt);
      }
    },
  };
}

// Doors, shutters and gates of a structure (Kit.toNode with openable) become interactables.
export function addOpenings(world, structure, { radius = 1.8 } = {}) {
  const list = structure.userData.openings || [];
  const out = [];
  for (const o of list) {
    if (o.kind === 'shutter') continue;
    const e = world.create({
      node: { node: o.node },
      interactable: {
        radius,
        get at() { return openingCenter(o); },
        prompt: () => (o.swing ? 'Push the doors' : o.isOpen ? 'Close ' + label(o.kind) : 'Open ' + label(o.kind)),
        use: () => o.toggle(),
      },
      opening: { opening: o, structure },
    });
    out.push(e);
  }
  return out;
}
const label = (k) => ({ door: 'door', cell: 'cell door', batwing: 'doors' }[k] || k);
// Where an opening's middle is in world space (for prompts and distance checks)
// (measured on the closed leaf, so the prompt doesn't swing away with an open door)
export function openingCenter(o) {
  const n = o.node, p = n.parent; if (p) p.updateWorld(p.parent ? p.parent.world : null);
  const c = o.center || [0.45, 1, 0], base = p ? p.world : null;
  const local = [n.position[0], n.position[1], n.position[2]], q = o.part.baseRot;
  const off = vec3.transformQuat([0, 0, 0], c, q);
  const pt = [local[0] + off[0], local[1] + off[1], local[2] + off[2]];
  return base ? vec3.transformMat4([0, 0, 0], pt, base) : pt;
}
