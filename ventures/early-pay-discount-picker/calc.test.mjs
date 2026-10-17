import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, cleanItems, solve, benefitOf, toCsv, EXAMPLE_ITEMS, EXAMPLE_SHARED, MAX_INVOICES, money } from "./calc.mjs";

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const inv = (amount, d, dd, due) => cleanItems([{ name: "x", amount, discountPct: d, discountDays: dd, dueDays: due }]).items[0];

test("2/10 net 30 is about a 37% annual rate", () => {
  const v = inv(1000, 2, 10, 30);
  assert.ok(Math.abs(v.apr - 37.24) < 0.05, String(v.apr));
  assert.equal(v.early, 20);
  assert.equal(Math.round(v.discount), 20);
  assert.equal(Math.round(v.outlay), 980);
});

test("benefit is discount less interest on the outlay for the days paid early", () => {
  const v = inv(1000, 2, 10, 30);
  assert.ok(Math.abs(benefitOf(v, 10) - (20 - 980 * 0.1 * (20 / 365))) < 1e-9);
  assert.ok(benefitOf(v, 100) < benefitOf(v, 10));
});

test("exact solver matches brute-force subset search on random sets", () => {
  const r = rng(11);
  for (let trial = 0; trial < 80; trial++) {
    const n = 2 + Math.floor(r() * 8);
    const items = cleanItems(Array.from({ length: n }, (_, i) => ({
      name: "i" + i, amount: 500 + Math.floor(r() * 9000), discountPct: 0.5 + Math.floor(r() * 50) / 10,
      discountDays: 5 + Math.floor(r() * 15), dueDays: 25 + Math.floor(r() * 40),
    }))).items;
    const cash = 2000 + Math.floor(r() * 20000), rate = Math.floor(r() * 40);
    const sol = solve(items, cash, rate);
    let best = 0;
    for (let m = 0; m < 1 << n; m++) {
      let used = 0, tot = 0;
      for (let i = 0; i < n; i++) if (m & (1 << i)) { used += items[i].outlay; tot += benefitOf(items[i], rate); }
      if (used <= cash + 1e-6 && tot > best) best = tot;
    }
    assert.ok(Math.abs(sol.benefit - best) < 1e-6, `trial ${trial}: ${sol.benefit} vs ${best}`);
    assert.ok(sol.used <= cash + 1e-6);
  }
});

test("never pays early when the discount is worth less than the cost of cash", () => {
  const a = analyze([{ name: "a", amount: 1000, discountPct: 0.1, discountDays: 5, dueDays: 60 }], { cash: 5000, costOfCash: 30 });
  assert.equal(a.ok, true);
  assert.equal(a.plan.length, 0);
  assert.equal(a.benefit, 0);
  assert.equal(a.skipped.length, 1);
  assert.match(a.skipped[0].reason, /worth less/);
});

test("respects the cash limit", () => {
  const a = analyze([
    { name: "big", amount: 10000, discountPct: 2, discountDays: 10, dueDays: 30 },
    { name: "small", amount: 3000, discountPct: 2, discountDays: 10, dueDays: 30 },
  ], { cash: 5000, costOfCash: 5 });
  assert.deepEqual(a.plan.map((p) => p.name), ["small"]);
  assert.ok(a.used <= 5000);
});

test("the example shows the exact answer beating the rules of thumb", () => {
  const a = analyze(EXAMPLE_ITEMS, EXAMPLE_SHARED);
  assert.equal(a.ok, true);
  assert.ok(a.ruleLoss > 1, "example should show a gap over the best rule");
  for (const rule of a.rules) assert.ok(a.benefit >= rule.benefit - 1e-9);
  assert.ok(a.items.length <= MAX_INVOICES);
});

test("extra cash never reduces the benefit", () => {
  const a = analyze(EXAMPLE_ITEMS, EXAMPLE_SHARED);
  for (const e of a.extraLevels) assert.ok(e.gain >= -1e-9);
});

test("bad rows are dropped with a warning, not thrown", () => {
  const { items, warnings } = cleanItems([
    { name: "no discount", amount: 100, discountPct: 0, discountDays: 5, dueDays: 30 },
    { name: "due first", amount: 100, discountPct: 2, discountDays: 30, dueDays: 10 },
    { name: "blank days", amount: 100, discountPct: 2, discountDays: "", dueDays: "" },
    { name: "no amount", amount: 0 },
    null,
  ]);
  assert.equal(items.length, 0);
  assert.equal(warnings.length, 4);
});

test("no invoices or no cash is reported, not computed", () => {
  assert.equal(analyze([], EXAMPLE_SHARED).ok, false);
  assert.equal(analyze(EXAMPLE_ITEMS, { cash: 0, costOfCash: 8 }).ok, false);
});

test("only the first 14 invoices are used", () => {
  const many = Array.from({ length: 16 }, (_, i) => ({ name: "s" + i, amount: 1000, discountPct: 2, discountDays: 10, dueDays: 30 }));
  const { items, warnings } = cleanItems(many);
  assert.equal(items.length, MAX_INVOICES);
  assert.equal(warnings.length, 2);
});

test("csv escapes formulas and commas", () => {
  const a = analyze([{ name: "=SUM(A1), Inc", amount: 1000, discountPct: 2, discountDays: 10, dueDays: 30 }], { cash: 5000, costOfCash: 5 });
  const csv = toCsv(a);
  assert.match(csv, /"'=SUM\(A1\), Inc"/);
});

test("money formats whole dollars", () => {
  assert.equal(money(1234.4), "$1,234");
  assert.equal(money(-5), "-$5");
});
