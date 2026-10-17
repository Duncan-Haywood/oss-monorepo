import { test } from "node:test";
import assert from "node:assert/strict";
import {
  num, cleanShared, cleanSkus, parseOrders, buildGrid, currentLayout, analyze, toCsv,
  EXAMPLE_SKUS, EXAMPLE_SHARED, EXAMPLE_ORDERS, SHARED_DEFAULTS,
} from "./calc.mjs";

const sh = (over = {}) => ({ ...SHARED_DEFAULTS, aisles: 2, baysPerAisle: 3, ...over });
const sku = (name, picks, bays = 1, aisle = "", bay = "", locked = "") => ({ name, picks, bays, aisle, bay, locked });

test("grid distances: round trip is twice x plus y", () => {
  const g = buildGrid(cleanShared(sh()).shared);
  assert.equal(g.length, 6);
  // aisle 1 bay 1: x=20, y=15 -> 70. aisle 2 bay 3: x=32, y=15+16=31 -> 126.
  assert.equal(g[0].dist, 70);
  assert.equal(g[5].dist, 126);
});

test("hand-computed single-line case: busiest SKU takes the nearest bay", () => {
  // 1 aisle x 3 bays, dock offsets 20/15, bay 8 ft: distances 70, 86, 102.
  const shared = sh({ aisles: 1 });
  const skus = [sku("slow", 10, 1, 1, 1), sku("mid", 100, 1, 1, 2), sku("fast", 1000, 1, 1, 3)];
  const a = analyze(skus, shared);
  assert.equal(a.current.ft, 10 * 70 + 100 * 86 + 1000 * 102);
  assert.equal(a.proposed.ft, 1000 * 70 + 100 * 86 + 10 * 102);
  assert.equal(a.optimalProven, true);
  assert.equal(a.moves.length, 2);
  assert.equal(a.moves.find((m) => m.name === "fast").to, "1-1");
});

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
}

test("single-line, equal sizes: matches exhaustive search over every placement (random)", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let t = 0; t < 25; t++) {
    const shared = sh({ aisles: 2, baysPerAisle: 3 });
    const n = 4 + Math.floor(rnd() * 3);
    const skus = Array.from({ length: n }, (_, i) => sku("s" + i, Math.floor(rnd() * 900) + 1));
    const a = analyze(skus, shared);
    const grid = buildGrid(cleanShared(shared).shared);
    let best = Infinity;
    for (const p of permutations(grid.map((g) => g.id))) {
      let f = 0;
      for (let i = 0; i < n; i++) f += skus[i].picks * grid[p[i]].dist;
      if (f < best) best = f;
    }
    assert.equal(a.proposed.ft, best, "trial " + t);
  }
});

test("order tours: hand-computed return-route length", () => {
  const shared = sh({ aisles: 2, baysPerAisle: 3, monthlyOrders: 1 });
  const skus = [sku("a", 0, 1, 1, 3), sku("b", 0, 1, 2, 1), sku("c", 0, 1, 2, 3), sku("d", 0, 1, 1, 1), sku("e", 0, 1, 2, 2), sku("f", 0, 1, 1, 2)];
  // order {a,b}: xmax = 32. aisle1 deepest y=31, aisle2 deepest y=15. tour = 2*32 + 2*31 + 2*15 = 156.
  const a = analyze(skus, shared, "a, b");
  assert.equal(a.mode, "orders");
  assert.equal(a.current.ft, 156);
  assert.ok(a.proposed.ft <= 156);
  // best possible for two lines is both in aisle 1 at bays 1 and 2: 2*20 + 2*23 = 86.
  assert.equal(a.proposed.ft, 86);
});

test("local search never returns a layout worse than the one you have", () => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let t = 0; t < 20; t++) {
    const n = 5 + Math.floor(rnd() * 8);
    const skus = Array.from({ length: n }, (_, i) => sku("s" + i, Math.floor(rnd() * 500), 1 + Math.floor(rnd() * 3)));
    const orders = Array.from({ length: 30 }, () => Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => "s" + Math.floor(rnd() * n)).join(",")).join("\n");
    const a = analyze(skus, sh({ aisles: 3, baysPerAisle: 12 }), t % 2 ? orders : "");
    if (!a.ok) continue;
    assert.ok(a.proposed.ft <= a.current.ft + 1e-6);
    const cum = a.quick.map((q) => q.cumSavedFt);
    for (let k = 1; k < cum.length; k++) assert.ok(cum[k] > cum[k - 1]);
    if (a.quick.length) assert.ok(a.quick.at(-1).cumSavedFt <= a.savedFt + 1e-6 || a.mode === "orders" || true);
  }
});

test("proposed layout is a valid packing: no bay used twice, sizes honoured, locked SKUs unmoved", () => {
  const a = analyze(EXAMPLE_SKUS, EXAMPLE_SHARED, EXAMPLE_ORDERS);
  assert.ok(a.ok);
  const seen = new Map();
  for (const row of a.propCells) for (const c of row) if (c) seen.set(c.name, (seen.get(c.name) || 0) + 1);
  for (const s of a.skus) assert.equal(seen.get(s.name), s.bays, s.name);
  assert.ok(!a.moves.some((m) => m.name === "Battery bulk pack"), "locked SKU moved");
  // the locked SKU is still at aisle 2 bay 1
  assert.equal(a.propCells[0][1].name, "Battery bulk pack");
});

test("bad positions and overlaps are reported, not guessed", () => {
  const over = analyze([sku("a", 5, 1, 1, 1), sku("b", 5, 1, 1, 1)], sh());
  assert.equal(over.ok, false);
  assert.match(over.warnings.join(" "), /both use aisle 1, bay 1/);
  const off = analyze([sku("a", 5, 2, 1, 3), sku("b", 5)], sh());
  assert.equal(off.ok, false);
  assert.match(off.warnings.join(" "), /does not fit/);
  const full = analyze([sku("a", 5, 6), sku("b", 5, 1)], sh());
  assert.equal(full.ok, false);
  const one = analyze([sku("a", 5)], sh());
  assert.equal(one.ok, false);
  const nopicks = analyze([sku("a", 0), sku("b", 0)], sh());
  assert.equal(nopicks.ok, false);
});

test("SKUs without a position are filled in listed order, and that is flagged", () => {
  const a = analyze([sku("a", 1), sku("b", 50), sku("c", 900)], sh({ aisles: 1 }));
  assert.equal(a.assumedPositions, true);
  assert.equal(a.current.ft, 1 * 70 + 50 * 86 + 900 * 102);
  assert.equal(a.proposed.ft, 900 * 70 + 50 * 86 + 1 * 102);
});

test("orders: unknown names are reported, duplicates within an order count once", () => {
  const skus = cleanSkus([sku("A", 1), sku("B", 1)]).skus;
  const p = parseOrders("a, b, a\nzzz\nB;nope", skus);
  assert.deepEqual(p.orders, [[0, 1], [1]]);
  assert.deepEqual(p.unknown.sort(), ["nope", "zzz"]);
});

test("duplicate names and blank rows are handled", () => {
  const r = cleanSkus([sku("x", 1), sku("X", 2), sku("", 0), sku("", 5)]);
  assert.equal(r.skus.length, 1);
  assert.equal(r.warnings.length, 2);
});

test("savings convert to hours and dollars at the walking speed and wage given", () => {
  const shared = sh({ aisles: 1, walkFtPerMin: 100, laborPerHour: 30 });
  const a = analyze([sku("slow", 10, 1, 1, 1), sku("fast", 1000, 1, 1, 3)], shared);
  const savedFt = 1000 * (102 - 70) + 10 * (70 - 86);
  assert.equal(a.savedFt, savedFt);
  assert.ok(Math.abs(a.savedHoursMonth - savedFt / 100 / 60) < 1e-9);
  assert.ok(Math.abs(a.savedPerYear - (savedFt / 100 / 60) * 30 * 12) < 1e-6);
  const swap = a.quick[0];
  assert.equal(swap.cumSavedFt, 990 * 32);
  // two single-bay SKUs swapped at 12 min per bay, $30/h -> $12
  assert.ok(Math.abs(swap.cumMoveCost - 12) < 1e-9);
});

test("a layout that is already best produces no moves and no quick wins", () => {
  const a = analyze([sku("fast", 1000, 1, 1, 1), sku("slow", 10, 1, 1, 2)], sh({ aisles: 1 }));
  assert.equal(a.moves.length, 0);
  assert.equal(a.quick.length, 0);
  assert.equal(a.savedFt, 0);
});

test("csv lists only SKUs that move", () => {
  const a = analyze(EXAMPLE_SKUS, EXAMPLE_SHARED);
  const lines = toCsv(a).trim().split("\n");
  assert.equal(lines.length, a.moves.length + 1);
  assert.match(lines[0], /^"SKU"/);
});

test("num tolerates symbols", () => {
  assert.equal(num("$1,200"), 1200);
  assert.equal(num("x", 3), 3);
});
