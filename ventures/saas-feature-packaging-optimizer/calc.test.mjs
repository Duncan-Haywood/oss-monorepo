import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, parseSurvey, parseFeatures, planValues, choose, evaluate, optimizePackaging, priceLadder, toCsv, EXAMPLE_SHARED, MAX_FEATURES } from "./calc.mjs";

const rnd = (seed) => { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); };

test("parseSurvey reads values, weights and a header, and flags bad lines", () => {
  const w = [];
  const rows = parseSurvey("A, B\n5, 3\n-, 4, 2\n7\nx, 1\n", 2, w);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { v: [5, 3], w: 1 });
  assert.deepEqual(rows[1], { v: [0, 4], w: 2 });
  assert.equal(w.length, 2);
});

test("parseFeatures marks locked features with a star", () => {
  assert.deepEqual(parseFeatures("Core*, Export , API"), { names: ["Core", "Export", "API"], locked: [true, false, false] });
});

test("planValues nests plans: a feature is in its plan and every higher one", () => {
  const rows = [{ v: [10, 5, 2], w: 1 }];
  assert.deepEqual(planValues(rows, [1, 2, 3], 3)[0].v, [10, 15, 17]);
  assert.deepEqual(planValues(rows, [2, 0, 1], 3)[0].v, [2, 12, 12]);
  assert.deepEqual(planValues(rows, [2, 0, 1], 3)[0].v, [2, 12, 12]);
});

test("choose gives each person the plan with the most surplus, ties to the dearer plan, nothing at negative surplus", () => {
  const rows = [{ v: [10, 18], w: 1 }, { v: [4, 5], w: 1 }, { v: [6, 6], w: 1 }];
  assert.deepEqual(choose(rows, [8, 12]), [1, -1, -1]);
  assert.deepEqual(choose([{ v: [10, 12], w: 1 }], [8, 10]), [1]);
});

test("a hand-checked case: one feature everyone wants, one only big spenders want", () => {
  // 4 light users value A at 10; 2 heavy users value A at 10 and B at 30. One plan with A, a second adding B.
  const rows = [...Array(4).fill({ v: [10, 0], w: 1 }), ...Array(2).fill({ v: [10, 30], w: 1 })];
  const best = optimizePackaging(rows, [0, 0], 2);
  // Plan 1 = A at 10 (everyone), plan 2 = A+B at 40 (heavy users): 4*10 + 2*40 = 120, which beats A+B for all (40*2=80) or A alone (60).
  assert.deepEqual(best.level, [1, 2]);
  assert.equal(Math.round(best.profit), 120);
  assert.deepEqual(best.prices.map(Math.round), [10, 40]);
});

test("the placement search matches exhaustive search on small random surveys", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const r = rnd(seed * 7919), rows = [];
    const f = 3;
    for (let i = 0; i < 24; i++) rows.push({ v: Array.from({ length: f }, () => (r() < 0.25 ? 0 : Math.round(r() * 30))), w: 1 });
    if (!rows.some((x) => x.v.some((y) => y > 0))) continue;
    const costs = [1, 2];
    const got = optimizePackaging(rows, costs, f);
    let top = -Infinity;
    for (let a = 0; a <= 2; a++) for (let b = 0; b <= 2; b++) for (let c = 0; c <= 2; c++) {
      const e = priceLadder(rows, [a, b, c], costs, { exact: true });
      if (e && e.profit > top) top = e.profit;
    }
    assert.ok(got.profit >= top * 0.97 - 1e-6, `seed ${seed}: search ${got.profit} vs exhaustive ${top}`);
    assert.ok(got.profit <= top + 1e-6, `seed ${seed}: search cannot beat exhaustive`);
  }
});

test("no single price move improves the returned prices", () => {
  const rows = parseSurvey(EXAMPLE_SHARED.survey, 7);
  const costs = [2, 4, 9];
  const best = optimizePackaging(rows, costs, 7, { locked: [true, ...Array(6).fill(false)] });
  const pr = planValues(rows, best.level, 3);
  for (let t = 0; t < 3; t++) for (const d of [-1, -0.25, -0.01, 0.01, 0.25, 1]) {
    const p = best.prices.slice(); p[t] += d;
    if (p[t] < costs[t] || (t > 0 && p[t] < p[t - 1]) || (t < 2 && p[t] > p[t + 1])) continue;
    assert.ok(evaluate(pr, p, costs).profit <= best.profit + 1e-6, `plan ${t} by ${d}`);
  }
});

test("a locked feature stays in the cheapest plan", () => {
  const a = analyze(EXAMPLE_SHARED);
  assert.equal(a.ok, true);
  assert.equal(a.impact[0].locked, true);
  assert.equal(a.best.level[0], 1);
});

test("the example gains over the packaging it ships with, and over one flat plan", () => {
  const a = analyze(EXAMPLE_SHARED);
  assert.ok(a.ok, a.warnings.join(" "));
  assert.ok(a.now && a.now.given);
  assert.ok(a.best.profit >= a.now.profit - 1e-6);
  assert.ok(a.best.profit > a.single.profit);
  assert.equal(a.best.prices.length, 3);
  assert.ok(a.best.prices[0] <= a.best.prices[1] && a.best.prices[1] <= a.best.prices[2]);
});

test("moving a feature to its own best plan is never worse than the table says", () => {
  const a = analyze(EXAMPLE_SHARED);
  for (const m of a.impact) assert.ok(Math.max(...m.byLevel.filter((x) => x != null)) <= a.best.profit + 1e-6, m.name);
});

test("weights count a line more than once", () => {
  const base = "A, B\n10, 0\n10, 0\n10, 0\n10, 0\n10, 30\n";
  const heavy = "A, B\n10, 0\n10, 0\n10, 0\n10, 0\n10, 30, 1\n";
  const x = analyze({ tiers: "Basic, Plus", costs: "0, 0", features: "A, B", survey: base, current: "", currentPrices: "" });
  const y = analyze({ tiers: "Basic, Plus", costs: "0, 0", features: "A, B", survey: heavy.replace("30, 1", "30, 10"), current: "", currentPrices: "" });
  assert.ok(x.ok && y.ok);
  assert.ok(y.best.profit > x.best.profit);
});

test("bad input gets a warning, not a crash", () => {
  const base = { tiers: "Basic, Plus", costs: "0", features: "A, B", survey: "1,2\n1,2\n1,2\n1,2\n1,2", current: "", currentPrices: "" };
  assert.equal(analyze({ ...base, tiers: "Only" }).ok, false);
  assert.equal(analyze({ ...base, features: "A" }).ok, false);
  assert.equal(analyze({ ...base, features: Array.from({ length: MAX_FEATURES + 1 }, (_, i) => "F" + i).join(",") }).ok, false);
  assert.equal(analyze({ ...base, survey: "1,2" }).ok, false);
  assert.equal(analyze({ ...base, survey: "0,0\n0,0\n0,0\n0,0\n0,0" }).ok, false);
  assert.equal(analyze({ ...base, costs: "x" }).ok, false);
  assert.equal(analyze({ ...base, current: "1" }).ok, false);
  assert.equal(analyze({ ...base, current: "1, 5" }).ok, false);
  assert.equal(analyze({ ...base, current: "1, 2", currentPrices: "5" }).ok, false);
  assert.equal(analyze({ ...base, costs: "999" }).ok, false);
});

test("CSV has a feature table and a plan table", () => {
  const csv = toCsv(analyze(EXAMPLE_SHARED));
  assert.match(csv, /^"feature","first_included_in"/);
  assert.match(csv, /"plan","suggested_price"/);
  assert.equal(csv.split("\n").filter((l) => l.startsWith('"Starter"')).length, 1);
});

test("the search stays fast at the largest size", () => {
  const r = rnd(42), rows = [];
  for (let i = 0; i < 500; i++) rows.push(Array.from({ length: 8 }, () => (r() < 0.4 ? 0 : Math.round(r() * 40))).join(","));
  const t = Date.now();
  const a = analyze({ tiers: "A, B, C", costs: "1, 2, 3", features: "f1, f2, f3, f4, f5, f6, f7, f8", survey: rows.join("\n"), current: "", currentPrices: "" });
  assert.ok(a.ok);
  assert.ok(Date.now() - t < 20000, `took ${Date.now() - t}ms`);
});
