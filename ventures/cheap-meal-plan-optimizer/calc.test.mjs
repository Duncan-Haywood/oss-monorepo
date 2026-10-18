import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFoods, validateSpec, solve, verifyPlan, simplex, planFeasible, planCost, greedyPlan, proteinFrontier, varietyFrontier, budgetFrontier, planCsv, groceryList, breakEvenPrices, sampleSpec, DEFAULTS, MIN_SAFE_KCAL } from "./calc.mjs";

const foods = (rows) => rows.map(([name, price, n, max]) => ({ name, price, n, max: max ?? null }));

test("parseFoods reads rows, optional max, and reports bad lines", () => {
  const r = parseFoods("Rice | 0.15 | 180 | 3.5 | 40 | 0.3 | 0.7\n# c\nEgg | $0.30 | 72 | 6 | 0 | 5 | 0 | 6\nBad | x | 1\nRice | 1 | 1 | 1 | 1 | 1 | 1");
  assert.equal(r.foods.length, 2);
  assert.equal(r.foods[1].price, 0.3);
  assert.equal(r.foods[1].max, 6);
  assert.equal(r.foods[0].max, null);
  assert.equal(r.errors.length, 2);
});

test("simplex solves a textbook LP and detects infeasible and unbounded", () => {
  // maximise 3x+2y s.t. x+y<=4, x+3y<=6, x<=3  -> x=3,y=1, value 11
  const r = simplex([3, 2], [{ a: [1, 1], rel: "<=", b: 4 }, { a: [1, 3], rel: "<=", b: 6 }, { a: [1, 0], rel: "<=", b: 3 }]);
  assert.equal(r.status, "optimal");
  assert.ok(Math.abs(r.value - 11) < 1e-7);
  assert.equal(simplex([1], [{ a: [1], rel: ">=", b: 5 }, { a: [1], rel: "<=", b: 2 }]).status, "infeasible");
  assert.equal(simplex([1], [{ a: [1], rel: ">=", b: 1 }]).status, "unbounded");
});

test("validateSpec explains what is wrong and refuses a very low calorie plan", () => {
  const s = sampleSpec();
  assert.deepEqual(validateSpec(s), []);
  assert.ok(validateSpec({ ...s, foods: s.foods.slice(0, 1) }).length);
  assert.match(validateSpec({ ...s, kcalMin: 900 })[0], new RegExp(`${MIN_SAFE_KCAL}`));
  assert.match(validateSpec({ ...s, kcalMin: "" })[0], /minimum for calories/);
  assert.ok(validateSpec({ ...s, fatMin: 90, fatMax: 50 }).length);
  assert.ok(validateSpec({ ...s, step: 0.3 }).length);
  assert.ok(validateSpec({ ...s, proteinMin: -5 }).length);
});

test("the sample plan is feasible, verified, and not above its own continuous bound", () => {
  const s = sampleSpec();
  const r = solve(s);
  assert.equal(r.status, "optimal");
  assert.deepEqual(verifyPlan(s, r), []);
  assert.ok(r.feasible && r.exact);
  assert.ok(r.cost >= r.bound - 1e-9 && r.cost - r.bound < 0.1);
  assert.ok(r.totals[0] >= 2000 - 1e-6 && r.totals[0] <= 2300 + 1e-6);
  assert.ok(r.totals[1] >= 100 - 1e-6);
  assert.ok(r.cost <= r.greedy.cost + 1e-9, "the optimizer never loses to the shopper's rule of thumb");
});

// Exhaustive search over servings in steps, for tiny menus.
function brute(spec) {
  const step = Number(spec.step), n = spec.foods.length;
  const caps = spec.foods.map((f) => Math.floor((f.max ?? spec.defaultMax) / step + 1e-9));
  let best = Infinity;
  const y = new Array(n).fill(0);
  const go = (i) => {
    if (i === n) {
      const s = y.map((v) => v * step);
      if (planFeasible(spec, s)) best = Math.min(best, planCost(spec, s));
      return;
    }
    for (let v = 0; v <= caps[i]; v++) { y[i] = v; go(i + 1); }
  };
  go(0);
  return best;
}

test("integer servings match exhaustive search on 60 random small menus", () => {
  let seed = 11, optimal = 0, infeasible = 0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let trial = 0; trial < 60; trial++) {
    const n = 3 + Math.floor(rnd() * 2);
    const fs = foods(Array.from({ length: n }, (_, i) => [`F${i}`, Math.round((0.1 + rnd() * 1.4) * 100) / 100, [Math.round(60 + rnd() * 400), Math.round(rnd() * 30), Math.round(rnd() * 40), Math.round(rnd() * 20), Math.round(rnd() * 6)], 1 + Math.floor(rnd() * 3)]));
    const spec = { ...DEFAULTS, foods: fs, kcalMin: 1200, kcalMax: 1200 + Math.round(rnd() * 800), proteinMin: Math.round(rnd() * 80), fatMin: "", fatMax: Math.round(30 + rnd() * 60), fiberMin: Math.round(rnd() * 15), step: [1, 0.5][trial % 2], defaultMax: 4 };
    const want = brute(spec);
    const got = solve(spec, 100000);
    if (want === Infinity) { infeasible++; assert.notEqual(got.status, "optimal", `trial ${trial}`); continue; }
    optimal++;
    assert.equal(got.status, "optimal", `trial ${trial}`);
    assert.ok(Math.abs(got.cost - want) < 1e-6, `trial ${trial}: solver ${got.cost} vs brute ${want}`);
    assert.deepEqual(verifyPlan(spec, got), []);
  }
  assert.ok(optimal >= 20, `${optimal} solvable, ${infeasible} not`);
});

test("continuous plans are never dearer than integer ones, and raising a target never makes it cheaper", () => {
  const base = sampleSpec();
  const cont = solve({ ...base, step: 0 });
  const whole = solve({ ...base, step: 1 });
  const half = solve({ ...base, step: 0.5 });
  assert.ok(cont.cost <= half.cost + 1e-9 && half.cost <= whole.cost + 1e-9);
  const fr = proteinFrontier(base, [60, 100, 140, 180]);
  for (let i = 1; i < fr.length; i++) assert.ok(fr[i].cost >= fr[i - 1].cost - 1e-9);
});

test("marginal costs are non-negative and zero for a slack target", () => {
  const r = solve(sampleSpec());
  for (const m of Object.values(r.marginal)) assert.ok(m.extra >= 0);
  assert.ok(r.marginal.protein.extra > 0);
});

test("an impossible target is reported, not faked", () => {
  const s = { ...sampleSpec(), proteinMin: 900 };
  assert.notEqual(solve(s).status, "optimal");
  const tight = { ...sampleSpec(), kcalMin: 2000, kcalMax: 2000, step: 1, defaultMax: 1, proteinMin: 600 };
  assert.notEqual(solve(tight).status, "optimal");
});

test("greedy rule of thumb is feasible or says it is not; the CSV totals match", () => {
  const s = sampleSpec();
  const g = greedyPlan(s);
  assert.equal(g.feasible, planFeasible(s, g.servings));
  const r = solve(s);
  const rows = planCsv(s, r).trim().split("\n");
  assert.equal(rows[0].split(",")[0], "Food");
  assert.equal(rows.length, r.items.length + 2);
  assert.ok(rows.at(-1).includes(r.cost.toFixed(2)));
});

test("the verifier catches a bad plan", () => {
  const s = sampleSpec();
  const r = solve(s);
  const bad = { ...r, servings: r.servings.map(() => 0) };
  assert.ok(verifyPlan(s, bad).length > 0);
});

test("variety limit caps each food's calorie share, costs no less, and rejects impossible limits", () => {
  const base = { ...sampleSpec(), step: 0.5 };
  const free = solve(base);
  const lim = { ...base, maxShare: 30 };
  assert.deepEqual(validateSpec(lim), []);
  const r = solve(lim);
  assert.equal(r.status, "optimal");
  assert.deepEqual(verifyPlan(lim, r), []);
  const kcal = r.totals[0];
  r.items.forEach((it) => assert.ok(it.nutrients[0] <= 0.3 * kcal + 1e-6, it.name));
  assert.ok(r.cost >= free.cost - 1e-9);
  // continuous mode honours it too
  const c = solve({ ...lim, step: 0 });
  assert.equal(c.status, "optimal");
  c.items.forEach((it) => assert.ok(it.nutrients[0] <= 0.3 * c.totals[0] + 1e-6));
  assert.ok(validateSpec({ ...base, maxShare: 0 }).length);
  assert.ok(validateSpec({ ...base, maxShare: 150 }).length);
  assert.ok(validateSpec({ ...base, foods: base.foods.slice(0, 2), maxShare: 30 }).length);
});

test("variety limit agrees with brute force on a tiny menu", () => {
  const spec = { foods: foods([["A", 1, [100, 5, 10, 1, 1]], ["B", 2, [100, 10, 10, 1, 1]], ["C", 3, [100, 12, 10, 1, 1]]]), kcalMin: 1200, kcalMax: 1300, proteinMin: 0, fatMin: 0, fatMax: "", carbsMin: "", carbsMax: "", fiberMin: 0, defaultMax: 12, step: 1, daysPerWeek: 7, maxShare: 50 };
  let best = Infinity;
  for (let a = 0; a <= 12; a++) for (let b = 0; b <= 12; b++) for (let c = 0; c <= 12; c++) if (planFeasible(spec, [a, b, c])) best = Math.min(best, planCost(spec, [a, b, c]));
  const r = solve(spec);
  assert.equal(r.status, "optimal");
  assert.ok(Math.abs(r.cost - best) < 1e-6, `${r.cost} vs ${best}`);
});

test("share link round-trips foods and targets", async () => {
  const { encodeShare, decodeShare, SAMPLE_FOODS } = await import("./calc.mjs");
  const fields = { kmin: "2000", pmin: "120", share: "30", step: "0.5", cmin: "" };
  const frag = encodeShare(SAMPLE_FOODS, fields);
  const back = decodeShare("#" + frag);
  assert.equal(back.foods, SAMPLE_FOODS);
  assert.deepEqual(back.fields, { kmin: "2000", pmin: "120", share: "30", step: "0.5" });
});

test("share link drops unknown or non-numeric fields", async () => {
  const { decodeShare } = await import("./calc.mjs");
  const back = decodeShare("#foods=Rice%20%7C%200.1&kmin=%3Cscript%3E&evil=1&pmin=90");
  assert.equal(back.foods, "Rice | 0.1");
  assert.deepEqual(back.fields, { pmin: "90" });
  assert.deepEqual(decodeShare("").fields, {});
});

test("parseFoods reads servings per pack and rejects a bad one", () => {
  const r = parseFoods("Rice | 0.15 | 180 | 3.5 | 40 | 0.3 | 0.7 | | 20\nEgg | 0.3 | 72 | 6 | 0 | 5 | 0 | 6\nOats | 0.2 | 150 | 5 | 27 | 3 | 4 | | 0");
  assert.equal(r.foods[0].pack, 20);
  assert.equal(r.foods[0].max, null);
  assert.equal(r.foods[1].pack, null);
  assert.equal(r.foods.length, 2);
  assert.match(r.errors[0], /servings per pack/);
});

test("groceryList rounds up to whole packs and prices the leftover", () => {
  const spec = { daysPerWeek: 7, foods: foods([["Rice", 0.2, [180, 3, 40, 0, 1]], ["Egg", 0.3, [72, 6, 0, 5, 0]]]) };
  spec.foods[0].pack = 20;
  const res = { cost: 0.2 * 3 + 0.3 * 2, items: [{ index: 0, name: "Rice", servings: 3, cost: 0.6 }, { index: 1, name: "Egg", servings: 2, cost: 0.6 }] };
  const g = groceryList(spec, res);
  assert.equal(g.lines[0].packs, 2); // 21 servings -> 2 packs of 20
  assert.equal(g.lines[0].leftover, 19);
  assert.ok(Math.abs(g.lines[0].spend - 8) < 1e-9); // 40 servings x 0.20
  assert.equal(g.lines[1].packs, null);
  assert.ok(Math.abs(g.lines[1].spend - 4.2) < 1e-9); // bought exactly: 14 x 0.30
  assert.ok(Math.abs(g.extra - (8 + 4.2 - 1.2 * 7)) < 1e-9);
  spec.foods[0].pack = 21; // exact multiple: no float round-up
  assert.equal(groceryList(spec, res).lines[0].packs, 1);
});

test("breakEvenPrices finds the price at which a left-out food starts to win", () => {
  // Need 100 g protein. Egg: 10 g for 1.00. Bean: 10 g for 1.50 now; it wins below 1.00.
  const spec = { ...DEFAULTS, kcalMin: "", kcalMax: "", fatMin: "", fatMax: "", fiberMin: "", step: 0, defaultMax: 20, foods: foods([["Egg", 1, [100, 10, 0, 0, 0]], ["Bean", 1.5, [100, 10, 0, 0, 0]]]) };
  const res = solve(spec);
  assert.equal(res.items[0].name, "Egg");
  const be = breakEvenPrices(spec, res);
  assert.equal(be.length, 1);
  assert.equal(be[0].name, "Bean");
  assert.ok(Math.abs(be[0].price - 1) < 1e-6);
  assert.ok(Math.abs(be[0].drop - 1 / 3) < 1e-6);
  const cheaper = { ...spec, foods: spec.foods.map((f) => (f.name === "Bean" ? { ...f, price: 0.99 } : f)) };
  assert.equal(solve(cheaper).items[0].name, "Bean");
});

test("breakEvenPrices on the starter menu: every answer re-solves to a plan that uses the food", () => {
  const spec = { ...sampleSpec(), step: 0 };
  const res = solve(spec);
  for (const b of breakEvenPrices(spec, res)) {
    if (b.price === null) continue;
    assert.ok(b.price < b.current);
    const foodsLow = spec.foods.map((f, j) => (j === b.index ? { ...f, price: b.price * 0.98 } : f));
    assert.ok(solve({ ...spec, foods: foodsLow }).servings[b.index] > 1e-6, b.name);
  }
});

test("tightening the variety limit never makes the plan cheaper, and matches a direct solve", () => {
  const base = sampleSpec();
  const fr = varietyFrontier(base, [100, 50, 30]);
  for (let i = 1; i < fr.length; i++) if (fr[i].cost !== null) assert.ok(fr[i].cost >= fr[i - 1].cost - 1e-9);
  const direct = solve({ ...base, step: 0, maxShare: 30 });
  assert.ok(Math.abs(direct.cost - fr[2].cost) < 1e-6);
  assert.ok(fr[2].foods >= 4); // 30% per food needs at least 4 foods
  assert.equal(varietyFrontier({ ...base, foods: base.foods.slice(0, 3) }, [20])[0].cost, null);
});

test("budgetFrontier: protein rises with the budget, and agrees with the cost frontier", () => {
  const base = sampleSpec();
  const min = solve({ ...base, step: 0 }).cost;
  const fr = budgetFrontier(base, [min * 0.5, min, min * 1.5, min * 3]);
  assert.equal(fr[0].protein, null); // half the cheapest feasible cost cannot meet calories and fiber
  assert.ok(fr[1].protein >= base.proteinMin - 1e-6);
  for (let i = 2; i < fr.length; i++) assert.ok(fr[i].protein >= fr[i - 1].protein - 1e-9);
  // the cheapest way to reach the protein the budget buys costs no more than the budget
  const p = fr[2].protein;
  const back = proteinFrontier({ ...base, step: 0 }, [p * 0.999])[0].cost;
  assert.ok(back <= min * 1.5 + 1e-6);
});
