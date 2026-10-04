// Furniture and props for the Zhong house, built from Kit boxes and cylinders. Every builder
// takes the stage (for its Kit and colliders), a floor position and a facing; local +Z is
// the "front" of the object. Static pieces merge into the level mesh; animated or glowing
// pieces (clock pendulum, chandelier, screens, Kevin's ring) return their own materials/nodes.
import * as E from '../../src/engine/index.js';
import { Frame } from './stage.js';
import { houseMats, fabric, wood, paint, plastic, metal, emissive } from './mats.js';
import { rng } from './textures.js';

const { Node, Mesh, Material, Kit } = E;
const M = () => houseMats();

export function screenMaterial(live, strength = 0.9) {
  return new Material({ name: 'Screen', color: '#ffffff', map: live.tex, emissive: '#ffffff', emissiveStrength: strength, emissiveMap: true, roughness: 0.15 });
}

// ------------------------------------------------------------------ living
export function couch(L, x, z, ry, w = 2.2, color = '#5a3a34') {
  const f = new Frame(L.kit, x, 0, z, ry), m = fabric(color), dark = fabric(color === '#6a2a2a' ? '#4a1a1a' : '#3a2824');
  f.stand(wood('#2a1c14'), [-w / 2 + 0.1, 0, 0.3], [0.06, 0.1, 0.06]); f.stand(wood('#2a1c14'), [w / 2 - 0.1, 0, 0.3], [0.06, 0.1, 0.06]);
  f.stand(wood('#2a1c14'), [-w / 2 + 0.1, 0, -0.3], [0.06, 0.1, 0.06]); f.stand(wood('#2a1c14'), [w / 2 - 0.1, 0, -0.3], [0.06, 0.1, 0.06]);
  f.box(dark, [0, 0.26, 0], [w, 0.28, 0.9], 0.04);
  const n = w > 1.5 ? 2 : 1, cw = (w - 0.36) / n;
  for (let i = 0; i < n; i++) f.box(m, [-w / 2 + 0.18 + cw * (i + 0.5), 0.46, 0.06], [cw - 0.02, 0.16, 0.74], 0.06);
  f.box(m, [0, 0.64, -0.36], [w - 0.28, 0.5, 0.2], 0.08);
  for (const s of [-1, 1]) f.box(m, [s * (w / 2 - 0.09), 0.44, 0], [0.18, 0.5, 0.9], 0.07);
  L.solid(x, z, ry % Math.PI ? 0.95 : w, ry % Math.PI ? w : 0.95);
}
export function armchair(L, x, z, ry, color = '#4a4a5a') { couch(L, x, z, ry, 0.95, color); }
export function table(L, x, z, ry, w = 1.6, d = 0.9, h = 0.74, color = '#4a2c18', collide = true) {
  const f = new Frame(L.kit, x, 0, z, ry), m = wood(color);
  f.box(m, [0, h - 0.025, 0], [w, 0.05, d], 0.012);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(m, [sx * (w / 2 - 0.07), (h - 0.05) / 2, sz * (d / 2 - 0.07)], [0.06, h - 0.05, 0.06], 0.008);
  f.box(m, [0, h - 0.09, 0], [w - 0.2, 0.06, d - 0.2]);
  if (collide) { const swap = Math.abs(Math.sin(ry)) > 0.7; L.solid(x, z, swap ? d : w, swap ? w : d); }
}
export function coffeeTable(L, x, z, ry, w = 1.0, d = 0.55) { table(L, x, z, ry, w, d, 0.42, '#3a2616'); }
export function chair(L, x, z, ry, color = '#5a3a22') {
  const f = new Frame(L.kit, x, 0, z, ry), m = wood(color);
  f.box(m, [0, 0.45, 0], [0.42, 0.04, 0.42], 0.01);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(m, [sx * 0.18, 0.22, sz * 0.18], [0.035, 0.44, 0.035]);
  for (const sx of [-1, 1]) f.box(m, [sx * 0.18, 0.7, -0.18], [0.035, 0.5, 0.035]);
  f.box(m, [0, 0.82, -0.19], [0.4, 0.14, 0.03], 0.01); f.box(m, [0, 0.62, -0.19], [0.4, 0.07, 0.03], 0.01);
  f.box(fabric('#7a6a5a'), [0, 0.48, 0], [0.38, 0.03, 0.38], 0.01);
}
export function stool(L, x, z, color = '#5a3a22') { const f = new Frame(L.kit, x, 0, z, 0), m = wood(color); f.cyl(m, [0, 0.62, 0], 0.17, 0.05, 12); for (const a of [0, 120, 240]) f.box(m, [Math.cos(a * Math.PI / 180) * 0.1, 0.3, Math.sin(a * Math.PI / 180) * 0.1], [0.03, 0.6, 0.03]); }
export function officeChair(L, x, z, ry) {
  const f = new Frame(L.kit, x, 0, z, ry), m = plastic('#202228'), mesh = fabric('#2a2c34');
  f.cyl(m, [0, 0.05, 0], 0.26, 0.04, 6); f.cyl(m, [0, 0.28, 0], 0.025, 0.4, 8);
  f.box(mesh, [0, 0.52, 0], [0.48, 0.07, 0.46], 0.03); f.box(mesh, [0, 0.82, -0.23], [0.46, 0.5, 0.07], 0.03);
  for (const s of [-1, 1]) f.box(m, [s * 0.26, 0.68, 0], [0.04, 0.04, 0.3]);
}
export function rug(L, x, z, w, d, color = '#7b1f1e', ry = 0) {
  const f = new Frame(L.kit, x, 0, z, ry);
  f.box(fabric('#d9ccb0', { patternScale: 60 }), [0, 0.008, 0], [w, 0.016, d]);
  f.box(fabric(color, { patternScale: 60 }), [0, 0.012, 0], [w - 0.28, 0.016, d - 0.28]);
  f.box(fabric('#2b3a5c', { patternScale: 60 }), [0, 0.016, 0], [w - 0.7, 0.016, d - 0.7]);
  f.box(fabric('#d9ccb0', { patternScale: 60 }), [0, 0.02, 0], [w - 0.85, 0.016, d - 0.85]);
}
export function floorLamp(L, x, z, on = true) {
  const f = new Frame(L.kit, x, 0, z, 0);
  f.cyl(metal('#2a2a2a'), [0, 0.02, 0], 0.15, 0.04, 12); f.cyl(metal('#2a2a2a'), [0, 0.8, 0], 0.015, 1.6, 6);
  f.cyl(new Material({ name: 'Lampshade', color: '#e8dcc0', roughness: 0.9, emissive: '#ffd9a0', emissiveStrength: on ? 0.8 : 0.05, opacity: 1 }), [0, 1.62, 0], 0.18, 0.3, 14, 0.12);
}
export function plant(L, x, z, s = 1) {
  const f = new Frame(L.kit, x, 0, z, 0), m = M();
  f.cyl(plastic('#8a5a3a', { roughness: 0.6 }), [0, 0.18 * s, 0], 0.17 * s, 0.36 * s, 12, 0.13 * s); f.cyl(m.soil, [0, 0.35 * s, 0], 0.15 * s, 0.03, 10);
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; f.shape(m.plant, { type: 'sphere', radius: 0.13 * s, widthSegments: 8, heightSegments: 6 }, [], [Math.cos(a) * 0.12 * s, (0.65 + (i % 3) * 0.12) * s, Math.sin(a) * 0.12 * s], [0, 0, 0], [1, 1.9, 0.45]); }
  L.solid(x, z, 0.4 * s, 0.4 * s);
}
export function bookshelf(L, x, z, ry, w = 1.0, h = 1.9, seed = 1) {
  const f = new Frame(L.kit, x, 0, z, ry), m = wood('#5a3a22'), r = rng(seed);
  f.box(m, [0, h / 2, -0.17], [w, h, 0.03]);
  for (const s of [-1, 1]) f.box(m, [s * (w / 2 - 0.015), h / 2, 0], [0.03, h, 0.36]);
  const cols = ['#8a2a2a', '#2a4a8a', '#3a6a3a', '#c8a030', '#6a4a8a', '#d8d0b8', '#2a2a2a'];
  for (let y = 0.02; y < h; y += 0.42) {
    f.box(m, [0, y, 0], [w, 0.03, 0.36]);
    if (y > h - 0.3) continue;
    let bx = -w / 2 + 0.05;
    while (bx < w / 2 - 0.08) { const bw = 0.025 + r() * 0.03, bh = 0.2 + r() * 0.14; if (r() > 0.12) f.box(plastic(cols[(r() * cols.length) | 0], { roughness: 0.8 }), [bx + bw / 2, y + 0.015 + bh / 2, 0.02], [bw, bh, 0.22]); bx += bw + 0.004; }
  }
  const swap = Math.abs(Math.sin(ry)) > 0.7; L.solid(x, z, swap ? 0.4 : w, swap ? w : 0.4);
}
export function wardrobe(L, x, z, ry, color = '#4a3020', w = 1.0, h = 1.95) {
  const f = new Frame(L.kit, x, 0, z, ry), m = wood(color);
  f.box(m, [0, h / 2, 0], [w, h, 0.5], 0.01);
  for (const s of [-1, 1]) { f.box(wood(color, { roughness: 0.45 }), [s * w / 4, h / 2, 0.255], [w / 2 - 0.02, h - 0.1, 0.02], 0.006); f.box(metal('#c8c8c0'), [s * 0.04, h * 0.52, 0.285], [0.02, 0.18, 0.03]); }
  const swap = Math.abs(Math.sin(ry)) > 0.7; L.solid(x, z, swap ? 0.5 : w, swap ? w : 0.5);
}
export function dresser(L, x, z, ry, color = '#5a3a22') {
  const f = new Frame(L.kit, x, 0, z, ry), m = wood(color);
  f.box(m, [0, 0.45, 0], [1.2, 0.9, 0.5], 0.015);
  for (let i = 0; i < 3; i++) { f.box(wood(color, { roughness: 0.4 }), [0, 0.2 + i * 0.28, 0.255], [1.12, 0.24, 0.02], 0.005); f.box(metal('#c8b078'), [0, 0.2 + i * 0.28, 0.275], [0.14, 0.025, 0.025]); }
  const swap = Math.abs(Math.sin(ry)) > 0.7; L.solid(x, z, swap ? 0.5 : 1.2, swap ? 1.2 : 0.5);
}
export function desk(L, x, z, ry, w = 1.2, color = '#8a6a4a') {
  const f = new Frame(L.kit, x, 0, z, ry), m = wood(color);
  f.box(m, [0, 0.74, 0], [w, 0.04, 0.6], 0.01);
  for (const sx of [-1, 1]) f.box(m, [sx * (w / 2 - 0.03), 0.37, 0], [0.04, 0.74, 0.56]);
  f.box(m, [0, 0.4, -0.27], [w - 0.1, 0.5, 0.02]);
  const swap = Math.abs(Math.sin(ry)) > 0.7; L.solid(x, z, swap ? 0.62 : w, swap ? w : 0.62);
}
export function bed(L, x, z, ry, color = '#3a6ab8', w = 1.0, len = 2.0) {
  const f = new Frame(L.kit, x, 0, z, ry), fr = wood('#4a3020'), sheet = fabric(color, { patternScale: 150 });
  f.box(fr, [0, 0.22, 0], [w + 0.08, 0.22, len + 0.04], 0.02);
  f.box(fabric('#eeeae0', { patternScale: 150 }), [0, 0.4, 0.02], [w - 0.02, 0.2, len - 0.06], 0.06);
  f.box(sheet, [0, 0.52, 0.28], [w - 0.02, 0.06, len * 0.62], 0.04);
  f.box(fabric('#f4f1e8'), [0, 0.52, -len / 2 + 0.28], [w * 0.7, 0.12, 0.36], 0.06);
  f.box(fr, [0, 0.55, -len / 2 - 0.02], [w + 0.1, 0.9, 0.06], 0.01);
  f.box(fr, [0, 0.38, len / 2 + 0.02], [w + 0.1, 0.5, 0.05], 0.01);
  const swap = Math.abs(Math.sin(ry)) > 0.7; L.solid(x, z, swap ? len + 0.1 : w + 0.1, swap ? w + 0.1 : len + 0.1);
}
export function cardboardBox(L, x, y, z, ry = 0, label = '') {
  const f = new Frame(L.kit, x, y, z, ry); f.stand(M().cardboard, [0, 0, 0], [0.5, 0.36, 0.4], 0.008);
  f.box(plastic('#c8b890'), [0, 0.36, 0], [0.5, 0.01, 0.06]);
  if (label) f.box(plastic('#f2f0e0'), [0, 0.18, 0.201], [0.3, 0.1, 0.004]);
}
export function shoeRack(L, x, z, ry) {
  const f = new Frame(L.kit, x, 0, z, ry), m = wood('#6a4a2a');
  f.box(m, [0, 0.2, 0], [0.9, 0.04, 0.3]); f.box(m, [0, 0.4, 0], [0.9, 0.04, 0.3]); for (const s of [-1, 1]) f.box(m, [s * 0.43, 0.2, 0], [0.04, 0.4, 0.3]);
  const sh = [['#d8d8d0', -0.28], ['#2a2a30', -0.04], ['#a03030', 0.2]];
  for (const [c, px] of sh) f.box(plastic(c), [px, 0.46, 0], [0.12, 0.08, 0.26], 0.03);
  L.solid(x, z, 0.9, 0.3);
}
export function breakerBox(L, x, y, z, ry) {
  const f = new Frame(L.kit, x, y, z, ry);
  f.box(metal('#7a7e84', { roughness: 0.5 }), [0, 0.3, 0], [0.34, 0.6, 0.1]); f.box(plastic('#2a2a2e'), [0, 0.3, 0.052], [0.28, 0.5, 0.01]);
  for (let i = 0; i < 6; i++) f.box(plastic(i === 5 ? '#d02020' : '#e0e0d8'), [-0.08 + (i % 2) * 0.16, 0.12 + Math.floor(i / 2) * 0.12, 0.06], [0.06, 0.04, 0.02]);
}
export function pictureFrame(L, x, y, z, ry, w, h, texture, frameColor = '#3a2a1c') {
  const f = new Frame(L.kit, x, y, z, ry);
  f.box(wood(frameColor), [0, 0, 0], [w + 0.06, h + 0.06, 0.03], 0.008);
  const mat = new Material({ name: 'Picture', color: '#ffffff', map: texture, roughness: 0.6 });
  f.box(mat, [0, 0, 0.018], [w, h, 0.006]);
}
export function posterPanel(L, x, y, z, ry, w, h, texture) {
  const f = new Frame(L.kit, x, y, z, ry);
  f.box(new Material({ name: 'Poster', color: '#ffffff', map: texture, roughness: 0.8 }), [0, 0, 0], [w, h, 0.01]);
}
export function curtains(L, x, y, z, ry, w, h, color = '#6a4a5a') {
  const f = new Frame(L.kit, x, y, z, ry), m = fabric(color, { doubleSided: true });
  for (const s of [-1, 1]) f.box(m, [s * (w / 2 - 0.15), h / 2, 0], [0.34, h, 0.08], 0.03);
  f.box(metal('#5a5a5a'), [0, h + 0.03, 0], [w + 0.2, 0.025, 0.04]);
}

// ------------------------------------------------------------------ electronics
export function tv(L, x, z, ry, screenMat, w = 1.2, h = 0.68) {
  const f = new Frame(L.kit, x, 0, z, ry), black = plastic('#101012');
  f.box(wood('#2a1c14'), [0, 0.28, 0], [w + 0.2, 0.56, 0.5], 0.015);
  f.box(black, [0, 0.56 + h / 2 + 0.06, 0], [w + 0.05, h + 0.05, 0.06], 0.01);
  f.box(screenMat, [0, 0.62 + h / 2, 0.034], [w, h, 0.006]);
  f.box(metal('#222'), [0, 0.6, 0], [0.3, 0.04, 0.2]);
  L.solid(x, z, Math.abs(Math.sin(ry)) > 0.7 ? 0.5 : w + 0.2, Math.abs(Math.sin(ry)) > 0.7 ? w + 0.2 : 0.5);
}
export function crtTV(L, x, z, ry, screenMat) {
  const f = new Frame(L.kit, x, 0, z, ry);
  f.box(wood('#4a2a18'), [0, 0.27, 0], [0.9, 0.54, 0.5], 0.01);
  f.box(plastic('#2a2a2a'), [0, 0.82, -0.02], [0.7, 0.58, 0.55], 0.04);
  f.box(screenMat, [0, 0.83, 0.262], [0.5, 0.4, 0.006]);
  f.box(plastic('#1a1a1a'), [0, 0.4, 0.12], [0.42, 0.08, 0.3]); // VCR
  L.solid(x, z, Math.abs(Math.sin(ry)) > 0.7 ? 0.55 : 0.9, Math.abs(Math.sin(ry)) > 0.7 ? 0.9 : 0.55);
}
export function pcSetup(L, x, z, ry, screenMat) {
  const f = new Frame(L.kit, x, 0, z, ry), black = plastic('#16171b');
  f.box(wood('#6a4a2a'), [0, 0.74, 0], [1.4, 0.04, 0.7], 0.01);
  for (const s of [-1, 1]) f.box(wood('#6a4a2a'), [s * 0.66, 0.37, 0], [0.04, 0.74, 0.66]);
  f.box(black, [0, 1.07, -0.12], [0.62, 0.38, 0.03], 0.01); f.box(screenMat, [0, 1.07, -0.1], [0.58, 0.34, 0.004]);
  f.box(black, [0, 0.82, -0.12], [0.04, 0.14, 0.04]); f.box(black, [0, 0.77, -0.12], [0.2, 0.02, 0.14]);
  f.box(plastic('#2a2a30'), [0, 0.775, 0.12], [0.44, 0.02, 0.15], 0.006);
  f.box(plastic('#2a2a30'), [0.3, 0.775, 0.12], [0.06, 0.016, 0.1], 0.006);
  f.box(plastic('#1e1f24'), [0.52, 0.89, -0.1], [0.2, 0.42, 0.4], 0.01);
  const swap = Math.abs(Math.sin(ry)) > 0.7; L.solid(x, z, swap ? 0.7 : 1.4, swap ? 1.4 : 0.7);
}
export function arcadeCabinet(L, x, z, ry, screenMat, marquee) {
  const f = new Frame(L.kit, x, 0, z, ry), body = wood('#1a1a2a', { roughness: 0.45 });
  f.box(body, [0, 0.95, 0], [0.75, 1.9, 0.7], 0.012);
  f.box(emissive('#ffd21e', 1.4), [0, 1.65, 0], [0.77, 0.25, 0.72]);
  f.box(new Material({ name: 'Marquee', color: '#fff', map: marquee, emissive: '#fff', emissiveStrength: 1.2, emissiveMap: true }), [0, 1.77, 0.365], [0.7, 0.2, 0.006]);
  f.box(screenMat, [0, 1.3, 0.32], [0.56, 0.44, 0.008], 0, [-11, 0, 0]);
  f.box(plastic('#2a2a3a'), [0, 0.98, 0.35], [0.75, 0.08, 0.4], 0.01);
  f.cyl(plastic('#222'), [-0.15, 1.06, 0.4], 0.012, 0.1, 6); f.cyl(plastic('#d02020', { roughness: 0.3 }), [-0.15, 1.13, 0.4], 0.03, 0.03, 10);
  ['#20a0ff', '#40d040', '#ffd21e'].forEach((c, i) => f.cyl(plastic(c), [0.05 + i * 0.09, 1.025, 0.42], 0.025, 0.02, 10));
  const swap = Math.abs(Math.sin(ry)) > 0.7; L.solid(x, z, swap ? 0.7 : 0.75, swap ? 0.75 : 0.7);
}
export function tabletProp(L, x, y, z, ry, screenMat) {
  const f = new Frame(L.kit, x, y, z, ry);
  f.box(plastic('#1a1a1a'), [0, 0.008, 0], [0.26, 0.015, 0.18], 0.004); f.box(screenMat, [0, 0.017, 0], [0.235, 0.002, 0.155]);
}
// Kevin the smart speaker: a fabric cylinder with a light ring. Returns the ring material.
export function kevinSpeaker(L, x, y, z) {
  const f = new Frame(L.kit, x, y, z, 0);
  f.cyl(fabric('#2a2c32'), [0, 0.1, 0], 0.07, 0.2, 18); f.cyl(plastic('#101012'), [0, 0.205, 0], 0.07, 0.01, 18);
  const ring = new Material({ name: 'Kevin ring', color: '#2a4a6a', emissive: '#2a4a6a', emissiveStrength: 3, roughness: 0.4 });
  f.cyl(ring, [0, 0.19, 0], 0.0715, 0.016, 18);
  return ring;
}

// ------------------------------------------------------------------ kitchen & bath
export function fridge(L, x, z, ry) {
  const f = new Frame(L.kit, x, 0, z, ry), w = M().white;
  f.box(w, [0, 0.9, 0], [0.75, 1.8, 0.7], 0.02); f.box(M().steel, [0.3, 1.15, 0.36], [0.025, 0.5, 0.03]); f.box(M().steel, [0.3, 0.62, 0.36], [0.025, 0.3, 0.03]); f.box(plastic('#c0c2c6'), [0, 1.05, 0.355], [0.72, 0.012, 0.01]);
  const swap = Math.abs(Math.sin(ry)) > 0.7; L.solid(x, z, swap ? 0.7 : 0.75, swap ? 0.75 : 0.7);
}
export function stove(L, x, z, ry) {
  const f = new Frame(L.kit, x, 0, z, ry), w = M().white;
  f.box(w, [0, 0.45, 0], [0.7, 0.9, 0.66], 0.015); f.box(plastic('#1a1a1c'), [0, 0.902, 0], [0.7, 0.012, 0.66]);
  for (const [bx, bz] of [[-0.17, -0.16], [0.17, -0.16], [-0.17, 0.14], [0.17, 0.14]]) f.cyl(plastic('#3a3a3e'), [bx, 0.915, bz], 0.09, 0.012, 14);
  f.box(plastic('#1a1a1c'), [0, 0.42, 0.335], [0.52, 0.34, 0.01]); f.box(M().steel, [0, 0.64, 0.355], [0.5, 0.02, 0.03]);
  const swap = Math.abs(Math.sin(ry)) > 0.7; L.solid(x, z, swap ? 0.66 : 0.7, swap ? 0.7 : 0.66);
}
export function counter(L, x, z, ry, len = 2, sink = false) {
  const f = new Frame(L.kit, x, 0, z, ry), base = wood('#6a5a4a', { roughness: 0.5 });
  f.box(base, [0, 0.43, 0], [len, 0.86, 0.62], 0.012); f.box(plastic('#cfcac0', { roughness: 0.3 }), [0, 0.88, 0], [len + 0.02, 0.04, 0.66], 0.008);
  for (let i = 0; i < Math.floor(len / 0.5); i++) f.box(metal('#c8c8c0'), [-len / 2 + 0.25 + i * 0.5, 0.7, 0.318], [0.14, 0.02, 0.02]);
  if (sink) { f.box(M().steel, [0, 0.885, 0.02], [0.5, 0.012, 0.36]); f.cyl(M().steel, [0.2, 1.0, -0.2], 0.012, 0.2, 8); f.box(M().steel, [0.2, 1.1, -0.1], [0.02, 0.02, 0.2]); }
  const swap = Math.abs(Math.sin(ry)) > 0.7; L.solid(x, z, swap ? 0.62 : len, swap ? len : 0.62);
}
export function wallCabinet(L, x, y, z, ry, len = 2) {
  const f = new Frame(L.kit, x, y, z, ry), m = wood('#7a6a58', { roughness: 0.5 });
  f.box(m, [0, 0.4, 0], [len, 0.8, 0.36], 0.01);
  for (let i = 0; i < Math.floor(len / 0.5); i++) f.box(metal('#c8c8c0'), [-len / 2 + 0.25 + i * 0.5, 0.2, 0.19], [0.02, 0.14, 0.02]);
}
export function potProp(L, x, y, z) { const f = new Frame(L.kit, x, y, z, 0); f.cyl(M().pot, [0, 0.1, 0], 0.15, 0.2, 14); f.cyl(M().pot, [0.17, 0.2, 0], 0.025, 0.012, 6); }
export function riceCooker(L, x, y, z) { const f = new Frame(L.kit, x, y, z, 0); f.cyl(M().white, [0, 0.12, 0], 0.14, 0.24, 14); f.cyl(plastic('#b8b8b0'), [0, 0.255, 0], 0.13, 0.03, 14); f.cyl(plastic('#d02020'), [0.07, 0.15, 0.13], 0.016, 0.01, 8, 0.016, [90, 0, 0]); }
export function toilet(L, x, z, ry) {
  const f = new Frame(L.kit, x, 0, z, ry), w = plastic('#f0efe8', { roughness: 0.2 });
  f.cyl(w, [0, 0.2, 0.06], 0.17, 0.4, 12, 0.13); f.box(w, [0, 0.35, -0.2], [0.4, 0.4, 0.18], 0.03); f.cyl(w, [0, 0.43, 0.06], 0.19, 0.04, 14);
  L.solid(x, z, 0.5, 0.7);
}
export function bathSink(L, x, z, ry) { const f = new Frame(L.kit, x, 0, z, ry), w = plastic('#e8e6de', { roughness: 0.2 }); f.box(wood('#5a4a3a'), [0, 0.4, 0], [0.6, 0.8, 0.45], 0.01); f.box(w, [0, 0.82, 0], [0.62, 0.05, 0.47], 0.015); f.cyl(M().steel, [0, 0.95, -0.15], 0.012, 0.18, 8); L.solid(x, z, 0.6, 0.45); }
export function bathtub(L, x, z, ry) {
  const f = new Frame(L.kit, x, 0, z, ry), w = plastic('#efefea', { roughness: 0.2 });
  f.box(w, [0, 0.25, 0.36], [1.8, 0.5, 0.08], 0.02); f.box(w, [0, 0.25, -0.36], [1.8, 0.5, 0.08], 0.02);
  f.box(w, [0.86, 0.25, 0], [0.08, 0.5, 0.8], 0.02); f.box(w, [-0.86, 0.25, 0], [0.08, 0.5, 0.8], 0.02); f.box(plastic('#dcdcd6', { roughness: 0.15 }), [0, 0.08, 0], [1.7, 0.08, 0.7]);
  f.box(metal('#aaaaaa'), [0, 2.0, 0.42], [1.9, 0.03, 0.03]);
  f.box(fabric('#a8c8d8', { doubleSided: true }), [-0.3, 1.25, 0.42], [1.2, 1.5, 0.02]);
  L.solid(x, z, Math.abs(Math.sin(ry)) > 0.7 ? 0.8 : 1.8, Math.abs(Math.sin(ry)) > 0.7 ? 1.8 : 0.8);
}
export function washer(L, x, z, ry, label = 'WASH') {
  const f = new Frame(L.kit, x, 0, z, ry);
  f.box(plastic('#e8e8e2'), [0, 0.45, 0], [0.68, 0.9, 0.66], 0.015); f.cyl(metal('#6a7a8a'), [0, 0.45, 0.335], 0.2, 0.03, 16, 0.2, [90, 0, 0]);
  f.box(plastic('#2a2a2a'), [0, 0.8, 0.335], [0.5, 0.06, 0.02]);
  const swap = Math.abs(Math.sin(ry)) > 0.7; L.solid(x, z, swap ? 0.66 : 0.68, swap ? 0.68 : 0.66);
}

// ------------------------------------------------------------------ the Zhong house specials
export function piano(L, x, z, ry) {
  const f = new Frame(L.kit, x, 0, z, ry), b = plastic('#17120f', { roughness: 0.25 });
  f.box(b, [0, 0.6, 0], [1.5, 1.2, 0.55], 0.015); f.box(b, [0, 0.74, 0.4], [1.5, 0.06, 0.3], 0.01); f.box(plastic('#f4f2ea'), [0, 0.775, 0.41], [1.4, 0.02, 0.26]);
  for (let i = 0; i < 20; i++) if (i % 7 !== 2 && i % 7 !== 6) f.box(b, [-0.66 + i * 0.07, 0.79, 0.36], [0.03, 0.03, 0.14]);
  f.box(b, [0, 0.22, 0.8], [0.9, 0.45, 0.35], 0.02);
  const swap = Math.abs(Math.sin(ry)) > 0.7; L.solid(x, z, swap ? 1.2 : 1.5, swap ? 1.5 : 1.2);
}
// Grandfather clock. Returns { pendulum: Node } so the level can swing it.
export function grandfatherClock(L, x, z, ry, faceTex) {
  const f = new Frame(L.kit, x, 0, z, ry), w = wood('#3a2012');
  f.box(w, [0, 1.0, 0], [0.5, 2.0, 0.3], 0.015); f.box(w, [0, 1.95, 0], [0.56, 0.1, 0.34], 0.01);
  f.box(new Material({ name: 'Clock face', color: '#fff', map: faceTex, roughness: 0.5 }), [0, 1.7, 0.155], [0.34, 0.34, 0.01]);
  f.box(plastic('#2a1a10'), [0, 0.9, 0.152], [0.3, 0.8, 0.004]);
  const k = new Kit(L.pal); k.cyl(M().brass, [0, -0.35, 0], 0.006, 0.7, 6); k.cyl(M().brass, [0, -0.72, 0], 0.07, 0.02, 12, 0.07, [90, 0, 0]);
  const pend = k.toNode('Pendulum'); const pivot = new Node('Pendulum pivot'); pivot.add(pend);
  const at = f.at(0, 1.4, 0.16); pivot.position.set(at); if (ry) pivot.setEuler(0, ry * 180 / Math.PI, 0);
  L.scene.add(pivot);
  const swap = Math.abs(Math.sin(ry)) > 0.7; L.solid(x, z, swap ? 0.3 : 0.5, swap ? 0.5 : 0.3);
  return { pendulum: pivot };
}
export function altar(L, x, z, ry, portrait) {
  const f = new Frame(L.kit, x, 0, z, ry), m = wood('#3a1c10', { roughness: 0.4 });
  f.box(m, [0, 0.45, 0], [1.1, 0.9, 0.45], 0.012); f.box(wood('#2a1208'), [0, 0.91, 0], [1.2, 0.04, 0.5], 0.01);
  f.box(m, [0, 1.25, -0.18], [0.6, 0.6, 0.04], 0.01);
  f.box(new Material({ name: 'Portrait', color: '#fff', map: portrait, roughness: 0.6 }), [0, 1.26, -0.155], [0.44, 0.5, 0.006]);
  for (const s of [-1, 1]) { f.cyl(plastic('#d8c8a0'), [s * 0.4, 1.0, 0.02], 0.025, 0.14, 8); f.cyl(emissive('#ffb040', 5), [s * 0.4, 1.085, 0.02], 0.012, 0.03, 6); }
  f.cyl(metal('#b88a40'), [0, 0.96, 0.1], 0.07, 0.04, 12, 0.05); f.cyl(plastic('#5a1a10'), [0, 0.99, 0.1], 0.05, 0.02, 8);
  for (const [fx, c] of [[-0.18, '#d8602a'], [0.18, '#d8c040']]) f.shape(plastic(c), { type: 'sphere', radius: 0.045, widthSegments: 8, heightSegments: 6 }, [], [fx, 0.98, 0.14]);
  L.solid(x, z, Math.abs(Math.sin(ry)) > 0.7 ? 0.5 : 1.2, Math.abs(Math.sin(ry)) > 0.7 ? 1.2 : 0.5);
}
export function toyChest(L, x, z, ry) { const f = new Frame(L.kit, x, 0, z, ry); f.box(wood('#b04040'), [0, 0.25, 0], [0.9, 0.5, 0.5], 0.02); f.box(metal('#c8b078'), [0, 0.4, 0.26], [0.1, 0.06, 0.01]); L.solid(x, z, 0.9, 0.5); }
export function pandaToy(L, x, y, z, ry) { const f = new Frame(L.kit, x, y, z, ry), w = fabric('#f0f0ea'), b = fabric('#1a1a1a'); f.shape(w, { type: 'sphere', radius: 0.12, widthSegments: 10, heightSegments: 8 }, [], [0, 0.12, 0]); f.shape(w, { type: 'sphere', radius: 0.09, widthSegments: 10, heightSegments: 8 }, [], [0, 0.29, 0.02]); for (const s of [-1, 1]) { f.shape(b, { type: 'sphere', radius: 0.035, widthSegments: 6, heightSegments: 5 }, [], [s * 0.07, 0.37, 0]); f.shape(b, { type: 'sphere', radius: 0.025, widthSegments: 6, heightSegments: 5 }, [], [s * 0.035, 0.3, 0.1]); } }
export function trophy(L, x, y, z) { const f = new Frame(L.kit, x, y, z, 0); f.cyl(plastic('#222'), [0, 0.03, 0], 0.06, 0.06, 8); f.cyl(metal('#d8b040', { roughness: 0.2 }), [0, 0.16, 0], 0.07, 0.2, 10, 0.02); }
export function chandelier(L, x, y, z) {
  // brass ring with five arms; returns { node, bulbMat } so the level can sway it and switch it
  const k = new Kit(L.pal), brass = M().brass, bulb = new Material({ name: 'Chandelier bulbs', color: '#fff4cc', emissive: '#ffe0a0', emissiveStrength: 7, roughness: 0.4 });
  k.cyl(brass, [0, -0.25, 0], 0.015, 0.5, 6); k.shape(brass, { type: 'sphere', radius: 0.07, widthSegments: 8, heightSegments: 6 }, [], [0, -0.52, 0]);
  k.shape(brass, { type: 'torus', radius: 0.34, tube: 0.016, radialSegments: 6, tubularSegments: 20, arc: 360, tubeScaleY: 1 }, [], [0, -0.58, 0]);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2, px = Math.cos(a) * 0.34, pz = Math.sin(a) * 0.34; k.cyl(brass, [px / 2, -0.55, pz / 2], 0.01, 0.34, 4, 0.01, [0, 0, 90]); k.cyl(brass, [px, -0.56, pz], 0.03, 0.05, 8, 0.02); k.shape(bulb, { type: 'sphere', radius: 0.04, widthSegments: 8, heightSegments: 6 }, [], [px, -0.5, pz]); }
  const node = k.toNode('Chandelier'); node.position.set([x, y, z]); L.scene.add(node);
  return { node, bulbMat: bulb };
}
export function carProp(L, x, z, ry, color = '#4a4e56') {
  const f = new Frame(L.kit, x, 0, z, ry), body = new Material({ name: 'Car paint', color, roughness: 0.3, metallic: 0.6 }), glass = new Material({ name: 'Car glass', color: '#1a2228', roughness: 0.05, metallic: 0.3 }), tire = plastic('#121214', { roughness: 0.9 });
  f.box(body, [0, 0.55, 0], [1.8, 0.7, 4.3], 0.12); f.box(body, [0, 1.12, -0.2], [1.6, 0.55, 2.3], 0.18);
  f.box(glass, [0, 1.15, 0.92], [1.5, 0.45, 0.04], 0, [-24, 0, 0]); f.box(glass, [0, 1.15, -1.32], [1.5, 0.45, 0.04], 0, [24, 0, 0]);
  for (const s of [-1, 1]) f.box(glass, [s * 0.81, 1.15, -0.2], [0.04, 0.4, 2.0]);
  for (const [wx, wz] of [[-0.88, 1.35], [0.88, 1.35], [-0.88, -1.35], [0.88, -1.35]]) f.cyl(tire, [wx, 0.34, wz], 0.34, 0.22, 14, 0.34, [0, 0, 90]);
  for (const s of [-1, 1]) { f.box(emissive('#fff2c0', 2), [s * 0.6, 0.62, 2.16], [0.3, 0.12, 0.03]); f.box(emissive('#aa1111', 1.2), [s * 0.6, 0.62, -2.16], [0.3, 0.12, 0.03]); }
  L.solid(x, z, Math.abs(Math.sin(ry)) > 0.7 ? 4.3 : 1.9, Math.abs(Math.sin(ry)) > 0.7 ? 1.9 : 4.3);
}
export function tarp(L, x, z, ry) { const f = new Frame(L.kit, x, 0, z, ry); f.box(fabric('#3a4a5a', { doubleSided: true }), [0, 0.76, 0], [1.96, 1.52, 2.6], 0.2); }
export function workbench(L, x, z, ry) { const f = new Frame(L.kit, x, 0, z, ry); f.box(wood('#5a4a3a'), [0, 0.45, 0], [0.6, 0.9, 2.2], 0.01); L.solid(x, z, Math.abs(Math.sin(ry)) > 0.7 ? 2.2 : 0.6, Math.abs(Math.sin(ry)) > 0.7 ? 0.6 : 2.2); }
export function houseFacade(L, x, z, ry, color, lit = false) {
  const f = new Frame(L.kit, x, 0, z, ry);
  f.box(paint(color), [0, 2.2, 0], [9, 4.4, 8]); f.box(plastic('#3a3030'), [0, 4.6, 0], [9.6, 0.5, 8.6]);
  f.box(new Material({ name: 'Neighbour roof', color: '#4a4440', roughness: 0.9, pattern: 'shingles', patternScale: 5 }), [0, 5.2, 0], [9.8, 1.0, 8.8], 0, [0, 0, 0]);
  f.box(emissive('#ffd8a0', lit ? 2.5 : 0.1), [-2, 2.2, 4.01], [1.1, 1.3, 0.04]); f.box(emissive('#ffd8a0', lit ? 1.8 : 0.1), [2, 2.2, 4.01], [1.1, 1.3, 0.04]);
}
export function tree(L, x, z, s = 1) {
  const f = new Frame(L.kit, x, 0, z, 0);
  f.cyl(wood('#3a2a1c'), [0, 1.1 * s, 0], 0.18 * s, 2.2 * s, 7, 0.26 * s);
  for (const [r, yy] of [[1.4, 2.6], [1.1, 3.4], [0.75, 4.1]]) f.shape(M().plant, { type: 'sphere', radius: r * s, widthSegments: 9, heightSegments: 7 }, [], [0, yy * s, 0], [0, 0, 0], [1, 0.85, 1]);
  L.solid(x, z, 0.5, 0.5);
}
export function lampPost(L, x, z, on) {
  const f = new Frame(L.kit, x, 0, z, 0);
  f.cyl(metal('#2a2a2e'), [0, 2.1, 0], 0.05, 4.2, 8, 0.08); f.box(metal('#2a2a2e'), [0.3, 4.2, 0], [0.7, 0.05, 0.08]);
  f.cyl(emissive('#ffe0a0', on ? 5 : 0.2), [0.55, 4.12, 0], 0.12, 0.14, 8);
}
