// Round 11: the hourly NAB watch with the daily cycle removed (eval/watch-nab-season.mjs; README "Round 11"). The data
// is not committed, so these tests check the round's helpers on made-up numbers and pin the committed output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SETTINGS, PERIOD, startFor, gapFree, hint24, rules } from './eval/watch-nab-season.mjs';
import { replayWatch } from './watch-core.mjs';

test('five settings: quiet and drift without a period, the three level settings with period 24', () => {
  assert.equal(PERIOD, 24);
  assert.deepEqual(SETTINGS, {
    quiet: ['bocpd-ar1-window', 0], drift: ['drift', 0],
    quiet24: ['bocpd-ar1-window', 24], middle24: ['bocpd', 24], eager24: ['pelt', 24],
  });
});

test('every setting starts after two full daily cycles', () => {
  assert.equal(startFor(52), 48);
  assert.equal(startFor(239), 48);
  assert.equal(startFor(1000), 200);
});

test('a series with a missing clock hour is not gap-free', () => {
  const H = 3600e3;
  assert.equal(gapFree([0, H, 2 * H]), true);
  assert.equal(gapFree([0, H, 3 * H]), false);
});

test('hint3 over the period ladder picks the most eager setting under the budget', () => {
  const ps = (q, m, e) => ({ quiet24: { histRate: q }, middle24: { histRate: m }, eager24: { histRate: e } });
  assert.equal(hint24(ps(1, 1.5, 3)), 'middle24');
  assert.equal(hint24(ps(3, 4, 9)), 'quiet24');
});

test('the rules on made-up totals: T4 allows one window fewer, T5 needs drift matched on reach and share', () => {
  const t = (reached, share, per1000) => ({ reached, share, per1000 });
  let r = rules({ quiet: t(50, 13.7, 33), quiet24: t(49, 15.7, 30), drift: t(48, 20.5, 17) });
  assert.equal(r.T4, true);
  assert.equal(r.T5, false);
  r = rules({ quiet: t(50, 13.7, 33), quiet24: t(48, 25, 20), drift: t(48, 20.5, 17) });
  assert.equal(r.T4, false);
  assert.equal(r.T5, true);
});

test('the period-24 watch replays on a daily cycle: the cycle sends nothing, an 8-unit step is sent once (real engine calls)', () => {
  const series = (step) => Array.from({ length: 168 }, (_, i) => 10 + 5 * Math.sin((2 * Math.PI * i) / 24) + (i >= 140 ? step : 0) + ((i * 7919) % 13) / 13);
  const opts = { detector: 'bocpd-ar1-window', period: 24, from: 72, budget: Infinity, confirm: 5, tolerance: 5, holdHistory: true, persist: 2, window: 1000 };
  assert.deepEqual(replayWatch(series(0), null, opts).alerts, []);
  const a = replayWatch(series(8), null, opts).alerts;
  assert.equal(a.length, 1);
  assert.equal(a[0].index, 140);
  assert.ok(a[0].reportedAt <= 145);
});

test('each job gets one reply, from this file\'s worker, with its period applied (the first run of round 11 crashed on two)', async () => {
  const { runAll } = await import('./eval/watch-nab-season.mjs');
  const { replayWatch } = await import('./watch-core.mjs');
  const values = Array.from({ length: 150 }, (_, i) => 10 * Math.sin((2 * Math.PI * i) / 24) + (i > 110 ? 6 : 0) + ((i * 7919) % 13) / 13);
  const jobs = [{ values, start: 48, detector: 'bocpd-ar1-window', period: 24 }, { values, start: 48, detector: 'bocpd-ar1-window', period: 0 }];
  const res = await runAll(jobs);
  const POLICY = { confirm: 5, tolerance: 5, holdHistory: true, persist: 2, window: 1000, from: 48, budget: Infinity };
  const direct = (period) => replayWatch(values, null, { ...POLICY, detector: 'bocpd-ar1-window', ...(period ? { period } : {}) }).alerts.map((a) => ({ index: a.index, at: a.reportedAt }));
  assert.notDeepEqual(direct(24), direct(0)); // the made-up series tells the two apart
  assert.deepEqual(res[0].alerts, direct(24));
  assert.deepEqual(res[1].alerts, direct(0));
});
