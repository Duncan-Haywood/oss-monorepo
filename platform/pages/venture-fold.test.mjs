// Unit tests for venture-fold.mjs's pure helpers (the browser part is not run in CI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASELINE_PATH, belowFold, compareBaseline, median, summarise } from './venture-fold.mjs';

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

test('belowFold keeps only fields past height - 16, sorted by slug', () => {
  const rows = [
    { slug: 'z', field: 900 },
    { slug: 'a', field: 829 },
    { slug: 'm', field: 828 },
    { slug: 'n', field: null },
  ];
  assert.deepEqual(belowFold(rows, { height: 844 }), { a: 829, z: 900 });
  assert.deepEqual(Object.keys(belowFold(rows, { height: 844 })), ['a', 'z']);
});

test('compareBaseline flags new and deeper pages, lists fixed ones, ignores unmeasured', () => {
  const below = { old: 900, deep: 900, fixed: 1000, unmeasured: 1200 };
  const rows = [
    { slug: 'old', field: 940 }, // within the 48 px slack
    { slug: 'deep', field: 949 }, // 49 px deeper
    { slug: 'fixed', field: 700 },
    { slug: 'new', field: 860 },
    { slug: 'fine', field: 500 },
    { slug: 'nofield', field: null },
  ];
  const { regressions, fixed } = compareBaseline(rows, below, { height: 844 });
  assert.deepEqual(fixed, ['fixed']);
  assert.equal(regressions.length, 2);
  assert.match(regressions[0], /^deep: .*49 px deeper/);
  assert.match(regressions[1], /^new: .*not in the baseline/);
});

test('BASELINE_PATH sits beside the script', () => {
  assert.match(BASELINE_PATH, /platform[\\/]pages[\\/]venture-fold-baseline\.json$/);
});
