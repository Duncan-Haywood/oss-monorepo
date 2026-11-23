// The first press on the page against a server that caches like the live site
// (platform/perf/revalidate-serve.mjs on a built site, e.g. 150 ms per request):
// load, wait 3 s idle, press "Load example", time the main result and the agreed panel,
// then press again on the same page. Fresh browser context per visit; median of N.
// Run: node eval/first-press-browser.mjs http://localhost:<port>/changepoint-detector/ [N]
// Background: docs/history/changepoint-detector-page-perf-2026-11-23.md.
import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
const [url, N = 5] = [process.argv[2], +process.argv[3] || 5];
const b = await chromium.launch();
const rows = [];
for (let i = 0; i < N; i++) {
  const ctx = await b.newContext(); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(3000);
  await fetch(new URL('/__reset', url));
  const one = async () => {
    await p.evaluate(() => { document.querySelector('#results').hidden = true; document.querySelector('#agreed').hidden = true; });
    const t = Date.now(); await p.click('#example');
    await p.waitForSelector('#results:not([hidden])', { timeout: 60000 }); const r = Date.now() - t;
    await p.waitForFunction(() => { const e = document.querySelector('#agreed'); return !e.hidden && !/working in the background/.test(e.textContent); }, null, { timeout: 120000 }); const a = Date.now() - t;
    return [r, a];
  };
  const [r1, a1] = await one(); const reqs1 = (await (await fetch(new URL('/__log', url))).json()).length;
  await p.waitForTimeout(1000); await fetch(new URL('/__reset', url)); const [r2, a2] = await one(); const reqs2 = (await (await fetch(new URL('/__log', url))).json()).length;
  const agreed = await p.textContent('#agreed'); const summ = await p.textContent('#results');
  rows.push({ r1, a1, r2, a2, reqs1, reqs2, errs: errs.length, agreed: agreed.trim().slice(0, 120), sumLen: summ.length });
  await ctx.close();
}
await b.close();
const med = (k) => rows.map((r) => r[k]).sort((x, y) => x - y)[Math.floor(rows.length / 2)];
console.log(JSON.stringify(rows));
console.log('median first result', med('r1'), 'first agreed', med('a1'), 'second result', med('r2'), 'second agreed', med('a2'), 'requests during first run', med('reqs1'), 'second', med('reqs2'));
