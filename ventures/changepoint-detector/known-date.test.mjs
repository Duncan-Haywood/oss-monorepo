import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { knownDateTest } from './known-date.mjs';

// The test at a date the user names (README "A date you name: three pre-registered rounds, not shipped";
// eval/known-date-prereg-*.md). It failed its synthetic size bar in one cell in all three rounds (n 40, rho 0.8, the
// date at 80%: 13.6%, 9.2%, 9.4% against 8%), so it is not in the CLI, the engine or the page; these tests pin the
// module's real-series behaviour (eval/known-date-real.out.txt) for the next round.
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
