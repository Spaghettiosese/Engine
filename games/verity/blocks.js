// Block definitions, the painted texture atlas and hotbar icons for the Minecraft chapters.
import { makeCanvas, rng } from './textures.js';

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, LOG: 4, LEAVES: 5, PLANKS: 6, DIAMOND: 7, SAND: 8, WATER: 9,
  COBBLE: 10, GLASS: 11, BEDROCK: 12, FLESH: 13, FLESHGRASS: 14, SMILE: 15, SIGN: 16, WOOL: 17,
  DEADLEAVES: 18, TEETH: 19, EYE: 20, DOORB: 21, DOORT: 22, GOLD: 23, BOOKSHELF: 24,
};

// tiles: [top, side, bottom]
export const BLOCKS = {
  [B.GRASS]: { name: 'Grass Block', tiles: [0, 1, 2], hard: 0.35, drop: B.DIRT, surf: 'grass' },
  [B.DIRT]: { name: 'Dirt', tiles: [2, 2, 2], hard: 0.3, surf: 'grass' },
  [B.STONE]: { name: 'Stone', tiles: [3, 3, 3], hard: 0.75, drop: B.COBBLE, surf: 'concrete' },
  [B.LOG]: { name: 'Oak Log', tiles: [5, 4, 5], hard: 0.55, surf: 'wood' },
  [B.LEAVES]: { name: 'Leaves', tiles: [6, 6, 6], hard: 0.12, cutout: true, drop: 0, surf: 'grass' },
  [B.PLANKS]: { name: 'Oak Planks', tiles: [7, 7, 7], hard: 0.45, surf: 'wood' },
  [B.DIAMOND]: { name: 'Diamond Ore', tiles: [8, 8, 8], hard: 0.9, drop: 'diamond', surf: 'concrete' },
  [B.SAND]: { name: 'Sand', tiles: [9, 9, 9], hard: 0.3, surf: 'gravel' },
  [B.WATER]: { name: 'Water', tiles: [10, 10, 10], liquid: true, nonsolid: true },
  [B.COBBLE]: { name: 'Cobblestone', tiles: [11, 11, 11], hard: 0.75, surf: 'concrete' },
  [B.GLASS]: { name: 'Glass', tiles: [12, 12, 12], hard: 0.2, cutout: true, drop: 0, surf: 'tile' },
  [B.BEDROCK]: { name: 'Bedrock', tiles: [13, 13, 13], hard: Infinity, surf: 'concrete' },
  [B.FLESH]: { name: '???', tiles: [14, 14, 14], hard: 1.4, drop: 0, surf: 'flesh' },
  [B.FLESHGRASS]: { name: '???', tiles: [16, 15, 14], hard: 0.9, drop: 0, surf: 'flesh' },
  [B.SMILE]: { name: ':)', tiles: [17, 17, 17], hard: Infinity, surf: 'flesh' },
  [B.SIGN]: { name: 'Sign', tiles: [7, 18, 7], hard: 0.4, drop: 0, surf: 'wood' },
  [B.WOOL]: { name: 'Yellow Wool', tiles: [19, 19, 19], hard: 0.25, surf: 'carpet' },
  [B.DEADLEAVES]: { name: 'Dead Leaves', tiles: [20, 20, 20], hard: 0.1, cutout: true, drop: 0, surf: 'grass' },
  [B.TEETH]: { name: '???', tiles: [21, 21, 21], hard: Infinity, surf: 'tile' },
  [B.EYE]: { name: '???', tiles: [22, 22, 22], hard: Infinity, surf: 'flesh' },
  [B.DOORB]: { name: 'Door', tiles: [7, 23, 7], hard: 0.4, cutout: true, drop: 0, surf: 'wood' },
  [B.DOORT]: { name: 'Door', tiles: [7, 24, 7], hard: 0.4, cutout: true, drop: 0, surf: 'wood' },
  [B.GOLD]: { name: 'Gold Ore', tiles: [25, 25, 25], hard: 0.9, surf: 'concrete' },
  [B.BOOKSHELF]: { name: 'Bookshelf', tiles: [7, 30, 7], hard: 0.45, surf: 'wood' },
};

export const ITEM_TILES = { diamond: 32, baguette: 31 };

export function isSolid(id) { return id !== 0 && !BLOCKS[id]?.nonsolid; }
export function isOpaque(id) { return id !== 0 && !BLOCKS[id]?.cutout && !BLOCKS[id]?.liquid; }

let ATLAS = null;
export function atlas() {
  if (ATLAS) return ATLAS;
  const S = 16, N = 8;
  const c = makeCanvas(S * N, S * N);
  const g = c.getContext('2d');
  const r = rng(1337);
  const px = (tile, fn) => {
    const ox = (tile % N) * S, oy = Math.floor(tile / N) * S;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const col = fn(x, y);
      if (!col) continue;
      g.fillStyle = col; g.fillRect(ox + x, oy + y, 1, 1);
    }
  };
  const vary = (base, amt) => {
    const [R, G, Bc] = base; const k = 1 + (r() - 0.5) * amt;
    return `rgb(${Math.min(255, R * k) | 0},${Math.min(255, G * k) | 0},${Math.min(255, Bc * k) | 0})`;
  };
  const grassC = [95, 159, 53], dirtC = [134, 96, 67], stoneC = [125, 125, 125];
  px(0, () => vary(grassC, 0.35));
  px(1, (x, y) => (y < 3 || (y === 3 && r() < 0.6) || (y === 4 && r() < 0.25)) ? vary(grassC, 0.3) : vary(dirtC, 0.35));
  px(2, () => vary(dirtC, 0.4));
  px(3, () => (r() < 0.12 ? vary([100, 100, 100], 0.2) : vary(stoneC, 0.18)));
  px(4, (x) => vary(x % 4 === 0 ? [80, 60, 36] : [107, 84, 51], 0.25));
  px(5, (x, y) => { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); return d > 6.5 ? vary([107, 84, 51], 0.2) : vary(Math.floor(d) % 2 ? [176, 143, 90] : [156, 127, 78], 0.1); });
  px(6, () => (r() < 0.18 ? null : vary([60, 132, 40], 0.45)));
  px(7, (x, y) => (y % 4 === 3 ? vary([120, 90, 50], 0.1) : (x === ((y >> 2) * 5 + 3) % 16 && y % 4 !== 3) ? 'rgb(120,90,50)' : vary([175, 138, 84], 0.15)));
  px(8, (x, y) => { const d = ((x * 7 + y * 13) % 11); return (d < 2 && r() < 0.8) ? vary([90, 225, 230], 0.2) : (r() < 0.12 ? vary([100, 100, 100], 0.2) : vary(stoneC, 0.18)); });
  px(9, () => vary([219, 207, 160], 0.12));
  px(10, () => { const k = 0.9 + r() * 0.2; return `rgba(${40 * k | 0},${90 * k | 0},${210 * k | 0},0.72)`; });
  px(11, (x, y) => { const edge = (x % 5 === 0) || (y % 4 === 0 && r() < 0.8); return edge ? vary([90, 90, 90], 0.2) : vary([130, 130, 130], 0.25); });
  px(12, (x, y) => (x === 0 || y === 0 || x === 15 || y === 15) ? 'rgb(210,235,240)' : ((x === y && x > 3 && x < 8) ? 'rgba(255,255,255,0.9)' : null));
  px(13, () => vary(r() < 0.5 ? [50, 50, 50] : [90, 90, 90], 0.4));
  // corrupted
  px(14, (x, y) => { const v = Math.sin(x * 0.9 + y * 0.4) + Math.sin(y * 1.3 - x * 0.2); return v > 1.2 ? vary([170, 70, 60], 0.2) : vary([196, 176, 76], 0.25); });
  px(15, (x, y) => (y < 4 ? vary([200, 180, 70], 0.3) : (Math.sin(x * 0.9 + y * 0.4) > 0.9 ? vary([170, 70, 60], 0.2) : vary([140, 110, 60], 0.3))));
  px(16, (x, y) => (Math.sin(x * 1.1) * Math.cos(y * 0.9) > 0.6 ? vary([180, 80, 70], 0.2) : vary([205, 185, 80], 0.25)));
  px(17, (x, y) => {
    const dx = x - 7.5, dy = y - 7.5;
    if ((x === 5 || x === 10) && y >= 4 && y <= 7) return 'rgb(12,10,6)';
    const sm = y === 11 && x >= 4 && x <= 11 || (y === 10 && (x === 3 || x === 12));
    if (sm) return 'rgb(12,10,6)';
    return vary([255, 210, 30], 0.08 + (dx * dx + dy * dy) / 400);
  });
  px(18, (x, y) => (y > 3 && y < 12 && x > 1 && x < 14) ? ((y % 2 === 0 && x > 2 && x < 13 && r() < 0.7) ? 'rgb(40,28,16)' : vary([190, 150, 95], 0.1)) : vary([120, 90, 50], 0.15));
  px(19, () => vary([235, 200, 40], 0.18));
  px(20, () => (r() < 0.25 ? null : vary([110, 90, 40], 0.45)));
  px(21, (x, y) => (y < 3 || y > 12) ? vary([200, 110, 110], 0.2) : (x % 4 === 0 ? 'rgb(80,40,30)' : vary([236, 228, 200], 0.08)));
  px(22, (x, y) => { const dx = x - 7.5, dy = y - 7.5, d = Math.sqrt(dx * dx + dy * dy * 1.8); if (d < 2) return 'rgb(10,6,4)'; if (d < 3.5) return 'rgb(90,120,40)'; if (d < 6) return vary([240, 235, 220], 0.08); return vary([196, 176, 76], 0.25); });
  px(23, (x, y) => (x === 0 || x === 15 || y === 15) ? 'rgb(90,64,36)' : ((x === 12 && y === 1) ? 'rgb(60,60,60)' : vary([160, 120, 70], 0.12)));
  px(24, (x, y) => (x === 0 || x === 15 || y === 0) ? 'rgb(90,64,36)' : ((y > 2 && y < 9 && x > 2 && x < 13) ? null : vary([160, 120, 70], 0.12)));
  px(25, (x, y) => ((x * 5 + y * 9) % 11 < 2 && r() < 0.8) ? vary([240, 210, 60], 0.2) : vary(stoneC, 0.18));
  // crack stages 26-29
  for (let s = 0; s < 4; s++) {
    const cr = rng(99 + s);
    const pts = new Set();
    for (let k = 0; k < (s + 1) * 18; k++) { let x = 8, y = 8; for (let j = 0; j < 6 + s * 2; j++) { x += Math.round((cr() - 0.5) * 2); y += Math.round((cr() - 0.5) * 2); pts.add(((x + 16) % 16) + ',' + ((y + 16) % 16)); } }
    px(26 + s, (x, y) => (pts.has(x + ',' + y) ? 'rgba(0,0,0,0.7)' : null));
  }
  px(30, (x, y) => (y < 2 || y > 13 || y === 7 || y === 8) ? vary([175, 138, 84], 0.15) : vary([[140, 30, 30], [30, 60, 140], [40, 110, 50], [150, 120, 40]][(x >> 2) % 4], 0.25));
  // items
  px(31, (x, y) => { const on = Math.abs((x - y)) < 3 && x > 1 && x < 15; return on ? ((x + y) % 5 === 0 ? 'rgb(150,95,40)' : vary([220, 170, 90], 0.1)) : null; });
  px(32, (x, y) => { const dx = Math.abs(x - 7.5), dy = y - 7; const inD = dy < 0 ? (dx < 5 + dy * 0.8 && dy > -4) : (dx < 5 - dy * 0.8); return inD ? (x < 7 ? 'rgb(170,245,245)' : 'rgb(80,215,220)') : null; });
  // average colours for particles
  const avg = [];
  const data = g.getImageData(0, 0, S * N, S * N).data;
  for (let t = 0; t < N * N; t++) {
    let R = 0, G = 0, Bc = 0, n = 0;
    const ox = (t % N) * S, oy = Math.floor(t / N) * S;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = ((oy + y) * S * N + ox + x) * 4;
      if (data[i + 3] > 100) { R += data[i]; G += data[i + 1]; Bc += data[i + 2]; n++; }
    }
    avg.push(n ? [R / n / 255, G / n / 255, Bc / n / 255] : [0.53, 0.53, 0.53]);
  }
  ATLAS = { canvas: c, N, S, avg };
  return ATLAS;
}

export function tileUV(tile) {
  const N = 8, e = 0.02 / 16;
  const tx = tile % N, ty = Math.floor(tile / N);
  const u0 = tx / N + e, u1 = (tx + 1) / N - e;
  const v1 = 1 - ty / N - e, v0 = 1 - (ty + 1) / N + e;
  return [u0, v0, u1, v1];
}

// Icon canvas (for the hotbar)
export function iconFor(item) {
  const A = atlas();
  const tile = typeof item === 'string' ? ITEM_TILES[item] : BLOCKS[item].tiles[1];
  const c = makeCanvas(16, 16);
  const g = c.getContext('2d');
  g.drawImage(A.canvas, (tile % 8) * 16, Math.floor(tile / 8) * 16, 16, 16, 0, 0, 16, 16);
  return c.toDataURL();
}

