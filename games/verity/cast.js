// The cast of Verity: who they are, what they wear, how tall they stand.
import { Texture, Material, Mesh, Node, sphere, Light } from '../../src/engine/index.js';
import { createHuman } from './people.js';
import { createGrinner } from '../../src/content/monster.js';
import { verityFaceCanvas, creeperHoodieCanvas, scrubsCanvas } from './textures.js';

// shirtMap values are canvas painters: a texture is made lazily on first use
export const CAST = {
  harry: { name: 'Harry Zhong', height: 1.74, skin: '#d9a77f', hair: '#120f0e', hairStyle: 'side', shirt: '#4a4d58', hood: '#3e414b', hoodie: true, pants: '#2c3a5a', shoes: '#f0f0f0', glasses: '#1a1a1a', backpack: '#26262c', mouth: 'neutral', bio: '16. Junior. Quit robotics in July to do pickups. Has been keeping one secret for three months.' },
  eric: { name: 'Eric Zhong', height: 1.34, headScale: 1.2, skin: '#e0b088', hair: '#0f0c0b', hairStyle: 'bowl', shirt: '#4f9a3f', hood: '#3f8a31', hoodie: true, shirtMap: 'creeper', pants: '#34466a', shoes: '#e4e4e4', mouth: 'smile', eye: '#2a1a10', bio: '9. Creeper hoodie, bowl cut, General Dumpling. Thinks Dad is on a long trip.' },
  ericBackpack: { name: 'Eric (school)', height: 1.34, headScale: 1.2, skin: '#e0b088', hair: '#0f0c0b', hairStyle: 'bowl', shirt: '#4f9a3f', hood: '#3f8a31', hoodie: true, shirtMap: 'creeper', pants: '#34466a', shoes: '#e4e4e4', mouth: 'smile', backpack: '#3a7a2a', bio: 'Eric at pickup, with the backpack that weighs more than he does.' },
  ericSad: { name: 'Eric (upset)', height: 1.34, headScale: 1.2, skin: '#e0b088', hair: '#0f0c0b', hairStyle: 'bowl', shirt: '#4f9a3f', hood: '#3f8a31', hoodie: true, shirtMap: 'creeper', pants: '#34466a', shoes: '#e4e4e4', mouth: 'frown', bio: 'Eric after he finds out.' },
  mom: { name: 'Mom (Lin Zhong)', height: 1.62, skin: '#dcb08a', hair: '#141010', hairStyle: 'bun', shirt: '#3f8a96', shirtMap: 'scrubs', sleeves: 'short', pants: '#3f8a96', pantsPattern: 'fabric', shoes: '#eeeeee', lanyard: true, mouth: 'neutral', bio: 'ER nurse. Double shifts. Cries in the bathroom at 2 AM where she thinks nobody hears.' },
  dad: { name: 'Dad (Wei Zhong)', height: 1.78, skin: '#d4a47c', hair: '#161212', hairStyle: 'side', shirt: '#3a4a6a', pants: '#2a2a30', pantsPattern: 'fabric', shoes: '#3a2a1a', glasses: '#1a1a1a', buttons: true, belt: true, mouth: 'neutral', bio: 'Moved to San Jose in July. Forty minutes away. Asked Harry to keep it quiet.' },
  priya: { name: 'Priya', height: 1.62, skin: '#a8704a', hair: '#120c0a', hairStyle: 'long', shirt: '#6a4a9a', hood: '#5a3a8a', hoodie: true, pants: '#26262e', shoes: '#f0f0f0', mouth: 'smile', backpack: '#e8a0b0', bio: 'Harry\'s lab partner. Calls him "ghost." Wants six dumplings.' },
  delgado: { name: 'Mr. Delgado', height: 1.78, skin: '#c89468', hair: '#2a2420', hairStyle: 'balding', shirt: '#d6d0bf', pants: '#3a3a40', pantsPattern: 'fabric', shoes: '#2a1a10', glasses: '#3a3020', mustache: true, thickBrows: true, buttons: true, tie: true, mouth: 'neutral', bio: 'AP Chem. Has told the "exothermic" joke every year since 2009.' },
  gus: { name: 'Gus', height: 1.72, skin: '#e0b898', hair: '#8a8a8a', hairStyle: 'short', shirt: '#4a5a6a', pants: '#4a5a6a', pantsPattern: 'fabric', shoes: '#1a1a1a', cap: '#2a3a5a', mustache: true, mouth: 'neutral', bio: 'Crossing guard at Eric\'s school. Has seen things.' },
  tyler: { name: 'Tyler Moss', height: 1.42, headScale: 1.12, skin: '#e8c0a0', hair: '#6a4a2a', hairStyle: 'side', shirt: '#3050a0', pants: '#2a2a30', shoes: '#b02020', mouth: 'neutral', bio: 'Missing since September. He played Verity first.' },
  dale: { name: 'Dale Whitcomb', height: 1.8, skin: '#d8b090', hair: '#1a1410', hairStyle: 'short', shirt: '#1d4a2c', pants: '#2a2a30', shoes: '#1a1a1a', glasses: '#2a3a8a', beard: true, mustache: true, mouth: 'neutral', bio: 'Made the Verity mod in 2019. His last devlog is TAPE 01.' },
};
const STUDENT_SHIRTS = ['#8a2a2a', '#2a4a8a', '#c8c8c8', '#2a2a2a', '#c8a030', '#3a6a3a', '#8a5a9a'];
const STUDENT_SKIN = ['#e8c0a0', '#c89468', '#8a5a3a', '#dcb08a', '#f0d0b0', '#6a4028'];
const STUDENT_HAIR = ['#141010', '#4a2a1a', '#8a6a3a', '#1a1a1a', '#c8a060'];
const STUDENT_STYLES = ['short', 'side', 'long', 'buzz', 'bowl', 'spiky', 'bun'];
export function studentSpec(i) {
  const style = STUDENT_STYLES[(i * 3) % STUDENT_STYLES.length];
  return { name: 'Student ' + i, height: 1.6 + (i % 4) * 0.05, skin: STUDENT_SKIN[i % STUDENT_SKIN.length], hair: STUDENT_HAIR[(i * 5) % STUDENT_HAIR.length], hairStyle: style, shirt: STUDENT_SHIRTS[(i * 7) % STUDENT_SHIRTS.length], hoodie: i % 3 === 0, pants: i % 2 ? '#2a3350' : '#3a3a3a', shoes: i % 2 ? '#f0f0f0' : '#202020', mouth: i % 3 ? 'neutral' : 'smile', backpack: i % 2 ? STUDENT_SHIRTS[(i * 3) % 7] : undefined, detail: 0.5 };
}

const shirtMaps = {};
function resolveShirtMap(spec) {
  if (!spec.shirtMap) return null;
  if (shirtMaps[spec.shirtMap]) return shirtMaps[spec.shirtMap];
  const canvas = spec.shirtMap === 'creeper' ? creeperHoodieCanvas() : scrubsCanvas();
  return (shirtMaps[spec.shirtMap] = new Texture(canvas, { repeat: true, mipmaps: true, name: spec.shirtMap }));
}

export function person(key, over = {}) {
  const spec = key === 'student' ? studentSpec(over.seed ?? 0) : { ...CAST[key], ...over };
  const ch = createHuman({ ...spec, detail: over.detail ?? spec.detail });
  const map = resolveShirtMap(spec);
  if (map) { ch.materials.get('shirt').map = map; ch.materials.get('hood') && (ch.materials.get('hood').map = null); }
  ch.userData.key = key;
  return ch;
}

export function dale() { return person('dale'); }
export const grinner = () => createGrinner();

// ------------------------------------------------------------------ Verity herself
let faceTexCache = {};
export function verityFaceTexture(kind) {
  if (!faceTexCache[kind]) faceTexCache[kind] = new Texture(verityFaceCanvas(kind), { repeat: false, mipmaps: true, name: 'verity-' + kind });
  return faceTexCache[kind];
}
// A glowing yellow sphere with a face. setFace('happy' | 'grin' | ...). Faces +Z.
export function makeVeritySphere(radius = 0.4) {
  const node = new Node('Verity');
  const mat = new Material({ name: 'Verity', color: '#ffffff', roughness: 0.35, emissive: '#ffffff', emissiveStrength: 0.55, emissiveMap: true, map: verityFaceTexture('happy') });
  const ball = new Mesh(sphere({ radius, widthSegments: 40, heightSegments: 24 }), mat, 'Verity ball');
  ball.setEuler(0, 90, 0); // put the face (texture centre) toward +Z
  ball.castShadow = false;
  node.add(ball);
  const glow = new Light('point', { color: '#ffd45a', intensity: 2.2, range: 5 });
  node.add(glow);
  node.userData.glow = glow;
  node.userData.face = 'happy';
  node.userData.setFace = (k) => { if (node.userData.face === k) return; node.userData.face = k; mat.map = verityFaceTexture(k); };
  return node;
}
