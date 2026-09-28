// Dope Sheet / Timeline: playback controls, frame ruler, keyframe diamonds, key dragging.
import { h, select, toast } from './widgets.js';
import { INTERP } from '../engine/animation.js';

const ROW = 20, RULER = 22;

export class Timeline {
  constructor(ed, header, channels, canvas) {
    this.ed = ed; this.header = header; this.channels = channels; this.canvas = canvas;
    this.view = { start: -2, pxPerFrame: 12 };
    this.selKeys = new Set(); // "bone|time"
    this.scrollY = 0;
    this.hover = false;
    this._bind();
  }
  get arm() { return this.ed.activeArmature; }
  get clip() { return this.ed.clipOf(this.arm); }
  rows() {
    const clip = this.clip; if (!clip) return [];
    const bones = [...new Set(clip.tracks.map((t) => t.bone))];
    const sk = this.arm.character.skeleton;
    bones.sort((a, b) => sk.boneIndex(a) - sk.boneIndex(b));
    return bones;
  }
  fitView() {
    const w = this.canvas.clientWidth || 600, end = this.ed.endFrame;
    this.view.pxPerFrame = Math.max(2, (w - 40) / (end + 4));
    this.view.start = -2;
  }
  frameToX(f) { return (f - this.view.start) * this.view.pxPerFrame; }
  xToFrame(x) { return x / this.view.pxPerFrame + this.view.start; }

  renderHeader() {
    const ed = this.ed, arm = this.arm, clip = this.clip;
    const hd = this.header; hd.innerHTML = '';
    const ib = (label, title, fn, on = false, cls = '') => h('button', { class: 'ib' + (on ? ' on' : '') + (cls ? ' ' + cls : ''), title, 'aria-label': title, onclick: fn }, label);
    hd.append(h('span', { class: 'area-title' }, 'Dope Sheet'));
    if (!arm) { hd.append(h('span', { class: 'hint' }, 'Add an armature (Shift A) to animate.')); return; }
    const clips = [...arm.character.mixer.clips.keys()];
    hd.append(h('span', { class: 'sep' }), select(clips.length ? clips : ['—'], arm.action, (v) => { arm.action = v; ed.setFrame(0); this.fitView(); ed.commit('Set Action'); ed.emit('selection'); }, 'dd'));
    hd.append(ib('＋', 'New action (copy of current)', () => ed.emit('command', 'anim.newAction')), ib('🗑', 'Delete action', () => ed.emit('command', 'anim.deleteAction')));
    hd.append(h('span', { class: 'sep' }));
    hd.append(h('div', { class: 'grp' },
      ib('⏮', 'Jump to start (Shift ←)', () => ed.setFrame(0)),
      ib('◆◀', 'Previous keyframe (↓)', () => this.jumpKey(-1)),
      ib(ed.playing ? '⏸' : '▶', 'Play / Pause (Space)', () => ed.emit('command', 'anim.play'), ed.playing),
      ib('▶◆', 'Next keyframe (↑)', () => this.jumpKey(1)),
      ib('⏭', 'Jump to end (Shift →)', () => ed.setFrame(ed.endFrame))));
    const fr = h('input', { class: 'txt frame', value: Math.round(ed.frame), 'aria-label': 'Current frame', title: 'Current frame' });
    fr.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { ed.setFrame(+fr.value || 0); fr.blur(); } };
    this.frameInput = fr;
    hd.append(fr, h('span', { class: 'hint', style: { padding: 0 } }, `/ ${ed.endFrame} @ ${ed.fps} fps`));
    hd.append(h('span', { class: 'sep' }));
    hd.append(ib('●', 'Auto keying: record pose edits as keyframes', () => { ed.autoKey = !ed.autoKey; this.renderHeader(); }, ed.autoKey, 'rec'));
    hd.append(ib('👻 Onion', 'Onion skinning: ghosts of nearby frames', () => { ed.onion = !ed.onion; this.renderHeader(); }, ed.onion));
    if (clip) {
      hd.append(ib(clip.loop ? '🔁 Loop' : '→ Once', 'Toggle cyclic', () => { clip.loop = !clip.loop; ed.commit('Loop'); this.renderHeader(); }, clip.loop));
      const interp = select([['', 'Interpolation…'], ...INTERP.map((i) => [i, i === 'smooth' ? 'Smooth (Catmull-Rom)' : i === 'linear' ? 'Linear' : 'Constant'])], '', (v) => {
        if (!v) return;
        const bones = this.selectedBones();
        for (const t of clip.tracks) if (!bones.size || bones.has(t.bone)) t.interp = v === 'step' ? 'step' : v;
        ed.commit('Interpolation'); toast(`Interpolation set to ${v} for ${bones.size ? bones.size + ' channel(s)' : 'all channels'}`); this.renderHeader();
      }, 'dd');
      hd.append(interp);
    }
  }
  selectedBones() { const s = new Set(); for (const k of this.selKeys) s.add(k.split('|')[0]); return s; }
  jumpKey(dir) {
    const clip = this.clip; if (!clip) return;
    const frames = clip.keyTimes().map((t) => Math.round(t * this.ed.fps));
    const f = Math.round(this.ed.frame);
    const next = dir > 0 ? frames.find((x) => x > f) : [...frames].reverse().find((x) => x < f);
    if (next !== undefined) this.ed.setFrame(next);
  }
  renderChannels() {
    const ed = this.ed, rows = this.rows();
    this.channels.innerHTML = '';
    const sk = this.arm?.character.skeleton;
    const box = h('div', { style: { transform: `translateY(${-this.scrollY}px)` } });
    box.append(h('div', { class: 'ch-row summary' }, '◇ Summary'));
    for (const b of rows) {
      const i = sk.boneIndex(b);
      const sel = ed.mode === 'pose' && ed.selectedBones.has(i);
      box.append(h('div', { class: 'ch-row' + (sel ? ' sel' : ''), onclick: (e) => { if (ed.mode !== 'pose') { ed.select(this.arm); ed.setMode('pose'); } ed.selectBone(i, e.shiftKey); } }, '🦴 ' + b));
    }
    this.channels.append(box);
  }
  draw() {
    const c = this.canvas, dpr = Math.min(devicePixelRatio || 1, 2), W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#2b2b2b'; g.fillRect(0, 0, W, H);
    const ed = this.ed, clip = this.clip, end = ed.endFrame, fps = ed.fps;
    // frame range shading
    g.fillStyle = '#333'; g.fillRect(this.frameToX(0), 0, this.frameToX(end) - this.frameToX(0), H);
    // grid + ruler
    const stepChoices = [1, 2, 5, 10, 20, 50, 100];
    const step = stepChoices.find((s) => s * this.view.pxPerFrame >= 40) || 100;
    g.font = '11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const f0 = Math.floor(this.view.start / step) * step, f1 = this.xToFrame(W);
    for (let f = f0; f <= f1; f += step) {
      const x = Math.round(this.frameToX(f)) + 0.5;
      g.strokeStyle = f % (step * 5) === 0 ? '#3c3c3c' : '#353535'; g.beginPath(); g.moveTo(x, RULER); g.lineTo(x, H); g.stroke();
      g.fillStyle = '#9a9a9a'; g.fillText(String(f), x, RULER / 2);
    }
    g.fillStyle = '#262626'; g.fillRect(0, RULER - 1, W, 1);
    // rows
    const rows = this.rows();
    g.save(); g.beginPath(); g.rect(0, RULER, W, H - RULER); g.clip();
    const y0 = RULER - this.scrollY;
    g.fillStyle = '#3b3b3b'; g.fillRect(0, y0, W, ROW);
    rows.forEach((b, r) => { if (r % 2) { g.fillStyle = '#2f2f2f'; g.fillRect(0, y0 + (r + 1) * ROW, W, ROW); } });
    if (clip) {
      const diamond = (x, y, s, fill) => { g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s); g.lineTo(x - s, y); g.closePath(); g.fillStyle = fill; g.fill(); g.strokeStyle = '#111'; g.lineWidth = 1; g.stroke(); };
      // summary keys
      const summary = new Map();
      rows.forEach((b, r) => {
        const times = new Set();
        for (const t of clip.tracks) if (t.bone === b) for (const k of t.keys) times.add(+k.t.toFixed(4));
        const y = y0 + (r + 1) * ROW + ROW / 2;
        // hold bars between identical neighbours skipped for clarity; draw diamonds
        for (const t of times) {
          const x = this.frameToX(t * fps), sel = this.selKeys.has(b + '|' + t);
          diamond(x, y, 5, sel ? '#ffbb44' : '#e8e8e8');
          summary.set(t, (summary.get(t) || false) || sel);
        }
      });
      for (const [t, sel] of summary) diamond(this.frameToX(t * fps), y0 + ROW / 2, 6, sel ? '#ffbb44' : '#cfcfcf');
      // events (footsteps etc.)
      for (const e of clip.events || []) { const x = this.frameToX(e.t * fps); g.fillStyle = '#e0763a'; g.fillRect(x - 1, RULER, 2, 5); }
    }
    g.restore();
    // playhead
    const px = Math.round(this.frameToX(ed.frame)) + 0.5;
    g.strokeStyle = '#4772b3'; g.lineWidth = 2; g.beginPath(); g.moveTo(px, RULER); g.lineTo(px, H); g.stroke(); g.lineWidth = 1;
    const label = String(Math.round(ed.frame)); const lw = Math.max(24, g.measureText(label).width + 10);
    g.fillStyle = '#4772b3'; roundRect(g, px - lw / 2, 2, lw, RULER - 4, 4); g.fill();
    g.fillStyle = '#fff'; g.fillText(label, px, RULER / 2);
    if (this.boxSel) { const b = this.boxSel; g.strokeStyle = '#fff'; g.setLineDash([3, 3]); g.strokeRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0)); g.setLineDash([]); }
    if (this.frameInput && document.activeElement !== this.frameInput) this.frameInput.value = Math.round(ed.frame);
  }
  keyAt(x, y) {
    const clip = this.clip; if (!clip) return null;
    const rows = this.rows(), fps = this.ed.fps;
    const r = Math.floor((y - RULER + this.scrollY) / ROW) - 1;
    const cands = [];
    const check = (b) => { for (const t of clip.tracks) if (t.bone === b) for (const k of t.keys) if (Math.abs(this.frameToX(k.t * fps) - x) < 7) cands.push(b + '|' + +k.t.toFixed(4)); };
    if (r === -1) rows.forEach(check); else if (rows[r]) check(rows[r]);
    return cands.length ? [...new Set(cands)] : null;
  }
  _bind() {
    const c = this.canvas, ed = this.ed;
    let drag = null;
    c.addEventListener('pointerenter', () => (this.hover = true));
    c.addEventListener('pointerleave', () => (this.hover = false));
    c.addEventListener('pointerdown', (e) => {
      const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      c.setPointerCapture(e.pointerId);
      if (e.button === 1 || (e.button === 0 && e.altKey)) { drag = { kind: 'pan', x, start: this.view.start }; return; }
      if (e.button !== 0) return;
      if (y < RULER) { drag = { kind: 'scrub' }; ed.setFrame(Math.round(this.xToFrame(x))); return; }
      const hit = this.keyAt(x, y);
      if (hit) {
        if (!e.shiftKey && !hit.some((k) => this.selKeys.has(k))) this.selKeys.clear();
        hit.forEach((k) => (e.shiftKey && this.selKeys.has(k) ? this.selKeys.delete(k) : this.selKeys.add(k)));
        drag = { kind: 'keys', x, frame0: this.xToFrame(x), moved: 0, orig: this._snapshotSel() };
      } else {
        if (!e.shiftKey) this.selKeys.clear();
        drag = { kind: 'box', x0: x, y0: y };
        this.boxSel = { x0: x, y0: y, x1: x, y1: y };
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (drag.kind === 'scrub') ed.setFrame(Math.round(this.xToFrame(x)));
      else if (drag.kind === 'pan') this.view.start = drag.start - (x - drag.x) / this.view.pxPerFrame;
      else if (drag.kind === 'keys') {
        const df = Math.round(this.xToFrame(x) - drag.frame0);
        if (df !== drag.moved) { drag.moved = df; this._applyMove(drag.orig, df); }
      } else if (drag.kind === 'box') { this.boxSel.x1 = x; this.boxSel.y1 = y; }
    });
    c.addEventListener('pointerup', () => {
      if (!drag) return;
      if (drag.kind === 'keys' && drag.moved) { ed.commit('Move Keyframes'); ed.evaluate(true); }
      if (drag.kind === 'box') this._finishBox();
      drag = null;
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect(), x = e.clientX - r.left;
      if (e.ctrlKey || !e.shiftKey) {
        const f = this.xToFrame(x);
        this.view.pxPerFrame = Math.max(1, Math.min(80, this.view.pxPerFrame * Math.exp(-Math.sign(e.deltaY) * 0.12)));
        this.view.start = f - x / this.view.pxPerFrame;
      } else this.scrollY = Math.max(0, this.scrollY + e.deltaY * 0.5);
    }, { passive: false });
  }
  _snapshotSel() {
    const clip = this.clip, out = [];
    for (const key of this.selKeys) {
      const [bone, ts] = key.split('|'); const t = +ts;
      for (const tr of clip.tracks) if (tr.bone === bone) { const k = tr.keys.find((k) => Math.abs(k.t - t) < 1e-4); if (k) out.push({ tr, k, t0: k.t, bone }); }
    }
    return out;
  }
  _applyMove(orig, df) {
    const fps = this.ed.fps, dur = this.clip.duration;
    this.selKeys.clear();
    for (const o of orig) {
      o.k.t = Math.max(0, Math.min(dur, Math.round((o.t0 * fps) + df) / fps));
      this.selKeys.add(o.bone + '|' + +o.k.t.toFixed(4));
    }
    for (const o of orig) o.tr.keys.sort((a, b) => a.t - b.t);
    this.ed.poseDirty = false; this.ed.evaluate(true);
  }
  _finishBox() {
    const b = this.boxSel; this.boxSel = null;
    const clip = this.clip; if (!clip) return;
    const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
    if (x1 - x0 < 3 && y1 - y0 < 3) return;
    const rows = this.rows(), fps = this.ed.fps;
    rows.forEach((bone, r) => {
      const yc = RULER - this.scrollY + (r + 1) * ROW + ROW / 2;
      const inRow = (yc >= y0 && yc <= y1) || (RULER - this.scrollY + ROW / 2 >= y0 && RULER - this.scrollY + ROW / 2 <= y1);
      if (!inRow) return;
      for (const t of clip.tracks) if (t.bone === bone) for (const k of t.keys) { const x = this.frameToX(k.t * fps); if (x >= x0 && x <= x1) this.selKeys.add(bone + '|' + +k.t.toFixed(4)); }
    });
  }
  deleteSelected() {
    const clip = this.clip; if (!clip || !this.selKeys.size) return false;
    for (const key of this.selKeys) { const [bone, t] = key.split('|'); clip.removeKey(bone, 'rotation', +t); clip.removeKey(bone, 'position', +t); }
    this.selKeys.clear();
    this.ed.commit('Delete Keyframes'); this.ed.evaluate(true);
    return true;
  }
  selectAllKeys() { const clip = this.clip; if (!clip) return; for (const t of clip.tracks) for (const k of t.keys) this.selKeys.add(t.bone + '|' + +k.t.toFixed(4)); }
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
