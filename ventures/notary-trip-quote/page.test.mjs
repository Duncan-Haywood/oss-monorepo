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
});
