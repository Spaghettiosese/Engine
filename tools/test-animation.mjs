// Validates the generated cowboy clips: ground contact, foot sliding, loop seams.
import { cowboyDefinition } from '../src/content/cowboy.js';
import { grinnerDefinition } from '../src/content/monster.js';
import { Character } from '../src/engine/character.js';
import { sampleClip } from '../src/engine/animation.js';
import { vec3 } from '../src/engine/math.js';
let fail = 0;
for (const def of [cowboyDefinition(), grinnerDefinition()]) {
const ch = new Character(def);
const sk = ch.skeleton;
const idx = (n) => sk.boneIndex(n);
console.log('--', ch.name);
const restAnkle = sk.bones[idx('foot.L')].head[1], restBall = sk.bones[idx('toe.L')].head[1];
for (const clip of ch.mixer.clips.values()) {
  const N = 120, v = clip.rootMotion[2];
  const rows = [];
  let minY = { foot: 9, toe: 9, hand: 9, knee: 9, tip: 9 }, seam = 0, grip = 0;
  const slide = { L: 0, R: 0 };
  let prev = null;
  for (let k = 0; k <= N; k++) {
    const t = (k / N) * clip.duration;
    sampleClip(clip, sk, t, ch.mixer.pose); sk.copyPose(ch.mixer.pose); sk.update();
    const z = v * t;
    for (const s of ['L', 'R']) for (const f of ['index', 'middle', 'ring', 'pinky']) {
      const tip = sk.worldTail(idx(f + '2.' + s));
      minY.tip = Math.min(minY.tip, tip[1]);
      grip = Math.max(grip, vec3.dist(tip, sk.worldHead(idx('hand.' + s))));
    }
    const cur = {};
    for (const s of ['L', 'R']) {
      const ankle = sk.worldHead(idx('foot.' + s)), toe = sk.worldHead(idx('toe.' + s)), toeTip = sk.worldTail(idx('toe.' + s));
      const hand = sk.worldTail(idx('hand.' + s)), knee = sk.worldHead(idx('shin.' + s));
      minY.foot = Math.min(minY.foot, ankle[1]); minY.toe = Math.min(minY.toe, toeTip[1], toe[1]); minY.hand = Math.min(minY.hand, hand[1]); minY.knee = Math.min(minY.knee, knee[1]);
      cur[s] = { ball: [toe[0], toe[1], toe[2] + z], ankle: [ankle[0], ankle[1], ankle[2] + z] };
      // sliding: while the ball is on the ground its world z shouldn't move
      if (prev && toe[1] < restBall + 0.002 && prev[s].ball[1] < restBall + 0.002 && ankle[1] < restAnkle + 0.003 && prev[s].ankle[1] < restAnkle + 0.003) slide[s] = Math.max(slide[s], Math.abs(cur[s].ball[2] - prev[s].ball[2]) * N / clip.duration);
    }
    if (k === 0) rows.push(sk.world.slice());
    if (k === N) { const a = rows[0], b = sk.world; for (let i = 0; i < a.length; i++) seam = Math.max(seam, Math.abs(a[i] - b[i])); }
    prev = cur;
  }
  const line = `${clip.name.padEnd(6)} dur ${clip.duration}s speed ${v} | min ankle ${minY.foot.toFixed(3)} min toe ${minY.toe.toFixed(3)} min hand ${minY.hand.toFixed(3)} min knee ${minY.knee.toFixed(3)} | planted-foot slide ${slide.L.toFixed(3)}/${slide.R.toFixed(3)} m/s | fingertip min ${minY.tip.toFixed(3)} max reach ${grip.toFixed(3)} | loop seam ${seam.toExponential(1)}`;
  const bad = minY.tip < -0.005 || (clip.name === 'Run' && grip > 0.1) || (clip.name === 'Crawl' && minY.hand > 0.08) || seam > 1e-3 || minY.toe < -0.02 || slide.L > 0.1 || slide.R > 0.1;
  if (bad) fail++;
  console.log((bad ? 'FAIL ' : 'ok   ') + line);
}
}
process.exit(fail ? 1 : 0);
