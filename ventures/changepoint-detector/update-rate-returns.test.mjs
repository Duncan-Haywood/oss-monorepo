// README "Short returns to more frequent updates" (eval/update-rate-returns.mjs, .out.txt files).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { repeatIndicators, bestReturn, shortReturns, SHORT_RETURNS } from './update-rate.mjs';
import { valuesFrom } from './eval/update-rate-returns.mjs';

// Monday-Friday publication (weekends repeat), daily for steps [300, 360).
const z = Array.from({ length: 700 }, (_, t) => (t % 7 >= 5 && !(t >= 300 && t < 360) ? 1 : 0));
const v = valuesFrom(z);

test('valuesFrom gives back the repeat indicators', () => {
  assert.deepEqual(repeatIndicators(v), z);
});

test('bestReturn finds a planted return to daily publication and its edges', () => {
  const r = bestReturn(z, 0, z.length);
  assert.ok(Math.abs(r.a - 300) <= 6 && Math.abs(r.b - 360) <= 6, JSON.stringify(r));
  assert.ok(r.gain > 0);
});

test('bestReturn looks only for fewer repeats inside, and needs room on both sides', () => {
  const sticky = Array.from({ length: 300 }, (_, t) => (t >= 120 && t < 180 ? 1 : t % 9 === 0 ? 1 : 0));
  const r = bestReturn(sticky, 0, sticky.length);
  assert.ok(!r || !(r.a >= 110 && r.b <= 190 && r.b - r.a >= 40), 'a stickier interval is not a return');
  assert.equal(bestReturn(z, 0, 59), null);
});

test('the pass is off by default: no pre-registered round set its penalty', () => {
  assert.equal(SHORT_RETURNS.mult, null);
  assert.deepEqual(shortReturns(v).returns, []);
  assert.equal(shortReturns(v, { mult: 1 }).returns.length, 1);
});

test('round 1 committed verdict: no m in 0.5-2 meets the null budget', () => {
  const out = readFileSync(new URL('./eval/update-rate-returns.out.txt', import.meta.url), 'utf8');
  assert.match(out, /No m meets <= 0\.010 in every null cell: nothing ships\./);
  assert.match(out, /W3 n1100 +1\.005 +1\.000 +0\.990 +0\.745 +0\.385 +0\.085/);
});

test('round 2 committed verdict: m 3 holds the null budget and finds no 60-day return', () => {
  const out = readFileSync(new URL('./eval/update-rate-returns-2.out.txt', import.meta.url), 'utf8');
  assert.match(out, /Smallest m meeting <= 0\.010 in every null cell: m 3\n/);
  assert.match(out, /R1 every null cell <= 0\.020 \(worst 0\.000\): pass/);
  assert.match(out, /R2 R60 found >= 120 \(0\): FAIL/);
  assert.match(out, /R3 R60 gain over shipped >= 60 \(0\): FAIL/);
});
