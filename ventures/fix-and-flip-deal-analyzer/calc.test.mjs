import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, dealCosts, parsePlan, maxOffer, breakEvenSale, targetProfit, num, money, samplePlan, reportCsv } from "./calc.mjs";

const plan = (over = {}) => parsePlan({ ...samplePlan(), ...over }).p;

test("num parses currency text and rejects blanks", () => {
  assert.equal(num("$1,250.50"), 1250.5);
  assert.equal(num("15%"), 15);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
});

test("parsePlan names the bad field and enforces ranges", () => {
  assert.match(parsePlan({ ...samplePlan(), arv: "" }).error, /After-repair value/);
  assert.match(parsePlan({ ...samplePlan(), ltv: "120" }).error, /Loan-to-purchase/);
  assert.match(parsePlan({ ...samplePlan(), rate: "-1" }).error, /Interest rate/);
});

test("cost stack, hand-checked on a cash-only deal", () => {
  const p = plan({ ltv: "0", rehabFinanced: "0", points: "0", contingency: "0", buyClosing: "0", monthlyHolding: "0", otherCosts: "0", sellPct: "6", arv: "300000", purchase: "150000", rehab: "50000" });
  const c = dealCosts(p);
  assert.equal(c.interest, 0);
  assert.equal(c.selling, 18000);
  assert.equal(c.total, 218000);
  assert.equal(c.profit, 82000);
  assert.equal(c.cash, 200000);
  assert.ok(Math.abs(c.roi - 0.41) < 1e-9);
});

test("interest and points, hand-checked", () => {
  const p = plan({ purchase: "200000", ltv: "80", rehab: "40000", rehabFinanced: "100", rate: "12", points: "2", rehabMonths: "4", saleMonths: "2" });
  const c = dealCosts(p);
  assert.equal(c.purchaseLoan, 160000);
  assert.equal(c.rehabLoan, 40000);
  // 1% a month: 160k for 6 months + 40k for (2 + 2) months
  assert.ok(Math.abs(c.interest - (160000 * 0.01 * 6 + 40000 * 0.01 * 4)) < 1e-6);
  assert.ok(Math.abs(c.points - 4000) < 1e-9);
});

test("contingency is paid in cash and raises cash needed, not the loan", () => {
  const a = dealCosts(plan({ contingency: "0" }));
  const b = dealCosts(plan({ contingency: "20" }));
  assert.equal(a.loan, b.loan);
  assert.ok(Math.abs(b.cash - a.cash - 55000 * 0.2) < 1e-6);
});

test("maximum offer leaves exactly the target profit", () => {
  const p = plan();
  const mao = maxOffer(p);
  const c = dealCosts(p, { purchase: mao });
  assert.ok(Math.abs(c.profit - targetProfit(p)) < 0.01);
  assert.ok(dealCosts(p, { purchase: mao + 1000 }).profit < targetProfit(p));
});

test("target is the larger of the percentage and the dollar minimum", () => {
  assert.equal(targetProfit(plan({ arv: "340000", targetProfitPct: "15", targetProfitMin: "30000" })), 51000);
  assert.equal(targetProfit(plan({ arv: "100000", targetProfitPct: "15", targetProfitMin: "30000" })), 30000);
});

test("break-even sale price has zero profit and sits below the ARV on a good deal", () => {
  const p = plan();
  const be = breakEvenSale(p);
  assert.ok(Math.abs(dealCosts(p, { sale: be }).profit) < 0.01);
  assert.ok(be < p.arv);
});

test("a deal that cannot hit the target at any price returns null", () => {
  const p = plan({ arv: "100000", rehab: "150000", targetProfitMin: "30000" });
  assert.equal(maxOffer(p), null);
});

test("analyze flags overpaying and reports the gap", () => {
  const r = analyze({ ...samplePlan(), purchase: "260000" });
  assert.equal(r.meetsTarget, false);
  assert.ok(r.overpayBy > 0);
  assert.ok(Math.abs(r.overpayBy - (260000 - r.mao)) < 1e-9);
});

test("70 percent rule is 0.7 x ARV minus rehab", () => {
  assert.equal(analyze(samplePlan()).rule70, 0.7 * 340000 - 55000);
});

test("sensitivity rows: lower sale price and longer holds both cut profit", () => {
  const r = analyze(samplePlan());
  for (let i = 1; i < r.arvRows.length; i++) assert.ok(r.arvRows[i].profit > r.arvRows[i - 1].profit);
  for (let i = 1; i < r.monthRows.length; i++) assert.ok(r.monthRows[i].profit < r.monthRows[i - 1].profit);
  assert.equal(r.arvRows.find((x) => x.step === 0).profit, r.base.profit);
});

test("months until profit is gone matches a direct re-run", () => {
  const r = analyze(samplePlan());
  const c = dealCosts(r.p, { saleMonths: r.p.saleMonths + r.monthsToZero });
  assert.ok(Math.abs(c.profit) < 0.01);
});

test("annualised return exceeds the simple return on a short hold", () => {
  const c = dealCosts(plan());
  assert.ok(c.profit > 0 && c.annualizedRoi > c.roi);
});

test("CSV export carries the summary and both sensitivity tables", () => {
  const csv = reportCsv(analyze(samplePlan()));
  assert.match(csv, /^section,label,value/);
  assert.match(csv, /Profit before income tax/);
  assert.match(csv, /sale price,/);
  assert.match(csv, /extra months on market,/);
});
