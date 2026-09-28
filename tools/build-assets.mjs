// Bakes the Cowboy (model + generated clips) into assets/cowboy.json for games to load.
import { writeFileSync } from 'node:fs';
import { cowboyDefinition } from '../src/content/cowboy.js';
import { grinnerDefinition } from '../src/content/monster.js';
import { garandDefinition } from '../src/content/garand.js';
const def = cowboyDefinition();
const out = { format: 'shapeforge-character', version: 1, ...def };
writeFileSync(new URL('../assets/cowboy.json', import.meta.url), JSON.stringify(out));
console.log('wrote assets/cowboy.json', def.parts.length, 'parts,', def.clips.length, 'clips:', def.clips.map((c) => `${c.name} (${c.duration}s, ${c.tracks.length} tracks)`).join(', '));
const g = grinnerDefinition();
writeFileSync(new URL('../assets/grinner.json', import.meta.url), JSON.stringify({ format: 'shapeforge-character', version: 1, ...g }));
console.log('wrote assets/grinner.json', g.parts.length, 'parts,', g.clips.length, 'clips:', g.clips.map((c) => `${c.name} (${c.duration}s, ${c.tracks.length} tracks)`).join(', '));
const m1 = garandDefinition();
writeFileSync(new URL('../assets/m1-garand.json', import.meta.url), JSON.stringify({ format: 'shapeforge-character', version: 1, ...m1 }));
console.log('wrote assets/m1-garand.json', m1.parts.length, 'parts,', m1.clips.length, 'clips:', m1.clips.map((c) => `${c.name} (${c.duration}s)`).join(', '));
