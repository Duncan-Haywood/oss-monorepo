// Main-thread blocking on page load, measured in a real browser, for A/B tests
// of a perf change. It serves the built dist, loads each page N times with the
// CPU slowed (4x by default, Lighthouse's mobile setting), and prints the
// median of: blocking time (the part of each long task over 50 ms, summed
// until WAIT ms after load), the longest task, and Chrome's own style, layout
// and script totals.
//
//   node platform/pages/longtask.mjs --pages=wall-framing-takeoff/,wall-framing-takeoff/index-c.html
//   ... --runs=6 --cpu=4 --wait=4000 --width=412 --height=860
//
// Why (2026-11-11, docs/reports/polish-2026-11-11-wft-perf-hypotheses.md):
// Lighthouse's TBT on wall-framing-takeoff swung from 600 to 1,000 ms between
// two runs of the same page, so a 100 ms change can't be read from it. This
// interleaves the variants run by run (A, B, A, B, ...) so drift on a shared
// runner hits each one alike, and it is the measurement that showed
// content-visibility:auto trimming layout without trimming blocking time.
//
// To A/B a change without rebuilding, copy the page next to itself in dist
// (index-b.html) and edit the copy: relative module paths stay valid.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2' };

export function median(xs) {
  const v = [...xs].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Total blocking time from [start, duration] long-task entries. */
export function blocking(tasks) {
  return tasks.reduce((s, [, d]) => s + Math.max(0, d - 50), 0);
}

function serve(dist, port) {
  return http.createServer((req, res) => {
    let f = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(dist)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(port, '127.0.0.1');
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
  const DIST = path.resolve(process.env.DIST || path.join(here, 'dist'));
  if (!args.pages) { console.error('usage: longtask.mjs --pages=a/,a/index-b.html [--runs=6 --cpu=4 --wait=4000]'); process.exit(2); }
  const pages = args.pages.split(',');
  const RUNS = Number(args.runs || 6), CPU = Number(args.cpu || 4), WAIT = Number(args.wait || 4000);
  const W = Number(args.width || 412), H = Number(args.height || 860), PORT = Number(process.env.PORT || 8797);
  const { default: pw } = await import('/opt/node-tools/node_modules/playwright/index.js');
  const server = serve(DIST, PORT);
  const browser = await pw.chromium.launch();
  const res = Object.fromEntries(pages.map((p) => [p, []]));
  for (let i = 0; i < RUNS; i++) for (const p of pages) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    const pg = await ctx.newPage();
    await pg.addInitScript(() => {
      window.__lt = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true });
    });
    const cdp = await ctx.newCDPSession(pg);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    await cdp.send('Performance.enable');
    await pg.goto(`http://127.0.0.1:${PORT}/${p}`, { waitUntil: 'load' });
    await pg.waitForTimeout(WAIT);
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    const lt = await pg.evaluate(() => window.__lt);
    res[p].push({ block: blocking(lt), longest: Math.max(0, ...lt.map((x) => x[1])), style: m.RecalcStyleDuration * 1000, layout: m.LayoutDuration * 1000, script: m.ScriptDuration * 1000 });
    await ctx.close();
  }
  await browser.close();
  server.close();
  console.log(`| page (cpu ${CPU}x, ${W}x${H}, median of ${RUNS}) | blocking ms | longest task ms | style ms | layout ms | script ms | blocking, every run |`);
  console.log('|---|---|---|---|---|---|---|');
  for (const p of pages) {
    const r = res[p];
    const md = (k) => Math.round(median(r.map((x) => x[k])));
    console.log(`| /${p} | ${md('block')} | ${md('longest')} | ${md('style')} | ${md('layout')} | ${md('script')} | ${r.map((x) => Math.round(x.block)).join(', ')} |`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
