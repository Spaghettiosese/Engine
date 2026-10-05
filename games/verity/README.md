# VERITY

A first-person horror game built entirely on the ShapeForge engine: no other libraries, no build step.
Open `games/verity/index.html` from any static server (`npm start`, then
<http://localhost:8080/games/verity/>), click the page once to start audio, and play.

You are Harry Zhong, 16. Your little brother Eric (9) has found a Minecraft mod called VERITY, a
yellow smiley ball that can only tell the truth. Your family is keeping a secret from Eric, and
Verity is hungry for exactly that kind of thing.

## Chapters

| # | Chapter | What happens |
| --- | --- | --- |
| 0 | Tape 01 | Dale Whitcomb's last devlog, filmed on a camcorder (zoom with the wheel). The figure in the glass moves when you look away. |
| 1 | Last Bell | Rosewood High. Test, locker, Priya, Gus the janitor, Eric at the curb. |
| 2 | The Drive Home | The Camry at dusk, the radio, a police car outside Tyler's house. |
| 3 | Home | The Zhong house: shoes off, Nai Nai's altar, dumplings, Eric's math homework, the arcade and den, and the smart speaker Kevin. |
| 4 | Ask Me Anything | Eric's Minecraft world. Ask Verity anything (start with France: "Oh Oui Oui Oui! It is Paris!"), build, dig, then run. |
| 5 | Static | The haunted TV, the locked bathroom, and a house that is starting to change. |
| 6 | Lights Out | Power cut. Reset the breaker, then hide and seek in the dark house; pick the difficulty in Settings. |
| 7 | July 14 | Verity rebuilds the night Dad left, out of blocks. |
| 8 | The Truth | The den, the screen, and the question you are not supposed to ask. |

## Controls

WASD move, Shift run, C crouch, E use, F phone flashlight, mouse look, Esc pause. Touch controls appear on phones.
In the Minecraft chapters: hold left click to break, right click to place, 1-9 for the hotbar, T to talk to Verity.

## How it uses the engine

| Piece | Engine feature |
| --- | --- |
| Zhong house, school, street | `Kit` merged architecture, `archPalette`, procedural materials (planks, stucco, checker, brick, fabric...), point lights, sun shadows |
| All people | The Cowboy skeleton and part library, re-dressed and re-proportioned (`people.js`), with shared gait, idle and gesture clips from `Mixer` |
| Verity's monster and the chase | The Grinner, driven by a stalker AI with line of sight, noise and hiding spots (`stalker.js`) |
| Minecraft world | Chunk `Geometry` with a nearest-neighbour atlas `Texture` (`voxel.js`) |
| Screens, face and lights | `Material.emissiveMap`, `Particles`, `applyTimeOfDay`, the post stack (SSAO, volumetrics, bloom, grain) |
| Model viewer | `viewer.html` shows every character with every animation |

Engine changes made for the game: `Material.emissiveMap` (screens glow with their own image) and
`Texture.nearest` (pixel-crisp block textures).

## Files

`main.js` boots the renderer. `game.js` is the loop, saves and achievements. `chapters.js` lists the chapters.
`stage.js` is the level base class (colliders, interaction, doors, hiding, lamps); `walker.js` is the first-person
player; `actor.js` drives characters. `house.js`, `school.js`, `car.js`, `tape.js`, `blockworld.js`, `memory.js`,
`home.js`, `static.js`, `dark.js`, `truth.js` are the levels and their scripts. `arcade.js` has the arcade games,
`desktop.js` the fake PC, `brain.js` Verity's answers, `lore.js` the devlogs.
