// Small DOM toolkit for the Studio: Blender-style number fields, vectors, menus, dialogs.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

const fmt = (v, step, unit = '') => {
  const p = step >= 1 ? 0 : step >= 0.1 ? 2 : step >= 0.01 ? 3 : 4;
  return (Math.round(v * 1e6) / 1e6).toFixed(p) + unit;
};

// Draggable number field. opts: {label, get, set(v, final), min, max, step, unit, slider, onStart, onEnd, keyed}
export function numField(o) {
  const step = o.step ?? 0.01;
  const el = h('div', { class: 'num' + (o.keyed ? ' ' + o.keyed : ''), tabindex: 0, role: 'spinbutton', 'aria-label': o.label || 'value' });
  const fill = h('div', { class: 'fill' });
  const lbl = h('span', { class: 'lbl' }, o.label || '');
  const val = h('span', { class: 'val' });
  if (o.slider && o.min !== undefined && o.max !== undefined) el.append(fill);
  el.append(lbl, val);
  const clamp = (v) => Math.min(o.max ?? Infinity, Math.max(o.min ?? -Infinity, v));
  const refresh = () => {
    const v = o.get();
    val.textContent = typeof v === 'number' ? fmt(v, step, o.unit) : v;
    if (fill.isConnected) fill.style.width = (((v - o.min) / (o.max - o.min)) * 100).toFixed(1) + '%';
    el.setAttribute('aria-valuenow', v);
  };
  refresh();
  el.refresh = refresh;
  let start = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || el.querySelector('input')) return;
    e.preventDefault();
    start = { x: e.clientX, v: o.get(), moved: false };
    el.setPointerCapture(e.pointerId);
    o.onStart && o.onStart();
  });
  el.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    if (!start.moved && Math.abs(dx) < 3) return;
    start.moved = true;
    const speed = e.shiftKey ? 0.1 : e.ctrlKey ? 10 : 1;
    let v = start.v + dx * step * speed * (o.dragScale ?? 1);
    if (e.ctrlKey) v = Math.round(v / (step * 10)) * step * 10;
    o.set(clamp(v), false); refresh();
  });
  const finish = () => {
    if (!start) return;
    const moved = start.moved; start = null;
    if (moved) { o.set(clamp(o.get()), true); o.onEnd && o.onEnd(); refresh(); }
    else edit();
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') edit(); });
  el.addEventListener('dblclick', () => edit());
  function edit() {
    if (el.querySelector('input')) return;
    const inp = h('input', { value: String(Math.round(o.get() * 1e5) / 1e5), 'aria-label': o.label });
    el.append(inp); inp.focus(); inp.select();
    const done = (ok) => {
      if (!inp.isConnected) return;
      if (ok) {
        let v;
        try { v = Function('"use strict";return (' + inp.value.replace(/[^0-9+\-*/().eE ]/g, '') + ')')(); } catch { v = NaN; }
        if (Number.isFinite(v)) { o.set(clamp(v), true); o.onEnd && o.onEnd(); }
      }
      inp.remove(); refresh();
    };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
    inp.addEventListener('blur', () => done(true));
  }
  return el;
}

export function vecField(labels, arr, opts) {
  const box = h('div', { class: 'vec' });
  labels.forEach((l, i) => box.append(numField({ ...opts, label: l, get: () => arr()[i], set: (v, fin) => opts.set(i, v, fin), keyed: opts.keyed && opts.keyed[i] })));
  return box;
}

export function row(label, control) { return h('div', { class: 'prow' + (label === null ? ' full' : '') }, label === null ? null : h('label', {}, label), control); }

export function select(options, value, onChange, cls = 'sel') {
  const s = h('select', { class: cls, onchange: (e) => onChange(e.target.value) });
  for (const o of options) { const [v, l] = Array.isArray(o) ? o : [o, o]; s.append(h('option', { value: v, selected: v === value }, l)); }
  return s;
}
export function checkbox(label, value, onChange) {
  const i = h('input', { type: 'checkbox', checked: value, onchange: (e) => onChange(e.target.checked) });
  return h('label', { class: 'chk' }, i, label);
}
export function colorField(value, onInput, onChange) {
  const i = h('input', { type: 'color', value, oninput: (e) => onInput(e.target.value), onchange: (e) => onChange && onChange(e.target.value) });
  return h('div', { class: 'color' }, i);
}
export function panel(title, body, { closed = false, tools = null, cls = '', key = null, store = null } = {}) {
  const k = key || title;
  const isClosed = store && k in store ? store[k] : closed;
  const p = h('div', { class: 'pnl ' + cls + (isClosed ? ' closed' : '') });
  const arrow = h('span', { class: 'arrow' }, isClosed ? '▸' : '▾');
  const head = h('div', { class: 'ph' }, arrow, title, tools ? h('span', { class: 'tools' }, tools) : null);
  head.addEventListener('click', (e) => {
    if (e.target.closest('.tools')) return;
    p.classList.toggle('closed'); arrow.textContent = p.classList.contains('closed') ? '▸' : '▾';
    if (store) store[k] = p.classList.contains('closed');
  });
  p.append(head, h('div', { class: 'pb' }, body));
  return p;
}

// ------------------------------------------------------------------ menus
let openMenus = [];
export function closeMenus() { openMenus.forEach((m) => m.remove()); openMenus = []; document.querySelectorAll('.menu-btn.open').forEach((b) => b.classList.remove('open')); }
// items: [{label, icon, shortcut, run, disabled, sub:[...]} | '-' | {title}]
export function showMenu(items, x, y, { title = null, level = 0, search = false } = {}) {
  if (level === 0) closeMenus();
  else { while (openMenus.length > level) openMenus.pop().remove(); }
  const m = h('div', { class: 'menu', role: 'menu' });
  if (title) m.append(h('div', { class: 'mt' }, title));
  let list = items;
  const body = h('div');
  const render = (arr) => {
    body.innerHTML = '';
    for (const it of arr) {
      if (it === '-') { body.append(h('div', { class: 'msep' })); continue; }
      if (it.title) { body.append(h('div', { class: 'mt' }, it.title)); continue; }
      const mi = h('div', { class: 'mi' + (it.disabled ? ' dis' : '') + (it.sub ? ' sub' : ''), role: 'menuitem' }, h('span', { class: 'mic' }, it.icon || ''), it.label, it.shortcut ? h('span', { class: 'sc' }, it.shortcut) : null);
      mi.addEventListener('pointerenter', () => { if (it.sub) { const r = mi.getBoundingClientRect(); showMenu(it.sub, r.right - 2, r.top - 4, { level: level + 1 }); } else while (openMenus.length > level + 1) openMenus.pop().remove(); });
      mi.addEventListener('click', (e) => { e.stopPropagation(); if (it.sub) return; closeMenus(); it.run && it.run(); });
      body.append(mi);
    }
  };
  if (search) {
    const inp = h('input', { class: 'search', placeholder: 'Search…', 'aria-label': 'Search operators' });
    m.append(inp);
    inp.addEventListener('input', () => { const q = inp.value.toLowerCase(); render(items.filter((i) => i !== '-' && !i.title && i.label.toLowerCase().includes(q)).slice(0, 30)); });
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') closeMenus();
      if (e.key === 'Enter') { const first = body.querySelector('.mi'); if (first) first.click(); }
    });
    setTimeout(() => inp.focus(), 0);
  }
  m.append(body);
  render(list);
  document.getElementById('menuLayer').append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px';
  m.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
  openMenus.push(m);
  return m;
}
window.addEventListener('pointerdown', (e) => { if (!e.target.closest('.menu') && !e.target.closest('.menu-btn')) closeMenus(); });

export function dialog(title, content, buttons = [{ label: 'Close' }]) {
  const layer = document.getElementById('modalLayer');
  layer.innerHTML = '';
  const close = () => { layer.hidden = true; layer.innerHTML = ''; };
  const d = h('div', { class: 'dialog', role: 'dialog', 'aria-label': title }, h('h3', {}, title), h('div', { class: 'db' }, content),
    h('div', { class: 'df' }, buttons.map((b) => h('button', { class: 'btn' + (b.primary ? ' primary' : ''), onclick: () => { if (b.run && b.run() === false) return; close(); } }, b.label))));
  layer.append(d); layer.hidden = false;
  layer.onpointerdown = (e) => { if (e.target === layer) close(); };
  return { close, el: d };
}

let toastT = 0;
export function toast(msg, ms = 2200) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms);
}
