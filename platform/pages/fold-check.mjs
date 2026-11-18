// Loads every audience page (c/for-*/) at phone size and fails when its first
// tool card does not start on the first screen. The rule and its history are
// in fold.mjs.
//
//   node platform/pages/fold-check.mjs                          # 390x844, serves dist itself
//   node platform/pages/fold-check.mjs --widths 320,360,375,390 # several phones, one browser
//   node platform/pages/fold-check.mjs --all                    # every page's top, not just failures
//
// It serves DIST on a free local port itself; set BASE_URL to check a server
// you started (or the live site) instead. Before 2026-11-18 it needed a
// `python3 -m http.server 8793` first, checked one width per run and printed
// only failures and the deepest page, so a before/after table took four runs
// and a hand-written probe (three polish friction reports that day).
//
// Same DIST / PLAYWRIGHT / CHROME_PATH variables as sideways.mjs. WIDTHS (or
// WIDTH) and HEIGHT override the 390x844 screen; ONLY_SLUGS is a comma list of
// audience page ids (for-retirees,for-parents); ALL=1 is --all.
// Exits 0 when every page passes at every width, 1 listing each page that does
// not, 2 when nothing could be checked (no build, no Playwright, nothing
// answering at BASE_URL, a bad width).
// Not part of CI: Playwright is not a dependency of this repo.

import { requirePlaywright } from './load-playwright.mjs';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIRST_TOOL_SELECTOR, FOLD, foldFailures, foldTable, parseWidths } from './fold.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  return argv[i].includes('=') ? argv[i].split('=').slice(1).join('=') : argv[i + 1];
};
const DIST = path.resolve(process.env.DIST || path.join(HERE, 'dist'));
const HEIGHT = Number(flag('height') || process.env.HEIGHT || FOLD.height);
const SHOW_ALL = argv.includes('--all') || process.env.ALL === '1';
const only = (process.env.ONLY_SLUGS || '').split(',').filter(Boolean);
const chromePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
let widths;
try {
  widths = parseWidths(flag('widths') ?? process.env.WIDTHS, process.env.WIDTH || FOLD.width);
} catch (e) {
  console.error(`fold-check: ${e.message}`);
  process.exit(2);
}

const dir = path.join(DIST, 'c');
if (!fs.existsSync(dir)) {
  console.error(`No built category pages at ${dir}. Run: node platform/pages/build.mjs`);
  process.exit(2);
}
const pages = fs.readdirSync(dir)
  .filter((name) => name.startsWith('for-') && fs.existsSync(path.join(dir, name, 'index.html')))
  .filter((name) => !only.length || only.includes(name))
  .sort();
if (!pages.length) {
  console.error(`No audience pages under ${dir}${only.length ? ` matching ${only.join(',')}` : ''}.`);
  process.exit(2);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

/** A static server for DIST on a free 127.0.0.1 port; paths cannot leave DIST. */
async function serveDist() {
  const srv = http.createServer((q, r) => {
    let rel;
    try { rel = decodeURIComponent(new URL(q.url, 'http://x').pathname); } catch { rel = '/'; }
    let p = path.join(DIST, rel);
    if (p !== DIST && !p.startsWith(DIST + path.sep)) { r.writeHead(403); r.end(); return; }
    if (rel.endsWith('/')) p = path.join(p, 'index.html');
    fs.readFile(p, (e, d) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((ok, fail) => { srv.once('error', fail); srv.listen(0, '127.0.0.1', ok); });
  return { srv, base: `http://127.0.0.1:${srv.address().port}` };
}

const playwright = await requirePlaywright();
let server = null;
let BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
if (BASE) {
  try {
    await fetch(`${BASE}/`, { signal: AbortSignal.timeout(5000) });
  } catch (e) {
    console.error(`Nothing answers at BASE_URL ${BASE} (${e.cause?.code || e.message}). Unset BASE_URL and fold-check serves ${DIST} itself.`);
    process.exit(2);
  }
} else {
  server = await serveDist();
  BASE = server.base;
}

const browser = await playwright.chromium.launch(chromePath ? { executablePath: chromePath } : {});
const byWidth = new Map();
const failures = [];
const summary = [];
try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: HEIGHT } });
    const page = await context.newPage();
    const rows = [];
    const at = widths.length > 1 ? ` at ${width}px` : '';
    for (const name of pages) {
      try {
        await page.goto(`${BASE}/c/${name}/`, { waitUntil: 'load', timeout: 30000 });
      } catch (e) {
        failures.push(`c/${name}${at}: did not load (${String(e.message || e).split('\n')[0]})`);
        continue;
      }
      const top = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? el.getBoundingClientRect().top + scrollY : null;
      }, FIRST_TOOL_SELECTOR);
      rows.push({ page: `c/${name}`, top });
    }
    await context.close();
    byWidth.set(width, rows);
    failures.push(...foldFailures(rows, { height: HEIGHT }).map((f) => (at ? f.replace(/^(\S+):/, `$1${at}:`) : f)));
    const deepest = rows.filter((r) => r.top != null).sort((a, b) => b.top - a.top)[0];
    summary.push(`${pages.length} audience pages at ${width}x${HEIGHT}; deepest first tool card: ${deepest ? `${deepest.page} at ${Math.round(deepest.top)}px` : 'none'}.`);
  }
} finally {
  await browser.close();
  server?.srv.close();
}

console.log(summary.join('\n'));
if (SHOW_ALL) console.log(foldTable(byWidth, { height: HEIGHT }).join('\n'));
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
console.log(`Every audience page shows a tool on the first screen${widths.length > 1 ? ` at ${widths.join(', ')}px` : ''}.`);
