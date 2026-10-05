// CHAPTER FIVE — STATIC. The game crashed. Eric locked himself in the bathroom.
// The house is still lit, but it has started to change.
import { HouseLevel } from './house.js';
import { chapterCard } from './common.js';
import { setupActivities } from './activities.js';

export async function chapterStatic(g) {
  const L = new HouseLevel(g, 'evening');
  g.setLevel(L);
  const ui = g.ui, P = L.player;
  const say = (n, t, o) => ui.say(n, t, o), think = (t) => ui.think(t), H = (t) => say('Harry', t), E = (t) => say('Eric', t, { label: 'Eric (through the door)' });
  g.control = 'none';
  g.setClock(20, 31); g.clockRate = 1 / 5;
  g.audio.setAmbience('house');
  g.audio.rain = 0.35;
  L.stormOn = true; L.thunderT = 20;
  ui.osd({ mode: 'play', date: 'TUE OCT 13 2026' });
  await chapterCard(g, 'CHAPTER FIVE', 'STATIC', '8:31 PM');
  L.drawPC('blue');
  L.door('bathDoor').setOpen(false, true);
  L.door('bathDoor').locked = true;
  L.door('bathDoor').noMonster = true;
  P.place(18.6, -4.55, -Math.PI / 2, -0.05);
  P.eye = 1.22;
  g.control = 'look';
  await ui.fade(0, 1.4);
  await think('The game crashed. Blue screen. "VERITY_HAS_LEFT_THE_GAME."');
  await think('The webcam light is still on. I unplugged it. It\'s still on.');
  const c0 = await ui.choose(['Cover the webcam with a sticky note', 'Leave it']);
  if (c0 === 0) { g.audio.paper(); await think('A yellow sticky note. Better. ...It\'s the same yellow as her. Great.'); }
  const t0 = g.time;
  await g.until(() => { P.eye = 1.22 + Math.min(1, (g.time - t0) / 0.6) * 0.4; return g.time - t0 > 0.6; });
  P.place(17.9, -4.5, Math.PI / 2 + 0.3);
  g.control = 'walk';
  g.input.setTouchMode('walk');
  ui.crosshair(true);
  ui.setObjective('Find Eric');
  setupActivities(g, L, { corrupt: true });
  setupStaticOptional(g, L);

  // ---- Eric's room is empty; he's in the bathroom
  L.optional(L.ericBed, 'emptyBed', 'Eric\'s bed', async () => {
    await think('Empty. General Dumpling is gone too. He took the general. That means it\'s serious.');
  });
  const bathHit = L.hitbox(1.0, 2.0, 0.3, 8.5, 0, -11.75);
  L.addInteract(bathHit, { id: 'bath1', prompt: 'Knock on the bathroom door', range: 2.2 });
  await L.waitUse('bath1');
  L.enable('bath1', false);
  g.audio.knock(2);
  await H('Eric? You in there?');
  await E('Go away.');
  await H('Eric, open the door.');
  await E('No. You lie. Everybody in this house lies. Even Kevin probably lies.');
  const c1 = await ui.choose(['"I\'m sorry. I should have told you in July."', '"Come out. We need to talk about this."', '"It\'s just a dumb game, Eric."']);
  if (c1 === 0) { g.flags.truth = (g.flags.truth || 0) + 1; await E('...Sorry doesn\'t make Dad come back.'); await H('I know. I know it doesn\'t.'); }
  else if (c1 === 1) { await E('YOU talk. I\'m not listening. I\'m putting my fingers in my ears. La la la.'); }
  else { g.flags.truth = (g.flags.truth || 0) - 1; await E('It\'s NOT a game! It\'s DAD!'); }
  await E('I\'m not coming out until Mom gets home. And I\'m telling her you\'re a liar.');
  await think('He\'s crying. Trying not to. Just like Mom in the bathroom at 2 AM. Trying not to.');
  ui.setObjective('Give him a minute. (Explore the house.)');
  await g.wait(12);

  // ---- Mom calls
  for (let i = 0; i < 3; i++) { g.audio.buzz(); await g.wait(0.9); }
  ui.setObjective('Answer your phone');
  ui.hint(g.input.touch ? 'Tap <b>USE</b> to answer.' : 'Press <b>E</b> to answer.', 4);
  await g.until(() => ui.advancePressed() || g.input.wasHit('phone'));
  g.audio.click();
  const M = (t) => say('Mom', t, { label: 'Mom (phone)' });
  await M('Harry? It\'s me. I\'m on break. Eric just texted me two words.');
  await M('"I know." What does he know, Harry?');
  const c2 = await ui.choose(['"He knows about Dad, Ma. Something... told him."', '"Nothing. It\'s a video game thing."']);
  if (c2 === 0) {
    g.flags.truth = (g.flags.truth || 0) + 1; g.flags.momKnows = true;
    await g.wait(1.2);
    await M('...');
    await M('Okay. Okay. That\'s... I should have done it myself. I kept saying "this weekend."');
    await M('I\'m going to try to leave early. I can\'t promise, there was a pileup on the 880.');
    await M('Stay with him. Don\'t let him be alone. 爱你. I love you.');
  } else {
    g.flags.truth = (g.flags.truth || 0) - 1;
    await M('A video game thing. Harry. He texted me at 8:30 at night, "I know."');
    await M('...Fine. I\'ll be home at midnight. We\'ll talk then. All of us.');
    await think('She knows I lied. She always knows. Just like the shoes.');
  }
  // ---- the house starts to change
  ui.setObjective(null);
  await g.wait(2);
  ui.phoneNotify('Unknown', 'hi harry :)');
  await g.wait(3);
  ui.phoneNotify('Unknown', 'want to play hide and seek?');
  await g.wait(2);
  ui.phoneNotify('Unknown', 'eric is hiding. i always find eric :)');
  L.smileyDecal(4, 1.6, -11.9, 0);
  L.drawTV('static');
  g.audio.staticBurst(0.8, 0.12);
  ui.bark('', 'The TV just turned on. In the living room. By itself.', 4);
  ui.setObjective('Check the TV (living room)');
  let ch = 0;
  const channels = [
    ['news', 'Channel 4: the news. "...Tyler Moss\'s parents are asking anyone with information..." Same photo. Same forced smile.'],
    ['weather', 'Channel 7: severe storm warning. "Power outages expected." There\'s a little smiley face drawn on the radar.'],
    ['cooking', 'Channel 12: a cooking show. "Cooking with Verity." "Today we\'re making a family! First, remove the father! :)"'],
    ['dad', 'Channel 19: a home video. Dad. In the kitchen. July. He\'s saying something and the sound is gone.'],
    ['live', 'Channel 22: "LIVE: 1142 ALDER LN." It\'s our living room. From the corner. Something tall is standing by the couch in the picture.'],
    ['tell', 'Channel 23: two words, yellow on black.'],
  ];
  L.optional(L.tvObj, 'tv', 'Change the channel', async () => {
    const [mode, line] = channels[ch % channels.length];
    ch++;
    L.drawTV(mode); g.audio.staticBurst(0.25, 0.08);
    await think(line);
    if (mode === 'live') { g.audio.stinger(); await think('I turn around. The couch. Nothing there. On the TV, it\'s still there.'); }
    if (mode === 'tell') await think('"TELL HIM."');
    if (ch >= channels.length) g.achieve('static');
  });
  await g.until(() => ch >= 5 && !ui.busy);
  L.drawTV('static');
  // Kevin has something to say
  await g.wait(1.5);
  L.kevin('Harry! Want to know a secret? Your daddy ASKED you to keep it. Remember? July 14th. That\'s the truth! :)', { dur: 7 });
  await g.wait(7.5);
  await think('...He did. I forgot. No. I didn\'t forget. I just stopped thinking about it.');
  // the piano plays itself, the arcade grins
  for (const [k, n] of [76, 79, 84, 79, 81, 79].entries()) g.audio.piano(440 * Math.pow(2, (n - 69) / 12) * 0.97, 0.08, k * 0.35);
  L.drawArcade('grin');
  await g.wait(2.5);
  ui.bark('', 'The piano. Nobody\'s at the piano.', 3);
  L.smileyDecal(-4.9, 1.6, -3.5, Math.PI / 2, 0.8);
  L.smileyDecal(10, 1.4, -11.9, 0, 0.6);
  ui.setObjective('Check on Eric (bathroom)');
  L.addInteract(bathHit, { id: 'bath2', prompt: 'Knock on the bathroom door', range: 2.2 });
  await L.waitUse('bath2');
  g.audio.knock(2);
  await H('Eric. Eric, something is wrong with the house. I need you to open the door.');
  await E('...Harry?');
  await E('The lights in here are doing something weird. And the mirror has a smiley face on it. I didn\'t draw it.');
  await H('Unlock the door. Right now.');
  await E('Okay. Okay, I\'m—');
  // blackout
  L.flicker = 1.0;
  await g.wait(1.0);
  L.thunder();
  L.setPower(false);
  L.drawTV('off'); L.drawArcade('off'); L.drawPC('off');
  g.audio.powerDown();
  L.hemi.intensity = 0.04;
  ui.crosshair(false);
  ui.setObjective(null);
  g.control = 'none';
  await g.wait(1.2);
  await E('HARRY?');
  await g.wait(1.5);
  g.audio.slam();
  await g.wait(0.8);
  await ui.fade(1, 1.2);
  g.audio.rain = 0;
}

function setupStaticOptional(g, L) {
  const ui = g.ui, think = (t) => ui.think(t);
  L.optional(L.altarObj, 'altarS', "Nai Nai's altar", async () => { await think('The incense is burning backwards. The smoke is going DOWN. That\'s not how smoke works.'); });
  L.optional(L.kevinObj, 'kevinS', 'Kevin', async () => { await ui.say('Kevin?', 'Hi-hi, Harry! Kevin is taking a nap! I\'m covering his shift! :)'); g.achieve('kevin'); });
  L.optional(L.tarp, 'dadcarS', "Dad's car", async () => { await think('The car\'s back window is fogged up. From the inside.'); });
  L.optional(L.facedown, 'facedownS', 'The photo', async () => { await think('Mom\'s wedding photo. It\'s face UP now. Someone drew a smiley face over Dad.'); });
  L.optional(L.drawing, 'drawingS', "Eric's drawing", async () => { await think('"VERITY + ERIC = BFF." Someone added a line underneath in yellow crayon: "+ HARRY SOON :)".'); });
}
