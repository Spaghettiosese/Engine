// Boot: create the engine's renderer, then the game.
import * as E from '../../src/engine/index.js';
import { Game } from './game.js';

const fatal = (title, msg) => { const d = document.getElementById('fatal'); d.hidden = false; d.innerHTML = `<div><h2>${title}</h2><p>${msg}</p></div>`; };
let renderer;
const lite = new URLSearchParams(location.search).has('lite');
try { renderer = await E.createRenderer(document.getElementById('game'), { backend: 'webgl2', ...(lite ? { msaa: 1 } : {}) }); }
catch (e) { fatal('3D GRAPHICS UNAVAILABLE', 'Verity needs WebGL2. ' + e.message); throw e; }
const game = new Game(renderer);
game.boot();
window.addEventListener('resize', () => game.applySettings());
const q = new URLSearchParams(location.search);
game.devSkip = q.get('skip');
// dev/test hook: ?ch=3 starts at a chapter without the title gate
if (q.has('ch')) { document.getElementById('gate').hidden = true; game.audio.init(); game.input.buildTouch(document.getElementById('touch')); game.playFrom(+q.get('ch') || 0, true); }
// dev/test hook: ?lv=school|tape|car|block|memory|house|truthhouse drops straight into a level, no story
if (q.has('lv')) {
  const L = { school: ['./school.js', 'SchoolLevel'], tape: ['./tape.js', 'TapeLevel'], car: ['./car.js', 'CarLevel'], block: ['./blockworld.js', 'BlockLevel'], memory: ['./memory.js', 'MemoryLevel'], house: ['./house.js', 'HouseLevel', 'evening'], dark: ['./house.js', 'HouseLevel', 'dark'], final: ['./house.js', 'HouseLevel', 'final'] }[q.get('lv')];
  if (L) {
    document.getElementById('gate').hidden = true; game.audio.init(); game.input.buildTouch(document.getElementById('touch'));
    const mod = await import(L[0]); const level = new mod[L[1]](game, L[2]);
    game.playing = true; game.setLevel(level);
    game.control = ['block', 'memory'].includes(q.get('lv')) ? 'voxel' : 'walk';
    game.retro.u.uFade.value = 0; document.getElementById('fader').style.opacity = 0;
    document.getElementById('hud') && (document.getElementById('hud').hidden = false);
  }
}
