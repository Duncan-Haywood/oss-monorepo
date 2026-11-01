import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choose, describe, FILES } from './usage-data.mjs';

test('the branch copy wins when main has none, and main survives an absent branch file', () => {
  const doc = { last_pull: { on: '2026-11-01', errors: [] } };
  assert.equal(choose('cloudflare-analytics.json', null, doc), doc);
  assert.equal(choose('cloudflare-analytics.json', doc, null), doc);
});

test('site-visits days merge with the larger count, so a hand-run pull on main is kept', () => {
  const main = { unit: 'u', days: { '2026-10-20': { c: 5 }, '2026-10-21': { c: 1 } } };
  const branch = { unit: 'u', days: { '2026-10-21': { c: 3 }, '2026-10-22': { c: 2 } } };
  assert.deepEqual(choose('site-visits.json', main, branch).days,
    { '2026-10-20': { c: 5 }, '2026-10-21': { c: 3 }, '2026-10-22': { c: 2 } });
});

test('site-feedback merges by id, the branch record winning a tie', () => {
  const main = { note: 'n', feedback: [{ id: 1, message: 'a' }, { id: 3, message: 'c' }] };
  const branch = { note: 'n', feedback: [{ id: 1, message: 'a2' }, { id: 2, message: 'b' }] };
  assert.deepEqual(choose('site-feedback.json', main, branch).feedback.map((r) => [r.id, r.message]),
    [[1, 'a2'], [2, 'b'], [3, 'c']]);
});

test('describe says what each file covers', () => {
  assert.equal(describe(null), 'absent');
  assert.equal(describe({ days: { '2026-10-02': {}, '2026-10-01': {} } }), '2 day(s), 2026-10-01..2026-10-02');
  assert.equal(describe({ feedback: [{}] }), '1 message(s)');
  assert.equal(describe({ last_pull: { on: '2026-10-31', errors: ['x', 'y'] } }), 'last pull 2026-10-31, 2 dataset error(s)');
  assert.equal(FILES.length, 4);
});
