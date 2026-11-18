import test from "node:test";
import assert from "node:assert/strict";
import { solve, verify, schedule, rng } from "./vrptw.mjs";
import { optimize, parseStops, parsePoint, sampleText, sampleDepot, solvePlan, buildMatrices, evaluateRoute } from "./calc.mjs";

function randomInstance(seed, n, { capacity = 30, vehicles = Infinity, windows = true } = {}) {
  const r = rng(seed);
  const pts = Array.from({ length: n + 1 }, (_, i) => (i === 0 ? [50, 50] : [r() * 100, r() * 100]));
  const N = n + 1;
  const dist = new Float64Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) dist[i * N + j] = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
  const ready = [0], due = [1000], service = [0], demand = [0];
  for (let i = 1; i <= n; i++) {
    const a = windows ? Math.floor(r() * 300) : 0;
    ready.push(a); due.push(windows ? a + 60 + Math.floor(r() * 120) : 1000);
    service.push(10); demand.push(1 + Math.floor(r() * 10));
  }
  return { n: N, dist, time: dist, service, ready, due, demand, capacity, maxVehicles: vehicles };
}

// Every ordering of the customers, cut into routes at every set of points.
function bruteForce(inst) {
  const ids = Array.from({ length: inst.n - 1 }, (_, i) => i + 1);
  let best = Infinity;
  const perm = (a, k) => {
    if (k === a.length) {
      const cuts = a.length - 1;
      for (let mask = 0; mask < 1 << cuts; mask++) {
        const routes = [[a[0]]];
        for (let i = 1; i < a.length; i++) { if (mask & (1 << (i - 1))) routes.push([]); routes[routes.length - 1].push(a[i]); }
        if (routes.length > inst.maxVehicles) continue;
        let c = 0;
        for (const r of routes) { const s = schedule(inst, r); if (!s) { c = Infinity; break; } c += s.cost; }
        if (c < best) best = c;
      }
      return;
    }
    for (let i = k; i < a.length; i++) { [a[k], a[i]] = [a[i], a[k]]; perm(a, k + 1); [a[k], a[i]] = [a[i], a[k]]; }
  };
  perm(ids, 0);
  return best;
}

test("finds the brute-force optimum on 40 random 6-customer instances with windows and capacity", () => {
  let found = 0, tried = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const inst = randomInstance(seed, 6, { capacity: 20, vehicles: seed % 3 === 0 ? 3 : Infinity });
    const opt = bruteForce(inst);
    const res = solve(inst, { iterations: 2000, seed });
    if (!Number.isFinite(opt)) { assert.ok(res.missing.length > 0); continue; }
    tried++;
    const v = verify(inst, res.routes);
    assert.ok(v.ok, v.errors.join("; "));
    assert.equal(res.missing.length, 0);
    assert.ok(res.distance >= opt - 1e-6, `seed ${seed}: ${res.distance} below the optimum ${opt}`);
    if (res.distance <= opt + 1e-6) found++;
  }
  assert.ok(tried >= 30, `only ${tried} feasible instances`);
  assert.equal(found, tried, `optimum found on ${found} of ${tried}`);
});

test("every plan on 60-customer instances is feasible and serves everyone", () => {
  for (let seed = 1; seed <= 5; seed++) {
    const inst = randomInstance(100 + seed, 60, { capacity: 50 });
    const res = solve(inst, { iterations: 3000, seed });
    const v = verify(inst, res.routes);
    assert.ok(v.ok, v.errors.join("; "));
    assert.equal(v.served, 60);
    assert.ok(Math.abs(v.distance - res.distance) < 1e-6);
    assert.ok(res.distance <= res.startDistance + 1e-6);
  }
});

test("the same seed and iteration count give the same plan", () => {
  const inst = randomInstance(7, 40);
  assert.deepEqual(solve(inst, { iterations: 1500, seed: 3 }).routes, solve(inst, { iterations: 1500, seed: 3 }).routes);
});

test("a fleet too small for the windows leaves customers out rather than breaking a window", () => {
  const inst = randomInstance(9, 30, { capacity: 1000, vehicles: 1 });
  const res = solve(inst, { iterations: 1000 });
  assert.equal(res.vehicles, 1);
  assert.ok(res.missing.length > 0);
  assert.ok(verify(inst, res.routes).ok);
});

test("verify catches a broken window, an overload and a double visit", () => {
  const inst = randomInstance(11, 6, { capacity: 5, windows: true });
  const bad = verify(inst, [[1, 2, 3, 4, 5, 6], [1]]);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => /twice/.test(e)));
  assert.ok(bad.errors.some((e) => /load/.test(e)));
});

test("the tool keeps each driver's load under the vehicle capacity", () => {
  const rows = parseStops(sampleText().split("\n").map((l, i) => (i === 0 ? l + ",load" : l + ",4")).join("\n"));
  assert.ok(rows.stops.every((s) => s.load === 4));
  const r = optimize({ depot: parsePoint(sampleDepot), stops: rows.stops }, { vehicles: 3, capacity: 16, startMinute: 480 });
  assert.equal(r.error, undefined);
  assert.equal(r.engine, "vrptw");
  assert.ok(r.best.loads.every((x) => x <= 16), r.best.loads.join(","));
  assert.equal(r.best.loads.reduce((a, b) => a + b, 0), 40);
  assert.equal(r.best.missing.length, 0);
});

test("the tool says which stops do not fit when the fleet is too small", () => {
  const rows = parseStops(sampleText().split("\n").map((l, i) => (i === 0 ? l + ",load" : l + ",4")).join("\n"));
  const r = optimize({ depot: parsePoint(sampleDepot), stops: rows.stops }, { vehicles: 2, capacity: 12, startMinute: 480 });
  assert.equal(r.best.missing.length, 4);
  assert.ok(r.warnings.some((w) => /left out/.test(w)));
  assert.match(optimize({ depot: parsePoint(sampleDepot), stops: rows.stops }, { capacity: 3 }).error, /more than one vehicle holds/);
});

test("on 60 stops and 4 drivers the engine never does worse than the old heuristic", () => {
  const r = rng(5);
  const lines = ["name,lat,lng,service_min"];
  for (let i = 0; i < 60; i++) lines.push(`S${i},${(39.6 + r() * 0.25).toFixed(4)},${(-105.1 + r() * 0.3).toFixed(4)},${10 + Math.floor(r() * 20)}`);
  const stops = parseStops(lines.join("\n")).stops;
  const res = optimize({ depot: parsePoint(sampleDepot), stops }, { vehicles: 4, startMinute: 480 });
  assert.equal(res.error, undefined);
  assert.ok(["vrptw", "local"].includes(res.engine));
  assert.equal(res.best.routes.flat().length, 60);
  const nodes = [parsePoint(sampleDepot), ...stops];
  const ctx = { nodes, ...buildMatrices(nodes, 1.3, 30), start: 480, back: true };
  const ids = stops.map((_, i) => i + 1);
  const score = (routes) => { const e = routes.map((r) => evaluateRoute(r, ctx).elapsed); return e.reduce((a, b) => a + b, 0) + 2 * Math.max(...e); };
  const old = score(solvePlan(ids, ctx, 4, { noVrptw: true }).routes);
  const now = score(solvePlan(ids, ctx, 4).routes);
  assert.ok(now <= old + 1e-9, `${now} > ${old}`);
});

test("the Solomon reader truncates distances to one decimal and re-scores a route file", async () => {
  const { parseVrplib, parseSol } = await import("./eval/solomon.mjs");
  const inst = parseVrplib(["NAME : T", "VEHICLES : 2", "CAPACITY : 10", "SERVICE_TIME : 5", "EDGE_WEIGHT_TYPE : EUC_2D",
    "NODE_COORD_SECTION", "1 0 0", "2 1 1", "3 3 0", "DEMAND_SECTION", "1 0", "2 4", "3 5",
    "TIME_WINDOW_SECTION", "1 0 100", "2 0 50", "3 0 50", "DEPOT_SECTION", "1", "-1", "EOF"].join("\n"));
  assert.equal(inst.n, 3);
  assert.equal(inst.dist[1], 1.4); // sqrt(2) = 1.414... cut, not rounded
  assert.deepEqual(inst.service, [0, 5, 5]);
  const sol = parseSol("Route #1: 1 2\nCost 6.6\n");
  const v = verify(inst, sol.routes);
  assert.ok(v.ok, v.errors.join("; "));
  assert.ok(Math.abs(v.distance - (1.4 + 2.2 + 3)) < 1e-9);
});
