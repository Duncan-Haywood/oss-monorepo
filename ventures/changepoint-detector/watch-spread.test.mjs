// Round 15: a floor in units of each column's own recent spread (minSpreadRatio in watch-core.mjs,
// eval/watch-skab-spread.mjs; README "Round 15"). SKAB is GPL and not committed, so these tests check the floor and the
// round's helpers on made-up data and pin the committed output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spreadBefore, spreadRatio, aboveSpreadFloor, replayWatch, SPREAD_WINDOW } from './watch-core.mjs';
import { kFor, allowedWatchLines, ruleT11 } from './eval/watch-skab-spread.mjs';

const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const gauss = (u) => () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());

test('spreadBefore: a robust spread of the points before i, the SD when the MAD is 0, null on too little or no variation', () => {
  const g = gauss(lcg(3));
  const v = Array.from({ length: 2000 }, () => 2 * g());
  assert.ok(Math.abs(spreadBefore(v, 2000, 2000) - 2) < 0.15);
  assert.equal(spreadBefore(v, 5), null);
  assert.equal(spreadBefore(Array(50).fill(3), 40), null);
  const q = Array(50).fill(1); q[10] = 2; q[20] = 0;
  assert.ok(spreadBefore(q, 40) > 0);
  // Only the SPREAD_WINDOW points before i count: a wild early stretch is out of reach later.
  const w = [...Array.from({ length: 100 }, (_, i) => (i % 2 ? 50 : -50)), ...Array.from({ length: 100 }, () => g())];
  assert.ok(spreadBefore(w, 200) < 2 && SPREAD_WINDOW <= 100);
});

test('spreadRatio and aboveSpreadFloor: one k keeps a big move on a flat column and drops the same move on a wandering one', () => {
  const g = gauss(lcg(7));
  const flat = Array.from({ length: 120 }, () => 0.1 * g());
  const wander = Array.from({ length: 120 }, (_, i) => 3 * Math.sin(i / 6) + 0.1 * g());
  const c = { index: 100, shift: 2 };
  assert.ok(spreadRatio(flat, c) > 10 && spreadRatio(wander, c) < 2);
  assert.equal(aboveSpreadFloor([c], flat, 4).length, 1);
  assert.equal(aboveSpreadFloor([c], wander, 4).length, 0);
  assert.equal(aboveSpreadFloor([{ index: 100 }], wander, 4).length, 1, 'no level each side: kept');
  assert.equal(aboveSpreadFloor([{ index: 3, shift: 0.01 }], wander, 4).length, 1, 'too little history: kept');
  assert.throws(() => aboveSpreadFloor([c], flat, -1), /above 0/);
  assert.equal(aboveSpreadFloor([c], wander, 0).length, 1);
});

test('a replay with the spread floor keeps a large step on a flat series', () => {
  const g = gauss(lcg(11));
  const v = Array.from({ length: 300 }, (_, i) => (i >= 200 ? 6 : 0) + g());
  const r = replayWatch(v, null, { from: 60, minSpreadRatio: 3 }).alerts.map((a) => a.index);
  assert.ok(r.some((i) => Math.abs(i - 200) <= 5), JSON.stringify(r));
});

test('the round\'s k rule and T11 on made-up totals', () => {
  assert.equal(allowedWatchLines(1861), 37);
  assert.equal(kFor([1, 2, 3, null, 5], 2), 4);
  assert.equal(kFor([1, 2], 5), 0);
  const q = { caught: 33, share: 36.8 };
  assert.equal(ruleT11(q, { caught: 31, share: 36.8 }, 2).pass, true);
  assert.deepEqual(ruleT11(q, { caught: 30, share: 40 }, 2.01).parts, [false, false, true]);
});

test('the committed output carries the round\'s verdict', () => {
  const p = new URL('./eval/watch-skab-spread.out.txt', import.meta.url);
  assert.ok(existsSync(p));
  const out = readFileSync(p, 'utf8');
  assert.match(out, /T11 R vs Q: .*(PASSES|FAILS)\./);
});

test('the round fails on (b), and the help and the watch page say so', async () => {
  const out = readFileSync(new URL('./eval/watch-skab-spread.out.txt', import.meta.url), 'utf8');
  assert.match(out, /T11 R vs Q: \(a\) pre-fault 1\.40 per 100 checks vs 2 PASS; \(b\) 27 vs 33 - 2 FAIL; \(c\) 59\.3% vs 36\.8% PASS\. FAILS\./);
  const help = readFileSync(new URL('./watch.mjs', import.meta.url), 'utf8');
  assert.match(help, /README "Round 15"; not offered/);
});
