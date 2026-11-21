import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekly, slopeWatch } from './eval/slow-climb-sim.mjs';

// README "A shop shut one weekday, round 6": eval/slow-climb.prereg.md. These pin the weekly totals and the S arm
// (a slope check on log weekly totals) the simulation scores.
const labels = Array.from({ length: 371 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10));
const rng = (seed) => {
  let s = seed >>> 0;
  const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
};
const shopDays = (g, a, L, size, sd) => labels.map((_, i) => {
  const w = (i + 1) % 7; if (w === 6) return 0;
  const ramp = a === null || i < a ? 0 : Math.min(1, (i - a) / L) * Math.log(size);
  return 30000 * Math.exp(ramp + sd * g()) * [0.6, 1.2, 1, 1, 1, 1, 0][w];
});

test('weekly: whole Monday-to-Sunday weeks, labelled by the Monday', () => {
  const { W, WL, end } = weekly(labels.map(() => 1), labels);
  assert.equal(W.length, 53);
  assert.ok(W.every((x) => x === 7));
  assert.equal(WL[0], '2024-01-01');
  assert.equal(end[0], '2024-01-07');
});

test('slopeWatch: a flat weekly series sends nothing, and neither does a clean five-week climb to x1.9 (a pulse in growth, not a lasting slope)', () => {
  const flat = weekly(shopDays(rng(7), null, null, 1, 0.2), labels);
  assert.equal(slopeWatch(flat.W, flat.WL, flat.end).alerts.length, 0);
  // Growth is about 0.13 a week for five weeks and 0 after: the single-split test on the differences reads that
  // pulse weakly. Largest W over the checks is about 5 against a bar of 8.5 (README, round 6).
  const up = weekly(shopDays(rng(7), 245, 35, 1.9, 0.2), labels);
  assert.equal(slopeWatch(up.W, up.WL, up.end).alerts.length, 0);
  // The arm does fire on growth that changes and stays changed: +0.25 a week from week 30 to the end.
  const y = Array.from({ length: 53 }, (_, k) => 10 + (k >= 30 ? 0.25 * (k - 30) : 0) + 0.02 * Math.sin(k * 1.7));
  const W = y.map(Math.exp), WL = labels.filter((_, i) => i % 7 === 0).slice(0, 53), end = labels.filter((_, i) => i % 7 === 6);
  const r = slopeWatch(W, WL, end);
  assert.ok(r.alerts.length >= 1 && Math.abs(WL.indexOf(r.alerts[0].label) - 30) <= 1, JSON.stringify(r.alerts));
});
