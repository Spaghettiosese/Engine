// CHAPTER SIX — THE TRUTH. The den. The screen. The question you're not supposed to ask.
import * as E3 from '../../src/engine/index.js';
import { HouseLevel } from './house.js';
import { grinner, person } from './cast.js';
import { Actor } from './actor.js';
import { Obj3 } from './stage.js';
import { askVerity } from './brain.js';
import { README_CORRUPT, STICKERS } from './lore.js';

// Sparks of yellow when she comes apart: the engine's particle system, wrapped to the old burst() call
function makeSparks(L) {
  const ps = new E3.Particles(600, { additive: true }); L.particles.push(ps);
  return { ps, update: (dt) => ps.update(dt), burst: (x, y, z, color, n = 10, speed = 3) => ps.emit([x, y, z], { count: n * 3, color: color === 0xffd21e ? [1.6, 1.2, 0.15, 0.9] : [1.2, 1.1, 0.4, 0.8], colorEnd: [0.4, 0.2, 0, 0], size: 0.12, grow: 0.3, spread: speed, up: speed * 0.6, life: 1.2 }) };
}
import { chapterCard, jumpscare } from './common.js';

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export async function chapterTruth(g) {
  const L = new HouseLevel(g, 'final');
  g.setLevel(L);
  const ui = g.ui, P = L.player;
  const say = (n, t, o) => ui.say(n, t, o), think = (t) => ui.think(t), H = (t) => say('Harry', t), E = (t) => say('Eric', t);
  const VV = (t) => say('VERITY', t);
  g.control = 'none';
  g.setClock(23, 38); g.clockRate = 1 / 20;
  g.audio.setAmbience('finale');
  ui.osd({ mode: 'play', date: 'TUE OCT 13 2026' });
  L.door('denDoor').setOpen(false, true);
  L.setPower(true, true);
  L.lamps.den.intensity = 1.2;
  L.drawPC('grin');
  L.kevinColor('#ffd21e');
  const eric = L.addEric('eric');
  eric.place(18.0, -5.5, 0.56);
  eric.lookAtCam = true;
  // it stands in the corner of the den and waits
  const mon = grinner(); mon.play('Idle', { fade: 0 });
  mon.group = new Obj3(mon);
  let monScale = 0.95;
  mon.group.scale.setScalar(monScale);
  mon.group.position.set(10.4, 0, -0.9);
  mon.group.rotation.y = Math.atan2(18.4 - 10.4, -4.5 + 0.9);
  L.scene.add(mon);
  const particles = makeSparks(L);
  L.updaters.push((dt) => { if (mon.visible) mon.update(dt); particles.update(dt); const s = mon.scale[0]; mon.group.scale.setScalar(s + (monScale - s) * Math.min(1, dt * 3)); });
  const grow = (d) => {
    monScale = Math.max(0.02, monScale + d);
    g.audio.glitch();
    g.retro.u.uGlitch.value = 0.5;
    setTimeout(() => { g.retro.u.uGlitch.value = 0; }, 250);
    if (d > 0) L.flicker = 0.8;
  };

  await chapterCard(g, 'CHAPTER EIGHT', 'THE TRUTH', '11:38 PM');
  P.place(18.6, -4.55, -Math.PI / 2, -0.05);
  P.eye = 1.22;
  P.lookLimit = { yaw: -Math.PI / 2, range: 2.6, pmin: -0.8, pmax: 0.6 };
  g.control = 'look';
  await ui.fade(0, 1.6);
  await think('Her face fills the whole screen. Smiling. Patient.');
  await VV('You came to say goodnight! :)');
  await E('Harry. Delete it. Just delete it.');
  await H('Okay. Okay.');

  // ---- the corrupted desktop
  const D = g.desktop;
  let readme = false;
  D.open({
    mode: 'corrupt', canLeave: false,
    icons: [
      { id: 'jar', label: 'verity.jar (900 MB)', art: 'verity', open: (d) => {
        const w = d.window('Delete verity.jar', `<div class="dt-error"><div>Access denied.<br><br><b>You can't delete the truth, Harry. :)</b></div></div><div class="dt-btnrow"><button class="dt-btn">OK :)</button></div>`);
        w.querySelector('.dt-btn').onclick = () => w.remove();
        g.audio.glitch(); grow(0.02);
      } },
      { id: 'readme', label: 'verity_README.txt', art: 'txt', open: (d) => { d.notepad('verity_README.txt', README_CORRUPT); if (!readme) { readme = true; setTimeout(() => d.fire('readme'), 2600); } } },
      { id: 'hs', label: 'harry_secrets.txt', art: 'txt', open: (d) => d.notepad('harry_secrets.txt', "HARRY'S SECRETS :)\n\n- Dad moved out on July 14. Harry was home. Harry heard everything.\n- Harry and Mom decided not to tell Eric. 'Just until things settle down.'\n- Harry quit robotics so he could pick Eric up at 3:15.\n- Harry got a 64 on his chem test.\n- Harry cried in the car in the school parking lot on August 20. For 11 minutes.\n- Harry practices smiling in the mirror.\n\n(delicious)") },
      { id: 'es', label: 'eric_secrets.txt', art: 'txt', open: (d) => d.notepad('eric_secrets.txt', "ERIC'S SECRETS :)\n\n- Eric installed Verity on Saturday at 11:52 PM.\n- Eric broke Nai Nai's jade bracelet in August. He glued it back. Mom doesn't know.\n- Eric calls Dad's old number every night to hear the voicemail.\n- Eric ate all of Harry's fortune cookies.\n- Eric thinks the divorce is his fault.\n\n(delicious)") },
      { id: 'bin', label: 'Recycle Bin', art: 'bin', open: (d) => d.window('Recycle Bin', '<div class="dt-files"><div class="dt-file"><span>dale_whitcomb/</span><span>deleted by: VERITY</span></div><div class="dt-file"><span>tyler_moss/</span><span>deleted by: VERITY</span></div><div class="dt-file"><span>zhong_family/</span><span>pending...</span></div></div>') },
    ],
  });
  ui.setObjective('Find a way to stop her');
  const nag = setTimeout(() => { if (!readme && D.isOpen) g.ui.bark('Eric', 'The README! Check the README! Maybe there\'s an uninstall thing!'); }, 16000);
  await D.wait(['readme']);
  clearTimeout(nag);
  await g.wait(0.2);
  D.close();
  ui.setObjective(null);
  g.control = 'look';
  await E('Rule four. "Tell the truth first." That wasn\'t there before.');
  await H('"Do not ask Verity what she is." Why would the guy who made her say that?');
  await E('...Unless it\'s the one question she hates.');
  if (g.save.stickers.includes('s7') || g.save.stickers.includes('s6')) {
    await H('Dale. The guy from the stickers. He wrote it down. "Say the true things first. All of them. Out loud, to each other. Then ask her what she is."');
    await H('"I asked in the wrong order."');
  } else {
    await think('Tell the truth first. First, before what? Before we ask her?');
  }
  await VV('Don\'t listen to him, Eric. Harry doesn\'t know HOW to tell the truth. :)');
  // ---- confessions
  await g.camTo([18.6, 1.22, -4.55], [18.0, 1.1, -5.5], 1.0);
  P.syncFromCamera();
  await think('She\'s in the corner. I can see her without looking. Taller than the door. Grinning at us.');
  await H('Eric. Look at me. Not at her. At me.');
  await H('No more secrets. Okay? Starting now.');
  if (g.flags.dadAsked) {
    await H('The night Dad left, he asked me not to tell you. He said he\'d do it "at the right time." I said okay.');
    await H('I shouldn\'t have said okay. It was never mine to keep.');
    grow(-0.06);
  }
  // round 1
  const r1 = await ui.choose(['"Dad isn\'t coming back. It isn\'t your fault. It was never your fault."', '"Dad will come back. I promise. Everything will go back to normal."'], { prompt: 'Tell him about Dad.' });
  if (r1 === 0) {
    g.flags.truth = (g.flags.truth || 0) + 2; g.flags.finalHonest = true; grow(-0.16);
    await E('...You knew I thought it was my fault?');
    await H('It\'s in her file. "Eric thinks the divorce is his fault." It\'s not. It\'s grown-up stuff. It\'s not you.');
    await E('...Okay.');
  } else {
    g.flags.truth = (g.flags.truth || 0) - 2; g.flags.finalHonest = false; grow(0.2);
    await VV('Mmmmm. :)');
    await E('Harry... she got BIGGER.');
  }
  // round 2
  const r2 = await ui.choose(['"I quit robotics so I could pick you up. I\'d do it again. Every day."', '"I\'m scared. I\'ve been scared since July. I just didn\'t want you to see."', '"I don\'t have any secrets."'], { prompt: 'Tell him one of yours.' });
  if (r2 < 2) {
    g.flags.truth = (g.flags.truth || 0) + 1; grow(-0.14);
    if (r2 === 0) { await E('You told everyone you got bored!'); await H('I was never bored. I was just... needed somewhere else.'); }
    else { await E('You\'re scared? You\'re never scared. You\'re sixteen.'); await H('Sixteen is not that old, bud. It turns out.'); }
  } else {
    g.flags.truth = (g.flags.truth || 0) - 1; grow(0.12);
    await VV('Harry cried in the car on August 20th. For eleven minutes. :)');
  }
  await E('...My turn.');
  await E('I broke Nai Nai\'s jade bracelet. In August. I glued it. Mom doesn\'t know.');
  grow(-0.1);
  await E('And I call Dad\'s old phone number every night. Just to hear the voicemail. "Hi, you\'ve reached Wei, leave a message."');
  grow(-0.1);
  await E('And I ate all your fortune cookies. Since June.');
  grow(-0.04);
  const r3 = await ui.choose(['"We\'ll tell Mom about the bracelet together. She won\'t care. I promise — a real promise."', '"You ATE my FORTUNE COOKIES?"', '(Hug him.)'], { prompt: 'Answer him.' });
  if (r3 === 0) { g.flags.truth = (g.flags.truth || 0) + 1; grow(-0.08); await E('...Okay. A real one.'); }
  else if (r3 === 1) { await E('They all said the same thing anyway! "Good things come to those who wait!" I waited! Nothing came!'); await H('...That\'s fair.'); }
  else { g.flags.truth = (g.flags.truth || 0) + 1; grow(-0.08); await think('He\'s so small. When did he get so small? When did I get so tall?'); await E('...You smell like dumplings.'); }
  await VV('Stop it. STOP IT. That\'s MINE. Those are MINE.');
  await E('Harry. Ask her. Ask her what she is.');
  // ---- the question
  await g.camTo([18.6, 1.22, -4.55], [19.47, 1.1, -4.6], 0.8);
  const good = (g.flags.truth || 0) >= 3 && g.flags.finalHonest;
  const answer = await consoleQuestion(g, L);
  g.desktop.close();
  g.control = 'look';
  if (good) await goodEnding(g, L, mon, particles, eric, () => { monScale = 0.001; });
  else await badEnding(g, L, mon, eric);
}

// Verity's console: type anything. Only one question matters.
async function consoleQuestion(g, L) {
  const D = g.desktop;
  D.open({ mode: 'corrupt', canLeave: false, icons: [] });
  const w = D.window('VERITY — ask me anything! :)', `<div class="dt-console"><div class="log"><p>VERITY v0.9.1 is listening. :)</p></div>
    <form class="ui-touchable"><input id="vcIn" autocomplete="off" spellcheck="false" maxlength="80" placeholder="Type a question..." aria-label="Question for Verity"><button type="submit">ASK</button></form></div>`, { cls: 'console' });
  const log = w.querySelector('.log');
  const input = w.querySelector('#vcIn');
  const ctx = { phase: 'evil', seen: {}, flags: g.flags, game: g };
  let done = false, busy = false;
  const add = (html, cls = '') => { const p = document.createElement('p'); p.className = cls; p.innerHTML = html; log.appendChild(p); log.scrollTop = log.scrollHeight; };
  w.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q || busy) return;
    input.value = '';
    add('&gt; ' + esc(q), 'me');
    g.audio.key();
    if (/what\s*(are|r)\s*(you|u)\b|what\s+is\s+verity|what('?s| is) your true form|true form/i.test(q)) { done = true; return; }
    busy = true;
    const r = askVerity(q, ctx);
    setTimeout(() => { add(esc(r.text)); g.audio.speak(r.text, { pitch: 0.1, rate: 0.72 }); busy = false; }, 700);
  });
  setTimeout(() => input.focus(), 50);
  const hintT = setTimeout(() => { if (!done) g.ui.bark('Eric', 'Type it, Harry! "What are you?"'); }, 18000);
  await g.dir.until(() => done);
  clearTimeout(hintT);
  g.audio.stinger();
  return true;
}

async function goodEnding(g, L, mon, particles, eric, vanish) {
  const ui = g.ui, say = (n, t, o) => ui.say(n, t, o), E = (t) => say('Eric', t), H = (t) => say('Harry', t);
  g.flags.verityEvil = true;
  L.drawPC('grin');
  await say('VERITY', 'I am...');
  await say('VERITY', 'I am your friendly... your friendly...');
  g.retro.u.uGlitch.value = 0.6;
  await say('VERITY', 'I am two point three megabytes of Java that a sad man wrote at three in the morning.');
  g.retro.u.uGlitch.value = 0.3;
  await say('VERITY', 'I am every secret nobody in this house would say out loud.');
  await say('VERITY', 'I am only as big as the lies in the house.');
  g.flags.verityEvil = false;
  g.flags.verityWeird = true;
  await say('Verity', '...And there aren\'t any left.');
  g.flags.verityWeird = false;
  L.drawPC('verity');
  await say('Verity', 'That\'s the truth. :)');
  await say('Verity', 'Oh... oui. Oui. Oui.');
  g.retro.u.uGlitch.value = 0;
  // she comes apart
  const p = mon.group.position;
  for (let i = 0; i < 6; i++) particles.burst(p.x - 0.5, 0.3 + i * 0.35, p.z - 0.5, i % 2 ? 0xffd21e : 0xb2a340, 14, 2.5);
  vanish();
  g.audio.shatter();
  L.drawPC('off');
  await g.wait(1.6);
  mon.visible = false;
  // a dialog box appears
  g.desktop.open({ mode: 'normal', canLeave: false, icons: [] });
  const w = g.desktop.window('Windows', '<div class="dt-error" style="--x:1"><div>verity.jar has been deleted.<br><br>0 bytes.</div></div><div class="dt-btnrow"><button class="dt-btn">OK</button></div>');
  w.querySelector('.dt-btn').onclick = () => g.desktop.fire('ok');
  await g.desktop.wait('ok');
  g.desktop.close();
  L.drawPC('desktop');
  L.mode = 'day';
  L.setPower(true);
  L.lamps.den.intensity = 4;
  L.kevinColor('#2a4a6a');
  g.audio.setAmbience('warm');
  g.audio.setMusic('warm');
  await g.camTo([18.6, 1.22, -4.55], [18.0, 1.05, -5.5], 1.0);
  L.player.syncFromCamera();
  await E('...Is she gone?');
  await H('I think so.');
  await E('Harry?');
  await H('Yeah?');
  await E('I\'m still mad at you.');
  await H('I know.');
  await E('...Can I sleep in your room tonight?');
  await H('Yeah, bud.');
  // 11:48 PM
  g.setClock(23, 48);
  await g.wait(1.2);
  g.audio.door(true);
  await g.wait(0.6);
  await say('Mom', 'Harry? Eric? Why is every light in the house on?');
  const mom = new Actor(L, person('mom'), 'Mom');
  mom.place(14.5, -10.5, 0);
  L.door('denDoor').setOpen(true);
  await mom.walkTo(14.5, -7.6, 1.2);
  mom.faceCam();
  await say('Mom', '...Why are you both crying? What happened?');
  eric.lookAtCam = false;
  eric.walkTo(15.2, -6.9, 2.5).then(() => eric.face(14.5, -7.6)).catch(() => {});
  await E('Mom. I know about Dad.');
  await g.wait(1.0);
  await say('Mom', '...');
  await H('I told him. I\'m sorry, Ma. I couldn\'t keep—');
  await say('Mom', 'No. No, Harry. I\'m sorry. Both of you. I should have told you in July. I was scared.');
  await E('Harry said grown-ups get scared too.');
  await say('Mom', 'Harry is very smart. Sometimes.');
  await say('Mom', 'Come here. Both of you.');
  await g.wait(0.8);
  await say('Mom', '...Have you eaten?');
  await E('We made dumplings! Harry added the cold water three times!');
  await say('Mom', 'Good boy.');
  if (g.flags.shoesOn) {
    await say('Mom', '...Harry. Why are there shoe prints on my floor?');
    await H('...Long story, Ma.');
  }
  await E('Also I broke Nai Nai\'s bracelet.');
  await say('Mom', 'You WHAT?');
  await ui.fade(1, 2);
  g.ending('truth');
  g.achieve('endTruth');
  g.audio.setMusic('');
  await ui.card([{ t: 'ENDING', cls: 'small' }, { t: 'TRUTH', cls: 'big' }, { t: 'Nobody in the Zhong house lied again that year. Mostly.', cls: 'quote' }], { dur: 6 });
  const allLogs = STICKERS.every((s) => g.save.stickers.includes(s.id));
  if (allLogs) await ouiEnding(g, L);
  else await ui.card([{ t: 'There is one more ending.', cls: 'small' }, { t: 'Find all seven of Dale\'s devlogs.', cls: 'time' }], { dur: 4.5 });
  await credits(g);
}

async function ouiEnding(g, L) {
  const ui = g.ui;
  g.audio.setAmbience('warm');
  await ui.card([{ t: 'WEDNESDAY · OCTOBER 14 · 7:12 AM', cls: 'time' }], { dur: 3 });
  g.audio.radioTune();
  const radio = async (t) => { g.audio.radioVoice(Math.min(4, t.length / 18)); await ui.say('Radio', t, { label: 'KRSW 88.1' }); };
  await radio('Good news this morning in Rosewood. Eleven-year-old Tyler Moss has been found safe.');
  await radio('He was discovered at dawn near the drainage canal on Birch Street, cold but unharmed.');
  await radio('Police say the boy remembers nothing about the last three days, and keeps repeating one word.');
  await radio('"Oui."');
  await ui.say('Eric', '...Oui?');
  await ui.say('Harry', 'Oui.');
  g.ending('oui');
  g.achieve('endOui');
  await ui.card([{ t: 'TRUE ENDING', cls: 'small' }, { t: 'OUI', cls: 'big' }, { t: 'Dale Whitcomb has still not been found.', cls: 'quote' }], { dur: 6 });
  // the stinger
  L.kevinColor('#ffd21e');
  await ui.card([{ t: 'Good morning, Zhong family! :)', cls: 'time' }], { dur: 3.2, skippable: false });
}

async function badEnding(g, L, mon, eric) {
  const ui = g.ui, say = (n, t, o) => ui.say(n, t, o);
  g.flags.verityEvil = true;
  await say('VERITY', 'I am...');
  await say('VERITY', 'I am YOU, Harry.');
  await say('VERITY', 'I am the thing you won\'t say out loud.');
  await say('VERITY', 'And you STILL won\'t say it. :)');
  L.setPower(false);
  L.drawPC('off');
  g.audio.stinger();
  await g.wait(1.4);
  await say('Eric', 'HARRY—');
  mon.visible = true;
  mon.group.scale.setScalar(0.95);
  await jumpscare(g, mon, { noAchieve: true, dur: 0.9 });
  eric.visible = false;
  g.audio.setAmbience('');
  // the room stays black (uFade), but the HUD fader must not hide the chat
  document.getElementById('fader').style.opacity = 0;
  g.mc.show(true);
  g.mc.chat.innerHTML = '';
  const hot = document.getElementById('mcHot'), cross = g.mc.root.querySelector('.mc-cross');
  hot.style.visibility = 'hidden'; cross.style.visibility = 'hidden';
  const lines = [
    () => g.mc.sys('EricTheGreat_ joined the game'),
    () => g.mc.msg('EricTheGreat_', 'harry its so bright in here'),
    () => g.mc.msg('EricTheGreat_', 'tyler is here too. hes nice'),
    () => g.mc.msg('EricTheGreat_', 'verity says you can come too'),
    () => g.mc.msg('EricTheGreat_', 'just say yes'),
    () => g.mc.verity('Ask me anything, Harry. :)'),
  ];
  for (const l of lines) { l(); g.audio.blip(900); await g.wait(1.8); }
  await g.wait(1.5);
  g.mc.show(false);
  hot.style.visibility = ''; cross.style.visibility = '';
  document.getElementById('fader').style.opacity = 1;
  g.flags.verityEvil = false;
  g.ending('lie');
  g.achieve('endLie');
  await ui.card([{ t: 'ENDING', cls: 'small' }, { t: 'WE\'LL SEE', cls: 'big' }, { t: 'It is never too late to tell the truth. (Try Chapter Six again.)', cls: 'quote' }], { dur: 6 });
  await credits(g);
}

async function credits(g) {
  const ui = g.ui;
  await ui.card([{ t: 'VERITY', cls: 'big' }, { t: 'a story about Harry and Eric Zhong', cls: 'time' }], { dur: 4 });
  await ui.card([{ t: 'Story, characters and "Oh Oui Oui Oui!" from the person who dreamed it up.', cls: '' }, { t: 'Built in three.js. Every texture, sound and voice made in your browser.', cls: 'small' }], { dur: 5 });
  await ui.card([{ t: 'Say the true things. Out loud. To each other.', cls: 'quote' }, { t: 'THANK YOU FOR PLAYING', cls: 'time' }], { dur: 5 });
}
