// README "A real carried-forward feed: last-trade prices": the sampling that labels each repeat, the bars, and
// the committed verdicts of eval/stale-real-trades.mjs (highfrequency's trade samples are fetched, not committed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readTrades, sampleEvery, tradePrints, windows, tally, WINDOW } from './eval/stale-real-trades.mjs';

test('a grid step with no trade repeats the last trade and is marked carried', () => {
  const trades = [{ t: 0, p: 10 }, { t: 0.5, p: 10.01 }, { t: 3.2, p: 10.02 }, { t: 3.4, p: 10.02 }, { t: 6, p: 10 }];
  const s = sampleEvery(trades, 1);
  assert.deepEqual(s.v, [10, 10.01, 10.01, 10.01, 10.02, 10.02, 10]);
  assert.deepEqual(s.traded, [false, true, false, false, true, false, true]);
  assert.deepEqual(tradePrints(trades).v, [10, 10.01, 10.02, 10.02, 10]);
});

test('trades are read per day from a DT,PRICE file with nanosecond times', () => {
  const d = readTrades('DT,PRICE\n2013-06-08 09:00:01.625473976,39.505\n2013-06-08 09:00:03.986675024,39.62\n2013-06-09 09:00:00,40\n');
  assert.deepEqual([...d.keys()], ['2013-06-08', '2013-06-09']);
  assert.ok(Math.abs(d.get('2013-06-08')[1].t - d.get('2013-06-08')[0].t - 2.361) < 1e-3);
});

test('windows are whole, non-overlapping, every k-th', () => {
  assert.equal(WINDOW, 300);
  assert.deepEqual(windows(1000, 1).map((w) => w.slice(0, 2)), [[0, 300], [300, 600], [600, 900]]);
  assert.deepEqual(windows(1000, 2).map((w) => w[0]), [0, 600]);
});

test('the bars: B1 power where carried >= 0.30, B2 size on trade prints, B3 fitted share within 0.10', () => {
  const g = (carried, stale, fitted) => ({ kind: 'D=1', carried, stale, fitted });
  const p = (stale) => ({ kind: 'prints', carried: 0, stale, fitted: null });
  const rows = [g(0.5, true, 0.45), g(0.4, true, 0.2), g(0.35, false, 0.1), g(0.1, true, 0.1), p(false), p(true)];
  const t = tally(rows);
  assert.deepEqual([t.B1.k, t.B1.n], [2, 3]);
  assert.deepEqual([t.B2.k, t.B2.n], [1, 2]);
  assert.deepEqual([t.B3.k, t.B3.n], [2, 3]);
  assert.equal(t.B1.pass || t.B2.pass || t.B3.pass, false);
});

test('two writings of one price set no tick and are no move; exact repeats still repeat', async () => {
  const { smallestStep, medianMoveTicks, floatNoise, repeatIndicators } = await import('./update-rate.mjs');
  const v = [39.8025, 39.802499999999995, 39.805, 39.805, 39.8075];
  assert.equal(floatNoise(39.8025, 39.802499999999995), true);
  assert.equal(floatNoise(39.8025, 39.805), false);
  assert.equal(smallestStep(v), 0.0025);
  assert.equal(medianMoveTicks(v, 1, v.length - 1, 0.0025), 1);
  assert.deepEqual(repeatIndicators(v), [0, 0, 1, 0]);
  assert.equal(smallestStep([1e-12, 2e-12, 3e-12]), 1e-12);
});
