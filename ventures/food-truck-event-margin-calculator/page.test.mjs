import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports calculateQuote and DEFAULTS from calc.mjs', () => {
  assert.match(html, /import \{ calculateQuote, DEFAULTS \} from '\.\/calc\.mjs'/);
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
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/function updateQuote[\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'updateQuote() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('price'\)\.hidden = true/, 'the price hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
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
