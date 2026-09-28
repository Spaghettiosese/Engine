// Outliner and Properties editor.
import * as E from '../engine/index.js';
import { h, numField, vecField, row, select, checkbox, colorField, panel, toast } from './widgets.js';

// ---------------------------------------------------------------- Outliner
export function renderOutliner(ed, el, filter = '') {
  el.innerHTML = '';
  const f = filter.toLowerCase();
  const rowEl = (o, depth, { icon, iconCls, name, twisty = null }) => {
    const sel = ed.selection.has(o), act = ed.active === o;
    const hidden = ed.isHidden(o);
    const r = h('div', { class: 'ol-row' + (act ? ' active' : sel ? ' sel' : ''), style: { paddingLeft: 4 + depth * 14 + 'px' }, 'data-id': o.id },
      h('span', { class: 'tw' }, twisty === null ? '' : twisty ? '▾' : '▸'),
      h('span', { class: 'ic ' + iconCls }, icon),
      h('span', { class: 'nm' }, name),
      h('span', { class: 'vis' + (hidden ? ' off' : ''), title: 'Hide in viewport (H)' }, hidden ? '◌' : '👁'));
    r.querySelector('.tw').onclick = (e) => { e.stopPropagation(); if (o.kind === 'armature') { o.expanded = !o.expanded; renderOutliner(ed, el, filter); } };
    r.querySelector('.vis').onclick = (e) => { e.stopPropagation(); ed.setHidden(o, !hidden); ed.commit(hidden ? 'Show' : 'Hide'); };
    r.onclick = (e) => { if (ed.mode === 'pose' && ed.armatureOf(o) !== ed.poseArmature) ed.setMode('object'); ed.select(o, { extend: e.shiftKey || e.ctrlKey, toggle: e.ctrlKey }); };
    r.ondblclick = () => {
      const nm = r.querySelector('.nm');
      const inp = h('input', { value: ed.objName(o), 'aria-label': 'Rename' });
      nm.innerHTML = ''; nm.append(inp); inp.focus(); inp.select();
      const done = (ok) => { if (ok && inp.value.trim()) { ed.setName(o, inp.value.trim()); ed.commit('Rename'); } renderOutliner(ed, el, filter); };
      inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
      inp.onblur = () => done(true);
    };
    return r;
  };
  el.append(h('div', { class: 'ol-row' }, h('span', { class: 'tw' }, '▾'), h('span', { class: 'ic col' }, '🗂'), h('span', { class: 'nm' }, 'Scene Collection')));
  for (const o of ed.objects) {
    if (o.kind === 'mesh') { if (!f || o.def.name.toLowerCase().includes(f)) el.append(rowEl(o, 1, { icon: '▲', iconCls: 'mesh', name: o.def.name })); continue; }
    const parts = o.parts.filter((p) => !f || p.part.def.name.toLowerCase().includes(f));
    el.append(rowEl(o, 1, { icon: '🦴', iconCls: 'arm', name: o.character.name, twisty: o.expanded }));
    if (o.expanded || f) for (const p of parts) el.append(rowEl(p, 2, { icon: '◆', iconCls: 'part', name: p.part.def.name + (p.part.def.mirror ? '  ⇋' : '') }));
  }
  const act = el.querySelector('.ol-row.active');
  if (act) act.scrollIntoView({ block: 'nearest' });
}

// ---------------------------------------------------------------- Properties
export const TABS = [
  { id: 'world', icon: '🌐', title: 'World' },
  { id: 'object', icon: '▣', title: 'Object' },
  { id: 'modifiers', icon: '🔧', title: 'Modifiers' },
  { id: 'shape', icon: '△', title: 'Shape Data' },
  { id: 'material', icon: '●', title: 'Material' },
  { id: 'rig', icon: '🦴', title: 'Rig & Binding' },
  { id: 'anim', icon: '🎞', title: 'Animation & Motion Synth' },
];

export function availableTabs(ed) {
  const o = ed.active;
  const t = ['world'];
  if (!o) return t;
  t.push('object');
  if (o.kind !== 'armature') t.push('modifiers', 'shape', 'material');
  if (ed.armatureOf(o) || o.kind === 'mesh') t.push('rig');
  if (ed.armatureOf(o)) t.push('anim');
  return t;
}

export function renderProperties(ed, tabsEl, bodyEl, state) {
  const avail = availableTabs(ed);
  if (!avail.includes(state.tab)) state.tab = avail.includes(state.preferred) ? state.preferred : avail[avail.length > 1 ? 1 : 0];
  tabsEl.innerHTML = '';
  for (const t of TABS) if (avail.includes(t.id)) tabsEl.append(h('button', { class: 'ptab' + (state.tab === t.id ? ' on' : ''), title: t.title, 'aria-label': t.title, onclick: () => { state.tab = state.preferred = t.id; renderProperties(ed, tabsEl, bodyEl, state); } }, t.icon));
  const scroll = bodyEl.scrollTop;
  bodyEl.innerHTML = '';
  const o = ed.active;
  if (o) bodyEl.append(h('div', { class: 'ctx' }, o.kind === 'part' ? [h('span', {}, '🦴 ' + o.armature.character.name), '›'] : null, h('b', {}, (o.kind === 'mesh' ? '▲ ' : o.kind === 'armature' ? '🦴 ' : '◆ ') + ed.objName(o))));
  const store = ed.uiState.panels || (ed.uiState.panels = {});
  const P = (title, body, opts = {}) => panel(title, body, { store, ...opts });
  const build = { world: worldTab, object: objectTab, modifiers: modifiersTab, shape: shapeTab, material: materialTab, rig: rigTab, anim: animTab }[state.tab];
  bodyEl.append(...[].concat(build(ed, o, P) || []));
  bodyEl.scrollTop = scroll;
}

const num = (label, get, set, opt = {}) => numField({ label, get, set, ...opt });

function worldTab(ed, o, P) {
  const w = ed.world;
  const upd = (k, commit) => (v, fin) => { w[k] = v; ed.applyWorld(); if (fin && commit) ed.commit('World'); };
  return [
    P('Sun', [
      row('Elevation', num('', () => w.sunElevation, upd('sunElevation', 1), { min: 2, max: 90, step: 0.5, unit: '°', slider: true })),
      row('Azimuth', num('', () => w.sunAzimuth, upd('sunAzimuth', 1), { min: -180, max: 180, step: 1, unit: '°', slider: true })),
      row('Strength', num('', () => w.sunIntensity, upd('sunIntensity', 1), { min: 0, max: 10, step: 0.05, slider: true })),
    ]),
    P('Film & Atmosphere', [
      row('Exposure', num('', () => w.exposure, upd('exposure', 1), { min: 0.1, max: 4, step: 0.02, slider: true })),
      row('Fog', num('', () => w.fog, upd('fog', 1), { min: 0, max: 0.1, step: 0.001, slider: true })),
      row('', checkbox('Procedural sky (Rendered)', w.sky, (v) => { w.sky = v; ed.commit('World'); })),
      row('', checkbox('Bloom', w.bloom, (v) => { w.bloom = v; ed.commit('World'); })),
      row('', checkbox('Desert ground (Material / Rendered)', w.ground !== false, (v) => { w.ground = v; ed.commit('World'); })),
      h('div', { class: 'hint' }, 'Switch the viewport to Rendered (Z → Rendered) to see shadows, sky, fog and bloom.'),
    ]),
    P('Scene Statistics', [statsBlock(ed)], { closed: false }),
  ];
}
function statsBlock(ed) {
  let v = 0, t = 0, n = 0;
  for (const o of ed.allObjects()) for (const m of ed.meshesOf(o)) if (o.kind !== 'armature') { v += m.geometry.vertexCount; t += m.geometry.triangleCount; n++; }
  const bones = ed.objects.filter((o) => o.kind === 'armature').reduce((a, o) => a + o.character.skeleton.length, 0);
  return h('div', { class: 'hint', style: { fontSize: '12px', color: '#bbb' } }, `Meshes ${n} · Vertices ${v.toLocaleString()} · Triangles ${t.toLocaleString()} · Bones ${bones}`);
}

function xformPanel(ed, o, P) {
  const x = ed.xf(o);
  const setter = (key) => (i, v, fin) => { x[key][i] = v; ed.applyTransform(o); ed.emit('modal'); if (fin) ed.commit('Transform'); };
  return P('Transform', [
    row('Location', vecField(['X', 'Y', 'Z'], () => x.position, { set: setter('position'), step: 0.01, unit: ' m' })),
    row('Rotation', vecField(['X', 'Y', 'Z'], () => x.rotation, { set: setter('rotation'), step: 0.5, unit: '°' })),
    row('Scale', vecField(['X', 'Y', 'Z'], () => x.scale, { set: setter('scale'), step: 0.01 })),
  ]);
}

function objectTab(ed, o, P) {
  const out = [xformPanel(ed, o, P)];
  if (o.kind === 'mesh') {
    out.push(P('Visibility', [
      row('', checkbox('Show in viewport', !o.def.hidden, (v) => { ed.setHidden(o, !v); ed.commit('Visibility'); })),
      row('', checkbox('Cast shadows', o.def.castShadow !== false, (v) => { o.def.castShadow = v; o.node.castShadow = v; ed.commit('Shadow'); })),
    ]));
  }
  if (o.kind === 'part') {
    out.push(P('Part', [
      row('', checkbox('Mirror across X (creates the .R twin)', !!o.part.def.mirror, (v) => { o.part.def.mirror = v; ed.rebuildGeometry(o); ed.commit('Mirror'); })),
      row('', checkbox('Show in viewport', !o.part.def.hidden, (v) => { ed.setHidden(o, !v); ed.commit('Visibility'); })),
      row('', checkbox('Cast shadows', o.part.def.castShadow !== false, (v) => { o.part.def.castShadow = v; o.part.meshes.forEach((m) => (m.castShadow = v)); ed.commit('Shadow'); })),
    ]));
  }
  if (o.kind === 'armature') {
    const ch = o.character;
    out.push(P('Character', [
      h('div', { class: 'hint' }, `${ch.parts.length} parts · ${ch.skeleton.length} bones · ${ch.mixer.clips.size} actions · ${ch.triangleCount.toLocaleString()} triangles`),
      h('div', { class: 'btnrow' }, h('button', { class: 'btn wide', onclick: () => ed.emit('command', 'pose.toggle') }, 'Pose Mode (Tab)'), h('button', { class: 'btn wide', onclick: () => ed.emit('command', 'file.sendToViewer') }, 'Open in Viewer ↗')),
    ]));
  }
  return out;
}

function paramWidgets(ed, target, schema, onChange) {
  const rows = [];
  for (const [k, d] of Object.entries(schema)) {
    const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    if (Array.isArray(d)) {
      if (typeof d[0] === 'boolean') { rows.push(row('', checkbox(label, target[k] ?? d[0], (v) => { target[k] = v; onChange(true); }))); continue; }
      const [def, min, max, step] = d;
      rows.push(row(label, num('', () => target[k] ?? def, (v, fin) => { target[k] = step >= 1 ? Math.round(v) : v; onChange(fin); }, { min, max, step })));
    } else if (d.type === 'enum') {
      rows.push(row(label, select(d.options, target[k] ?? d.default, (v) => { target[k] = v; onChange(true); })));
    } else if (d.type === 'numbers') {
      const ta = h('input', { class: 'txt', value: (target[k] ?? d.default).join(', '), 'aria-label': label });
      ta.onchange = () => { const v = ta.value.split(/[ ,]+/).map(Number).filter(Number.isFinite); if (v.length) { target[k] = v; onChange(true); } };
      ta.onkeydown = (e) => e.stopPropagation();
      rows.push(row(label, ta));
    } else if (d.type === 'points2' || d.type === 'points3') {
      const n = d.type === 'points2' ? 2 : 3;
      const ta = h('textarea', { class: 'pts', rows: 4, 'aria-label': label }, (target[k] ?? d.default).map((p) => p.map((v) => +v.toFixed(4)).join(' ')).join('\n'));
      ta.onchange = () => { const pts = ta.value.split('\n').map((l) => l.trim().split(/[ ,]+/).map(Number)).filter((p) => p.length === n && p.every(Number.isFinite)); if (pts.length >= 2) { target[k] = pts; onChange(true); } else toast(`Enter at least two points, ${n} numbers per line`); };
      ta.onkeydown = (e) => e.stopPropagation();
      rows.push(row(label, ta), h('div', { class: 'hint' }, n === 2 ? 'One "radius height" pair per line, bottom to top.' : 'One "x y z" point per line; a smooth spline runs through them.'));
    }
  }
  return rows;
}

function shapeTab(ed, o, P) {
  const shape = o.kind === 'mesh' ? o.def.shape : o.part.def.shape;
  const def = E.SHAPES[shape.type];
  const rebuild = (fin) => { ed.rebuildGeometry(o); if (fin) ed.commit('Shape'); };
  const typeSel = select(Object.entries(E.SHAPES).map(([k, s]) => [k, s.label]), shape.type, (t) => {
    const fresh = { type: t, ...E.shapeDefaults(t) };
    for (const k of Object.keys(shape)) delete shape[k];
    Object.assign(shape, fresh); rebuild(true); ed.emit('selection');
  });
  const g = ed.meshesOf(o)[0]?.geometry;
  return [P('Primitive', [row('Type', typeSel), ...paramWidgets(ed, shape, def.params, rebuild), g ? h('div', { class: 'hint' }, `${g.vertexCount.toLocaleString()} vertices · ${g.triangleCount.toLocaleString()} triangles (after modifiers)`) : null])];
}

function modifiersTab(ed, o, P) {
  const mods = o.kind === 'mesh' ? o.def.modifiers : (o.part.def.modifiers = o.part.def.modifiers || []);
  const rebuild = (fin) => { ed.rebuildGeometry(o); if (fin) ed.commit('Modifier'); };
  const add = select([['', 'Add Modifier…'], ...Object.entries(E.MODIFIERS).map(([k, m]) => [k, (m.kind === 'generate' ? 'Generate · ' : 'Deform · ') + m.label])], '', (t) => { if (!t) return; mods.push(E.modifierDefaults(t)); rebuild(true); ed.emit('selection'); });
  const out = [h('div', { style: { marginBottom: '6px' } }, add)];
  if (!mods.length) out.push(h('div', { class: 'hint' }, 'Modifiers reshape the primitive without destroying it: taper a leg, bend a brim, twist a column, mirror, array rivets, solidify a shell, or add noise.'));
  mods.forEach((m, i) => {
    const def = E.MODIFIERS[m.type]; if (!def) return;
    const tools = [
      h('input', { type: 'checkbox', checked: m.enabled !== false, title: 'Enable', onchange: (e) => { m.enabled = e.target.checked; rebuild(true); } }),
      h('button', { class: 'ib flat', title: 'Move up', onclick: () => { if (i > 0) { mods.splice(i - 1, 0, mods.splice(i, 1)[0]); rebuild(true); ed.emit('selection'); } } }, '▲'),
      h('button', { class: 'ib flat', title: 'Move down', onclick: () => { if (i < mods.length - 1) { mods.splice(i + 1, 0, mods.splice(i, 1)[0]); rebuild(true); ed.emit('selection'); } } }, '▼'),
      h('button', { class: 'ib flat', title: 'Remove', onclick: () => { mods.splice(i, 1); rebuild(true); ed.emit('selection'); } }, '✕'),
    ];
    out.push(P((def.kind === 'generate' ? '⧉ ' : '∿ ') + def.label, paramWidgets(ed, m, def.params, rebuild), { tools, cls: 'mod-card', key: 'mod' + o.id + '_' + i }));
  });
  return out;
}

function materialTab(ed, o, P) {
  const out = [];
  let mat = ed.materialOf(o);
  if (o.kind === 'part') {
    const ch = o.armature.character;
    const names = [...ch.materials.keys()];
    const slot = select(names.map((n) => [n, n]), o.part.def.material, (v) => { ch.setPartMaterial(o.part, v); ed.commit('Material Slot'); ed.emit('selection'); });
    const users = ch.parts.filter((p) => p.def.material === o.part.def.material).length;
    out.push(P('Material Slot', [row('Material', slot), h('div', { class: 'hint' }, `Shared by ${users} part${users === 1 ? '' : 's'} — edits apply to all of them.`),
      h('div', { class: 'btnrow' }, h('button', { class: 'btn', onclick: () => { let n = 'Material'; let k = 1; while (ch.materials.has(n + '.' + String(k).padStart(3, '0'))) k++; n = n + '.' + String(k).padStart(3, '0'); ch.materials.set(n, new E.Material({ ...mat.toJSON(), name: n })); ch.setPartMaterial(o.part, n); ed.commit('New Material'); ed.emit('selection'); } }, '+ New (copy)'))]));
  }
  const set = (k) => (v, fin) => { mat[k] = v; if (fin) ed.commit('Material'); };
  out.push(P('Surface', [
    row('Base Color', colorField(mat.color, (v) => (mat.color = v), () => ed.commit('Material'))),
    row('Metallic', num('', () => mat.metallic, set('metallic'), { min: 0, max: 1, step: 0.01, slider: true })),
    row('Roughness', num('', () => mat.roughness, set('roughness'), { min: 0.02, max: 1, step: 0.01, slider: true })),
    row('Sheen', num('', () => mat.sheen, set('sheen'), { min: 0, max: 2, step: 0.01, slider: true })),
    row('Opacity', num('', () => mat.opacity, set('opacity'), { min: 0.05, max: 1, step: 0.01, slider: true })),
    row('', checkbox('Double sided', mat.doubleSided, (v) => { mat.doubleSided = v; ed.commit('Material'); })),
  ]));
  out.push(P('Procedural Pattern', [
    row('Pattern', select(E.PATTERNS.map((p) => [p, p[0].toUpperCase() + p.slice(1)]), mat.pattern, (v) => { mat.pattern = v; ed.commit('Material'); })),
    row('Scale', num('', () => mat.patternScale, set('patternScale'), { min: 0.1, max: 1000, step: 0.5 })),
    row('Color', colorField(mat.patternColor, (v) => (mat.patternColor = v), () => ed.commit('Material'))),
    row('Strength', num('', () => mat.patternStrength, set('patternStrength'), { min: 0, max: 2, step: 0.01, slider: true })),
    row('Bump', num('', () => mat.bump, set('bump'), { min: 0, max: 4, step: 0.05, slider: true })),
    h('div', { class: 'hint' }, 'Patterns are computed in the shader in the part’s rest space, so they stick to the surface while it deforms. Scale is repeats per metre.'),
  ]));
  out.push(P('Emission', [
    row('Color', colorField(mat.emissive, (v) => (mat.emissive = v), () => ed.commit('Material'))),
    row('Strength', num('', () => mat.emissiveStrength, set('emissiveStrength'), { min: 0, max: 30, step: 0.1 })),
  ], { closed: true }));
  return out;
}

function rigTab(ed, o, P) {
  const out = [];
  if (o.kind === 'mesh') {
    const arms = ed.objects.filter((x) => x.kind === 'armature');
    if (!arms.length) return [P('Bind to Armature', [h('div', { class: 'hint' }, 'Add an armature first (Shift A → Armature) to rig this mesh into a character part.')])];
    let target = arms[0].id, bone = '';
    const armSel = select(arms.map((a) => [String(a.id), a.character.name]), String(target), (v) => { target = +v; });
    const bones = arms[0].character.skeleton.bones.map((b) => b.name);
    const boneSel = select([['', 'Automatic (nearest bones)'], ...bones.map((b) => [b, b])], '', (v) => (bone = v));
    out.push(P('Bind to Armature', [row('Armature', armSel), row('Bone', boneSel), h('div', { class: 'hint' }, 'Turns this mesh into a part of the character. Automatic binding computes smooth weights from the nearest bone segments.'),
      h('button', { class: 'btn primary', onclick: () => ed.emit('command', { id: 'rig.bind', armId: target, bone }) }, 'Bind as Part')]));
    return out;
  }
  const arm = ed.armatureOf(o), ch = arm.character, sk = ch.skeleton;
  const boneNames = ch.def.skeleton.flatMap((b) => (b.mirror ? [b.name] : [b.name]));
  if (o.kind === 'part') {
    const d = o.part.def; d.bind = d.bind || {};
    const auto = !!(d.bind.bones && d.bind.bones.length);
    const upd = () => { ch.updatePartTransform(o.part); ed.commit('Binding'); ed.emit('selection'); };
    out.push(P('Skin Binding', [
      row('Mode', select([['rigid', 'Rigid (one bone)'], ['auto', 'Automatic weights']], auto ? 'auto' : 'rigid', (v) => { if (v === 'auto') d.bind = { bones: [d.bind.bone || boneNames[1]], falloff: 6 }; else d.bind = { bone: (d.bind.bones || [])[0] || boneNames[1] }; upd(); })),
      auto ? row('Falloff', num('', () => d.bind.falloff ?? 6, (v, fin) => { d.bind.falloff = v; ch.updatePartTransform(o.part); if (fin) ed.commit('Binding'); }, { min: 1, max: 16, step: 0.25 })) : null,
      auto ? h('div', { class: 'hint' }, 'Tick the bones this part should follow. Higher falloff keeps joints tighter; lower blends them more softly.') : row('Bone', select(boneNames.map((b) => [b, b]), d.bind.bone, (v) => { d.bind.bone = v; upd(); })),
      auto ? h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px' } }, boneNames.map((b) => checkbox(b, d.bind.bones.includes(b), (v) => { d.bind.bones = v ? [...d.bind.bones, b] : d.bind.bones.filter((x) => x !== b); if (!d.bind.bones.length) d.bind.bones = [b]; upd(); }))) : null,
      d.mirror ? h('div', { class: 'hint' }, 'Mirrored twin binds to the matching .R bones automatically.') : null,
      h('button', { class: 'btn', onclick: () => ed.emit('command', 'rig.unbind') }, 'Unbind to standalone mesh'),
    ]));
  }
  // bones list + bone editor
  const bi = ed.mode === 'pose' && ed.activeBone >= 0 ? ed.activeBone : -1;
  if (bi >= 0) {
    const b = sk.bones[bi];
    const e = E.quat.toEuler([0, 0, 0], sk.rot.subarray(bi * 4, bi * 4 + 4));
    const setRot = (i, v, fin) => { e[i] = v; sk.rot.set(E.quat.fromEuler(E.quat.create(), e[0], e[1], e[2]), bi * 4); sk.update(); ed.poseDirty = true; if (fin && ed.autoKey) { ed.insertKeys(arm, new Set([bi])); ed.commit('Auto Keyframe'); } };
    const pos = sk.pos.subarray(bi * 3, bi * 3 + 3);
    const setPos = (i, v, fin) => { pos[i] = v; sk.update(); ed.poseDirty = true; if (fin && ed.autoKey) { ed.insertKeys(arm, new Set([bi])); ed.commit('Auto Keyframe'); } };
    const clip = ed.clipOf(arm), t = ed.frame / ed.fps;
    const tr = clip && clip.track(b.name, 'rotation');
    const keyedNow = tr && tr.keys.some((k) => Math.abs(k.t - t) < 0.5 / ed.fps);
    const kcls = tr ? [0, 1, 2].map(() => (keyedNow ? 'keyed-cur' : 'keyed')) : null;
    out.push(P('Pose Bone · ' + b.name, [
      row('Rotation', vecField(['X', 'Y', 'Z'], () => e, { set: setRot, step: 0.5, unit: '°', keyed: kcls })),
      row('Location', vecField(['X', 'Y', 'Z'], () => pos, { set: setPos, step: 0.005, unit: ' m' })),
      h('div', { class: 'btnrow' }, h('button', { class: 'btn', onclick: () => ed.emit('command', 'anim.insertKey') }, '◆ Insert Keyframe (I)'), h('button', { class: 'btn', onclick: () => ed.emit('command', 'pose.clearRotation') }, 'Clear Pose')),
    ]));
  }
  const defBone = bi >= 0 ? ch.def.skeleton.find((x) => x.name === sk.bones[bi].name || (x.mirror && E.mirrorName(x.name) === sk.bones[bi].name)) : null;
  if (defBone && ed.mode === 'pose') {
    const isTwin = defBone.name !== sk.bones[bi].name;
    const setV = (key) => (i, v, fin) => { defBone[key][i] = v; if (fin) { ch.rebuildSkeleton(); ed.commit('Edit Bone'); ed.emit('selection'); } };
    out.push(P('Edit Bone (rest pose)', [
      isTwin ? h('div', { class: 'hint' }, `Mirrored from ${defBone.name}; edits apply to both sides.`) : null,
      row('Head', vecField(['X', 'Y', 'Z'], () => defBone.head, { set: setV('head'), step: 0.005, unit: ' m' })),
      row('Tail', vecField(['X', 'Y', 'Z'], () => defBone.tail, { set: setV('tail'), step: 0.005, unit: ' m' })),
      row('', checkbox('Spring (jiggle) bone', !!defBone.spring, (v) => { if (v) defBone.spring = { stiffness: 150, damping: 9, gravity: 2 }; else delete defBone.spring; ch.rebuildSkeleton(); ed.commit('Spring'); ed.emit('selection'); })),
      defBone.spring ? row('Stiffness', num('', () => defBone.spring.stiffness, (v, fin) => { defBone.spring.stiffness = v; if (fin) { ch.rebuildSkeleton(); ed.commit('Spring'); } }, { min: 5, max: 800, step: 1 })) : null,
      defBone.spring ? row('Damping', num('', () => defBone.spring.damping, (v, fin) => { defBone.spring.damping = v; if (fin) { ch.rebuildSkeleton(); ed.commit('Spring'); } }, { min: 0, max: 60, step: 0.5 })) : null,
      h('div', { class: 'btnrow' }, h('button', { class: 'btn', onclick: () => ed.emit('command', 'rig.addBone') }, '+ Extrude child bone')),
    ]));
  }
  out.push(P('Bones', [
    h('div', { class: 'hint' }, ed.mode === 'pose' ? 'Click a bone to select it. R rotates, G moves, I keys.' : 'Enter Pose Mode (Tab) to pose and edit bones.'),
    h('div', { style: { display: 'grid', gap: '1px', maxHeight: '220px', overflow: 'auto' } }, sk.bones.map((b, i) => h('div', { class: 'ol-row' + (ed.mode === 'pose' && ed.selectedBones.has(i) ? (ed.activeBone === i ? ' active' : ' sel') : ''), style: { paddingLeft: 4 + depthOf(sk, i) * 10 + 'px' }, onclick: (ev) => { if (ed.mode !== 'pose') { ed.select(arm); ed.setMode('pose'); } ed.selectBone(i, ev.shiftKey); } }, h('span', { class: 'ic arm' }, b.spring ? '〰' : '🦴'), h('span', { class: 'nm' }, b.name)))),
  ]));
  return out;
}
const depthOf = (sk, i) => { let d = 0; while (sk.parentIndex[i] >= 0) { i = sk.parentIndex[i]; d++; } return d; };

function animTab(ed, o, P) {
  const arm = ed.armatureOf(o), ch = arm.character;
  const clips = [...ch.mixer.clips.values()];
  const out = [];
  out.push(P('Actions', [
    h('div', { style: { display: 'grid', gap: '1px' } }, clips.map((c) => h('div', { class: 'ol-row' + (arm.action === c.name ? ' active' : ''), onclick: () => { arm.action = c.name; ed.setFrame(0); ed.commit('Set Action'); ed.emit('selection'); } }, h('span', { class: 'ic' }, '🎞'), h('span', { class: 'nm' }, c.name), h('span', { style: { color: '#999' } }, `${c.duration.toFixed(2)}s · ${Math.round(c.duration * ed.fps)}f`)))),
    h('div', { class: 'hint' }, 'The active action plays in the timeline. Keys you insert go into it.'),
  ]));
  const clip = ed.clipOf(arm);
  if (clip) out.push(P('Action · ' + clip.name, [
    row('Name', (() => { const i = h('input', { class: 'txt', value: clip.name, 'aria-label': 'Action name' }); i.onkeydown = (e) => e.stopPropagation(); i.onchange = () => { const n = i.value.trim(); if (!n || ch.mixer.clips.has(n)) return; ch.mixer.clips.delete(clip.name); ch.mixer.actions.delete(clip.name); clip.name = n; ch.mixer.addClip(clip); arm.action = n; ed.commit('Rename Action'); ed.emit('selection'); }; return i; })()),
    row('Length', num('', () => clip.duration, (v, fin) => { clip.duration = v; if (fin) { ed.commit('Action Length'); ed.emit('frame'); } }, { min: 0.1, max: 60, step: 0.01, unit: ' s' })),
    row('Root motion', num('Z', () => clip.rootMotion[2], (v, fin) => { clip.rootMotion[2] = v; if (fin) ed.commit('Root Motion'); }, { min: -20, max: 20, step: 0.01, unit: ' m/s' })),
    row('', checkbox('Loop (cyclic, seamless)', clip.loop, (v) => { clip.loop = v; ed.commit('Loop'); })),
    row('Sync group', (() => { const i = h('input', { class: 'txt', value: clip.syncGroup || '', placeholder: 'e.g. locomotion', 'aria-label': 'Sync group' }); i.onkeydown = (e) => e.stopPropagation(); i.onchange = () => { clip.syncGroup = i.value.trim() || null; ed.commit('Sync Group'); }; return i; })()),
    h('div', { class: 'hint' }, 'Clips in the same sync group keep their normalized phase when crossfading, so feet stay in step between Walk and Run.'),
  ]));
  // Motion synthesizer (twist): generate new gait clips procedurally
  const hasRig = ['hips', 'thigh.L', 'shin.L', 'foot.L', 'toe.L', 'upperArm.L', 'foreArm.L', 'hand.L'].every((n) => ch.skeleton.boneIndex(n) >= 0);
  const S = ed.uiState.synth || (ed.uiState.synth = { kind: 'walk', speed: 1.15, duration: 1.06, stance: 0.6, hipHeight: 0.94, lean: 3, armSwing: 18, bob: 0.018, stepWidth: 0.105 });
  const presets = { walk: { speed: 1.15, duration: 1.06, stance: 0.6, hipHeight: 0.94, lean: 3, armSwing: 18, bob: 0.018, stepWidth: 0.105 }, swagger: { speed: 0.9, duration: 1.3, stance: 0.62, hipHeight: 0.93, lean: -3, armSwing: 26, bob: 0.03, stepWidth: 0.14 }, sneak: { speed: 0.6, duration: 1.5, stance: 0.66, hipHeight: 0.84, lean: 14, armSwing: 6, bob: 0.01, stepWidth: 0.12 }, jog: { speed: 2.2, duration: 0.8, stance: 0.42, hipHeight: 0.93, lean: 7, armSwing: 30, bob: 0.03, stepWidth: 0.095 } };
  const snum = (k, label, min, max, step, unit = '') => row(label, num('', () => S[k], (v) => (S[k] = v), { min, max, step, unit, slider: true }));
  out.push(P('✨ Motion Synth', hasRig ? [
    h('div', { class: 'hint' }, 'Generates a new, editable gait action with IK-planted feet. Style presets fill the sliders; tweak and generate.'),
    row('Style', select([['walk', 'Walk'], ['swagger', 'Cowboy swagger'], ['sneak', 'Sneak'], ['jog', 'Jog'], ['crawl', 'Crawl'], ['idle', 'Idle']], S.kind, (v) => { S.kind = v; if (presets[v]) Object.assign(S, presets[v]); ed.emit('selection'); })),
    ...(S.kind === 'crawl' || S.kind === 'idle' ? [] : [snum('speed', 'Speed', 0.2, 5, 0.05, ' m/s'), snum('duration', 'Cycle', 0.4, 2.5, 0.01, ' s'), snum('stance', 'Stance', 0.3, 0.75, 0.01), snum('hipHeight', 'Hip height', 0.75, 1.0, 0.005, ' m'), snum('lean', 'Lean', -15, 25, 0.5, '°'), snum('armSwing', 'Arm swing', 0, 50, 0.5, '°'), snum('bob', 'Bounce', 0, 0.06, 0.001, ' m'), snum('stepWidth', 'Step width', 0.05, 0.2, 0.005, ' m')]),
    h('button', { class: 'btn primary', onclick: () => ed.emit('command', 'anim.synth') }, 'Generate Action'),
  ] : [h('div', { class: 'hint' }, 'Motion Synth needs a humanoid rig (hips, thigh.L, shin.L, foot.L, toe.L, upperArm.L, foreArm.L, hand.L and their .R twins). Add one with Shift A → Armature → Humanoid Rig.')]));
  return out;
}
