import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyze, normalize, optimize, poissonTable, evenSplit, simulateInterval, toCsv, num,
  EXAMPLE_SHARED, EXAMPLE_PRODUCTS, PRODUCT_DEFAULTS,
} from "./calc.mjs";

const prod = (o) => ({ ...PRODUCT_DEFAULTS, perishable: "no", minCoils: "0", maxCoils: "10", now: "0", ...o });
const SH = { coils: "7", visitDays: "7", visitCost: "0", substitutionPct: "0" };

test("E[min(D,q)] matches a direct Poisson sum and is capped by the mean", () => {
  const lam = 6.5, t = poissonTable(lam);
  let p = Math.exp(-lam), direct = 0;
  for (let j = 0; j < 40; j++) {
    if (j > 0) p *= lam / j;
    direct += p * Math.min(j, 9);
  }
  assert.ok(Math.abs(t.em(9) - direct) < 1e-9);
  assert.ok(Math.abs(t.em(500) - lam) < 1e-6);
  assert.equal(t.em(0), 0);
});

test("optimiser equals brute force on a small machine", () => {
  const rows = [
    prod({ name: "a", price: "2", cost: "1", weekly: "40", perCoil: "8", maxCoils: "4" }),
    prod({ name: "b", price: "3", cost: "1", weekly: "12", perCoil: "6", maxCoils: "4", perishable: "yes" }),
    prod({ name: "c", price: "1.5", cost: "1", weekly: "25", perCoil: "10", maxCoils: "3", minCoils: "1" }),
  ];
  const n = normalize(rows, SH);
  const tables = n.products.map((p) => poissonTable(p.weekly));
  const opt = optimize(n.products, tables, 7);
  let best = -Infinity;
  for (let x = 0; x <= 4; x++) for (let y = 0; y <= 4; y++) for (let z = 1; z <= 3; z++) {
    if (x + y + z > 7) continue;
    const v = [x, y, z].reduce((s, k, i) => {
      if (k === 0) return s;
      const p = n.products[i], Q = k * p.perCoil, sold = tables[i].em(Q);
      return s + (p.price - p.cost) * sold - (p.perishable ? p.cost * (Q - sold) : 0);
    }, 0);
    best = Math.max(best, v);
  }
  assert.ok(Math.abs(opt.best - best) < 1e-9, `${opt.best} vs ${best}`);
  assert.ok(opt.alloc[2] >= 1 && opt.alloc.reduce((a, b) => a + b, 0) <= 7);
});

test("a product that loses money per sale gets nothing unless a minimum forces it", () => {
  const rows = [prod({ name: "good", price: "2", cost: "1", weekly: "50", perCoil: "10" }), prod({ name: "bad", price: "1", cost: "1.4", weekly: "50", perCoil: "10" })];
  const a = analyze(rows, { ...SH, coils: "6" });
  assert.equal(a.ok, true);
  assert.equal(a.rows[1].coils, 0);
  assert.ok(a.warnings.some((w) => /not above cost/.test(w)));
});

test("example: recommendation beats today's layout, with a gain larger than its noise", () => {
  const a = analyze(EXAMPLE_PRODUCTS, EXAMPLE_SHARED);
  assert.equal(a.ok, true);
  assert.ok(a.rec.alloc.reduce((x, y) => x + y, 0) <= 36);
  assert.ok(a.deltaWeekly > 0 && a.significant, `${a.deltaWeekly} ± ${a.deltaSe}`);
  assert.ok(a.rec.missedPerWeek < a.cur.missedPerWeek);
  const by = Object.fromEntries(a.rows.map((r) => [r.name, r.coils]));
  assert.ok(by["Potato chips"] > by["Trail mix"]);
});

test("the same inputs give the same answer", () => {
  const a = analyze(EXAMPLE_PRODUCTS, EXAMPLE_SHARED), b = analyze(EXAMPLE_PRODUCTS, EXAMPLE_SHARED);
  assert.equal(a.deltaWeekly, b.deltaWeekly);
  assert.deepEqual(a.rec.alloc, b.rec.alloc);
});

test("with no substitution the simulated plan agrees with the exact expectation", () => {
  const a = analyze(EXAMPLE_PRODUCTS, { ...EXAMPLE_SHARED, substitutionPct: "0" }, { nSim: 6000 });
  assert.ok(Math.abs(a.rec.weeklyGross - a.rec.analyticGross) / a.rec.analyticGross < 0.02, `${a.rec.weeklyGross} vs ${a.rec.analyticGross}`);
});

test("substitution moves unmet demand only into stock that exists", () => {
  const rows = [prod({ name: "a", price: "2", cost: "1", weekly: "10", perCoil: "5" }), prod({ name: "b", price: "2", cost: "1", weekly: "10", perCoil: "5" })];
  const { products } = normalize(rows, { ...SH, coils: "4", substitutionPct: "100" });
  // a holds 5 units against demand 12 (7 unmet); b holds 15 against demand 4 (11 spare)
  assert.equal(simulateInterval(products, [1, 3], [12, 4], 1).profit, 5 + 11);
  assert.equal(simulateInterval(products, [1, 3], [12, 4], 0).profit, 5 + 4);
  // nothing spare: unmet demand is lost
  assert.equal(simulateInterval(products, [1, 1], [12, 12], 1).profit, 10);
});

test("min and max coils are respected and an impossible set is reported", () => {
  const rows = [prod({ name: "a", price: "2", cost: "1", weekly: "100", perCoil: "5", maxCoils: "3" }), prod({ name: "b", price: "2", cost: "1", weekly: "5", perCoil: "5", minCoils: "2" })];
  const a = analyze(rows, { ...SH, coils: "8" });
  assert.equal(a.rows[0].coils, 3);
  assert.ok(a.rows[1].coils >= 2);
  const bad = analyze([prod({ name: "a", price: "2", cost: "1", weekly: "5", perCoil: "5", minCoils: "5" })], { ...SH, coils: "3" });
  assert.equal(bad.ok, false);
});

test("a costlier visit pushes the best restocking gap out, never in", () => {
  const cheap = analyze(EXAMPLE_PRODUCTS, { ...EXAMPLE_SHARED, visitCost: "0" });
  const dear = analyze(EXAMPLE_PRODUCTS, { ...EXAMPLE_SHARED, visitCost: "120" });
  assert.ok(cheap.bestInterval.days <= dear.bestInterval.days);
});

test("an extra coil is worth no less than nothing and a lost coil costs no less than nothing", () => {
  const a = analyze(EXAMPLE_PRODUCTS, EXAMPLE_SHARED);
  assert.ok(a.extraCoil >= -1e-9);
  assert.ok(a.fewerCoil >= -1e-9);
});

test("bad input is reported, not computed", () => {
  assert.equal(analyze([], SH).ok, false);
  assert.equal(analyze(EXAMPLE_PRODUCTS, { ...EXAMPLE_SHARED, coils: "0" }).ok, false);
  assert.equal(analyze(EXAMPLE_PRODUCTS, { ...EXAMPLE_SHARED, visitDays: "" }).ok, false);
});

test("num tolerates $, commas and percent signs; evenSplit fills the machine", () => {
  assert.equal(num("$1,250.50"), 1250.5);
  assert.equal(num("30%"), 30);
  assert.equal(num("abc"), null);
  const n = normalize(EXAMPLE_PRODUCTS, EXAMPLE_SHARED);
  assert.equal(evenSplit(n.products, 36).reduce((a, b) => a + b, 0), 36);
});

test("csv has a header and one row per product", () => {
  const a = analyze(EXAMPLE_PRODUCTS, EXAMPLE_SHARED);
  const lines = toCsv(a).trim().split("\n");
  assert.equal(lines.length, 1 + EXAMPLE_PRODUCTS.length);
  assert.match(lines[0], /^product,coils_now/);
});
