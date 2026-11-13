// Round 10: the watch on NAB's real series (eval/watch-nab.mjs; README "Round 10"). The data is not committed, so these
// tests check the round's helpers on made-up rows and pin the committed output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hourly, hint3, hintNN, BUDGET } from './eval/watch-nab.mjs';

const H = 3600e3;

test('hourly buckets average by clock hour and skip empty hours', () => {
  const rows = [[0, 1], [5 * 60e3, 3], [H, 10], [H + 30 * 60e3, 20], [3 * H + 1, 7]];
  const { t, values } = hourly(rows);
  assert.deepEqual(t, [0, H, 3 * H]);
  assert.deepEqual(values, [2, 15, 7]);
  assert.throws(() => hourly([[0, NaN]]), /bad row/);
});

test('the round replays after every point (no coarse checks, no bisection)', () => {
  assert.equal(BUDGET, Infinity);
});

const ps = (q, m, d, e) => ({ quiet: { histRate: q }, middle: { histRate: m }, drift: { histRate: d }, eager: { histRate: e } });

test('hint3 is the shipped nested rule: the most eager setting at or under the budget', () => {
  assert.equal(hint3(ps(0.5, 1.5, 0.1, 3)), 'middle');
  assert.equal(hint3(ps(0.5, 1.5, 0.1, 2)), 'eager');
  assert.equal(hint3(ps(3, 4, 0.1, 9)), 'quiet');
});

test('hintNN moves only a series too loud for quiet, and only when drift is quieter on its history', () => {
  assert.equal(hintNN(ps(3, 4, 1, 9)), 'drift');
  assert.equal(hintNN(ps(3, 4, 5, 9)), 'quiet');
  // A calm series keeps the nested pick even when drift is quieter still (round 9's failure).
  assert.equal(hintNN(ps(0.5, 1.5, 0.1, 3)), 'middle');
});

test('the committed output is a complete run of the pre-registered rule', () => {
  const out = readFileSync(new URL('./eval/watch-nab.out.txt', import.meta.url), 'utf8');
  assert.match(out, /an hourly watch on NAB's 47 real series \(48163 hourly points/);
  assert.match(out, /^ {2}T1 hint3 vs quiet: .* (CONFIRMED|NOT CONFIRMED)\.$/m);
  assert.match(out, /^ {2}T2 drift vs middle: .* (CONFIRMED|DROPPED)\.$/m);
  assert.match(out, /^ {2}T3 hintNN vs hint3: .* (SHIPS|does NOT ship)\.$/m);
});
