import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseResources, parseProducts, simplex, analyze, evaluatePlan, reportCsv, sampleResources, sampleProducts, money, money2,
} from "./calc.mjs";

const res = (name, cap, otMax = 0, otCost = 0) => ({ name, cap, otMax, otCost });
const prod = (name, price, cost, use, extra = {}) => ({ name, price, cost, margin: price - cost, min: 0, max: Infinity, batch: 1, use, ...extra });

test("simplex solves the textbook problem max 3x+5y, x<=4, 2y<=12, 3x+2y<=18 (optimum 36 at 2, 6)", () => {
  const r = simplex([3, 5], [{ a: [1, 0], rel: "<=", b: 4 }, { a: [0, 2], rel: "<=", b: 12 }, { a: [3, 2], rel: "<=", b: 18 }]);
  assert.equal(r.status, "optimal");
  assert.ok(Math.abs(r.value - 36) < 1e-9);
  assert.ok(Math.abs(r.x[0] - 2) < 1e-9 && Math.abs(r.x[1] - 6) < 1e-9);
});

test("simplex detects infeasible and unbounded problems, and handles >= rows", () => {
  assert.equal(simplex([1], [{ a: [1], rel: "<=", b: 2 }, { a: [1], rel: ">=", b: 5 }]).status, "infeasible");
  assert.equal(simplex([1, 1], [{ a: [1, -1], rel: "<=", b: 1 }]).status, "unbounded");
  const r = simplex([-1, -1], [{ a: [1, 1], rel: ">=", b: 4 }, { a: [1, 0], rel: "<=", b: 3 }]); // min x+y s.t. x+y>=4
  assert.equal(r.status, "optimal");
  assert.ok(Math.abs(r.value + 4) < 1e-9);
});

test("simplex survives a degenerate problem (Beale-style cycling example) without looping", () => {
  const r = simplex([0.75, -150, 0.02, -6], [
    { a: [0.25, -60, -0.04, 9], rel: "<=", b: 0 },
    { a: [0.5, -90, -0.02, 3], rel: "<=", b: 0 },
    { a: [0, 0, 1, 0], rel: "<=", b: 1 },
  ]);
  assert.equal(r.status, "optimal");
  assert.ok(Math.abs(r.value - 0.05) < 1e-9);
});

test("parsers read resources with optional overtime and products with batch and usage columns", () => {
  const r = parseResources("name,cap\nOven hours, 30, 4, 22\nMixer, 20\nbad");
  assert.equal(r.rows.length, 2);
  assert.deepEqual([r.rows[0].cap, r.rows[0].otMax, r.rows[0].otCost], [30, 4, 22]);
  assert.equal(r.rows[1].otMax, 0);
  assert.match(r.warnings.join(" "), /1 resource line skipped/);
  const p = parseProducts("n,p,c\nLoaf, 7.5, 2.1, 40, 220, 1, 0.1, 0.05\nTray, 3.8, 1, , , 12, 0.05, 0.03\nBad, x, 1", 2);
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[0].min, 40);
  assert.equal(p.rows[1].max, Infinity);
  assert.equal(p.rows[1].batch, 12);
  assert.deepEqual(p.rows[0].use, [0.1, 0.05]);
  assert.ok(Math.abs(p.rows[0].margin - 5.4) < 1e-12);
  assert.match(p.warnings.join(" "), /1 product line skipped/);
  assert.equal(parseResources("Oven, 30, 4").warnings.length, 1);
});

test("a margin-per-unit trap: the high-margin product loses to two smaller ones once the shared resource is counted", () => {
  // 10 hours. A earns 30 and takes 5h ($6/h); B earns 10 and takes 1h ($10/h); B demand capped at 8.
  const r = analyze([prod("A", 40, 10, [5]), prod("B", 15, 5, [1], { max: 8 })], [res("hours", 10)], {});
  const [a, b] = r.plan.lines;
  assert.equal(b.units, 8);
  assert.equal(a.units, 0); // 2 hours left cannot make an A
  assert.equal(r.plan.profit, 80);
  // Filling the highest margin per unit first makes two A (10 hours, $60) and nothing else.
  assert.equal(r.rules.byMargin.profit, 60);
});

test("integer batches matter: the plan is a whole number of trays even when the continuous optimum is not", () => {
  const r = analyze([prod("Tray", 10, 2, [3], { batch: 12 })], [res("hours", 100)], {});
  // 1 tray (12 units) needs 36 hours; 100/36 = 2.77 trays -> 2 trays.
  assert.equal(r.plan.lines[0].batches, 2);
  assert.equal(r.plan.lines[0].units, 24);
  assert.equal(r.plan.profit, 24 * 8);
  assert.ok(r.solver.gap > 0 && r.solver.exact);
});

test("minimum quantities are honoured, and unreachable minimums are reported as infeasible", () => {
  const ok = analyze([prod("A", 10, 9, [1], { min: 5 }), prod("B", 20, 10, [1])], [res("h", 10)], {});
  assert.ok(ok.plan.lines[0].units >= 5);
  assert.equal(ok.plan.lines[1].units, 5);
  const bad = analyze([prod("A", 10, 9, [1], { min: 50 })], [res("h", 10)], {});
  assert.equal(bad.infeasible, true);
  assert.match(bad.verdict, /No plan meets your minimum/);
  // Overtime can rescue the same minimum.
  const rescued = analyze([prod("A", 10, 1, [1], { min: 12 })], [res("h", 10, 5, 2)], {});
  assert.equal(rescued.plan.lines[0].units, 15);
  assert.equal(rescued.plan.resources[0].overtime, 5);
});

test("overtime is bought only when its cost is below the margin it unlocks", () => {
  const cheap = analyze([prod("A", 10, 4, [1], { max: 20 })], [res("h", 10, 10, 2)], {});
  assert.equal(cheap.plan.lines[0].units, 20); // margin 6 per hour beats overtime at 2
  assert.equal(cheap.plan.overtimeCost, 20);
  assert.equal(cheap.plan.profit, 20 * 6 - 20);
  const dear = analyze([prod("A", 10, 4, [1], { max: 20 })], [res("h", 10, 10, 9)], {});
  assert.equal(dear.plan.lines[0].units, 10); // margin 6 < overtime 9
  assert.equal(dear.plan.overtimeCost, 0);
});

test("shadow price: with one binding resource it equals the margin per unit of the product that uses it", () => {
  const r = analyze([prod("A", 20, 10, [2])], [res("h", 40)], {});
  assert.ok(Math.abs(r.plan.resources[0].shadow - 5) < 1e-4); // $10 margin / 2 h
  assert.ok(r.plan.resources[0].binding);
  assert.ok(r.plan.resources[0].shadowRange > 0);
});

test("a slack resource has a zero shadow price and the verdict says demand is the limit", () => {
  const r = analyze([prod("A", 20, 10, [1], { max: 5 })], [res("h", 100)], {});
  assert.equal(r.plan.resources[0].shadow, 0);
  assert.match(r.verdict, /demand, not capacity, limits you/);
});

test("shadow price range: the value holds until demand caps the product", () => {
  // 40 h, 2 h per unit, demand cap 25 units (50 h). Extra hours help until 50 h are available.
  const r = analyze([prod("A", 20, 10, [2], { max: 25 })], [res("h", 40)], {});
  assert.ok(Math.abs(r.plan.resources[0].shadow - 5) < 1e-4);
  assert.ok(Math.abs(r.plan.resources[0].shadowRange - 10) < 1e-3);
});

test("strong duality on a bounded-free problem: profit equals the sum of shadow price times capacity", () => {
  const r = analyze([prod("A", 12, 4, [2, 1]), prod("B", 9, 3, [1, 3])], [res("m1", 100), res("m2", 90)], {});
  const dual = r.plan.resources.reduce((s, x) => s + x.shadow * x.cap, 0);
  assert.ok(Math.abs(dual - r.solver.lpBound) < 1e-3, `${dual} vs ${r.solver.lpBound}`);
});

test("opportunity cost per unit turns a high margin into a negative net for products that crowd out better ones", () => {
  const r = analyze([prod("Cake", 50, 10, [4], { max: 10 }), prod("Bun", 5, 1, [0.2], { max: 1000 })], [res("oven", 40)], {});
  const cake = r.plan.lines[0], bun = r.plan.lines[1];
  assert.equal(cake.units, 0);
  assert.ok(cake.unitMargin === 40 && cake.netUnit < 0);
  assert.equal(bun.units, 200);
  assert.ok(Math.abs(bun.oppCost - 4) < 1e-3 && Math.abs(bun.netUnit) < 1e-3);
});

test("the plan always satisfies capacity (with overtime) and bounds, on random problems", () => {
  let seed = 11;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let t = 0; t < 25; t++) {
    const nR = 1 + Math.floor(rnd() * 3), nP = 2 + Math.floor(rnd() * 5);
    const R = Array.from({ length: nR }, (_, j) => res(`r${j}`, 20 + Math.floor(rnd() * 80), rnd() < 0.5 ? Math.floor(rnd() * 20) : 0, 1 + Math.floor(rnd() * 5)));
    const P = Array.from({ length: nP }, (_, i) => prod(`p${i}`, 5 + Math.floor(rnd() * 30), 1 + Math.floor(rnd() * 8), R.map(() => Math.round(rnd() * 40) / 10 + 0.1), {
      batch: rnd() < 0.3 ? 1 + Math.floor(rnd() * 6) : 1, max: 5 + Math.floor(rnd() * 60), min: 0,
    }));
    const r = analyze(P, R, {});
    assert.ok(!r.infeasible && !r.error, `case ${t}`);
    const ev = evaluatePlan({ P, R }, r.plan.lines.map((l) => l.batches));
    assert.ok(ev.feasible, `case ${t} capacity`);
    r.plan.lines.forEach((l, i) => { assert.ok(l.units <= P[i].max + 1e-9); assert.equal(l.units % P[i].batch, 0); });
    assert.ok(Math.abs(ev.profit - r.plan.profit) < 1e-6);
    assert.ok(r.plan.profit <= r.solver.lpBound + 1e-6);
    // never worse than either rule of thumb
    assert.ok(r.plan.profit >= r.rules.byMargin.profit - 1e-6, `case ${t} vs margin rule`);
    assert.ok(r.plan.profit >= r.rules.byTight.profit - 1e-6, `case ${t} vs tight rule`);
  }
});

test("branch and bound matches brute force on a small integer problem", () => {
  const P = [prod("A", 13, 3, [4, 1], { max: 6 }), prod("B", 9, 2, [1, 5], { max: 6 }), prod("C", 7, 1, [2, 2], { max: 6 })];
  const R = [res("x", 17), res("y", 19)];
  let best = -1;
  for (let a = 0; a <= 6; a++) for (let b = 0; b <= 6; b++) for (let c = 0; c <= 6; c++) {
    const ev = evaluatePlan({ P, R }, [a, b, c]);
    if (ev.feasible) best = Math.max(best, ev.profit);
  }
  const r = analyze(P, R, {});
  assert.equal(r.plan.profit, best);
  assert.equal(r.solver.exact, true);
});

test("unbounded and degenerate inputs give a clear message", () => {
  assert.match(analyze([prod("Free", 5, 1, [0])], [res("h", 10)], {}).error, /unlimited/);
  assert.match(analyze([], [res("h", 1)], {}).error, /product line/);
  assert.match(analyze([prod("A", 1, 0, [1])], [], {}).error, /resource/);
});

test("fixed costs only change the headline, not the plan", () => {
  const a = analyze([prod("A", 20, 10, [2])], [res("h", 40)], {});
  const b = analyze([prod("A", 20, 10, [2])], [res("h", 40)], { fixedCost: 50 });
  assert.equal(b.plan.netProfit, a.plan.profit - 50);
  assert.deepEqual(a.plan.lines.map((l) => l.units), b.plan.lines.map((l) => l.units));
});

test("the sample bakery: labour is the bottleneck and the high-margin custom cake is not worth baking", () => {
  const R = parseResources(sampleResources()), P = parseProducts(sampleProducts(), R.rows.length);
  assert.equal(R.warnings.length + P.warnings.length, 0);
  const r = analyze(P.rows, R.rows, { fixedCost: 600 });
  assert.ok(r.solver.exact);
  const labour = r.plan.resources.find((x) => x.name === "Labour hours");
  const oven = r.plan.resources.find((x) => x.name === "Oven hours");
  assert.ok(labour.shadow > oven.shadow && labour.shadow > 20);
  const cake = r.plan.lines.find((l) => l.name === "Custom cake");
  assert.equal(cake.units, 0);
  assert.ok(cake.unitMargin > 30 && cake.netUnit < 0);
  assert.ok(r.plan.profit > Math.max(r.rules.byMargin.profit, r.rules.byTight.profit));
  assert.match(r.verdict, /Limiting: Labour hours/);
  const csv = reportCsv(r).split("\n");
  assert.equal(csv[0].split(",")[0], "product");
  assert.equal(csv.length, 1 + 6 + 1 + 1 + 3);
});

test("money formatting", () => {
  assert.equal(money(1234.4), "$1,234");
  assert.equal(money(-5), "-$5");
  assert.equal(money2(8.428), "$8.43");
});
