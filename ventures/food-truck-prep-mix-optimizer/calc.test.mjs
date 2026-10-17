import { test } from "node:test";
import assert from "node:assert/strict";
import { EXAMPLE_ITEMS, EXAMPLE_SHARED, cleanItems, cleanShared, optimize, evaluate, analyze, simplex, toCsv } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const item = (name, margin, prep = 0, equip = 0, cost = 0, min = 0, max = 0) => ({ name, price: margin + cost, foodCost: cost, prepMinutes: prep, equipMinutes: equip, minPortions: min, maxPortions: max });
const sh = (o = {}) => cleanShared({ laborMinutes: 0, equipMinutes: 0, cash: 0, cardFeePct: 0, fixedCost: 0, ...o });

test("simplex solves a textbook LP", () => {
  const r = simplex([3, 5], [[1, 0], [0, 2], [3, 2]], [4, 12, 18]);
  near(r.value, 36); near(r.y[0], 2); near(r.y[1], 6);
  near(r.duals[1], 1.5); near(r.duals[2], 1);
});

test("demand ceilings alone: every item is prepped to its ceiling", () => {
  const items = cleanItems([item("A", 5, 0, 0, 0, 0, 40), item("B", 3, 0, 0, 0, 0, 25)], sh());
  const s = optimize(items, sh());
  near(s.portions[0], 40); near(s.portions[1], 25);
});

test("a labor limit favours the item with the most contribution per prep minute", () => {
  const shared = sh({ laborMinutes: 100 });
  const items = cleanItems([item("Slow", 10, 5, 0, 0, 0, 100), item("Fast", 4, 1, 0, 0, 0, 60)], shared);
  const s = optimize(items, shared);
  // Fast earns 4/min, Slow 2/min: Fast to its ceiling (60 min), the remaining 40 min -> 8 Slow.
  near(s.portions[1], 60); near(s.portions[0], 8);
  near(s.shadow.labor, 2);
});

test("card fees reduce the contribution", () => {
  const shared = sh({ cardFeePct: 10 });
  const items = cleanItems([{ name: "A", price: 10, foodCost: 3, maxPortions: 10 }], shared);
  near(items[0].margin, 6);
});

test("cash limit binds and its shadow price is the return per ingredient dollar", () => {
  const shared = sh({ cash: 300 });
  const items = cleanItems([item("A", 6, 0, 0, 3, 0, 1000)], shared);
  const s = optimize(items, shared);
  near(s.portions[0], 100); near(s.shadow.cash, 2);
});

test("floors are honoured and reported infeasible when they exceed a limit", () => {
  const shared = sh({ laborMinutes: 10 });
  const items = cleanItems([item("A", 5, 5, 0, 0, 5, 50)], shared);
  assert.equal(optimize(items, shared).feasible, false);
  const a = analyze([item("A", 5, 5, 0, 0, 5, 50)], { laborMinutes: 10 });
  assert.equal(a.ok, false);
  assert.match(a.warnings[0], /prep minutes/);
});

test("no ceiling and no limit is reported, not invented", () => {
  const a = analyze([item("A", 5)], {});
  assert.equal(a.ok, false);
  assert.match(a.warnings[0], /No best plan/);
});

test("items with no price are left out; none left is a warning", () => {
  assert.equal(analyze([{ name: "x", price: 0 }], {}).ok, false);
  assert.equal(cleanItems([{ name: "x", price: 0 }, item("y", 2, 0, 0, 0, 0, 5)]).length, 1);
});

test("the example is feasible, binding on labor, and beats the current plan", () => {
  const a = analyze(EXAMPLE_ITEMS, EXAMPLE_SHARED);
  assert.equal(a.ok, true);
  assert.deepEqual(a.warnings, []);
  assert.ok(a.gain > 0);
  assert.ok(a.binding.includes("labor"));
  assert.ok(a.best.labor <= EXAMPLE_SHARED.laborMinutes + 1e-6);
  assert.ok(a.best.equip <= EXAMPLE_SHARED.equipMinutes + 1e-6);
  assert.ok(a.best.cash <= EXAMPLE_SHARED.cash + 1e-6);
});

test("randomised: the optimum is feasible and no random feasible plan beats it", () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let t = 0; t < 60; t++) {
    const raw = Array.from({ length: 4 }, (_, i) => item("I" + i, 1 + rnd() * 9, 0.5 + rnd() * 4, rnd() * 3, rnd() * 4, 0, 20 + Math.floor(rnd() * 60)));
    const shared = sh({ laborMinutes: 100 + rnd() * 200, equipMinutes: 80 + rnd() * 150, cash: 100 + rnd() * 300 });
    const items = cleanItems(raw, shared);
    const s = optimize(items, shared);
    assert.ok(s.feasible);
    const e = evaluate(items, s.portions, shared);
    assert.ok(e.labor <= shared.laborMinutes + 1e-6 && e.equip <= shared.equipMinutes + 1e-6 && e.cash <= shared.cash + 1e-6);
    for (let k = 0; k < 300; k++) {
      const p = items.map((it) => rnd() * it.max);
      const f = evaluate(items, p, shared);
      if (f.labor <= shared.laborMinutes && f.equip <= shared.equipMinutes && f.cash <= shared.cash) assert.ok(f.margin <= e.margin + 1e-6);
    }
  }
});

test("csv has a header, a row per item and a total", () => {
  const lines = toCsv(analyze(EXAMPLE_ITEMS, EXAMPLE_SHARED)).split("\n");
  assert.equal(lines.length, EXAMPLE_ITEMS.length + 2);
  assert.match(lines[0], /Best portions/);
});
