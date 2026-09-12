// Loads every published page that offers a usage opt-out, changes the choice,
// reloads, and checks the page still shows it.
//
// Why this exists
// ---------------
// `platform/privacy/optout-persistence.mjs` asks the same question of every
// venture's usage *module* and, since #4657, 93 of them answer it correctly.
// That check imports the module and drives it, which is the only way to see
// whether a stored flag is ever branched on — and it is blind to the layer the
// visitor actually touches.
//
// Two things live only here.
//
//   1. **Page-wired opt-outs.** Where a page passes checkbox state into
//      `recordUsage(storage, optedOut, event)` instead of calling an exported
//      setter, the module offers no switch at all, so the module-level check
//      files it `no-switch` and moves on. Measured 2026-09-12: 172 modules are
//      `no-switch` and 220 published pages carry an opt-out control anyway.
//      `vpat-acr-generator` reads `#optout` at four call sites and never
//      stores or restores it.
//
//   2. **The control's own state.** A venture can keep counting off across a
//      reload — all 93 do — and still show the visitor an unticked box, or a
//      button that says "turn counting off", on their next visit. That was
//      recorded as a known limitation when #4657 landed; this is the check
//      that makes it visible.
//
// Both are the same promise from the visitor's side: *I turned this off, and
// it stayed off.* A control that silently forgets is worse than none, because
// the visitor believes they have already used it and never looks again.
//
// TWO SHAPES, ONE QUESTION
//
// The catalogue spells the control both ways: a checkbox whose `checked`
// carries the state, and a button whose *label* does (`#optout` in
// `3pl-quote-normalizer` calls `setUsageOptOut(true)` and rewrites itself to
// "Usage counting is off"). Both are read here, because a check that knew
// only about checkboxes would report the 38 button ventures as having no
// control at all — the same silent exclusion the switch-name allowlist in
// #4657 was fixed for.
//
// The test is direction-agnostic on purpose. It does not decide which state
// means "off" — labels are worded both ways here ("Do not keep an anonymous
// local usage count" and "Keep anonymous local usage counts"), and a checker
// that guessed would be wrong on one of them and would go on being wrong
// silently. It changes the control, reloads, and requires the new state to
// survive. Whichever way round the page words it, the visitor's choice is the
// thing that has to persist.
//
// A control that shows no change at all when clicked is reported as
// `no-feedback` rather than passed. It may well be storing the choice; what
// is certain is that nothing here verified it, and this repository's habit of
// reading an absence as a pass is the reason that distinction is kept.
//
//   node platform/pages/build.mjs --out=platform/pages/dist
//   python3 -m http.server 8793 --directory platform/pages/dist &
//   node platform/pages/optout.mjs
//
// Prefer `python3 platform/ci/browser_checks.py --checks optout`, which builds
// into a temp dir and proves with a sentinel that the port is not answering an
// older build.
//
// Not part of CI: it needs Playwright, which is not a dependency of this repo.
// Exit 0 clean, 1 a real defect, 2 nothing was verified.

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
// browser on 997 pages to find out. Deliberately loose — the DOM pass below
// is what decides, and a page named here that turns out to have no control is
// reported rather than skipped.
const CANDIDATE = /<(?:input|button)\b[^>]*>/gi;
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

// Runs in the page. Finds the control and reports its state as a string, so a
// checkbox and a button are compared the same way.
const READ_CONTROL = () => {
  const labelOf = (el) => {
    const own = el.closest('label')?.textContent ?? '';
    const forId = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : '';
    return `${own} ${forId ?? ''}`.replace(/\s+/g, ' ').trim();
  };
  const named = (el) => /opt.?out|usage/i.test(el.id || '') || /opt.?out|usage/i.test(el.name || '');
  // Word boundaries, and the identifier is tried before the wording. Bare
  // `count` as a substring picked the wrong control on
  // `chargeback-evidence-packet`, whose page carries both a real `#optout`
  // and a checkbox labelled "Device, IP, or account login record" -- acCOUNT.
  // That is the same substring mistake the review caught in
  // `optout-persistence.mjs` (a counter honestly named `coffee-usage`), so it
  // is fixed the same way: match on what identifies the control, and fall
  // back to wording only with boundaries.
  const worded = (text) => /\busage\b|\bcounting\b|\bcounts\b/i.test(text);
  const boxes = [...document.querySelectorAll('input[type="checkbox"]')];
  const buttons = [...document.querySelectorAll('button, input[type="button"]')];
  const textOf = (el) => (el.textContent || el.value || '').replace(/\s+/g, ' ').trim();

  for (const el of boxes) if (named(el)) {
    return { kind: 'checkbox', id: el.id || null, label: labelOf(el).slice(0, 80), state: String(el.checked) };
  }
  for (const el of buttons) if (named(el)) {
    return { kind: 'button', id: el.id || null, label: textOf(el).slice(0, 80), state: textOf(el) };
  }
  for (const el of boxes) if (worded(labelOf(el))) {
    return { kind: 'checkbox', id: el.id || null, label: labelOf(el).slice(0, 80), state: String(el.checked) };
  }
  for (const el of buttons) if (worded(textOf(el))) {
    return { kind: 'button', id: el.id || null, label: textOf(el).slice(0, 80), state: textOf(el) };
  }
  return null;
};

// Re-finds the same control after a reload. Kept separate from READ_CONTROL so
// the "which element" decision is made once, by id where there is one.
const READ_BY_ID = (id) => {
  const el = id ? document.getElementById(id) : null;
  if (!el) return null;
  if (el.type === 'checkbox') return String(el.checked);
  return (el.textContent || el.value || '').replace(/\s+/g, ' ').trim();
};

const browser = await playwright.chromium.launch(LAUNCH);
const failures = [];
const unverified = [];
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
    const found = await page.evaluate(READ_CONTROL);
    // The HTML said there was a control and the DOM does not have one: the
    // page's own script removed it, or never ran. Either way nothing here is
    // verified, and silence would read as a pass.
    if (!found) {
      unverified.push({ rel, detail: 'ships an opt-out control that is not in the DOM once the page runs' });
      continue;
    }
    if (!found.id) {
      unverified.push({ rel, detail: `the control (${found.label}) has no id, so it cannot be re-found after a reload` });
      continue;
    }

    // Click it in the page rather than through Playwright's actionability
    // checks: the control is sometimes inside a collapsed <details>, and
    // whether it is comfortable to click is `sideways.mjs`'s question.
    await page.evaluate((id) => document.getElementById(id).click(), found.id);
    await page.waitForTimeout(50);
    const changed = await page.evaluate(READ_BY_ID, found.id);
    if (changed === found.state) {
      unverified.push({
        rel,
        detail: `clicking ${found.id ? `#${found.id}` : found.label} changed nothing the visitor can see, `
          + `so whether the choice is kept cannot be read from the page`,
      });
      continue;
    }

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    const after = await page.evaluate(READ_BY_ID, found.id);
    checked += 1;
    if (after !== changed) {
      failures.push({
        rel,
        control: `#${found.id}`,
        detail: `${found.kind}: set to ${JSON.stringify(changed)}, came back ${JSON.stringify(after)} after a reload`,
      });
    }
  } catch (error) {
    unverified.push({ rel, detail: String(error).split('\n')[0] });
  } finally {
    await context.close();
  }
}

await browser.close();

if (failures.length === 0 && unverified.length === 0) {
  console.log(`${checked} pages offering a usage opt-out: every one remembers the visitor's choice.`);
  process.exit(0);
}

console.log(
  `${pages.length} pages offering a usage opt-out: `
  + `${failures.length} forget the visitor's choice, ${unverified.length} could not be verified.\n`,
);
for (const f of failures) {
  console.log(`  FORGETS  ${f.rel}  (${f.control})\n      ${f.detail}`);
}
if (unverified.length) {
  console.log('\nNot verified — reported rather than passed, because an absence read as a pass '
    + 'is how this catalogue has shipped dead product before:\n');
  for (const u of unverified) console.log(`  ?  ${u.rel}\n      ${u.detail}`);
}
console.log('\nA control that forgets is worse than no control: the visitor believes '
  + 'they have already used it, so they never look again. See '
  + 'platform/privacy/optout-persistence.mjs for the same promise one layer down.');
process.exit(1);
