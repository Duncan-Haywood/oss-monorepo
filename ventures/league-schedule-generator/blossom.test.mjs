import test from "node:test";
import assert from "node:assert/strict";
import { maxWeightMatching } from "./blossom.mjs";

// Seeded generator so a failure is repeatable.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

/** Best matching by trying every one: [cardinality, weight] (cardinality first when asked). */
function brute(n, edges, maxCardinality) {
  const adj = Array.from({ length: n }, () => new Map());
  for (const [i, j, w] of edges) { adj[i].set(j, Math.max(adj[i].get(j) ?? -Infinity, w)); adj[j].set(i, adj[i].get(j)); }
  let best = [0, 0];
  const used = new Array(n).fill(false);
  const go = (v, card, wt) => {
    while (v < n && used[v]) v++;
    if (v >= n) {
      const better = maxCardinality ? (card > best[0] || (card === best[0] && wt > best[1])) : wt > best[1];
      if (better) best = [card, wt];
      return;
    }
    used[v] = true;
    go(v + 1, card, wt);
    for (const [u, w] of adj[v]) if (!used[u]) { used[u] = true; go(v + 1, card + 1, wt + w); used[u] = false; }
    used[v] = false;
  };
  go(0, 0, 0);
  return best;
}

function score(n, edges, mate) {
  const w = new Map();
  for (const [i, j, x] of edges) { const k = Math.min(i, j) * n + Math.max(i, j); w.set(k, Math.max(w.get(k) ?? -Infinity, x)); }
  let card = 0, wt = 0;
  for (let v = 0; v < n; v++) {
    const u = mate[v];
    if (u < 0) continue;
    assert.equal(mate[u], v, "mate is symmetric");
    if (v < u) { card++; wt += w.get(v * n + u); }
  }
  return [card, wt];
}

test("matches brute force on 1,500 random small graphs, with and without max cardinality", () => {
  const r = rng(7);
  for (let t = 0; t < 1500; t++) {
    const n = 2 + Math.floor(r() * 9);
    const p = 0.2 + r() * 0.8;
    const edges = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (r() < p) edges.push([i, j, 1 + Math.floor(r() * (t % 3 ? 20 : 3))]);
    for (const mc of [false, true]) {
      const mate = maxWeightMatching(n, edges, { maxCardinality: mc });
      const got = score(n, edges, mate);
      const want = brute(n, edges, mc);
      // without max cardinality only the weight is defined: equal-weight matchings may differ in size
      if (mc) assert.deepEqual(got, want, `trial ${t} n=${n} ${JSON.stringify(edges)}`);
      else assert.equal(got[1], want[1], `trial ${t} n=${n} ${JSON.stringify(edges)}`);
    }
  }
});

test("large weights (up to 1e13) stay exact", () => {
  const r = rng(11);
  for (let t = 0; t < 200; t++) {
    const n = 4 + Math.floor(r() * 7);
    const edges = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (r() < 0.7) edges.push([i, j, 1e13 - Math.floor(r() * 1e12)]);
    const mate = maxWeightMatching(n, edges, { maxCardinality: true });
    assert.deepEqual(score(n, edges, mate), brute(n, edges, true));
  }
});

test("empty and tiny inputs", () => {
  assert.deepEqual(maxWeightMatching(0, []), []);
  assert.deepEqual(maxWeightMatching(3, []), [-1, -1, -1]);
  assert.deepEqual(maxWeightMatching(2, [[0, 1, 5]]), [1, 0]);
  // a triangle plus a pendant: max cardinality takes 2 edges even when one edge alone weighs more
  assert.deepEqual(score(4, [[0, 1, 1], [1, 2, 10], [2, 3, 1]], maxWeightMatching(4, [[0, 1, 1], [1, 2, 10], [2, 3, 1]], { maxCardinality: true })), [2, 2]);
});
