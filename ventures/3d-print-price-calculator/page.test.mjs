import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePrice, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports calculatePrice and DEFAULTS from calc.mjs', () => {
  assert.match(html, /import \{ calculatePrice, DEFAULTS \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for both the suggested price and the price check', () => {
  assert.match(html, /recordEvent\('price-calculated'\)/);
  assert.match(html, /recordEvent\('price-checked'\)/);
  assert.match(html, /<code>price-calculated<\/code>, <code>price-checked<\/code>/);
});

test('the default inputs on the page match calc.mjs DEFAULTS and produce a profitable suggested price', () => {
  const result = calculatePrice(DEFAULTS);
  assert.match(html, new RegExp(`id="filamentUsedGrams" type="number" min="0" step="1" value="${DEFAULTS.filamentUsedGrams}"`));
  assert.match(html, new RegExp(`id="printerCost" type="number" min="0" step="1" value="${DEFAULTS.printerCost}"`));
  assert.ok(result.suggestedProfit > 0);
});

test('the price-check panel is hidden until a value is entered', () => {
  assert.match(html, /id="actualResult" hidden/);
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
  const catchBlock = scriptMatch[1].match(/function updatePrice[\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'updatePrice() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('price'\)\.hidden = true/, 'the price hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});
