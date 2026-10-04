// Materials for the Zhong house and the rest of Verity's world. The engine's procedural
// patterns (planks, stucco, stripes, checker, fabric, leather, metal...) do the surface work.
import { Material } from '../../src/engine/scene.js';

const cache = new Map();
const mk = (key, def) => { if (!cache.has(key)) cache.set(key, new Material({ name: key, ...def })); return cache.get(key); };

export const fabric = (color, extra = {}) => mk('fabric' + color + JSON.stringify(extra), { color, roughness: 0.92, pattern: 'fabric', patternScale: 240, patternColor: darken(color, 0.55), sheen: 0.5, ...extra });
export const wood = (color, extra = {}) => mk('wood' + color + JSON.stringify(extra), { color, roughness: 0.55, pattern: 'wood', patternScale: 18, patternColor: darken(color, 0.55), patternStrength: 0.6, ...extra });
export const paint = (color, extra = {}) => mk('paint' + color + JSON.stringify(extra), { color, roughness: 0.9, pattern: 'stucco', patternScale: 1.4, patternColor: darken(color, 0.82), patternStrength: 0.5, ...extra });
export const plastic = (color, extra = {}) => mk('plastic' + color + JSON.stringify(extra), { color, roughness: 0.4, ...extra });
export const metal = (color = '#9a9ca2', extra = {}) => mk('metal' + color + JSON.stringify(extra), { color, roughness: 0.32, metallic: 1, pattern: 'metal', patternScale: 2, ...extra });
export const emissive = (color, strength = 2, extra = {}) => mk('emis' + color + strength + JSON.stringify(extra), { color, emissive: color, emissiveStrength: strength, roughness: 0.5, ...extra });

export function darken(hex, k) { const n = parseInt(hex.slice(1), 16); const c = (v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0'); return '#' + c((n >> 16) & 255) + c((n >> 8) & 255) + c(n & 255); }

let M = null;
export function houseMats() {
  if (M) return M;
  M = {
    woodFloor: mk('woodFloor', { color: '#7a5233', roughness: 0.5, pattern: 'planks', patternScale: 5, patternColor: '#26150a', patternStrength: 0.9 }),
    woodFloorDark: mk('woodFloorDark', { color: '#5a3a24', roughness: 0.5, pattern: 'planks', patternScale: 5, patternColor: '#1c0f06', patternStrength: 0.9 }),
    tileKitchen: mk('tileKitchen', { color: '#d5ccb5', roughness: 0.3, pattern: 'checker', patternScale: 2.4, patternColor: '#8a806e', patternStrength: 1 }),
    tileBath: mk('tileBath', { color: '#c8d6da', roughness: 0.25, pattern: 'checker', patternScale: 3.2, patternColor: '#9fb2b8', patternStrength: 0.8 }),
    concrete: mk('concrete', { color: '#8a8a86', roughness: 0.95, pattern: 'stucco', patternScale: 1.6, patternColor: '#5a5a58', patternStrength: 0.8 }),
    carpetEric: fabric('#6a7a8e', { patternScale: 120 }), carpetMom: fabric('#8a7864', { patternScale: 120 }), carpetGuest: fabric('#7a6e5a', { patternScale: 120 }), carpetHarry: fabric('#6e6a60', { patternScale: 120 }),
    runner: fabric('#6a2a2a', { patternScale: 90 }),
    paper: mk('paper', { color: '#8a8c94', roughness: 0.85, pattern: 'stripes', patternScale: 14, patternColor: '#777a86', patternStrength: 0.35 }),
    cream: paint('#d3cab2'), tileWall: paint('#c8d4d8', { roughness: 0.4 }), blue: paint('#8aa6c8'), green: paint('#8a9a84'), cinder: mk('cinder', { color: '#a9a598', roughness: 0.95, pattern: 'brick', patternScale: 6, patternColor: '#7e7a6c', patternStrength: 0.4 }),
    ceiling: paint('#d8d4c8'), ceilingWood: mk('ceilingWood', { color: '#5a4030', roughness: 0.7, pattern: 'planks', patternScale: 7, patternColor: '#241810' }),
    door: mk('door', { color: '#6a4a30', roughness: 0.6, pattern: 'planks', patternScale: 4, patternColor: '#2a190c', patternStrength: 0.5 }),
    frontDoor: mk('frontDoor', { color: '#6a3a2a', roughness: 0.5, pattern: 'wood', patternScale: 14, patternColor: '#2a150c' }),
    trim: mk('trimW', { color: '#e8e0cc', roughness: 0.7 }),
    white: plastic('#e8e6de', { roughness: 0.35 }), black: plastic('#141416', { roughness: 0.4 }), steel: metal('#b6b8bd'), brass: metal('#b8944a', { roughness: 0.3 }), glass: mk('glassP', { color: '#9bb4c0', opacity: 0.25, roughness: 0.05 }),
    screenOff: mk('screenOff', { color: '#050507', roughness: 0.08, metallic: 0.2 }),
    cardboard: mk('cardboard', { color: '#a98456', roughness: 0.95, pattern: 'fabric', patternScale: 90, patternColor: '#7a5c36' }),
    leather: mk('leather', { color: '#4a2c1c', roughness: 0.55, pattern: 'leather', patternScale: 260, patternColor: '#26140a', sheen: 0.3 }),
    pot: metal('#6a6c72', { roughness: 0.4 }),
    plant: mk('plantLeaf', { color: '#3f6b2e', roughness: 0.7, pattern: 'fabric', patternScale: 160, patternColor: '#27441c' }),
    soil: mk('soil', { color: '#3a2a1c', roughness: 1, pattern: 'dirt', patternScale: 8, patternColor: '#1c120a' }),
    grass: mk('grass', { color: '#3f5f2a', roughness: 1, pattern: 'dirt', patternScale: 2, patternColor: '#26401a', bump: 1.4 }),
    asphalt: mk('asphalt', { color: '#34353a', roughness: 0.9, pattern: 'dirt', patternScale: 3, patternColor: '#202124' }),
    fence: mk('fence', { color: '#4a3a2c', roughness: 0.85, pattern: 'planks', patternScale: 4, patternColor: '#1c1208' }),
  };
  return M;
}

export const plasticMat = plastic;
