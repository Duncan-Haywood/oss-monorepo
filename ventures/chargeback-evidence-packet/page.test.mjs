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

// Reciprocal of the link added on card-processing-fee-audit: same merchant,
// the other half of the job. Without a crawlable link in both directions the
// pair stays a one-way hop and this tool remains an orphan.
test('index links one hop to the card-processing-fee-audit sibling', () => {
  const html = page('index.html');
  assert.match(
    html,
    /href="\.\.\/card-processing-fee-audit\/"/,
    'index must link ../card-processing-fee-audit/ so crawlers reach the fee audit in one hop',
  );
  assert.match(html, /card processing fee audit/i);
});
