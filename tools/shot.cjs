// Headless screenshot helper: node tools/shot.cjs <url> <out.png> [waitMs] [js-to-eval] [w] [h]
// Runs Chromium with SwiftShader for both WebGL2 and WebGPU.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const [url, out, wait = '4000', js = '', w = '1400', h = '860'] = process.argv.slice(2);
  const browser = await chromium.launch({ channel: 'chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  // headless Chromium can't present WebGPU canvases: render offscreen and paint a snapshot
  await page.addInitScript(() => { window.__SF_OFFSCREEN = true; });
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
  await page.goto(url);
  page.setDefaultTimeout(180000);
  await page.waitForTimeout(+wait);
  if (js) { const r = await page.evaluate(js); if (r !== undefined) logs.push('EVAL: ' + (typeof r === 'string' ? r : JSON.stringify(r))); await page.waitForTimeout(1500); }
  const snap = await page.evaluate(async () => {
    const r = window.__sfGPU; if (!r) return null;
    const c = await r.snapshot();
    c.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:0;pointer-events:none';
    document.body.appendChild(c);
    document.querySelectorAll('body > *:not(canvas)').forEach((e) => { if (e === c) return; if (getComputedStyle(e).position === 'static') e.style.position = 'relative'; e.style.zIndex = 1; });
    return 'webgpu ' + JSON.stringify(r.stats);
  });
  if (snap) logs.push('SNAPSHOT: ' + snap);
  await page.screenshot({ path: out, timeout: 150000, ...(/\.jpe?g$/.test(out) ? { quality: 80 } : {}) });
  console.log(logs.slice(0, 40).join('\n'));
  await browser.close();
})();
