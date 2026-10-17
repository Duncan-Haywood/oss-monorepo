import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, cleanItems, frontier, irr, npv, paybackYears, solve, toCsv, EXAMPLE_ITEMS, EXAMPLE_SHARED } from "./calc.mjs";

const P = (o) => ({ name: "p", cost: 1000, benefit: 300, years: 5, salvage: 0, group: "", must: false, ...o });

test("npv and irr agree: npv at the irr is zero", () => {
  const p = P({ salvage: 200 });
  const r = irr(p);
  assert.ok(r > 0);
  assert.ok(Math.abs(npv(p, r)) < 1e-6);
  assert.ok(npv(p, 0) > 0 && npv(p, r + 5) < 0);
});

test("a project that never earns its cost has no irr and no payback", () => {
  const p = P({ cost: 5000, benefit: 100 });
  assert.equal(irr(p), null);
  assert.equal(paybackYears(p), null);
});

test("payback is cost over yearly benefit when earned within its life", () => {
  assert.equal(paybackYears(P({ cost: 900, benefit: 300 })), 3);
});

// Independent oracle: enumerate with plain loops and compare to solve().
test("the chosen set beats every other feasible set (brute-force check)", () => {
  const projects = cleanItems(EXAMPLE_ITEMS).items;
  for (const budget of [15000, 30000, 35000, 52000, 80000, 200000]) {
    const s = solve(projects, 12, budget);
    let best = -Infinity;
    for (let m = 0; m < 1 << projects.length; m++) {
      const idx = projects.map((_, i) => i).filter((i) => m & (1 << i));
      if (!projects.every((p, i) => !p.must || m & (1 << i))) continue;
      const groups = idx.map((i) => projects[i].group).filter(Boolean);
      if (new Set(groups).size !== groups.length) continue;
      if (idx.reduce((t, i) => t + projects[i].cost, 0) > budget) continue;
      best = Math.max(best, idx.reduce((t, i) => t + npv(projects[i], 12), 0));
    }
    assert.ok(Math.abs(s.best.value - best) < 1e-6, `budget ${budget}`);
  }
});

test("at most one project per option group", () => {
  const a = analyze(EXAMPLE_ITEMS, { budget: 200000, discountPct: 12 });
  const vans = a.rows.filter((r) => r.group === "van" && r.chosen);
  assert.equal(vans.length, 1);
  assert.equal(vans[0].name, "New delivery van"); // higher npv of the two when both are affordable
});

test("must-do projects are always in the plan and eat the budget first", () => {
  const a = analyze(EXAMPLE_ITEMS, EXAMPLE_SHARED);
  assert.ok(a.rows.find((r) => r.name === "Walk-in cooler repair").chosen);
  const tooSmall = analyze(EXAMPLE_ITEMS, { budget: 5000, discountPct: 12 });
  assert.equal(tooSmall.ok, false);
  assert.match(tooSmall.warnings.join(" "), /must-do/);
});

test("projects with negative value are never chosen, however much budget", () => {
  const a = analyze([{ name: "bad", cost: 1000, annualBenefit: 100, years: 5 }, { name: "good", cost: 1000, annualBenefit: 400, years: 5 }], { budget: 10000, discountPct: 10 });
  assert.deepEqual(a.best.names, ["good"]);
  assert.deepEqual(a.negative, ["bad"]);
});

test("exact answer is never worse than either shortcut, and strictly better on the example", () => {
  const a = analyze(EXAMPLE_ITEMS, EXAMPLE_SHARED);
  assert.ok(a.best.value >= a.byPayback.value - 1e-9);
  assert.ok(a.best.value >= a.byIndex.value - 1e-9);
  assert.ok(a.shortcutLoss > 1000);
  assert.ok(a.byPayback.cost <= a.shared.budget && a.byIndex.cost <= a.shared.budget);
});

test("next budget step names a set that costs more and is worth more", () => {
  const a = analyze(EXAMPLE_ITEMS, EXAMPLE_SHARED);
  assert.ok(a.next.extraBudget > 0 && a.next.extraValue > 0);
  const fr = a.frontier;
  for (let i = 1; i < fr.length; i++) assert.ok(fr[i].cost > fr[i - 1].cost && fr[i].value > fr[i - 1].value);
});

test("a higher discount rate can change the answer, and sensitivity says so", () => {
  const a = analyze(EXAMPLE_ITEMS, EXAMPLE_SHARED);
  assert.equal(a.sensitivity.length, 2);
  assert.ok(a.fragile);
  assert.ok(a.sensitivity[1].value < a.sensitivity[0].value);
});

test("frontier keeps only sets that beat every cheaper set", () => {
  const f = frontier([{ cost: 1, value: 5 }, { cost: 2, value: 4 }, { cost: 3, value: 9 }, { cost: 3, value: 7 }]);
  assert.deepEqual(f.map((x) => [x.cost, x.value]), [[1, 5], [3, 9]]);
});

test("input handling: blank rows ignored, missing cost warned, no budget stops", () => {
  assert.equal(cleanItems([{}, { name: "x" }]).items.length, 0);
  const w = cleanItems([{ name: "free", annualBenefit: 500 }]);
  assert.equal(w.items.length, 0);
  assert.match(w.warnings[0], /free/);
  assert.equal(analyze(EXAMPLE_ITEMS, { budget: 0 }).ok, false);
  assert.equal(analyze([], EXAMPLE_SHARED).ok, false);
});

test("dollar signs, commas and yes/true strings are understood", () => {
  const { items } = cleanItems([{ name: "a", cost: "$12,500", annualBenefit: "3,000", years: "6", mustDo: "yes" }]);
  assert.equal(items[0].cost, 12500);
  assert.equal(items[0].years, 6);
  assert.equal(items[0].must, true);
});

test("csv has one row per project and quotes names", () => {
  const a = analyze(EXAMPLE_ITEMS, EXAMPLE_SHARED);
  const lines = toCsv(a).trim().split("\n");
  assert.equal(lines.length, a.rows.length + 1);
  assert.ok(lines[1].startsWith('"New delivery van"'));
});
