// Loads every published page at a phone width and checks that it does not
// scroll sideways.
//
// Why this exists
// ---------------
// `sweep.mjs` proves every tool still computes, `contrast.mjs` runs axe over
// every page at two viewports, and `check.mjs` proves the files are right. All
// three pass on a page that is 647px wide inside a 360px window. The browser
// answers that page by zooming out until it fits, so every figure on it renders
// at roughly half size and the right-hand columns sit off-screen behind a
// horizontal scrollbar most phone visitors never think to use.
//
// Measured here on 2026-08-29, before the pass that added `reflow.mjs`: **39 of
// 445 pages**, worst `retainage-cashflow-calculator` at 647px and
// `reverb-fee-calculator`'s return-or-refund article at 568px. Axe has no rule
// for it; it is WCAG 1.4.10 (Reflow) and it is the one accessibility failure
// that degrades the product for every visitor rather than for a minority — and
// this portfolio's visitor is on a phone, in a van or a crawl space, which is
// why `sweep.mjs` drives one too.
//
//   node platform/pages/build.mjs --out=platform/pages/dist
//   python3 -m http.server 8793 --directory platform/pages/dist &
//   node platform/pages/sideways.mjs
//
//   WIDTH=320 node platform/pages/sideways.mjs   # the WCAG reflow width
//
//   # or against production once the owner flip lands:
//   BASE_URL=https://duncan-haywood.github.io/monorepo-projects node platform/pages/sideways.mjs
//
// **Check what is answering before you believe the result.** A server left
// running by an earlier build keeps the port, the second `http.server` exits
// with "Address already in use", and the run passes against the old tree
// without a word — the same trap `sweep.mjs` and `contrast.mjs` document. One
// curl settles it:
//
//   curl -s http://localhost:8793/pf-chrome.css | grep -c pf-table-scroll
//
// Not part of CI: it needs Playwright, which is not a dependency of this repo.
// PLAYWRIGHT overrides the module path for a global install; both the bare
// specifier and the `.../playwright/index.js` file form are accepted, for the
// reason `sweep.mjs` gives at length.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onlySlugs, keepPagePath, describeFilter, requireNonEmpty } from './only-slugs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const specifier = process.env.PLAYWRIGHT || 'playwright';
const loaded = await import(specifier);
const playwright = loaded.chromium ? loaded : loaded.default;
if (!playwright || !playwright.chromium) {
  console.error(`PLAYWRIGHT=${specifier} resolved to a module with no chromium export.`);
  process.exit(2);
}

const BASE = (process.env.BASE_URL || 'http://localhost:8793').replace(/\/$/, '');
const DIST = process.env.DIST || path.join(HERE, 'dist');

// The other five checks all honour this and this one did not, which made it
// the only check that could not run wherever the override is needed at all --
// a global Playwright install, or a machine whose browsers live at a fixed
// path. Playwright pins a browser build number and refuses to launch a
// different one, so without `executablePath` it dies telling you to run
// `npx playwright install`, which is not always something you can do.
// `CHROMIUM_PATH` is `sweep.mjs`'s older spelling for the same knob.
const chromePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
const LAUNCH = chromePath ? { executablePath: chromePath } : {};

/**
 * 360 rather than 320: it is the width of the phones this audience actually
 * carries, and the width `sweep.mjs`'s 390 rounds down to. 320 is the width
 * WCAG 1.4.10 names; both are clean as of 2026-08-29, and `WIDTH=320` is the
 * one to run before believing a narrow-viewport change — it found four pages
 * this default did not, each needing a fix in its own venture.
 */
const WIDTH = Number(process.env.WIDTH || 360);
const HEIGHT = Number(process.env.HEIGHT || 780);

/** Every built page, in the order a crawler would meet them. */
function publishedPages(dir, rel = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) out.push(...publishedPages(path.join(dir, entry.name), `${rel}${entry.name}/`));
    else if (entry.name.endsWith('.html')) out.push(rel + entry.name);
  }
  return out;
}

if (!fs.existsSync(DIST)) {
  console.error(`No built site at ${DIST}. Run: node platform/pages/build.mjs --out=${DIST}`);
  process.exit(2);
}

// The 404 page is served for paths that do not exist, so it has no URL of its
// own to ask for; everything else is reachable.
const only = onlySlugs();
const pages = publishedPages(DIST)
  .filter((rel) => !rel.startsWith('404'))
  .filter((rel) => keepPagePath(rel, only));
if (only) console.log(describeFilter(only));
requireNonEmpty(pages, only, 'built pages');

const browser = await playwright.chromium.launch(LAUNCH);
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
const failures = [];

for (const rel of pages) {
  const url = `${BASE}/${rel.replace(/(^|\/)index\.html$/, '$1')}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const verdict = await page.evaluate((width) => {
      const over = document.documentElement.scrollWidth - width;
      // One pixel of slack: a sub-pixel layout rounds up and is not a defect
      // anybody can see or scroll to.
      if (over <= 1) return null;
      // Name the widest box that sticks out, and the leaf inside it, so the
      // report says what to fix rather than only that something is wrong.
      let widest = null;
      for (const el of document.querySelectorAll('body *')) {
        const box = el.getBoundingClientRect();
        if (!box.width && !box.height) continue;
        if (box.right <= width + 1) continue;
        if (getComputedStyle(el).position === 'fixed') continue;
        if (!widest || box.right > widest.right) {
          widest = {
            right: Math.round(box.right),
            tag: el.tagName.toLowerCase()
              + (el.id ? `#${el.id}` : '')
              + (el.className ? `.${String(el.className).trim().split(/\s+/).join('.')}` : ''),
          };
        }
      }
      return { over: Math.round(over), widest };
    }, WIDTH);
    if (verdict) failures.push({ rel, ...verdict });
  } catch (error) {
    failures.push({ rel, error: String(error).split('\n')[0] });
  }
}

await browser.close();

if (failures.length === 0) {
  console.log(`${pages.length} pages at ${WIDTH}px: none scroll sideways.`);
  process.exit(0);
}

console.log(`${pages.length} pages at ${WIDTH}px: ${failures.length} scroll sideways.\n`);
for (const f of failures.sort((a, b) => (b.over || 0) - (a.over || 0))) {
  if (f.error) console.log(`  ${f.rel}  — ${f.error}`);
  else console.log(`  +${String(f.over).padStart(4)}px  ${f.rel}${f.widest ? `  — widest: ${f.widest.tag}` : ''}`);
}
console.log('\nA page wider than the window zooms out to fit, so every figure on it '
  + 'renders smaller. See platform/pages/reflow.mjs for the two causes this '
  + 'build already fixes and how they were measured.');
process.exit(1);
