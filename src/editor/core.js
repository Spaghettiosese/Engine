// Studio document model: objects, selection, modes, history (snapshot undo), animation state.
import * as E from '../engine/index.js';
import { cowboyDefinition, COWBOY_SKELETON } from '../content/cowboy.js';

let OBJ_ID = 1;
export const newId = () => OBJ_ID++;

export const PRESETS = {
  'Vase (Lathe)': () => ({ shape: { type: 'lathe', ...E.shapeDefaults('lathe') }, modifiers: [], material: { color: '#3f7fbf', roughness: 0.2, pattern: 'none' } }),
  'Spring (Tube + Twist)': () => ({ shape: { type: 'tube', ...E.shapeDefaults('tube'), path: Array.from({ length: 25 }, (_, i) => [Math.cos(i * 0.8) * 0.4, i * 0.05, Math.sin(i * 0.8) * 0.4]), radii: [0.05], samples: 4 }, modifiers: [], material: { color: '#c0c4c8', metallic: 1, roughness: 0.25, pattern: 'metal' } }),
  'Gear (Extrude)': () => ({ shape: { type: 'extrude', ...E.shapeDefaults('extrude'), shape: 'gear', teeth: 16, depth: 0.15 }, modifiers: [], material: { color: '#b08d57', metallic: 1, roughness: 0.3, pattern: 'metal' } }),
  'Sheriff Star': () => ({ shape: { type: 'extrude', ...E.shapeDefaults('extrude'), shape: 'star', points: 6, inner: 0.5, depth: 0.08, bevel: 0.02 }, modifiers: [], material: { color: '#d8ab45', metallic: 1, roughness: 0.25, pattern: 'metal' } }),
  'Twisted Column': () => ({ shape: { type: 'box', width: 0.4, height: 2, depth: 0.4, bevel: 0.05, bevelSegments: 2, segments: 24 }, modifiers: [{ ...E.modifierDefaults('twist'), angle: 180 }, { ...E.modifierDefaults('taper'), amount: -0.25 }], material: { color: '#d9d2c3', roughness: 0.6, pattern: 'wood', patternScale: 2, patternColor: '#b8ad98' } }),
  'Boulder (Displace)': () => ({ shape: { type: 'sphere', radius: 0.6, widthSegments: 48, heightSegments: 32, phiStart: 0, phiLength: 360, thetaStart: 0, thetaLength: 180 }, modifiers: [{ ...E.modifierDefaults('displace'), amount: 0.25, scale: 2.2, octaves: 4 }, { ...E.modifierDefaults('squash'), min: -0.2 }], material: { color: '#9c7358', roughness: 0.85, pattern: 'leather', patternScale: 40, patternColor: '#6d4c38' } }),
  'Saguaro Arm (Bend)': () => ({ shape: { type: 'capsule', radius: 0.15, length: 1.2, radialSegments: 20, capSegments: 8 }, modifiers: [{ ...E.modifierDefaults('bend'), angle: 80 }], material: { color: '#4f7a45', roughness: 0.6, pattern: 'stripes', patternScale: 14, patternColor: '#3c5f35' } }),
  'Star Blob (Superquadric)': () => ({ shape: { type: 'superquadric', ...E.shapeDefaults('superquadric'), e1: 2.5, e2: 2.5 }, modifiers: [], material: { color: '#e05a5a', roughness: 0.35 } }),
  'Wavy Flag (Plane)': () => ({ shape: { type: 'plane', width: 1.6, depth: 1, subdivisions: 40 }, modifiers: [{ ...E.modifierDefaults('wave'), axis: 'y', along: 'x', amplitude: 0.06, frequency: 1.5 }], material: { color: '#b22222', roughness: 0.8, pattern: 'stripes', patternScale: 7, patternColor: '#f0f0f0', doubleSided: true } }),
};

export class Editor {
  constructor() {
    this.scene = new E.Scene();
    this.scene.environment.fogDensity = 0.004;
    this.ground = new E.Mesh(E.buildShape({ type: 'plane', width: 200, depth: 200, subdivisions: 1 }), new E.Material({ name: 'Ground', color: '#c9a077', roughness: 0.95, pattern: 'dirt', patternScale: 1, patternColor: '#a57a52' }), 'Ground');
    this.ground.castShadow = false; this.ground.pickable = false; this.ground.visible = false;
    this.scene.add(this.ground);
    this.objects = []; // top level: mesh + armature objects
    this.selection = new Set();
    this.active = null;
    this.mode = 'object';
    this.selectedBones = new Set();
    this.activeBone = -1;
    this.frame = 0; this.fps = 30; this.playing = false; this.autoKey = false; this.onion = false;
    this.poseDirty = false;
    this.shading = 'solid'; this.xray = false;
    this.overlays = { grid: true, bones: true, wire: false, stats: true, outline: true };
    this.tool = 'select';
    this.world = { sunElevation: 42, sunAzimuth: 37, sunIntensity: 3.2, exposure: 1, fog: 0.004, bloom: true, sky: true, ground: true };
    this.listeners = new Map();
    this.undoStack = []; this.redoStack = [];
    this.uiState = {};
  }
  on(evt, fn) { if (!this.listeners.has(evt)) this.listeners.set(evt, []); this.listeners.get(evt).push(fn); }
  emit(evt, data) { for (const fn of this.listeners.get(evt) || []) fn(data); }
  changed(what = 'scene') { this.emit('change', what); }

  // ---------------------------------------------------------------- objects
  addMesh(def, { select = true } = {}) {
    const d = { name: def.name || E.SHAPES[def.shape.type]?.label || 'Mesh', shape: def.shape, modifiers: def.modifiers || [], material: def.material || { color: '#bdbdbd', roughness: 0.5 }, position: def.position || [0, 0, 0], rotation: def.rotation || [0, 0, 0], scale: def.scale || [1, 1, 1], hidden: !!def.hidden, castShadow: def.castShadow !== false };
    const mat = d.material instanceof E.Material ? d.material : new E.Material({ name: d.name, ...d.material });
    const node = new E.Mesh(E.buildShape(d.shape, d.modifiers), mat, d.name);
    const obj = { id: newId(), kind: 'mesh', def: d, node, material: mat };
    node.userData.obj = obj;
    this.scene.add(node);
    this.objects.push(obj);
    this.applyTransform(obj);
    if (select) this.select(obj);
    return obj;
  }
  addArmature(charDef, { select = true, transform = null, action = null } = {}) {
    const character = new E.Character(charDef);
    character.autoAnimate = false;
    const obj = { id: newId(), kind: 'armature', character, node: character, transform: transform || { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, parts: [], action: null, expanded: true, hidden: false };
    obj.name = character.name;
    for (const p of character.parts) obj.parts.push(this._partObj(obj, p));
    obj.action = action && character.mixer.clips.has(action) ? action : [...character.mixer.clips.keys()][0] || null;
    this.scene.add(character);
    this.objects.push(obj);
    this.applyTransform(obj);
    if (select) this.select(obj);
    this.evaluate(true);
    return obj;
  }
  _partObj(arm, part) { const o = { id: newId(), kind: 'part', part, armature: arm }; for (const m of part.meshes) m.userData.obj = o; return o; }
  addPart(arm, pdef) {
    const part = arm.character.addPart(pdef);
    const o = this._partObj(arm, part);
    arm.parts.push(o);
    return o;
  }
  objName(o) { return o.kind === 'mesh' ? o.def.name : o.kind === 'armature' ? o.character.name : o.part.def.name; }
  setName(o, n) { if (o.kind === 'mesh') { o.def.name = n; o.node.name = n; } else if (o.kind === 'armature') { o.character.name = n; o.character.def.name = n; } else { o.part.def.name = n; o.part.meshes.forEach((m, i) => (m.name = n + (i ? ' (mirror)' : ''))); } }
  xf(o) { return o.kind === 'mesh' ? o.def : o.kind === 'armature' ? o.transform : o.part.def; }
  applyTransform(o) {
    const t = this.xf(o);
    if (o.kind === 'part') { o.armature.character.updatePartTransform(o.part); return; }
    o.node.position.set(t.position); o.node.setEuler(...t.rotation); o.node.scale.set(t.scale);
    o.node.updateWorld(null);
  }
  rebuildGeometry(o) {
    if (o.kind === 'mesh') { o.node.geometry = E.buildShape(o.def.shape, o.def.modifiers); }
    else if (o.kind === 'part') { o.armature.character.buildPart(o.part); for (const m of o.part.meshes) m.userData.obj = o; }
  }
  materialOf(o) { return o.kind === 'mesh' ? o.material : o.kind === 'part' ? o.part.meshes[0].material : null; }
  meshesOf(o) { return o.kind === 'mesh' ? [o.node] : o.kind === 'part' ? o.part.meshes : o.kind === 'armature' ? o.parts.flatMap((p) => p.part.meshes) : []; }
  isHidden(o) { return o.kind === 'mesh' ? o.def.hidden : o.kind === 'armature' ? o.hidden : !!o.part.def.hidden; }
  setHidden(o, v) {
    if (o.kind === 'mesh') { o.def.hidden = v; o.node.visible = !v; }
    else if (o.kind === 'armature') { o.hidden = v; o.character.visible = !v; }
    else { o.part.def.hidden = v; o.part.meshes.forEach((m) => (m.visible = !v)); }
  }
  allObjects() { return this.objects.flatMap((o) => (o.kind === 'armature' ? [o, ...o.parts] : [o])); }
  armatureOf(o) { return !o ? null : o.kind === 'armature' ? o : o.kind === 'part' ? o.armature : null; }

  remove(o) {
    if (o.kind === 'part') {
      o.armature.character.removePart(o.part);
      o.armature.parts.splice(o.armature.parts.indexOf(o), 1);
    } else {
      this.scene.remove(o.node);
      this.objects.splice(this.objects.indexOf(o), 1);
    }
    this.selection.delete(o);
    if (this.active === o) this.active = null;
  }
  duplicate(o) {
    const clone = (x) => JSON.parse(JSON.stringify(x));
    if (o.kind === 'mesh') { const d = clone({ ...o.def, material: o.material.toJSON() }); d.name = nextName(d.name, this.allObjects().map((x) => this.objName(x))); return this.addMesh(d, { select: false }); }
    if (o.kind === 'part') { const d = clone(o.part.def); d.name = nextName(d.name, o.armature.parts.map((p) => p.part.def.name)); return this.addPart(o.armature, d); }
    if (o.kind === 'armature') { const d = clone(o.character.toJSON()); d.name = nextName(d.name, this.objects.map((x) => this.objName(x))); const t = clone(o.transform); return this.addArmature(d, { select: false, transform: t, action: o.action }); }
  }

  // ---------------------------------------------------------------- selection
  select(o, { extend = false, toggle = false } = {}) {
    if (!extend) this.selection.clear();
    if (o) {
      if (toggle && this.selection.has(o) && this.active === o) { this.selection.delete(o); this.active = [...this.selection].pop() || null; }
      else { this.selection.add(o); this.active = o; }
    } else if (!extend) this.active = null;
    if (this.mode === 'pose' && this.armatureOf(this.active) !== this.poseArmature) this.setMode('object');
    this.emit('selection');
  }
  selectAll(on = true) {
    this.selection.clear();
    if (on) for (const o of this.allObjects()) if (!this.isHidden(o)) this.selection.add(o);
    if (!on) this.active = null; else if (!this.active) this.active = [...this.selection][0] || null;
    this.emit('selection');
  }

  // ---------------------------------------------------------------- modes
  get poseArmature() { return this.mode === 'pose' ? this._poseArm : null; }
  setMode(m) {
    if (m === 'pose') {
      const arm = this.armatureOf(this.active);
      if (!arm) return false;
      this._poseArm = arm; this.mode = 'pose'; this.selection.clear(); this.selection.add(arm); this.active = arm;
    } else { this.mode = 'object'; this._poseArm = null; this.selectedBones.clear(); this.activeBone = -1; }
    this.emit('mode'); this.emit('selection');
    return true;
  }
  selectBone(i, extend = false) {
    if (!extend) this.selectedBones.clear();
    if (i >= 0) { if (extend && this.selectedBones.has(i) && this.activeBone === i) { this.selectedBones.delete(i); } else { this.selectedBones.add(i); this.activeBone = i; } }
    else this.activeBone = -1;
    this.emit('selection');
  }

  // ---------------------------------------------------------------- animation
  clipOf(arm) { return arm && arm.action ? arm.character.mixer.clips.get(arm.action) : null; }
  get activeArmature() { return this.armatureOf(this.active) || this.objects.find((o) => o.kind === 'armature') || null; }
  get endFrame() { const c = this.clipOf(this.activeArmature); return c ? Math.max(1, Math.round(c.duration * this.fps)) : 120; }
  setFrame(f) {
    const end = this.endFrame;
    const nf = this.playing ? ((f % end) + end) % end : Math.max(0, Math.min(end, Math.round(f)));
    if (Math.round(nf) !== Math.round(this.frame)) this.poseDirty = false;
    this.frame = nf;
    this.evaluate(true);
    this.emit('frame');
  }
  // Pose every armature at the current frame (unless the user has unkeyed edits)
  evaluate(force = false, dt = 0) {
    for (const o of this.objects) {
      if (o.kind !== 'armature') continue;
      const ch = o.character, sk = ch.skeleton, clip = this.clipOf(o);
      if (this.poseDirty && o === this.poseArmature && !force) continue;
      if (this.poseDirty && o === this.poseArmature) continue;
      if (clip) { E.sampleClip(clip, sk, this.frame / this.fps, ch.mixer.pose); sk.copyPose(ch.mixer.pose); } else sk.resetPose();
      sk.update();
      ch.updateWorld(null);
      if (this.playing && dt > 0) sk.simulateSprings(dt, ch.world); else sk.resetSprings();
    }
  }
  insertKeys(arm, bones = null) {
    const clip = this.clipOf(arm);
    if (!clip) return 0;
    const sk = arm.character.skeleton, t = this.frame / this.fps, e = [0, 0, 0];
    const list = bones && bones.size ? [...bones] : sk.bones.map((b, i) => i).filter((i) => clip.track(sk.bones[i].name, 'rotation'));
    let n = 0;
    for (const i of list) {
      const b = sk.bones[i];
      if (b.spring) continue;
      E.quat.toEuler(e, sk.rot.subarray(i * 4, i * 4 + 4));
      clip.setKey(b.name, 'rotation', t, e.map((x) => Math.round(x * 1e4) / 1e4)); n++;
      const p = sk.pos.subarray(i * 3, i * 3 + 3);
      if (b.name === 'hips' || b.name === 'root' || p.some((x) => Math.abs(x) > 1e-5)) clip.setKey(b.name, 'position', t, Array.from(p));
    }
    if (t > clip.duration) clip.duration = t;
    this.poseDirty = false;
    return n;
  }

  // ---------------------------------------------------------------- world
  applyWorld() {
    const w = this.world, env = this.scene.environment;
    const el = (w.sunElevation * Math.PI) / 180, az = (w.sunAzimuth * Math.PI) / 180;
    E.vec3.normalize(env.sunDirection, [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)]);
    const warm = 1 - Math.min(1, w.sunElevation / 50);
    env.sunColor = [1.0, 0.9 - warm * 0.25, 0.78 - warm * 0.4];
    env.sunIntensity = w.sunIntensity; env.exposure = w.exposure; env.fogDensity = w.fog; env.clouds = true;
  }

  // ---------------------------------------------------------------- serialization / history
  serialize() {
    return {
      format: 'shapeforge-scene', version: 1,
      world: this.world, frame: this.frame,
      objects: this.objects.map((o) => o.kind === 'mesh'
        ? { kind: 'mesh', ...JSON.parse(JSON.stringify(o.def)), material: o.material.toJSON() }
        : { kind: 'armature', transform: o.transform, action: o.action, hidden: o.hidden, character: o.character.toJSON() }),
      selection: [...this.selection].filter((o) => o.kind !== 'part').map((o) => this.objects.indexOf(o)),
      active: this.objects.indexOf(this.active),
    };
  }
  load(doc, { keepHistory = false } = {}) {
    if (this.mode === 'pose') this.setMode('object');
    // reuse unchanged objects (fast undo for simple edits)
    const old = this.objects.map((o) => ({ o, key: JSON.stringify(o.kind === 'mesh' ? { kind: 'mesh', ...o.def, material: o.material.toJSON() } : { kind: 'armature', transform: o.transform, action: o.action, hidden: o.hidden, character: o.character.toJSON() }) }));
    for (const o of this.objects) this.scene.remove(o.node);
    this.objects = []; this.selection.clear(); this.active = null;
    for (const d of doc.objects || []) {
      const key = JSON.stringify(d);
      const reuse = old.findIndex((x) => x.key === key);
      if (reuse >= 0) { const o = old.splice(reuse, 1)[0].o; this.scene.add(o.node); this.objects.push(o); continue; }
      if (d.kind === 'mesh') { const { kind, ...rest } = d; void kind; this.addMesh(rest, { select: false }); }
      else if (d.kind === 'armature') { const o = this.addArmature(d.character, { select: false, transform: d.transform, action: d.action }); if (d.hidden) this.setHidden(o, true); }
    }
    if (doc.world) { Object.assign(this.world, doc.world); this.applyWorld(); }
    (doc.selection || []).forEach((i) => this.objects[i] && this.selection.add(this.objects[i]));
    this.active = this.objects[doc.active] || [...this.selection][0] || null;
    if (typeof doc.frame === 'number') this.frame = doc.frame;
    if (!keepHistory) { this.undoStack = []; this.redoStack = []; this._last = JSON.stringify(this.serialize()); }
    this.poseDirty = false;
    this.evaluate(true);
    this.emit('selection'); this.changed('load');
  }
  // Call after every committed operation
  commit(label = 'Edit') {
    const snap = JSON.stringify(this.serialize());
    if (snap === this._last) return;
    this.undoStack.push({ label, snap: this._last });
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.redoStack = [];
    this._last = snap;
    this.changed(label);
    this.autosave();
  }
  undo() { const s = this.undoStack.pop(); if (!s) return null; this.redoStack.push({ label: s.label, snap: this._last }); this._last = s.snap; this.load(JSON.parse(s.snap), { keepHistory: true }); return s.label; }
  redo() { const s = this.redoStack.pop(); if (!s) return null; this.undoStack.push({ label: s.label, snap: this._last }); this._last = s.snap; this.load(JSON.parse(s.snap), { keepHistory: true }); return s.label; }
  autosave() {
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => { try { localStorage.setItem('shapeforge.studio.autosave', this._last); } catch { /* storage unavailable */ } }, 400);
  }

  // ---------------------------------------------------------------- defaults
  newScene(kind = 'cowboy') {
    this.load({ objects: [] });
    if (kind === 'cube') this.addMesh({ name: 'Cube', shape: { type: 'box', width: 2, height: 2, depth: 2, bevel: 0, bevelSegments: 3 }, position: [0, 1, 0] });
    if (kind === 'cowboy') this.addArmature(cowboyDefinition());
    this.frame = 0;
    this._last = JSON.stringify(this.serialize()); this.undoStack = []; this.redoStack = [];
    this.changed('new');
  }
  humanoidRig() { return { name: 'Humanoid', skeleton: COWBOY_SKELETON, materials: {}, parts: [], clips: [] }; }
}

export function nextName(base, existing) {
  const stem = base.replace(/\.\d{3}$/, '');
  for (let i = 1; i < 1000; i++) { const n = `${stem}.${String(i).padStart(3, '0')}`; if (!existing.includes(n)) return n; }
  return stem + '.copy';
}
