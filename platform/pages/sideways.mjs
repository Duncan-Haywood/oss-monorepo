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
//   WIDTH=360,820,900 node platform/pages/sideways.mjs  # default is 360,820
//   SAMPLE=300 node platform/pages/sideways.mjs  # section indexes + pages spread over the site
//
//   # or against production once the owner flip lands:
//   BASE_URL=https://marisstella.app node platform/pages/sideways.mjs
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
import { samplePages } from './sideways-sample.mjs';

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
 *
 * 820 is the second default (2026-11-12): a tablet, or a laptop window at
 * half the screen. Pages are written for a phone and a desktop, and the
 * width between a page's single-column breakpoint (usually 700 to 860 px)
 * and its full desktop width is the one nobody looks at. A `1fr` grid
 * track there grows to its content's min-content width: five inputs at the
 * browser's default ~270 px each, or a full-size SVG or table inside its own
 * scroll box. At 820 px, 5 of 8,679 pages scrolled sideways by 115 to 477
 * px, none of them at 360. Each page is loaded once and resized in place
 * for every further width, so the second width costs a resize, not a load.
 * `WIDTH` takes a comma-separated list (`WIDTH=320` for one width).
 */
const WIDTHS = String(process.env.WIDTH || '360,820')
  .split(',').map((w) => Number(w.trim())).filter((w) => w > 0);
if (!WIDTHS.length) {
  console.error(`WIDTH=${process.env.WIDTH} names no width.`);
  process.exit(2);
}
const WIDTH = WIDTHS[0];
const AT = WIDTHS.map((w) => `${w}px`).join(' and ');
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
let pages = publishedPages(DIST)
  .filter((rel) => !rel.startsWith('404'))
  .filter((rel) => keepPagePath(rel, only));
// SAMPLE=N probes N pages (a few minutes instead of the whole catalogue):
// every site-owned section index first (the hub, /research/, /writing/ ...),
// then the rest spread evenly. Found two real overflows in 374 pages on
// 2026-11-07; the pinned indexes are why (sideways-sample.mjs).
const SAMPLE = Number(process.env.SAMPLE || 0);
const linksSiteCss = (rel) => {
  try { return fs.readFileSync(path.join(DIST, rel), 'utf8').includes('pf-site.css'); }
  catch { return false; }
};
pages = samplePages(pages, SAMPLE, linksSiteCss);
if (only) console.log(describeFilter(only));
requireNonEmpty(pages, only, 'built pages');

const browser = await playwright.chromium.launch(LAUNCH);
// Fail fast when nothing answers: with no server every page "fails" and the
// report is hundreds of identical connection errors (seen 2026-11-07).
try {
  await fetch(`${BASE}/`, { signal: AbortSignal.timeout(5000) });
} catch (e) {
  console.error(`Nothing answers at ${BASE} (${e.cause?.code || e.message}). Serve the build first: python3 -m http.server 8793 --directory ${DIST} &`);
  await browser.close();
  process.exit(2);
}
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
const failures = [];
// Longer than the chrome's 60 ms resize debounce, with room for its layout.
const RESIZE_SETTLE_MS = 150;

let done = 0;
for (const rel of pages) {
  // A whole-catalogue run takes 10 to 15 minutes and prints its verdict only
  // at the end; a line on stderr every 500 pages tells a live run from a hung one.
  if (++done % 500 === 0) process.stderr.write(`sideways: ${done}/${pages.length} pages\n`);
  const url = `${BASE}/${rel.replace(/(^|\/)index\.html$/, '$1')}`;
  try {
    await page.setViewportSize({ width: WIDTH, height: HEIGHT });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    for (const width of WIDTHS) {
      if (width !== WIDTH) {
        await page.setViewportSize({ width, height: HEIGHT });
        // Let the resize lay out before measuring.
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
      }
      let verdict = await page.evaluate(measure, width);
      // A narrowing resize: the venture chrome re-fits its header and footer
      // to the window on a 60 ms debounced `resize` (VENTURE_CHROME_JS in
      // site-nav.mjs), so one frame after it they still have the old width.
      // Measured 2026-11-12: WIDTH=1040,600,700,1100 flagged 6,228 such
      // pairs, every one gone after the debounce. Re-measure once it has
      // fired, only when something overflows, so a clean run pays nothing.
      if (verdict && width !== WIDTH) {
        await page.waitForTimeout(RESIZE_SETTLE_MS);
        verdict = await page.evaluate(measure, width);
      }
      if (verdict) failures.push({ rel, width, ...verdict });
    }
  } catch (error) {
    failures.push({ rel, error: String(error).split('\n')[0] });
  }
}

function measure(width) {
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
          // Inside a scroller (a nav strip, a table wrapper) it is clipped, so it is not the cause.
          let clipped = false;
          for (let c = el.parentElement; c && c !== document.body; c = c.parentElement) {
            if (getComputedStyle(c).overflowX !== 'visible') { clipped = true; break; }
          }
          if (clipped) continue;
          if (!widest || box.right > widest.right) {
            widest = {
              right: Math.round(box.right),
              tag: el.tagName.toLowerCase()
                + (el.id ? `#${el.id}` : '')
                + (el.className ? `.${String(el.className).trim().split(/\s+/).join('.')}` : ''),
            };
          }
        }
        // No box sticks out, so the overflow is a run of text that cannot
        // break (s3-storage-class-savings, 2026-11-12: a CSV header with no
        // spaces in a <label>). Name the deepest element whose content spills
        // past its own box instead.
        if (!widest) {
          for (const el of document.querySelectorAll('body *')) {
            if (el.scrollWidth <= el.clientWidth + 1 || !el.clientWidth) continue;
            if (getComputedStyle(el).overflowX !== 'visible') continue;
            widest = {
              right: null,
              tag: 'text in ' + el.tagName.toLowerCase()
                + (el.id ? `#${el.id}` : '')
                + (el.className ? `.${String(el.className).trim().split(/\s+/).join('.')}` : ''),
            };
          }
        }
        return { over: Math.round(over), widest };
}

await browser.close();

if (failures.length === 0) {
  console.log(`${pages.length} pages at ${AT}: none scroll sideways.`);
  process.exit(0);
}

console.log(`${pages.length} pages at ${AT}: ${failures.length} page-width pair(s) scroll sideways.\n`);
for (const f of failures.sort((a, b) => (b.over || 0) - (a.over || 0))) {
  if (f.error) console.log(`  ${f.rel}  — ${f.error}`);
  else console.log(`  +${String(f.over).padStart(4)}px  at ${f.width}px  ${f.rel}${f.widest ? `  — widest: ${f.widest.tag}` : ''}`);
}
console.log('\nA page wider than the window zooms out to fit, so every figure on it '
  + 'renders smaller. See platform/pages/reflow.mjs for the causes this '
  + 'build already fixes and how they were measured.');
process.exit(1);
