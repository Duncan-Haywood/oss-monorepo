// Trend bends: one and two knots, refinement to the point, and sticky (AR(1)) noise.
// Split out of engine.test.mjs, unchanged, so `node --test` runs these files beside the rest instead of one 166 s file
// holding up the suite (docs/history/ci-perf-2026-11-13-changepoint-engine-test-split.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, pelt, trendAdjust } from './engine.mjs';

// Seeded PRNG (mulberry32) and Box-Muller normals, so every test is reproducible.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normals(r, n, mean = 0, sd = 1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = Math.max(r(), 1e-12);
    out.push(mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()));
  }
  return out;
}

test('trend bend: a ramp whose slope doubles is one line with a bend, not a step', () => {
  const N = 40, n = 200;
  let plain = 0, bent = 0, falseBend = 0, knot = 0, s2 = 0, found = 0;
  const ramp = (seed, step) => normals(rng(seed), n).map((e, i) => 0.1 * i + 0.1 * Math.max(0, i - 100) + e + (step && i >= 150 ? 5 : 0));
  for (let s = 801; s <= 800 + N; s++) {
    const x = ramp(s, false);
    plain += analyze({ values: x, trend: true }).pelt.changepoints.length;
    const r = analyze({ values: x, trend: 'bend' });
    bent += r.pelt.changepoints.length;
    if (r.trend.slopeChangesAt !== undefined) { knot += r.trend.slopeChangesAt; s2 += r.trend.slopeAfter; }
    const y = analyze({ values: ramp(s, true), trend: 'bend' }).pelt.changepoints;
    found += y.some((p) => Math.abs(p.index - 150) <= 3);
    const straight = normals(rng(s + 100), n).map((e, i) => 0.1 * i + e);
    falseBend += analyze({ values: straight, trend: 'bend' }).trend.slopeChangesAt !== undefined;
  }
  console.log(`# bend: ${plain / N} vs ${bent / N} changes/series; knot ${(knot / N).toFixed(1)}; slope after ${(s2 / N).toFixed(3)}; step found ${found}/${N}; false bend ${falseBend}/${N}`);
  assert.ok(bent / N < 0.5 * (plain / N));
  assert.ok(found >= 0.85 * N && falseBend <= 0.15 * N);
});

test('trend bends: a ramp with two slope changes is lines with two knots, not steps', () => {
  const N = 15, n = 240;
  let plain = 0, one = 0, many = 0, two = 0, k1 = 0, k2 = 0, falseBend = 0;
  const three = (i) => 0.1 * i + 0.1 * Math.max(0, i - 80) - 0.25 * Math.max(0, i - 160);
  for (let s = 901; s <= 900 + N; s++) {
    const x = normals(rng(s), n).map((e, i) => three(i) + e);
    plain += analyze({ values: x, trend: true }).pelt.changepoints.length;
    one += analyze({ values: x, trend: 'bend' }).pelt.changepoints.length;
    const r = analyze({ values: x, trend: 'bends' });
    many += r.pelt.changepoints.length;
    const k = r.trend.slopeChangesAtAll || [];
    if (k.length === 2) { two++; k1 += k[0]; k2 += k[1]; }
    const straight = normals(rng(s + 100), n).map((e, i) => 0.1 * i + e);
    falseBend += analyze({ values: straight, trend: 'bends' }).trend.slopeChangesAt !== undefined;
  }
  console.log(`# bends: ${plain / N} / ${one / N} / ${many / N} changes/series (steps / one bend / bends); two knots ${two}/${N} at ${(k1 / two).toFixed(1)} and ${(k2 / two).toFixed(1)}; false bend ${falseBend}/${N}`);
  assert.ok(many / N < 0.5 * (one / N));
  assert.ok(two >= 0.8 * N && Math.abs(k1 / two - 80) < 5 && Math.abs(k2 / two - 160) < 5 && falseBend <= 0.15 * N);
});

test('trend bends: knots are refined to the point on long series, not left on the n/40 grid', () => {
  // 288 points: the grid step is 7, so before refinement a knot sat up to 3 points (often 6) from the truth.
  // Slope 0.05, then 0.15 from point 96, then -0.03 from point 192; seeds 1101..1108.
  let near = 0;
  for (let seed = 1101; seed <= 1108; seed++) {
    const r = rng(seed);
    let level = 0;
    const x = normals(r, 288).map((e, i) => { if (i > 0) level += i < 96 ? 0.05 : i < 192 ? 0.15 : -0.03; return level + e; });
    const { knots } = trendAdjust(x, { bend: 3 });
    if (knots.length === 2 && Math.abs(knots[1] - 192) <= 3) near++;
  }
  assert.ok(near >= 6, `second knot within 3 points on ${near} of 8`);
});

test('trend bends with sticky noise: --ar1 keeps the wandering from being cut into steps', () => {
  const N = 40, n = 240;
  const f = (i) => 0.1 * i + 0.1 * Math.max(0, i - 80) - 0.25 * Math.max(0, i - 160);
  const runs = { plain: 0, ar1: 0, both: 0 };
  let two = 0;
  for (let s = 1001; s <= 1000 + N; s++) {
    const e = normals(rng(s), n);
    let p = 0;
    const x = e.map((v, i) => { p = 0.5 * p + v; return f(i) + p; });
    const seasonal = x.map((v, i) => v + 4 * Math.sin((2 * Math.PI * i) / 12));
    runs.plain += analyze({ values: x, trend: 'bends' }).pelt.changepoints.length;
    const a = analyze({ values: x, trend: 'bends', ar1: true });
    runs.ar1 += a.pelt.changepoints.length;
    two += (a.trend.slopeChangesAtAll || []).length === 2;
    runs.both += analyze({ values: seasonal, trend: 'bends', ar1: true, period: 12 }).pelt.changepoints.length;
  }
  console.log(`# bends, AR(1) rho 0.5: ${runs.plain / N} changes/series plain, ${runs.ar1 / N} with --ar1, ${runs.both / N} with --ar1 --period 12; two knots ${two}/${N}`);
  assert.ok(runs.ar1 < 0.4 * runs.plain);
  assert.ok(runs.both / N < 3);
  // straight ramp with the same sticky noise: the AR(1)-aware BIC must not invent a bend (11 of 40 before it)
  let falseBend = 0;
  for (let s = 1001; s <= 1000 + N; s++) {
    let p = 0;
    const st = normals(rng(s + 100), n).map((v, i) => { p = 0.5 * p + v; return 0.1 * i + p; });
    falseBend += analyze({ values: st, trend: 'bends', ar1: true }).trend.slopeChangesAt !== undefined;
  }
  assert.ok(falseBend <= 3, `false bends ${falseBend}/${N}`);
});
