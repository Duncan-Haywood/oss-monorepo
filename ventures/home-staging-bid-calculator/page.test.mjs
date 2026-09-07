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

test('the page wires usage counting for both the quote and the term checker', () => {
  assert.match(html, /count\('quote-priced'\)/);
  assert.match(html, /count\('term-checked'\)/);
  assert.match(html, /<code>quote-priced<\/code>, <code>term-checked<\/code>/);
});

test('the default inputs on the page match calc.mjs DEFAULTS and produce a profitable base price', () => {
  const result = calculateQuote(DEFAULTS);
  assert.match(html, new RegExp(`id="roomsStaged" type="number" min="1" step="1" value="${DEFAULTS.roomsStaged}"`));
  assert.match(html, new RegExp(`id="furnitureCarryingCostPerMonth" type="number" min="0" step="1" value="${DEFAULTS.furnitureCarryingCostPerMonth}"`));
  assert.ok(result.baseProfit > 0);
});

test('the actual-term checker is hidden until a value is entered', () => {
  assert.match(html, /id="actualResult" hidden/);
});

test('the term-risk warning banner exists and is hidden by default', () => {
  assert.match(html, /id="termWarning" class="warn" hidden/);
});

test('an extension fee below the carrying cost and a check against calc.mjs directly agree', () => {
  const r = calculateQuote({ ...DEFAULTS, extensionFeePerMonth: 150 });
  assert.equal(r.extensionFeeCoversCarryingCost, false);
  assert.equal(r.termRiskTight, true);
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

test('the page names the vacant-listing-only limitation', () => {
  assert.match(html, /vacant-listing furniture package only/);
});
