// Bakes the Cowboy (model + generated clips) into assets/cowboy.json for games to load.
import { writeFileSync } from 'node:fs';
import { cowboyDefinition } from '../src/content/cowboy.js';
const def = cowboyDefinition();
const out = { format: 'shapeforge-character', version: 1, ...def };
writeFileSync(new URL('../assets/cowboy.json', import.meta.url), JSON.stringify(out));
console.log('wrote assets/cowboy.json', def.parts.length, 'parts,', def.clips.length, 'clips:', def.clips.map((c) => `${c.name} (${c.duration}s, ${c.tracks.length} tracks)`).join(', '));
