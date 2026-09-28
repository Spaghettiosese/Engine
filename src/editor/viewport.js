// 3D viewport: rendering, picking, Blender-style navigation and modal G/R/S transforms,
// a move gizmo, the axis navigation gizmo, bones overlay and onion skinning.
import * as E from '../engine/index.js';
import { toast } from './widgets.js';

const { vec3, quat, mat4, DEG } = E;
const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const AXIS_COL = { x: [0.95, 0.25, 0.3, 1], y: [0.45, 0.8, 0.2, 1], z: [0.25, 0.5, 1, 1] };

export class Viewport {
  constructor(ed, canvas, overlay) {
    this.ed = ed; this.canvas = canvas; this.overlay = overlay;
    this.renderer = new E.Renderer(canvas, { preserveDrawingBuffer: true });
    this.renderer.settings.vignette = 0.2;
    this.camera = new E.Camera();
    this.camera.position.set([4.2, 2.8, 5.4]); this.camera.target.set([0, 0.95, 0]);
    this.controls = new E.OrbitControls(this.camera, canvas);
    this.controls.distance = 5.2; this.controls.yaw = 0.62; this.controls.pitch = 0.3; this.controls.apply();
    this.boneGeo = E.boneGeometry();
    this.gizmoGeo = { cone: E.cone({ radius: 0.06, height: 0.2, radialSegments: 12 }), cube: E.box({ width: 0.1, height: 0.1, depth: 0.1 }), ball: E.sphere({ radius: 0.07, widthSegments: 12, heightSegments: 8 }) };
    this.modal = null;
    this.mouse = [0, 0];
    this.viewName = 'User Perspective';
    this.ghostPosers = new WeakMap();
    this._bindInput();
  }
  get rect() { return this.canvas.getBoundingClientRect(); }

  // ---------------------------------------------------------------- projection helpers
  toScreen(p) {
    const v = vec3.transformMat4([0, 0, 0], p, this.camera.viewProj), r = this.rect;
    return [(v[0] * 0.5 + 0.5) * r.width, (1 - (v[1] * 0.5 + 0.5)) * r.height, v[2]];
  }
  pixelsPerUnit(p) {
    const s = this.camera.ortho ? this.camera.orthoSize * 2 : 2 * vec3.dist(this.camera.position, p) * Math.tan(this.camera.fov / 2);
    return this.rect.height / s;
  }
  viewDir() { return vec3.normalize([0, 0, 0], vec3.sub([0, 0, 0], this.camera.target, this.camera.position)); }

  // world pivot of an editor object (or selected bones in pose mode)
  pivotOf(o) {
    if (o.kind === 'part') { const p = o.part.def.position || [0, 0, 0]; return vec3.transformMat4([0, 0, 0], p, o.armature.character.world); }
    return mat4.getTranslation([0, 0, 0], o.node.world);
  }
  selectionPivot() {
    const ed = this.ed;
    if (ed.mode === 'pose' && ed.selectedBones.size) {
      const arm = ed.poseArmature, sk = arm.character.skeleton, acc = [0, 0, 0];
      for (const i of ed.selectedBones) vec3.add(acc, acc, sk.worldHead(i));
      vec3.scale(acc, acc, 1 / ed.selectedBones.size);
      return vec3.transformMat4(acc, acc, arm.character.world);
    }
    const list = [...ed.selection]; if (!list.length) return null;
    const acc = [0, 0, 0]; list.forEach((o) => vec3.add(acc, acc, this.pivotOf(o)));
    return vec3.scale(acc, acc, 1 / list.length);
  }

  // ---------------------------------------------------------------- rendering
  render(dt) {
    const ed = this.ed;
    this.controls.update(dt);
    const selMeshes = new Set();
    if (ed.overlays.outline && ed.mode === 'object') for (const o of ed.selection) for (const m of ed.meshesOf(o)) if (m.visible) selMeshes.add(m);
    const activeMeshes = ed.active && ed.mode === 'object' ? ed.meshesOf(ed.active) : [];
    const lines = [], overlayMeshes = [];
    // armature bones
    for (const o of ed.objects) {
      if (o.kind !== 'armature' || o.hidden) continue;
      const sk = o.character.skeleton, W = o.character.world;
      const inPose = ed.poseArmature === o;
      const showBones = inPose || (ed.overlays.bones && ed.selection.has(o));
      if (!showBones) continue;
      for (let i = 0; i < sk.length; i++) {
        const sel = inPose && ed.selectedBones.has(i), act = inPose && ed.activeBone === i;
        const col = act ? [1, 0.75, 0.4, 0.9] : sel ? [0.35, 0.65, 1, 0.9] : sk.bones[i].spring ? [0.85, 0.5, 0.95, 0.6] : [0.75, 0.75, 0.75, inPose ? 0.55 : 0.35];
        const onTop = inPose || ed.xray;
        overlayMeshes.push({ geometry: this.boneGeo, matrix: E.boneMatrix(sk, i, W), color: col, depthTest: !onTop, shading: 'solid' });
        overlayMeshes.push({ geometry: this.boneGeo, matrix: E.boneMatrix(sk, i, W), color: [0, 0, 0, 0.6], depthTest: !onTop, wire: true, shading: 'flat' });
      }
    }
    // 3D cursor-ish origin marks for selected objects
    if (ed.mode === 'object') for (const o of ed.selection) { const p = this.pivotOf(o); const s = 0.03; lines.push(...cross(p, s, o === ed.active ? [1, 0.7, 0.3, 1] : [1, 0.45, 0.1, 1])); }
    // gizmo
    const piv = this.selectionPivot();
    this.gizmo = null;
    if (piv && !this.modal && (ed.tool === 'move' || ed.tool === 'rotate' || ed.tool === 'scale')) this.gizmo = this._gizmo(piv, lines, overlayMeshes);
    if (this.modal && this.modal.axis) {
      const p = this.modal.pivot, a = this.modal.axisVec, L = 1000;
      lines.push(p[0] - a[0] * L, p[1] - a[1] * L, p[2] - a[2] * L, ...AXIS_COL[this.modal.axis], p[0] + a[0] * L, p[1] + a[1] * L, p[2] + a[2] * L, ...AXIS_COL[this.modal.axis]);
    }
    // onion skins
    const ghosts = [];
    if (ed.onion) for (const o of ed.objects) {
      const clip = ed.clipOf(o); if (!clip || o.hidden) continue;
      let gp = this.ghostPosers.get(o.character.skeleton);
      if (!gp || gp.sk.length !== o.character.skeleton.length) { gp = new E.GhostPoser(o.character.skeleton); this.ghostPosers.set(o.character.skeleton, gp); }
      const meshes = o.parts.flatMap((p) => p.part.meshes);
      const T = clip.duration, t = ed.frame / ed.fps;
      for (const [d, col] of [[-6, [1, 0.4, 0.25, 0.8]], [-3, [1, 0.55, 0.3, 0.5]], [3, [0.3, 0.75, 1, 0.5]], [6, [0.3, 0.6, 1, 0.8]]]) {
        const tt = clip.loop ? (((t + d / ed.fps) % T) + T) % T : Math.max(0, Math.min(T, t + d / ed.fps));
        ghosts.push({ meshes, joints: gp.joints(clip, tt), color: [col[0], col[1], col[2], col[3] * 0.6] });
      }
    }
    this.ghostCount = ghosts.length;
    const shading = ed.shading;
    ed.ground.visible = ed.world.ground !== false && (shading === 'rendered' || shading === 'material');
    this.renderer.settings.bloom = ed.world.bloom;
    this.scene = ed.scene;
    ed.scene.environment.shadowCenter = [this.camera.target[0], 0.8, this.camera.target[2]];
    ed.scene.environment.shadowRadius = Math.max(3, Math.min(20, this.controls.distance * 0.9));
    this.renderer.render(ed.scene, this.camera, {
      shading, xray: ed.xray, grid: ed.overlays.grid && shading !== 'rendered', background: shading === 'rendered' && ed.world.sky ? 'sky' : 'editor', fog: shading === 'rendered',
      selected: selMeshes, active: activeMeshes[0], wireOverlay: ed.overlays.wire, overlayMeshes, ghosts,
      lines: [{ data: new Float32Array(lines), depthTest: false }],
      shadows: shading === 'rendered',
    });
    this._drawOverlay2D();
  }

  _gizmo(p, lines, meshes) {
    const ed = this.ed, s = 90 / this.pixelsPerUnit(p);
    const g = { pivot: p, size: s, handles: [] };
    for (const ax of ['x', 'y', 'z']) {
      const a = AXES[ax], col = AXIS_COL[ax], end = vec3.scaleAdd([0, 0, 0], p, a, s);
      if (ed.tool === 'rotate') {
        const pts = [], ring = [];
        const u = ax === 'x' ? [0, 1, 0] : [1, 0, 0], w = vec3.cross([0, 0, 0], a, u);
        for (let k = 0; k <= 48; k++) { const t = (k / 48) * Math.PI * 2; const q = [p[0] + (u[0] * Math.cos(t) + w[0] * Math.sin(t)) * s * 0.9, p[1] + (u[1] * Math.cos(t) + w[1] * Math.sin(t)) * s * 0.9, p[2] + (u[2] * Math.cos(t) + w[2] * Math.sin(t)) * s * 0.9]; ring.push(q); }
        for (let k = 0; k < 48; k++) pts.push(...ring[k], ...col, ...ring[k + 1], ...col);
        lines.push(...pts);
        g.handles.push({ axis: ax, ring });
      } else {
        lines.push(...p, ...col, ...end, ...col);
        const rot = quat.rotationTo(quat.create(), [0, 1, 0], a);
        const m = mat4.fromRTS(mat4.create(), rot, end, [s, s, s]);
        meshes.push({ geometry: ed.tool === 'scale' ? this.gizmoGeo.cube : this.gizmoGeo.cone, matrix: m, color: col, depthTest: false, shading: 'flat' });
        g.handles.push({ axis: ax, from: p, to: end });
      }
    }
    meshes.push({ geometry: this.gizmoGeo.ball, matrix: mat4.fromRTS(mat4.create(), quat.create(), p, [s * 0.6, s * 0.6, s * 0.6]), color: [1, 1, 1, 0.35], depthTest: false, shading: 'flat' });
    return g;
  }
  _gizmoHit(x, y) {
    const g = this.gizmo; if (!g) return null;
    let best = null, bd = 10;
    for (const h of g.handles) {
      if (h.ring) {
        for (let k = 0; k < h.ring.length - 1; k++) { const d = segDist([x, y], this.toScreen(h.ring[k]), this.toScreen(h.ring[k + 1])); if (d < bd) { bd = d; best = h.axis; } }
      } else { const d = segDist([x, y], this.toScreen(h.from), this.toScreen(h.to)); if (d < bd) { bd = d; best = h.axis; } }
    }
    if (best) return best;
    const c = this.toScreen(g.pivot);
    if (Math.hypot(x - c[0], y - c[1]) < 14) return 'free';
    return null;
  }

  _drawOverlay2D() {
    const c = this.overlay, r = this.rect, dpr = Math.min(devicePixelRatio || 1, 2);
    if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
    if (this.modal && (this.modal.type === 'R' || this.modal.type === 'S')) {
      const p = this.toScreen(this.modal.pivot);
      g.strokeStyle = 'rgba(255,255,255,.8)'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(this.mouse[0], this.mouse[1]); g.stroke(); g.setLineDash([]);
    }
    if (this.boxSel) { const b = this.boxSel; g.strokeStyle = '#fff'; g.setLineDash([3, 3]); g.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); g.setLineDash([]); }
    this._drawNavGizmo();
  }
  _drawNavGizmo() {
    const c = document.getElementById('navGizmo'); if (!c) return;
    const g = c.getContext('2d'), W = c.width, cx = W / 2, R = W * 0.36;
    g.clearRect(0, 0, W, W);
    if (this.navHover) { g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.arc(cx, cx, W / 2 - 2, 0, Math.PI * 2); g.fill(); }
    const V = this.camera.view;
    const items = [];
    for (const [ax, dir] of Object.entries(AXES)) for (const sgn of [1, -1]) {
      const d = vec3.transformDir([0, 0, 0], [dir[0] * sgn, dir[1] * sgn, dir[2] * sgn], V);
      items.push({ ax, sgn, x: cx + d[0] * R, y: cx - d[1] * R, z: d[2] });
    }
    items.sort((a, b) => a.z - b.z);
    this.navItems = items;
    for (const it of items) {
      const col = AXIS_COL[it.ax], css = `rgb(${col.slice(0, 3).map((v) => Math.round(v * 255)).join(',')})`;
      if (it.sgn > 0) { g.strokeStyle = css; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cx); g.lineTo(it.x, it.y); g.stroke(); }
      g.fillStyle = it.sgn > 0 ? css : `rgba(${col.slice(0, 3).map((v) => Math.round(v * 255)).join(',')},0.35)`;
      g.beginPath(); g.arc(it.x, it.y, it.sgn > 0 ? 13 : 11, 0, Math.PI * 2); g.fill();
      if (it.sgn > 0) { g.fillStyle = '#111'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(it.ax.toUpperCase(), it.x, it.y + 1); }
    }
  }

  // ---------------------------------------------------------------- views
  setView(name) {
    const V = { front: [0, 0], back: [180, 0], right: [90, 0], left: [-90, 0], top: [0, 89.99], bottom: [0, -89.99] }[name];
    if (!V) return;
    this.controls.animateTo({ yaw: V[0] * DEG, pitch: V[1] * DEG });
    this.camera.ortho = true; this.camera.orthoSize = Math.tan(this.camera.fov / 2) * this.controls.distance;
    this.viewName = name[0].toUpperCase() + name.slice(1) + ' Orthographic';
  }
  togglePersp() {
    this.camera.ortho = !this.camera.ortho;
    if (this.camera.ortho) this.camera.orthoSize = Math.tan(this.camera.fov / 2) * this.controls.distance;
    this.viewName = this.camera.ortho ? 'User Orthographic' : 'User Perspective';
  }
  frameSelected(all = false) {
    const ed = this.ed;
    const meshes = all ? ed.allObjects().flatMap((o) => (o.kind === 'armature' ? [] : ed.meshesOf(o))) : [...ed.selection].flatMap((o) => ed.meshesOf(o));
    if (ed.mode === 'pose' && ed.selectedBones.size && !all) { const p = this.selectionPivot(); this.controls.animateTo({ target: p, distance: 1.2 }); return; }
    if (!meshes.length) { if (!all) return this.frameSelected(true); return; }
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const m of meshes) {
      const b = m.geometry.bounds();
      const M = m.skinRoot ? mat4.multiply(mat4.create(), m.skinRoot.world, m.local) : m.world;
      for (const cx of [b.min[0], b.max[0]]) for (const cy of [b.min[1], b.max[1]]) for (const cz of [b.min[2], b.max[2]]) {
        const p = vec3.transformMat4([0, 0, 0], [cx, cy, cz], M);
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
      }
    }
    const c = min.map((v, k) => (v + max[k]) / 2), rad = Math.max(0.05, vec3.dist(min, max) / 2);
    const d = rad / Math.sin(this.camera.fov / 2) * 1.1;
    this.controls.animateTo({ target: c, distance: d });
    if (this.camera.ortho) this.camera.orthoSize = rad * 1.2;
  }

  // ---------------------------------------------------------------- picking
  pickAt(x, y) {
    const ed = this.ed, items = [], map = new Map();
    let id = 1;
    if (ed.mode === 'pose') {
      const arm = ed.poseArmature, sk = arm.character.skeleton;
      for (let i = 0; i < sk.length; i++) { map.set(id, { bone: i }); items.push({ geometry: this.boneGeo, matrix: E.boneMatrix(sk, i, arm.character.world), id: id++, onTop: true }); }
    } else {
      for (const o of ed.allObjects()) {
        if (o.kind === 'armature' || ed.isHidden(o) || (o.kind === 'part' && o.armature.hidden)) continue;
        for (const m of ed.meshesOf(o)) { if (!m.visible) continue; map.set(id, { obj: o }); items.push({ mesh: m, id: id++ }); }
      }
      // armatures without visible parts are pickable through their bones
      for (const o of ed.objects) if (o.kind === 'armature' && !o.hidden && (ed.selection.has(o) || !o.parts.length)) {
        const sk = o.character.skeleton;
        for (let i = 0; i < sk.length; i++) { map.set(id, { obj: o }); items.push({ geometry: this.boneGeo, matrix: E.boneMatrix(sk, i, o.character.world), id: id++, onTop: true }); }
      }
    }
    ed.scene.updateWorld();
    return map.get(this.renderer.pick(this.camera, x, y, items)) || null;
  }

  // ---------------------------------------------------------------- modal transform (G / R / S)
  startModal(type, { axis = null, fromDrag = false } = {}) {
    const ed = this.ed;
    if (this.modal) return;
    const pose = ed.mode === 'pose';
    if (pose && !ed.selectedBones.size) return toast('Select a bone first');
    if (!pose && !ed.selection.size) return toast('Nothing selected');
    if (pose && type === 'S') return toast('Bones rotate and move; scale the parts instead');
    const pivot = this.selectionPivot();
    const m = { type, pose, pivot, axis: null, axisVec: null, start: [...this.mouse], num: '', fromDrag, targets: [] };
    if (pose) {
      const arm = ed.poseArmature, sk = arm.character.skeleton;
      m.arm = arm;
      m.snap = sk.snapshotPose();
      m.bones = [...ed.selectedBones].filter((i) => !(type === 'G' && sk.bones[i].spring));
      // only move top-most selected bones for G (children follow)
    } else {
      for (const o of ed.selection) { const t = ed.xf(o); m.targets.push({ o, pos: [...t.position], rot: [...t.rotation], scale: [...t.scale], pivot: this.pivotOf(o) }); }
      // parts under an armature transform in the armature's local frame
    }
    this.modal = m;
    if (axis) this.setAxis(axis);
    this._updateModal();
    ed.emit('modal');
  }
  setAxis(ax) {
    const m = this.modal; if (!m) return;
    m.axis = m.axis === ax ? null : ax;
    m.axisVec = m.axis ? AXES[m.axis] : null;
    this._updateModal();
  }
  _modalValue() {
    const m = this.modal, cam = this.camera;
    const piv = this.toScreen(m.pivot), mx = this.mouse[0], my = this.mouse[1];
    const ppu = this.pixelsPerUnit(m.pivot);
    const typed = m.num !== '' && m.num !== '-' && Number.isFinite(parseFloat(m.num)) ? parseFloat(m.num) : null;
    if (m.type === 'G') {
      if (m.axisVec) {
        const a2 = this.toScreen(vec3.add([0, 0, 0], m.pivot, m.axisVec));
        let d = [a2[0] - piv[0], a2[1] - piv[1]]; const len = Math.hypot(d[0], d[1]) || 1; d = [d[0] / len, d[1] / len];
        const amt = typed !== null ? typed : ((mx - m.start[0]) * d[0] + (my - m.start[1]) * d[1]) / len;
        return { delta: vec3.scale([0, 0, 0], m.axisVec, amt), display: `D: ${amt.toFixed(4)} m (${m.axis.toUpperCase()})` };
      }
      const right = vec3.normalize([0, 0, 0], vec3.cross([0, 0, 0], this.viewDir(), cam.up));
      const up = vec3.cross([0, 0, 0], right, this.viewDir());
      const dx = (mx - m.start[0]) / ppu, dy = -(my - m.start[1]) / ppu;
      const delta = [right[0] * dx + up[0] * dy, right[1] * dx + up[1] * dy, right[2] * dx + up[2] * dy];
      return { delta, display: `D: ${delta.map((v) => v.toFixed(3)).join('  ')} m` };
    }
    if (m.type === 'R') {
      const a0 = Math.atan2(-(m.start[1] - piv[1]), m.start[0] - piv[0]), a1 = Math.atan2(-(my - piv[1]), mx - piv[0]);
      let ang = typed !== null ? typed * DEG : a1 - a0;
      let axis;
      if (m.axisVec) { axis = [...m.axisVec]; if (vec3.dot(axis, this.viewDir()) > 0) ang = typed !== null ? ang : -ang; }
      else axis = vec3.scale([0, 0, 0], this.viewDir(), -1);
      return { axis, angle: ang, display: `Rot: ${(ang / DEG).toFixed(2)}°` + (m.axis ? ` (${m.axis.toUpperCase()})` : '') };
    }
    const d0 = Math.hypot(m.start[0] - piv[0], m.start[1] - piv[1]) || 1, d1 = Math.hypot(mx - piv[0], my - piv[1]);
    const f = typed !== null ? typed : d1 / d0;
    return { factor: f, display: `Scale: ${f.toFixed(4)}` + (m.axis ? ` (${m.axis.toUpperCase()})` : '') };
  }
  _updateModal() {
    const m = this.modal, ed = this.ed; if (!m) return;
    const v = this._modalValue();
    m.display = v.display + (m.num ? `  [${m.num}]` : '');
    if (m.pose) {
      const arm = m.arm, ch = arm.character, sk = ch.skeleton;
      sk.copyPose(m.snap); sk.update();
      const invW = mat4.invert(mat4.create(), ch.world);
      const wRot = mat4.getRotation(quat.create(), ch.world);
      for (const i of m.bones) {
        const p = sk.parentIndex[i];
        const pr = p >= 0 ? sk.worldRotation(p) : quat.create();
        if (m.type === 'R') {
          const axisModel = vec3.transformQuat([0, 0, 0], v.axis, quat.invert(quat.create(), wRot));
          const dq = quat.setAxisAngle(quat.create(), vec3.normalize(axisModel, axisModel), v.angle);
          const cur = sk.worldRotation(i);
          const nw = quat.multiply(quat.create(), dq, cur);
          const local = quat.multiply(quat.create(), quat.invert(quat.create(), pr), nw);
          sk.rot.set(quat.normalize(local, local), i * 4);
        } else if (m.type === 'G') {
          const dModel = vec3.transformDir([0, 0, 0], v.delta, invW);
          const dLocal = vec3.transformQuat([0, 0, 0], dModel, quat.invert(quat.create(), pr));
          const base = m.snap.pos.subarray(i * 3, i * 3 + 3);
          sk.pos.set([base[0] + dLocal[0], base[1] + dLocal[1], base[2] + dLocal[2]], i * 3);
        }
        sk.update();
      }
      ed.poseDirty = true;
    } else {
      for (const t of m.targets) {
        const o = t.o, x = ed.xf(o);
        // parts live in the armature's space
        const parentW = o.kind === 'part' ? o.armature.character.world : mat4.create();
        const invP = mat4.invert(mat4.create(), parentW), pRot = mat4.getRotation(quat.create(), parentW);
        x.position = [...t.pos]; x.rotation = [...t.rot]; x.scale = [...t.scale];
        if (m.type === 'G') {
          const d = vec3.transformDir([0, 0, 0], v.delta, invP);
          x.position = [t.pos[0] + d[0], t.pos[1] + d[1], t.pos[2] + d[2]];
        } else if (m.type === 'R') {
          const axL = vec3.normalize([0, 0, 0], vec3.transformQuat([0, 0, 0], v.axis, quat.invert(quat.create(), pRot)));
          const dq = quat.setAxisAngle(quat.create(), axL, v.angle);
          const q0 = quat.fromEuler(quat.create(), ...t.rot);
          const q1 = quat.multiply(quat.create(), dq, q0);
          x.rotation = Array.from(quat.toEuler([0, 0, 0], q1)).map((a) => Math.round(a * 1e3) / 1e3);
          // orbit around the shared pivot when several objects are selected
          if (m.targets.length > 1) {
            const pivL = vec3.transformMat4([0, 0, 0], m.pivot, invP);
            const off = vec3.sub([0, 0, 0], t.pos, pivL);
            vec3.transformQuat(off, off, dq);
            x.position = [pivL[0] + off[0], pivL[1] + off[1], pivL[2] + off[2]];
          }
        } else if (m.type === 'S') {
          const f = v.factor;
          if (m.axis) { const k = { x: 0, y: 1, z: 2 }[m.axis]; x.scale[k] = t.scale[k] * f; }
          else x.scale = t.scale.map((s) => s * f);
          if (m.targets.length > 1) { const pivL = vec3.transformMat4([0, 0, 0], m.pivot, invP); x.position = t.pos.map((p, k) => pivL[k] + (p - pivL[k]) * (m.axis ? ({ x: 0, y: 1, z: 2 }[m.axis] === k ? f : 1) : f)); }
        }
        ed.applyTransform(o);
      }
    }
    ed.emit('modal');
  }
  confirmModal() {
    const m = this.modal; if (!m) return;
    this.modal = null;
    const ed = this.ed;
    if (m.pose) {
      if (ed.autoKey) { ed.insertKeys(m.arm, new Set(m.bones)); ed.commit('Auto Keyframe'); }
      else toast('Pose changed — press I to keyframe it', 1600);
    } else ed.commit({ G: 'Move', R: 'Rotate', S: 'Scale' }[m.type]);
    ed.emit('modal'); ed.emit('selection');
  }
  cancelModal() {
    const m = this.modal; if (!m) return;
    this.modal = null;
    const ed = this.ed;
    if (m.pose) { const sk = m.arm.character.skeleton; sk.copyPose(m.snap); sk.update(); }
    else for (const t of m.targets) { const x = ed.xf(t.o); x.position = t.pos; x.rotation = t.rot; x.scale = t.scale; ed.applyTransform(t.o); }
    ed.emit('modal');
  }

  // ---------------------------------------------------------------- input
  _bindInput() {
    const c = this.canvas, ed = this.ed;
    c.addEventListener('pointermove', (e) => {
      const r = this.rect; this.mouse = [e.clientX - r.left, e.clientY - r.top];
      if (this.modal) this._updateModal();
      if (this.drag && this.drag.kind === 'gizmo' && !this.modal) {
        if (Math.hypot(this.mouse[0] - this.drag.x, this.mouse[1] - this.drag.y) > 3) {
          const type = ed.tool === 'rotate' ? 'R' : ed.tool === 'scale' ? 'S' : 'G';
          this.mouse = [this.drag.x, this.drag.y];
          this.startModal(type, { axis: this.drag.axis === 'free' ? null : this.drag.axis, fromDrag: true });
          this.mouse = [e.clientX - r.left, e.clientY - r.top]; this._updateModal();
        }
      }
      if (this.boxSel) { this.boxSel.x1 = this.mouse[0]; this.boxSel.y1 = this.mouse[1]; }
    });
    c.addEventListener('pointerdown', (e) => {
      c.focus?.();
      const r = this.rect; this.mouse = [e.clientX - r.left, e.clientY - r.top];
      if (this.modal) {
        e.preventDefault();
        if (e.button === 0) this.confirmModal(); else if (e.button === 2) this.cancelModal();
        return;
      }
      if (e.button !== 0 || e.altKey) return;
      const gh = this._gizmoHit(this.mouse[0], this.mouse[1]);
      if (gh) { this.drag = { kind: 'gizmo', axis: gh, x: this.mouse[0], y: this.mouse[1] }; c.setPointerCapture(e.pointerId); return; }
      this.drag = { kind: 'click', x: this.mouse[0], y: this.mouse[1], shift: e.shiftKey, ctrl: e.ctrlKey };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointerup', (e) => {
      const d = this.drag; this.drag = null;
      if (this.modal && this.modal.fromDrag && e.button === 0) { this.confirmModal(); return; }
      if (!d || d.kind !== 'click') return;
      if (this.boxSel) { this._finishBox(d.shift); return; }
      const hit = this.pickAt(d.x, d.y);
      if (ed.mode === 'pose') { ed.selectBone(hit && hit.bone !== undefined ? hit.bone : -1, d.shift); }
      else ed.select(hit ? hit.obj : null, { extend: d.shift, toggle: d.shift });
    });
    c.addEventListener('pointermove', (e) => {
      if (this.drag && this.drag.kind === 'click' && !this.boxSel && (e.buttons & 1) && Math.hypot(this.mouse[0] - this.drag.x, this.mouse[1] - this.drag.y) > 6) this.boxSel = { x0: this.drag.x, y0: this.drag.y, x1: this.mouse[0], y1: this.mouse[1] };
    });
    c.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!this.modal) this.ed.emit('contextmenu', e); });
    // nav gizmo: click axis bubble to align, drag to orbit
    const ng = document.getElementById('navGizmo');
    let ngDrag = null;
    ng.addEventListener('pointerenter', () => (this.navHover = true));
    ng.addEventListener('pointerleave', () => (this.navHover = false));
    ng.addEventListener('pointerdown', (e) => { ngDrag = { x: e.clientX, y: e.clientY, moved: false }; ng.setPointerCapture(e.pointerId); });
    ng.addEventListener('pointermove', (e) => {
      if (!ngDrag) return;
      const dx = e.clientX - ngDrag.x, dy = e.clientY - ngDrag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) { ngDrag.moved = true; this.controls.rotate(-dx * 0.01, dy * 0.01); ngDrag.x = e.clientX; ngDrag.y = e.clientY; if (this.camera.ortho) this.viewName = 'User Orthographic'; }
    });
    ng.addEventListener('pointerup', (e) => {
      if (ngDrag && !ngDrag.moved && this.navItems) {
        const rr = ng.getBoundingClientRect(), sx = ng.width / rr.width;
        const x = (e.clientX - rr.left) * sx, y = (e.clientY - rr.top) * sx;
        const hit = [...this.navItems].reverse().find((it) => Math.hypot(it.x - x, it.y - y) < 14);
        if (hit) this.setView({ 'x1': 'right', 'x-1': 'left', 'y1': 'top', 'y-1': 'bottom', 'z1': 'front', 'z-1': 'back' }[hit.ax + hit.sgn]);
      }
      ngDrag = null;
    });
    const dragBtn = (id, fn) => {
      const b = document.getElementById(id); let last = null;
      b.addEventListener('pointerdown', (e) => { last = [e.clientX, e.clientY]; b.setPointerCapture(e.pointerId); });
      b.addEventListener('pointermove', (e) => { if (!last) return; fn(e.clientX - last[0], e.clientY - last[1]); last = [e.clientX, e.clientY]; });
      b.addEventListener('pointerup', () => (last = null));
    };
    dragBtn('navZoom', (dx, dy) => this.controls.zoom(Math.exp(dy * 0.01)));
    dragBtn('navPan', (dx, dy) => this.controls.pan(dx, dy));
    document.getElementById('navPersp').onclick = () => this.togglePersp();
  }
  _finishBox(extend) {
    const b = this.boxSel; this.boxSel = null;
    const ed = this.ed, x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
    const inside = (p) => { const s = this.toScreen(p); return s[0] >= x0 && s[0] <= x1 && s[1] >= y0 && s[1] <= y1 && s[2] < 1; };
    if (ed.mode === 'pose') {
      const arm = ed.poseArmature, sk = arm.character.skeleton;
      if (!extend) ed.selectedBones.clear();
      for (let i = 0; i < sk.length; i++) if (inside(vec3.transformMat4([0, 0, 0], sk.worldHead(i), arm.character.world))) { ed.selectedBones.add(i); ed.activeBone = i; }
      ed.emit('selection');
      return;
    }
    if (!extend) ed.selection.clear();
    let last = null;
    for (const o of ed.allObjects()) { if (o.kind === 'armature' || ed.isHidden(o)) continue; if (inside(this.pivotOf(o))) { ed.selection.add(o); last = o; } }
    ed.active = last || ([...ed.selection][0] ?? null);
    ed.emit('selection');
  }
  // keys routed from the global handler while a modal op is running
  modalKey(e) {
    const m = this.modal; if (!m) return false;
    const k = e.key;
    if (k === 'Escape') { this.cancelModal(); return true; }
    if (k === 'Enter' || k === ' ') { this.confirmModal(); return true; }
    if (/^[xyzXYZ]$/.test(k)) { this.setAxis(k.toLowerCase()); return true; }
    if (/^[0-9.]$/.test(k) || k === '-') { if (k === '-' && m.num) m.num = m.num.startsWith('-') ? m.num.slice(1) : '-' + m.num; else m.num += k; this._updateModal(); return true; }
    if (k === 'Backspace') { m.num = m.num.slice(0, -1); this._updateModal(); return true; }
    if ('gGrRsS'.includes(k)) { const t = k.toUpperCase(); if (t !== m.type && !(m.pose && t === 'S')) { const ax = m.axis; this.cancelModal(); this.startModal(t, { axis: ax }); } return true; }
    return true;
  }
}

function cross(p, s, col) { const o = []; for (let k = 0; k < 3; k++) { const d = [0, 0, 0]; d[k] = s; o.push(p[0] - d[0], p[1] - d[1], p[2] - d[2], ...col, p[0] + d[0], p[1] + d[1], p[2] + d[2], ...col); } return o; }
function segDist(p, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1], l2 = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / l2));
  return Math.hypot(p[0] - a[0] - abx * t, p[1] - a[1] - aby * t);
}
