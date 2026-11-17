// Headless-Chromium check of several-columns mode with every column's six-setting panel on the
// panel's Web Workers (index.html runColumnPanels, consensus-worker.mjs), README "Several columns
// on worker threads". Serves this directory on a local port and, on the currency example
// (data/fx-daily-returns.csv, 3 columns, 1,751 days) and the four European index return series
// joined into one file (4 columns, 1,859 days):
// (the browser adds <tbody> to the agreed table's markup; it is stripped before comparing)
//  1. clicks Analyze in several-columns mode and times how long until the results show, with the
//     panel workers on, and with them turned off (the page then runs every panel in its one main
//     worker, as it did before);
//  2. checks the agreed-changes table and the summary equal analyzeMulti() run in Node;
//  3. reloads with Worker removed: the same click must still give the Node result.
// Run: node eval/columns-workers-browser.mjs   (needs the playwright package)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { analyzeMulti } from '../multivariate.mjs';
import { multiSummary, agreedTableHtml } from '../multi-view.mjs';

const dir = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  try { const b = await readFile(join(dir, p || 'index.html')); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const fx = await readFile(join(dir, 'data/fx-daily-returns.csv'), 'utf8');
const idx = await Promise.all(['dax', 'cac', 'ftse', 'smi'].map(async (k) => (await readFile(join(dir, `data/${k}-returns.csv`), 'utf8')).trim().split('\n').slice(1).map((l) => l.split(','))));
const eu = 'row,dax,cac,ftse,smi\n' + idx[0].map((r, i) => [r[0], ...idx.map((s) => s[i][1])].join(',')).join('\n') + '\n';
const inputs = process.env.ONLY ? [{ name: 'currency returns, 3 columns', csv: fx }] : [{ name: 'currency returns, 3 columns', csv: fx }, { name: 'European index returns, 4 columns', csv: eu }];

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
let fail = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fail++; };

// panelWorkers false: the page's per-column workers are made to fail at once (an error on start),
// which sends it down its fallback, every panel in the one main worker (the page before this change).
const runOnce = async (page, csv) => page.evaluate(async (csv) => {
  const $ = (q) => document.querySelector(q);
  $('#shape').value = 'multi'; $('#shape').dispatchEvent(new Event('change'));
  $('#model').value = 'mean';
  $('#columns').value = '';
  $('#csv').value = csv;
  $('#multi-results').hidden = true;
  const t = performance.now();
  $('#run').click();
  while (($('#multi-results').hidden || !$('#working').hidden) && !$('#error').textContent && performance.now() - t < 120000) await new Promise((r) => setTimeout(r, 25));
  return { ms: performance.now() - t, summary: $('#multi-summary').textContent, agreed: $('#multi-agreed').innerHTML.replace(/<\/?tbody>/g, ''), err: $('#error').textContent, cores: navigator.hardwareConcurrency };
}, csv);

const blockPanelWorkers = () => {
  const W = window.Worker;
  window.Worker = function (src, o) { if (String(src).includes('consensus-worker')) throw new Error('blocked for the timing'); return new W(src, o); };
};

for (const { name, csv } of inputs) {
  const r = analyzeMulti({ csv, model: 'mean' });
  const want = { summary: multiSummary(r), agreed: agreedTableHtml(r) };
  const on = await browser.newPage();
  await on.goto(url);
  const a = await runOnce(on, csv);
  await on.close();
  const off = await browser.newPage();
  await off.addInitScript(blockPanelWorkers);
  await off.goto(url);
  const b = await runOnce(off, csv);
  await off.close();
  console.log(`${name} (${r.n} points), browser cores ${a.cores}: results shown after ${(a.ms / 1000).toFixed(1)} s with the panels on workers, ${(b.ms / 1000).toFixed(1)} s with every panel in the one main worker`);
  check(!a.err && a.summary === want.summary && a.agreed === want.agreed, `${name}: panels on workers give the Node summary and agreed table`);
  check(!b.err && b.summary === want.summary && b.agreed === want.agreed, `${name}: the one-worker fallback gives the same`);
}
{
  const page = await browser.newPage();
  await page.addInitScript(() => { delete window.Worker; });
  await page.goto(url);
  const r = analyzeMulti({ csv: fx, model: 'mean' });
  const o = await runOnce(page, fx);
  check(!o.err && o.summary === multiSummary(r) && o.agreed === agreedTableHtml(r), 'without workers the page runs it on the main thread and gets the same result');
  await page.close();
}
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
