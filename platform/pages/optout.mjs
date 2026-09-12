// Loads every published page that offers a usage opt-out, changes the choice,
// reloads, and checks the page still remembers it.
//
// Why this exists
// ---------------
// `platform/privacy/optout-persistence.mjs` asks the same question of every
// venture's usage *module* and, since 2026-09-12, 93 of them answer it
// correctly. That check imports the module and drives it, which is the only
// way to see whether a stored flag is ever branched on — and it is blind to
// the layer the visitor actually touches.
//
// Two things live only here:
//
//   1. **Page-wired opt-outs.** Where a page passes checkbox state into
//      `recordUsage(storage, optedOut, event)` instead of calling an exported
//      setter, the module offers no switch at all, so the module-level check
//      files it `no-switch` and moves on. Measured 2026-09-12: 172 modules
//      are `no-switch` and 220 published pages carry an opt-out control
//      anyway. `vpat-acr-generator` reads `#optout` at four call sites and
//      never stores or restores it.
//
//   2. **The control's own state.** A venture can keep counting off across a
//      reload — all 93 do — and still show the visitor an unticked box on
//      their next visit, because the module remembers and the checkbox does
//      not. That was recorded as a known limitation when the module-level
//      fix landed; this is the check that makes it visible.
//
// Both are the same promise from the visitor's side: *I turned this off, and
// it stayed off.* A control that silently forgets is worse than none, because
// the visitor believes they have already used it and never looks again.
//
// The test is direction-agnostic on purpose. It does not decide which state
// means "off" — labels are worded both ways here ("Do not keep an anonymous
// local usage count" and "Keep anonymous local usage counts"), and a checker
// that guessed would be wrong on one of them and would go on being wrong
// silently. It changes the control to whatever it is not, reloads, and
// requires the new value to survive. Whichever way round the page words it,
// the visitor's choice is the thing that has to persist.
//
//   node platform/pages/build.mjs --out=platform/pages/dist
//   python3 -m http.server 8793 --directory platform/pages/dist &
//   node platform/pages/optout.mjs
//
// Prefer `python3 platform/ci/browser_checks.py --checks optout`, which
// builds into a temp dir and proves with a sentinel that the port is not
// answering an older build.
//
// Not part of CI: it needs Playwright, which is not a dependency of this
// repo. Exit 0 clean, 1 a real defect, 2 nothing was verified.

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
const chromePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
const LAUNCH = chromePath ? { executablePath: chromePath } : {};

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

// Which pages even carry a control is read from the built HTML rather than
// guessed from the venture list: a venture can ship five pages and put the
// opt-out on one of them, and asking the file is cheaper than opening a
// browser on 997 pages to find out.
const CANDIDATE = /<input\b[^>]*type=["']checkbox["'][^>]*>/gi;
function offersAControl(rel) {
  const src = fs.readFileSync(path.join(DIST, rel), 'utf8');
  for (const tag of src.match(CANDIDATE) ?? []) {
    if (/opt.?out|usage/i.test(tag)) return true;
  }
  return false;
}

const only = onlySlugs();
const pages = publishedPages(DIST)
  .filter((rel) => !rel.startsWith('404'))
  .filter((rel) => keepPagePath(rel, only))
  .filter(offersAControl);
if (only) console.log(describeFilter(only));
// An empty list here is "nothing was verified", not "everything passed" --
// the shape this repository is worst at noticing.
requireNonEmpty(pages, only, 'pages offering a usage opt-out');

const browser = await playwright.chromium.launch(LAUNCH);
const failures = [];
let checked = 0;

for (const rel of pages) {
  const url = `${BASE}/${rel.replace(/(^|\/)index\.html$/, '$1')}`;
  // A fresh context per page, so a flag one page stored cannot answer for the
  // next one. Every page in a venture shares an origin, and reusing storage
  // would let one working control cover for four broken ones.
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const found = await page.evaluate(() => {
      const labelOf = (el) => {
        const own = el.closest('label')?.textContent ?? '';
        const forId = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : '';
        return `${own} ${forId ?? ''}`.replace(/\s+/g, ' ').trim();
      };
      for (const el of document.querySelectorAll('input[type="checkbox"]')) {
        const label = labelOf(el);
        if (!/opt.?out|usage/i.test(el.id || '') && !/usage|counting|count/i.test(label)) continue;
        return { id: el.id || null, label: label.slice(0, 80), state: el.checked };
      }
      return null;
    });
    // The HTML said there was a control and the DOM does not have one: the
    // page's own script removed it, or never ran. Either way nothing here is
    // verified, and silence would read as a pass.
    if (!found) {
      failures.push({ rel, detail: 'the page ships an opt-out control that is not in the DOM once the page runs' });
      continue;
    }

    const target = !found.state;
    await page.evaluate((id) => {
      const el = id
        ? document.getElementById(id)
        : [...document.querySelectorAll('input[type="checkbox"]')].find((c) => /opt.?out|usage/i.test(c.id || ''));
      el.click();
    }, found.id);
    // A page may persist on `change` or on the click handler's own work; give
    // whatever it does a turn of the event loop before navigating away.
    await page.waitForTimeout(50);

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    const after = await page.evaluate((id) => {
      const el = id
        ? document.getElementById(id)
        : [...document.querySelectorAll('input[type="checkbox"]')].find((c) => /opt.?out|usage/i.test(c.id || ''));
      return el ? el.checked : null;
    }, found.id);

    checked += 1;
    if (after !== target) {
      failures.push({
        rel,
        control: found.id ? `#${found.id}` : found.label,
        detail: `set to ${target}, came back ${after} after a reload`,
      });
    }
  } catch (error) {
    failures.push({ rel, detail: String(error).split('\n')[0] });
  } finally {
    await context.close();
  }
}

await browser.close();

if (failures.length === 0) {
  console.log(`${checked} pages offering a usage opt-out: every one remembers the visitor's choice.`);
  process.exit(0);
}

console.log(`${pages.length} pages offering a usage opt-out: ${failures.length} forget the visitor's choice.\n`);
for (const f of failures) {
  console.log(`  ${f.rel}${f.control ? `  (${f.control})` : ''}\n      ${f.detail}`);
}
console.log('\nA control that forgets is worse than no control: the visitor believes '
  + 'they have already used it, so they never look again. See '
  + 'platform/privacy/optout-persistence.mjs for the same promise one layer down.');
process.exit(1);
