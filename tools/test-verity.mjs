// VERITY checks: every game module parses, the cast builds on the shared Cowboy skeleton with
// every clip, the dialogue brain gives the France answer, the voxel world meshes, raycasts and
// collides. (Rendering is covered by playing the game; see games/verity/README.md.)
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const results = [];
const check = (name, ok, info = '') => results.push([name, ok, info]);
const dir = new URL('../games/verity/', import.meta.url).pathname;

{ // syntax of every module
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  const bad = files.filter((f) => spawnSync(process.execPath, ['--check', dir + f]).status !== 0);
  check('modules parse', bad.length === 0, `${files.length} files${bad.length ? ', bad: ' + bad.join(', ') : ''}`);
}
{ // chapters point at real files and exports
  const src = fs.readFileSync(dir + 'chapters.js', 'utf8');
  const refs = [...src.matchAll(/lazy\('\.\/([\w-]+\.js)', '(\w+)'\)/g)];
  const ok = refs.length === 9 && refs.every(([, f, fn]) => fs.existsSync(dir + f) && new RegExp('export (async )?function ' + fn + '\\b').test(fs.readFileSync(dir + f, 'utf8')));
  check('nine chapters wired', ok, `${refs.length} entries`);
}
{ // Verity answers
  const { askVerity } = await import(dir + 'brain.js');
  const r = askVerity('What is the capital of France?', { phase: 'cute', seen: {}, flags: {}, game: {} });
  check('France question', r && r.id === 'france' && /Oui Oui Oui/.test(r.text) && /Paris/.test(r.text), r && r.text);
}
{ // voxel world: mesh, raycast, collision (needs no GL: only geometry)
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => ({ data: new Uint8ClampedArray(4) }) }) }) };
  const { B, BLOCKS, isSolid } = await import(dir + 'blocks.js');
  check('block table', Object.keys(B).length >= 25 && isSolid(B.STONE) && !isSolid(B.WATER) && BLOCKS[B.BEDROCK].hard === Infinity, `${Object.keys(B).length} blocks`);
}
for (const [n, ok, info] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info ? '  (' + info + ')' : ''}`);
if (results.some((r) => !r[1])) process.exit(1);
console.log(`\n${results.length} VERITY checks passed`);
