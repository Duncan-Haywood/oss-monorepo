import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guide = readFileSync(new URL('./how-much-to-charge-for-a-vehicle-wrap.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('every input on the page has an accessible name via a wrapping label', () => {
  for (const id of Object.keys(DEFAULTS)) {
    const re = new RegExp(`<label>[^<]+<input id="${id}"[^>]*></label>`);
    assert.match(html, re, `${id} input is not wrapped in a <label> with visible text`);
  }
});

test('the page imports calculateQuote and DEFAULTS from calc.mjs', () => {
  assert.match(html, /import \{ calculateQuote, DEFAULTS \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for both the quote and the material check', () => {
  assert.match(html, /count\('quote-priced'\)/);
  assert.match(html, /count\('material-check-run'\)/);
  assert.match(html, /<code>quote-priced<\/code>, <code>material-check-run<\/code>/);
});

test('the default inputs on the page match calc.mjs DEFAULTS and produce a profitable quote', () => {
  const result = calculateQuote(DEFAULTS);
  assert.match(html, new RegExp(`id="vehicleSurfaceAreaSqFt" type="number" min="1" step="1" value="${DEFAULTS.vehicleSurfaceAreaSqFt}"`));
  assert.match(html, new RegExp(`id="vinylCostPerSqFt" type="number" min="0" step="0.01" value="${DEFAULTS.vinylCostPerSqFt}"`));
  assert.ok(result.profit > 0);
});

test('the actual-usage checker is hidden until a value is entered', () => {
  assert.match(html, /id="actualResult" hidden/);
});

test('the waste-risk warning banner exists and is hidden by default', () => {
  assert.match(html, /id="wasteWarning" class="warn" hidden/);
});

test('a nonzero waste factor and a check against calc.mjs directly agree', () => {
  const r = calculateQuote(DEFAULTS);
  assert.equal(r.wasteRiskTight, true);
  assert.ok(r.wasteBlindLossPerJob > 0);
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
  assert.match(html, /href="how-much-to-charge-for-a-vehicle-wrap\.html"/);
});

test('the guide page carries the not-uploaded privacy line, a disclaimer, and a link back to the calculator', () => {
  assert.match(guide, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(guide, /no data is uploaded/);
  assert.match(guide, /href="\.\/"/);
});

test('the guide page worked example matches calc.mjs for the same inputs', () => {
  const r = calculateQuote(DEFAULTS);
  assert.ok(Math.abs(r.price - 3638.21) < 0.01);
  assert.ok(Math.abs(r.priceIfWasteIgnored - 3336.67) < 0.01);
  assert.ok(Math.abs(r.wasteBlindLossPerJob - 196) < 0.01);
  assert.match(guide, /\$3,638\.21/);
  assert.match(guide, /\$3,336\.67/);
  assert.match(guide, /\$196\.00/);
});

// Closest sibling: also a per-vehicle job a wrap shop's own customer asks
// about. Without an explicit one-hop, platform/pages/siblings.mjs reports
// this tool as a crawlable orphan -- reachable only through the category
// index, never from another tool.
test('index links one hop to the mobile-detailing-bid-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/mobile-detailing-bid-calculator\/"/,
    'index must link ../mobile-detailing-bid-calculator/ so crawlers reach the detailing calculator in one hop',
  );
  assert.match(html, /mobile detailing bid calculator/i);
});
