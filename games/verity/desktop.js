// The Zhong family PC: a small retro desktop with files, a Minecraft launcher
// and (later) a console that Verity has taken over.
import { iconFor, B } from './blocks.js';
import { makeCanvas, drawVerityOnCanvas } from './textures.js';

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

let verityIcon = null;
function vIcon(kind = 'happy') {
  const c = makeCanvas(32, 32);
  drawVerityOnCanvas(c.getContext('2d'), 16, 16, 14, kind);
  return c.toDataURL();
}

export class Desktop {
  constructor(game) {
    this.g = game;
    this.root = document.getElementById('desktop');
    this.actions = [];
    this.isOpen = false;
    this.z = 10;
  }

  open(opts = {}) {
    this.isOpen = true;
    this.actions = [];
    this.mode = opts.mode || 'normal';
    this.g.input.exitLock();
    this.g.input.setTouchMode('none');
    const icons = opts.icons || [];
    verityIcon = verityIcon || vIcon();
    const art = (k) => {
      if (k === 'mc') return `<img src="${iconFor(B.GRASS)}" alt="">`;
      if (k === 'verity') return `<img src="${this.mode === 'corrupt' ? vIcon('grin') : verityIcon}" alt="">`;
      return `<span class="ico ico-${k}"></span>`;
    };
    this.root.className = 'desktop ' + this.mode;
    this.root.innerHTML = `
      <div class="dt-screen">
        <div class="dt-icons">${icons.map((ic) => `<button class="dt-icon ui-touchable" data-id="${ic.id}">${art(ic.art)}<span>${esc(ic.label)}</span></button>`).join('')}</div>
        <div class="dt-wins"></div>
        <div class="dt-bar"><span class="dt-start">${this.mode === 'corrupt' ? ':)' : 'Start'}</span><span class="dt-task"></span><span class="dt-clock"></span>${opts.canLeave !== false ? '<button class="dt-leave ui-touchable">Stand up</button>' : ''}</div>
      </div>`;
    this.root.hidden = false;
    this.wins = this.root.querySelector('.dt-wins');
    this.root.querySelectorAll('.dt-icon').forEach((b) => b.addEventListener('click', () => {
      this.g.audio.click();
      const ic = icons.find((i) => i.id === b.dataset.id);
      if (ic && ic.open) ic.open(this); else this.fire(b.dataset.id);
    }));
    const leave = this.root.querySelector('.dt-leave');
    if (leave) leave.addEventListener('click', () => this.fire('leave'));
    this.clockEl = this.root.querySelector('.dt-clock');
    this.g.audio.pcBoot();
  }

  close() {
    this.isOpen = false;
    this.root.hidden = true;
    this.root.innerHTML = '';
  }

  fire(id) { this.actions.push(id); }

  // Resolve when one of the ids fires; returns the id.
  async wait(ids) {
    const set = Array.isArray(ids) ? ids : [ids];
    let got = null;
    await this.g.dir.until(() => {
      const i = this.actions.findIndex((a) => set.includes(a));
      if (i >= 0) { got = this.actions[i]; this.actions.splice(i, 1); return true; }
      return false;
    });
    return got;
  }

  window(title, html, opts = {}) {
    const w = document.createElement('div');
    w.className = 'dt-win ' + (opts.cls || '');
    w.style.zIndex = ++this.z;
    w.innerHTML = `<div class="dt-title"><span>${esc(title)}</span><button class="dt-x ui-touchable" aria-label="Close">×</button></div><div class="dt-body">${html}</div>`;
    this.wins.appendChild(w);
    w.querySelector('.dt-x').addEventListener('click', () => { w.remove(); if (opts.onClose) opts.onClose(); this.fire('close:' + (opts.id || title)); });
    w.addEventListener('mousedown', () => { w.style.zIndex = ++this.z; });
    return w;
  }

  notepad(title, text, opts = {}) {
    return this.window(title, `<pre class="dt-pre">${esc(text)}</pre>`, { cls: 'notepad', ...opts });
  }

  update() {
    if (this.isOpen && this.clockEl) {
      const c = this.g.clock, h = Math.floor(c / 60) % 24, m = Math.floor(c % 60);
      this.clockEl.textContent = `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
    }
  }
}
