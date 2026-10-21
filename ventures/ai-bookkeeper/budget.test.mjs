import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm } from "./engine.mjs";
import { setBudget, budgetVsActual } from "./budget.mjs";

const filed = (rows) => {
  const b = importStatement(newBooks(), "Date,Description,Amount\n" + rows.map(([d, n, a]) => `${d},${n},${a}`).join("\n") + "\n", "1000").books;
  const pick = { SALE: "4000", HOST: "6130", FEE: "6010" };
  return confirm(b, Object.fromEntries(b.transactions.map((t) => [t.id, pick[t.desc.split(" ")[0]]])));
};
const base = filed([
  ["2026-01-05", "SALE ONE", "1000.00"], ["2026-01-09", "HOST A", "-100.00"],
  ["2026-02-05", "SALE TWO", "1500.00"], ["2026-02-09", "HOST A", "-250.00"], ["2026-02-12", "FEE X", "-40.00"],
]);

test("monthly budget scales by months in the period and sets variance", () => {
  let b = setBudget(base, "6130", 20000);
  b = setBudget(b, "4000", 120000);
  const r = budgetVsActual(b, { from: "2026-01-01", to: "2026-02-28" });
  assert.equal(r.months, 2);
  const host = r.rows.find((x) => x.code === "6130");
  assert.deepEqual([host.budget, host.actual, host.variance, host.status], [40000, 35000, -5000, "better"]);
  const sales = r.rows.find((x) => x.code === "4000");
  assert.deepEqual([sales.budget, sales.actual, sales.variance, sales.status], [240000, 250000, 10000, "better"]);
  assert.equal(r.rows.find((x) => x.code === "6010").status, "unbudgeted");
  // net actual 2500-350-40 = 2110; net budget 2400-400 = 2000
  assert.equal(r.net.variance, 211000 - 200000);
});

test("defaults to the latest month; over-budget expense is worse", () => {
  const b = setBudget(base, "6130", 20000);
  const r = budgetVsActual(b);
  assert.equal(r.from, "2026-02-01");
  const host = r.rows.find((x) => x.code === "6130");
  assert.equal(host.variance, 5000);
  assert.equal(host.status, "worse");
  assert.equal(host.pct, 0.25);
});

test("a budgeted account with no activity shows its full shortfall; zero removes a budget", () => {
  let b = setBudget(base, "6140", 10000);
  assert.equal(budgetVsActual(b, { from: "2026-02-01", to: "2026-02-28" }).rows.find((x) => x.code === "6140").variance, -10000);
  b = setBudget(b, "6140", 0);
  assert.equal(b.budget["6140"], undefined);
  assert.equal(base.budget, undefined);
});

test("bad input is refused, empty books give null", () => {
  assert.throws(() => setBudget(base, "1000", 100), /not an income or expense/);
  assert.throws(() => setBudget(base, "6130", 12.5), /whole number/);
  assert.equal(budgetVsActual(newBooks()), null);
  assert.ok(budgetVsActual(base).empty);
});
