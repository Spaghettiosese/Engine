// ZHONG ARCADE — little games on the family PC and Dad's old cabinet.
// Each game draws into a 320x240 canvas. runArcade() resolves with the score.
import { drawVerityOnCanvas } from './textures.js';

const W = 320, H = 240;
const rnd = (a, b) => a + Math.random() * (b - a);

function text(g, t, x, y, size = 12, color = '#fff', align = 'center') {
  g.fillStyle = color; g.font = `${size}px "VT323", monospace`; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(t, x, y);
}
function dumpling(g, x, y, r) {
  g.fillStyle = '#f2e6c8'; g.beginPath(); g.ellipse(x, y + r * 0.2, r, r * 0.75, 0, Math.PI, 0); g.fill();
  g.fillRect(x - r, y + r * 0.2 - 1, r * 2, 2);
  g.strokeStyle = '#c8b890'; g.lineWidth = 1; g.beginPath();
  for (let i = -2; i <= 2; i++) { g.moveTo(x + i * r * 0.3, y - r * 0.45); g.lineTo(x + i * r * 0.35, y); }
  g.stroke();
}

// ------------------------------------------------------------ DUMPLING DASH
function dumplingDash(opts) {
  const C = 16, cols = W / C, rows = (H - 20) / C;
  let snake, dir, next, food, t, over, score, speed;
  const place = () => { do { food = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) }; } while (snake.some((p) => p.x === food.x && p.y === food.y)); };
  return {
    title: 'DUMPLING DASH', help: 'Arrows / WASD to steer. Eat every dumpling. Don\'t eat yourself.',
    init() { snake = [{ x: 8, y: 6 }, { x: 7, y: 6 }, { x: 6, y: 6 }]; dir = { x: 1, y: 0 }; next = dir; t = 0; over = false; score = 0; speed = 0.14; place(); },
    get over() { return over; }, get score() { return score; },
    input(k) {
      const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[k];
      if (d && (d[0] !== -dir.x || d[1] !== -dir.y)) next = { x: d[0], y: d[1] };
    },
    update(dt, api) {
      t += dt;
      if (t < speed) return;
      t = 0; dir = next;
      const h = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (h.x < 0 || h.y < 0 || h.x >= cols || h.y >= rows || snake.some((p) => p.x === h.x && p.y === h.y)) { over = true; api.sfx('lose'); return; }
      snake.unshift(h);
      if (h.x === food.x && h.y === food.y) { score++; api.sfx('eat'); speed = Math.max(0.06, speed - 0.004); place(); } else snake.pop();
    },
    draw(g) {
      g.fillStyle = opts.corrupt ? '#1a1400' : '#1c2a3a'; g.fillRect(0, 20, W, H - 20);
      for (let i = 0; i < snake.length; i++) {
        const p = snake[i];
        g.fillStyle = i === 0 ? '#ffd21e' : (i % 2 ? '#c89a30' : '#b0862a');
        g.fillRect(p.x * C + 1, 20 + p.y * C + 1, C - 2, C - 2);
      }
      const hd = snake[0];
      g.fillStyle = '#000'; g.fillRect(hd.x * C + 4, 20 + hd.y * C + 4, 2, 3); g.fillRect(hd.x * C + 10, 20 + hd.y * C + 4, 2, 3);
      if (opts.corrupt && score >= 3) drawVerityOnCanvas(g, food.x * C + 8, 20 + food.y * C + 8, 7, 'grin');
      else dumpling(g, food.x * C + 8, 20 + food.y * C + 9, 7);
      if (opts.corrupt && score >= 5) text(g, 'harry.', W / 2, H / 2, 40, 'rgba(255,40,20,0.35)');
    },
  };
}

// ------------------------------------------------------------ BRICK BREAKER
function brickBreaker() {
  let px, ball, bricks, over, score, lives, stuck, left, right;
  const build = () => {
    bricks = [];
    const cols = ['#e04040', '#e08a30', '#e0d040', '#50c050', '#40a0e0'];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 10; c++) bricks.push({ x: 8 + c * 30.4, y: 36 + r * 12, w: 28, h: 9, c: cols[r], alive: true });
  };
  return {
    title: 'BRICK BREAKER', help: 'Left / Right to move. Space to launch.',
    init() { px = W / 2; ball = { x: W / 2, y: H - 30, vx: 0, vy: 0 }; stuck = true; over = false; score = 0; lives = 3; build(); },
    get over() { return over; }, get score() { return score; },
    input(k, down) { if (k === 'left') left = down; if (k === 'right') right = down; if (k === 'a' && down && stuck) { stuck = false; ball.vx = rnd(-90, 90); ball.vy = -170; } },
    update(dt, api) {
      px = Math.max(26, Math.min(W - 26, px + ((right ? 1 : 0) - (left ? 1 : 0)) * 240 * dt));
      if (stuck) { ball.x = px; ball.y = H - 28; return; }
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      if (ball.x < 4 || ball.x > W - 4) { ball.vx *= -1; ball.x = Math.max(4, Math.min(W - 4, ball.x)); api.sfx('tick'); }
      if (ball.y < 24) { ball.vy = Math.abs(ball.vy); api.sfx('tick'); }
      if (ball.y > H - 24 && ball.y < H - 16 && Math.abs(ball.x - px) < 28 && ball.vy > 0) { ball.vy = -Math.abs(ball.vy) * 1.02; ball.vx = (ball.x - px) * 6; api.sfx('tick'); }
      for (const b of bricks) {
        if (b.alive && ball.x > b.x && ball.x < b.x + b.w && ball.y > b.y && ball.y < b.y + b.h) { b.alive = false; ball.vy *= -1; score += 10; api.sfx('eat'); break; }
      }
      if (!bricks.some((b) => b.alive)) { build(); ball.vy = -Math.abs(ball.vy) * 1.1; }
      if (ball.y > H) { lives--; api.sfx('lose'); stuck = true; if (lives <= 0) over = true; }
    },
    draw(g) {
      g.fillStyle = '#10101c'; g.fillRect(0, 20, W, H - 20);
      for (const b of bricks) if (b.alive) { g.fillStyle = b.c; g.fillRect(b.x, b.y, b.w, b.h); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(b.x, b.y, b.w, 2); }
      g.fillStyle = '#d8d8e0'; g.fillRect(px - 26, H - 16, 52, 6);
      dumpling(g, ball.x, ball.y, 4);
      for (let i = 0; i < lives; i++) { g.fillStyle = '#ffd21e'; g.fillRect(W - 14 - i * 12, 8, 8, 8); }
    },
  };
}

// ------------------------------------------------------------ VERITY SAYS
function veritySays(opts) {
  const PADS = [{ c: '#e04040', l: '#ff9090', f: 330 }, { c: '#40a040', l: '#90ff90', f: 392 }, { c: '#4060e0', l: '#90a8ff', f: 440 }, { c: '#e0c030', l: '#fff090', f: 523 }];
  let seq, idx, phase, t, lit, over, score, showI;
  return {
    title: 'VERITY SAYS', help: 'Watch Verity. Repeat with 1-4, the arrow keys, or tap the pads.',
    init() { seq = [Math.floor(Math.random() * 4)]; idx = 0; phase = 'show'; t = -0.6; lit = -1; over = false; score = 0; showI = 0; },
    get over() { return over; }, get score() { return score; },
    pads: PADS,
    press(i, api) {
      if (phase !== 'input' || over) return;
      lit = i; t = 0; api.tone(PADS[i].f);
      if (seq[idx] !== i) { over = true; api.sfx('lose'); return; }
      idx++;
      if (idx >= seq.length) { score++; api.sfx('eat'); seq.push(Math.floor(Math.random() * 4)); phase = 'show'; showI = 0; t = -0.8; }
    },
    input(k, down, api) { if (!down) return; const m = { n1: 0, n2: 1, n3: 2, n4: 3, up: 0, right: 1, down: 2, left: 3 }; if (m[k] !== undefined) this.press(m[k], api); },
    click(x, y, api) { const i = (y < 130 ? 0 : 2) + (x < W / 2 ? 0 : 1); this.press([0, 1, 3, 2][i], api); },
    update(dt, api) {
      t += dt;
      if (phase === 'show') {
        const step = Math.max(0.3, 0.6 - seq.length * 0.02);
        if (t > step) {
          t = 0;
          if (showI < seq.length) { lit = seq[showI]; api.tone(PADS[lit].f); showI++; } else { phase = 'input'; idx = 0; lit = -1; }
        } else if (t > step * 0.7) lit = -1;
      } else if (t > 0.25) lit = -1;
    },
    draw(g) {
      g.fillStyle = '#0a0a14'; g.fillRect(0, 20, W, H - 20);
      const pos = [[40, 30], [170, 30], [170, 132], [40, 132]];
      PADS.forEach((p, i) => { g.fillStyle = lit === i ? p.l : p.c; g.fillRect(pos[i][0], pos[i][1], 110, 92); text(g, String(i + 1), pos[i][0] + 12, pos[i][1] + 12, 14, '#000'); });
      drawVerityOnCanvas(g, W / 2, 128, 22, opts.corrupt && score > 4 ? 'grin' : 'happy');
      text(g, phase === 'show' ? 'WATCH' : 'YOUR TURN', W / 2, 162, 12, '#fff');
    },
  };
}

// ------------------------------------------------------------ SPACE KEVIN
function spaceKevin() {
  let x, shots, foes, over, score, t, left, right, fire, cd, lives;
  return {
    title: 'SPACE KEVIN', help: 'Left / Right to fly. Space to fire lo-fi beats at the creepers.',
    init() { x = W / 2; shots = []; foes = []; over = false; score = 0; t = 0; cd = 0; lives = 3; },
    get over() { return over; }, get score() { return score; },
    input(k, down) { if (k === 'left') left = down; if (k === 'right') right = down; if (k === 'a') fire = down; },
    update(dt, api) {
      x = Math.max(12, Math.min(W - 12, x + ((right ? 1 : 0) - (left ? 1 : 0)) * 200 * dt));
      cd -= dt; t += dt;
      if (fire && cd <= 0) { shots.push({ x, y: H - 30 }); cd = 0.25; api.sfx('tick'); }
      if (Math.random() < dt * (1 + t / 20)) foes.push({ x: rnd(16, W - 16), y: 20, vy: rnd(30, 60 + t * 2), kind: Math.random() < 0.15 ? 'v' : 'c' });
      for (const s of shots) s.y -= 260 * dt;
      for (const f of foes) f.y += f.vy * dt;
      for (const f of foes) for (const s of shots) if (!f.dead && !s.dead && Math.abs(f.x - s.x) < 10 && Math.abs(f.y - s.y) < 10) { f.dead = s.dead = true; score += f.kind === 'v' ? 50 : 10; api.sfx('eat'); }
      for (const f of foes) if (!f.dead && f.y > H - 22) { f.dead = true; lives--; api.sfx('lose'); if (lives <= 0) over = true; }
      shots = shots.filter((s) => !s.dead && s.y > 20); foes = foes.filter((f) => !f.dead);
    },
    draw(g) {
      g.fillStyle = '#050510'; g.fillRect(0, 20, W, H - 20);
      for (let i = 0; i < 30; i++) { g.fillStyle = '#333a55'; g.fillRect((i * 97) % W, 20 + ((i * 53 + Math.floor(t * 30)) % (H - 20)), 1, 1); }
      g.fillStyle = '#3a3a40'; g.fillRect(x - 7, H - 30, 14, 18); g.fillStyle = '#40c0ff'; g.fillRect(x - 6, H - 31, 12, 2);
      g.fillStyle = '#ffd21e'; for (const s of shots) g.fillRect(s.x - 1, s.y - 4, 2, 6);
      for (const f of foes) {
        if (f.kind === 'v') drawVerityOnCanvas(g, f.x, f.y, 8, 'grin');
        else { g.fillStyle = '#50b040'; g.fillRect(f.x - 7, f.y - 7, 14, 14); g.fillStyle = '#102010'; g.fillRect(f.x - 4, f.y - 4, 3, 3); g.fillRect(f.x + 1, f.y - 4, 3, 3); g.fillRect(f.x - 2, f.y, 4, 5); }
      }
      for (let i = 0; i < lives; i++) { g.fillStyle = '#40c0ff'; g.fillRect(W - 14 - i * 12, 8, 8, 8); }
    },
  };
}

// ------------------------------------------------------------ CHEM QUIZ (homework)
const CHEM = [
  ['How many moles are in 36 g of water (H₂O = 18 g/mol)?', ['1 mol', '2 mol', '18 mol', '36 mol'], 1],
  ['What is Avogadro\'s number (roughly)?', ['6.02 × 10²³', '3.14', '9.8 m/s²', '1.6 × 10⁻¹⁹'], 0],
  ['Balance: 2H₂ + O₂ → ?H₂O', ['1', '2', '3', '4'], 1],
  ['The reactant that runs out first is the...', ['excess reagent', 'catalyst', 'limiting reagent', 'mole'], 2],
  ['Molar mass of CO₂ (C=12, O=16)?', ['28 g/mol', '32 g/mol', '44 g/mol', '60 g/mol'], 2],
  ['Percent yield = actual ÷ theoretical × ...', ['10', '100', '1000', 'π'], 1],
  ['Which one is NOT a unit of amount of substance?', ['mole', 'mol', 'gram', '"a bunch"'], 3],
];
function chemQuiz() {
  let i, over, score, feedback, fbT, order;
  return {
    title: 'CHEM 2 · STUDY MODE', help: 'Press 1-4 or tap an answer. Mr. Delgado would be proud.',
    init() { order = CHEM.slice().sort(() => Math.random() - 0.5).slice(0, 6); i = 0; over = false; score = 0; feedback = ''; fbT = 0; },
    get over() { return over; }, get score() { return score; },
    answer(k, api) {
      if (fbT > 0 || over) return;
      const q = order[i];
      if (k === q[2]) { score++; feedback = 'CORRECT'; api.sfx('eat'); } else { feedback = 'NOPE — ' + q[1][q[2]]; api.sfx('lose'); }
      fbT = 1.1;
    },
    input(k, down, api) { if (!down) return; const m = { n1: 0, n2: 1, n3: 2, n4: 3 }; if (m[k] !== undefined) this.answer(m[k], api); },
    click(x, y, api) { if (y > 100) this.answer(Math.max(0, Math.min(3, Math.floor((y - 100) / 32))), api); },
    update(dt) { if (fbT > 0) { fbT -= dt; if (fbT <= 0) { i++; feedback = ''; if (i >= order.length) over = true; } } },
    draw(g) {
      g.fillStyle = '#f4f2ea'; g.fillRect(0, 20, W, H - 20);
      if (!order[i]) return;
      const q = order[i];
      g.fillStyle = '#1a3aa0'; g.font = '13px "VT323", monospace'; g.textAlign = 'left';
      const words = q[0].split(' '); let line = '', y = 44;
      for (const w of words) { if ((line + w).length > 42) { g.fillText(line, 14, y); line = ''; y += 14; } line += w + ' '; }
      g.fillText(line, 14, y);
      q[1].forEach((a, k) => { g.fillStyle = '#e0dcd0'; g.fillRect(14, 100 + k * 32, W - 28, 26); text(g, `${k + 1}. ${a}`, 24, 113 + k * 32, 14, '#222', 'left'); });
      text(g, `${i + 1} / ${order.length}`, W - 30, 30, 12, '#666');
      if (feedback) text(g, feedback, W / 2, 84, 16, feedback === 'CORRECT' ? '#1a8a2a' : '#c01818');
    },
  };
}

export const ARCADE = {
  dash: { make: dumplingDash, name: 'Dumpling Dash' },
  bricks: { make: brickBreaker, name: 'Brick Breaker' },
  simon: { make: veritySays, name: 'Verity Says' },
  kevin: { make: spaceKevin, name: 'Space Kevin' },
  chem: { make: chemQuiz, name: 'Chem Quiz' },
};

// Run a game in the modal panel. Resolves { score, best } when the player quits.
export function runArcade(game, id, opts = {}) {
  const def = ARCADE[id];
  const G = def.make(opts);
  game.input.exitLock();
  const prevControl = game.control;
  game.control = 'none';
  const el = game.ui.showPanel(`
    <div class="arc ui-touchable">
      <div class="arc-top"><b>${G.title}</b><span class="arc-score">0</span></div>
      <canvas width="${W}" height="${H}" class="arc-canvas"></canvas>
      <div class="arc-help">${G.help}</div>
      <div class="arc-pad">
        <button data-k="left">◀</button><button data-k="up">▲</button><button data-k="down">▼</button><button data-k="right">▶</button><button data-k="a" class="arc-a">A</button>
        <button data-k="quit" class="arc-q">QUIT</button>
      </div>
    </div>`, 'arcade');
  const canvas = el.querySelector('canvas');
  const g = canvas.getContext('2d');
  const scoreEl = el.querySelector('.arc-score');
  const audio = game.audio;
  const api = {
    sfx: (k) => { if (k === 'eat') audio.tone({ f: 880, slide: 1320, type: 'square', dur: 0.08, vol: 0.04 }); else if (k === 'lose') audio.tone({ f: 300, slide: 80, type: 'sawtooth', dur: 0.4, vol: 0.06 }); else audio.tone({ f: 600, type: 'square', dur: 0.03, vol: 0.02 }); },
    tone: (f) => audio.tone({ f, type: 'triangle', dur: 0.3, vol: 0.07 }),
  };
  const save = game.save.arcade || (game.save.arcade = {});
  let state = 'title', quit = false, result = null, last = performance.now();
  G.init();
  const keyMap = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'a', Enter: 'a', Digit1: 'n1', Digit2: 'n2', Digit3: 'n3', Digit4: 'n4' };
  const press = (k, down) => {
    if (k === 'quit') { if (down) quit = true; return; }
    if (state !== 'play') { if (down && (k === 'a' || k === 'n1')) { if (state === 'over') G.init(); state = 'play'; } return; }
    G.input(k, down, api);
  };
  const onKey = (e) => {
    if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); quit = true; return; }
    const k = keyMap[e.code];
    if (!k) return;
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'keydown' && e.repeat) return;
    press(k, e.type === 'keydown');
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  el.querySelectorAll('.arc-pad button').forEach((b) => {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); press(k, true); });
    b.addEventListener('pointerup', () => press(k, false));
    b.addEventListener('pointerleave', () => press(k, false));
  });
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    if (state !== 'play') { press('a', true); return; }
    if (G.click) G.click(x, y, api);
  });
  return new Promise((resolve) => {
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (quit || el.hidden) {
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('keyup', onKey, true);
        game.ui.hidePanel();
        game.control = prevControl;
        game.input.consumeAll();
        resolve(result || { score: G.score, best: save[id] || 0 });
        return;
      }
      if (state === 'play' && !game.paused) {
        G.update(dt, api);
        if (G.over) {
          state = 'over';
          const best = Math.max(save[id] || 0, G.score);
          const isBest = G.score > (save[id] || 0);
          save[id] = best; game.persist();
          result = { score: G.score, best, isBest };
          if (opts.onScore) opts.onScore(G.score);
        }
      }
      g.fillStyle = '#000'; g.fillRect(0, 0, W, 20);
      G.draw(g);
      text(g, G.title, 8, 10, 12, '#ffd21e', 'left');
      text(g, `BEST ${save[id] || 0}`, W - 8, 10, 12, '#aaa', 'right');
      scoreEl.textContent = 'SCORE ' + G.score;
      if (state === 'title') { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 20, W, H - 20); text(g, G.title, W / 2, 100, 26, '#ffd21e'); text(g, 'PRESS A / SPACE / TAP TO START', W / 2, 140, 13, '#fff'); }
      if (state === 'over') { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 20, W, H - 20); text(g, 'GAME OVER', W / 2, 96, 26, '#ff5050'); text(g, `SCORE ${G.score}${result && result.isBest ? '  NEW BEST!' : ''}`, W / 2, 126, 14, '#fff'); text(g, 'A: PLAY AGAIN   ESC/QUIT: LEAVE', W / 2, 150, 12, '#aaa'); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
