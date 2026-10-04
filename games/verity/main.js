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
// dev/test hook: ?ch=3 starts at a chapter without the title gate
if (q.has('ch')) { document.getElementById('gate').hidden = true; game.audio.init(); game.input.buildTouch(document.getElementById('touch')); game.playFrom(+q.get('ch') || 0, true); }
