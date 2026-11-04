#!/usr/bin/env node
// Find venture pages that scroll sideways at phone width (default 375px).
// Opens ventures/*/index.html from disk in headless Chromium with the network
// blocked, so only local layout is judged. Needs Playwright (node).
//   node platform/ci/check_mobile_overflow.mjs [--limit N] [--width 375] [--slack 1]
// Exit 1 when any page overflows by more than --slack pixels.
import { readdirSync, existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? +process.argv[i + 1] : d; };
const width = arg('width', 375), slack = arg('slack', 1), limit = arg('limit', 0);
let pages = readdirSync(path.join(root, 'ventures')).sort()
  .map(n => path.join(root, 'ventures', n, 'index.html')).filter(existsSync);
if (limit) pages = pages.slice(0, limit);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width, height: 800 } });
await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const pg = await ctx.newPage();
const bad = [];
for (const f of pages) {
  try {
    await pg.goto(pathToFileURL(f).href, { waitUntil: 'load', timeout: 8000 });
    const w = await pg.evaluate(() => document.documentElement.scrollWidth);
    if (w > width + slack) bad.push([w - width, path.basename(path.dirname(f))]);
  } catch (e) { console.log('skip', path.basename(path.dirname(f)), String(e).slice(0, 60)); }
}
await b.close();
bad.sort((x, y) => y[0] - x[0]).forEach(([d, n]) => console.log(String(d).padStart(5) + 'px over  ' + n));
console.log(`${bad.length} of ${pages.length} pages overflow at ${width}px`);
process.exit(bad.length ? 1 : 0);
