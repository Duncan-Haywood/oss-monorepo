// Unit tests for venture-fold.mjs's pure helpers (the browser part is not run in CI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, summarise } from './venture-fold.mjs';

test('median ignores nulls and averages the middle pair', () => {
  assert.equal(median([3, null, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([null]), null);
});

test('summarise counts tops within height - 16 as on screen', () => {
  const rows = [
    { slug: 'a', card: 600, field: 828 },
    { slug: 'b', card: 700, field: 829 },
    { slug: 'c', card: null, field: null },
  ];
  assert.equal(
    summarise(rows, { width: 390, height: 844 }),
    '390x844: 3 pages; first card on screen 2/2 (median top 650 px); first field on screen 1/2 (median top 829 px)',
  );
});
