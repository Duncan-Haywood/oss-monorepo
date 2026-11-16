import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { knownDateTest } from './known-date.mjs';

// The test at a date the user names (README "A date you name"; eval/known-date-prereg-*.md). Rounds 1-3 failed the
// size bar high in one cell (n 40, rho 0.8, the date at 80%: 13.6%, 9.2%, 9.4% against 8%); round 4's upper-bound
// generator held every cell under 8% but fell to 1.8% in one against the 2% floor; round 5 (the upper bound gated on
// the line rho) met every bar and ships in the CLI (known-date-cli.test.mjs). These tests pin the module's
// real-series behaviour (eval/known-date-real.out.txt, -round4, -round5).
const read = (f, name) => {
  const [h, ...rows] = readFileSync(new URL(`./data/${f}`, import.meta.url), 'utf8').trim().split('\n');
  const j = h.split(',').indexOf(name);
  return { labels: rows.map((l) => l.split(',')[0]), values: rows.map((l) => +l.split(',')[j]) };
};
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

test('seat-belt law: drivers fall about 21% at 1983-02 (logs, monthly seasons), p at the bootstrap floor', () => {
  const d = read('uk-driver-deaths.csv', 'deaths');
  const h = knownDateTest(d.values.map(Math.log), d.labels.indexOf('1983-02'), { period: 12, reps: 199 });
  assert.equal(h.refused, false);
  assert.ok(h.step < -0.2 && h.step > -0.28, `step ${h.step}`);
  assert.ok(h.stepRange95[0] < h.step && h.step < h.stepRange95[1] && h.stepRange95[1] < 0);
  assert.equal(h.p, 1 / 200);
  assert.ok(h.pSlope > 0.05, `slope change p ${h.pSlope}`);
});

test('seat-belt law control: rear-seat passengers (not covered) show no significant step', () => {
  const d = read('uk-road-casualties.csv', 'rear');
  const h = knownDateTest(d.values.map(Math.log), d.labels.indexOf('1983-02'), { period: 12, reps: 199 });
  assert.equal(h.refused, false);
  assert.ok(h.pStep > 0.05, `step p ${h.pStep}`);
  assert.ok(h.stepRange95[0] < 0 && h.stepRange95[1] > 0);
});

test('Nile: the 1899 drop after the Aswan dam is a level step, not a slope change', () => {
  const d = read('nile.csv', 'volume');
  const h = knownDateTest(d.values, d.labels.indexOf('1899'), { reps: 199 });
  assert.ok(h.step < -200 && h.p <= 0.01 && h.pSlope > 0.5, JSON.stringify({ step: h.step, p: h.p, pSlope: h.pSlope }));
});

test('placebo dates on Nottingham temperatures are not significant', () => {
  const d = read('nottem.csv', 'temp_f');
  for (const date of ['1925-01', '1930-01', '1935-01']) assert.ok(knownDateTest(d.values, d.labels.indexOf(date), { period: 12, reps: 199 }).p > 0.05, date);
});

test('refuses a random walk and a date too near either end', () => {
  const r = mulberry(31); let u = 0; const walk = Array.from({ length: 80 }, () => (u += gauss(r)));
  // one seeded walk that the guard refuses (the share refused is in eval/known-date-sim.out.txt)
  assert.equal(knownDateTest(walk, 40, { reps: 19 }).refused, true);
  const line = Array.from({ length: 50 }, (_, t) => t + gauss(r));
  assert.match(knownDateTest(line, 5, { reps: 19 }).reason, /at least 8 points on each side/);
  assert.match(knownDateTest(line, 45, { reps: 19 }).reason, /at least 8 points on each side/);
});

test('a planted step and slope change are recovered on AR(1) noise', () => {
  const r = mulberry(9); let u = 0;
  const x = Array.from({ length: 120 }, (_, t) => { u = 0.4 * u + gauss(r); return 0.02 * t + u + (t >= 60 ? 3 + 0.05 * (t - 60) : 0); });
  const h = knownDateTest(x, 60, { reps: 199 });
  assert.ok(h.p <= 0.01 && h.stepRange95[0] < 3 && 3 < h.stepRange95[1] && h.slopeChangeRange95[0] < 0.05 && 0.05 < h.slopeChangeRange95[1], JSON.stringify(h));
});

test('round 4 generator: the upper bound sits above the point rho on a short sticky series, and its p is never smaller', () => {
  const r = mulberry(77); let u = 0;
  const x = Array.from({ length: 40 }, (_, t) => { u = 0.6 * u + gauss(r); return 0.05 * t + u; });
  const a = knownDateTest(x, 32, { reps: 99, seed: 3 }), b = knownDateTest(x, 32, { reps: 99, seed: 3, rhoGenMethod: 'upper' });
  assert.equal(a.refused, false);
  assert.equal(a.rhoGen.length, 1);
  assert.equal(b.rhoGen.length, 2);
  assert.ok(b.rhoGen[1] > b.rhoGen[0] && b.rhoGen[0] === a.rhoGen[0], JSON.stringify(b.rhoGen));
  assert.ok(b.p >= a.p && b.pStep >= a.pStep && b.pSlope >= a.pSlope);
  assert.ok(b.stepRange95[0] <= a.stepRange95[0] && b.stepRange95[1] >= a.stepRange95[1]);
});

test('round 5 generator: the upper bound runs only above the line-rho gate', () => {
  const r = mulberry(77); let u = 0;
  const x = Array.from({ length: 40 }, (_, t) => { u = 0.6 * u + gauss(r); return 0.05 * t + u; });
  const hi = knownDateTest(x, 32, { reps: 49, seed: 3, rhoGenMethod: 'gated', gateRho: 0 });
  const lo = knownDateTest(x, 32, { reps: 49, seed: 3, rhoGenMethod: 'gated', gateRho: 0.99 });
  const up = knownDateTest(x, 32, { reps: 49, seed: 3, rhoGenMethod: 'upper' });
  const m = knownDateTest(x, 32, { reps: 49, seed: 3 });
  assert.equal(hi.gated, true); assert.equal(lo.gated, false);
  assert.deepEqual(hi.rhoGen, up.rhoGen); assert.equal(hi.p, up.p);
  assert.deepEqual(lo.rhoGen, m.rhoGen); assert.equal(lo.p, m.p);
  assert.equal(hi.pGen.length, 2); assert.equal(hi.p, Math.max(...hi.pGen));
});
