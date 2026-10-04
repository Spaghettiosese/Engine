import { HouseLevel } from './house.js';
import { person } from './cast.js';
import { Actor } from './actor.js';
export async function chapterTest(g) {
  const L = new HouseLevel(g, g.flags.mode || 'evening');
  g.setLevel(L);
  const P = L.player;
  g.audio.setAmbience('house');
  P.place(-8, -2, 0, 0);
  g.control = 'walk';
  g.input.setTouchMode('walk');
  g.ui.crosshair(true);
  const eric = new Actor(L, person('eric'), 'Eric'); eric.place(-4, -6, Math.PI);
  const mom = new Actor(L, person('mom'), 'Mom'); mom.place(3, -8, 1); 
  await g.ui.fade(0, 0.1);
  await g.until(() => false);
}
