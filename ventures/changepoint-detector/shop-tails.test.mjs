import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shopResiduals } from './eval/shop-tails.mjs';
import { replayWatch } from './watch-core.mjs';

// README "A shop shut one weekday, round 4": eval/shop-tails-closure.prereg.md. The closure did not deafen the
// simulated watch (C1 fails); the real shop's own noise did (C2 passes). These pin the residuals the simulation draws
// and the closure's null effect on one simulated shop.
const median = (x) => { const y = [...x].sort((p, q) => p - q), n = y.length; return n % 2 ? y[(n - 1) / 2] : (y[n / 2 - 1] + y[n / 2]) / 2; };

test('shopResiduals: the design year read like-for-like is narrower than the simulated noise and skewed low', () => {
  const r = shopResiduals();
  assert.equal(r.length, 305);
  const sd = Math.sqrt(r.reduce((s, x) => s + x * x, 0) / (r.length - 1));
  const mad = 1.4826 * median(r.map(Math.abs));
  assert.ok(Math.abs(sd - 0.356) < 0.002, `sd ${sd}`);
  assert.ok(Math.abs(mad - 0.263) < 0.002, `MAD sd ${mad}`);
  assert.ok(Math.min(...r) < -1.5 && Math.max(...r) < 1.3, 'a longer low tail than high');
});

test('an 11-day zero closure before the watch starts leaves a simulated x1.9 climb heard on the same day', () => {
  let s = 4242;
  const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
  const labels = Array.from({ length: 300 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10));
  const FACT = [0.6, 1.2, 1, 1, 1, 1, 0], a = 220, L = 35;
  const v = labels.map((_, i) => { const w = (i + 1) % 7, z = 0.3 * gauss(); if (w === 6) return 0; const ramp = i < a ? 0 : Math.min(1, (i - a) / L) * Math.log(1.9); return Math.round(30000 * Math.exp(ramp + z) * FACT[w]); });
  const x = v.map((y, i) => (i >= 23 && i <= 33 ? 0 : y));
  const opts = { model: 'mean', period: 7, from: 74 };
  const first = (r) => r.alerts.find((y) => y.label >= labels[a - 7]);
  const d = first(replayWatch(v, labels, opts)), c = first(replayWatch(x, labels, opts));
  assert.ok(d && c, 'both hear the climb');
  assert.equal(c.label, d.label);
  assert.ok(Date.parse(d.reportedAtLabel) - Date.parse(labels[a]) <= 28 * 864e5);
});
