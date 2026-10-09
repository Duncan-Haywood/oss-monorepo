import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, cleanItems, profitOf, solve, toCsv, EXAMPLE_ITEMS, EXAMPLE_SHARED, WEEKS_PER_MONTH, MAX_BRANDS } from "./calc.mjs";

const brand = (o = {}) => ({ name: "A", orders: 100, aov: 20, foodPct: 30, platformPct: 25, consumables: 1, prepMin: 6, fixed: 200, ...o });

test("per-order profit subtracts food, fees, consumables and kitchen labour", () => {
  const { items } = cleanItems([brand()], 18);
  // 20 * (1 - .55) = 9.00, less 1.00 consumables, less 6/60*18 = 1.80 labour
  assert.ok(Math.abs(items[0].perOrder - 6.2) < 1e-9);
  assert.ok(Math.abs(profitOf(items[0]) - (100 * WEEKS_PER_MONTH * 6.2 - 200)) < 1e-6);
  assert.ok(Math.abs(items[0].hoursPerWeek - 10) < 1e-9);
});

test("break-even orders is where monthly profit is zero", () => {
  const { items } = cleanItems([brand()], 18);
  const b = { ...items[0], orders: items[0].breakEvenOrders };
  assert.ok(Math.abs(profitOf(b)) < 1e-6);
});

test("exact answer beats or equals every rule and matches brute force", () => {
  const a = analyze(EXAMPLE_ITEMS, EXAMPLE_SHARED);
  assert.equal(a.ok, true);
  for (const r of a.rules) assert.ok(a.profit >= r.profit - 1e-6, r.label);
  assert.ok(a.hoursUsed <= EXAMPLE_SHARED.kitchenHours + 1e-6);
  assert.ok(a.ruleLoss > 100, "the example is meant to show the rules falling short");
});

test("never picks a brand that loses money", () => {
  const a = analyze([brand({ name: "Loser", fixed: 99999 }), brand({ name: "Winner", fixed: 0 })], { kitchenHours: 100, labourRate: 18 });
  assert.deepEqual(a.plan.map((p) => p.name), ["Winner"]);
  assert.equal(a.skipped[0].name, "Loser");
});

test("respects the kitchen-hours limit", () => {
  const a = analyze([brand({ name: "A" }), brand({ name: "B" })], { kitchenHours: 12, labourRate: 18 });
  assert.equal(a.plan.length, 1);
  const b = analyze([brand({ name: "A" }), brand({ name: "B" })], { kitchenHours: 20, labourRate: 18 });
  assert.equal(b.plan.length, 2);
});

test("a knapsack trap: two mid brands beat one big one", () => {
  const big = brand({ name: "Big", orders: 160, prepMin: 6, fixed: 0, foodPct: 20 });
  const m1 = brand({ name: "M1", orders: 150, prepMin: 6, fixed: 0, foodPct: 20 });
  const m2 = brand({ name: "M2", orders: 150, prepMin: 6, fixed: 0, foodPct: 20 });
  const a = analyze([big, m1, m2], { kitchenHours: 30, labourRate: 18 });
  assert.deepEqual(a.plan.map((p) => p.name).sort(), ["M1", "M2"]);
  assert.ok(a.ruleLoss > 0);
});

test("incomplete or impossible brands are dropped with a warning", () => {
  const { items, warnings } = cleanItems([brand({ foodPct: "" }), brand({ foodPct: 60, platformPct: 45 }), brand({ prepMin: 0 }), brand({ name: "Ok" })], 18);
  assert.equal(items.length, 1);
  assert.equal(warnings.length, 3);
});

test("more than the maximum number of brands is capped", () => {
  const many = Array.from({ length: MAX_BRANDS + 2 }, (_, i) => brand({ name: "B" + i }));
  const { items, warnings } = cleanItems(many, 18);
  assert.equal(items.length, MAX_BRANDS);
  assert.equal(warnings.length, 2);
});

test("empty input and zero hours explain what is missing", () => {
  assert.equal(analyze([], { kitchenHours: 10 }).ok, false);
  assert.equal(analyze([brand()], { kitchenHours: 0 }).ok, false);
});

test("more hours never reduce profit", () => {
  const a = analyze(EXAMPLE_ITEMS, EXAMPLE_SHARED);
  for (const e of a.extraLevels) assert.ok(e.gain >= -1e-6);
  const s = solve(cleanItems(EXAMPLE_ITEMS, 18).items, 1000);
  assert.ok(s.profit >= a.profit);
});

test("csv neutralises spreadsheet formulas and lists dropped brands", () => {
  const a = analyze([brand({ name: "=HYPERLINK(1)" }), brand({ name: "Loser", fixed: 99999 })], { kitchenHours: 100, labourRate: 18 });
  const csv = toCsv(a);
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /Dropped/);
  assert.match(csv, /Loser/);
});
