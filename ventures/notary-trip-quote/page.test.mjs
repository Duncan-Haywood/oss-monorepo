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
