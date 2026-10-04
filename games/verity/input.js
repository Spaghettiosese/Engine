// Keyboard / mouse / touch input with named actions.
const ACTIONS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  breath: ['Space'],
  interact: ['KeyE'],
  flashlight: ['KeyF'],
  crouch: ['KeyC', 'ControlLeft'],
  phone: ['Tab', 'KeyQ'],
  chat: ['KeyT', 'Enter'],
  pause: ['Escape', 'KeyP'],
  advance: ['KeyE', 'Space', 'Enter', 'NumpadEnter', 'mouse0'],
  confirm: ['KeyE', 'Space', 'Enter', 'NumpadEnter', 'mouse0'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  break: ['mouse0'],
  place: ['mouse2'],
  n1: ['Digit1'], n2: ['Digit2'], n3: ['Digit3'], n4: ['Digit4'], n5: ['Digit5'],
  n6: ['Digit6'], n7: ['Digit7'], n8: ['Digit8'], n9: ['Digit9'],
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.hit = new Set();
    this.vdown = new Set();
    this.vhit = new Set();
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.locked = false;
    this.sens = 1;
    this.invertY = false;
    this.joy = { x: 0, y: 0 };
    this.touch = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
    this.onLockChange = null;
    this.dragging = false;

    window.addEventListener('keydown', (e) => {
      if (this.typing()) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.hit.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.down.delete(e.code); });
    window.addEventListener('blur', () => { this.down.clear(); this.vdown.clear(); });
    window.addEventListener('mousemove', (e) => {
      if (this.locked) { this.dx += e.movementX; this.dy += e.movementY; }
      else if (this.dragging && !this.touch) { this.dx += e.movementX; this.dy += e.movementY; }
    });
    canvas.addEventListener('mousedown', (e) => {
      this.hit.add('mouse' + e.button); this.down.add('mouse' + e.button);
      if (e.button === 0) this.dragging = true;
    });
    window.addEventListener('mouseup', (e) => { this.down.delete('mouse' + e.button); if (e.button === 0) this.dragging = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  typing() {
    const a = document.activeElement;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
  }

  requestLock() {
    if (this.touch || this.locked) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* pointer lock is optional */ }
  }

  exitLock() {
    if (document.pointerLockElement) {
      try { document.exitPointerLock(); } catch (e) { /* ignore */ }
    }
  }

  isDown(a) {
    if (this.vdown.has(a)) return true;
    const codes = ACTIONS[a];
    if (!codes) return this.down.has(a);
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  wasHit(a) {
    if (this.vhit.has(a)) return true;
    const codes = ACTIONS[a];
    if (!codes) return this.hit.has(a);
    for (const c of codes) if (this.hit.has(c)) return true;
    return false;
  }

  consume(a) {
    this.vhit.delete(a);
    const codes = ACTIONS[a] || [a];
    for (const c of codes) this.hit.delete(c);
  }

  consumeAll() { this.hit.clear(); this.vhit.clear(); }

  axis() {
    let x = 0, y = 0;
    if (this.isDown('forward')) y += 1;
    if (this.isDown('back')) y -= 1;
    if (this.isDown('right')) x += 1;
    if (this.isDown('left')) x -= 1;
    x += this.joy.x; y += this.joy.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  look() {
    const k = 0.0022 * this.sens;
    return { dx: this.dx * k, dy: this.dy * k * (this.invertY ? -1 : 1) };
  }

  endFrame() {
    this.hit.clear(); this.vhit.clear();
    this.dx = 0; this.dy = 0; this.wheel = 0;
  }

  // ------------------------------------------------------------ touch UI
  buildTouch(root) {
    if (!this.touch) return;
    this.touchRoot = root;
    root.hidden = false;
    root.innerHTML = `
      <div class="t-joy" id="tJoy"><div class="t-knob" id="tKnob"></div></div>
      <div class="t-btns" id="tBtns"></div>
      <button class="t-pause" data-acts="pause" aria-label="Pause">II</button>`;
    const joyEl = root.querySelector('#tJoy');
    const knob = root.querySelector('#tKnob');
    let joyId = null, joyX = 0, joyY = 0;
    let lookId = null, lx = 0, ly = 0;
    const onStart = (e) => {
      for (const t of e.changedTouches) {
        const btn = t.target.closest && t.target.closest('[data-acts]');
        if (btn) continue;
        if (t.target.closest && t.target.closest('.ui-touchable')) continue;
        const canMove = this.touchMode !== 'none' && this.touchMode !== 'look';
        if (canMove && t.clientX < window.innerWidth * 0.42 && joyId === null) {
          joyId = t.identifier; joyX = t.clientX; joyY = t.clientY;
          joyEl.style.left = (joyX - 60) + 'px'; joyEl.style.top = (joyY - 60) + 'px';
          joyEl.classList.add('on');
        } else if (lookId === null) {
          lookId = t.identifier; lx = t.clientX; ly = t.clientY;
          this.vhit.add('tap');
        }
      }
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          let dx = (t.clientX - joyX) / 50, dy = (t.clientY - joyY) / 50;
          const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
          this.joy.x = dx; this.joy.y = -dy;
          knob.style.transform = `translate(${dx * 38}px, ${dy * 38}px)`;
          if (l > 0.95) this.vdown.add('run'); else this.vdown.delete('run');
        } else if (t.identifier === lookId) {
          this.dx += (t.clientX - lx) * 1.7; this.dy += (t.clientY - ly) * 1.7;
          lx = t.clientX; ly = t.clientY;
        }
      }
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          joyId = null; this.joy.x = 0; this.joy.y = 0; knob.style.transform = '';
          joyEl.classList.remove('on'); this.vdown.delete('run');
        }
        if (t.identifier === lookId) lookId = null;
      }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    root.addEventListener('touchstart', (e) => {
      const btn = e.target.closest('[data-acts]');
      if (!btn) return;
      e.preventDefault();
      for (const a of btn.dataset.acts.split(' ')) { this.vdown.add(a); this.vhit.add(a); }
      btn.classList.add('down');
    }, { passive: false });
    const up = (e) => {
      const btn = e.target.closest && e.target.closest('[data-acts]');
      if (!btn) return;
      for (const a of btn.dataset.acts.split(' ')) this.vdown.delete(a);
      btn.classList.remove('down');
    };
    root.addEventListener('touchend', up);
    root.addEventListener('touchcancel', up);
    this.setTouchMode('none');
  }

  setTouchMode(mode) {
    this.touchMode = mode;
    if (!this.touchRoot) return;
    const B =(label, acts, cls = '') => `<button class="t-btn ${cls}" data-acts="${acts}">${label}</button>`;
    const sets = {
      none: '',
      look: '',
      walk: B('USE', 'interact advance confirm', 'big') + B('RUN', 'run') + B('LIGHT', 'flashlight') + B('HOLD<br>BREATH', 'breath jump') + B('PHONE', 'phone'),
      hide: B('LEAVE', 'interact advance confirm', 'big') + B('HOLD<br>BREATH', 'breath jump'),
      voxel: B('BREAK', 'break', 'big') + B('PLACE', 'place') + B('JUMP', 'jump') + B('ASK', 'chat') + B('RUN', 'run'),
      chase: B('RUN', 'run', 'big') + B('JUMP', 'jump'),
    };
    this.touchRoot.querySelector('#tBtns').innerHTML = sets[mode] ?? '';
    this.touchRoot.querySelector('#tJoy').style.display = (mode === 'none' || mode === 'look') ? 'none' : '';
    this.vdown.clear();
  }
}
