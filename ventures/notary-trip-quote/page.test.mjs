// Structural tests for index.html. Dependency-free (no jsdom) so CI stays a
// plain `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('landing page carries the disclaimer, structured data, and app script', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /calc\.mjs/);
});

test('the page imports the non-throwing wrapper, not the raw calculator', () => {
  // calculateQuote() throws on a negative or non-numeric figure. Importing it
  // directly into an input listener with no try/catch is exactly how a stray
  // "-" used to freeze the total with nothing on screen to explain it.
  // quoteResult() never throws, so wiring the page to it is what keeps a bad
  // keystroke from breaking the render loop.
  assert.match(html, /import\s*\{\s*quoteResult\s*\}\s*from\s*'\.\/calc\.mjs'/);
  assert.doesNotMatch(html, /import\s*\{\s*calculateQuote\s*\}/);
});

test('an error slot exists for a rejected figure to render into', () => {
  assert.match(html, /id="quoteError"/);
});

test('a rejected figure hides the stale total and clears the breakdown instead of leaving them next to a silent error', () => {
  // Before this fix, update() only toggled #quoteError on a rejected input --
  // #total, #breakdown, and #minimumNote kept showing the *last valid* quote
  // right next to the error text. A visitor could easily miss the one-line
  // error and mistake the still-displayed total for the answer to the
  // invalid inputs now on screen.
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const script = scriptMatch[1];
  const errorBranch = script.match(/if\(!q\.ok\)\{([\s\S]*?)return null\}/);
  assert.ok(errorBranch, 'update() error branch not found');
  const body = errorBranch[1];
  assert.match(body, /errorNode\.hidden\s*=\s*false/, 'the error message is never shown');
  assert.match(body, /totalEl\.hidden\s*=\s*true/, 'the stale total is not hidden on a rejected input');
  assert.match(body, /getElementById\('breakdown'\)\.innerHTML\s*=\s*''/, '#breakdown keeps its stale value instead of being cleared');
  assert.match(body, /getElementById\('minimumNote'\)\.textContent\s*=\s*''/, '#minimumNote keeps its stale value instead of being cleared');
  assert.match(body, /worthEl\.hidden\s*=\s*true/, 'the offer test keeps its stale figures next to the error');
});

test('every input the calculator reads is wired into the draft and the recalculation', () => {
  // update() builds its input object from `ids`, so a field present in the
  // markup but missing from that list silently reads as 0 forever -- the
  // visitor types a page count and nothing moves. It is also the list the
  // saved draft is keyed on, so a missing id is a field that never persists.
  const idsMatch = html.match(/const ids=\[([^\]]*)\]/);
  assert.ok(idsMatch, 'the ids list was not found');
  const wired = new Set(idsMatch[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')));
  const inputIds = [...html.matchAll(/<input id="([^"]+)" type="number"/g)].map((m) => m[1]);
  assert.ok(inputIds.length > 0, 'no number inputs found');
  for (const id of inputIds) {
    assert.ok(wired.has(id), `#${id} is a form field the page never reads`);
  }
});

test('the print and offer fields ship neutral so the guide page\'s worked example still holds', () => {
  // how-much-to-charge-for-a-mobile-notary-appointment.html quotes $129 from
  // the default form state. printSets and the two per-page rates ship
  // non-zero because they are the realistic values a visitor wants already
  // filled in -- they stay neutral only because pages default to 0, so that
  // default is the one carrying the guarantee.
  assert.match(html, /id="pagesPerSet"[^>]*value="0"/, 'pages must default to 0');
  assert.match(html, /id="printMinutes"[^>]*value="0"/, 'print minutes must default to 0');
  assert.match(html, /id="vehicleCostPerMile"[^>]*value="0"/, 'vehicle cost must default to 0');
  assert.match(html, /id="offeredFee"[^>]*value="0"/, 'the offered fee must default to 0 (no offer on the table)');
});

test('the offer test has somewhere to render and a heading that says which fee it measured', () => {
  assert.match(html, /id="worth"/);
  assert.match(html, /id="hourly"/);
  assert.match(html, /id="worthHeading"/);
  assert.match(html, /q\.offerEvaluated\?'What the offer is worth per hour'/);
});

// The result panel (the quote total, the breakdown, the minimum-fee note, the
// error text, and the per-hour offer test) rewrites its own content on every
// keystroke via update(), but the section itself carried no aria-live
// region, and neither status span announced itself either -- a screen-reader
// user who tabs away after typing a number was never told the quote changed,
// or that a bad input flipped the panel into an error message. Every other
// finished venture's `.result` section in this repo marks itself
// aria-live="polite" for exactly this reason (see seller-net-sheet,
// painting-bid-calculator). This pins the same convention here.
test('the result panel is an aria-live region so screen readers hear updates and errors', () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
});

test('the draft-cleared and copy status messages are announced, matching the role="status" aria-live="polite" convention used elsewhere', () => {
  assert.match(html, /id="draftStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="status"[^>]*role="status"[^>]*aria-live="polite"/);
});
