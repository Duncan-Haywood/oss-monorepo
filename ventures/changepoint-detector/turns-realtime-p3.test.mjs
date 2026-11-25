// eval/turns-realtime-p3.mjs: the pseudo-real-time replay under the 3-month composite minimum (README "Turns called
// in pseudo-real time under P3"). Pins the pre-registered result: Q2 fails, Q1, Q3 and Q4 pass, nothing ships.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from './eval/turns-realtime-p3.mjs';
import { replay, analyse } from './eval/turns-realtime.mjs';

test('P3 replay: same call delays as the 6-month rule, 2 more retracted alarms, Q2 fails', () => {
  const a = run();
  const b = analyse(replay());
  assert.deepEqual(a.calls.map((c) => c.delay), b.calls.map((c) => c.delay));
  assert.equal(a.called, 15);
  assert.equal(a.median, 7);
  assert.equal(a.before, 7);
  assert.equal(a.episodes.length, 6);
  assert.deepEqual([a.Q1, a.Q2, a.Q3, a.Q4], [true, false, true, true]);
  assert.deepEqual(a.groups.map((g) => [g.held, g.n]), [[13, 22], [39, 56], [40, 52], [85, 106], [6150, 6527]]);
});

test('P3 replay: the 2002-11/2003-04 pair stands from 2003 to the 2020-03 cut-off, then goes', () => {
  const a = run();
  const L = a.label;
  const pk = a.episodes.find((e) => e.kind === 'peak' && L[e.lo] === '2002-11');
  assert.equal(L[pk.first], '2003-04');
  assert.equal(L[pk.last], '2020-03');
});

test('sds fixed to 2019-12: 16 of 16, 8 of 12 before NBER, the pair never retracted', () => {
  const a = run({ sdFixed: true });
  assert.equal(a.called, 16);
  assert.equal(a.before, 8);
  assert.equal(a.episodes.length, 7);
});
