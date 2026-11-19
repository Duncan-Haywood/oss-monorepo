// README "Short returns: a real drop in repeats" (eval/update-rate-returns-guard.mjs, .out.txt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { returnGuardPasses, bestReturnCost, SHORT_RETURNS } from './update-rate.mjs';
import { guardedCandidates, SHIFT_CELLS, GUARDS } from './eval/update-rate-returns-guard.mjs';
import { POWER_CELLS, valuesFrom } from './eval/update-rate-returns.mjs';
import { makeRng } from './eval/update-rate-sim.mjs';

test('the guards: half asks for at most half the share around, z01 for a significant drop', () => {
  assert.equal(returnGuardPasses(3, 100, 30, 100, { kind: 'ratio', r: 0.5 }), true);
  assert.equal(returnGuardPasses(58, 100, 66, 100, { kind: 'ratio', r: 0.5 }), false);
  assert.equal(returnGuardPasses(5, 100, 30, 100, { kind: 'z', z: 2.326 }), true);
  assert.equal(returnGuardPasses(85, 100, 86, 100, { kind: 'z', z: 2.326 }), false);
  assert.throws(() => returnGuardPasses(1, 2, 1, 2, { kind: 'nope' }));
});

test('no guard leaves the search exactly as rounds 1-4 had it', () => {
  const rnd = makeRng(4), z = Array.from({ length: 500 }, (_, t) => (rnd() < (t >= 200 && t < 260 ? 0.03 : 0.3) ? 1 : 0));
  const days = z.map((_, s) => s % 7);
  for (const kind of ['chain', 'dow']) assert.deepEqual(bestReturnCost(z, 0, z.length, { kind, days }), bestReturnCost(z, 0, z.length, { kind, days, guard: null }));
});

test('a same-count day shift reads as a return without the guard and as none with it; a real return survives', () => {
  const rnd = makeRng(21);
  for (const cell of ['S2t n1100', 'S1t n1100']) {
    const z = SHIFT_CELLS[cell](rnd), v = valuesFrom(z), days = z.map((_, s) => s % 7);
    const pen = 3 * 2 * Math.log(z.length + 1);
    assert.ok(guardedCandidates(v, days, GUARDS.none).some((q) => q.gain > pen), `${cell}: no unguarded return`);
    assert.equal(guardedCandidates(v, days, GUARDS.half).filter((q) => q.gain > pen).length, 0, cell);
  }
  const z = POWER_CELLS.R60(rnd), v = valuesFrom(z), days = z.map((_, s) => s % 7);
  const [q] = guardedCandidates(v, days, GUARDS.half).filter((c) => c.gain > 3 * 2 * Math.log(z.length + 1));
  assert.ok(q && Math.abs(q.a - 500) <= 10 && q.shareInside <= 0.5 * q.shareOutside);
});

test('round 5 committed verdict: half at m 3 passes R1-R4, J1 dates 2 of 8 and fails', () => {
  const out = readFileSync(new URL('./eval/update-rate-returns-guard.out.txt', import.meta.url), 'utf8');
  assert.match(out, /Chosen: guard 'half', m 3/);
  assert.match(out, /R1 every null and shift cell <= 0\.020 \(worst 0\.005\): pass/);
  assert.match(out, /R2 R60 found >= 120 \(196\): pass/);
  assert.match(out, /R3 R60 gain over shipped >= 60 \(196\): pass/);
  assert.match(out, /R4 every shift cell <= 0\.010 \(worst 0\.000\): pass/);
  assert.match(out, /J1 dated 2 of 8 \(bar >= 4\): FAIL/);
});

test('the pass stays off by default after round 5', () => {
  assert.equal(SHORT_RETURNS.mult, null);
});
