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
import { onlySlugs, keepSlug, describeFilter, requireNonEmpty } from './only-slugs.mjs';

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

// Read once, at module scope, so every code path in this file sees the same
// filter. `null` means "no filter"; see only-slugs.mjs for why that is kept
// distinct from an empty set.
const only = onlySlugs();

// The controls that copy a link, most specific first. `#pf-link-copy` is the
// one the build injects on every page with a form; the rest are the buttons
// ventures wrote themselves, which is where every defect above lived.
//
// `button#` and not `#`: `cam-reconciliation-check` names a *section* `share`,
// and matching it produced a 0×0 div this file then spent thirty seconds trying
// to click. A probe whose failures are its own selectors teaches everyone to
// ignore it.
//
// The kebab-case three were a silent blind spot until 2026-08-31. This list
// grew one camelCase id at a time as ventures were written, so a venture that
// spelled its button `share-link` rather than `shareLink` was not reported as
// failing — it was reported as `skip … no copy-link control`, which reads like
// a page that has no share link rather than one whose share link nobody is
// checking. Three pages sat in that gap, all of them with a real link that
// encodes real state:
//
//   no-show-fee-calculator        #share-link        (query params, src/app.mjs)
//   quote-margin-check            #copy-share-link   (query params, site/calc.mjs)
//   freelance-retainer-calculator #shareResult       (hash, share.mjs)
//   equipment-rental-break-even   #copy-share        (hash, site/share.mjs)
//
// The last of those is why this is worth writing down rather than quietly
// fixing: it landed on `main` the same day, hours before this list was
// widened, under a fifth spelling nobody had used before. The gap is not a
// historical accident that has now been cleaned up — it reopens every time a
// venture names its button something new.
//
// That is the exact shape of the two defects this file exists to catch: a link
// that drops half the form is invisible from the page, and here the *probe* was
// invisible too. `freelance-retainer-calculator` is the sharper warning of the
// three — `link.mjs` already documents it as the page whose script lives in
// `app.js`, and names its button `share`; the id it actually ships is
// `shareResult`, so neither that prose nor this list matched what is on the
// page.
//
// A skip line is not a pass. If a venture adds a share control under a fourth
// spelling, it lands in the skip list too, so treat a page you know has a link
// appearing there as a bug in this list.
//
// `copyShareLink` was exactly that gap, found 2026-09-06 while adding a share
// link to `cloud-egress-calculator`: this file reported `skip … no copy-link
// control` for that page, and the same probe against `owner-operator-cpm-calculator`
// -- shipped weeks earlier with a real, tested share link -- skipped
// identically. `seller-net-sheet` carries the same id. All three encode real
// form state in the URL and none of them had ever been round-tripped by this
// check.
//
// `copyScenario` (`tiktok-shop-fee-calculator`) was found the same day by
// grepping every venture's markup for a share-shaped button rather than
// waiting to trip over the next one by hand: its own click handler writes
// `scenarioLink()` -- a real URL-encoded link -- to the clipboard, and this
// file had never once round-tripped it.
//
// `copy-link` was the same gap again, found 2026-09-10 recording a fleet-wide
// sweep after `wash-and-fold-price-calculator` shipped a share button under
// that id: a `grep -rl 'id="copy-link"' ventures/` for it turned up two more
// pages that had been skipping silently since before this list existed --
// `ai-engineering-academy/tools/rc-filter-calculator` and `sponsor-ready`,
// both with a real link-copying handler wired to the same id. Three pages,
// one missing selector, all invisible to this check the same way.
const COPY_CONTROLS = ['button#copyShare', 'button#copyLink', 'button#shareLink',
  'button#share', 'button#pf-link-copy', 'button#share-link',
  'button#copy-share-link', 'button#shareResult', 'button#copy-share',
  'button#copyShareLink', 'button#copyScenario', 'button#copy-link'];

// Fields no link should carry, and no comparison should demand.
//
// A privacy preference is a property of the *reader's* browser, not of the bid:
// a sender who has opted out of counting must not opt the recipient out, and a
// recipient who has opted out must not be opted back in by opening a link. The
// saved-bid name box the build injects is likewise per-visitor. Both are
// excluded from the link by the page, correctly, so both are excluded here.
const NOT_IN_A_LINK = new Set(['usageOptOut', 'optOut', 'pf-bid-name', 'remember']);

// A page can collect one new item's fields in a form the page itself resets
// (`form.reset()`) the instant a submission commits it to the state a share
// link actually reads — `1099k-reconciliation-worksheet`'s `#row-form` is the
// first of these to also carry a share link. Those fields are *meant* to come
// back at their reset defaults rather than matching whatever the sender was
// mid-typing, so comparing them against the reopened page would report a
// dropped field on a link that carried everything.
//
// This was a hand-kept `RESET_ON_SUBMIT` set naming that venture's seven ids
// until 2026-09-13. It worked, and it was the same shape as the two defects
// at the top of this file: a list beside the thing it describes, correct on
// the day it was written, silently wrong for the next worksheet that spells
// its fields differently — the failure this file already records paying for
// twice, and `CLAUDE.md` a further three times. The fix needs no list at all:
// the commit branch below re-reads the sender's fields *after* the submit, so
// both sides are at their defaults and match for the same reason the visitor's
// would. Nothing to maintain, and a new worksheet is covered on arrival.

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
  // An absent `max` reads as `''` off the DOM, and `Number('')` is **0**, not
  // NaN -- so this line used to treat "no maximum" as "maximum zero" and send
  // every unbounded field *down* seven steps instead of up, where the floor
  // below then pinned it to `min + step`. Measured 2026-09-13 on
  // `1099k-reconciliation-worksheet`, whose six money fields declare
  // `min="0" step="0.01"` and no max: all of them perturbed to `0.01`
  // regardless of their default, and a field already sitting at `0.01` was
  // therefore never changed at all -- so a link that dropped it round-tripped
  // clean. The guard was a seventh of the size its own comment describes.
  const ceiling = max === '' || max === null || max === undefined ? NaN : Number(max);
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

/**
 * The committed rows a worksheet renders, as text.
 *
 * Only read in the branch that just committed a staged row, never for the 190
 * tools whose form *is* their state — a table full of a page's own worked
 * example is not a finding.
 *
 * The `#stats` rollup that branch also compares is a real assertion but a lossy
 * one: two rows that swap places, or a pair of offsetting errors, leave the
 * same combined total. The rows are what the link actually serializes, so a
 * per-row drop is only visible here.
 */
const READ_ROWS = () => [...document.querySelectorAll('table tbody tr')]
  .map((tr) => [...tr.cells].map((cell) => cell.textContent.trim()).filter(Boolean).join(' | '))
  .filter(Boolean)
  .join('\n');

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
 * Commit the form a worksheet stages its next row in, returning whether one landed.
 *
 * `label` fills any still-empty required text field, and is what distinguishes
 * one committed row from the next in the comparison the caller then makes.
 *
 * Success is measured from the page rather than assumed from the click: a
 * submit the browser refuses on validation leaves the state untouched, and
 * reporting that as "submitted" sends the caller on to compare a worksheet
 * against a link neither of them ever had anything to put in -- a confusing
 * verdict in place of an honest one.
 */
async function submitStagedRow(page, editedIds, label) {
  return await page.evaluate(({ ids, text }) => {
    const countRows = () => document.querySelectorAll('table tbody tr').length;
    for (const form of document.querySelectorAll('form')) {
      const submit = form.querySelector('button[type="submit"], input[type="submit"]');
      if (!submit) continue;
      if (![...form.elements].some((el) => ids.includes(el.id))) continue;
      for (const input of form.querySelectorAll('input[required]')) {
        if (input.value) continue;
        input.value = text;
        // A page that recalculates as you type listens for this; setting
        // `.value` alone is invisible to it.
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const rowsBefore = countRows();
      submit.click();
      return countRows() > rowsBefore;
    }
    return false;
  }, { ids: editedIds, text: label });
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

    let before = await page.evaluate(READ_FIELDS);
    let stagedRows = null;
    let beforeHero = await page.evaluate(READ_HERO);
    await page.click(control);
    // A copy handler may await the clipboard write; give the microtask a turn.
    await page.waitForTimeout(120);
    let link = await page.evaluate(() => window.__pfCopied);
    const refusal = await page.evaluate(() =>
      document.getElementById('shareStatus')?.textContent
      ?? document.getElementById('pf-link-note')?.textContent
      ?? document.getElementById('status')?.textContent ?? '');

    const marksOf = (value) => (typeof value === 'string'
      ? [value.indexOf('?'), value.indexOf('#')].filter((at) => at >= 0)
      : []);
    let marks = marksOf(link);

    // A worksheet can collect one item's fields in its own form and require
    // an explicit "Add" submission before the item joins the state the
    // share link reads — filling that form's number fields, above, edits a
    // field the link never looks at, so it comes back empty. Found
    // 2026-09-13 on `1099k-reconciliation-worksheet`'s `#row-form`, the
    // first page to pair that shape with a share link: this probe reported
    // "carries no bid", which reads like a dropped-everything failure, but
    // the page's own share button already says the honest thing in this
    // exact state ("Nothing entered yet — the link would open blank") — the
    // form just needed submitting first, the way a visitor adding a
    // platform actually would before sharing. Scoped to this branch only —
    // a link that already carries something never reaches it — so it can
    // only turn a hard failure into a real reading, never mask one.
    if (typeof link === 'string' && marks.length === 0) {
      const editable = numbers.filter((f) => !NOT_IN_A_LINK.has(f.id) && !f.id.includes('${'));
      const editedIds = editable.map((f) => f.id);
      const submitted = await submitStagedRow(page, editedIds, 'Sample');

      // A second row, and it is not belt-and-braces -- with one row the
      // comparison below cannot see the two failures its own comment claims.
      // A link that serialises only the first row, or reverses the order of
      // the rest, round-trips a single row perfectly. Codex caught exactly
      // that on #4683: the check was real but narrower than it read, which is
      // the same "claims more than it measures" defect that PR fixed in
      // `usage_state.py`, committed in the same diff.
      //
      // The label is what makes ordering visible ('Sample' vs 'Sample 2'
      // occupy the row's own text column, so a reversal shows up even where a
      // field's max pins both rows to the same figure), and stepping the
      // numbers a second time keeps the two rows distinguishable on the
      // figures as well. A page that caps its row list, or refuses the second
      // submit for any other reason, still gets the one-row check it had
      // before -- weaker, but never a false failure.
      if (submitted) {
        for (const field of editable) {
          const first = perturbNumber(field);
          try {
            await page.fill(cssId(field.id), perturbNumber({ ...field, value: first }), { timeout: 2000 });
          } catch { /* a field the layout hides at this width */ }
        }
        await submitStagedRow(page, editedIds, 'Sample 2');
      }

      if (submitted) {
        // No `.hero-number` on these worksheets; the rollup a visitor would
        // actually compare lives in `#stats` instead. Only read it here,
        // in the branch that just proved a submit was needed — everywhere
        // else this stays exactly the empty string it always was.
        if (!beforeHero) {
          beforeHero = await page.evaluate(() => document.getElementById('stats')?.textContent?.trim() ?? '');
        }
        // The committed rows, which are what the link actually serializes on
        // this shape. The `#stats` rollup above is a real assertion but a
        // lossy one: two rows that swap places, or a pair of offsetting
        // errors, leave the same combined total. Comparing the rows
        // themselves is what makes a per-row drop visible.
        stagedRows = await page.evaluate(READ_ROWS);
        // The form reset when it committed, so the sender's own fields are at
        // their defaults now — exactly where the recipient's will be. Re-read
        // them rather than keeping the mid-typing values, which is what makes
        // a hand-kept list of this venture's field ids unnecessary: the next
        // worksheet with different ids is covered without editing anything.
        before = await page.evaluate(READ_FIELDS);
        await page.click(control);
        await page.waitForTimeout(120);
        link = await page.evaluate(() => window.__pfCopied);
        marks = marksOf(link);
      }
    }
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
    if (marks.length === 0) return { slug, status: 'fail', detail: 'the copied link carries no bid' };
    const marker = Math.min(...marks);

    const second = await openTool(browser, slug, link.slice(marker));
    const after = await second.page.evaluate(READ_FIELDS);
    const afterRows = stagedRows === null ? null : await second.page.evaluate(READ_ROWS);
    let afterHero = await second.page.evaluate(READ_HERO);
    if (!afterHero && beforeHero) {
      afterHero = await second.page.evaluate(() => document.getElementById('stats')?.textContent?.trim() ?? '');
    }
    await second.context.close();

    // One line per field, whatever the field holds: a proposal scope box runs
    // to eight lines of prose, and printing it whole turns the report into the
    // document rather than the finding.
    const short = (value) => {
      const flat = String(value).replace(/\s+/g, ' ').trim();
      return flat.length > 40 ? `${flat.slice(0, 40)}…` : flat;
    };
    // A preset select that comes back empty, as `other`, or as `custom` is not
    // a finding, and the README has said so since this file shipped — the
    // recipient now holds custom rates, and "Choose a starting job…", `other`,
    // or `custom` is the honest label for them. Carrying the preset id instead
    // would re-apply it on arrival and write the venture's kit figures over the
    // sender's own, which is the exact defect #1984 repaired on
    // `amazon-fba-calculator`. `custom` joined this list once
    // `carpet-cleaning-bid-calculator`'s room "soil" select stopped silently
    // relabeling an unmatched rate as a specific preset ("Normal household
    // soil") and started saying "Custom rate" instead — `garage-door-bid-calculator`'s
    // `DOOR_SIZE_PRESETS` already used `custom` as this same honest label before
    // this file recognized it.
    //
    // Implemented rather than left as prose because a probe that reports 39
    // known-benign failures is a probe whose 40th, real one goes unread. The
    // teeth stay: every field such a select would have written is compared like
    // any other, so a preset that took the rates with it still fails here.
    const selectIds = new Set(selects.map((select) => select.id));
    const HANDBACK_VALUES = new Set(['', 'other', 'custom']);
    const presetHandback = (id) => selectIds.has(id) && HANDBACK_VALUES.has(after[id]);

    const dropped = Object.keys(before)
      .filter((id) => !NOT_IN_A_LINK.has(id) && id in after && !sameValue(before[id], after[id]))
      .filter((id) => !presetHandback(id))
      .map((id) => `${id} ${short(before[id])}→${short(after[id])}`);
    const pageErrors = [...errors, ...second.errors];

    if (stagedRows !== null && stagedRows !== afterRows) {
      // Point at the first row that changed rather than clipping both sides to
      // forty characters, which on a wide worksheet renders the sent and the
      // received copy as the same truncated prefix — a finding that reads like
      // a false positive is one nobody acts on.
      const sent = stagedRows.split('\n');
      const got = (afterRows ?? '').split('\n').filter(Boolean);
      const at = sent.findIndex((row, index) => row !== got[index]);
      const detail = sent.length !== got.length
        ? `the link carried ${got.length} of ${sent.length} committed row(s)`
        : `row ${at + 1} changed in the link:\n      sent ${sent[at]}\n      got  ${got[at] ?? '(nothing)'}`;
      return { slug, status: 'fail', detail: `the committed rows did not survive the link — ${detail}` };
    }

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

let slugs;
try {
  slugs = (await toolSlugs()).filter((s) => keepSlug(s, only));
  if (only) console.log(describeFilter(only));
} catch (error) {
  console.error(`Could not read the built artifact at ${DIST}: ${error.message}`);
  console.error('Build it first: node platform/pages/build.mjs --out=platform/pages/dist');
  process.exit(2);
}
// Outside the try on purpose: an over-narrow filter is not a build problem,
// and reporting it as one sends the reader to rebuild a site that is fine.
requireNonEmpty(slugs, only, 'tool directories');

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
