// README "Short returns, with the day of the week" (eval/update-rate-returns-dow.mjs, .out.txt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestReturn, bestReturnCost, returnCandidates, daysFromDates } from './update-rate.mjs';
import { valuesFrom } from './eval/update-rate-returns.mjs';
import { makeRng } from './eval/update-rate-sim.mjs';

// Monday-Friday publication (weekends repeat), daily for steps [300, 360): round 2's toy.
const z = Array.from({ length: 700 }, (_, t) => (t % 7 >= 5 && !(t >= 300 && t < 360) ? 1 : 0));
const days = z.map((_, t) => t % 7);

test("the generic 'chain' cost reproduces the shipped pass's bestReturn", () => {
  const rnd = makeRng(5), y = Array.from({ length: 400 }, (_, t) => (rnd() < (t > 150 && t < 230 ? 0.05 : 0.3) ? 1 : 0));
  for (const zz of [z, y]) {
    const a = bestReturn(zz, 0, zz.length), b = bestReturnCost(zz, 0, zz.length, { kind: 'chain' });
    assert.equal(b.a, a.a); assert.equal(b.b, a.b); assert.ok(Math.abs(a.gain - b.gain) < 1e-6);
  }
});

test('a weekday cost finds the planted return with a far larger gain than the chain', () => {
  const c = bestReturnCost(z, 0, z.length, { kind: 'chain' });
  for (const kind of ['dow', 'dowchain']) {
    const r = bestReturnCost(z, 0, z.length, { kind, days });
    assert.ok(Math.abs(r.a - 300) <= 6 && Math.abs(r.b - 360) <= 6, JSON.stringify(r));
    assert.ok(r.gain > 1.9 * c.gain, `${kind} ${r.gain} vs chain ${c.gain}`);
  }
  assert.throws(() => bestReturnCost(z, 0, z.length, { kind: 'dow' }), /needs days/);
});

test('a fixed weekly schedule with no return gains nothing under the weekday cost', () => {
  const w = Array.from({ length: 700 }, (_, t) => (t % 7 >= 5 ? 1 : 0));
  const r = bestReturnCost(w, 0, w.length, { kind: 'dow', days });
  assert.ok(!r || r.gain < 1e-9, JSON.stringify(r));
});

test('weekdays from ISO dates, and candidates in z positions', () => {
  assert.deepEqual(daysFromDates(['2021-08-01', '2021-08-02', '2021-08-07', '2021-08-08']), [1, 6, 0]);
  const q = returnCandidates(valuesFrom(z), { kind: 'dow', days });
  assert.equal(q.length, 1);
  assert.equal(q[0].shareInside, 0);
});

test('round 3 committed verdict: dowchain at m 5 holds the nulls and finds 116 of 200, R2 fails', async () => {
  const { readFileSync } = await import('node:fs');
  const out = readFileSync(new URL('./eval/update-rate-returns-dow.out.txt', import.meta.url), 'utf8');
  assert.match(out, /'dow': no m meets <= 0\.010 in every null cell/);
  assert.match(out, /'dowchain': smallest m meeting <= 0\.010 in every null cell: m 5 \(R60 found 123\)/);
  assert.match(out, /R1 every null cell <= 0\.020 \(worst 0\.000\): pass/);
  assert.match(out, /R2 R60 found >= 120 \(116\): FAIL/);
  assert.doesNotMatch(out, /REAL \(seen\) check/);
});
