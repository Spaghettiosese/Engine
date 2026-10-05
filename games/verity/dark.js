// CHAPTER FIVE — LIGHTS OUT. The power is gone. Eric is gone. Something tall is in the house.
import { HouseLevel, HOUSE_NODES, HOUSE_EDGES } from './house.js';
import { Stalker } from './stalker.js';
import { grinner } from './cast.js';
import { carInterior } from './props.js';
import { Obj3 } from './stage.js';
import { chapterCard, jumpscare, Caught } from './common.js';

export async function chapterDark(g) {
  const L = new HouseLevel(g, 'dark');
  g.setLevel(L);
  const ui = g.ui, P = L.player;
  const say = (n, t, o) => ui.say(n, t, o), think = (t) => ui.think(t), H = (t) => say('Harry', t), E = (t) => say('Eric', t);
  g.control = 'none';
  g.setClock(20, 51); g.clockRate = 1 / 4;
  g.audio.setAmbience('houseDark');
  g.audio.rain = 1;
  ui.osd({ mode: 'play', date: 'TUE OCT 13 2026' });
  ui.battery = 38;
  L.phoneFlash = true;
  const st = new Stalker(L, { nodes: HOUSE_NODES, edges: HOUSE_EDGES, scale: 0.95, aggro: 0.55 });
  st.group.visible = false;
  L.updaters.push((dt) => st.update(dt));
  let caught = false;
  st.onCatch = () => { caught = true; };
  // lightning sometimes shows it standing outside
  const ghost = grinner(); ghost.visible = false; ghost.scale.set([1, 1, 1]); ghost.play('Idle', { fade: 0 }); L.scene.add(ghost);
  const ghostSpots = [{ x: 0, z: 2.2, yaw: Math.PI }, { x: -3, z: -31.6, yaw: 0 }, { x: 21.8, z: -15.5, yaw: -Math.PI / 2 }, { x: 21.8, z: -4.5, yaw: -Math.PI / 2 }, { x: -21.8, z: -26, yaw: Math.PI / 2 }, { x: 15.5, z: -31.6, yaw: 0 }, { x: 15, z: 2.2, yaw: Math.PI }];
  L.onLightning = () => {
    if (!L.ghosts || Math.random() > 0.45) return;
    const cam = g.camera.position;
    const spot = ghostSpots.slice().sort((a, b) => Math.hypot(a.x - cam[0], a.z - cam[2]) - Math.hypot(b.x - cam[0], b.z - cam[2]))[0];
    ghost.position.set([spot.x, 0, spot.z]); ghost.setEuler(0, spot.yaw * 180 / Math.PI, 0); ghost.visible = true;
    setTimeout(() => { ghost.visible = false; }, 380);
  };
  L.updaters.push((dt) => { if (ghost.visible) ghost.update(dt); });

  const S = {
    until: async (pred) => { await g.dir.until(() => caught || pred()); if (caught) throw new Caught(); },
    wait(s) { const end = g.time + s; return S.until(() => g.time >= end); },
    use(id) { const start = L.used.get(id) || 0; return S.until(() => (L.used.get(id) || 0) > start); },
  };
  const state = { cp: 0, triedGarage: false, hasKey: false, flashlight: false, tripped: false, eric: null };

  await chapterCard(g, 'CHAPTER SIX', 'LIGHTS OUT', '8:51 PM');
  // --- the bathroom door is open. Eric is gone.
  L.door('bathDoor').setOpen(true, true); L.door('bathDoor').k = 1; L.door('bathDoor').pivot.setEuler(0, -92, 0);
  L.smileyDecal(7.1, 1.55, -15.5, Math.PI / 2, 0.45);
  P.place(8.5, -10.9, 0, -0.1);
  g.control = 'look';
  await ui.fade(0, 2);
  L.thunder();
  await g.wait(1.5);
  await think('The bathroom door is open. I heard it slam. I heard him scream my name.');
  await think('He\'s not in there. The window\'s shut. The tub\'s empty. There\'s a smiley face on the mirror.');
  await H('ERIC?');
  await g.wait(1.2);
  await think('Rain. That\'s all.');
  P.hasFlash = true;
  g.control = 'walk';
  g.input.setTouchMode('walk');
  ui.crosshair(true);
  ui.hint(g.input.touch ? 'Tap <b>LIGHT</b> for your phone\'s flashlight. <b>PHONE</b> to check messages.' : '<b>F</b> — phone flashlight · <b>Q</b> — phone · <b>C</b> — crouch', 6);
  ui.setObjective('Find Eric');
  ui.phoneNotify('Mom', 'harry is everything ok?? eric texted me hes scared. i cant leave yet. call me');
  setupDarkOptional(g, L, state);
  L.door('ericDoor').setOpen(false, true);
  L.door('denDoor').setOpen(true, true);
  L.door('momDoor').setOpen(false, true);
  L.door('garageDoor').setOpen(false, true);
  L.door('garageDoor').locked = true;
  L.door('garageDoor').noMonster = false;
  L.door('garageDoor').onLocked = () => {
    if (state.hasKey) return;
    if (!state.triedGarage) {
      state.triedGarage = true;
      g.dir.until(() => true).then(async () => {
        ui.bark('', 'Locked. Mom always locks the garage at night. The key is usually on the hook...', 3.5);
        await g.wait(3.6);
        L.kevin('The key is not on the hook, Harry! It\'s in Mommy\'s jewelry box! That\'s the truth! :)');
        ui.setObjective("Find the garage key (Mom's room)");
      }).catch(() => {});
    }
  };
  L.drawTablet('happy');
  L.kevinColor('#ffd21e');
  await g.wait(3);
  L.kevin('Hi-hi, Harry! The power is out! That\'s the truth! :)');

  // ---- the tablet
  L.addInteract(L.tablet, { id: 'darkTablet', prompt: "Eric's tablet (it's on)" });
  await L.waitUse('darkTablet');
  L.enable('darkTablet', false);
  await think('Eric\'s tablet. Unlocked. He was in the middle of a chat.');
  await ui.note(`
    <div class="tab-msg"><small>Sat 10/10 · 11:52 PM</small>hi verity</div>
    <div class="tab-msg v"><small>VERITY</small>Hi-hi, Eric! :)</div>
    <div class="tab-msg">is it true you know everything</div>
    <div class="tab-msg v">Everything that's TRUE! :)</div>
    <div class="tab-msg"><small>Sun 10/11 · 10:14 PM</small>where is my dad</div>
    <div class="tab-msg v">I can tell you ANYTHING! But first I need to meet your brother. :)</div>
    <div class="tab-msg"><small>Mon 10/12 · 11:30 PM</small>harry never plays with me anymore</div>
    <div class="tab-msg v">Bring him tomorrow! Tell him it's a NEW mod! Don't tell him about us. Secrets are fun! :)</div>
    <div class="tab-msg"><small>Tue 10/13 · 8:49 PM</small>im hiding where dad used to fix the car. dont tell harry</div>
    <div class="tab-msg v">I would NEVER lie to Harry. :)</div>`, { style: 'screen' });
  await think('Saturday. He\'s been talking to it since Saturday.');
  await think('"Where dad used to fix the car." The garage.');
  await g.wait(0.3);
  L.kevin('Harry! Eric is in the garage! That\'s the truth! :)');
  ui.setObjective('Get to the garage (through the kitchen)');

  // ---- first sighting as you leave Eric's room
  await g.until(() => P.pos.z > -11.7 && P.pos.x < 17);
  L.thunder();
  st.group.visible = true;
  st.place(3, -10.5, Math.atan2(P.pos.x - 3, P.pos.z + 10.5));
  st.active = true; st.state = 'scripted'; st.catchCooldown = 999;
  g.audio.stinger();
  await g.wait(2.6);
  st.path = [[-4, -10.5], [-4, -12.8], [-4, -16], [-10.2, -16]];
  await g.until(() => !st.path.length);
  st.catchCooldown = 0;
  st.start('patrol');
  L.ghosts = true;
  L.setHidesEnabled(true);
  ui.hint(g.input.touch ? 'Hide in closets and under beds with <b>USE</b>. Your light makes you easier to see.' : 'Hide in closets and under beds with <b>E</b>. <b>C</b> to crouch. Your flashlight makes you easier to see.', 7);
  ui.setObjective(state.triedGarage ? "Find the garage key (Mom's room)" : 'Get to the garage (through the kitchen)');
  const cp1 = { x: 12.5, z: -10.5, yaw: Math.PI / 2 };

  // ---- CP1: key + garage
  await section(async () => {
    if (!state.hasKey) {
      L.addInteract(L.jewelry, { id: 'keybox', prompt: "Open Mom's jewelry box" });
      await S.use('keybox');
      L.enable('keybox', false);
      state.hasKey = true;
      L.door('garageDoor').locked = false;
      g.audio.jingle(1);
      L.makeNoise(-19.7, -23.2, 12);
      ui.bark('', 'The key! ...The jewelry box is playing music. It never plays music. It\'s playing HER song.', 5);
      ui.setObjective('Unlock the garage door (kitchen)');
    }
    await S.until(() => L.door('garageDoor').open && P.pos.z > -8.7 && P.pos.x < -11.2);
  }, () => {
    P.place(cp1.x, cp1.z, cp1.yaw);
    P.setFlash(false);
    st.place(-14.5, -24.5); st.start('patrol');
    if (state.hasKey) { L.door('garageDoor').locked = false; ui.setObjective('Unlock the garage door (kitchen)'); }
  });

  // ---- CP2: the car (cutscene)
  st.stop(); st.group.visible = false; st.place(4, -27);
  L.door('garageDoor').setOpen(false);
  g.audio.setAmbience('garage');
  ui.setObjective('Find Eric');
  L.addInteract(L.hitbox(0.5, 1.4, 1.6, -14.3, 0, -3.6), { id: 'carDoor', prompt: "Open Dad's car" });
  await L.waitUse('carDoor');
  await carScene(g, L, state);

  // ---- CP3: breaker with Eric
  const eric = state.eric;
  L.ghosts = false;
  ui.setObjective('Turn the power back on (breaker box)');
  L.enable('breakerDay', false);
  const brkHit = L.hitbox(0.3, 0.7, 0.5, -19.8, 1.0, -7);
  L.addInteract(brkHit, { id: 'breaker', prompt: 'Open the breaker box' });
  const breakers = { KITCHEN: false, 'LIVING RM': false, BEDROOMS: false, DEN: false, 'GARAGE HEATER': true, 'GARAGE LTS': false, MAIN: false };
  await section(async () => {
    st.start('patrol');
    for (;;) {
      await S.use('breaker');
      const res = await breakerPanel(g, L, breakers, state, () => caught);
      if (caught) throw new Caught();
      if (res === 'on') break;
    }
  }, () => {
    P.place(-13, -5, 0);
    eric.place(-13.3, -3.8, 0);
    st.place(-2.5, -27); st.start('patrol');
    L.door('garageDoor').setOpen(false, true);
  });
  if (!state.tripped) g.achieve('breaker');
  L.setPower(true);
  L.flicker = 1.2;
  L.hemi.intensity = 0.3;
  L.lightsOn = true;
  g.audio.setAmbience('houseDark');
  await S.wait(1.2).catch(() => {});
  L.kevinColor('#ffd21e');
  L.kevin('Welcome back, Harry! :)');
  L.drawPC('grin');
  L.drawTV('verity');
  await g.wait(2.5);
  L.kevin('Come say goodnight, Harry. Bring Eric. :)', { evil: true });
  ui.setObjective('Get Eric to the den (the computer)');
  const cp4 = { x: -13.5, z: -7.8, yaw: 0 };
  st.place(-4, -16); st.start('patrol');
  st.speeds.chase = 3.35;
  await section(async () => {
    await S.until(() => P.pos.x > 9.3 && P.pos.z > -8.8 && P.pos.z < 0);
  }, () => {
    P.place(cp4.x, cp4.z, cp4.yaw);
    eric.place(-13.5, -6.8, Math.PI);
    L.door('garageDoor').setOpen(true, true);
    st.place(-2.5, -27); st.start('patrol');
  });
  // safe in the den
  st.stop();
  g.control = 'look';
  eric.follow = null;
  await eric.walkTo(15.5, -7.4, 3);
  L.door('denDoor').setOpen(false);
  g.audio.slam();
  st.group.visible = false;
  await g.wait(0.6);
  await E('I closed it. I closed it. I closed it.');
  await H('Breathe. We\'re okay.');
  await g.wait(0.8);
  L.drawPC('grin');
  await think('The computer\'s on. Verity\'s face fills the screen, smiling at the door, waiting.');
  ui.setObjective(null);
  ui.crosshair(false);
  await ui.fade(1, 1.4);
  g.audio.rain = 0;

  // ------------------------------------------------------------ helpers
  async function section(fn, reset) {
    for (;;) {
      try {
        caught = false;
        await fn();
        return;
      } catch (e) {
        if (!e || !e.caught) throw e;
        await onCaught();
        reset();
        g.control = 'walk';
        g.input.setTouchMode('walk');
        ui.crosshair(true);
        await ui.fade(0, 0.8);
      }
    }
  }

  async function onCaught() {
    if (P.hidden) { P.hidden = null; ui.hideVeil(null); ui.meters({ breath: null }); }
    ui.hidePanel();
    await jumpscare(g, st);
    st.group.scale.setScalar(0.95);
    st.stop();
    const r = await g.menus.gameOver({ title: 'FOUND YOU', quote: pickQuote() });
    if (r !== 'retry') { const e = new Error('quit'); e.cancelled = true; throw e; }
    caught = false;
    g.ui.danger(0);
  }
}

function pickQuote() {
  const q = ['"Found you! That\'s the truth! :)"', '"Hide and seek is more fun when you lose! :)"', '"I could hear your heart, Harry. It\'s so LOUD. :)"', '"You breathe like your dad. :)"'];
  return q[Math.floor(Math.random() * q.length)];
}

async function carScene(g, L, state) {
  const ui = g.ui, P = L.player;
  const say = (n, t, o) => ui.say(n, t, o), think = (t) => ui.think(t), H = (t) => say('Harry', t), E = (t) => say('Eric', t);
  g.control = 'none';
  ui.prompt(null);
  g.audio.carDoor();
  await ui.fade(1, 0.5);
  // swap the outside of the car for its inside
  L.dadCar.visible = false; L.tarp.visible = false;
  const inside = carInterior(L, '#4a4e56', false);
  inside.position.set([-15.85, 0, -4.2]);
  L.scene.add(inside);
  const eric = L.addEric('ericSad');
  eric.place(-16.0, -5.3, Math.PI / 2);
  eric.sit(true, 0);
  eric.lookAtCam = false;
  const cabinLight = L.addLamp(-15.5, 1.3, -5.2, { color: '#a0b0ff', intensity: 3, range: 4, bulb: false }).light;
  const cam = g.camera;
  cam.position[0] = -15.1; cam.position[1] = 1.25; cam.position[2] = -5.25;
  cam.target[0] = -16.0; cam.target[1] = 1.2; cam.target[2] = -5.3;
  P.syncFromCamera();
  P.pos.x = -15.1; P.pos.z = -5.25; P.eye = 1.25;
  P.lookLimit = { yaw: P.yaw, range: 1.2, pmin: -0.6, pmax: 0.5 };
  g.audio.rain = 0.6;
  await ui.fade(0, 0.8);
  g.control = 'look';
  await E('Go away.');
  await H('Eric. There\'s something in the house.');
  await E('I know. It\'s Verity. She said she\'d come if I told the truth.');
  await E('I installed her on Saturday. Not today. I lied.');
  await E('I talked to her every night. She knew EVERYTHING. She knew Mom cries in the bathroom so we won\'t hear. She knew you quit robotics so you could pick me up.');
  await E('She said if I got you to play with her, she\'d tell me where Dad is.');
  await E('So I lied to you too. Now we\'re even.');
  const c1 = await ui.choose(['"We\'re not even. I\'m sorry. I should have told you about Dad."', '"You\'re grounded. Forever."']);
  if (c1 === 0) {
    g.flags.truth = (g.flags.truth || 0) + 1;
    await E('...');
  } else {
    await E('You\'re not Mom.');
    await H('I know. I know I\'m not. I\'m... I\'m sorry.');
  }
  await E('Harry. Is Dad ever coming back?');
  const c2 = await ui.choose(['"No. Not to live here. But he still loves you."', '"I don\'t know, bud. I really don\'t."', '"Yes. I promise."']);
  if (c2 === 0) {
    g.flags.truth = (g.flags.truth || 0) + 2;
    await E('...Okay.');
    await E('That\'s the first time you didn\'t say "Shenzhen."');
  } else if (c2 === 1) {
    g.flags.truth = (g.flags.truth || 0) + 1;
    await E('...That\'s the first honest thing you\'ve said all week.');
  } else {
    g.flags.truth = (g.flags.truth || 0) - 2;
    g.flags.liedInCar = true;
    await g.wait(0.6);
    g.audio.glitch();
    g.retro.u.uGlitch.value = 0.5;
    await g.wait(0.3);
    g.retro.u.uGlitch.value = 0;
    await E('...The lights did the thing. Harry. Did you just lie again?');
  }
  await E('Why did you lie?');
  await H('Because I thought if I didn\'t say it out loud, it wasn\'t real yet.');
  await E('That\'s so stupid.');
  await H('Yeah.');
  await g.wait(1.0);
  await E('Verity says truth makes her bigger. But when WE say it... it feels different. It doesn\'t feel like her. It feels like... ours.');
  await g.wait(1.2);
  // THUD
  g.audio.slam();
  P.shake = 0.8;
  await g.wait(0.8);
  // a smiley drawn on the fogged window behind Eric
  const smile = L.smileyDecal(-16.25, 1.15, -5.45, Math.PI / 2, 0.34);
  smile.mat.opacity = 0.0;
  const tt = g.time;
  await g.until(() => { smile.mat.opacity = Math.min(0.5, (g.time - tt) * 0.4); return g.time - tt > 1.3; });
  await E('...Harry.');
  // her face at the glass
  const face = grinner();
  face.scale.set([0.55, 0.55, 0.55]);
  face.position.set([-17.32, 0, -5.35]);
  face.setEuler(0, 90, 0);
  face.play('Idle', { fade: 0 }); face.update(0.016);
  L.scene.add(face);
  g.audio.stinger();
  g.retro.u.uGlitch.value = 0.4;
  await g.wait(1.4);
  g.retro.u.uGlitch.value = 0;
  await H('Eric. When I say run—');
  await g.wait(0.6);
  await H('RUN.');
  g.audio.carDoor();
  await ui.fade(1, 0.3);
  L.scene.remove(face); L.scene.remove(smile.node); L.scene.remove(inside); cabinLight.intensity = 0;
  L.dadCar.visible = true; L.tarp.visible = true;
  L.tarp.node.scale[2] = 0.5; L.tarp.node.position[2] = -6.1;
  eric.sit(false);
  eric.place(-13.3, -3.5, 0);
  const ep = eric;
  ep.follow = () => ({ x: P.pos.x + Math.sin(P.yaw) * 1.1, z: P.pos.z + Math.cos(P.yaw) * 1.1, gap: 0.3, speed: 4.4 });
  // swap to a regular Eric (not sad) so he can talk while following
  P.place(-13.0, -5.2, 0);
  P.eye = 1.62; P.lookLimit = null;
  state.eric = eric;
  await ui.fade(0, 0.5);
  g.control = 'walk';
  await E('It\'s gone. Where did it go?');
  await H('I don\'t know. Stay behind me. Hold my hoodie. Don\'t let go.');
  await E('The breaker. Mom\'s note is in the breaker box. If the lights come back on maybe she can\'t hide as good.');
}

async function breakerPanel(g, L, br, state, isCaught) {
  const ui = g.ui;
  g.control = 'none';
  g.input.exitLock();
  const render = () => `<div class="brk ui-touchable">
      <h3>BREAKER PANEL</h3>
      <div class="memo">Main LAST!! The garage heater trips everything — keep it OFF. — Mom</div>
      <div class="grid">${Object.keys(br).map((k) => `<button class="sw ${br[k] ? 'on' : ''} ${k === 'MAIN' ? 'main' : ''}" data-k="${k}"><i></i>${k}</button>`).join('')}</div>
      <div class="row"><span id="brkMsg" style="font-family:var(--vhs);font-size:20px;color:#111"></span><button id="brkClose">Close</button></div>
    </div>`;
  let result = null;
  const el = ui.showPanel(render());
  const bind = () => {
    el.querySelectorAll('.sw').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.k;
      br[k] = !br[k];
      g.audio.breaker();
      if (k === 'MAIN' && br.MAIN) {
        if (br['GARAGE HEATER']) {
          br.MAIN = false;
          state.tripped = true;
          g.audio.breaker(true);
          L.makeNoise(-19.9, -7, 30);
          el.innerHTML = render(); bind();
          el.querySelector('#brkMsg').textContent = 'CLUNK. It tripped. Something heard that.';
          return;
        }
        if (!br.DEN) {
          el.innerHTML = render(); bind();
          el.querySelector('#brkMsg').textContent = 'Power... but the den is still dark.';
          br.MAIN = false;
          return;
        }
        result = 'on';
        return;
      }
      el.innerHTML = render(); bind();
    }));
    el.querySelector('#brkClose').addEventListener('click', () => { result = 'close'; });
  };
  bind();
  await g.dir.until(() => result || isCaught());
  ui.hidePanel();
  // lamps per circuit
  if (result === 'on') {
    for (const [k, lamps] of Object.entries({ KITCHEN: ['kitchen'], 'LIVING RM': ['chandelier', 'foyer'], BEDROOMS: ['eric', 'harry', 'mom'], DEN: ['den'], 'GARAGE LTS': ['garage'] })) {
      if (!br[k]) for (const l of lamps) L.lamps[l].userData.base = 0;
    }
  }
  if (!isCaught()) { g.control = 'walk'; g.input.requestLock(); }
  return result;
}

function setupDarkOptional(g, L, state) {
  const ui = g.ui, think = async (t) => { ui.bark('', t, Math.min(6, 2 + t.length * 0.05)); await g.wait(0.3); };
  const P = L.player;
  L.optional(L.drawer, 'drawer', 'Kitchen drawer', async () => {
    if (state.flashlight) { await think('Batteries, rubber bands, forty soy sauce packets.'); return; }
    state.flashlight = true;
    g.audio.click();
    await think('Mom\'s emergency flashlight. The big metal one. It still works.');
    L.phoneFlash = false;
    P.hasFlash = true;
    P.flash.lumens = 900; P.flash.beam.angle = 34;
    P.setFlash(true);
    ui.hint('Real flashlight. No more battery drain.', 3);
  });
  L.optional(L.sticker7, 'sticker7', 'Smiley sticker', async () => {
    L.sticker7.visible = false; L.enable('sticker7', false);
    await think('A smiley sticker on Mom\'s wall. Handwriting on the back. Not Mom\'s.');
    await g.collectSticker('s7');
  });
  L.sticker7.visible = true;
  L.enable('jewelry', false);
  L.optional(L.hit.boxes, 'boxSticker', "Dad's boxes", async () => {
    await think('Something\'s taped to the "DAD — BOOKS" box. A smiley sticker. It wasn\'t there this afternoon.');
    L.enable('boxSticker', false);
    await g.collectSticker('s6');
  });
  L.optional(L.hitbox(0.9, 2.0, 0.3, -8, 0, -0.3), 'frontDark', 'Front door', async () => {
    if (!state.eric) await think('I\'m not leaving without Eric.');
    else { g.audio.locked(); await think('It won\'t open. It\'s not locked. Something is holding it from the other side.'); }
  });
  L.optional(L.kevinObj, 'kevinDark', 'Kevin', async () => {
    await ui.say('Kevin?', 'Kevin isn\'t here right now! Kevin was never really here! :)');
    g.achieve('kevin');
  });
  L.optional(L.altarObj, 'altarDark', "Nai Nai's altar", async () => {
    await think('The incense went out. Nai Nai\'s eyes in the photo look... worried. That\'s stupid. It\'s a photo.');
    await think('Nai Nai. Please.');
  });
}
