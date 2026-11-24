import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './eval/turns-gdpc1.mjs';
import { delays } from './eval/turns-gdpc1-lag.mjs';

// README "BBQ on FRED GDPC1 1947-2026" (2026-11-24, pre-registered; D1g fails by one turn, D2g passes).
test('BBQ on GDPC1 1947Q1-2026Q1: 19 of 24 NBER turns, 2 false, D1g fails, D2g passes', () => {
  const o = run({ draws: 500 });
  assert.equal(o.main.n, 317);
  assert.equal(o.main.turns.length, 24);
  assert.equal(o.main.matched, 19);
  assert.equal(o.main.falses, 2);
  assert.equal(o.D1g, false);
  assert.equal(o.D2g, true);
  assert.ok(o.main.F > 0.89 && o.main.F < 0.90);
  // 2008-2009 and 2020 dated the same on all three vintages
  for (const v of o.vint) assert.deepEqual(v.bbq.map((t) => `${v.label[t.i]}${t.kind[0]}`), ['2008Q2p', '2009Q2t', '2019Q4p', '2020Q2t']);
});

test('the rule calls 18 of the 19 matched turns with 2 quarters of data after them', () => {
  const d = delays();
  assert.equal(d.length, 19);
  assert.equal(d.filter((r) => r.delay === 2).length, 18);
  assert.equal(d.find((r) => r.nber === '1969Q4').delay, 7);
});
