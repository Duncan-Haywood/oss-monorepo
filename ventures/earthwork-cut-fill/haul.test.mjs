import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transport, cellVolumes, haulPlan } from './haul.mjs';
import { makeSurface, parsePoints, exampleCsv, EXAMPLE_BOUNDARY, parseBoundary, designPlane, computeVolumes, run } from './earthwork.mjs';

function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

// Independent reference: successive shortest paths (Bellman-Ford on the
// residual graph), one unit-of-bottleneck augmentation at a time.
function minCostFlow(supply, demand, cost) {
  const m = supply.length, n = demand.length, S = m + n, T = S + 1, V = T + 1;
  const edges = []; const g = Array.from({ length: V }, () => []);
  const add = (u, v, cap, c) => { g[u].push(edges.length); edges.push({ v, cap, c }); g[v].push(edges.length); edges.push({ v: u, cap: 0, c: -c }); };
  supply.forEach((s, i) => add(S, i, s, 0));
  demand.forEach((d, j) => add(m + j, T, d, 0));
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) add(i, m + j, Infinity, cost(i, j));
  let total = 0;
  for (;;) {
    const dist = new Array(V).fill(Infinity), pe = new Array(V).fill(-1); dist[S] = 0;
    for (let it = 0; it < V; it++) {
      let ch = false;
      for (let u = 0; u < V; u++) if (dist[u] < Infinity) for (const e of g[u]) { const E = edges[e]; if (E.cap > 0 && dist[u] + E.c < dist[E.v] - 1e-12) { dist[E.v] = dist[u] + E.c; pe[E.v] = e; ch = true; } }
      if (!ch) break;
    }
    if (dist[T] === Infinity) break;
    let f = Infinity;
    for (let v = T; v !== S; v = edges[pe[v] ^ 1].v) f = Math.min(f, edges[pe[v]].cap);
    for (let v = T; v !== S; v = edges[pe[v] ^ 1].v) { edges[pe[v]].cap -= f; edges[pe[v] ^ 1].cap += f; }
    total += f * dist[T];
  }
  return total;
}

function checkFeasible(sol, supply, demand) {
  const out = supply.map(() => 0), inn = demand.map(() => 0);
  for (const [i, j, q] of sol.flows) { assert.ok(q > 0); out[i] += q; inn[j] += q; }
  assert.deepEqual(out, supply); assert.deepEqual(inn, demand);
}

function randomInstance(r, m, n, total) {
  const cut = (k) => { const w = Array.from({ length: k }, () => r()); const s = w.reduce((a, b) => a + b, 0); const v = w.map(x => Math.floor((x / s) * total)); v[0] += total - v.reduce((a, b) => a + b, 0); return v; };
  return { supply: cut(m), demand: cut(n) };
}

test('2-D random instances: same optimum as an independent min-cost flow, and the certificate holds', () => {
  const r = rng(11);
  for (let t = 0; t < 60; t++) {
    const m = 1 + Math.floor(r() * 7), n = 1 + Math.floor(r() * 7);
    const { supply, demand } = randomInstance(r, m, n, 50 + Math.floor(r() * 200));
    const P = Array.from({ length: m }, () => [r() * 100, r() * 100]), Q = Array.from({ length: n }, () => [r() * 100, r() * 100]);
    const cost = (i, j) => Math.hypot(P[i][0] - Q[j][0], P[i][1] - Q[j][1]);
    const sol = transport(supply, demand, cost);
    checkFeasible(sol, supply, demand);
    assert.ok(sol.optimal, `instance ${t} not proved optimal`);
    const ref = minCostFlow(supply, demand, cost);
    assert.ok(Math.abs(sol.cost - ref) <= 1e-9 * Math.max(1, ref), `instance ${t}: ${sol.cost} vs ${ref}`);
    assert.ok(Math.abs(sol.cost - sol.dual) <= 1e-9 * Math.max(1, ref));
  }
});

test('1-D: the optimum equals the area under the mass-haul curve', () => {
  // On a line, least haul = integral of |cumulative cut - cumulative fill|,
  // the classical mass-haul diagram's area.
  const r = rng(5);
  for (let t = 0; t < 40; t++) {
    const k = 3 + Math.floor(r() * 30);
    const xs = Array.from({ length: k }, () => r() * 1000).sort((a, b) => a - b);
    const net = xs.map(() => Math.floor((r() - 0.5) * 200));
    const s = net.reduce((a, b) => a + b, 0); net[k - 1] -= s; // balance
    const si = [], di = [];
    net.forEach((v, i) => { if (v > 0) si.push(i); else if (v < 0) di.push(i); });
    const sol = transport(si.map(i => net[i]), di.map(i => -net[i]), (a, b) => Math.abs(xs[si[a]] - xs[di[b]]));
    let F = 0, area = 0;
    for (let i = 0; i + 1 < k; i++) { F += net[i]; area += Math.abs(F) * (xs[i + 1] - xs[i]); }
    assert.ok(Math.abs(sol.cost - area) <= 1e-9 * Math.max(1, area), `${sol.cost} vs ${area}`);
    assert.ok(sol.optimal);
  }
});

test('degenerate and trivial inputs', () => {
  assert.equal(transport([], [], () => 0).cost, 0);
  assert.equal(transport([5], [5], () => 3).cost, 15);
  const sol = transport([4, 4], [4, 4], (i, j) => (i === j ? 0 : 1)); // ties everywhere in the start
  assert.equal(sol.cost, 0); assert.ok(sol.optimal);
  assert.throws(() => transport([1], [2], () => 0), /differ/);
  assert.throws(() => transport([1.5], [1.5], () => 0), /integers/);
});

const ex = makeSurface(parsePoints(exampleCsv()).points);
const bnd = parseBoundary(EXAMPLE_BOUNDARY).vertices;

test('cell volumes add up to the whole-site TIN volumes', () => {
  const design = designPlane({ elevation: 107, x0: 612500, y0: 2087220, slopeX: 1 });
  for (const opts of [{ boundary: bnd, cell: 10 }, { boundary: bnd, cell: 7 }, { cell: 12.5 }, { boundary: bnd, cell: 10, strip: 0.5 }]) {
    const whole = computeVolumes(ex, design, { boundary: opts.boundary ?? null, strip: opts.strip ?? 0 });
    const g = cellVolumes(ex, design, opts);
    const cut = g.cells.reduce((s, c) => s + c.cut, 0), fill = g.cells.reduce((s, c) => s + c.fill, 0), area = g.cells.reduce((s, c) => s + c.area, 0);
    assert.ok(Math.abs(cut - whole.cut) < 1e-6 * whole.cut, `cut ${cut} vs ${whole.cut}`);
    assert.ok(Math.abs(fill - whole.fill) < 1e-6 * whole.fill, `fill ${fill} vs ${whole.fill}`);
    assert.ok(Math.abs(area - whole.area) < 1e-6 * whole.area);
  }
});

test('haul plan on the example: balanced, proved optimal, centroid shortcut is a lower bound', () => {
  const r = run({ existingText: exampleCsv(), boundaryText: EXAMPLE_BOUNDARY, balance: true, shrink: 15, units: 'ft', pad: {} });
  const h = haulPlan(ex, designPlane(r.design), { boundary: bnd, shrink: 15, perVolume: 27, cell: 10 });
  assert.ok(h.optimal);
  assert.ok(Math.abs(h.cut - r.volumes.cut) < 1e-6 * r.volumes.cut);
  // Balanced site: what leaves or arrives is rounding from the bisection.
  assert.ok(h.exported + h.imported < 0.001 * h.cut);
  assert.ok(Math.abs(h.local + h.moved + h.exported - h.cut) < 1e-6 * h.cut);
  assert.ok(h.centroidHaul <= h.averageHaul + 1e-9);
  assert.ok(h.averageHaul > 50 && h.averageHaul < 200);
  const sum = h.moves.reduce((s, x) => s + x.volume * x.distance, 0);
  assert.ok(Math.abs(sum - h.moment) < 1e-9 * h.moment);
});

test('a mound in the middle of a ring of fill: the centroid shortcut says zero, the real haul does not', () => {
  // Made-up symmetric site: a mound at the centre, the pad at the balance level.
  const pts = [];
  for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) {
    const x = i * 10, y = j * 10, rr = Math.hypot(x - 100, y - 100);
    pts.push({ x, y, z: 100 + 3 * Math.exp(-((rr / 40) ** 2)) });
  }
  const s = makeSurface(pts);
  const g = z => { const v = computeVolumes(s, designPlane({ elevation: z })); return v.cut - v.fill; };
  let lo = 100, hi = 103; for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (g(mid) > 0) lo = mid; else hi = mid; }
  const h = haulPlan(s, designPlane({ elevation: (lo + hi) / 2 }), { cell: 10 });
  assert.ok(h.optimal);
  assert.ok(h.centroidHaul < 0.5, `centroid haul ${h.centroidHaul}`);
  assert.ok(h.averageHaul > 30, `average haul ${h.averageHaul}`);
});

test('unbalanced site: spare cut is exported, nothing imported; and the reverse', () => {
  const low = haulPlan(ex, designPlane({ elevation: 104 }), { boundary: bnd, cell: 10, perVolume: 27 });
  assert.ok(low.exported > 0 && low.imported === 0 && low.optimal);
  const high = haulPlan(ex, designPlane({ elevation: 112 }), { boundary: bnd, cell: 10, perVolume: 27 });
  assert.ok(high.imported > 0 && high.exported === 0 && high.optimal);
  assert.match(haulPlan(ex, designPlane({ elevation: 104 }), { shrink: 100 }).error, /Shrink/);
});

test('the grid respects maxCells and a full-size site plans in well under a few seconds', () => {
  const t0 = Date.now();
  const h = haulPlan(ex, designPlane({ elevation: 108, x0: 612500, y0: 2087220, slopeX: 0.5 }), { maxCells: 900 });
  assert.ok(h.nx * h.ny <= 900);
  assert.ok(h.optimal);
  assert.ok(Date.now() - t0 < 8000, `${Date.now() - t0} ms`);
});
