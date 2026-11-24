// eval/turns-realtime.mjs: the pseudo-real-time replay of `--turns --columns` (README "Turns called in pseudo-real
// time"). Pins the pre-registered result: R1 and R2 fail, R3 and R4 pass, nothing ships.
import test from 'node:test';
import assert from 'node:assert/strict';
import { replay, analyse } from './eval/turns-realtime.mjs';

test('primary replay: median delay 7, 2001 peak lost once 2020 sets the weights, 7 of 12 before NBER', () => {
  const a = analyse(replay());
  assert.equal(a.median, 7);
  const p01 = a.calls.find((c) => c.month === '2001-03');
  assert.equal(p01.delay, null);
  assert.equal(a.before, 7);
  assert.equal(a.episodes.length, 4);
  assert.deepEqual([a.R1, a.R2, a.R3, a.R4], [false, false, true, true]);
  assert.deepEqual(a.groups.map((g) => [g.held, g.n]), [[13, 20], [39, 53], [40, 47], [85, 94], [6150, 6150]]);
});

test('sds fixed to 2019-12: every turn called, 8 of 12 before NBER, 2025-07 a fifth retracted peak', () => {
  const a = analyse(replay({ sdFixed: true }));
  assert.equal(a.calls.every((c) => c.delay !== null), true);
  assert.equal(a.calls.find((c) => c.month === '2001-03').delay, 4);
  assert.equal(a.before, 8);
  assert.equal(a.episodes.length, 5);
});
