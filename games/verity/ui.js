// DOM user interface: dialogue, choices, notes, phone, HUD, menus.
export const SPEAKERS = {
  Harry: { color: '#9fcfff', blip: 420 },
  Eric: { color: '#ffc861', blip: 780 },
  'Eric (IRL)': { color: '#ffc861', blip: 780 },
  Verity: { color: '#ffd21e', blip: 1100, verity: true },
  VERITY: { color: '#ffe86a', blip: 180, verity: true, evil: true },
  Mom: { color: '#ff9fb5', blip: 560 },
  Priya: { color: '#c7a6ff', blip: 640 },
  'Mr. Delgado': { color: '#9fe0a6', blip: 300 },
  Gus: { color: '#d8b98a', blip: 260 },
  Dale: { color: '#a8c89a', blip: 330 },
  Radio: { color: '#b0b0b0', blip: 500 },
  Kevin: { color: '#7fe0ff', blip: 900 },
  'Kevin?': { color: '#ffd21e', blip: 1000, verity: true },
  Laptop: { color: '#ffd21e', blip: 1100, verity: true },
  TheBlockBoyz: { color: '#ff7a7a', blip: 700 },
  '???': { color: '#ff5a4a', blip: 200 },
};

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ~shaky~ and ^red^ markup
function parseMarkup(text) {
  const segs = [];
  let cls = '', buf = '';
  for (const ch of text) {
    if (ch === '~' || ch === '^') {
      if (buf) segs.push({ t: buf, cls }); buf = '';
      const c = ch === '~' ? 'shake' : 'red';
      cls = cls === c ? '' : c;
      continue;
    }
    buf += ch;
  }
  if (buf) segs.push({ t: buf, cls });
  return segs;
}

function renderSegs(segs, n) {
  let out = '', left = n;
  for (const s of segs) {
    if (left <= 0) break;
    const part = s.t.slice(0, left);
    left -= s.t.length;
    if (!s.cls) out += esc(part);
    else if (s.cls === 'shake') out += `<span class="shake">${[...part].map((c, i) => `<i style="animation-delay:${-i * 0.07}s">${c === ' ' ? '&nbsp;' : esc(c)}</i>`).join('')}</span>`;
    else out += `<span class="${s.cls}">${esc(part)}</span>`;
  }
  return out;
}

export class UI {
  constructor(game) {
    this.g = game;
    this.$ = (id) => document.getElementById(id);
    this.dlg = { active: false, done: true, segs: [], len: 0, shown: 0, t: 0 };
    this.choice = null;
    this.blocking = 0;
    this.barkT = 0;
    this.tweens = [];
    this.toastQ = [];
    this.toastT = 0;
    this.promptText = null;
    this.cps = 42;
    this.noteOpen = null;
    this.phoneMsgs = [];
    this.phoneOpen = false;
    this.battery = 64;
    this.bindClicks();
  }

  bindClicks() {
    this.$('dialog').addEventListener('click', (e) => {
      if (e.target.closest('.choice')) return;
      this.clickAdvance = true;
    });
    this.$('note').addEventListener('click', () => { this.clickAdvance = true; });
    this.$('phone').addEventListener('click', (e) => { if (e.target.closest('.ph-close')) this.clickAdvance = true; });
    this.$('card').addEventListener('click', () => { this.clickAdvance = true; });
  }

  reset() {
    this.dlg.active = false; this.dlg.done = true;
    this.choice = null; this.blocking = 0;
    this.$('dialog').hidden = true;
    this.$('bark').hidden = true;
    this.$('note').hidden = true;
    this.$('phone').hidden = true;
    this.$('card').hidden = true;
    this.$('panel').hidden = true;
    this.phoneOpen = false; this.noteOpen = null;
    this.hideVeil(null);
    this.prompt(null);
    this.tweens = [];
  }

  get busy() { return this.blocking > 0 || !!this.noteOpen || this.phoneOpen; }

  advancePressed() {
    const inp = this.g.input;
    if (this.clickAdvance) { this.clickAdvance = false; inp.consume('advance'); return true; }
    if (inp.wasHit('advance')) { inp.consume('advance'); inp.consume('interact'); inp.consume('jump'); inp.consume('break'); return true; }
    if (inp.wasHit('tap') && this.g.input.touch) { inp.consume('tap'); return true; }
    return false;
  }

  // ------------------------------------------------------------ dialogue
  async say(name, text, opts = {}) {
    const d = this.dlg;
    const sp = SPEAKERS[name] || { color: '#e0e0e0', blip: 500 };
    d.active = true; d.done = false;
    d.segs = parseMarkup(text); d.len = d.segs.reduce((a, s) => a + s.t.length, 0);
    d.shown = 0; d.t = 0; d.sp = sp; d.auto = opts.auto || 0; d.blipAcc = 0; d.lastRender = -1;
    const nameEl = this.$('dName');
    nameEl.textContent = name ? (opts.label || name) : '';
    nameEl.style.color = sp.color;
    nameEl.hidden = !name;
    this.$('dText').className = 'd-text' + (name ? '' : ' think') + (sp.evil ? ' evil' : '');
    this.$('dText').innerHTML = '';
    this.$('dChoices').innerHTML = '';
    this.$('dNext').hidden = true;
    this.$('dialog').hidden = false;
    this.$('dialog').classList.toggle('verity', !!sp.verity);
    this.clickAdvance = false;
    d.voiced = false;
    if (sp.verity && !opts.silent) {
      const style = sp.evil || this.g.flags.verityEvil ? { pitch: 0.1, rate: 0.72 } : this.g.flags.verityWeird ? { pitch: 1.2, rate: 0.95 } : { pitch: 1.75, rate: 1.08 };
      d.voiced = this.g.audio.speak(text, style);
    }
    if (this.g.onSpeak) this.g.onSpeak(name, text);
    this.blocking++;
    try {
      await this.g.dir.until(() => d.done);
    } finally {
      this.blocking = Math.max(0, this.blocking - 1);
      d.active = false;
      if (!opts.keep) this.$('dialog').hidden = true;
      if (d.voiced && opts.stopVoice !== false) { /* let the line finish naturally */ }
    }
  }

  think(text, opts = {}) { return this.say('', text, opts); }

  async choose(options, opts = {}) {
    const c = this.choice = { options, index: 0, done: false, result: -1, acc: 0 };
    this.$('dName').textContent = opts.name || 'Harry';
    this.$('dName').style.color = (SPEAKERS[opts.name || 'Harry'] || {}).color || '#9fcfff';
    this.$('dName').hidden = false;
    this.$('dText').className = 'd-text';
    this.$('dText').innerHTML = opts.prompt ? renderSegs(parseMarkup(opts.prompt), 1e9) : '';
    this.$('dNext').hidden = true;
    this.$('dialog').classList.remove('verity');
    const box = this.$('dChoices');
    box.innerHTML = options.map((o, i) => `<button class="choice ui-touchable" data-i="${i}"><b>${i + 1}</b> ${esc(o)}</button>`).join('');
    box.querySelectorAll('.choice').forEach((b) => {
      b.addEventListener('click', (e) => { e.stopPropagation(); c.index = +b.dataset.i; c.done = true; c.result = c.index; });
      b.addEventListener('mouseenter', () => { c.index = +b.dataset.i; this.renderChoice(); });
    });
    this.renderChoice();
    this.$('dialog').hidden = false;
    this.g.input.consume('advance');
    this.blocking++;
    try {
      await this.g.dir.until(() => c.done);
    } finally {
      this.blocking = Math.max(0, this.blocking - 1);
      this.choice = null;
      box.innerHTML = '';
      this.$('dialog').hidden = true;
    }
    this.g.audio.click();
    return c.result;
  }

  renderChoice() {
    const c = this.choice;
    if (!c) return;
    this.$('dChoices').querySelectorAll('.choice').forEach((b, i) => b.classList.toggle('sel', i === c.index));
  }

  bark(name, text, dur) {
    const sp = SPEAKERS[name] || { color: '#ddd' };
    const el = this.$('bark');
    el.innerHTML = (name ? `<span class="b-name" style="color:${sp.color}">${esc(name)}</span> ` : '') + renderSegs(parseMarkup(text), 1e9);
    el.classList.toggle('think', !name);
    el.hidden = false;
    this.barkT = dur ?? Math.min(7, 1.6 + text.length * 0.055);
    if (sp.verity) {
      const style = sp.evil || this.g.flags.verityEvil ? { pitch: 0.1, rate: 0.72 } : { pitch: 1.75, rate: 1.08 };
      if (!this.g.audio.speak(text, style)) this.g.audio.blip(sp.blip || 900);
    } else if (sp.blip) {
      for (let i = 0; i < 4; i++) setTimeout(() => this.g.audio.blip(sp.blip), i * 70);
    }
    if (this.g.onSpeak) this.g.onSpeak(name, text);
  }

  // ------------------------------------------------------------ hud
  setObjective(text) {
    const el = this.$('objective');
    if (!text) { el.hidden = true; this.objective = ''; return; }
    if (text !== this.objective) {
      el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
      this.g.audio.click();
    }
    this.objective = text;
    el.innerHTML = `<span>OBJECTIVE</span>${esc(text)}`;
    el.hidden = false;
  }

  prompt(text) {
    if (text === this.promptText) return;
    this.promptText = text;
    const el = this.$('prompt');
    if (!text) { el.hidden = true; return; }
    const key = this.g.input.touch ? 'USE' : 'E';
    el.innerHTML = `<kbd>${key}</kbd> ${esc(text)}`;
    el.hidden = false;
  }

  crosshair(on) { this.$('cross').hidden = !on; }

  hint(text, dur = 5) {
    const el = this.$('hint');
    el.innerHTML = text;
    el.hidden = false;
    this.hintT = dur;
  }

  osd(o) {
    const el = this.$('osd');
    if (o.mode === 'none') { el.hidden = true; return; }
    el.hidden = false;
    this.osdMode = o.mode || this.osdMode || 'play';
    if (o.date) this.osdDate = o.date;
    this.$('osdTL').innerHTML = this.osdMode === 'rec' ? '<span class="rec">●</span> REC' : 'PLAY ▶';
  }

  updateOSD() {
    const c = this.g.clock;
    const h = Math.floor(c / 60) % 24, m = Math.floor(c % 60);
    const hh = ((h + 11) % 12) + 1;
    const str = `${this.osdDate || ''}<br>${hh}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
    if (str !== this.osdLast) { this.$('osdBR').innerHTML = str; this.osdLast = str; }
  }

  camLight(on) { this.$('camLight').hidden = !on; }

  toast(title, sub) {
    this.toastQ.push({ title, sub });
  }

  meters(o) {
    const st = this.$('stamina');
    if (o.stamina !== undefined) {
      st.hidden = o.stamina >= 0.999;
      st.firstElementChild.style.width = (o.stamina * 100) + '%';
    }
    const br = this.$('breath');
    if (o.breath !== undefined) {
      br.hidden = o.breath === null;
      if (o.breath !== null) br.firstElementChild.style.width = (o.breath * 100) + '%';
    }
  }

  hideVeil(type) {
    const el = this.$('veil');
    el.className = type ? 'veil ' + type : 'veil';
    el.hidden = !type;
  }

  danger(v) { this.g.retro.u.uDanger.value = v; }

  // ------------------------------------------------------------ fades & cards
  fade(to, dur = 1) {
    const u = this.g.retro.u.uFade;
    const from = u.value;
    const fader = this.$('fader');
    return new Promise((res) => {
      this.tweens.push({ t: 0, dur: Math.max(0.001, dur), fn: (k) => { u.value = from + (to - from) * k; fader.style.opacity = u.value; }, done: res });
    });
  }

  async card(lines, opts = {}) {
    const el = this.$('card');
    el.innerHTML = lines.map((l) => `<div class="c-line ${l.cls || ''}">${l.html || esc(l.t)}</div>`).join('');
    el.hidden = false;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    this.g.audio.staticBurst(0.25, 0.05);
    this.clickAdvance = false;
    const end = this.g.time + (opts.dur ?? 4);
    const skipAt = this.g.time + 0.8;
    await this.g.dir.until(() => this.g.time >= end || (this.g.time > skipAt && opts.skippable !== false && this.advancePressed()));
    el.classList.remove('show');
    await this.g.dir.wait(0.5);
    el.hidden = true;
  }

  async note(html, opts = {}) {
    const el = this.$('note');
    el.className = 'note ' + (opts.style || 'paper');
    el.innerHTML = `<div class="n-body">${html}</div><div class="n-hint">${this.g.input.touch ? 'tap' : 'E / click'} to close</div>`;
    el.hidden = false;
    this.noteOpen = true;
    this.g.audio.paper();
    this.clickAdvance = false;
    this.blocking++;
    try {
      await this.g.dir.wait(0.25);
      await this.g.dir.until(() => this.advancePressed());
    } finally {
      this.blocking = Math.max(0, this.blocking - 1);
      el.hidden = true;
      this.noteOpen = null;
    }
  }

  // ------------------------------------------------------------ phone
  phoneNotify(from, text, opts = {}) {
    this.phoneMsgs.push({ from, text, me: !!opts.me });
    if (opts.silent) return;
    const el = this.$('phoneNote');
    el.innerHTML = `<b>${esc(from)}</b> ${esc(text)}`;
    el.hidden = false;
    el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
    this.phoneNoteT = 4.5;
    this.g.audio.buzz();
  }

  renderPhone() {
    const el = this.$('phone');
    const bat = Math.round(this.battery);
    const msgs = this.phoneMsgs.slice(-14).map((m) => `<div class="ph-msg ${m.me ? 'me' : ''} ${m.from === '???' || m.from === 'Unknown' ? 'bad' : ''}">${m.me ? '' : `<b>${esc(m.from)}</b>`}${esc(m.text)}</div>`).join('');
    el.innerHTML = `<div class="ph-top"><span>${this.$('osdBR').textContent.slice(-8)}</span><span class="ph-bat">${bat}%</span></div>
      <div class="ph-title">Messages</div><div class="ph-list">${msgs || '<div class="ph-empty">No messages</div>'}</div>
      <button class="ph-close ui-touchable">close</button>`;
    const list = el.querySelector('.ph-list'); list.scrollTop = list.scrollHeight;
  }

  async openPhone() {
    this.renderPhone();
    this.$('phone').hidden = false;
    this.phoneOpen = true;
    this.$('phoneNote').hidden = true;
    this.clickAdvance = false;
    this.g.audio.click();
    try {
      await this.g.dir.wait(0.2);
      await this.g.dir.until(() => this.advancePressed() || this.g.input.wasHit('phone'));
    } finally {
      this.g.input.consume('phone');
      this.$('phone').hidden = true;
      this.phoneOpen = false;
    }
  }

  // ------------------------------------------------------------ panel (generic modal)
  showPanel(html, cls = '') {
    const el = this.$('panel');
    el.className = 'panel ' + cls;
    el.innerHTML = html;
    el.hidden = false;
    return el;
  }
  hidePanel() { this.$('panel').hidden = true; }

  // ------------------------------------------------------------ per-frame
  update(dt) {
    // tweens
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k * k * (3 - 2 * k));
      if (k >= 1) { this.tweens.splice(i, 1); tw.done(); }
    }
    const d = this.dlg;
    if (d.active && !d.done) {
      if (d.shown < d.len) {
        const prev = Math.floor(d.shown);
        d.shown = Math.min(d.len, d.shown + dt * this.cps * (d.sp.evil ? 0.6 : 1));
        const now = Math.floor(d.shown);
        if (now !== prev && !d.voiced && now % 2 === 0 && d.sp.blip) this.g.audio.blip(d.sp.blip);
        if (this.advancePressed()) d.shown = d.len;
        if (Math.floor(d.shown) !== d.lastRender) {
          d.lastRender = Math.floor(d.shown);
          this.$('dText').innerHTML = renderSegs(d.segs, d.lastRender);
        }
        if (d.shown >= d.len) this.$('dNext').hidden = false;
      } else {
        d.t += dt;
        if (this.advancePressed() || (d.auto && d.t > d.auto)) d.done = true;
      }
    }
    const c = this.choice;
    if (c && !c.done) {
      const inp = this.g.input;
      const n = c.options.length;
      if (inp.wasHit('up')) { c.index = (c.index + n - 1) % n; this.renderChoice(); this.g.audio.blip(500); }
      if (inp.wasHit('down')) { c.index = (c.index + 1) % n; this.renderChoice(); this.g.audio.blip(500); }
      if (inp.wheel) { c.index = (c.index + (inp.wheel > 0 ? 1 : n - 1)) % n; this.renderChoice(); }
      if (inp.locked) {
        c.acc += inp.dy;
        if (Math.abs(c.acc) > 60) { c.index = (c.index + (c.acc > 0 ? 1 : n - 1)) % n; c.acc = 0; this.renderChoice(); this.g.audio.blip(500); }
      }
      for (let i = 0; i < Math.min(9, n); i++) if (inp.wasHit('n' + (i + 1))) { c.index = i; c.result = i; c.done = true; }
      if (!c.done && (inp.wasHit('confirm') && !inp.touch)) { inp.consume('confirm'); inp.consume('advance'); c.result = c.index; c.done = true; }
    }
    if (this.barkT > 0) { this.barkT -= dt; if (this.barkT <= 0) this.$('bark').hidden = true; }
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) this.$('hint').hidden = true; }
    if (this.phoneNoteT > 0) { this.phoneNoteT -= dt; if (this.phoneNoteT <= 0) this.$('phoneNote').hidden = true; }
    // toasts
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.$('toast').classList.remove('in'); }
    else if (this.toastQ.length && this.toastT <= -0.6) {
      const t = this.toastQ.shift();
      const el = this.$('toast');
      el.innerHTML = `<div class="t-icon">★</div><div><b>${esc(t.title)}</b><span>${esc(t.sub || '')}</span></div>`;
      el.hidden = false; el.classList.add('in');
      this.toastT = 3.6;
      this.g.audio.achievement();
    } else this.toastT -= dt;
    this.updateOSD();
  }
}
