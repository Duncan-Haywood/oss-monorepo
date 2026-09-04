import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('the packet review panel is announced to screen readers when it appears', () => {
  // #output is revealed and #summary rewritten on every "build packet" click
  // without a page reload; without aria-live="polite" a screen-reader user
  // hears nothing when the packet review appears or its contents change.
  const html = page('index.html');
  assert.match(html, /<section id="output" class="card" hidden aria-live="polite">/);
});
