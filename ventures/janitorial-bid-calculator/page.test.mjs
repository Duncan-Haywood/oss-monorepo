import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareSupplyResponsibility, compareInitialClean } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const seo = readFileSync(new URL('./5x-vs-3x-cleaning-price.html', import.meta.url), 'utf8');
const supplySeo = readFileSync(new URL('./should-i-let-them-buy-the-paper.html', import.meta.url), 'utf8');
const initialSeo = readFileSync(new URL('./should-i-throw-in-the-initial-clean.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the bid page wires the frequency-cut comparison without a build step', () => {
  assert.match(html, /compareFrequencyReduction/);
  assert.match(html, /frequencyReductionNote/);
  assert.match(html, /id="currentWeekly"/);
  assert.match(html, /id="proposedWeekly"/);
  assert.match(html, /id="clientOfferMonthly"/);
  assert.match(html, /id="frequencyCompare"/);
  assert.match(html, /id="copyFrequencyNote"/);
  assert.match(html, /frequency_reduction_compared/);
  assert.match(html, /frequency_note_copied/);
  assert.match(html, /5x-vs-3x-cleaning-price\.html/);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test('the 5× vs 3× landing page is crawlable and sends people to the calculator', () => {
  assert.match(seo, /<title>5x vs 3x commercial cleaning price/);
  assert.match(seo, /name="description"/);
  assert.match(seo, /FAQPage/);
  assert.match(seo, /href="\.\/"/);
  assert.match(seo, /Best-effort hosting, no SLA/);
  assert.match(seo, /\$1,069/);
});

test('the bid page wires the who-supplies comparison without a build step', () => {
  assert.match(html, /compareSupplyResponsibility/);
  assert.match(html, /supplyResponsibilityNote/);
  assert.match(html, /id="restroomSharePercent"/);
  assert.match(html, /id="emergencyFillMonthly"/);
  assert.match(html, /id="supplyOfferMonthly"/);
  assert.match(html, /id="supplyCompare"/);
  assert.match(html, /id="copySupplyNote"/);
  assert.match(html, /supply_responsibility_compared/);
  assert.match(html, /supply_note_copied/);
  assert.match(html, /should-i-let-them-buy-the-paper\.html/);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test('the paper-handoff landing page uses the same worked example the tests lock', () => {
  const comparison = compareSupplyResponsibility({
    areas: [
      { name: 'Open office', squareFeet: 6000, productionRate: 4000, cleaningsPerWeek: 5 },
      { name: 'Restrooms', squareFeet: 600, productionRate: 1200, cleaningsPerWeek: 5 },
      { name: 'Break room', squareFeet: 400, productionRate: 2000, cleaningsPerWeek: 5 },
      { name: 'Lobby & corridors', squareFeet: 1000, productionRate: 5000, cleaningsPerWeek: 5 },
    ],
    hourlyWage: 17,
    burdenRate: 28,
    suppliesPerSqFtMonth: 0.005,
    equipmentMonthly: 25,
    otherMonthly: 0,
    overheadRate: 15,
    targetMargin: 20,
  }, { restroomSharePercent: 65, emergencyFillMonthly: 35 });
  assert.match(supplySeo, /<title>Should I let the building buy the paper/);
  assert.match(supplySeo, /name="description"/);
  assert.match(supplySeo, /FAQPage/);
  assert.match(supplySeo, /href="\.\/"/);
  assert.match(supplySeo, /Best-effort hosting, no SLA/);
  assert.match(supplySeo, /\$1,720\.00/);
  assert.match(supplySeo, /\$1,682\.62/);
  assert.match(supplySeo, /\$1,662\.50/);
  assert.match(supplySeo, /\$1,732\.94/);
  assert.match(supplySeo, /\$12\.94/);
  assert.ok(Math.abs(comparison.theyBuyRestroom.monthlyPrice - 1682.6225) < 1e-9);
  assert.ok(Math.abs(comparison.theyBuyButYouFill.monthlyPrice - 1732.935) < 1e-9);
  assert.match(sitemap, /should-i-let-them-buy-the-paper\.html/);
});

test('the bid page wires the initial-clean comparison without a build step', () => {
  assert.match(html, /compareInitialClean/);
  assert.match(html, /initialCleanNote/);
  assert.match(html, /id="initialVisitMultiplier"/);
  assert.match(html, /id="initialExtraSupplies"/);
  assert.match(html, /id="initialAmortizeMonths"/);
  assert.match(html, /id="initialCancelAfterMonths"/);
  assert.match(html, /id="initialOfferMonthly"/);
  assert.match(html, /id="initialCompare"/);
  assert.match(html, /id="copyInitialNote"/);
  assert.match(html, /el\('initThrownMonth1'\)\.textContent = signedMoney/);
  assert.match(html, /initial_clean_compared/);
  assert.match(html, /initial_clean_note_copied/);
  assert.match(html, /should-i-throw-in-the-initial-clean\.html/);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test('the initial-clean landing page uses the same worked example the tests lock', () => {
  const comparison = compareInitialClean({
    areas: [
      { name: 'Open office', squareFeet: 6000, productionRate: 4000, cleaningsPerWeek: 5 },
      { name: 'Restrooms', squareFeet: 600, productionRate: 1200, cleaningsPerWeek: 5 },
      { name: 'Break room', squareFeet: 400, productionRate: 2000, cleaningsPerWeek: 5 },
      { name: 'Lobby & corridors', squareFeet: 1000, productionRate: 5000, cleaningsPerWeek: 5 },
    ],
    hourlyWage: 17,
    burdenRate: 28,
    suppliesPerSqFtMonth: 0.005,
    equipmentMonthly: 25,
    otherMonthly: 0,
    overheadRate: 15,
    targetMargin: 20,
  }, { visitMultiplier: 5, extraSupplies: 80, amortizeMonths: 12, cancelAfterMonths: 1 });
  assert.match(initialSeo, /<title>Should I throw in the initial clean/);
  assert.match(initialSeo, /name="description"/);
  assert.match(initialSeo, /FAQPage/);
  assert.match(initialSeo, /href="\.\/"/);
  assert.match(initialSeo, /Best-effort hosting, no SLA/);
  assert.match(initialSeo, /\$490\.36/);
  assert.match(initialSeo, /\$1,720\.00/);
  assert.match(initialSeo, /\$48\.29/);
  assert.match(initialSeo, /\$1,768\.29/);
  assert.match(initialSeo, /\$1,760\.86/);
  assert.match(initialSeo, /\$442\.07/);
  assert.match(initialSeo, /GitHub Sponsors/);
  assert.ok(Math.abs(comparison.initialPrice - 490.36) < 0.005);
  assert.ok(Math.abs(comparison.thrownInMonth1Profit + 48.29) < 0.01);
  assert.match(sitemap, /should-i-throw-in-the-initial-clean\.html/);
});

// This suite predates the shared structural helpers, so it grows only the two
// it needs for the save-and-share guards below: the app script's own source,
// and the ids the markup declares.
const scriptSource = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
const declaredIds = new Set([...html.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]));

// The saved-and-shared bid is only trustworthy if it carries every field the
// calculator reads. This repo has already shipped the opposite once: a
// `share.mjs` kept its own hand-written field list, the form grew two fields
// past it, and a shared link silently dropped them — the recipient's page
// computed a different price than the sender had quoted, with nothing on
// screen to say so. These tests pin the derivation rather than the list, so a
// field added to the form is covered without anyone remembering to.
test('save-and-share is wired to the page', () => {
  assert.match(scriptSource, /from '\.\/share\.mjs'/, 'share.mjs is not imported');
  // The bid rides in the URL fragment, never the query string. A query string
  // is sent in the request line a server logs and in the `Referer` header a
  // later off-site click carries; a fragment is sent in neither. On a page that
  // promises nothing you type is uploaded, that is the difference between the
  // claim holding and not. Pin it here so a future edit cannot quietly move the
  // bid into `?...` and start leaking the setter's rates.
  assert.match(scriptSource, /\$\{query \? `#\$\{query\}` : ''\}/,
    'the bid link must be built as a URL fragment (#), not a query string (?)');
  assert.ok(!/`\?\$\{query\}`/.test(scriptSource),
    'the bid link must not be built with a query string');
  assert.match(scriptSource, /search: location\.hash/,
    'the bid must be restored from the fragment, matching how the link is built');
  for (const name of ['encodeBid', 'saveBid', 'clearBid', 'restoreBid']) {
    assert.match(scriptSource, new RegExp(`\\b${name}\\b`), `${name} is imported but never used`);
  }
  for (const id of ['copyLink', 'clearSaved', 'restoreNote']) {
    assert.ok(declaredIds.has(id), `missing #${id}`);
  }
  // What a bid link contains has to be on the page beside the button that
  // makes one. A contractor who pastes it to the customer is handing over
  // their wage, burden, overhead, and margin, and the address bar does not
  // say so. This copy is a guardrail, not decoration — it stays.
  assert.match(html, /A bid link carries your own rates/, 'the bid link does not say what it carries');
  assert.match(html, /wage, burden, overhead, and target margin/, 'the link caution does not name the rates it carries');
  assert.match(html, /The customer should get the price, not the link/, 'the link caution does not say who not to send it to');
  assert.match(html, /Your bid is saved in this browser/, 'the privacy note does not disclose that the bid is stored');
  assert.match(html, /treat one like your rate sheet/, 'the privacy note does not warn what a copied link holds');
});

function idListsIn(source) {
  return new Set([...source.matchAll(/\b([A-Z][A-Z_]*_IDS)\b/g)].map((m) => m[1]));
}

// What the bid link carries is CHOICE_IDS plus BID_SPEC — and either may defer
// to another id list rather than restate it, so resolve one level of that
// before comparing. Reusing an existing list is the correct thing for a
// venture to do; the guard should not push it into keeping a second copy.
function specSource() {
  let out = bodyOf(scriptSource, 'const CHOICE_IDS =') + bodyOf(scriptSource, 'const BID_SPEC =');
  for (const name of idListsIn(out)) {
    if (scriptSource.includes(`const ${name} =`)) out += bodyOf(scriptSource, `const ${name} =`);
  }
  return out;
}

// Returns the declaration at `opener` up to the close of its first bracketed
// body, so a `{...}` object and an `[...]` array both work.
function bodyOf(source, opener) {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, `could not find ${opener} in the script`);
  const first = source.slice(start).search(/[[{]/);
  assert.notEqual(first, -1, `${opener} has no bracketed body`);
  const open = source[start + first];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  for (let i = start + first; i < source.length; i += 1) {
    if (source[i] === open) depth += 1;
    else if (source[i] === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced ${open}${close} after ${opener}`);
}

test('every field the form reads is a field the bid link carries', () => {
  // This venture's reader is `readSavable()`: unlike the fixed-form
  // calculators it also gathers the building's spaces, which are not an id list.
  const read = idListsIn(bodyOf(scriptSource, 'function readSavable('));
  const shared = idListsIn(specSource());
  const dropped = [...read].filter((name) => !shared.has(name));
  assert.deepEqual(
    dropped,
    [],
    `readSavable() reads ${dropped.join(', ')} but BID_SPEC does not carry them; `
      + 'a shared link would price a different job than the sender saw',
  );
});

test('the building of spaces travels, not just the flat rates', () => {
  const spec = bodyOf(scriptSource, 'const BID_SPEC =');
  assert.match(spec, /rows:/, 'BID_SPEC carries no rows, so a shared link would drop every space');
  for (const key of ['type', 'name', 'squareFeet', 'productionRate', 'cleaningsPerWeek']) {
    assert.match(spec, new RegExp(`key: '${key}'`), `the area row does not carry ${key}`);
  }
  // The row's space type is a select, so it must travel validated against the
  // options the dropdown offers rather than as free text.
  assert.match(spec, /kind: 'choice'/, 'the space type is not carried as a validated choice');
  assert.match(scriptSource, /AREA_TYPE_OPTIONS/, 'the space-type options are not derived from the presets');
});
