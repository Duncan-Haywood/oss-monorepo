import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, class4, SAMPLE, summaryText, liability, schedule } from "./calc.mjs";

const base = { employment: 0, paye: 0, tradingIncome: 0, tradingExpenses: 0, rent: 0, rentExpenses: 0, mortgageInterest: 0, interest: 0, dividends: 0, pensionNet: 0, giftAidNet: 0, slPaid: 0, plan: "none", pgl: "no" };
const run = (o) => compute({ ...base, ...o });
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 0.011, `${m}: ${a} vs ${b}`);

test("worked example matches a hand calculation", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  near(r.totalIncome, 58400, "total income");
  near(r.tradingProfit, 18000, "profit");
  near(r.incomeTax, 10329.5, "income tax: 9832 on non-savings + 160 savings + 337.50 dividends");
  near(r.class4Nic, 325.8, "class 4");
  near(r.total, 5955.3, "balance after PAYE");
  assert.equal(r.paymentsOnAccountDue, true);
  near(r.poaEach, 2977.65, "poa");
  near(r.jan, 8932.95, "january total");
});

test("income under the allowance pays nothing", () => {
  const r = run({ employment: 10000 });
  assert.equal(r.incomeTax, 0);
  assert.equal(r.total, 0);
});

test("unused personal allowance shelters savings, then the starting rate band does the rest", () => {
  const r = run({ employment: 10000, interest: 3000 });
  near(r.tSav, 430, "taxable savings");
  near(r.startingUsed, 430, "starting rate");
  assert.equal(r.incomeTax, 0);
});

test("personal allowance is withdrawn above 100,000 and gone at 125,140", () => {
  const r = run({ employment: 130000 });
  assert.equal(r.allowance, 0);
  near(r.incomeTax, 44703, "7540 + 34976 + 2187");
  near(run({ employment: 110000 }).allowance, 7570, "allowance at 110k");
});

test("a personal pension contribution restores the allowance and extends the band", () => {
  const r = run({ employment: 110000, pensionNet: 8000 });
  near(r.pensionGross, 10000, "gross up");
  near(r.allowance, 12570, "allowance restored");
  near(r.incomeTax, 29432, "9540 + 19892");
});

test("mortgage interest becomes a 20% credit capped by profit and income over the allowance", () => {
  const r = run({ rent: 20000, rentExpenses: 2000, mortgageInterest: 6000 });
  near(r.propProfit, 18000, "profit");
  near(r.credit, 1086, "credit");
  assert.equal(r.incomeTax, 0);
});

test("trading allowance covers a small side income and expenses win when larger", () => {
  assert.equal(run({ employment: 20000, tradingIncome: 900 }).tradingProfit, 0);
  assert.equal(run({ employment: 20000, tradingIncome: 5000, tradingExpenses: 3000 }).tradingProfit, 2000);
  assert.equal(run({ employment: 20000, tradingIncome: 5000, tradingExpenses: 500 }).tradingProfit, 4000);
});

test("a trading loss is reported and treated as zero profit", () => {
  const r = run({ employment: 20000, tradingIncome: 1000, tradingExpenses: 3000 });
  assert.equal(r.tradingProfit, 0);
  assert.equal(r.tradingLoss, 2000);
  assert.ok(r.findings.some((f) => /loss/.test(f.title)));
});

test("class 4 bands", () => {
  assert.equal(class4(12570), 0);
  near(class4(50270), 2262, "top of main band");
  near(class4(60270), 2462, "2% above");
});

test("PAYE above the liability gives a refund and no payments on account", () => {
  const r = run({ employment: 30000, paye: 5000 });
  near(r.total, -1514, "refund");
  assert.equal(r.paymentsOnAccountDue, false);
  assert.equal(r.refund, 1514);
});

test("payments on account need a 1,000 bill and under 80% collected at source", () => {
  assert.equal(run({ employment: 30000, tradingIncome: 20000, paye: 3486 }).paymentsOnAccountDue, true);
  assert.equal(run({ employment: 50000, tradingIncome: 1300, paye: 7486 }).paymentsOnAccountDue, false);
  assert.equal(run({ tradingIncome: 22000 }).paymentsOnAccountDue, true);
  assert.equal(run({ tradingIncome: 14000 }).paymentsOnAccountDue, false);
});

test("student loan is charged on total income less what payroll already took", () => {
  const r = run({ employment: 30000, tradingIncome: 20000, plan: "2", slPaid: 140.4 });
  near(r.slDue, (49000 - 28470) * 0.09, "due on total income after the 1,000 trading allowance");
  near(r.slBalance, r.slDue - 140.4, "balance after payroll");
});

test("dividends above the allowance are taxed at the dividend rates", () => {
  const r = run({ employment: 20000, dividends: 10000 });
  near(r.tDiv, 10000, "taxable dividends");
  near(r.incomeTax, 1486 + 9500 * 0.0875, "income tax");
});

test("PSA drops to 500 for higher-rate taxpayers", () => {
  const r = run({ employment: 60000, interest: 2000 });
  assert.equal(r.psaBand, 500);
  near(r.psaUsed, 500, "psa used");
});

test("marginal rate reaches 60% in the allowance taper band", () => {
  assert.ok(run({ employment: 110000 }).marginal >= 60);
});

test("invalid input is rejected, not clamped", () => {
  assert.ok(compute({ ...base }).errors.length);
  assert.ok(run({ employment: -5 }).errors.length);
  assert.ok(run({ employment: 1000, paye: 2000 }).errors.length);
  assert.ok(run({ employment: 1000, plan: "9" }).errors.length);
  assert.ok(run({ employment: "abc" }).errors.length);
  assert.ok(run({ employment: 1e9 }).errors.length);
});

test("the summary names the source and the clauses", () => {
  const t = summaryText(compute(SAMPLE));
  assert.match(t, /Verify against/);
  assert.match(t, /Not tax advice/);
  assert.match(t, /31 January 2027/);
});

test("liability and schedule are usable directly", () => {
  const p = parse({ ...base, tradingIncome: 22000 });
  const L = liability(p);
  assert.equal(schedule(p, L).paymentsOnAccountDue, true);
});
