// Things to do around the Zhong house: the arcade, homework, the piano,
// old home videos and texting Priya.
import { runArcade, ARCADE } from './arcade.js';

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ---------------------------------------------------------------- homework
const MATH = [
  ['7 × 8 = ?', ['54', '56', '63', '48'], 1, 'Seven eights are... fifty-six. I KNEW that.'],
  ['144 ÷ 12 = ?', ['11', '14', '12', '10'], 2, 'Twelve. Like a dozen dumplings.'],
  ['Round 3,462 to the nearest hundred.', ['3,400', '3,500', '3,460', '4,000'], 1, 'Six is five or more, so it goes UP. Okay okay.'],
  ['1/2 + 1/4 = ?', ['2/6', '3/4', '1/8', '2/4'], 1, 'Three quarters. Like three quarters of a pizza. Which I would eat.'],
  ['Mom folded 200 dumplings. Eric ate 37. How many are left?', ['163', '173', '237', '167'], 0, 'One sixty-three. ...I only ate like thirty.'],
];

export async function homework(g) {
  const ui = g.ui;
  g.input.exitLock();
  const prev = g.control; g.control = 'none';
  let i = 0, right = 0, fb = '';
  let done = false;
  const render = () => {
    const q = MATH[i];
    return `<div class="hw ui-touchable"><h3>Math — Mrs. Park — Eric Z.</h3><div class="q">${esc(q[0])}</div>
      <div class="opts">${q[1].map((o, k) => `<button data-k="${k}">${esc(o)}</button>`).join('')}</div><div class="fb">${esc(fb)}</div></div>`;
  };
  const el = ui.showPanel(render());
  const bind = () => el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    if (done || !MATH[i]) return;
    const q = MATH[i];
    if (+b.dataset.k === q[2]) { right++; g.audio.chime(); ui.bark('Eric', q[3], 3); fb = ''; }
    else { g.audio.locked(); ui.bark('Eric', ['Wrong! Even I knew that!', 'Harry. HARRY. No.', 'Are you sure you\'re in high school?'][i % 3], 3); fb = 'Correct answer: ' + q[1][q[2]]; }
    i++;
    if (i >= MATH.length) { done = true; return; }
    el.innerHTML = render(); bind();
  }));
  bind();
  await g.dir.until(() => done);
  ui.hidePanel();
  g.control = prev;
  g.flags.homework = right;
  return right;
}

// ---------------------------------------------------------------- arcade window on the PC
export function arcadeFolder(g, d) {
  const w = d.window('Games', `<div class="dt-files">${Object.entries(ARCADE).filter(([k]) => k !== 'chem').map(([k, v]) => `<button class="dt-file ui-touchable" data-g="${k}" style="cursor:pointer"><span>${esc(v.name)}.exe</span><span>best: ${(g.save.arcade || {})[k] || 0}</span></button>`).join('')}</div>`);
  w.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.g;
    const r = await runArcade(g, id);
    reward(g, id, r.score);
    b.querySelector('span:last-child').textContent = 'best: ' + ((g.save.arcade || {})[id] || 0);
  }));
}

function reward(g, id, score) {
  if (id === 'dash' && score >= 15) g.achieve('dash');
  if (id === 'bricks' && score >= 300) g.achieve('bricks');
  if (id === 'simon' && score >= 8) g.achieve('simon');
  if (id === 'kevin' && score >= 200) g.achieve('kevinShip');
  if (id === 'chem' && score >= 5) g.achieve('chem');
  g.flags.arcadePlays = (g.flags.arcadePlays || 0) + 1;
  if (g.flags.arcadePlays >= 5) g.achieve('gamer');
}

// ---------------------------------------------------------------- set up in-world activities
export function setupActivities(g, L, opts = {}) {
  const ui = g.ui, think = (t) => ui.think(t), say = (n, t) => ui.say(n, t);
  // Dad's arcade cabinet in the den
  L.optional(L.arcade, 'arcadeCab', 'Play the arcade cabinet', async () => {
    g.control = 'none';
    await g.camTo(L.spots.arcadeView, L.spots.arcadeLook, 0.6);
    const pick = await ui.choose(['Dumpling Dash', 'Brick Breaker', 'Verity Says', 'Space Kevin', 'Leave'], { prompt: 'Dad built this cabinet for my tenth birthday. It has four games and one of them is broken.' });
    if (pick < 4) {
      const id = ['dash', 'bricks', 'simon', 'kevin'][pick];
      const r = await runArcade(g, id, { corrupt: !!opts.corrupt });
      reward(g, id, r.score);
      if (opts.onPlayed) opts.onPlayed(id, r.score);
    }
    L.player.syncFromCamera();
    g.control = 'walk';
    g.input.requestLock();
  }, { range: 2.4 });
  // piano
  L.optional(L.pianoObj, 'piano', 'Play the piano', async () => {
    const tune = opts.corrupt ? [76, 79, 84, 79, 81, 79] : [60, 62, 64, 60, 60, 62, 64, 60, 64, 65, 67];
    for (let k = 0; k < tune.length; k++) g.audio.piano(440 * Math.pow(2, (tune[k] - 69) / 12) * (opts.corrupt ? 0.97 : 1), 0.09, k * 0.32);
    await g.wait(0.6);
    await think(opts.corrupt ? 'I didn\'t play that. I played Frère Jacques. The piano played HER song.' : '"Liǎng zhī lǎohǔ." Two tigers. Nai Nai taught me that one. It\'s the same tune as Frère Jacques. Every culture stole it from every other culture.');
    g.achieve('piano');
  });
  // VHS home videos
  const tapes = [
    ['"ERIC 5TH BDAY"', ['A kitchen. A cake shaped like a creeper, badly. Eric, five, blowing out candles and also spitting on the cake.', 'Dad\'s voice from behind the camera: "Make a wish, buddy!" Eric: "I wish for MORE CAKE."', 'Mom laughing. Me, eleven, wearing a paper crown. We all look so... normal.']],
    ['"NEW YEAR 2026"', ['The lion dance. Dad with a dish towel on his head, roaring. Eric riding on his back.', 'Mom filming, saying "Wei, your back, your BACK—"', 'That was nine months ago. It feels like nine years.']],
    ['"DO NOT TAPE OVER"', ['Static. Then the living room, empty, at night. The timestamp says JUL 14 2026. 11:52 PM.', 'Voices off-camera. Dad\'s. Mom\'s. Not yelling. Worse than yelling. Quiet.', 'I don\'t remember anyone recording this. I stop the tape.']],
  ];
  let tapeI = 0;
  L.optional(L.vhsTV, 'vhs', 'Watch a home video', async () => {
    const [label, lines] = tapes[tapeI % tapes.length];
    tapeI++;
    L.drawVHS('blue'); g.audio.click();
    await g.wait(0.6);
    L.drawVHS('home');
    await think(`Tape: ${label}`);
    for (const l of lines) await think(l);
    if (label.includes('NOT TAPE')) { L.drawVHS('static'); g.audio.staticBurst(0.8, 0.1); g.flags.sawJulyTape = true; }
    L.drawVHS('off');
    if (tapeI >= 3) g.achieve('homeVideos');
  });
  // grandfather clock
  L.optional(L.clock, 'gclock', 'Grandfather clock', async () => {
    await think('Nai Nai\'s clock. It came from Guangzhou in a crate in 1994. It\'s been four minutes fast my whole life. Nobody fixes it. It would feel wrong.');
  });
  // toy chest
  if (L.toyChest) L.optional(L.toyChest, 'toys', 'Toy chest', async () => {
    await think('LEGO, three Nerf guns, and a paper crown from a birthday party. The crown from the video. He kept it.');
  });
  // guest room boxes
  L.optional(L.guestBed, 'guestbed', 'Guest bed', async () => {
    await think('Dad slept here for two weeks in June. Nobody said why. We all said "his back hurts."');
  });
  // laundry & bath flavor
  L.optional(L.tub, 'tubLook', 'Bathtub', async () => {
    await think('Eric\'s rubber duck collection. Fourteen ducks. One is dressed as a samurai. His name is Sir Quackington.');
  });
}

// ---------------------------------------------------------------- Priya texts
export async function priyaThread(g) {
  const ui = g.ui;
  ui.phoneNotify('Priya', 'did u get home ok ghost');
  await g.wait(1.0);
  const c = await ui.choose(['Reply: "yeah. making dumplings"', 'Reply: "define ok"', 'Ignore it']);
  if (c === 2) { g.flags.ignoredPriya = true; return; }
  ui.phoneNotify('Harry', c === 0 ? 'yeah. making dumplings' : 'define ok', { me: true, silent: true });
  await g.wait(2.5);
  ui.phoneNotify('Priya', c === 0 ? 'save me like 6. im serious' : 'lol. u ok for real tho? u seemed weird today');
  await g.wait(1.4);
  const c2 = await ui.choose(['Reply: "I\'m fine."', 'Reply: "not really. family stuff. tell you tomorrow?"']);
  if (c2 === 1) {
    g.flags.toldPriya = true;
    ui.phoneNotify('Harry', 'not really. family stuff. tell you tomorrow?', { me: true, silent: true });
    await g.wait(2);
    ui.phoneNotify('Priya', 'ok. boba. my treat. and ur doing my chem hw as payment');
    g.achieve('priya');
  } else {
    ui.phoneNotify('Harry', "I'm fine.", { me: true, silent: true });
    await g.wait(2);
    ui.phoneNotify('Priya', 'ok ghost 👻');
  }
}
