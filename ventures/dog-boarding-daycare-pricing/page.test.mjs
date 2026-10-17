import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, occupancyBreakeven, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports calculate, occupancyBreakeven, and DEFAULTS from calc.mjs', () => {
  assert.match(html, /import \{ calculate, occupancyBreakeven, DEFAULTS \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for both the reservation and occupancy calculators', () => {
  assert.match(html, /recordEvent\('estimate'\)/);
  assert.match(html, /recordEvent\('occupancy-check'\)/);
  assert.match(html, /<code>estimate<\/code>, <code>occupancy-check<\/code>/);
});

test('the default reservation inputs match calc.mjs DEFAULTS and produce a positive price', () => {
  const result = calculate(DEFAULTS);
  assert.match(html, new RegExp(`id="dogCount" type="number" min="1" step="1" value="${DEFAULTS.dogCount}"`));
  assert.ok(result.finalPrice > 0);
});

test('the default facility inputs match calc.mjs DEFAULTS and produce a break-even reading', () => {
  const result = occupancyBreakeven(DEFAULTS);
  assert.match(html, new RegExp(`id="kennelRuns" type="number" min="1" step="1" value="${DEFAULTS.kennelRuns}"`));
  assert.ok(result.canBreakEven);
});

test('the no-warranty disclaimer is on the page', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not tax, financial, or business advice/);
});

test('the page carries the standard sponsor link and a LICENSE link', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
});

test('the privacy line names all four stored event types and says nothing is uploaded', () => {
  assert.match(html, /nothing is ever uploaded/);
  assert.match(html, /<code>estimate<\/code>, <code>occupancy-check<\/code>, <code>link-copied<\/code>, <code>reset<\/code>/);
});

test('the page ships a save-and-share draft feature', () => {
  assert.match(html, /import \{ encodeInputs, decodeInputs, formValues \} from '\.\/share\.mjs'/);
  assert.match(html, /id="copyLink"/);
  assert.match(html, /id="reset"/);
  assert.match(html, /id="draftStatus"/);
});

test('a shared link wins over a saved draft, applied through formValues rather than a plain spread', () => {
  // Regression for the shared-link-clears defect (platform/ci/check_shared_link_clears.py):
  // a plain `{ ...saved, ...fromLink }` merge looks like the link wins and is
  // not -- a field the sender left blank falls through to the recipient's own
  // saved draft instead of being cleared. formValues(fromLink) is what
  // actually clears it.
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const body = scriptMatch[1];
  assert.match(body, /applyFormInputs\(formValues\(fromLink\)\)/);
  assert.doesNotMatch(body, /\{\s*\.\.\.saved\s*,\s*\.\.\.fromLink\s*\}/);
  assert.match(body, /applyFormInputs\(DEFAULT_FORM_INPUTS\)/, 'Reset to defaults must restore the page\'s own shipped values');
});

test('the reservation result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
});

test('an invalid reservation input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/function updateReservation[\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'updateReservation() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('price'\)\.hidden = true/, 'the price hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});

test('an invalid occupancy input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="occupancyErrors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
});

test('index links one hop to the dog-walking-route-pricing sibling', () => {
  assert.match(
    html,
    /href="\.\.\/dog-walking-route-pricing\/"/,
    'index must link ../dog-walking-route-pricing/ so crawlers reach the dog walking rate calculator in one hop',
  );
});

test('index links one hop to the pet-boarding-daycare-profit-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/pet-boarding-daycare-profit-calculator\/"/,
    'index must link ../pet-boarding-daycare-profit-calculator/ so crawlers reach the kennel pro forma in one hop',
  );
});
