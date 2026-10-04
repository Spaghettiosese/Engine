// Title, pause, settings, chapter select, extras, credits and game-over screens.
import { CHAPTERS } from './chapters.js';
import { STICKERS } from './lore.js';

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export class Menus {
  constructor(game) {
    this.g = game;
    this.el = document.getElementById('menu');
    this.el.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const btns = [...this.el.querySelectorAll('button:not([disabled])')];
      if (!btns.length) return;
      e.preventDefault();
      const i = btns.indexOf(document.activeElement);
      const n = e.key === 'ArrowDown' ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length;
      btns[n].focus();
    });
  }

  show(html, cls = '', handlers = {}) {
    this.el.className = cls;
    this.el.innerHTML = `<div class="m-box ${cls}">${html}</div>`;
    this.el.hidden = false;
    this.el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
      this.g.audio.click();
      const fn = handlers[b.dataset.act];
      if (fn) fn(b);
    }));
    const first = this.el.querySelector('button:not([disabled])');
    if (first && !this.g.input.touch) setTimeout(() => first.focus(), 30);
  }

  hide() { this.el.hidden = true; this.el.innerHTML = ''; }

  title() {
    const s = this.g.save;
    const cp = s.checkpoint;
    const cpName = cp ? CHAPTERS[cp.ch]?.title : '';
    this.show(`
      <h1 class="logo">VERITY</h1>
      <p class="m-tag">SHE ONLY TELLS THE TRUTH</p>
      ${cp ? `<button class="m-btn" data-act="cont">CONTINUE <small style="color:#8f8d84">· ${esc(cpName)}</small></button>` : ''}
      <button class="m-btn" data-act="new">${cp ? 'NEW TAPE' : 'PLAY TAPE'}</button>
      <button class="m-btn" data-act="chapters">CHAPTERS</button>
      <button class="m-btn" data-act="extras">EXTRAS</button>
      <button class="m-btn" data-act="viewer">MODEL VIEWER</button>
      <button class="m-btn" data-act="settings">SETTINGS</button>
      <button class="m-btn" data-act="credits">CREDITS</button>
      <p class="m-small">${this.g.input.touch ? 'Touch controls: left thumb moves, right thumb looks.' : 'WASD move · Mouse look · E use · Shift run · C crouch · F flashlight · Q phone · Esc pause'}</p>`,
    '', {
      cont: () => this.g.continueGame(),
      new: () => this.g.newGame(),
      chapters: () => this.chapters(() => this.title()),
      extras: () => this.extras(() => this.title()),
      viewer: () => { location.href = 'viewer.html'; },
      settings: () => this.settings(() => this.title()),
      credits: () => this.credits(() => this.title()),
    });
  }

  pause() {
    this.show(`
      <h2 class="m-h">PAUSED</h2>
      <p class="m-tag">${esc(CHAPTERS[this.g.chapterIndex]?.title || '')}</p>
      <button class="m-btn" data-act="resume">RESUME</button>
      <button class="m-btn" data-act="restart">RESTART CHAPTER</button>
      <button class="m-btn" data-act="settings">SETTINGS</button>
      <button class="m-btn" data-act="extras">EXTRAS</button>
      <button class="m-btn" data-act="quit">QUIT TO TITLE</button>
      ${this.g.ui.objective ? `<p class="m-small">Objective: ${esc(this.g.ui.objective)}</p>` : ''}`,
    'center', {
      resume: () => this.g.resume(),
      restart: () => { this.g.paused = false; this.hide(); this.g.restartChapter(); },
      settings: () => this.settings(() => this.pause()),
      extras: () => this.extras(() => this.pause()),
      quit: () => this.g.toTitle(),
    });
  }

  settings(back) {
    const s = this.g.settings;
    const row = (label, ctrl) => `<div class="m-row"><span>${label}</span>${ctrl}</div>`;
    this.show(`
      <h2 class="m-h">SETTINGS</h2>
      ${row('Hide-and-seek difficulty', `<select id="sDiff"><option value="easy">Easy (story)</option><option value="normal">Normal</option><option value="hard">Hard</option></select>`)}
      ${row('Look sensitivity', `<input type="range" id="sSens" min="0.3" max="2.5" step="0.1" value="${s.sens}">`)}
      ${row('Invert look', `<button class="m-toggle" id="sInv">${s.invert ? 'ON' : 'OFF'}</button>`)}
      ${row('VHS filter', `<select id="sVhs"><option value="0">Off</option><option value="0.6">Light</option><option value="1">Full</option></select>`)}
      ${row('Resolution', `<select id="sRes"><option value="360">360p (crunchy)</option><option value="540">540p</option><option value="720">720p</option><option value="1080">1080p (sharp)</option></select>`)}
      ${row('Effects (AO, light shafts, bloom)', `<select id="sQual"><option value="high">High</option><option value="low">Low (faster)</option></select>`)}
      ${row("Verity's voice (text-to-speech)", `<button class="m-toggle" id="sTts">${s.tts ? 'ON' : 'OFF'}</button>`)}
      ${row('Text speed', `<input type="range" id="sText" min="20" max="120" step="2" value="${s.textSpeed}">`)}
      ${row('Volume', `<input type="range" id="sVol" min="0" max="1" step="0.05" value="${s.volume}">`)}
      <button class="m-btn" data-act="back">BACK</button>`,
    'center', { back });
    const $ = (id) => this.el.querySelector('#' + id);
    const apply = () => { this.g.applySettings(); this.g.persist(); };
    $('sVhs').value = String(s.vhs); $('sRes').value = String(s.lines); $('sDiff').value = s.difficulty || 'normal';
    $('sDiff').addEventListener('change', (e) => { s.difficulty = e.target.value; apply(); });
    $('sSens').addEventListener('input', (e) => { s.sens = +e.target.value; apply(); });
    $('sText').addEventListener('input', (e) => { s.textSpeed = +e.target.value; apply(); });
    $('sVol').addEventListener('input', (e) => { s.volume = +e.target.value; apply(); });
    $('sVhs').addEventListener('change', (e) => { s.vhs = +e.target.value; apply(); });
    $('sRes').addEventListener('change', (e) => { s.lines = +e.target.value; apply(); });
    const tog = (id, key) => $(id).addEventListener('click', (e) => { s[key] = !s[key]; e.target.textContent = s[key] ? 'ON' : 'OFF'; apply(); });
    tog('sInv', 'invert'); tog('sTts', 'tts');
    $('sQual').value = s.quality || 'high'; $('sQual').addEventListener('change', (e) => { s.quality = e.target.value; apply(); });
  }

  chapters(back) {
    const un = this.g.save.unlocked || 0;
    this.show(`
      <h2 class="m-h">CHAPTERS</h2>
      ${CHAPTERS.map((c, i) => `<button class="m-btn" data-act="c${i}" ${i > un ? 'disabled' : ''}>${i > un ? '— LOCKED —' : esc(c.title)}</button>`).join('')}
      <button class="m-btn" data-act="back">BACK</button>`,
    'center', Object.assign({ back }, ...CHAPTERS.map((c, i) => ({ ['c' + i]: () => { this.g.flags = {}; this.g.playFrom(i); } }))));
  }

  extras(back, tab = 'logs') {
    const s = this.g.save;
    let body = '';
    if (tab === 'logs') {
      body = `<div class="m-list">${STICKERS.map((st) => s.stickers.includes(st.id)
        ? `<button class="it on" data-act="log_${st.id}"><b>▶</b>${esc(st.title)}</button>`
        : `<div class="it"><b>?</b>${esc(st.where)}</div>`).join('')}</div>`;
    } else if (tab === 'ach') {
      const A = this.g.constructor.ACH || {};
      body = `<div class="m-list">${Object.entries(A).map(([id, [n, d]]) => `<div class="it ${s.achievements.includes(id) ? 'on' : ''}"><b>${s.achievements.includes(id) ? '★' : '·'}</b>${esc(n)} — <span>${esc(d)}</span></div>`).join('')}</div>`;
    } else {
      const E = [['truth', 'Truth'], ['lie', "We'll See"], ['oui', 'Oui (secret)']];
      body = `<div class="m-list">${E.map(([id, n]) => `<div class="it ${s.endings.includes(id) ? 'on' : ''}"><b>${s.endings.includes(id) ? '★' : '?'}</b>${s.endings.includes(id) ? esc(n) : '???'}</div>`).join('')}</div>`;
    }
    const handlers = {
      back, logs: () => this.extras(back, 'logs'), ach: () => this.extras(back, 'ach'), end: () => this.extras(back, 'end'),
    };
    for (const st of STICKERS) handlers['log_' + st.id] = () => this.readLog(st, () => this.extras(back, 'logs'));
    this.show(`
      <h2 class="m-h">EXTRAS</h2>
      <div class="m-row" style="justify-content:flex-start">
        <button class="m-toggle" data-act="logs">Devlogs ${s.stickers.length}/${STICKERS.length}</button>
        <button class="m-toggle" data-act="ach">Achievements ${s.achievements.length}/${Object.keys(this.g.constructor.ACH || {}).length}</button>
        <button class="m-toggle" data-act="end">Endings ${s.endings.length}/3</button>
      </div>
      ${body}
      <button class="m-btn" data-act="back">BACK</button>`, 'center', handlers);
  }

  readLog(st, back) {
    this.show(`<div class="note devlog" style="position:static;transform:none;width:auto"><div class="n-body"><h3>${esc(st.title)}</h3>${st.body}</div></div><button class="m-btn" data-act="back">BACK</button>`, 'center', { back });
  }

  credits(back) {
    this.show(`
      <h1 class="logo" style="font-size:clamp(48px,9vw,96px)">VERITY</h1>
      <p>A first-person horror story about two brothers,<br>a Minecraft mod, and the thing that eats secrets.</p>
      <p style="color:#ffd21e">Story idea, characters and "Oh Oui Oui Oui!" by the player who asked for it.</p>
      <p>Built with three.js. Every texture, sound and voice is generated in your browser.</p>
      <p style="color:#8f8d84">Inspired by the PS1-era found-footage horror of Puppet Combo and 616 Games.<br>Minecraft is a trademark of Mojang. This is an unofficial fan story.</p>
      <button class="m-btn" data-act="back" style="text-align:center">BACK</button>`, 'center credits', { back });
  }

  gameOver(opts = {}) {
    this.g.input.exitLock();
    return new Promise((resolve) => {
      this.show(`
        <h1 class="logo">${esc(opts.title || 'FOUND YOU')}</h1>
        <p class="m-tag" style="color:#ffd21e">${esc(opts.quote || '"Found you! That\'s the truth! :)"')}</p>
        <button class="m-btn" data-act="retry" style="text-align:center">TRY AGAIN</button>
        <button class="m-btn" data-act="quit" style="text-align:center">QUIT TO TITLE</button>`,
      'center gameover', {
        retry: () => { this.hide(); this.g.input.requestLock(); resolve('retry'); },
        quit: () => { this.hide(); resolve('quit'); this.g.toTitle(); },
      });
    });
  }
}
