import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toDays, mergeDays, snapshot, mergeRepo, summarise } from './pull-github-traffic.mjs';

// Shapes as the REST traffic endpoints return them.
const views = [
  { timestamp: '2026-10-28T00:00:00Z', count: 12, uniques: 3 },
  { timestamp: '2026-10-29T00:00:00Z', count: 5, uniques: 2 },
];
const clones = [{ timestamp: '2026-10-29T00:00:00Z', count: 40, uniques: 9 }];

test('folds views and clones into one record per day', () => {
  assert.deepEqual(toDays({ views, clones }), {
    '2026-10-28': { views: 12, view_uniques: 3, clones: 0, clone_uniques: 0 },
    '2026-10-29': { views: 5, view_uniques: 2, clones: 40, clone_uniques: 9 },
  });
});

test('drops malformed rows rather than filing them under a bad day', () => {
  assert.deepEqual(toDays({ views: [{ timestamp: 'nope', count: 1 }, { count: 2 }], clones: [{ timestamp: '2026-10-29T00:00:00Z', count: -3, uniques: 'x' }] }), {
    '2026-10-29': { views: 0, view_uniques: 0, clones: 0, clone_uniques: 0 },
  });
});

test('a later, partial window never shrinks a day already on file', () => {
  const old = { '2026-10-28': { views: 12, view_uniques: 3, clones: 4, clone_uniques: 1 } };
  const merged = mergeDays(old, { '2026-10-28': { views: 2, view_uniques: 1, clones: 6, clone_uniques: 1 }, '2026-10-27': { views: 1 } });
  assert.deepEqual(Object.keys(merged), ['2026-10-27', '2026-10-28']);
  assert.deepEqual(merged['2026-10-28'], { views: 12, view_uniques: 3, clones: 6, clone_uniques: 1 });
  assert.equal(old['2026-10-28'].clones, 4, 'input not mutated');
});

test('snapshots keep only the aggregate fields', () => {
  const s = snapshot({
    referrers: [{ referrer: 'news.ycombinator.com', count: 7, uniques: 5, extra: 'dropped' }],
    paths: [{ path: '/o/r', title: 'r', count: 3, uniques: 2 }],
  });
  assert.deepEqual(s, {
    referrers: [{ referrer: 'news.ycombinator.com', count: 7, uniques: 5 }],
    paths: [{ path: '/o/r', title: 'r', count: 3, uniques: 2 }],
  });
});

test('a repo record accumulates days and one snapshot per pull day', () => {
  const first = mergeRepo(undefined, { views, clones, referrers: [], paths: [] }, '2026-10-29');
  const second = mergeRepo(first, { views: [{ timestamp: '2026-10-30T00:00:00Z', count: 1, uniques: 1 }], clones: [], referrers: [], paths: [] }, '2026-10-30');
  assert.deepEqual(Object.keys(second.days), ['2026-10-28', '2026-10-29', '2026-10-30']);
  assert.deepEqual(Object.keys(second.top), ['2026-10-29', '2026-10-30']);
  assert.deepEqual(summarise(second.days), { days: 3, views: 18, clones: 40 });
});
