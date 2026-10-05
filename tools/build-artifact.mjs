// Packs the site into dist/artifact for publishing as a hosted page.
// The hosted main page is wrapped in its own document skeleton, so index.html's
// doctype/html/head/body tags are stripped; every other file is copied verbatim.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
const root = new URL('..', import.meta.url).pathname, out = join(root, 'dist/artifact');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const html = readFileSync(join(root, 'index.html'), 'utf8')
  .replace(/<!doctype html>\s*/i, '').replace(/<\/?html[^>]*>\s*/gi, '').replace(/<\/?head>\s*/gi, '').replace(/<\/?body>\s*/gi, '')
  .replace(/<meta charset[^>]*>\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '');
writeFileSync(join(out, 'index.html'), html);
const files = ['editor.html', 'viewer.html', 'assets/cowboy.json', 'assets/grinner.json', 'assets/m1-garand.json'];
const walk = (d) => readdirSync(join(root, d)).forEach((f) => { const p = join(d, f); statSync(join(root, p)).isDirectory() ? walk(p) : files.push(p); });
walk('src');
walk('examples');
walk('games');
for (const f of files) { mkdirSync(dirname(join(out, f)), { recursive: true }); copyFileSync(join(root, f), join(out, f)); }
// hosts that don't serve .glb get the sample model as base64 text; examples/import.html falls back to it
writeFileSync(join(out, 'assets/cowboy.glb.txt'), readFileSync(join(root, 'assets/cowboy.glb')).toString('base64'));
files.push('assets/cowboy.glb.txt');
writeFileSync(join(out, 'files.json'), JSON.stringify(files));
console.log('dist/artifact:', files.length + 1, 'files');
