// Trend bends: the joint two-knot search, the least-squares pair, and the knot margin.
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

test('trend bends --joint-knots: scoring every pair of knots finds both bends on sticky noise more often than the greedy search', () => {
  // 240 points, slope 0.1, 0.2 from point 80, -0.05 from point 160, AR(1) rho 0.5, seeds 1001..1012 (README: 20 of 40 greedy, 36 of 40 joint)
  const n = 240, f = (i) => 0.1 * i + 0.1 * Math.max(0, i - 80) - 0.25 * Math.max(0, i - 160);
  let greedy = 0, joint = 0;
  for (let s = 1001; s <= 1012; s++) {
    let p = 0;
    const x = normals(rng(s), n).map((v, i) => { p = 0.5 * p + v; return f(i) + p; });
    greedy += (trendAdjust(x, { bend: 3, ar1: true }).knots || []).length === 2;
    joint += (trendAdjust(x, { bend: 3, ar1: true, joint: true }).knots || []).length === 2;
  }
  console.log(`# joint knots, 12 series: two knots ${greedy} greedy, ${joint} joint`);
  assert.ok(joint >= greedy + 3, `${joint} joint against ${greedy} greedy`);
});

test('trend bends --joint-knots: the refined pair places knots as well as the greedy search on white noise', () => {
  // same ramp, independent noise, seeds 1001..1012; the coarse pair alone placed knots worse than greedy (README, "Scoring every pair of knots")
  const n = 240, f = (i) => 0.1 * i + 0.1 * Math.max(0, i - 80) - 0.25 * Math.max(0, i - 160);
  const near = (o) => { const k = o.knots || []; return k.length === 2 && Math.abs(k[0] - 80) <= 8 && Math.abs(k[1] - 160) <= 8; };
  let greedy = 0, joint = 0;
  for (let s = 1001; s <= 1012; s++) {
    const x = normals(rng(s), n).map((v, i) => f(i) + v);
    greedy += near(trendAdjust(x, { bend: 3 }));
    joint += near(trendAdjust(x, { bend: 3, joint: true }));
  }
  console.log(`# joint knots, white noise, 12 series: both within 8 points ${greedy} greedy, ${joint} joint`);
  assert.ok(joint >= greedy - 1, `${joint} joint against ${greedy} greedy`); // 40 series: 33 and 33 (was 27 joint before the pair was refined)
});

test('trend bend knot margin: a slope change at 12% of the series is found only when the knot range reaches it (0.1, now the default, against the old 0.2)', () => {
  // 200 points, slope 0.05 then 0.35 from point 24, seeds 1201..1212 (README "Knot range": 34 of 40 within 6 points at 0.1, 0 of 40 at the old default 0.2)
  const n = 200, near = (o) => o.knot !== undefined && Math.abs(o.knot - 24) <= 6;
  let dflt = 0, wide = 0, falseBends = 0;
  for (let s = 1201; s <= 1212; s++) {
    const x = normals(rng(s), n).map((v, i) => 0.05 * i + 0.3 * Math.max(0, i - 24) + v);
    dflt += near(trendAdjust(x, { bend: 1, knotMargin: 0.2 }));
    wide += near(trendAdjust(x, { bend: 1 }));
    assert.equal(near(trendAdjust(x, { bend: 1 })), near(trendAdjust(x, { bend: 1, knotMargin: 0.1 })));
  }
  for (let s = 1301; s <= 1312; s++) {
    const x = normals(rng(s), n).map((v, i) => 0.1 * i + v);
    falseBends += trendAdjust(x, { bend: 3, knotMargin: 0.1 }).knot !== undefined;
  }
  console.log(`# knot margin, 12 series: knot near 24 ${dflt} at 0.2, ${wide} at 0.1; false bends on straight ramps ${falseBends}`);
  assert.ok(wide >= dflt + 6, `${wide} at 0.1 against ${dflt} at 0.2`);
  assert.ok(falseBends <= 1);
});

test('trend bend --knot-margin 0.1 with --ar1: an early slope change under sticky noise is still found', () => {
  // 200 points, slope 0.05 then 0.35 from point 24, AR(1) rho 0.5, seeds 1201..1212 (README "Knot range": 25 of 40 within 6 points at 0.1, 0 of 40 at 0.2)
  const n = 200, near = (o) => o.knot !== undefined && Math.abs(o.knot - 24) <= 6;
  let dflt = 0, wide = 0;
  for (let s = 1201; s <= 1212; s++) {
    let p = 0;
    const x = normals(rng(s), n).map((v, i) => { p = 0.5 * p + v; return 0.05 * i + 0.3 * Math.max(0, i - 24) + p; });
    dflt += near(trendAdjust(x, { bend: 1, ar1: true, knotMargin: 0.2 }));
    wide += near(trendAdjust(x, { bend: 1, ar1: true, knotMargin: 0.1 }));
  }
  console.log(`# knot margin with ar1, 12 series: knot near 24 ${dflt} at 0.2, ${wide} at 0.1`);
  assert.ok(wide >= dflt + 5, `${wide} at 0.1 against ${dflt} at 0.2`);
});

test('trend bends --joint-knots: the least-squares pair places both knots near the truth on clean data, and invents no bend on a ramp', () => {
  // 240 points, slope 0.1, 0.2 from point 80, -0.05 from point 160, white noise, seeds 1001..1012 (README: 35 of 40 within 8 points)
  const n = 240, f = (i) => 0.1 * i + 0.1 * Math.max(0, i - 80) - 0.25 * Math.max(0, i - 160);
  let near = 0, falseBend = 0;
  for (let s = 1001; s <= 1012; s++) {
    const x = normals(rng(s), n).map((v, i) => f(i) + v);
    const k = trendAdjust(x, { bend: 3, joint: true }).knots || [];
    near += k.length === 2 && Math.abs(k[0] - 80) <= 8 && Math.abs(k[1] - 160) <= 8;
    const ramp = normals(rng(s + 100), n).map((v, i) => 0.1 * i + v);
    falseBend += (trendAdjust(ramp, { bend: 3, joint: true }).knots || []).length > 0;
  }
  assert.ok(near >= 8, `${near} of 12 within 8 points`);
  assert.ok(falseBend <= 1, `${falseBend} false bends`);
});
