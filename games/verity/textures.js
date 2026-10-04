// Canvas-painted textures: Verity's faces, shirt prints, screens. Everything is drawn at
// start-up, so the game ships with no image assets.
import { Texture } from '../../src/engine/scene.js';
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function rng(seed) { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Verity's face. The sphere's texture centre (u = 0.5) faces +Z after a 90 degree turn.
export function verityFaceCanvas(kind = 'happy', w = 512, h = 256) {
  const c = mk(w, h), g = c.getContext('2d');
  const base = kind === 'off' ? '#6a5a10' : '#ffd21e';
  const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, '#ffe45a'); grad.addColorStop(0.5, base); grad.addColorStop(1, '#d9a800');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h * 0.5, S = h / 256;
  g.lineCap = 'round'; g.lineJoin = 'round';
  const eye = (x, open = 1) => { g.fillStyle = '#0c0a06'; g.beginPath(); g.ellipse(x, cy - 28 * S, 15 * S, 25 * S * open, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x + 4 * S, cy - 38 * S, 4 * S, 6 * S, 0, 0, Math.PI * 2); g.fill(); };
  const smile = (wide = 1, sad = false) => { g.strokeStyle = '#0c0a06'; g.lineWidth = 8 * S; g.beginPath(); if (sad) { g.arc(cx, cy + 86 * S, 52 * S, Math.PI * 1.15, Math.PI * 1.85); } else { g.arc(cx, cy - 18 * S, 62 * S * wide, Math.PI * 0.16, Math.PI * 0.84); } g.stroke(); };
  if (kind === 'happy' || kind === 'off' || kind === 'wink' || kind === 'crack') {
    eye(cx - 48 * S); if (kind === 'wink') { g.strokeStyle = '#0c0a06'; g.lineWidth = 8 * S; g.beginPath(); g.arc(cx + 48 * S, cy - 26 * S, 16 * S, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); } else eye(cx + 48 * S);
    smile();
    if (kind === 'crack') { g.strokeStyle = '#2a1a00'; g.lineWidth = 3 * S; g.beginPath(); g.moveTo(cx - 70 * S, cy - 90 * S); g.lineTo(cx - 20 * S, cy - 20 * S); g.lineTo(cx - 40 * S, cy + 40 * S); g.stroke(); }
  } else if (kind === 'surprised') {
    eye(cx - 48 * S, 1.2); eye(cx + 48 * S, 1.2); g.fillStyle = '#0c0a06'; g.beginPath(); g.ellipse(cx, cy + 50 * S, 22 * S, 30 * S, 0, 0, Math.PI * 2); g.fill();
  } else if (kind === 'sad') {
    eye(cx - 48 * S, 0.8); eye(cx + 48 * S, 0.8); smile(1, true);
  } else { // grin / glitch: the wide, wrong smile
    const rr = rng(5);
    g.fillStyle = kind === 'glitch' ? '#2a0000' : '#0c0a06';
    g.beginPath(); g.ellipse(cx - 48 * S, cy - 28 * S, 17 * S, 28 * S, 0.1, 0, Math.PI * 2); g.ellipse(cx + 48 * S, cy - 28 * S, 17 * S, 28 * S, -0.1, 0, Math.PI * 2); g.fill();
    g.fillStyle = kind === 'glitch' ? '#ff2010' : '#fff8e0';
    g.beginPath(); g.arc(cx - 45 * S, cy - 34 * S, 5 * S, 0, 7); g.arc(cx + 51 * S, cy - 34 * S, 5 * S, 0, 7); g.fill();
    g.fillStyle = '#1a0000'; g.beginPath(); g.moveTo(cx - 120 * S, cy + 8 * S); g.quadraticCurveTo(cx, cy + 118 * S, cx + 120 * S, cy + 8 * S); g.quadraticCurveTo(cx, cy + 40 * S, cx - 120 * S, cy + 8 * S); g.fill();
    g.fillStyle = '#fff8e0';
    for (let i = -9; i <= 9; i++) { const x = cx + i * 12 * S, y = cy + 14 * S + Math.abs(i) * -0.5 * S + (1 - Math.abs(i) / 9) * 24 * S; g.fillRect(x - 4 * S, y, 8 * S, 10 * S + rr() * 4 * S); }
    for (let i = -8; i <= 8; i++) { const x = cx + i * 12 * S, y = cy + 44 * S - Math.abs(i) * 2.2 * S; g.fillRect(x - 4 * S, y, 8 * S, 9 * S); }
  }
  // soft shading: a ball
  const sh = g.createRadialGradient(cx - 40 * S, cy - 60 * S, 10, cx, cy, h * 0.9);
  sh.addColorStop(0, 'rgba(255,255,255,0.22)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(60,30,0,0.25)');
  g.fillStyle = sh; g.fillRect(0, 0, w, h);
  return c;
}

// Eric's creeper hoodie print (centred on the front of the torso texture)
export function creeperHoodieCanvas() {
  const c = mk(128, 64), g = c.getContext('2d'), r = rng(3);
  g.fillStyle = '#4f9a3f'; g.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 500; i++) { g.fillStyle = r() < 0.5 ? '#3f8a31' : '#5aa84a'; g.fillRect(r() * 128, r() * 64, 2, 2); }
  g.fillStyle = '#1a2a14';
  // the torso's texture seam is at the front, so the print is drawn across both edges
  for (const cx of [0, 128]) {
    g.fillRect(cx - 12, 14, 8, 8); g.fillRect(cx + 4, 14, 8, 8);
    g.fillRect(cx - 4, 22, 8, 6); g.fillRect(cx - 8, 28, 16, 6); g.fillRect(cx - 8, 34, 5, 6); g.fillRect(cx + 3, 34, 5, 6);
  }
  return c;
}
export function scrubsCanvas() {
  const c = mk(64, 64), g = c.getContext('2d'), r = rng(8);
  g.fillStyle = '#3f8a96'; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 300; i++) { g.fillStyle = r() < 0.5 ? '#377a85' : '#4a9aa6'; g.fillRect(r() * 64, r() * 64, 1, 1); }
  return c;
}

export { mk as makeCanvas, rng };

// Small flat Verity face for 2D screens (arcade, desktop, console)
export function drawVerityOnCanvas(g, cx, cy, rad, kind = 'happy') {
  g.fillStyle = '#ffd21e'; g.beginPath(); g.arc(cx, cy, rad, 0, 7); g.fill();
  g.fillStyle = 'rgba(160,100,0,0.35)'; g.beginPath(); g.arc(cx + rad * 0.15, cy + rad * 0.15, rad * 0.95, 0, 7); g.fill();
  g.fillStyle = '#ffd21e'; g.beginPath(); g.arc(cx - rad * 0.06, cy - rad * 0.06, rad * 0.88, 0, 7); g.fill();
  g.fillStyle = '#0c0a06';
  if (kind === 'grin') {
    g.fillRect(cx - rad * 0.35, cy - rad * 0.3, rad * 0.12, rad * 0.14);
    g.fillRect(cx + rad * 0.23, cy - rad * 0.3, rad * 0.12, rad * 0.14);
    g.fillStyle = '#3a0806'; g.beginPath(); g.moveTo(cx - rad * 0.7, cy + rad * 0.05); g.quadraticCurveTo(cx, cy + rad * 0.9, cx + rad * 0.7, cy + rad * 0.05); g.quadraticCurveTo(cx, cy + rad * 0.25, cx - rad * 0.7, cy + rad * 0.05); g.fill();
    g.fillStyle = '#f4ecd0';
    for (let i = 0; i < 9; i++) { const t = (i + 0.5) / 9; const x = cx - rad * 0.6 + t * rad * 1.2; g.fillRect(x - rad * 0.05, cy + rad * 0.12 + Math.sin(t * Math.PI) * rad * 0.1, rad * 0.1, rad * 0.14); }
  } else {
    g.beginPath(); g.ellipse(cx - rad * 0.28, cy - rad * 0.22, rad * 0.09, rad * 0.2, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(cx + rad * 0.28, cy - rad * 0.22, rad * 0.09, rad * 0.2, 0, 0, 7); g.fill();
    g.strokeStyle = '#0c0a06'; g.lineWidth = Math.max(2, rad * 0.09); g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - rad * 0.55, cy + rad * 0.15); g.quadraticCurveTo(cx, cy + rad * 0.75, cx + rad * 0.55, cy + rad * 0.15); g.stroke();
  }
}

// ------------------------------------------------------------------ cached canvas textures
const cache = new Map();
function text(g, str, x, y, size, color, o = {}) {
  g.fillStyle = color; g.font = `${o.weight || 'bold'} ${size}px ${o.font || 'Arial, Helvetica, sans-serif'}`;
  g.textAlign = o.align || 'center'; g.textBaseline = 'middle'; g.fillText(str, x, y);
}
function speckle(g, w, h, amt, rand) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = 1 + (rand() - 0.5) * amt; d[i] = Math.min(255, d[i] * n); d[i + 1] = Math.min(255, d[i + 1] * n); d[i + 2] = Math.min(255, d[i + 2] * n); }
  g.putImageData(img, 0, 0);
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function paintTexture(key, w, h, draw, opts = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = mk(w, h), g = c.getContext('2d');
  draw(g, w, h, rng(hashStr(key)));
  const t = new Texture(c, { repeat: opts.repeat ?? false, mipmaps: opts.mipmaps ?? true, name: key });
  cache.set(key, t);
  return t;
}
export function signTexture(key, w, h, bg, lines, opts = {}) {
  return paintTexture('sign' + key, w, h, (g, W, H, r) => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    for (const l of lines) {
      if (l.rect) { g.fillStyle = l.color; g.fillRect(...l.rect); continue; }
      text(g, l.t, l.x ?? W / 2, l.y, l.size || 10, l.color || '#111', { align: l.align, weight: l.weight, font: l.font });
    }
    if (opts.draw) opts.draw(g, W, H, r);
    if (opts.noise !== false) speckle(g, W, H, opts.noise ?? 0.12, r);
  });
}
const shadeHex = (hex, f) => { const n = parseInt(hex.slice(1), 16); const k = (v) => Math.max(0, Math.min(255, Math.round(v * f))); return `rgb(${k((n >> 16) & 255)},${k((n >> 8) & 255)},${k(n & 255)})`; };
export function photoTexture(key, people, bg = '#7a8a6a') {
  return paintTexture('photo' + key, 96, 72, (g, w, h, r) => {
    g.fillStyle = '#f2eee4'; g.fillRect(0, 0, w, h);
    g.fillStyle = bg; g.fillRect(4, 4, w - 8, h - 8);
    g.fillStyle = shadeHex(bg, 0.7); g.fillRect(4, h - 24, w - 8, 20);
    const n = people.length;
    people.forEach((p, i) => {
      const x = 12 + (i + 0.5) * ((w - 24) / n), top = h - 8 - p.h * 2;
      g.fillStyle = p.shirt; g.fillRect(x - 8, top + 14, 16, p.h * 2 - 14);
      g.fillStyle = p.skin; g.beginPath(); g.arc(x, top + 8, 6.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = p.hair; g.fillRect(x - 6.4, top, 12.8, 5);
      g.fillStyle = '#111'; g.fillRect(x - 3, top + 8, 2, 2); g.fillRect(x + 1, top + 8, 2, 2);
    });
    speckle(g, w, h, 0.15, r);
  });
}
export function portraitTexture(key, o) {
  return paintTexture('portrait' + key, 64, 80, (g, w, h, r) => {
    g.fillStyle = o.bg || '#3a3028'; g.fillRect(0, 0, w, h);
    g.fillStyle = o.shirt || '#222'; g.beginPath(); g.ellipse(32, 84, 28, 24, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = o.skin || '#d8b090'; g.beginPath(); g.ellipse(32, 36, 14, 18, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = o.hair || '#aaa'; g.fillRect(18, 16, 28, 10);
    g.fillStyle = '#222'; g.fillRect(24, 34, 4, 2); g.fillRect(36, 34, 4, 2);
    g.fillStyle = '#7a4a3a'; g.fillRect(28, 46, 8, 2);
    if (o.gray) { const img = g.getImageData(0, 0, w, h), d = img.data; for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; d[i] = v * 1.05; d[i + 1] = v; d[i + 2] = v * 0.9; } g.putImageData(img, 0, 0); }
    speckle(g, w, h, 0.2, r);
  });
}
// A canvas that scripts redraw (TV, PC, arcade, tablet screens)
export function liveTexture(w, h) {
  const c = mk(w, h), g = c.getContext('2d');
  const t = new Texture(c, { repeat: false, mipmaps: false, name: 'live' });
  return { canvas: c, g, tex: t, update() { t.needsUpdate(); } };
}
