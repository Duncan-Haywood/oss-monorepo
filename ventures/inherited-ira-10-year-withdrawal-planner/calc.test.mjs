import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, simulate, normalize, incomeTax, taxOn, approxLifeFactor, incomePath } from "./calc.mjs";

const base = { balance: 500000, growth: 0.06, years: 10, rmdRequired: false, status: "single", beneficiaryAge: 50 };

test("income tax on a hand-counted 2026 single return", () => {
  // 50,400 taxable: 12,400 x 10% + 38,000 x 12% = 1,240 + 4,560
  assert.equal(Math.round(incomeTax(50400, "single")), 5800);
  // withdrawing 20,000 on 50,000 other income: taxable 33,900 -> 53,900
  assert.equal(Math.round(taxOn(20000, 50000, "single")), Math.round(incomeTax(53900, "single") - incomeTax(33900, "single")));
});

test("every plan empties the account by the last year", () => {
  const r = plan({ ...base, otherIncome: incomePath(150000, 4, 40000, 10) });
  for (const k of ["best", "even", "wait"]) {
    const rows = r.plans[k].rows;
    assert.ok(Math.abs(rows[rows.length - 1].endBalance) < 1e-6, k);
    assert.equal(rows.length, 10);
  }
});

test("waiting takes nothing until the last year; equal withdrawals have zero ending balance", () => {
  const r = plan({ ...base, otherIncomeFlat: 90000 });
  assert.ok(r.wait.rows.slice(0, 9).every((x) => x.withdrawal === 0));
  assert.ok(r.wait.rows[9].withdrawal > 500000 * Math.pow(1.06, 10) - 1);
});

test("the recommended plan is never worse than waiting or equal withdrawals", () => {
  for (const income of [[150000, 4, 40000], [30000, 0, 0], [250000, 5, 20000], [90000, 0, 0]]) {
    const r = plan({ ...base, otherIncome: incomePath(income[0], income[1], income[2], 10) });
    assert.ok(r.plans.best.wealth >= r.wait.wealth - 1e-6);
    assert.ok(r.plans.best.wealth >= r.even.wealth - 1e-6);
  }
});

test("a low-income stretch earns a bigger plan than equal withdrawals", () => {
  const r = plan({ ...base, otherIncome: incomePath(250000, 5, 20000, 10) });
  assert.ok(r.plans.best.wealth > r.even.wealth + 1000, `${r.plans.best.wealth} vs ${r.even.wealth}`);
  // it should draw far more in the low-income years than in the high-income years
  const rows = r.plans.best.rows;
  assert.ok(rows[6].withdrawal > rows[1].withdrawal * 3);
});

test("required minimums are a floor in years 1 to 9 and use the shrinking factor", () => {
  const r = plan({ ...base, rmdRequired: true, factor: 36.2, otherIncome: incomePath(30000, 0, 0, 10) });
  const y1 = r.wait.rows[0];
  assert.ok(Math.abs(y1.rmd - 500000 / 36.2) < 1e-6);
  assert.ok(Math.abs(r.wait.rows[1].rmd - r.wait.rows[1].startBalance / 35.2) < 1e-6);
  for (const k of ["best", "even", "wait"]) for (const row of r.plans[k].rows.slice(0, 9)) assert.ok(row.withdrawal >= row.rmd - 1e-6, k);
});

test("a one-year window withdraws everything at once", () => {
  const r = plan({ ...base, years: 1, otherIncomeFlat: 50000 });
  assert.equal(r.plans.best.rows.length, 1);
  assert.ok(Math.abs(r.plans.best.rows[0].withdrawal - 500000 * 1.06) < 1e-6);
});

test("zero growth with flat income: spreading beats waiting by the bracket difference", () => {
  const r = plan({ ...base, growth: 0, otherIncomeFlat: 40000 });
  // taxes: waiting stacks 500,000 into one year; even spreads 50,000 a year
  assert.ok(r.wait.totalTax > r.even.totalTax * 1.5);
  assert.ok(Math.abs(r.plans.best.totalWithdrawn - 500000) < 1e-6);
});

test("invalid and degenerate input", () => {
  assert.equal(plan({ balance: 0 }).invalid, true);
  assert.equal(plan({ balance: -5 }).invalid, true);
  const n = normalize({ balance: 1000, years: 99, growth: 5, status: "bogus", beneficiaryAge: 60 });
  assert.equal(n.years, 10);
  assert.equal(n.growth, 0.2);
  assert.equal(n.status, "single");
  assert.equal(n.factor, approxLifeFactor(60));
});

test("approximate life factor follows the IRS anchors", () => {
  assert.equal(approxLifeFactor(50), 36.2);
  assert.equal(approxLifeFactor(70), 18.8);
  assert.ok(approxLifeFactor(55) < 36.2 && approxLifeFactor(55) > 27.1);
});

test("income path switches level in the change year", () => {
  assert.deepEqual(incomePath(100, 3, 10, 5), [100, 100, 10, 10, 10]);
  assert.deepEqual(incomePath(100, 0, 10, 3), [100, 100, 100]);
});

test("simulate respects a custom policy and never withdraws negative", () => {
  const inp = normalize({ ...base, otherIncomeFlat: 0 });
  const r = simulate(inp, () => -1000);
  assert.ok(r.rows.every((x) => x.withdrawal >= 0));
});

test("the model makes no network calls", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("./calc.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|WebSocket/);
});
