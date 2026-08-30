// Copies every tool's share link and opens it, then checks that the bid on the
// other side is the bid that was sent.
//
// Why this exists
// ---------------
// `sweep.mjs` proves every tool still computes and `contrast.mjs` proves every
// page can be read. Both pass on a tool whose share link quietly drops half the
// form, because the link is a second serialization of the page and nothing on
// the page disagrees with it. The recipient does not see an error. They see a
// complete, plausible, *different* answer.
//
// That is not hypothetical here, and it has cost real money twice:
//
//   - `where-to-sell-calculator` (2026-08-24) kept its own field allowlist
//     beside the form and dropped `quantity` and `targetMargin`, so the
//     recipient computed a different profit than the sender saw.
//   - `shopify-fee-calculator` (2026-08-29) serialized a hand-kept sixteen-name
//     list while the form had grown to twenty-six inputs across five panels,
//     and wrote back two of those panels. The Shop Pay Installments, shipping
//     label and POS comparisons on the recipient's screen were this page's
//     example figures — three verdicts about real money — under a headline
//     profit that matched the sender's to the cent. `etsy-profit-calculator`
//     lost both repricing goals the same way, on the saved copy too.
//
// Every one of those was found by hand, twice, after shipping. The check that
// finds them is mechanical: change the form, copy the link the page's own
// button copies, open it in a browser that has never seen this tool, and
// compare every field and the headline figure. A field that differs is either a
// dropped field or a link that means something other than what it says.
//
//   node platform/pages/build.mjs --out=platform/pages/dist
//   python3 -m http.server 8793 --directory platform/pages/dist &
//   node platform/pages/roundtrip.mjs
//
//   # or against production once the owner flip lands:
//   BASE_URL=https://duncan-haywood.github.io/monorepo-projects node platform/pages/roundtrip.mjs
//
//   node platform/pages/roundtrip.mjs shopify-fee-calculator etsy-profit-calculator
//
// **Check what is answering before you believe the result.** A server left
// running by an earlier build keeps the port and the run passes against the old
// tree without a word — the same trap `sweep.mjs` and `contrast.mjs` document.
// One curl settles it:
//
//   curl -s http://localhost:8793/<slug>/ | grep -c 'the thing you just added'
//
// Not part of CI: it needs Playwright, which is not a dependency of this repo.
// PLAYWRIGHT overrides the module path for a global install; CHROME_PATH reuses
// a Chromium already on the machine.

import fs from 'node:fs/promises';
import path from 'node:path';

// Playwright ships CommonJS, so a PLAYWRIGHT naming its entry *file* resolves
// the exports under `.default` while a bare specifier gives them directly.
// Accept either — the same fix sweep.mjs and contrast.mjs carry.
const playwright = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = playwright.chromium ?? playwright.default?.chromium;
if (!chromium) {
  console.error('Could not load Playwright. Set PLAYWRIGHT to its entry point, ' +
    'e.g. PLAYWRIGHT=./node_modules/playwright/index.js');
  process.exit(2);
}

const BASE = (process.env.BASE_URL || 'http://localhost:8793').replace(/\/$/, '');
const DIST = process.env.DIST || path.join(path.dirname(new URL(import.meta.url).pathname), 'dist');
const chromePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
const LAUNCH = chromePath ? { executablePath: chromePath } : {};

// The controls that copy a link, most specific first. `#pf-link-copy` is the
// one the build injects on every page with a form; the rest are the buttons
// ventures wrote themselves, which is where every defect above lived.
//
// `button#` and not `#`: `cam-reconciliation-check` names a *section* `share`,
// and matching it produced a 0×0 div this file then spent thirty seconds trying
// to click. A probe whose failures are its own selectors teaches everyone to
// ignore it.
const COPY_CONTROLS = ['button#copyShare', 'button#copyLink', 'button#shareLink',
  'button#share', 'button#pf-link-copy'];

// Fields no link should carry, and no comparison should demand.
//
// A privacy preference is a property of the *reader's* browser, not of the bid:
// a sender who has opted out of counting must not opt the recipient out, and a
// recipient who has opted out must not be opted back in by opening a link. The
// saved-bid name box the build injects is likewise per-visitor. Both are
// excluded from the link by the page, correctly, so both are excluded here.
const NOT_IN_A_LINK = new Set(['usageOptOut', 'optOut', 'pf-bid-name', 'remember']);

/**
 * The proposal's prose terms, typed by this probe rather than left at default.
 *
 * The pass below changes selects and number inputs. That was enough to catch
 * `depositPercent` and `validDays` on 48 tools — and not enough to catch the
 * three *textareas* beside them, which sat empty on both sides of every
 * round-trip and compared equal. The link dropped all five; the probe reported
 * two, and the fix was scoped to two until someone read the panel.
 *
 * Named rather than "every textarea", because a textarea on these pages is as
 * often an input the tool parses as it is prose: `cut-list-optimizer` takes a
 * parts list in one, `photos-import` a CSV, and typing a sentence into either
 * would break the calculation and report a dropped field that is really a
 * refused edit. These four are the ones `platform/proposal/adopt.mjs` generates
 * on all 103 adopting pages, and they hold wording only.
 *
 * `proposalScope` is deliberately not among them. It is a draft generated from
 * the priced job, and the recipient's page regenerates it from the same numbers
 * — so a link that does not carry it is correct, and a probe that typed into it
 * would be reporting on a feature working as designed.
 */
const PROSE_FIELDS = [
  ['proposalExclusions', 'Permits\nSprinkler relocation\nTree removal'],
  ['paymentTerms', 'Half on acceptance, balance on completion. Card payments add 3%.'],
  ['proposalNotes', 'Crew starts 7am; driveway must be clear of vehicles.'],
];

/** Every published tool directory in the built artifact. */
async function toolSlugs() {
  const entries = await fs.readdir(DIST, { withFileTypes: true });
  const slugs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      await fs.access(path.join(DIST, entry.name, 'index.html'));
      slugs.push(entry.name);
    } catch { /* a directory without an entry page is not a tool */ }
  }
  return slugs.sort();
}

/**
 * A different, still-valid value for one control.
 *
 * Valid is the operative word. A number input is constrained by min, max and
 * step — and `min` is the step *base*, so a value that ignores it fails the
 * browser's own validation and the page never gets the change. Feeding a tool
 * something it would refuse would produce a "dropped field" that is really a
 * refused edit, which is the one failure mode that would make this probe worth
 * ignoring. So: move by whole steps from the current value, and clamp.
 */
function perturbNumber({ value, min, max, step }) {
  const current = Number(value);
  const size = Number(step) || 1;
  const base = Number.isFinite(Number(min)) ? Number(min) : 0;
  const start = Number.isFinite(current) ? current : base;
  // Seven steps up is far enough to be visible in an answer and small enough to
  // stay inside a sane max; the fallback covers a field left blank.
  let next = start + size * 7;
  const ceiling = Number(max);
  if (Number.isFinite(ceiling) && next > ceiling) next = start - size * 7;
  const floor = Number.isFinite(Number(min)) ? Number(min) : 0;
  if (next < floor) next = floor + size;
  // Re-align to the step base so the browser accepts it, then trim the binary
  // fraction a decimal step leaves behind (0.1 * 3 is not 0.3).
  const steps = Math.round((next - base) / size);
  return String(Number((base + steps * size).toFixed(10)));
}

// `CSS.escape` is a browser global and this half runs in node, which is how the
// first draft of this file reported "no editable number inputs" on every tool.
const cssId = (id) => `#${id.replace(/[^\w-]/g, (ch) => `\\${ch}`)}`;

/** Two values a form field can hold, compared the way the calculator reads them. */
function sameValue(before, after) {
  if (before === after) return true;
  // `value="0.30"` restored from a link that carried the number 0.30 comes back
  // as "0.3". The calculator reads both as the same number, and a probe that
  // called that a dropped field would be reporting on string formatting.
  if (before === '' || after === '') return false;
  const a = Number(before);
  const b = Number(after);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

/**
 * Read every addressable control on the page, as the page holds it.
 *
 * `readonly` and `disabled` controls are skipped, because they are outputs
 * wearing an input's clothes: `freelance-retainer-calculator` renders its whole
 * proposal into a readonly textarea, and a link that does not carry it is
 * correct — the page regenerates it from the numbers that did carry.
 */
const READ_FIELDS = () => {
  const out = {};
  for (const node of document.querySelectorAll('input[id], select[id], textarea[id]')) {
    const type = (node.getAttribute('type') || 'text').toLowerCase();
    if (['button', 'submit', 'reset', 'file', 'image'].includes(type)) continue;
    if (node.readOnly || node.disabled) continue;
    if (node.id.includes('${')) continue;
    out[node.id] = type === 'checkbox' || type === 'radio' ? String(node.checked) : node.value;
  }
  return out;
};

/** The figure the tool leads with, if it has one. */
const READ_HERO = () => document.querySelector('.hero-number')?.textContent?.trim() ?? '';

async function openTool(browser, slug, hash = '') {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`page error: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  await page.goto(`${BASE}/${slug}/${hash}`, { waitUntil: 'networkidle' });
  return { context, page, errors };
}

/**
 * Drive one tool: change the form, copy its link, open the link cold, compare.
 *
 * Returns a verdict rather than throwing, so one tool without a share button
 * does not end the sweep.
 */
async function roundTrip(browser, slug) {
  const { context, page, errors } = await openTool(browser, slug);
  try {
    const control = await page.evaluate((controls) => {
      for (const selector of controls) if (document.querySelector(selector)) return selector;
      return '';
    }, COPY_CONTROLS);
    if (!control) return { slug, status: 'skip', detail: 'no copy-link control' };

    // The clipboard is the only way out of the page for most of these buttons,
    // and a headless context has none. Standing in for it also keeps the probe
    // honest: it reads the link the visitor would actually paste, not one this
    // file rebuilt from the page's modules.
    await page.evaluate(() => {
      window.__pfCopied = null;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__pfCopied = text; } },
      });
    });

    // Selects before numbers, always. A preset dropdown writes its own figures
    // into the rate fields when it changes, so choosing one after typing would
    // overwrite the very edit being tested — and the page is right to do that;
    // it is what the preset is for.
    const selects = await page.evaluate(() => [...document.querySelectorAll('select[id]')]
      .map((node) => ({ id: node.id, options: [...node.options].map((o) => o.value), value: node.value })));
    for (const select of selects) {
      if (NOT_IN_A_LINK.has(select.id) || select.id.includes('${')) continue;
      const other = select.options.find((option) => option !== select.value);
      if (other === undefined) continue;
      try { await page.selectOption(cssId(select.id), other, { timeout: 2000 }); } catch { /* hidden or detached */ }
    }

    const numbers = await page.evaluate(() => [...document.querySelectorAll('input[type="number"][id]')]
      .filter((node) => !node.disabled && !node.readOnly && node.offsetParent !== null)
      .map((node) => ({ id: node.id, value: node.value, min: node.min, max: node.max, step: node.step })));
    let edited = 0;
    for (const field of numbers) {
      if (NOT_IN_A_LINK.has(field.id) || field.id.includes('${')) continue;
      try {
        await page.fill(cssId(field.id), perturbNumber(field), { timeout: 2000 });
        edited += 1;
      } catch { /* a field the layout hides at this width */ }
    }
    if (edited === 0) return { slug, status: 'skip', detail: 'no editable number inputs' };

    // The prose terms, on the pages that have them. Typed the way a person
    // would, so the page's own listeners see it — `fill` dispatches input, and
    // the proposal panel redraws from that.
    for (const [id, text] of PROSE_FIELDS) {
      const present = await page.evaluate((fieldId) => {
        const node = document.getElementById(fieldId);
        return !!node && !node.readOnly && !node.disabled;
      }, id);
      if (!present) continue;
      try { await page.fill(cssId(id), text, { timeout: 2000 }); } catch { /* hidden at this width */ }
    }

    const before = await page.evaluate(READ_FIELDS);
    const beforeHero = await page.evaluate(READ_HERO);
    await page.click(control);
    // A copy handler may await the clipboard write; give the microtask a turn.
    await page.waitForTimeout(120);
    const link = await page.evaluate(() => window.__pfCopied);
    const refusal = await page.evaluate(() =>
      document.getElementById('shareStatus')?.textContent
      ?? document.getElementById('pf-link-note')?.textContent
      ?? document.getElementById('status')?.textContent ?? '');
    await context.close();

    if (!link || typeof link !== 'string') {
      // Not a failure on its own: a few tools refuse to share a form they would
      // not calculate, which is the right behaviour. Say which it was.
      return { slug, status: 'skip', detail: `${control} copied nothing${refusal ? ` (${refusal.trim()})` : ''}` };
    }

    // Whichever comes *first*, not whichever exists. A link can carry both:
    // `painting-bid-calculator` writes its figures as a query string and its
    // proposal terms in the fragment, because a fragment is not sent in the
    // request line a server logs and a payment-terms clause is the painter's
    // own wording. Preferring `#` there reopened the tool with the terms and
    // none of the bid, and this probe reported 33 dropped fields and a moved
    // headline on a link a person would have pasted whole.
    const marks = [link.indexOf('?'), link.indexOf('#')].filter((at) => at >= 0);
    if (marks.length === 0) return { slug, status: 'fail', detail: 'the copied link carries no bid' };
    const marker = Math.min(...marks);

    const second = await openTool(browser, slug, link.slice(marker));
    const after = await second.page.evaluate(READ_FIELDS);
    const afterHero = await second.page.evaluate(READ_HERO);
    await second.context.close();

    // One line per field, whatever the field holds: a proposal scope box runs
    // to eight lines of prose, and printing it whole turns the report into the
    // document rather than the finding.
    const short = (value) => {
      const flat = String(value).replace(/\s+/g, ' ').trim();
      return flat.length > 40 ? `${flat.slice(0, 40)}…` : flat;
    };
    // A preset select that comes back empty or as `other` is not a finding, and
    // the README has said so since this file shipped — the recipient now holds
    // custom rates, and "Choose a starting job…" or `other` is the honest label
    // for them. Carrying the preset id instead would re-apply it on arrival and
    // write the venture's kit figures over the sender's own, which is the exact
    // defect #1984 repaired on `amazon-fba-calculator`.
    //
    // Implemented rather than left as prose because a probe that reports 39
    // known-benign failures is a probe whose 40th, real one goes unread. The
    // teeth stay: every field such a select would have written is compared like
    // any other, so a preset that took the rates with it still fails here.
    const selectIds = new Set(selects.map((select) => select.id));
    const presetHandback = (id) =>
      selectIds.has(id) && (after[id] === '' || after[id] === 'other');

    const dropped = Object.keys(before)
      .filter((id) => !NOT_IN_A_LINK.has(id) && id in after && !sameValue(before[id], after[id]))
      .filter((id) => !presetHandback(id))
      .map((id) => `${id} ${short(before[id])}→${short(after[id])}`);
    const pageErrors = [...errors, ...second.errors];

    if (dropped.length === 0 && beforeHero === afterHero && pageErrors.length === 0) {
      return { slug, status: 'ok', detail: `${Object.keys(before).length} fields, headline ${beforeHero || 'n/a'}` };
    }
    const detail = [
      dropped.length ? `dropped ${dropped.length}: ${dropped.slice(0, 8).join(', ')}${dropped.length > 8 ? ', …' : ''}` : '',
      beforeHero === afterHero ? '' : `headline ${beforeHero} → ${afterHero}`,
      pageErrors.length ? pageErrors.slice(0, 2).join(' | ') : '',
    ].filter(Boolean).join('; ');
    return { slug, status: 'fail', detail, dropped: dropped.map((entry) => entry.split(' ')[0]) };
  } catch (error) {
    try { await context.close(); } catch { /* already closed */ }
    return { slug, status: 'fail', detail: `probe error: ${error.message}` };
  }
}

const only = process.argv.slice(2);
let slugs;
try {
  slugs = await toolSlugs();
} catch (error) {
  console.error(`Could not read the built artifact at ${DIST}: ${error.message}`);
  console.error('Build it first: node platform/pages/build.mjs --out=platform/pages/dist');
  process.exit(2);
}
if (only.length) slugs = slugs.filter((slug) => only.includes(slug));
if (slugs.length === 0) {
  console.error('No tools to check.');
  process.exit(2);
}

const browser = await chromium.launch(LAUNCH);
const results = [];
for (const slug of slugs) {
  const result = await roundTrip(browser, slug);
  results.push(result);
  const mark = result.status === 'ok' ? 'ok  ' : result.status === 'skip' ? 'skip' : 'FAIL';
  console.log(`${mark} ${slug}: ${result.detail}`);
}
await browser.close();

const failed = results.filter((r) => r.status === 'fail');
const checked = results.filter((r) => r.status !== 'skip');
console.log(`\n${checked.length - failed.length}/${checked.length} share links round-trip` +
  ` (${results.length - checked.length} skipped, no link to copy).`);
if (failed.length) {
  console.log('\nA field that differs is a field the link did not carry, or did not put back:');
  for (const result of failed) console.log(`  ${result.slug}: ${result.detail}`);

  // Grouped, because these tools are near-identical by construction and a
  // defect in the shape they share arrives as fifty separate lines. Reading it
  // as fifty problems is how a systematic gap gets triaged as a backlog.
  const byField = new Map();
  for (const result of failed) {
    for (const id of result.dropped ?? []) byField.set(id, (byField.get(id) ?? 0) + 1);
  }
  const shared = [...byField].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]);
  if (shared.length) {
    console.log('\nFields dropped by more than one tool — one cause, not one per tool:');
    for (const [id, count] of shared) console.log(`  ${id}: ${count} tools`);
  }
}
process.exit(failed.length ? 1 : 0);
