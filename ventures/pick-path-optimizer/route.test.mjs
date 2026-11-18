import { test } from "node:test";
import assert from "node:assert/strict";
import { optimalRoute, sShapeRoute, largestGapRoute, returnRoute, pathLength, distance } from "./route.mjs";

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// Exact tour length by Held-Karp over the shortest-path distances.
function heldKarp(points, layout) {
  const nodes = [{ x: layout.depotX, y: 0 }, ...points];
  const n = nodes.length;
  if (n === 1) return 0;
  const d = nodes.map((p) => nodes.map((q) => distance(p, q, layout)));
  const full = 1 << (n - 1);
  const dp = Array.from({ length: full }, () => new Float64Array(n).fill(Infinity));
  for (let i = 1; i < n; i++) dp[1 << (i - 1)][i] = d[0][i];
  for (let m = 1; m < full; m++)
    for (let i = 1; i < n; i++) {
      const c = dp[m][i];
      if (c === Infinity) continue;
      for (let j = 1; j < n; j++) {
        const b = 1 << (j - 1);
        if (m & b) continue;
        const v = c + d[i][j];
        if (v < dp[m | b][j]) dp[m | b][j] = v;
      }
    }
  let best = Infinity;
  for (let i = 1; i < n; i++) best = Math.min(best, dp[full - 1][i] + d[i][0]);
  return best;
}

function randomCase(r, backAisle) {
  const aisles = 2 + Math.floor(r() * 7);
  const spacing = 8 + Math.floor(r() * 6);
  const L = 30 + Math.floor(r() * 40);
  const aisleXs = Array.from({ length: aisles }, (_, i) => i * spacing);
  const depotX = r() < 0.5 ? aisleXs[Math.floor(r() * aisles)] : Math.round(r() * (aisles - 1) * spacing * 2) / 2;
  const k = 1 + Math.floor(r() * 8);
  const points = [];
  for (let i = 0; i < k; i++) points.push({ x: aisleXs[Math.floor(r() * aisles)], y: 1 + Math.floor(r() * (L - 1)) });
  return { points, layout: { aisleXs, aisleLength: L, depotX, backAisle } };
}

test("the exact route matches Held-Karp on 600 random small warehouses", () => {
  const r = rng(7);
  for (let t = 0; t < 600; t++) {
    const { points, layout } = randomCase(r, t % 4 !== 0);
    const opt = optimalRoute(points, layout);
    const hk = heldKarp(points, layout);
    assert.ok(Math.abs(opt.length - hk) < 1e-6, `case ${t}: dp ${opt.length} vs held-karp ${hk} ${JSON.stringify({ points, layout })}`);
    assert.ok(Math.abs(pathLength(opt.path) - opt.length) < 1e-6, `case ${t}: drawn walk ${pathLength(opt.path)} vs ${opt.length}`);
    assert.equal(new Set(opt.order).size, points.length, `case ${t}: every pick visited`);
  }
});

test("the walk starts and ends at the depot and only changes aisle along a cross aisle", () => {
  const r = rng(11);
  for (let t = 0; t < 200; t++) {
    const { points, layout } = randomCase(r, true);
    for (const route of [optimalRoute(points, layout), sShapeRoute(points, layout), largestGapRoute(points, layout), returnRoute(points, layout)]) {
      const p = route.path;
      assert.deepEqual(p[0], { x: layout.depotX, y: 0 });
      assert.deepEqual(p[p.length - 1], { x: layout.depotX, y: 0 });
      for (let i = 1; i < p.length; i++) {
        if (p[i].x !== p[i - 1].x) {
          assert.equal(p[i].y, p[i - 1].y);
          assert.ok(p[i].y === 0 || p[i].y === layout.aisleLength, "horizontal moves only on a cross aisle");
        }
      }
    }
  }
});

test("no rule of thumb beats the exact route, and each visits every pick", () => {
  const r = rng(3);
  for (let t = 0; t < 300; t++) {
    const { points, layout } = randomCase(r, true);
    const opt = optimalRoute(points, layout).length;
    for (const f of [sShapeRoute, largestGapRoute, returnRoute]) {
      const h = f(points, layout);
      assert.ok(h.length >= opt - 1e-6, `${f.name} ${h.length} < ${opt}`);
      assert.equal(new Set(h.order).size, points.length, f.name);
    }
  }
});

test("without a back cross aisle only return routes exist, and the exact route is the return route", () => {
  const r = rng(5);
  for (let t = 0; t < 100; t++) {
    const { points, layout } = randomCase(r, false);
    assert.equal(sShapeRoute(points, layout), null);
    assert.ok(Math.abs(optimalRoute(points, layout).length - returnRoute(points, layout).length) < 1e-6);
  }
});

test("a worked case by hand", () => {
  // Three aisles 10 ft apart, 50 ft long, dock at the front of aisle 1.
  // Picks at the back of aisles 1 and 3: up aisle 1, across the back, down aisle 3, home = 50+20+50+20.
  const layout = { aisleXs: [0, 10, 20], aisleLength: 50, depotX: 0, backAisle: true };
  const route = optimalRoute([{ x: 0, y: 45 }, { x: 20, y: 45 }], layout);
  assert.equal(route.length, 140);
  assert.equal(returnRoute([{ x: 0, y: 45 }, { x: 20, y: 45 }], layout).length, 90 + 20 + 90 + 20 - 20 + 20); // 2*45 + 2*45 + 2*20
  assert.equal(optimalRoute([], layout).length, 0);
});
