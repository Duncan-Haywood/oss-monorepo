import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INPUT_FIELDS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');

test('the landing page names the search phrase and refuses a code opinion', () => {
  assert.match(html, /Water Heater Replacement Bid Calculator/);
  assert.match(html, /How Much to Charge to Replace a Water Heater/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /FAQPage/);
  assert.match(html, /not plumbing, electrical, engineering, code/);
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /usageOptOut/);
  assert.match(html, /Do not keep anonymous local usage counts/);
});

test('every calculator input has a control so a share link cannot drop a field', () => {
  for (const field of INPUT_FIELDS) {
    assert.match(html, new RegExp(`id="${field}"`));
  }
});

test('the page wires the calculator, usage, and share modules', () => {
  assert.match(html, /from '\.\/calc\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
  assert.match(html, /from '\.\/share\.mjs'/);
  assert.match(html, /Copy bid summary/);
  assert.match(html, /Copy share link/);
});

test('the README carries the same disclaimer and the privacy line', () => {
  assert.match(readme, /not plumbing, electrical, engineering, code/);
  assert.match(readme, /Nothing is uploaded/);
  assert.match(readme, /water-heater-bid-usage/);
  assert.match(readme, /After using this, you can now/);
});
