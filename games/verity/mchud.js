// Minecraft-style HUD: chat log, "ask Verity" input with suggestions, hotbar,
// loading and death screens.
import { iconFor } from './blocks.js';

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

const SPLASHES = [
  'Now with 100% more truth!', 'She is listening!', 'Also try dumplings!', 'Oui oui oui!', 'Ask me anything!',
  'Never dig straight down!', 'Made in Rosewood, CA!', 'Do not let her see you!', 'Tell the truth!', ':)',
];

export class McHud {
  constructor(game) {
    this.g = game;
    this.root = document.getElementById('mc');
    this.root.innerHTML = `
      <div class="mc-cross">+</div>
      <div class="mc-chat" id="mcChat"></div>
      <form class="mc-input ui-touchable" id="mcForm" hidden>
        <div class="mc-sugg" id="mcSugg"></div>
        <input id="mcIn" maxlength="90" autocomplete="off" spellcheck="false" aria-label="Chat message">
      </form>
      <div class="mc-hotbar" id="mcHot"></div>
      <div class="mc-over" id="mcOver" hidden></div>`;
    this.chat = this.root.querySelector('#mcChat');
    this.form = this.root.querySelector('#mcForm');
    this.input = this.root.querySelector('#mcIn');
    this.sugg = this.root.querySelector('#mcSugg');
    this.hot = this.root.querySelector('#mcHot');
    this.over = this.root.querySelector('#mcOver');
    this.chatOpen = false;
    this.onSubmit = null;
    this.lines = [];
    this.iconCache = new Map();
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const t = this.input.value.trim();
      this.closeChat();
      if (t && this.onSubmit) this.onSubmit(t);
      this.g.input.requestLock();
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.closeChat(); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        const s = this.suggestions || [];
        if (s.length) { this.sIdx = ((this.sIdx ?? -1) + 1) % s.length; this.input.value = s[this.sIdx]; }
      }
      e.stopPropagation();
    });
  }

  show(on) { this.root.hidden = !on; document.getElementById('ui').classList.toggle('mc-on', on); if (!on) this.closeChat(); }

  line(html, cls = '') {
    const el = document.createElement('div');
    el.className = 'mc-line ' + cls;
    el.innerHTML = html;
    this.chat.appendChild(el);
    this.lines.push({ el, t: 0 });
    while (this.chat.children.length > 12) this.chat.removeChild(this.chat.firstChild);
    this.chat.scrollTop = this.chat.scrollHeight;
  }

  msg(from, text, color = '#ffffff') { this.line(`<span style="color:${color}">&lt;${esc(from)}&gt;</span> ${esc(text)}`); }
  sys(text, color = '#ffff55') { this.line(`<span style="color:${color}">${esc(text)}</span>`); }
  verity(text) { this.line(`<span class="v-tag">[VERITY]</span> <span class="v-text">${esc(text)}</span>`, 'verity'); }

  openChat(prefill = '', suggestions = []) {
    if (this.chatOpen) return;
    this.chatOpen = true;
    this.suggestions = suggestions;
    this.sIdx = -1;
    this.form.hidden = false;
    this.root.classList.add('chatting');
    this.input.value = prefill;
    this.sugg.innerHTML = suggestions.map((s) => `<button type="button" class="mc-s ui-touchable">${esc(s)}</button>`).join('');
    this.sugg.querySelectorAll('.mc-s').forEach((b) => b.addEventListener('click', () => { this.input.value = b.textContent; this.form.requestSubmit(); }));
    this.g.input.exitLock();
    setTimeout(() => { this.input.focus(); try { this.input.setSelectionRange(this.input.value.length, this.input.value.length); } catch (e) { /* ok */ } }, 30);
  }

  closeChat() {
    if (!this.chatOpen) return;
    this.chatOpen = false;
    this.form.hidden = true;
    this.root.classList.remove('chatting');
    this.input.blur();
  }

  setHotbar(slots, sel) {
    const html = slots.map((s, i) => {
      let icon = '';
      if (s && s.item !== null && s.item !== undefined) {
        const k = String(s.item);
        if (!this.iconCache.has(k)) this.iconCache.set(k, iconFor(s.item));
        icon = `<img src="${this.iconCache.get(k)}" alt="">${s.count > 1 ? `<i>${s.count}</i>` : ''}`;
      }
      return `<div class="mc-slot ${i === sel ? 'sel' : ''}">${icon}</div>`;
    }).join('');
    if (html !== this.hotHtml) { this.hot.innerHTML = html; this.hotHtml = html; }
  }

  async loading(title = 'Loading world', dur = 3) {
    const splash = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
    this.over.className = 'mc-over dirt';
    this.over.innerHTML = `<div class="mc-load"><div class="mc-logo">MINECRAFT<em>${esc(splash)}</em></div><div>${esc(title)}</div><div class="mc-bar"><i></i></div><small>Loading mod: verity-0.9.1.jar</small></div>`;
    this.over.hidden = false;
    const bar = this.over.querySelector('.mc-bar i');
    const t0 = this.g.time;
    await this.g.dir.until(() => { const k = Math.min(1, (this.g.time - t0) / dur); bar.style.width = (k * 100) + '%'; return k >= 1; });
    this.over.hidden = true;
  }

  async death(msg) {
    this.over.className = 'mc-over dead';
    this.over.innerHTML = `<div class="mc-dead"><h2>You Died!</h2><p>${esc(msg)}</p><button class="mc-btn ui-touchable" id="mcRespawn">Respawn</button></div>`;
    this.over.hidden = false;
    this.g.input.exitLock();
    let go = false;
    this.over.querySelector('#mcRespawn').addEventListener('click', () => { go = true; this.g.input.requestLock(); });
    await this.g.dir.until(() => go || this.g.input.wasHit('confirm'));
    this.over.hidden = true;
  }

  hideOverlay() { this.over.hidden = true; }

  update(dt) {
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i];
      l.t += dt;
      l.el.classList.toggle('old', l.t > 12 && !this.chatOpen);
      if (!l.el.parentNode) this.lines.splice(i, 1);
    }
  }
}
