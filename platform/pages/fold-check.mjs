// Loads every audience page (c/for-*/) at phone size and fails when its first
// tool card does not start on the first screen. The rule and its history are
// in fold.mjs.
//
//   python3 -m http.server 8793 --directory platform/pages/dist &
//   node platform/pages/fold-check.mjs
//
// Same BASE_URL / DIST / PLAYWRIGHT / CHROME_PATH variables as sideways.mjs.
// WIDTH and HEIGHT override the 390x844 screen; ONLY_SLUGS is a comma list of
// audience page ids (for-retirees,for-parents).
// Exits 0 when every page passes, 1 listing each page that does not, 2 when
// nothing could be checked (no build, no Playwright, nothing answering).
// Not part of CI: Playwright is not a dependency of this repo.

import { requirePlaywright } from './load-playwright.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIRST_TOOL_SELECTOR, FOLD, foldFailures } from './fold.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.BASE_URL || 'http://localhost:8793').replace(/\/$/, '');
const DIST = process.env.DIST || path.join(HERE, 'dist');
const WIDTH = Number(process.env.WIDTH || FOLD.width);
const HEIGHT = Number(process.env.HEIGHT || FOLD.height);
const only = (process.env.ONLY_SLUGS || '').split(',').filter(Boolean);
const chromePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;

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

const playwright = await requirePlaywright();
try {
  await fetch(`${BASE}/`, { signal: AbortSignal.timeout(5000) });
} catch (e) {
  console.error(`Nothing answers at ${BASE} (${e.cause?.code || e.message}). Serve the build first: python3 -m http.server 8793 --directory ${DIST} &`);
  process.exit(2);
}

const browser = await playwright.chromium.launch(chromePath ? { executablePath: chromePath } : {});
const page = await (await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } })).newPage();
const rows = [];
const loadFailures = [];
for (const name of pages) {
  try {
    await page.goto(`${BASE}/c/${name}/`, { waitUntil: 'load', timeout: 30000 });
  } catch (e) {
    loadFailures.push(`c/${name}: did not load (${String(e.message || e).split('\n')[0]})`);
    continue;
  }
  const top = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? el.getBoundingClientRect().top + scrollY : null;
  }, FIRST_TOOL_SELECTOR);
  rows.push({ page: `c/${name}`, top });
}
await browser.close();

const failures = [...loadFailures, ...foldFailures(rows, { height: HEIGHT })];
const deepest = rows.filter((r) => r.top != null).sort((a, b) => b.top - a.top)[0];
console.log(`${pages.length} audience pages at ${WIDTH}x${HEIGHT}; deepest first tool card: ${deepest ? `${deepest.page} at ${Math.round(deepest.top)}px` : 'none'}.`);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
console.log('Every audience page shows a tool on the first screen.');
