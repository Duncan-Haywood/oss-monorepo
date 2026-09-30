import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseStops, parsePoint, parseClock, haversineMiles, buildMatrices, evaluateRoute, solveExact, solveSingle,
  solvePlan, optimize, routeCsv, mapsLinks, sampleText, sampleDepot, fmtTime, MAX_STOPS,
} from "./calc.mjs";

function rand(seed) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function permutations(a) {
  if (a.length <= 1) return [a];
  return a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
}
function makeNodes(n, seed, windows = false) {
  const r = rand(seed);
  const nodes = [{ name: "D", lat: 40 + r() * 0.3, lng: -105 + r() * 0.3, service: 0, open: null, close: null }];
  for (let i = 0; i < n; i++) {
    const open = windows && r() < 0.5 ? 480 + Math.floor(r() * 240) : null;
    nodes.push({
      name: "S" + i, lat: 40 + r() * 0.3, lng: -105 + r() * 0.3, service: Math.floor(r() * 30),
      open, close: open !== null ? open + 60 + Math.floor(r() * 240) : null,
    });
  }
  return nodes;
}
const mkctx = (nodes, back = true) => ({ nodes, ...buildMatrices(nodes, 1.3, 30), start: 480, back });

test("clock parsing", () => {
  assert.equal(parseClock("9am"), 540);
  assert.equal(parseClock("9:30 PM"), 21 * 60 + 30);
  assert.equal(parseClock("13:05"), 785);
  assert.equal(parseClock("12am"), 0);
  assert.equal(parseClock(""), null);
  assert.ok(Number.isNaN(parseClock("noon")));
  assert.ok(Number.isNaN(parseClock("13pm")));
  assert.equal(fmtTime(540), "9:00 AM");
  assert.equal(fmtTime(1500), "1:00 AM +1d");
});

test("parseStops reads named and unnamed rows, header, windows", () => {
  const r = parseStops("name,lat,lng,service_min,open,close\nA,40,-105,20,9am,11:30\n40.1,-105.1\n# note\nB;40.2;-105.2;5");
  assert.equal(r.stops.length, 3);
  assert.deepEqual([r.stops[0].name, r.stops[0].service, r.stops[0].open, r.stops[0].close], ["A", 20, 540, 690]);
  assert.equal(r.stops[1].name, "Stop 2");
  assert.equal(r.stops[2].service, 5);
});

test("parseStops rejects bad rows with a line number", () => {
  assert.match(parseStops("A,40,-105\nB,95,10").error, /Line 2.*latitude/);
  assert.match(parseStops("A,40,-105\nhello").error, /Line 2/);
  assert.match(parseStops("A,40,-105,-5").error, /service minutes/);
  assert.match(parseStops("A,40,-105,5,11am,9am").error, /closes before/);
  assert.match(parseStops("A,40,-105,5,soon").error, /time window/);
});

test("parsePoint", () => {
  assert.deepEqual(parsePoint("39.7, -104.9").lat, 39.7);
  assert.equal(parsePoint("abc"), null);
  assert.equal(parsePoint("91,0"), null);
});

test("haversine: known distances and symmetry", () => {
  const nyc = { lat: 40.7128, lng: -74.006 }, la = { lat: 34.0522, lng: -118.2437 };
  const d = haversineMiles(nyc, la);
  assert.ok(d > 2440 && d < 2460, String(d));
  assert.equal(haversineMiles(nyc, nyc), 0);
  assert.ok(Math.abs(haversineMiles(nyc, la) - haversineMiles(la, nyc)) < 1e-9);
});

test("exact solver equals brute force on random problems, with and without windows", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const n = 4 + (seed % 3);
    const nodes = makeNodes(n, seed, seed % 2 === 0);
    const ctx = mkctx(nodes);
    const ids = [...Array(n).keys()].map((i) => i + 1);
    let bestElapsed = Infinity;
    for (const p of permutations(ids)) {
      const e = evaluateRoute(p, ctx);
      if (e.late === 0 && e.elapsed < bestElapsed) bestElapsed = e.elapsed;
    }
    const ex = solveExact(ids, ctx);
    if (bestElapsed === Infinity) assert.equal(ex, null, `seed ${seed} infeasible`);
    else {
      assert.ok(ex, `seed ${seed}`);
      const e = evaluateRoute(ex, ctx);
      assert.equal(e.late, 0);
      assert.ok(Math.abs(e.elapsed - bestElapsed) < 1e-6, `seed ${seed}: ${e.elapsed} vs ${bestElapsed}`);
    }
  }
});

test("heuristic stays within 5% of the exact optimum on 10-stop problems", () => {
  for (let seed = 30; seed < 36; seed++) {
    const nodes = makeNodes(10, seed);
    const ctx = mkctx(nodes);
    const ids = [...Array(10).keys()].map((i) => i + 1);
    const ex = evaluateRoute(solveSingle(ids, ctx).order, ctx).elapsed;
    const h = evaluateRoute(solveSingle(ids, ctx, { forceHeuristic: true }).order, ctx).elapsed;
    assert.ok(h >= ex - 1e-6);
    assert.ok(h <= ex * 1.05, `seed ${seed}: heuristic ${h} vs exact ${ex}`);
  }
});

test("open-ended routes (no return) never cost more than round trips", () => {
  const nodes = makeNodes(7, 5);
  const ids = [1, 2, 3, 4, 5, 6, 7];
  const a = evaluateRoute(solveExact(ids, mkctx(nodes, true)), mkctx(nodes, true)).elapsed;
  const b = evaluateRoute(solveExact(ids, mkctx(nodes, false)), mkctx(nodes, false)).elapsed;
  assert.ok(b <= a + 1e-9);
});

test("waiting for a window to open is counted, and lateness is reported", () => {
  const nodes = [
    { name: "D", lat: 40, lng: -105, service: 0, open: null, close: null },
    { name: "A", lat: 40.01, lng: -105, service: 10, open: 600, close: 700 },
  ];
  const ctx = mkctx(nodes);
  const e = evaluateRoute([1], ctx);
  assert.ok(e.wait > 0);
  assert.equal(e.visits[0].begin, 600);
  const tight = mkctx([nodes[0], { ...nodes[1], open: null, close: 481 }]);
  assert.ok(evaluateRoute([1], tight).late > 0);
});

test("optimize beats or ties the listed order and reports savings", () => {
  const { stops } = parseStops(sampleText());
  const r = optimize({ depot: parsePoint(sampleDepot), stops }, { mpg: 20, fuelPrice: 4, wage: 25, daysPerYear: 250 });
  assert.ok(!r.error);
  assert.ok(r.exact);
  assert.ok(r.best.elapsed <= r.listed.elapsed + 1e-9);
  assert.equal(r.best.lateStops, 0);
  assert.ok(r.saveMiles >= 0 && r.saveCost >= 0);
  assert.ok(r.windowCost && r.windowCost.elapsed >= 0);
  assert.ok(Math.abs(r.saveYear - r.saveCost * 250) < 1e-6);
  assert.equal(new Set(r.best.routes[0]).size, stops.length);
});

test("a large problem runs the heuristic, visits every stop once, and is no worse than the listed order", () => {
  const nodes = makeNodes(60, 9);
  const stops = nodes.slice(1);
  const r = optimize({ depot: nodes[0], stops }, {});
  assert.equal(r.exact, false);
  assert.deepEqual(r.best.routes[0].slice().sort((a, b) => a - b), stops.map((_, i) => i + 1));
  assert.ok(r.best.elapsed < r.listed.elapsed);
});

test("multiple drivers partition the stops and shorten the longest day", () => {
  const nodes = makeNodes(24, 3);
  const stops = nodes.slice(1);
  const one = optimize({ depot: nodes[0], stops }, { vehicles: 1 });
  const three = optimize({ depot: nodes[0], stops }, { vehicles: 3 });
  const all = three.best.routes.flat().sort((a, b) => a - b);
  assert.deepEqual(all, stops.map((_, i) => i + 1));
  assert.equal(three.best.routes.length, 3);
  assert.ok(three.best.longest < one.best.longest);
});

test("a second driver can rescue windows one driver cannot meet", () => {
  const nodes = [
    { name: "D", lat: 40, lng: -105, service: 0, open: null, close: null },
    { name: "N", lat: 40.2, lng: -105, service: 60, open: 520, close: 560 },
    { name: "S", lat: 39.8, lng: -105, service: 60, open: 520, close: 560 },
  ];
  const stops = nodes.slice(1);
  const solo = optimize({ depot: nodes[0], stops }, { vehicles: 1 });
  const duo = optimize({ depot: nodes[0], stops }, { vehicles: 2 });
  assert.ok(solo.best.lateStops > 0);
  assert.equal(duo.best.lateStops, 0);
});

test("input validation", () => {
  const d = parsePoint("40,-105");
  const s = parseStops("A,40.1,-105\nB,40.2,-105").stops;
  assert.match(optimize({ depot: null, stops: s }).error, /depot/);
  assert.match(optimize({ depot: d, stops: [s[0]] }).error, /two stops/);
  assert.match(optimize({ depot: d, stops: s }, { mph: 0 }).error, /speed/);
  assert.match(optimize({ depot: d, stops: s }, { circuity: 0.5 }).error, /factor/);
  assert.match(optimize({ depot: d, stops: s }, { vehicles: 0 }).error, /Drivers/);
  assert.match(optimize({ depot: d, stops: s }, { wage: -1 }).error, /Cost/);
  const many = Array.from({ length: MAX_STOPS + 1 }, (_, i) => ({ ...s[0], name: "x" + i }));
  assert.match(optimize({ depot: d, stops: many }).error, /up to 200/);
});

test("CSV has one row per stop and quotes names; map links chunk long routes", () => {
  const nodes = makeNodes(14, 2);
  nodes[1].name = 'Bob "the" Builder, Inc';
  const r = optimize({ depot: nodes[0], stops: nodes.slice(1) }, {});
  const csv = routeCsv(r);
  assert.equal(csv.trim().split("\n").length, 15);
  assert.match(csv, /"Bob ""the"" Builder, Inc"/);
  const links = mapsLinks(r, 0);
  assert.equal(links.length, 2);
  for (const l of links) {
    assert.match(l, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&origin=/);
    assert.ok((l.match(/\|/g) || []).length <= 7);
  }
});
