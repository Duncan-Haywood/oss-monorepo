import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guide = readFileSync(new URL('./why-a-flat-rate-card-can-lose-money-on-a-short-ice-dam-job.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('every input, including the emergency checkbox, has an accessible label', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(
      html,
      new RegExp(`<label[^>]*>[^<]*<input id="${id}"|<label[^>]*>\\s*<input id="${id}"[^>]*>[^<]*<\\/label>`),
      `${id} input has no associated <label>`,
    );
  }
  assert.match(html, /<input id="actualHours"[^>]*>/);
});

test('the emergency dispatch field is a checkbox, not a free-typed number', () => {
  assert.match(html, /<input id="emergencyCall" type="checkbox">/);
});

test('the page imports calculateQuote and DEFAULTS from calc.mjs', () => {
  assert.match(html, /import \{ calculateQuote, DEFAULTS \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for both the quote and the actual-hours checker', () => {
  assert.match(html, /count\('quote-priced'\)/);
  assert.match(html, /count\('actual-hours-checked'\)/);
  assert.match(html, /<code>quote-priced<\/code>, <code>actual-hours-checked<\/code>/);
});

test('the default inputs on the page match calc.mjs DEFAULTS and produce a profitable quote', () => {
  const result = calculateQuote(DEFAULTS);
  assert.match(html, new RegExp(`id="edgeFeet" type="number" min="1" step="1" value="${DEFAULTS.edgeFeet}"`));
  assert.match(html, new RegExp(`id="minimumServiceCharge" type="number" min="0" step="1" value="${DEFAULTS.minimumServiceCharge}"`));
  assert.ok(result.profit > 0);
  assert.equal(result.underpriced, false);
});

test('the actual-hours checker is hidden until a value is entered', () => {
  assert.match(html, /id="actualResult" hidden/);
});

test('the rate-below-breakeven and underpriced warning banners exist and are hidden by default', () => {
  assert.match(html, /id="rateWarning" class="warn" hidden/);
  assert.match(html, /id="lossWarning" class="warn" hidden/);
});

test('a short job with a low minimum, checked directly against calc.mjs, is flagged underpriced', () => {
  const r = calculateQuote({ ...DEFAULTS, edgeFeet: 15, minimumServiceCharge: 200 });
  assert.equal(r.underpriced, true);
  assert.equal(r.rateBelowBreakeven, true);
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

test('the page links to the guide page and the comparison page', () => {
  assert.match(html, /href="why-a-flat-rate-card-can-lose-money-on-a-short-ice-dam-job\.html"/);
  assert.match(html, /href="\.\/vs-jobber\.html"/);
});

test('the guide page carries the not-uploaded privacy line, a disclaimer, and a link back to the calculator', () => {
  assert.match(guide, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(guide, /no data is uploaded/);
  assert.match(guide, /href="\.\/"/);
});

test('the guide page worked example matches calc.mjs for the same inputs', () => {
  const healthy = calculateQuote({ ...DEFAULTS, edgeFeet: 15 });
  const loss = calculateQuote({ ...DEFAULTS, edgeFeet: 15, minimumServiceCharge: 200 });
  assert.ok(!healthy.underpriced && healthy.profit > 0);
  assert.ok(loss.underpriced && loss.profit < 0);
  assert.match(guide, /\$332\.02/);
  assert.match(guide, /\$42\.98/);
  assert.match(guide, /−\$132\.02|&minus;\$132\.02/);
});

// Closest winter-weather sibling: driveway/lot snow (route minutes, salt,
// seasonal vs per-push) rather than roof-edge steam ice-dam removal. Related-
// tool chrome rotates alphabetically inside each subcategory, so without an
// explicit one-hop a crawler on this page may never land on that tool.
test('index links one hop to the snow-removal-bid-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/snow-removal-bid-calculator\/"/,
    'index must link ../snow-removal-bid-calculator/ so crawlers reach the snow calculator in one hop',
  );
  assert.match(html, /snow removal bid calculator/i);
});
