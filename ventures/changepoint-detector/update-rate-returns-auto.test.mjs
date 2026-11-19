// README "Short returns: the model chosen per stretch" (eval/update-rate-returns-auto.mjs, .out.txt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeklyPatternLR, WEEKLY_TEST } from './update-rate.mjs';
import { autoCandidates } from './eval/update-rate-returns-auto.mjs';
import { valuesFrom } from './eval/update-rate-returns.mjs';
import { makeRng, chain, NULLS } from './eval/update-rate-sim.mjs';

const days = Array.from({ length: 1100 }, (_, t) => t % 7);

test('a Monday-Friday schedule reads as weekly; a clumpy chain with no calendar does not', () => {
  const rnd = makeRng(11);
  const mf = Array.from({ length: 700 }, (_, t) => (rnd() < (t % 7 < 5 ? 0.03 : 0.95) ? 1 : 0));
  assert.ok(weeklyPatternLR(mf, days, 0, mf.length) > 10 * WEEKLY_TEST.crit);
  let over = 0;
  for (let r = 0; r < 50; r++) { const z = chain(rnd, 599, NULLS.M60); if (weeklyPatternLR(z, days, 0, z.length) > WEEKLY_TEST.crit) over++; }
  assert.ok(over <= 2, `${over} of 50 clumpy chains read as weekly`);
});

test('the statistic is the 14- against 2-parameter chain likelihood ratio, never negative', () => {
  const rnd = makeRng(3), z = Array.from({ length: 400 }, () => (rnd() < 0.3 ? 1 : 0));
  const lr = weeklyPatternLR(z, days, 0, z.length);
  assert.ok(lr >= 0 && lr < 60, String(lr));
});

test('per stretch, the weekday cost scores a weekly stretch and the fallback the rest', () => {
  const z = Array.from({ length: 700 }, (_, t) => (t % 7 >= 5 && !(t >= 300 && t < 360) ? 1 : 0));
  const [q] = autoCandidates(valuesFrom(z), days.slice(0, 700), 'chain');
  assert.equal(q.kind, 'dow'); assert.ok(q.weekly); assert.ok(Math.abs(q.a - 300) <= 6);
  const rnd = makeRng(9), y = Array.from({ length: 700 }, (_, t) => (rnd() < (t >= 300 && t < 380 ? 0.02 : 0.3) ? 1 : 0));
  const c = autoCandidates(valuesFrom(y), days.slice(0, 700), 'chain');
  assert.ok(c.length >= 1 && c.every((x) => x.kind === 'chain' && !x.weekly));
});

test('round 4 committed verdict: dow|chain at m 3 passes R1-R3, J1 dates 3 of 8 and fails', async () => {
  const { readFileSync } = await import('node:fs');
  const out = readFileSync(new URL('./eval/update-rate-returns-auto.out.txt', import.meta.url), 'utf8');
  assert.match(out, /Chosen: arm 'dow\|chain', m 3/);
  assert.match(out, /R1 every null cell <= 0\.020 \(worst 0\.000\): pass/);
  assert.match(out, /R2 R60 found >= 120 \(200\): pass/);
  assert.match(out, /R3 R60 gain over shipped >= 60 \(200\): pass/);
  assert.match(out, /J1 dated 3 of 8 \(bar >= 4\): FAIL/);
});

test('the pass stays off by default after round 4', async () => {
  const { SHORT_RETURNS } = await import('./update-rate.mjs');
  assert.equal(SHORT_RETURNS.mult, null);
});
