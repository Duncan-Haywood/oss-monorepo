import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('the planning-estimate panel is announced to screen readers on every update', () => {
  // #freightClass, #band and the two lever lines all rewrite on every
  // keystroke without a page reload; without aria-live="polite" on their
  // shared container a screen-reader user hears nothing when the estimate
  // changes.
  const html = page('index.html');
  assert.match(html, /<section class="result" aria-live="polite"><h2>Planning estimate<\/h2>/);
});
