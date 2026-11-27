// Round 17: a floor re-read on a rolling window of the same run (eval/watch-skab-rolling.mjs; README "Round 17"). SKAB is
// GPL and not committed, so these tests check the floor on made-up data and pin the committed output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { largestMoveBefore, moveRatio, aboveMoveFloor, replayWatch, MOVE_WINDOW, MOVE_SPAN } from './watch-core.mjs';
import { ruleT13, K_FIXED } from './eval/watch-skab-rolling.mjs';

const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const gauss = (u) => () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());

test('largestMoveBefore: the window, the span, a step inside it, and too little history', () => {
  assert.equal(MOVE_WINDOW, 60);
  assert.equal(MOVE_SPAN, 12);
  const flat = Array.from({ length: 100 }, (_, i) => (i >= 60 ? 3 : 0));
  assert.equal(largestMoveBefore(flat, 90), 3, 'a step of 3 inside the 60 points before is a move of 3');
  assert.equal(largestMoveBefore(flat, 59), null, 'a constant stretch never moves');
  assert.equal(largestMoveBefore(flat, 23), null, 'fewer than 24 points before: no reading');
  const ramp = Array.from({ length: 100 }, (_, i) => i / 10);
  assert.ok(Math.abs(largestMoveBefore(ramp, 90) - 1.2) < 1e-9, 'a ramp of 0.1 a point moves 12 x 0.1 between neighbouring 12-point means');
  const g = gauss(lcg(3));
  const noise = Array.from({ length: 4000 }, g);
  const reads = [];
  for (let i = 100; i < 4000; i += 60) reads.push(largestMoveBefore(noise, i));
  const mean = reads.reduce((t, x) => t + x, 0) / reads.length;
  assert.ok(mean > 0.7 && mean < 1.2, `white noise: about 0.9 sd (got ${mean.toFixed(2)})`);
});

test('the rolling floor keeps a step bigger than the last five minutes and drops a drift-made move', () => {
  const g = gauss(lcg(11));
  const step = Array.from({ length: 200 }, (_, i) => (i >= 150 ? 4 : 0) + g());
  assert.ok(moveRatio(step, { index: 150, shift: 4 }) > K_FIXED);
  const drift = Array.from({ length: 200 }, (_, i) => i / 5 + 0.1 * g());
  assert.ok(moveRatio(drift, { index: 150, shift: 1.5 }) < K_FIXED, 'on a ramp of 0.2 a point a move of 1.5 is smaller than the 2.4 the ramp made');
  assert.deepEqual(aboveMoveFloor([{ index: 150, shift: 1.5 }, { index: 150 }], drift, 1).length, 1, 'a change with no level each side is kept');
  assert.throws(() => aboveMoveFloor([], drift, -1), /minMoveRatio takes a number above 0/);
  const r0 = replayWatch(step, null, { detector: 'bocpd-ar1-window', from: 100, budget: Infinity });
  const r1 = replayWatch(step, null, { detector: 'bocpd-ar1-window', from: 100, budget: Infinity, minMoveRatio: 1 });
  assert.ok(r0.alerts.some((a) => Math.abs(a.index - 150) <= 3) && r1.alerts.some((a) => Math.abs(a.index - 150) <= 3), 'the step is sent with and without the floor');
});

test('T13 on made-up totals', () => {
  const q = { caught: 33, share: 36.8 };
  assert.equal(ruleT13(q, { caught: 31, share: 36.8 }, 2).pass, true);
  assert.deepEqual(ruleT13(q, { caught: 30, share: 36.7 }, 2.01).parts, [false, false, false]);
});

test('the committed output carries the round\'s verdict', () => {
  const p = new URL('./eval/watch-skab-rolling.out.txt', import.meta.url);
  assert.ok(existsSync(p));
  assert.match(readFileSync(p, 'utf8'), /T13 W vs Q: .*(PASSES|FAILS)\./);
});

test('round 17 as run: T13 fails on (a), and the help, the page and llms.txt say so', () => {
  const out = readFileSync(new URL('./eval/watch-skab-rolling.out.txt', import.meta.url), 'utf8');
  assert.match(out, /T13 W vs Q: \(a\) pre-fault 4\.67 per 100 checks vs 2 FAIL; \(b\) 32 vs 33 - 2 PASS; \(c\) 38\.4% vs 36\.8% PASS\. FAILS\./);
  assert.match(readFileSync(new URL('./watch.mjs', import.meta.url), 'utf8'), /README "Round 17"; not offered/);
  assert.match(readFileSync(new URL('./llms.txt', import.meta.url), 'utf8'), /README "Round 17"/);
});
