// Round 13: a whole-watch rule for several columns, "alert only when k columns agree" (agreeAlerts in watch-core.mjs,
// eval/watch-skab-agree.mjs; README "Round 13"). SKAB is GPL and not committed, so these tests check the rule on
// made-up lines and pin the committed output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agreeAlerts } from './watch-core.mjs';
import { ruleT9, wholeWatch, noise, W } from './eval/watch-skab-agree.mjs';

const L = [
  { column: 0, index: 100, at: 105 }, { column: 0, index: 102, at: 108 }, { column: 1, index: 104, at: 110 },
  { column: 2, index: 300, at: 305 }, { column: 1, index: 500, at: 505 }, { column: 0, index: 530, at: 540 },
];

test('k = 2 sends only when a second column dates a change within the window, at the line that completes it', () => {
  assert.deepEqual(agreeAlerts(L, 2, 12), [{ index: 104, at: 110, columns: [0, 1] }]);
  // Two lines of one column do not agree with each other.
  assert.deepEqual(agreeAlerts([{ column: 3, index: 10, at: 15 }, { column: 3, index: 11, at: 16 }], 2, 12), []);
  // 26 points apart is outside a window of 12.
  assert.deepEqual(agreeAlerts([{ column: 0, index: 500, at: 505 }, { column: 1, index: 530, at: 540 }], 2, 12), []);
});

test('k = 1 merges near-simultaneous lines into one message per change, the like-for-like baseline', () => {
  assert.deepEqual(agreeAlerts(L, 1, 12).map((a) => a.index), [100, 300, 500, 530]);
});

test('lines are taken in the order sent, whatever order they are given in; k must be a whole number', () => {
  assert.deepEqual(agreeAlerts([...L].reverse(), 2, 12), agreeAlerts(L, 2, 12));
  assert.throws(() => agreeAlerts(L, 0), /whole number/);
  assert.throws(() => agreeAlerts(L, 1.5), /whole number/);
});

test('wholeWatch tags each column\'s lines and uses the round\'s window of 12 buckets (60 s)', () => {
  assert.equal(W, 12);
  assert.deepEqual(wholeWatch([[{ index: 50, at: 55 }], [], [{ index: 58, at: 63 }]], 2), [{ index: 58, at: 63, columns: [0, 2] }]);
});

test('T9 on made-up totals: the normal run at most 2 per 100, faults at least A1 minus 2, share at least A1\'s', () => {
  const t = (caught, share) => ({ caught, share });
  assert.equal(ruleT9(t(33, 30), t(31, 30), 2).pass, true);
  assert.equal(ruleT9(t(33, 30), t(30, 40), 1).pass, false);
  assert.equal(ruleT9(t(33, 30), t(33, 29.9), 1).pass, false);
  assert.equal(ruleT9(t(33, 30), t(33, 40), 2.01).pass, false);
});

test('the synthetic noise is seeded and standard', () => {
  assert.deepEqual(noise(5, 7), noise(5, 7));
  const x = noise(20000, 1);
  const m = x.reduce((a, b) => a + b, 0) / x.length, s = Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / x.length);
  assert.ok(Math.abs(m) < 0.03 && Math.abs(s - 1) < 0.03);
});
