// ShapeForge Studio bootstrap: commands, menus, keyboard map, layout and the frame loop.
import * as E from '../engine/index.js';
import { Editor, PRESETS, nextName } from './core.js';
import { Viewport } from './viewport.js';
import { Timeline } from './timeline.js';
import { renderOutliner, renderProperties } from './panels.js';
import { h, showMenu, closeMenus, dialog, toast } from './widgets.js';
import { cowboyDefinition } from '../content/cowboy.js';
import { grinnerDefinition } from '../content/monster.js';

const $ = (id) => document.getElementById(id);
const ed = new Editor();
let vp;
try { vp = new Viewport(ed, $('canvas'), $('overlay2d')); }
catch (err) { document.body.innerHTML = `<div style="padding:40px;font:16px sans-serif;color:#ddd">ShapeForge Studio needs WebGL2. ${err.message}</div>`; throw err; }
const tl = new Timeline(ed, $('tlHeader'), $('tlChannels'), $('tlCanvas'));
const propState = { tab: 'object', preferred: 'object' };

// ---------------------------------------------------------------- commands
const selArm = () => ed.armatureOf(ed.active);
const text = (title, body, value, extra = []) => {
  const ta = h('textarea', { readonly: true, 'aria-label': title }, value);
  dialog(title, [h('p', {}, body), ta], [...extra, { label: 'Copy', primary: true, run: () => { ta.select(); navigator.clipboard?.writeText(value).then(() => toast('Copied to clipboard'), () => { document.execCommand?.('copy'); toast('Selected — press Ctrl C to copy'); }); return false; } }, { label: 'Close' }]);
};
function saveFile(name, data, type, fallbackText = null) {
  const ok = E.download(name, data, type);
  if (!ok && fallbackText) text('Save ' + name, 'Downloads are blocked in this frame. Copy the contents instead:', fallbackText);
  else if (ok) toast('Saved ' + name);
}
function addObjectAtCursor(defFn) {
  const d = defFn();
  const o = ed.addMesh({ ...d, name: nextName(d.name || E.SHAPES[d.shape.type].label.split(' ')[0], ed.allObjects().map((x) => ed.objName(x))).replace(/\.001$/, ed.allObjects().some((x) => ed.objName(x) === (d.name || E.SHAPES[d.shape.type].label.split(' ')[0])) ? '.001' : ''), position: d.position || [0, liftFor(d.shape), 0] });
  if (ed.mode === 'pose') ed.setMode('object');
  ed.select(o); ed.commit('Add ' + ed.objName(o));
}
function liftFor(shape) { try { const b = E.buildShape(shape, []).bounds(); return Math.max(0, -b.min[1]); } catch { return 0; } }
function addPart(type) {
  const arm = selArm(); if (!arm) return toast('Select an armature (or one of its parts) first');
  const sk = arm.character.skeleton;
  const bi = ed.mode === 'pose' && ed.activeBone >= 0 ? ed.activeBone : sk.boneIndex('hips') >= 0 ? sk.boneIndex('hips') : 0;
  const b = sk.bones[bi];
  const shape = { type, ...E.shapeDefaults(type) };
  // make new parts part-sized
  for (const k of ['radius', 'width', 'height', 'depth', 'rx', 'ry', 'rz', 'radiusTop', 'radiusBottom', 'length', 'tube']) if (typeof shape[k] === 'number') shape[k] *= 0.15;
  const mid = [(b.head[0] + b.tail[0]) / 2, (b.head[1] + b.tail[1]) / 2, (b.head[2] + b.tail[2]) / 2];
  const name = nextName(E.SHAPES[type].label.split(' ')[0], arm.parts.map((p) => p.part.def.name)).replace('.001', '');
  const matName = arm.character.materials.keys().next().value || 'Material';
  const o = ed.addPart(arm, { name, shape, modifiers: [], material: matName, bind: { bone: b.name }, position: mid, rotation: [0, 0, 0], scale: [1, 1, 1] });
  if (ed.mode === 'pose') ed.setMode('object');
  ed.select(o); ed.commit('Add Part');
}
const synthFor = (kind, S, sk, name) => {
  if (kind === 'crawl') return E.synthesizeCrawl(sk, { name });
  if (kind === 'idle') return E.synthesizeIdle(sk, { name });
  return E.synthesizeLocomotion(sk, { name, speed: S.speed, duration: S.duration, stance: S.stance, hipHeight: S.hipHeight, lean: S.lean, armSwing: S.armSwing, bob: S.bob, stepWidth: S.stepWidth, center: -0.015, samples: 24 });
};

const C = {
  'file.new': { label: 'New › Cowboy Scene', icon: '🤠', run: () => { ed.newScene('cowboy'); tl.fitView(); vp.frameSelected(true); } },
  'file.newCube': { label: 'New › General (Cube)', icon: '▣', sc: 'Ctrl N', run: () => { ed.newScene('cube'); vp.frameSelected(true); } },
  'file.open': { label: 'Open…', icon: '📂', sc: 'Ctrl O', run: () => openFile() },
  'file.save': { label: 'Save', icon: '💾', sc: 'Ctrl S', run: () => { ed.autosave(); const s = JSON.stringify(ed.serialize()); saveFile('scene.sfscene.json', s, 'application/json', s); } },
  'file.copyScene': { label: 'Copy Scene as JSON…', icon: '⧉', run: () => text('Scene JSON', 'The whole scene: meshes, characters, materials and every action.', JSON.stringify(ed.serialize())) },
  'file.paste': { label: 'Import from Pasted JSON…', icon: '📋', run: () => pasteImport() },
  'file.exportGLB': { label: 'Export › glTF 2.0 (.glb)', icon: '⇪', run: () => { const a = selArm() || ed.objects.find((o) => o.kind === 'armature'); if (!a) return toast('Export needs an armature'); const b = E.exportGLB(a.character); saveFile(a.character.name.toLowerCase() + '.glb', b, 'model/gltf-binary'); } },
  'file.exportOBJ': { label: 'Export › Wavefront (.obj, posed)', icon: '⇪', run: () => { const list = (ed.selection.size ? [...ed.selection] : ed.allObjects()).flatMap((o) => ed.meshesOf(o)).filter((m) => m.visible); const t = E.exportOBJ([...new Set(list)]); saveFile('shapeforge.obj', t, 'text/plain', t); } },
  'file.exportModel': { label: 'Export › Character JSON (engine)', icon: '⇪', run: () => { const a = selArm(); if (!a) return toast('Select a character'); const t = JSON.stringify(a.character.toJSON()); saveFile(a.character.name.toLowerCase() + '.json', t, 'application/json', t); } },
  'file.sendToViewer': { label: 'Open Character in Viewer', icon: '↗', run: () => { const a = selArm() || ed.objects.find((o) => o.kind === 'armature'); if (!a) return toast('No character to send'); try { localStorage.setItem('shapeforge.handoff', JSON.stringify(a.character.toJSON())); } catch { return toast('Browser storage is unavailable here'); } location.href = 'viewer.html#studio'; } },
  'edit.undo': { label: 'Undo', icon: '↶', sc: 'Ctrl Z', run: () => { const l = ed.undo(); toast(l ? 'Undo ' + l : 'Nothing to undo', 1000); } },
  'edit.redo': { label: 'Redo', icon: '↷', sc: 'Ctrl ⇧ Z', run: () => { const l = ed.redo(); toast(l ? 'Redo ' + l : 'Nothing to redo', 1000); } },
  'edit.search': { label: 'Operator Search…', icon: '🔎', sc: 'F3', run: () => { const r = $('viewport').getBoundingClientRect(); showMenu(Object.entries(C).filter(([, c]) => !c.hidden).map(([id, c]) => ({ label: c.label, icon: c.icon, shortcut: c.sc, run: () => run(id) })), r.left + r.width / 2 - 150, r.top + 60, { title: 'Search', search: true }); } },
  'edit.selectAll': { label: 'Select All', icon: '⬚', sc: 'A', run: () => { if (ed.mode === 'pose') { const sk = ed.poseArmature.character.skeleton; sk.bones.forEach((_, i) => ed.selectedBones.add(i)); ed.emit('selection'); } else ed.selectAll(true); } },
  'edit.deselect': { label: 'Select None', icon: '⬚', sc: 'Alt A', run: () => { if (ed.mode === 'pose') ed.selectBone(-1); else ed.selectAll(false); } },
  'edit.delete': { label: 'Delete', icon: '✕', sc: 'X', run: () => { if (ed.mode === 'pose') return toast('Leave Pose Mode to delete objects'); const n = ed.selection.size; if (!n) return; [...ed.selection].forEach((o) => ed.remove(o)); ed.emit('selection'); ed.commit('Delete'); toast(`Deleted ${n} object${n > 1 ? 's' : ''}`); } },
  'edit.duplicate': { label: 'Duplicate', icon: '⧉', sc: '⇧ D', run: () => { if (ed.mode === 'pose' || !ed.selection.size) return; const copies = [...ed.selection].map((o) => ed.duplicate(o)); ed.selection.clear(); copies.forEach((c) => ed.selection.add(c)); ed.active = copies[copies.length - 1]; ed.emit('selection'); vp.startModal('G'); } },
  'object.move': { label: 'Move', icon: '✥', sc: 'G', run: () => vp.startModal('G') },
  'object.rotate': { label: 'Rotate', icon: '⟳', sc: 'R', run: () => vp.startModal('R') },
  'object.scale': { label: 'Scale', icon: '⤢', sc: 'S', run: () => vp.startModal('S') },
  'object.clearLoc': { label: 'Clear Location', sc: 'Alt G', run: () => clearXf('position', [0, 0, 0]) },
  'object.clearRot': { label: 'Clear Rotation', sc: 'Alt R', run: () => clearXf('rotation', [0, 0, 0]) },
  'object.clearScale': { label: 'Clear Scale', sc: 'Alt S', run: () => clearXf('scale', [1, 1, 1]) },
  'object.snapGround': { label: 'Drop to Ground', icon: '⤓', run: () => { for (const o of ed.selection) { if (o.kind !== 'mesh') continue; const b = o.node.geometry.bounds(); o.node.updateWorld(null); let minY = Infinity; for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) minY = Math.min(minY, E.vec3.transformMat4([0, 0, 0], [x, y, z], o.node.world)[1]); o.def.position[1] -= minY; ed.applyTransform(o); } ed.commit('Drop to Ground'); } },
  'object.hide': { label: 'Hide Selected', icon: '◌', sc: 'H', run: () => { for (const o of ed.selection) ed.setHidden(o, true); ed.selection.clear(); ed.active = null; ed.emit('selection'); ed.commit('Hide'); } },
  'object.unhide': { label: 'Reveal Hidden', icon: '👁', sc: 'Alt H', run: () => { for (const o of ed.allObjects()) ed.setHidden(o, false); ed.commit('Reveal'); } },
  'view.frameSelected': { label: 'Frame Selected', icon: '⌖', sc: 'Numpad .', run: () => vp.frameSelected() },
  'view.frameAll': { label: 'Frame All', icon: '⌖', sc: 'Home', run: () => vp.frameSelected(true) },
  'view.front': { label: 'Viewpoint › Front', sc: 'Numpad 1', run: () => vp.setView('front') },
  'view.back': { label: 'Viewpoint › Back', sc: 'Ctrl Numpad 1', run: () => vp.setView('back') },
  'view.right': { label: 'Viewpoint › Right', sc: 'Numpad 3', run: () => vp.setView('right') },
  'view.left': { label: 'Viewpoint › Left', sc: 'Ctrl Numpad 3', run: () => vp.setView('left') },
  'view.top': { label: 'Viewpoint › Top', sc: 'Numpad 7', run: () => vp.setView('top') },
  'view.bottom': { label: 'Viewpoint › Bottom', sc: 'Ctrl Numpad 7', run: () => vp.setView('bottom') },
  'view.persp': { label: 'Perspective / Orthographic', sc: 'Numpad 5', run: () => vp.togglePersp() },
  'view.sidebar': { label: 'Toggle Side Panels', sc: 'N', run: () => { document.body.classList.toggle('show-side'); const s = document.documentElement.style; s.setProperty('--side-w', getComputedStyle(document.documentElement).getPropertyValue('--side-w').trim() === '0px' ? '330px' : '0px'); } },
  'view.maximize': { label: 'Toggle Maximize Area', sc: 'Ctrl Space', run: () => { const r = document.documentElement.style; const max = r.getPropertyValue('--tl-h') === '0px'; r.setProperty('--tl-h', max ? '190px' : '0px'); r.setProperty('--side-w', max ? '330px' : '0px'); } },
  'view.xray': { label: 'Toggle X-Ray', sc: 'Alt Z', run: () => { ed.xray = !ed.xray; renderVpHeader(); } },
  'view.onion': { label: 'Toggle Onion Skinning', icon: '👻', run: () => { ed.onion = !ed.onion; tl.renderHeader(); renderVpHeader(); } },
  'view.shadingPie': { label: 'Shading…', sc: 'Z', run: () => { const r = $('canvas').getBoundingClientRect(); showMenu(['wireframe', 'solid', 'material', 'rendered'].map((s) => ({ label: s[0].toUpperCase() + s.slice(1), icon: ed.shading === s ? '●' : '○', run: () => setShading(s) })), vp.mouse[0] + r.left - 60, vp.mouse[1] + r.top - 40, { title: 'Viewport Shading' }); } },
  'pose.toggle': { label: 'Toggle Pose Mode', icon: '🦴', sc: 'Tab', run: () => { if (ed.mode === 'pose') ed.setMode('object'); else if (!ed.setMode('pose')) toast('Select an armature or one of its parts'); } },
  'pose.clearRotation': { label: 'Clear Pose Transforms', sc: 'Alt R', run: () => { const arm = ed.poseArmature; if (!arm) return; const sk = arm.character.skeleton; const list = ed.selectedBones.size ? [...ed.selectedBones] : sk.bones.map((_, i) => i); for (const i of list) { sk.rot.set([0, 0, 0, 1], i * 4); sk.pos.set([0, 0, 0], i * 3); } sk.update(); ed.poseDirty = true; ed.emit('selection'); } },
  'anim.insertKey': { label: 'Insert Keyframe', icon: '◆', sc: 'I', run: () => { const arm = ed.poseArmature || selArm(); if (!arm) return toast('Select an armature'); if (!ed.clipOf(arm)) newAction(arm); const n = ed.insertKeys(arm, ed.mode === 'pose' ? ed.selectedBones : null); ed.commit('Insert Keyframe'); toast(`Keyed ${n} bone${n === 1 ? '' : 's'} at frame ${Math.round(ed.frame)}`, 1200); ed.emit('selection'); } },
  'anim.deleteKey': { label: 'Delete Keyframe', sc: 'Alt I', run: () => { const arm = ed.poseArmature || selArm(); const clip = ed.clipOf(arm); if (!clip) return; const t = ed.frame / ed.fps, sk = arm.character.skeleton; const list = ed.mode === 'pose' && ed.selectedBones.size ? [...ed.selectedBones].map((i) => sk.bones[i].name) : clip.tracks.map((x) => x.bone); for (const b of new Set(list)) for (const tr of clip.tracks.filter((x) => x.bone === b)) { const k = tr.keys.find((k) => Math.abs(k.t - t) < 0.5 / ed.fps); if (k) clip.removeKey(b, tr.type, k.t); } ed.commit('Delete Keyframe'); ed.evaluate(true); } },
  'anim.play': { label: 'Play / Pause', icon: '▶', sc: 'Space', run: () => { ed.playing = !ed.playing; if (!ed.playing) { ed.frame = Math.round(ed.frame); ed.evaluate(true); } tl.renderHeader(); } },
  'anim.newAction': { label: 'New Action', icon: '🎞', run: () => { const arm = selArm() || ed.activeArmature; if (arm) newAction(arm, true); } },
  'anim.deleteAction': { label: 'Delete Action', run: () => { const arm = selArm() || ed.activeArmature; if (!arm || !arm.action) return; const n = arm.action; arm.character.mixer.removeClip(n); arm.action = [...arm.character.mixer.clips.keys()][0] || null; ed.setFrame(0); ed.commit('Delete Action'); toast('Deleted action ' + n); ed.emit('selection'); } },
  'anim.synth': { label: 'Motion Synth › Generate Action', icon: '✨', run: () => { const arm = selArm() || ed.activeArmature; if (!arm) return; const S = ed.uiState.synth; const names = [...arm.character.mixer.clips.keys()]; const base = { walk: 'Walk', swagger: 'Swagger', sneak: 'Sneak', jog: 'Jog', crawl: 'Crawl', idle: 'Idle' }[S.kind]; const name = names.includes(base) ? nextName(base, names) : base; try { const sk = new E.Skeleton(arm.character.skeleton.toJSON()); const clip = synthFor(S.kind, S, sk, name); arm.character.mixer.addClip(clip); arm.action = name; ed.setFrame(0); tl.fitView(); ed.commit('Motion Synth'); ed.playing = true; tl.renderHeader(); toast(`Generated ${name} (${clip.tracks.length} channels)`); ed.emit('selection'); } catch (e) { toast('Motion Synth failed: ' + e.message); } } },
  'rig.bind': { label: 'Bind Mesh to Armature', hidden: true, run: (opt) => { const o = ed.active; if (!o || o.kind !== 'mesh') return; const arm = ed.objects.find((a) => a.id === opt.armId) || ed.objects.find((a) => a.kind === 'armature'); const ch = arm.character; const inv = E.mat4.invert(E.mat4.create(), ch.world); o.node.updateWorld(null); const local = E.mat4.multiply(E.mat4.create(), inv, o.node.world); const pos = E.mat4.getTranslation([0, 0, 0], local); const rot = Array.from(E.quat.toEuler([0, 0, 0], E.mat4.getRotation(E.quat.create(), local))); const matName = nextName(o.def.name + '_mat', [...ch.materials.keys()]); ch.materials.set(matName, new E.Material({ ...o.material.toJSON(), name: matName })); let bind; if (opt.bone) bind = { bone: opt.bone }; else { const sk = ch.skeleton; const d = sk.bones.map((b, i) => [E.vec3.dist(pos, [(b.head[0] + b.tail[0]) / 2, (b.head[1] + b.tail[1]) / 2, (b.head[2] + b.tail[2]) / 2]), b.name, i]).filter((x) => sk.bones[x[2]].deform).sort((a, b) => a[0] - b[0]); bind = { bones: d.slice(0, 3).map((x) => x[1]), falloff: 6 }; } const p = ed.addPart(arm, { name: o.def.name, shape: o.def.shape, modifiers: o.def.modifiers, material: matName, bind, position: Array.from(pos), rotation: rot, scale: [...o.def.scale] }); ed.remove(o); ed.select(p); ed.commit('Bind to Armature'); toast(`${o.def.name} is now a part of ${ch.name}`); } },
  'rig.unbind': { label: 'Unbind Part', hidden: true, run: () => { const o = ed.active; if (!o || o.kind !== 'part') return; const ch = o.armature.character; const m = o.part.meshes[0]; const world = E.mat4.multiply(E.mat4.create(), ch.world, m.local); const d = o.part.def; const obj = ed.addMesh({ name: d.name, shape: d.shape, modifiers: d.modifiers, material: ch.material(d.material).toJSON(), position: Array.from(E.mat4.getTranslation([0, 0, 0], world)), rotation: Array.from(E.quat.toEuler([0, 0, 0], E.mat4.getRotation(E.quat.create(), world))), scale: [...(d.scale || [1, 1, 1])] }, { select: false }); ed.remove(o); ed.select(obj); ed.commit('Unbind'); } },
  'rig.addBone': { label: 'Extrude Bone', hidden: true, run: () => { const arm = ed.poseArmature; if (!arm || ed.activeBone < 0) return; const ch = arm.character, sk = ch.skeleton, b = sk.bones[ed.activeBone]; const dir = E.vec3.sub([0, 0, 0], b.tail, b.head); const name = nextName(b.name.replace(/\.(L|R)$/, '') + '_child', ch.def.skeleton.map((x) => x.name)); ch.def.skeleton.push({ name, parent: b.name, head: [...b.tail], tail: E.vec3.add([0, 0, 0], b.tail, E.vec3.scale(dir, dir, 0.6)) }); ch.rebuildSkeleton(); ed.selectBone(ch.skeleton.boneIndex(name)); ed.commit('Extrude Bone'); } },
  'help.keys': { label: 'Keyboard Shortcuts', icon: '⌨', sc: 'F1', run: () => showKeys() },
  'help.about': { label: 'About ShapeForge', icon: 'ℹ', run: () => dialog('About ShapeForge', [h('p', {}, 'ShapeForge is a zero-dependency WebGL2 engine for building characters out of parametric shapes, rigging them to skeletons and animating them. The Studio mirrors Blender’s layout and hotkeys; the Viewer previews clips with phase-synced crossfades; everything exports to glTF for other engines.'), h('p', {}, 'Engine source lives in src/engine. Characters are plain JSON, so games can load them with Character.fromURL().')]) },
};
function run(id, arg) { const c = C[id]; if (!c) return; closeMenus(); c.run(arg); }
ed.on('command', (c) => (typeof c === 'string' ? run(c) : run(c.id, c)));

function clearXf(key, v) {
  if (ed.mode === 'pose') return run('pose.clearRotation');
  for (const o of ed.selection) { ed.xf(o)[key] = [...v]; ed.applyTransform(o); }
  ed.commit('Clear ' + key); ed.emit('selection');
}
function newAction(arm, copy = false) {
  const ch = arm.character, names = [...ch.mixer.clips.keys()];
  const cur = ed.clipOf(arm);
  const name = nextName(cur ? cur.name.replace(/\.\d{3}$/, '') : 'Action', names);
  const clip = copy && cur ? new E.Clip({ ...cur.toJSON(), name }) : new E.Clip({ name, duration: 2, loop: true, tracks: [] });
  ch.mixer.addClip(clip); arm.action = name; ed.setFrame(0); tl.fitView();
  ed.commit('New Action'); ed.emit('selection');
  toast('Created action ' + name);
}
function setShading(s) { ed.shading = s; renderVpHeader(); }
function openFile() {
  const inp = h('input', { type: 'file', accept: '.json,application/json' });
  inp.onchange = async () => { const f = inp.files[0]; if (!f) return; try { importDoc(JSON.parse(await f.text())); } catch (e) { toast('Could not open file: ' + e.message); } };
  inp.click();
}
function importDoc(doc) {
  if (doc.format === 'shapeforge-scene') { ed.load(doc); tl.fitView(); vp.frameSelected(true); toast('Scene loaded'); return; }
  if (doc.skeleton && doc.parts) { const o = ed.addArmature(doc); ed.select(o); ed.commit('Import Character'); tl.fitView(); toast('Imported ' + o.character.name); return; }
  toast('Unrecognised file: expected a ShapeForge scene or character JSON');
}
function pasteImport() {
  const ta = h('textarea', { placeholder: 'Paste a ShapeForge scene or character JSON here', 'aria-label': 'JSON to import' });
  ta.onkeydown = (e) => e.stopPropagation();
  dialog('Import JSON', [h('p', {}, 'Paste a scene (from Copy Scene as JSON) or a character file.'), ta], [{ label: 'Cancel' }, { label: 'Import', primary: true, run: () => { try { importDoc(JSON.parse(ta.value)); } catch (e) { toast('That is not valid JSON: ' + e.message); return false; } } }]);
}
function showKeys() {
  const K = [['Middle drag / Alt + Left drag', 'Orbit'], ['Shift + Middle drag', 'Pan'], ['Wheel / Ctrl + Middle drag', 'Zoom'], ['Left click / Shift click / drag', 'Select / extend / box select'], ['G · R · S', 'Move · Rotate · Scale (then X/Y/Z, type a value, Enter or click)'], ['Shift A', 'Add menu'], ['Shift D', 'Duplicate'], ['X / Delete', 'Delete (keyframes when over the timeline)'], ['H · Alt H', 'Hide · Reveal'], ['A · Alt A', 'Select all · none'], ['Tab', 'Toggle Pose Mode'], ['I · Alt I', 'Insert · delete keyframe'], ['Space', 'Play / pause'], ['← → · Shift ← →', 'Step frame · jump to start/end'], ['↑ ↓', 'Next / previous keyframe'], ['Numpad 1 3 7 (Ctrl flips) or 1 3 7', 'Front / right / top views'], ['Numpad 5 · Numpad . · Home', 'Ortho toggle · frame selected · frame all'], ['Z · Alt Z', 'Shading menu · X-ray'], ['Ctrl Z · Ctrl Shift Z', 'Undo · redo'], ['F3', 'Operator search'], ['N', 'Toggle side panels'], ['Ctrl Space', 'Maximize viewport'], ['Ctrl S', 'Save']];
  dialog('Keyboard Shortcuts', h('div', { class: 'keys' }, K.flatMap(([k, v]) => [h('div', {}, ...k.split(' · ').flatMap((x, i) => [i ? ' · ' : '', h('kbd', {}, x)])), h('div', {}, v)])));
}

// ---------------------------------------------------------------- menus
function addMenuItems() {
  const shapeItems = Object.entries(E.SHAPES).map(([k, s]) => ({ label: s.label, icon: s.icon, run: () => addObjectAtCursor(() => ({ name: s.label.split(' ')[0], shape: { type: k, ...E.shapeDefaults(k) } })) }));
  const presetItems = Object.entries(PRESETS).map(([k, f]) => ({ label: k, icon: '✦', run: () => addObjectAtCursor(() => ({ name: k.split(' (')[0], ...f() })) }));
  const partItems = Object.entries(E.SHAPES).map(([k, s]) => ({ label: s.label, icon: s.icon, run: () => addPart(k) }));
  return [
    { label: 'Mesh', icon: '▲', sub: shapeItems },
    { label: 'Shape Presets', icon: '✦', sub: presetItems },
    { label: 'Part on Active Armature', icon: '◆', sub: partItems, disabled: !selArm() },
    '-',
    { label: 'Armature', icon: '🦴', sub: [
      { label: 'Humanoid Rig (bones only)', icon: '🦴', run: () => { const o = ed.addArmature(ed.humanoidRig()); ed.select(o); ed.commit('Add Rig'); } },
      { label: 'Grinner (monster)', icon: '👹', run: () => { const o = ed.addArmature(grinnerDefinition()); o.transform.position = [ed.objects.filter((x) => x.kind === 'armature').length * 1.2 - 1.2, 0, 0]; ed.applyTransform(o); ed.select(o); ed.commit('Add Grinner'); tl.fitView(); } },
      { label: 'Cowboy Character', icon: '🤠', run: () => { const o = ed.addArmature(cowboyDefinition()); o.transform.position = [ed.objects.filter((x) => x.kind === 'armature').length * 1.2 - 1.2, 0, 0]; ed.applyTransform(o); ed.select(o); ed.commit('Add Cowboy'); tl.fitView(); } },
    ] },
  ];
}
function menuFor(name) {
  const it = (id) => ({ label: C[id].label.replace(/^.*› /, ''), icon: C[id].icon, shortcut: C[id].sc, run: () => run(id) });
  switch (name) {
    case 'File': return [it('file.new'), it('file.newCube'), it('file.open'), '-', it('file.save'), it('file.copyScene'), it('file.paste'), '-', { label: 'Export', icon: '⇪', sub: [it('file.exportGLB'), it('file.exportOBJ'), it('file.exportModel')] }, '-', it('file.sendToViewer')];
    case 'Edit': return [it('edit.undo'), it('edit.redo'), '-', { label: 'Undo History', icon: '☰', sub: ed.undoStack.length ? ed.undoStack.slice(-15).reverse().map((s, i) => ({ label: s.label, run: () => { for (let k = 0; k <= i; k++) ed.undo(); } })) : [{ label: 'Nothing to undo', disabled: true }] }, '-', it('edit.duplicate'), it('edit.delete'), '-', it('edit.selectAll'), it('edit.deselect'), '-', it('edit.search')];
    case 'Add': return addMenuItems();
    case 'Object': return ed.mode === 'pose'
      ? [{ title: 'Pose' }, it('object.rotate'), it('object.move'), it('pose.clearRotation'), '-', it('anim.insertKey'), it('anim.deleteKey'), '-', it('pose.toggle')]
      : [{ label: 'Transform', icon: '✥', sub: [it('object.move'), it('object.rotate'), it('object.scale')] }, { label: 'Clear', icon: '⌫', sub: [it('object.clearLoc'), it('object.clearRot'), it('object.clearScale')] }, it('object.snapGround'), '-', it('edit.duplicate'), it('edit.delete'), '-', it('object.hide'), it('object.unhide'), '-', it('pose.toggle'), it('anim.insertKey')];
    case 'View': return [it('view.frameSelected'), it('view.frameAll'), '-', { label: 'Viewpoint', icon: '👁', sub: ['front', 'back', 'right', 'left', 'top', 'bottom'].map((v) => it('view.' + v)) }, it('view.persp'), '-', it('view.shadingPie'), it('view.xray'), it('view.onion'), '-', it('view.sidebar'), it('view.maximize')];
    case 'Help': return [it('help.keys'), it('edit.search'), it('help.about')];
  }
  return [];
}
function renderMenubar() {
  const mb = $('menubar'); mb.innerHTML = '';
  for (const name of ['File', 'Edit', 'Add', 'Object', 'View', 'Help']) {
    const b = h('button', { class: 'menu-btn' }, name === 'Object' && ed.mode === 'pose' ? 'Pose' : name);
    b.onclick = () => { const r = b.getBoundingClientRect(); showMenu(menuFor(name), r.left, r.bottom + 2); b.classList.add('open'); };
    b.onpointerenter = () => { if (document.querySelector('.menu-btn.open') && !b.classList.contains('open')) b.click(); };
    mb.append(b);
  }
}
function renderWorkspaces() {
  const ws = $('workspaces'); ws.innerHTML = '';
  const cur = ed.uiState.workspace || 'Layout';
  for (const w of ['Layout', 'Modeling', 'Animation', 'Shading']) ws.append(h('button', { class: 'ws-tab' + (w === cur ? ' on' : ''), role: 'tab', 'aria-selected': w === cur, onclick: () => setWorkspace(w) }, w));
}
function setWorkspace(w) {
  ed.uiState.workspace = w;
  const r = document.documentElement.style;
  if (w === 'Layout') { r.setProperty('--tl-h', '190px'); setShading('solid'); ed.onion = false; }
  if (w === 'Modeling') { r.setProperty('--tl-h', '0px'); setShading('solid'); propState.tab = propState.preferred = 'modifiers'; if (ed.mode === 'pose') ed.setMode('object'); }
  if (w === 'Animation') { r.setProperty('--tl-h', '300px'); setShading('material'); ed.onion = true; propState.tab = propState.preferred = 'anim'; const a = selArm() || ed.objects.find((o) => o.kind === 'armature'); if (a) { ed.select(a); ed.setMode('pose'); } }
  if (w === 'Shading') { r.setProperty('--tl-h', '0px'); setShading('rendered'); propState.tab = propState.preferred = 'material'; if (ed.mode === 'pose') ed.setMode('object'); }
  renderWorkspaces(); refreshAll(); tl.renderHeader(); setTimeout(() => tl.fitView(), 50);
}
function renderToolbar() {
  const tb = $('toolbar'); tb.innerHTML = '';
  const tools = [['select', '↖', 'Select (W)'], ['move', '✥', 'Move (drag the gizmo, or press G)'], ['rotate', '⟳', 'Rotate (drag a ring, or press R)'], ['scale', '⤢', 'Scale (drag a handle, or press S)']];
  for (const [id, ic, title] of tools) tb.append(h('button', { class: 'tool' + (ed.tool === id ? ' on' : ''), title, 'aria-label': title, onclick: () => { ed.tool = id; renderToolbar(); } }, ic));
  tb.append(h('div', { class: 'tool-sep' }));
  tb.append(h('button', { class: 'tool', title: 'Add (Shift A)', 'aria-label': 'Add', onclick: (e) => { const r = e.target.getBoundingClientRect(); showMenu(addMenuItems(), r.right + 4, r.top, { title: 'Add' }); } }, '＋'));
  tb.append(h('button', { class: 'tool', title: 'Frame selected (Numpad .)', 'aria-label': 'Frame selected', onclick: () => vp.frameSelected() }, '⌖'));
  tb.append(h('button', { class: 'tool', title: 'Operator search (F3)', 'aria-label': 'Search', onclick: () => run('edit.search') }, '🔎'));
}
function renderVpHeader() {
  const hd = $('vpHeader'); hd.innerHTML = '';
  const modeSel = h('select', { class: 'dd', 'aria-label': 'Interaction mode', onchange: (e) => { if (e.target.value === 'pose') { if (!ed.setMode('pose')) { toast('Select an armature first'); e.target.value = 'object'; } } else ed.setMode('object'); } },
    h('option', { value: 'object', selected: ed.mode === 'object' }, '▣ Object Mode'), h('option', { value: 'pose', selected: ed.mode === 'pose' }, '🦴 Pose Mode'));
  hd.append(modeSel);
  for (const n of ['View', 'Add', 'Object']) { const b = h('button', { class: 'ib flat' }, n === 'Object' && ed.mode === 'pose' ? 'Pose' : n); b.onclick = () => { const r = b.getBoundingClientRect(); showMenu(menuFor(n), r.left, r.bottom + 2); }; hd.append(b); }
  hd.append(h('div', { class: 'spacer' }));
  const tog = (label, title, on, fn) => h('button', { class: 'ib' + (on ? ' on' : ''), title, 'aria-label': title, onclick: () => { fn(); renderVpHeader(); } }, label);
  hd.append(h('div', { class: 'grp' }, tog('#', 'Grid floor', ed.overlays.grid, () => (ed.overlays.grid = !ed.overlays.grid)), tog('🦴', 'Show bones of selected armatures', ed.overlays.bones, () => (ed.overlays.bones = !ed.overlays.bones)), tog('▦', 'Wireframe overlay', ed.overlays.wire, () => (ed.overlays.wire = !ed.overlays.wire)), tog('👻', 'Onion skinning', ed.onion, () => { ed.onion = !ed.onion; tl.renderHeader(); })));
  hd.append(tog('◫', 'Toggle X-ray (Alt Z)', ed.xray, () => (ed.xray = !ed.xray)));
  const sh = h('div', { class: 'grp' });
  for (const [s, ic, t] of [['wireframe', '◯', 'Wireframe'], ['solid', '◐', 'Solid'], ['material', '◕', 'Material preview'], ['rendered', '●', 'Rendered (shadows, sky, bloom)']]) sh.append(h('button', { class: 'ib' + (ed.shading === s ? ' on' : ''), title: t, 'aria-label': t, onclick: () => setShading(s) }, ic));
  hd.append(sh);
}

// ---------------------------------------------------------------- UI refresh
let outlinerFilter = '';
$('outlinerFilter').oninput = (e) => { outlinerFilter = e.target.value; renderOutliner(ed, $('outlinerTree'), outlinerFilter); };
$('outlinerFilter').onkeydown = (e) => e.stopPropagation();
function refreshAll() {
  renderOutliner(ed, $('outlinerTree'), outlinerFilter);
  renderProperties(ed, $('propTabs'), $('propBody'), propState);
  renderMenubar(); renderVpHeader();
  tl.renderChannels();
  renderStatus();
}
let refreshQueued = false;
const queueRefresh = () => { if (refreshQueued) return; refreshQueued = true; requestAnimationFrame(() => { refreshQueued = false; refreshAll(); }); };
ed.on('selection', queueRefresh);
ed.on('mode', () => { if (ed.mode === 'pose') propState.tab = 'rig'; else if (propState.tab === 'rig') propState.tab = propState.preferred === 'rig' ? 'object' : propState.preferred; queueRefresh(); tl.renderHeader(); });
ed.on('change', (what) => { if (what === 'Transform' || what === 'Material' || what === 'World') { renderOutliner(ed, $('outlinerTree'), outlinerFilter); tl.renderChannels(); return; } queueRefresh(); tl.renderHeader(); });
ed.on('modal', () => { document.querySelectorAll('#propBody .num').forEach((n) => n.refresh && n.refresh()); const op = $('vpOpText'); op.hidden = !vp.modal; if (vp.modal) op.textContent = vp.modal.display || ''; renderStatus(); });
ed.on('frame', () => {});
ed.on('contextmenu', (e) => {
  const items = ed.mode === 'pose'
    ? [{ title: 'Pose Context' }, { label: 'Insert Keyframe', shortcut: 'I', icon: '◆', run: () => run('anim.insertKey') }, { label: 'Delete Keyframe', shortcut: 'Alt I', run: () => run('anim.deleteKey') }, { label: 'Clear Pose', shortcut: 'Alt R', run: () => run('pose.clearRotation') }, '-', { label: 'Object Mode', shortcut: 'Tab', run: () => run('pose.toggle') }]
    : [{ title: 'Object Context' }, { label: 'Duplicate', shortcut: '⇧ D', icon: '⧉', run: () => run('edit.duplicate') }, { label: 'Delete', shortcut: 'X', icon: '✕', run: () => run('edit.delete') }, { label: 'Drop to Ground', icon: '⤓', run: () => run('object.snapGround') }, { label: 'Hide', shortcut: 'H', run: () => run('object.hide') }, '-', { label: 'Frame Selected', shortcut: 'Numpad .', run: () => run('view.frameSelected') }, { label: 'Pose Mode', shortcut: 'Tab', icon: '🦴', run: () => run('pose.toggle'), disabled: !selArm() }];
  showMenu(items, e.clientX, e.clientY);
});

function renderStatus() {
  const hints = vp && vp.modal
    ? [['LMB / Enter', 'Confirm'], ['RMB / Esc', 'Cancel'], ['X Y Z', 'Constrain axis'], ['0–9', 'Type value'], ['G R S', 'Switch']]
    : ed.mode === 'pose'
      ? [['LMB', 'Select bone'], ['R', 'Rotate'], ['G', 'Move'], ['I', 'Insert key'], ['Space', 'Play'], ['Tab', 'Object Mode']]
      : [['LMB', 'Select'], ['MMB / Alt+LMB', 'Orbit'], ['G R S', 'Transform'], ['Shift A', 'Add'], ['Tab', 'Pose Mode'], ['F3', 'Search']];
  $('statusLeft').innerHTML = '';
  for (const [k, v] of hints) $('statusLeft').append(h('span', {}, h('b', {}, k), ' ' + v));
}
let statT = 0, fps = 60;
function renderStatusRight(dt) {
  fps += (1 / Math.max(1e-3, dt) - fps) * 0.05;
  statT += dt; if (statT < 0.5) return; statT = 0;
  let v = 0, t = 0;
  for (const o of ed.allObjects()) if (o.kind !== 'armature') for (const m of ed.meshesOf(o)) { v += m.geometry.vertexCount; t += m.geometry.triangleCount; }
  const n = ed.allObjects().filter((o) => o.kind !== 'part').length;
  $('statusRight').textContent = `${ed.active ? ed.objName(ed.active) + ' | ' : ''}Verts ${v.toLocaleString()} | Tris ${t.toLocaleString()} | Objects ${ed.selection.size}/${n} | ${Math.round(fps)} fps | ShapeForge 1.0`;
}
function renderInfo() {
  const arm = ed.activeArmature, clip = ed.clipOf(arm);
  $('vpInfo').innerHTML = '';
  $('vpInfo').append(...[h('div', {}, vp.viewName), h('div', { class: 'dim' }, `(${Math.round(ed.frame)}) ${ed.active ? ed.objName(ed.active) : 'Scene'}${clip && ed.armatureOf(ed.active) ? ' : ' + clip.name : ''}${ed.mode === 'pose' && ed.activeBone >= 0 ? ' › ' + ed.poseArmature.character.skeleton.bones[ed.activeBone].name : ''}`), ed.poseDirty ? h('div', { style: { color: '#f5c542' } }, '● unkeyed pose changes') : null].filter(Boolean));
}

// ---------------------------------------------------------------- keyboard
window.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  if (tag === 'INPUT' && !['checkbox', 'range', 'color'].includes(e.target.type) || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (!$('modalLayer').hidden) { if (e.key === 'Escape') { $('modalLayer').hidden = true; } return; }
  if (vp.modal) { if (vp.modalKey(e)) e.preventDefault(); return; }
  if (document.querySelector('.menu')) { if (e.key === 'Escape') closeMenus(); return; }
  const k = e.key, ctrl = e.ctrlKey || e.metaKey, code = e.code;
  const overTL = tl.hover;
  const act = (id) => { e.preventDefault(); run(id); };
  if (ctrl && (k === 'z' || k === 'Z')) return act(e.shiftKey ? 'edit.redo' : 'edit.undo');
  if (ctrl && k === 'y') return act('edit.redo');
  if (ctrl && k === 's') return act('file.save');
  if (ctrl && k === 'o') return act('file.open');
  if (ctrl && k === 'n') return act('file.newCube');
  if (ctrl && k === ' ') return act('view.maximize');
  if (k === 'F3') return act('edit.search');
  if (k === 'F1') return act('help.keys');
  if (k === 'Tab') return act('pose.toggle');
  if (k === ' ') return act('anim.play');
  if (code?.startsWith('Numpad') || (!e.altKey && ['1', '3', '7'].includes(k))) {
    const n = code?.startsWith('Numpad') ? code.slice(6) : k;
    const map = { 1: ctrl ? 'back' : 'front', 3: ctrl ? 'left' : 'right', 7: ctrl ? 'bottom' : 'top' };
    if (map[n]) { e.preventDefault(); vp.setView(map[n]); return; }
    if (n === '5') return act('view.persp');
    if (n === 'Decimal') return act('view.frameSelected');
    if (n === '0') { e.preventDefault(); return; }
  }
  if (k === 'Home') return act('view.frameAll');
  if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); if (e.shiftKey) ed.setFrame(k === 'ArrowRight' ? ed.endFrame : 0); else ed.setFrame(Math.round(ed.frame) + (k === 'ArrowRight' ? 1 : -1)); return; }
  if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); tl.jumpKey(k === 'ArrowUp' ? 1 : -1); return; }
  if (e.shiftKey && (k === 'A' || k === 'a')) { e.preventDefault(); const r = $('canvas').getBoundingClientRect(); showMenu(addMenuItems(), r.left + vp.mouse[0] - 20, r.top + vp.mouse[1] - 10, { title: 'Add' }); return; }
  if (e.shiftKey && (k === 'D' || k === 'd')) return act('edit.duplicate');
  if (e.altKey) {
    if (k === 'a' || k === 'å') return act('edit.deselect');
    if (k === 'h' || k === '˙') return act('object.unhide');
    if (k === 'g' || k === '©') return act('object.clearLoc');
    if (k === 'r' || k === '®') return act('object.clearRot');
    if (k === 's' || k === 'ß') return act('object.clearScale');
    if (k === 'i') return act('anim.deleteKey');
    if (k === 'z' || k === 'Ω') return act('view.xray');
    return;
  }
  if (ctrl) return;
  switch (k.toLowerCase()) {
    case 'g': return act('object.move');
    case 'r': return act('object.rotate');
    case 's': return act('object.scale');
    case 'x': case 'delete': if (overTL && tl.deleteSelected()) { e.preventDefault(); return; } return act('edit.delete');
    case 'a': if (overTL) { tl.selectAllKeys(); return; } return act('edit.selectAll');
    case 'h': return act('object.hide');
    case 'i': return act('anim.insertKey');
    case 'n': return act('view.sidebar');
    case 'z': return act('view.shadingPie');
    case 'w': ed.tool = 'select'; renderToolbar(); return;
    case 'escape': if (ed.playing) run('anim.play'); return;
  }
});

// ---------------------------------------------------------------- resizers
function resizer(id, varName, axis, min, max, invert = false) {
  const el = $(id); let start = null;
  el.addEventListener('pointerdown', (e) => { start = { p: axis === 'x' ? e.clientX : e.clientY, v: parseFloat(getComputedStyle(document.documentElement).getPropertyValue(varName)) || 0, h: el.parentElement.getBoundingClientRect().height }; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => { if (!start) return; const d = (axis === 'x' ? e.clientX : e.clientY) - start.p; const v = Math.max(min, Math.min(max, start.v + (invert ? -d : d))); document.documentElement.style.setProperty(varName, v + 'px'); });
  el.addEventListener('pointerup', () => { start = null; tl.fitView(); });
}
resizer('sideResizer', '--side-w', 'x', 220, 700, true);
resizer('timelineResizer', '--tl-h', 'y', 60, 600, true);
{ const el = $('outlinerResizer'); let s = null; el.addEventListener('pointerdown', (e) => { s = { y: e.clientY, h: $('outliner').getBoundingClientRect().height }; el.setPointerCapture(e.pointerId); }); el.addEventListener('pointermove', (e) => { if (s) document.documentElement.style.setProperty('--outliner-h', Math.max(60, s.h + e.clientY - s.y) + 'px'); }); el.addEventListener('pointerup', () => (s = null)); }

// ---------------------------------------------------------------- boot
function boot() {
  let restored = false;
  try {
    const saved = localStorage.getItem('shapeforge.studio.autosave');
    if (saved) { ed.load(JSON.parse(saved)); restored = ed.objects.length > 0; }
  } catch { /* storage unavailable or corrupt: start fresh */ }
  if (!restored) ed.newScene('cowboy');
  ed.applyWorld();
  renderWorkspaces(); renderToolbar(); refreshAll(); tl.renderHeader();
  setTimeout(() => { tl.fitView(); vp.frameSelected(true); }, 30);
  if (restored) toast('Restored your last session (File › New to start over)', 3200);
  else toast('Welcome to ShapeForge Studio — press F1 for shortcuts', 3200);
}
boot();

let last = performance.now();
function frame(now) {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
  if (ed.playing) { ed.frame += dt * ed.fps; const end = ed.endFrame; if (ed.frame >= end) ed.frame -= end; ed.poseDirty = false; ed.evaluate(false, dt); }
  vp.render(dt);
  tl.draw();
  renderInfo();
  renderStatusRight(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__studio = { ed, vp, tl, run };
