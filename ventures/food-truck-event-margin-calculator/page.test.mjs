import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, DEFAULTS } from './calc.mjs';
import { FIELD_IDS, OPTIONAL_FIELD_IDS, REQUIRED_FIELD_IDS } from './share.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const script = html.match(/<script type="module">([\s\S]*)<\/script>/)[1];

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports calculateQuote from calc.mjs and the field list from share.mjs', () => {
  assert.match(html, /import \{ calculateQuote \} from '\.\/calc\.mjs'/);
  assert.match(
    html,
    /import \{ encodeInputs, decodeInputs, hasSharedInputs, formValues, REQUIRED_FIELD_IDS \} from '\.\/share\.mjs'/,
  );
});

test("the page's REQUIRED_FIELD_IDS is calc.mjs's own DEFAULTS keys, not a copy", () => {
  assert.deepEqual([...REQUIRED_FIELD_IDS], Object.keys(DEFAULTS));
});

test('the page wires usage counting for both the quote and the proposed-price checker', () => {
  assert.match(html, /recordEvent\('quote-priced'\)/);
  assert.match(html, /recordEvent\('proposed-price-checked'\)/);
  assert.match(html, /<code>quote-priced<\/code>, <code>proposed-price-checked<\/code>/);
});

test('the default inputs on the page match calc.mjs DEFAULTS and produce a profitable quote', () => {
  const result = calculateQuote(DEFAULTS);
  assert.match(html, new RegExp(`id="expectedGuests" type="number" min="1" step="1" value="${DEFAULTS.expectedGuests}"`));
  assert.match(html, new RegExp(`id="foodCostPerGuest" type="number" min="0" step="0.25" value="${DEFAULTS.foodCostPerGuest}"`));
  assert.ok(result.profit > 0);
});

test('the proposed-price checker is hidden until a price is entered', () => {
  assert.match(html, /id="proposedResult" hidden/);
});

test('a proposed price below breakeven and a check against calc.mjs directly agree', () => {
  const r = calculateQuote({ ...DEFAULTS, proposedPrice: 400 });
  assert.ok(r.proposed.belowBreakEven);
});

test('the turnout-risk warning banner exists and is hidden by default', () => {
  assert.match(html, /id="foodWarning" class="warn" hidden/);
});

test('the no-warranty disclaimer is on the page', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not tax, financial, or business advice/);
});

test('the page carries the standard sponsor link and a LICENSE link, and counts a sponsor click', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /recordEvent\('sponsor_link_clicked'\)/);
});

test('the privacy line names both stored event types and says nothing is uploaded or saved', () => {
  assert.match(html, /never uploaded/);
  assert.match(html, /nothing is saved when you close the tab/);
});

test('the quote result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
});

test('an invalid input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const catchBlock = script.match(/function updateQuote[\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'updateQuote() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('price'\)\.hidden = true/, 'the price hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});

test('page wires a shareable link, matching sibling calculators', () => {
  for (const id of ['copyLink', 'shareStatus']) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
  assert.match(script, /el\('copyLink'\)\.addEventListener\('click'/);
  assert.match(script, /recordEvent\('link_copied'\)/);
  assert.match(html, /<code>link_copied<\/code>/);
});

test('the shared quote rides in the fragment, never the query string', () => {
  // A query string is sent in the request line a server logs and in the
  // Referer header a later click carries. A fragment is neither.
  assert.match(script, /\$\{query \? `#\$\{query\}` : ''\}/);
});

test('a shared link replaces every field, including proposedPrice when the link did not carry one', () => {
  // The trap this venture has: without `formValues`, a shared no-proposal
  // quote opens on top of whatever this visitor already typed into "Price
  // you're considering", and they check a stranger's number against this
  // quote's breakeven while believing nothing was proposed. See share.mjs.
  assert.match(script, /formValues\(fromLink\)/);
  assert.doesNotMatch(
    script,
    /Object\.entries\(fromLink\)/,
    "writing the decoded link straight onto the form would leave a stale proposedPrice value behind",
  );
});

test('proposedPrice travels with the rest of the quote when a link is copied', () => {
  assert.match(script, /encodeInputs\(\{ \.\.\.fieldInputs\(\), proposedPrice: el\('proposedPrice'\)\.value \}\)/);
});

test('opening the page on a shared link says so, without counting it as a calculation', () => {
  assert.match(script, /hasSharedInputs\(fromLink\)/);
  assert.match(script, /Opened a shared quote/);
  const restoreBlock = script.match(/const fromLink[\s\S]*?\n\}/);
  assert.ok(restoreBlock, 'the restore-from-link block was not found');
  assert.doesNotMatch(restoreBlock[0], /recordEvent\(/, 'opening a shared link is not a calculation');
});

test('the field list a shared link carries matches every input calculateQuote and the optional price checker read', () => {
  for (const id of FIELD_IDS) {
    assert.ok(ids.has(id), `#${id} is on share.mjs's field list but missing from the page`);
  }
  assert.deepEqual([...OPTIONAL_FIELD_IDS], ['proposedPrice']);
});

test('the FAQ answer about uploads names the share control honestly', () => {
  assert.match(html, /Copy shareable link button puts the quote on the form into the page.s URL fragment/);
  assert.match(html, /Anyone who has that link can read the quote in it/);
});

test('every .html file in the venture is reachable from the sitemap', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  for (const file of ['index.html', 'how-much-to-charge-for-a-food-truck-catering-event.html']) {
    const loc = file === 'index.html' ? '/food-truck-event-margin-calculator/' : `/food-truck-event-margin-calculator/${file}`;
    assert.ok(sitemap.includes(loc), `${file} is not listed in sitemap.xml`);
  }
});

// Closest sibling: same "flat event price hides a turnout/attendance risk"
// shape for an independent operator serving one-off private and corporate
// bookings, but portable sanitation rather than food service. Without a
// crawlable link here, a crawler entering on the food truck margin
// calculator never reaches the portable restroom event quote calculator in
// one hop.
test('index links one hop to the portable-restroom-event-quote sibling', () => {
  assert.match(
    html,
    /href="\.\.\/portable-restroom-event-quote\/"/,
    'index must link ../portable-restroom-event-quote/ so crawlers reach the portable restroom event quote calculator in one hop',
  );
});

// Same broad audience (independent food truck/mobile-vendor operators), a
// different specific job: this tool prices one event booking from the
// truck's own cost side, commissary-kitchen-cost-split-calculator splits a
// shared kitchen's recurring pooled overhead among several tenants from the
// commissary operator's side. Without a crawlable link here, a crawler
// entering on the event margin calculator never reaches the cost-split
// calculator in one hop.
test('index links one hop to the commissary-kitchen-cost-split-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/commissary-kitchen-cost-split-calculator\/"/,
    'index must link ../commissary-kitchen-cost-split-calculator/ so crawlers reach the commissary kitchen cost split calculator in one hop',
  );
});
