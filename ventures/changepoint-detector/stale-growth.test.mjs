// README "A catch-up test for multi-tick feeds": catchUpGrowth (update-rate.mjs), its simulation cells, and the
// committed verdicts of eval/stale-growth.mjs (highfrequency's trade samples are fetched, not committed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catchUpGrowth, runMoves, GROWTH } from './update-rate.mjs';
import { rng, simNull, simCarry, simulate } from './eval/stale-growth.mjs';

test('runMoves: k is the repeats directly before each move; a move whose run reaches the start is skipped', () => {
  assert.deepEqual(runMoves([1, 1, 2, 2, 2, 5, 6, 6, 9], 0, 8, 1), { k: [2, 0, 1], d: [3, 1, 3] });
  // two values within float noise are one value written twice: a repeat, not a move
  assert.deepEqual(runMoves([39.8, 39.8025, 39.802499999999995, 39.81], 0, 3, 0.0025), { k: [1], d: [3] });
});

test('catchUpGrowth needs enough moves and some after a run', () => {
  assert.equal(catchUpGrowth([1, 2, 3, 4, 5], 0, 4, 1).z, null);
  assert.equal(catchUpGrowth([1, 2], 0, 1, null), null);
  assert.deepEqual(GROWTH, { z: 1.645, minMoves: 30, minRunMoves: 10 });
});

test('a carried walk grows after its runs, a zero-inflated walk does not (small simulation)', () => {
  const R = rng(5);
  let carry = 0, nul = 0;
  for (let i = 0; i < 200; i++) {
    if (catchUpGrowth(simCarry(R, { pEnter: 0.5, pStay: 0.59 }).v, 0, 300, 1).grows) carry++;
    if (catchUpGrowth(simNull(R), 0, 300, 1).grows) nul++;
  }
  assert.ok(carry >= 170, `carry ${carry}`);
  assert.ok(nul <= 20, `null ${nul}`);
});

test('z is standardised: under the null its mean is near 0 and its sd near 1', () => {
  const R = rng(11), zs = [];
  for (let i = 0; i < 400; i++) zs.push(catchUpGrowth(simNull(R), 0, 300, 1).z);
  const m = zs.reduce((a, b) => a + b, 0) / zs.length, sd = Math.sqrt(zs.reduce((a, b) => a + (b - m) ** 2, 0) / zs.length);
  assert.ok(Math.abs(m) < 0.15 && Math.abs(sd - 1) < 0.12, `mean ${m} sd ${sd}`);
});

test('the committed run: G1, G2, R1 pass, R2 fails; nothing ships', () => {
  const out = readFileSync(new URL('./eval/stale-growth.out.txt', import.meta.url), 'utf8');
  assert.match(out, /G1: null-g 99\/2000, null-t 114\/2000 .*: pass/);
  assert.match(out, /G2: carry-55 1926\/2000 .*: pass/);
  assert.match(out, /R1: prints 1\/56 .*: pass/);
  assert.match(out, /R2: carried >= 0.30 22\/85 .*: FAIL/);
  assert.match(out, /verdict: fails R2/);
  const sim = simulate(200, 20261119);
  assert.ok(sim['carry-55'].share > 0.85 && sim['null-g'].share < 0.1);
});

test('updateRateChanges does not use the growth test (R2 failed)', () => {
  const src = readFileSync(new URL('./update-rate.mjs', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export function updateRateChanges'), src.indexOf('// A slowly moving series recorded'));
  assert.doesNotMatch(body, /catchUpGrowth/);
});
