// Repeat handling on a real sticky series with documented shocks (README "The same power loss on real
// shocks: frozen orange juice"; eval/frozen-juice-sticky.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { driftLevelChanges, stickyCheck } from './drift-level.mjs';

const rows = readFileSync(new URL('./data/frozen-juice.csv', import.meta.url), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), price = rows.map((r) => Number(r[1]));
const freezes = labels.filter((_, i) => Number(rows[i][3]) >= 19);
const month = (l) => { const [y, m] = l.split('-').map(Number); return y * 12 + m; };
const run = (o) => {
  const cps = driftLevelChanges(price, { noise: 'ml', ...o }).changepoints.map((i) => labels[i]);
  return { cuts: cps.length, found: freezes.filter((f) => cps.some((c) => Math.abs(month(c) - month(f)) <= 2)).length };
};

test('frozen-juice prices: handling repeats cuts 67 to 15-18 but finds 4-6 of 8 freezes, not 8', () => {
  assert.equal(freezes.length, 8);
  assert.equal(stickyCheck(price).sticky, true);
  assert.equal(stickyCheck(price).repeats, 253);
  assert.deepEqual(run({}), { cuts: 67, found: 8 });
  assert.deepEqual(run({ repeats: 'drop' }), { cuts: 15, found: 6 });
  assert.deepEqual(run({ repeats: 'drop', scale: 'segment' }), { cuts: 15, found: 4 });
  assert.deepEqual(run({ repeats: 'missing' }), { cuts: 18, found: 5 });
  assert.deepEqual(run({ repeats: 'missing', scale: 'segment' }), { cuts: 15, found: 5 });
});

test('the figures in eval/frozen-juice-sticky.out.txt match', () => {
  const out = readFileSync(new URL('./eval/frozen-juice-sticky.out.txt', import.meta.url), 'utf8');
  assert.match(out, /253 exact repeats \(41\.4% of steps\)/);
  assert.match(out, /shipped \(global scale\)\s+67\s+8 of 8/);
  assert.match(out, /drop, scale per segment\s+15\s+4 of 8/);
});
