// CHAPTER THREE — HOME. Shoes off, dumplings, and a mod called Verity.
import * as E3 from '../../src/engine/index.js';
import { HouseLevel } from './house.js';
import { chapterCard, yawTo } from './common.js';
import { README } from './lore.js';
import { homework, arcadeFolder, setupActivities, priyaThread } from './activities.js';
import { runArcade } from './arcade.js';
import { plasticMat } from './mats.js';

export async function chapterHome(g) {
  const L = new HouseLevel(g, 'day');
  g.setLevel(L);
  const ui = g.ui, P = L.player;
  const say = (n, t, o) => ui.say(n, t, o), think = (t) => ui.think(t), E = (t) => say('Eric', t), H = (t) => say('Harry', t);
  g.control = 'none';
  g.setClock(15, 41); g.clockRate = 1 / 6;
  g.audio.setAmbience('house');
  ui.osd({ mode: 'play', date: 'TUE OCT 13 2026' });
  await chapterCard(g, 'CHAPTER THREE', 'HOME', '3:41 PM · 1142 ALDER LANE');
  const eric = L.addEric('ericBackpack');
  eric.place(-7.6, -1.4, Math.PI);
  P.place(-8.2, -0.8, 0, -0.05);
  g.control = 'walk';
  g.input.setTouchMode('walk');
  ui.crosshair(true);
  g.audio.door(false);
  await ui.fade(0, 1.0);
  ui.bark('Eric', 'SHOES OFF! House rules!');
  eric.walkPath([[-6.4, -0.9]], 2).then(async () => {
    await g.wait(0.6);
    await eric.walkPath([[-7, -4], [-3, -4.5], [3.9, -4.3]], 2.4);
    eric.face(8.6, -4.5);
  }).catch(() => {});
  ui.setObjective('Take off your shoes');

  // ---- shoes
  let shoesOff = false;
  L.addInteract(L.shoeRackObj, { id: 'shoes', prompt: 'Take off your shoes' });
  const which = await g.dir.race({ shoes: () => (L.used.get('shoes') || 0) > 0, walked: () => P.pos.z < -3.4 || P.pos.x > -4.6 });
  if (which === 'shoes') {
    shoesOff = true;
    L.enable('shoes', false);
    g.audio.step('carpet', 1);
    await think('Shoes off. Slippers on. Nai Nai\'s rule, then Mom\'s rule, now mine.');
    g.achieve('shoes');
  } else {
    ui.bark('Eric', 'HARRY. SHOES. Mom is going to KNOW. She always KNOWS.');
    g.achieve('noshoes');
    g.flags.shoesOn = true;
    L.interact('shoes').prompt = 'Take off your shoes (late)';
    L.interact('shoes').onUse = () => { L.enable('shoes', false); ui.bark('Eric', 'Too late. The floor remembers.'); };
  }

  // ---- optional things around the house
  setupHomeOptional(g, L);
  setupActivities(g, L, { onPlayed: (id, sc) => { if (id === 'dash') { if (sc > 12) { ui.bark('Eric', 'WHAT. NO. That\'s not fair. You were the dumpling the whole time.', 5); g.achieve('beatEric'); } else ui.bark('Eric', 'HA! Twelve is the WORLD RECORD.', 4); } } });

  // ---- Mom's note
  ui.setObjective("Read Mom's note on the fridge");
  L.addInteract(L.momNote, { id: 'note', prompt: "Read Mom's note", range: 2.4 });
  await L.waitUse('note');
  L.enable('note', false);
  await ui.note(`<p>Harry —</p><p>Double shift again, sorry!! Home around midnight.</p><p>Dumplings in the freezer. Remember: when the water boils, add cold water. <b>THREE TIMES.</b> Then they're done.</p><p>Eric does homework BEFORE games. I mean it.</p><p>Wear a jacket if you go out. It's going to storm.</p><p>爱你们. Love you both. — Mom</p><p style="font-size:0.8em">P.S. Don't let your brother on the computer after 9.</p>`);
  await think('"Home around midnight." She said that yesterday too.');

  // ---- homework first (Mom's orders)
  ui.setObjective('Help Eric with his math homework (living room)');
  eric.lookAtCam = true;
  L.addInteract(eric, { id: 'hwEric', prompt: 'Help Eric with homework', range: 2.6 });
  await L.waitUse('hwEric');
  L.enable('hwEric', false);
  await E('Ugh. FINE. Mrs. Park gave us five problems and they are all evil.');
  await E('You do the pencil. I\'ll do the... supervising.');
  const hw = await homework(g);
  if (hw >= 5) { await E('FIVE OUT OF FIVE. We\'re geniuses. Well. You are. I supervised.'); g.achieve('homework'); }
  else if (hw >= 3) await E(`${hw} out of 5. That\'s passing. Mom says passing is passing.`);
  else await E(`${hw} out of 5?? Harry, you\'re in HIGH SCHOOL.`);
  await H('Math is hard when a nine-year-old is breathing on you.');
  eric.lookAtCam = false;
  await priyaThread(g);

  // ---- dumplings
  ui.setObjective('Make the dumplings (freezer)');
  L.addInteract(L.fridgeObj, { id: 'freezer', prompt: 'Get dumplings from the freezer' });
  await L.waitUse('freezer');
  L.enable('freezer', false);
  g.audio.door(true);
  await think('A giant bag. Mom folds like two hundred at a time on Sundays. Pork and chive.');
  ui.setObjective('Cook the dumplings (stove)');
  const potDef = L.addInteract(L.potObj, { id: 'pot', prompt: 'Put the dumplings in the pot' });
  await L.waitUse('pot');
  const barkLines = ['Harry, what\'s taking so long? I\'m withering.', 'Make thirty! No, forty! I\'m a growing boy!', 'I can smell them. I\'m dying. Tell Mom I loved her.'];
  for (let i = 0; i < 3; i++) {
    potDef.enabled = false;
    ui.setObjective(`Wait for the water to boil (${i + 1}/3)`);
    g.audio.boil(3.5);
    await g.wait(3.6);
    if (barkLines[i]) ui.bark('Eric', barkLines[i]);
    g.audio.boil(2);
    potDef.prompt = `Add cold water (${i + 1}/3)`;
    potDef.enabled = true;
    ui.setObjective(`It's boiling! Add cold water (${i + 1}/3)`);
    await L.waitUse('pot');
    g.audio.noise({ f: 900, q: 0.6, dur: 0.6, vol: 0.08 });
  }
  potDef.enabled = false;
  await think('Three times. Done. Mom would be proud. Mom would also say they\'re a little overcooked.');
  g.achieve('dumplings');
  // plates on the table
  for (const [x, z] of [[-3.3, -16.3], [-3.3, -15.7]]) {
    const plate = new E3.Mesh(E3.cylinder({ radiusTop: 0.14, radiusBottom: 0.1, height: 0.02, radialSegments: 16 }), plasticMat('#f0f0ea'), 'Plate'); plate.position.set([x, 0.77, z]); L.scene.add(plate);
    for (let k = 0; k < 6; k++) { const d = new E3.Mesh(E3.sphere({ radius: 0.035, widthSegments: 8, heightSegments: 6 }), plasticMat('#efe4c8'), 'Dumpling'); d.position.set([x + Math.cos(k) * 0.07, 0.8, z + Math.sin(k) * 0.07]); d.scale.set([1.3, 0.7, 1]); L.scene.add(d); }
  }
  ui.bark('Harry', 'Eric! Food!');
  eric.walkPath([[2.5, -7.6], [2.5, -10.5], [-4, -10.5], [-4, -12.8], [-3.3, -14.7]], 2.6).then(() => {
    eric.place(-3.3, -15.15, Math.PI);
    eric.sit(true, 0);
  }).catch(() => {});
  ui.setObjective('Sit down and eat with Eric');
  L.addInteract(L.hitbox(0.5, 0.9, 0.5, -3.3, 0, -16.8), { id: 'sit', prompt: 'Sit down' });
  await L.waitUse('sit');
  await g.until(() => eric.sitting);
  g.control = 'look';
  P.place(-3.3, -17.0, Math.PI, -0.3);
  P.eye = 1.12;
  P.lookLimit = { yaw: Math.PI, range: 1.4, pmin: -0.9, pmax: 0.5 };
  await g.wait(0.6);
  // dinner
  await E('Harry. Harry. Harry.');
  await H('What.');
  await E('Do you think Dad eats dumplings in China?');
  await g.wait(1.0);
  await H('...Probably. Better ones.');
  await E('No way. Mom\'s are the best in the world. Verity would say so. Because it\'s TRUE.');
  await H('You really like this Verity thing, huh.');
  await E('It\'s gonna be my best friend. Other than you. You\'re like... third.');
  await H('Who\'s second?');
  await E('General Dumpling.');
  await H('I\'m losing to a stuffed panda.');
  await E('He\'s a very good listener.');
  // the TV turns itself on
  L.drawTV('news');
  g.audio.staticBurst(0.4, 0.08);
  await g.wait(1.2);
  await E('...Who turned on the TV? I can hear it from here.');
  await H('It does that. The timer thing.');
  await E('We don\'t have a timer thing.');
  L.drawTV('off');
  g.audio.click();
  await g.wait(1.0);
  await E('Can I ask you something?');
  await H('You\'re going to anyway.');
  await E('If somebody asked you a question, and the true answer would make them really sad... would you tell them?');
  const c = await ui.choose(['"Depends."', '"Always tell the truth."', '"No. Sometimes lying is kind."']);
  if (c === 0) { await E('That\'s a grown-up answer. I hate grown-up answers.'); }
  else if (c === 1) { await E('...Okay.'); await think('Great, Harry. Very convincing. Coming from you.'); }
  else { await E('Hm.'); }
  await E('Verity says lies are like mold. They grow in the dark. Then one day the whole bread is gross.');
  await H('When did Verity say that?');
  await E('In the... video. Obviously. TheBlockBoyz video.');
  g.flags.moldClue = true;
  await E('Okay I\'m done. Can we play NOW? Please please please please—');
  await H('Go. Set it up. I\'ll be there in a sec.');
  eric.sit(false);
  eric.walkPath([[-4, -12.8], [-4, -10.5], [14.5, -10.5], [14.5, -7.6], [17.9, -5.5]], 2.8).then(() => eric.face(19.4, -4.5)).catch(() => {});
  const t0 = g.time;
  await g.until(() => { P.eye = 1.12 + Math.min(1, (g.time - t0) / 0.7) * 0.5; return g.time - t0 > 0.7; });
  P.lookLimit = null;
  P.place(-3.3, -17.4, Math.PI, 0);
  g.control = 'walk';
  L.drawPC('mc');
  ui.setObjective('Play Minecraft with Eric (the den computer)');
  ui.hint('Take your time. Explore the house, play the arcade, watch old tapes.', 5);
  // Eric's arcade challenge
  let challenged = false;
  L.updaters.push(() => {
    if (!challenged && P.pos.x > 9.5 && P.pos.z > -9 && !ui.busy) {
      challenged = true;
      ui.bark('Eric', 'WAIT. Before Minecraft: beat my Dumpling Dash score on Dad\'s arcade. TWELVE. You can\'t.', 6);
    }
  });

  // ---- the PC
  const pcHit = L.hitbox(0.6, 0.6, 0.9, 19.4, 0.75, -4.55);
  L.addInteract(pcHit, { id: 'pc', prompt: 'Use the computer', range: 2.4 });
  for (;;) {
    await L.waitUse('pc');
    const res = await usePC(g, L, eric);
    if (res === 'play') break;
  }
  g.control = 'none';
  ui.setObjective(null);
  ui.crosshair(false);
  await ui.fade(1, 1.4);
  g.desktop.close();
}

async function usePC(g, L, eric) {
  const ui = g.ui, P = L.player, think = (t) => ui.think(t);
  g.control = 'none';
  ui.prompt(null);
  await g.camTo(L.spots.pcSeat, L.spots.pcLook, 0.9);
  if (!g.flags.pcIntro) {
    g.flags.pcIntro = true;
    await ui.say('Eric', 'It\'s already open! I put the mod in and everything. Just click Minecraft!');
  }
  let result = null;
  const D = g.desktop;
  D.open({
    icons: [
      { id: 'mc', label: 'Minecraft', art: 'mc', open: (d) => launcher(d) },
      { id: 'games', label: 'Games', art: 'folder', open: (d) => arcadeFolder(g, d) },
      { id: 'chemq', label: 'CHEM STUDY.exe', art: 'txt', open: async () => { const r = await runArcade(g, 'chem'); if (r.score >= 5) { g.achieve('chem'); g.flags.studied = true; } } },
      { id: 'readme', label: 'verity_README.txt', art: 'txt', open: (d) => { d.notepad('verity_README.txt — Notepad', README); g.flags.readReadme = true; } },
      { id: 'downloads', label: 'Downloads', art: 'folder', open: (d) => downloads(d) },
      { id: 'hw', label: 'eric spelling hw.txt', art: 'txt', open: (d) => d.notepad('eric spelling hw.txt', 'SPELLING WORDS — Mrs. Park — due Wed\n\n1. because\n2. beautiful\n3. secret\n4. truth\n5. idk\n6. idk\n7. i dont know how to spell this one\n\n-Eric Zhong') },
      { id: 'chem', label: 'chem notes.txt', art: 'txt', open: (d) => d.notepad('chem notes.txt', 'stoichiometry notes\n\nmole = 6.022 x 10^23 of something\ngrams -> moles -> moles -> grams\n\nlimiting reagent = whatever runs out first\n\n(note to self: you are the limiting reagent)') },
      { id: 'photos', label: "Dad's Photos", art: 'lock', open: (d) => { const w = d.window("Dad's Photos", '<div class="dt-error"><div>This folder is password protected.<br><br>Hint: <i>eric\'s birthday</i></div></div><div class="dt-btnrow"><button class="dt-btn">Cancel</button></div>'); w.querySelector('.dt-btn').onclick = () => w.remove(); g.dir.until(() => true).then(() => think('Dad set that up. I don\'t want to look. Not tonight.')).catch(() => {}); } },
      { id: 'bin', label: 'Recycle Bin', art: 'bin', open: (d) => { d.window('Recycle Bin', '<div class="dt-files"><div class="dt-file"><span>dad_voicemail_07-14.m4a</span><span>deleted by: Mom</span></div><div class="dt-file"><span>new folder (3)</span><span>deleted by: Eric</span></div></div>'); g.flags.sawVoicemail = true; } },
    ],
  });
  const launcher = (d) => {
    const w = d.window('Minecraft Launcher', `<div class="dt-launch"><div class="mcl-logo">MINECRAFT</div><small>Installation: <b>Verity Edition</b> (1.20.1 + verity-0.9.1.jar)</small><button class="mcl-play ui-touchable">PLAY</button><small>Player: hzhong_09 · Online: EricTheGreat_</small></div>`, { cls: 'wide' });
    w.querySelector('.mcl-play').onclick = () => { g.audio.click(); d.fire('play'); };
  };
  const downloads = (d) => {
    d.window('Downloads', `<div class="dt-files">
      <div class="dt-file"><span>verity-0.9.1.jar</span><span>Sat 10/10 · 11:52 PM</span></div>
      <div class="dt-file"><span>nainai_dumpling_recipe.pdf</span><span>2/3/2024</span></div>
      <div class="dt-file"><span>MinecraftInstaller.exe</span><span>6/21/2023</span></div>
      <div class="dt-file"><span>robotics_regionals_final_v7_FINAL.zip</span><span>4/12/2025</span></div></div>`);
    if (!g.flags.sawDownload) { g.flags.sawDownload = true; g.dir.until(() => true).then(() => think('verity-0.9.1.jar. Downloaded Saturday. 11:52 PM. ...Eric told me he found out about it today.')).catch(() => {}); }
  };
  result = await D.wait(['play', 'leave']);
  D.close();
  if (result === 'play') {
    await ui.say('Eric', 'Okay okay okay. I\'m getting my chair. Don\'t start without me. I mean start. I\'ll join.');
    return 'play';
  }
  P.syncFromCamera();
  P.place(17.9, -4.5, P.yaw, P.pitch);
  g.control = 'walk';
  g.input.setTouchMode('walk');
  g.input.requestLock();
  return 'leave';
}

function setupHomeOptional(g, L) {
  const ui = g.ui, think = (t) => ui.think(t), say = (n, t) => ui.say(n, t);
  L.optional(L.altarObj, 'altar', "Bow to Nai Nai's portrait", async () => {
    g.audio.chime();
    await think('Nai Nai. Incense, oranges, the good photo where she\'s almost smiling.');
    await think('Hi, Nai Nai. Watch out for us tonight, okay? Mom\'s working. Dad\'s... you know where Dad is.');
    g.achieve('nainai');
  });
  L.optional(L.kevinObj, 'kevin', 'Talk to Kevin (the smart speaker)', async () => {
    L.kevinColor('#40c0ff');
    g.audio.chime();
    await say('Kevin', 'Hi! I\'m HomePal. How can I help?');
    await say('Harry', 'Kevin, play something.');
    await say('Kevin', 'Playing "Lo-fi beats to do homework to."');
    g.audio.setMusic('warm');
    await think('Dad bought Kevin last Christmas. Eric named him. Eric says "please" and "thank you" to him.');
    g.achieve('kevin');
    L.kevinColor('#2a4a6a');
  });
  L.optional(L.tvObj, 'tv', 'Turn on the TV', async () => {
    L.drawTV('news');
    g.audio.staticBurst(0.3, 0.06);
    await think('The news. Tyler Moss again. They keep showing the same school photo.');
    await think('"The last thing on his screen was a smiley face." Kid probably just left a game open.');
    L.drawTV('off');
  });
  L.optional(L.drawing, 'drawing', "Look at Eric's drawing", async () => {
    await think('Eric drew a yellow ball with a smiley face. "VERITY + ERIC. BFF 4 EVER."');
    await think('It\'s dated in the corner. 10/10. That was Saturday.');
    g.flags.drawingClue = true;
  });
  L.optional(L.drawing2, 'drawing2', "Look at Eric's drawing", async () => {
    await think('Another Verity drawing. Eric really likes this thing. 10/10 again.');
  });
  L.optional(L.panda, 'panda', 'General Dumpling', async () => {
    await think('General Dumpling. Commander of the bed. He\'s missing an eye. Eric says he lost it "in the war."');
  });
  L.optional(L.tablet, 'tablet', "Eric's tablet", async () => {
    await think('Eric\'s tablet. Lock screen is a picture of Dad holding him at the aquarium.');
    await think('Passcode protected. It\'s probably 1234. I\'m not checking.');
  });
  L.optional(L.hitbox(2.0, 0.2, 1.0, 18.9, 0, -17.5), 'underbed', 'Look under the bed', async () => {
    await think('Socks. A juice box. Something yellow stuck to the bottom of the bed frame.');
    L.sticker3.visible = false;
    L.enable('underbed', false);
    await g.collectSticker('s3');
  });
  L.optional(L.facedown, 'facedown', 'Pick up the photo', async () => {
    await think('It\'s Mom and Dad\'s wedding photo. Face down.');
    await think('She didn\'t throw it away. She just doesn\'t want to look at it.');
  });
  L.optional(L.jewelry, 'jewelry', 'Jewelry box', async () => {
    await think('Mom\'s jewelry box. Nai Nai\'s jade bracelet is in there. Nobody\'s allowed to touch it.');
  });
  L.optional(L.tarp, 'dadcar', "Dad's car", async () => {
    await think('Dad\'s old car. He took the new one. He said he\'d come back for this one "when things settle down."');
    await think('Things have been settling down since July.');
  });
  L.optional(L.hit.boxes, 'boxes', "Dad's boxes", async () => {
    await think('"DAD — BOOKS." "DAD — WINTER." "DAD — MISC." Mom labeled them. Eric thinks they\'re for his "trip."');
  });
  L.optional(L.breaker, 'breakerDay', 'Breaker box', async () => {
    await think('The breaker box. Mom taped a note inside the door. Something about the garage heater.');
  });
  L.optional(L.harryDesk, 'harrydesk', 'Your desk', async () => {
    await think('Chem textbook. Unopened since... it\'s been a while.');
    await think('Regional robotics trophy. I told everyone I quit because I got bored.');
    await think('I quit because practice ends at 5:30, and Eric gets out at 3:15.');
    g.flags.roboticsTruth = true;
  });
  L.optional(L.hitbox(0.9, 0.4, 0.6, -8, 0.4, -0.3), 'frontdoorDay', 'Front door', async () => {
    await think('It\'s getting dark out. Storm clouds over the hills. Mom said wear a jacket.');
  });
}
