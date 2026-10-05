// Packs VERITY for hosting as a single page: dist/verity/index.html plus src/ and games/verity/.
// The host wraps the page in its own document skeleton, so the doctype/html/head/body tags are
// stripped, and a <base> makes the game's relative script and CSS paths resolve from the root.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
const root = new URL('..', import.meta.url).pathname, out = join(root, 'dist/verity');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const html = readFileSync(join(root, 'games/verity/index.html'), 'utf8')
  .replace(/<!doctype html>\s*/i, '').replace(/<\/?html[^>]*>\s*/gi, '').replace(/<\/?head>\s*/gi, '').replace(/<\/?body>\s*/gi, '')
  .replace(/<meta charset[^>]*>\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<title>/i, '<base href="games/verity/">\n<title>');
writeFileSync(join(out, 'index.html'), html);
const files = [];
const walk = (d) => readdirSync(join(root, d)).forEach((f) => { const p = join(d, f); if (statSync(join(root, p)).isDirectory()) walk(p); else if (!/\.(md|jpg)$/.test(f) && f !== 'index.html') files.push(p); });
walk('src'); walk('games/verity');
for (const f of files) { mkdirSync(dirname(join(out, f)), { recursive: true }); copyFileSync(join(root, f), join(out, f)); }
writeFileSync(join(out, 'files.json'), JSON.stringify(files));
console.log('dist/verity:', files.length + 1, 'files');
