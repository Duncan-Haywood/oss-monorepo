// Unit tests for the locale drift comparator (no browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { numberDiff, tokens, usRead, deRead } from './check_locale_drift.mjs';

test('readings', () => {
  assert.deepEqual(tokens('Total $1,234.50 of 12'), ['1,234.50', '12']);
  assert.equal(usRead('1,234.50'), 1234.5);
  assert.equal(deRead('1.234,50'), 1234.5);
  assert.deepEqual(tokens('1 234,5 €'), ['1234,5']);
});

test('formatting alone is not drift', () => {
  assert.equal(numberDiff('Total: $1,234.50\nRate 7.5%', 'Total: 1.234,50 $\nRate 7,5%'), null);
  assert.equal(numberDiff('Pay $1250.00', 'Pay $1250.00'), null);
  assert.equal(numberDiff('Due 3/4/2026', 'Due 4.3.2026'), null);
  assert.equal(numberDiff('Total 1,250', 'Total 1.250'), null);
});

test('a value that changes is drift', () => {
  // toLocaleString round trip: 1.234,5 parsed back with parseFloat is 1.234
  assert.match(numberDiff('Tax: $246.90', 'Tax: $0.25').why, /246.90 became 0.25/);
  assert.match(numberDiff('Net 1,000', 'Net NaN').why, /NaN/);
  assert.match(numberDiff('Due 3/4/2026', 'Due 5.3.2026').why, /differ/);
  assert.match(numberDiff('a\nb', 'a').why, /line count/);
});
