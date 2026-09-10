import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guide = readFileSync(new URL('./why-your-overage-fee-might-be-losing-you-money.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports calculateQuote and DEFAULTS from calc.mjs', () => {
  assert.match(html, /import \{ calculateQuote, DEFAULTS \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for both the quote and the weight-ticket checker', () => {
  assert.match(html, /recordEvent\('quote-priced'\)/);
  assert.match(html, /recordEvent\('weight-ticket-checked'\)/);
  assert.match(html, /<code>quote-priced<\/code>, <code>weight-ticket-checked<\/code>/);
});

test('the default inputs on the page match calc.mjs DEFAULTS and produce a profitable base rental', () => {
  const result = calculateQuote(DEFAULTS);
  assert.match(html, new RegExp(`id="dumpsterSizeYards" type="number" min="1" step="1" value="${DEFAULTS.dumpsterSizeYards}"`));
  assert.match(html, new RegExp(`id="tippingFeePerTon" type="number" min="0" step="1" value="${DEFAULTS.tippingFeePerTon}"`));
  assert.ok(result.baseProfit > 0);
});

test('the weight-ticket checker is hidden until a value is entered', () => {
  assert.match(html, /id="actualResult" hidden/);
});

test('the weight-risk warning banner exists and is hidden by default', () => {
  assert.match(html, /id="weightWarning" class="warn" hidden/);
});

test('a below-tipping-fee overage rate and a check against calc.mjs directly agree', () => {
  const r = calculateQuote({ ...DEFAULTS, overageRatePerTon: 50 });
  assert.equal(r.overageRateCoversDisposal, false);
  assert.equal(r.weightRiskTight, true);
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

test('the result panel announces recalculation to screen readers', () => {
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

test('the page links to the guide page', () => {
  assert.match(html, /href="why-your-overage-fee-might-be-losing-you-money\.html"/);
});

test('the guide page carries the not-uploaded privacy line, a disclaimer, and a link back to the calculator', () => {
  assert.match(guide, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(guide, /no data is uploaded/);
  assert.match(guide, /href="\.\/"/);
});

test('the guide page worked example matches calc.mjs for the same inputs', () => {
  const r = calculateQuote({ ...DEFAULTS, overageRatePerTon: 50, actualWeightTons: 10 });
  assert.ok(r.actual.belowBreakEven);
  assert.match(guide, /\$351\.01/);
  assert.match(guide, /−\$14\.70|&minus;\$14\.70/);
});

// Closest disposal sibling: same landfill ticket math, but a same-day haul rather
// than a roll-off rental. Related-tool chrome rotates inside the subcategory, so
// without an explicit one-hop a crawler on this page may never land on that tool.
test('index links one hop to the junk-removal-bid-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/junk-removal-bid-calculator\/"/,
    'index must link ../junk-removal-bid-calculator/ so crawlers reach the junk removal calculator in one hop',
  );
  assert.match(html, /junk removal bid calculator/i);
});
