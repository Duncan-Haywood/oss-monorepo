import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');

test('the landing page names the search phrase and refuses a code opinion', () => {
  assert.match(html, /EV Charger Installation Bid Calculator/);
  assert.match(html, /How Much to Charge to Install a Level 2 EVSE/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /FAQPage/);
  assert.match(html, /not electrical, engineering, code/);
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /usageOptOut/);
  assert.match(html, /Do not keep anonymous local usage counts/);
});

test('the page wires the calculator, usage, and share modules', () => {
  assert.match(html, /from '\.\/calc\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
  assert.match(html, /from '\.\/share\.mjs'/);
  assert.match(html, /Copy bid summary/);
  assert.match(html, /Copy share link/);
});

test('the README carries the same disclaimer and the privacy line', () => {
  assert.match(readme, /not electrical, engineering, code/);
  assert.match(readme, /Nothing is uploaded/);
  assert.match(readme, /ev-charger-bid-usage/);
  assert.match(readme, /After using this, you can now/);
});
