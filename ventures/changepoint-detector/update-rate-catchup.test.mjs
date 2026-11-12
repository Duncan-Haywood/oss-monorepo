// The catch-up check for one-tick stale feeds (README "One-tick stale feeds: the catch-up check";
// eval/update-rate-catchup.mjs, eval/update-rate-catchup-2.mjs). Two pre-registered rounds failed, so
// the check is not offered: these tests pin the ratio's arithmetic, that the shipped setting is off,
// and the committed verdicts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catchUpRatio, updateRateChanges, updateRateLines, CATCHUP } from './update-rate.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('catchUpRatio: moves ending runs of >= minRun repeats over moves after a move, in ticks squared', () => {
  // moves after a move: 1, 1, 1, 1, 1 ticks; moves ending a run of 3 repeats: 2 ticks (x5)
  const v = [0];
  const push = (d) => v.push(+(v[v.length - 1] + d).toFixed(6));
  for (let k = 0; k < 5; k++) { push(0.1); push(0.1); push(0); push(0); push(0); push(0.2); }
  const r = catchUpRatio(v, 1, v.length - 1, 0.1, { minRun: 3, minMoves: 5 });
  // after a move: the second 0.1 of each block (5); first 0.1 follows the 0.2 move (4 more, block 2..5)
  assert.equal(r.after, 5);
  assert.equal(r.plain, 9);
  assert.ok(Math.abs(r.ratio - 4) < 1e-9);
  // too few on one side: no ratio
  assert.equal(catchUpRatio(v, 1, v.length - 1, 0.1, { minRun: 3, minMoves: 6 }).ratio, null);
  assert.equal(catchUpRatio(v, 1, 5, null), null);
});

test('missing values break a run and are never a move', () => {
  const v = [0, 0.1, 0.2, 0.2, NaN, 0.2, 0.3];
  const r = catchUpRatio(v, 1, v.length - 1, 0.1, { minRun: 1, minMoves: 1 });
  assert.equal(r.after, 0); // the run before NaN is broken, and 0.2 -> 0.3 follows no repeat
});

test('shipped setting is off: catchUp never fires and the text is unchanged', () => {
  assert.equal(CATCHUP.ratio, Infinity);
  const rows = read('./data/frozen-juice.csv').trim().split('\n').slice(1).map((l) => l.split(','));
  const labels = rows.map((r) => r[0]);
  for (const col of [1, 2]) {
    const u = updateRateChanges(rows.map((r) => Number(r[col])));
    assert.ok(u.changes.length >= 1);
    for (const c of u.changes) { assert.equal(c.catchUp, false); assert.equal(typeof c.catchUpRatio, 'number'); }
    assert.doesNotMatch(updateRateLines(u, labels)[0], /catching up/);
  }
  // ppi, the rounded index: moves ending a run of 3+ repeats are smaller than moves after a move
  const ppi = updateRateChanges(rows.map((r) => Number(r[2])));
  assert.equal(ppi.changes[0].rounding, true);
  assert.ok(ppi.changes[0].catchUpRatio < 0.6);
});

test('a forced setting writes the catch-up sentence (the text a passing round would have shipped)', () => {
  const u = { changes: [{ index: 3, from: 3, to: 3, shareBefore: 0.1, shareAfter: 0.6, direction: 'less often', rounding: false, catchUp: true, catchUpRatio: 2.5, tick: 0.1 }] };
  assert.match(updateRateLines(u)[0], /2\.5x the mean square of a move after a move\), as a stale figure catching up would be/);
});

test('both rounds fail as committed', () => {
  const one = read('./eval/update-rate-catchup.out.txt');
  assert.match(one, /seed 20261213/);
  assert.match(one, /K1 \(R: catchUp <= 0\.05 of one tick, rounding >= 0\.90\): FAIL/);
  assert.match(one, /R3 +200 +200 +12 +0\.060/);
  assert.match(one, /Verdict: does not ship/);
  const two = read('./eval/update-rate-catchup-2.out.txt');
  assert.match(two, /Picked: minRun 3, ratio 1\.8, minMoves 5/);
  assert.match(two, /T1 +171 +146 +116 +0\.795/);
  assert.match(two, /K1: pass; K2: FAIL; K3: pass/);
  assert.match(two, /Verdict: does not ship/);
});
