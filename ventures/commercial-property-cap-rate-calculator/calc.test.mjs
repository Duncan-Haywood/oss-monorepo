import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, summaryText, annualDebtService, loanForDebtService, SAMPLE, LENDER_DSCR } from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("sample: income, expenses and NOI add up by hand", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  near(r.egi, 240000 * 0.93 + 6000); // 229,200
  near(r.mgmtCost, 11460);
  near(r.opex, 28000 + 9000 + 12000 + 14000 + 11460 + 6000 + 3000); // 83,460
  near(r.noi, 145740);
  near(r.value, 145740 / 0.07);
  near(r.expenseRatio, 83460 / 229200, 1e-9);
});

test("financing: loan, payment, DSCR, cash-on-cash and implied cap rate", () => {
  const f = compute(SAMPLE).financing;
  near(f.loan, 1400000);
  near(f.equity, 600000);
  const r = 0.0675 / 12, n = 300;
  near(f.ds, 1400000 * r / (1 - Math.pow(1 + r, -n)) * 12);
  near(f.dscr, 145740 / f.ds, 1e-9);
  near(f.cashFlow, 145740 - f.ds);
  near(f.cashOnCash, f.cashFlow / 600000, 1e-9);
  near(f.impliedCap, 145740 / 2000000, 1e-9);
  near(f.priceVsValue, 2000000 - 145740 / 0.07);
});

test("break-even occupancy: at that occupancy cash flow is zero", () => {
  const f = compute(SAMPLE).financing;
  const p = { ...SAMPLE, vacancy: (1 - f.breakevenOcc) * 100 };
  const again = compute(p);
  near(again.noi - again.financing.ds, 0, 1);
});

test("max loan at the lender DSCR round-trips through debt service", () => {
  const ds = annualDebtService(1000000, 7, 30);
  near(loanForDebtService(ds, 7, 30), 1000000, 0.5);
  const f = compute(SAMPLE).financing;
  near(annualDebtService(f.maxLoan, SAMPLE.rate, SAMPLE.years), compute(SAMPLE).noi / LENDER_DSCR, 1);
});

test("zero-interest loan amortises straight-line", () => {
  near(annualDebtService(120000, 0, 10), 12000);
});

test("price 0 skips financing; all-cash with ltv 0 has no DSCR", () => {
  assert.equal(compute({ ...SAMPLE, price: 0 }).financing, undefined);
  const cash = compute({ ...SAMPLE, ltv: 0 });
  assert.equal(cash.financing.dscr, null);
  assert.ok(cash.findings.some((f) => /All-cash/.test(f.title)));
});

test("negative NOI gives no value and says so", () => {
  const r = compute({ ...SAMPLE, tax: 500000 });
  assert.equal(r.value, 0);
  assert.ok(r.findings.some((f) => /no value/.test(f.title)));
});

test("sensitivity grid: higher cap rate and higher vacancy both lower value", () => {
  const g = compute(SAMPLE).sensitivity;
  assert.deepEqual(g.caps, [6, 6.5, 7, 7.5, 8]);
  for (const row of g.rows) for (let i = 1; i < row.values.length; i++) assert.ok(row.values[i] < row.values[i - 1]);
  for (let c = 0; c < g.caps.length; c++) assert.ok(g.rows[1].values[c] < g.rows[0].values[c]);
});

test("flags a thin expense ratio, a low DSCR and a low vacancy", () => {
  const r = compute({ ...SAMPLE, tax: 1000, insurance: 1000, utilities: 0, maintenance: 1000, vacancy: 2, ltv: 90 });
  const t = r.findings.map((f) => f.title).join("\n");
  assert.match(t, /only .*% of income/);
  assert.match(t, /optimistic/);
});

test("bad input is rejected, never clamped", () => {
  assert.ok(compute({ ...SAMPLE, gpr: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, capRate: 0 }).errors.length);
  assert.ok(compute({ ...SAMPLE, vacancy: 101 }).errors.length);
  assert.ok(compute({ ...SAMPLE, years: 0 }).errors.length);
  assert.ok(parse({}).errors.length >= 10);
});

test("summary names its sources and the sensitivity grid", () => {
  const s = summaryText(compute(SAMPLE));
  assert.match(s, /not an appraisal/);
  assert.match(s, /Value by cap rate/);
  assert.match(s, /Verify against/);
});
