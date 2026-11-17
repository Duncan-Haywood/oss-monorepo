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

test("the finance-cost credit's income limit leaves out dividends and savings (quality audit 2026-11-17)", () => {
  const r = compute({ ...base, rent: 15000, rentExpenses: 2000, mortgageInterest: 10000, dividends: 20000 });
  // 13,000 property profit - 12,570 allowance = 430 adjusted total income, so the
  // credit is 20% of 430 = 86; tax = 86 + (20,000 - 500) x 8.75% = 1,792.25 - 86.
  near(r.credit, 86, "credit");
  near(r.incomeTax, 1706.25, "income tax");
});

// Red-team 2026-11-17: guards for the three census-audit defects and the findings layer.
const titles = (r) => r.findings.map((f) => f.title).join("\n");

test("student loan leaves out unearned income of 2,000 or less (GOV.UK: only unearned income in excess of 2,000 counts)", () => {
  // Audit case: 30,000 pay + 1,500 interest on Plan 2 -> (30,000 - 28,470) x 9% = 137.70.
  near(run({ employment: 30000, interest: 1500, plan: "2" }).slDue, 137.7, "1,500 interest left out");
  near(run({ employment: 30000, interest: 1000, dividends: 1000, rent: 0, plan: "2" }).slDue, 137.7, "exactly 2,000 left out");
  // Property profit is unearned too: 3,000 rent less the 1,000 allowance = 2,000, left out.
  near(run({ employment: 30000, rent: 3000, plan: "2" }).slDue, 137.7, "2,000 property profit left out");
  // Over 2,000 the whole of it counts, as before.
  near(run({ employment: 30000, interest: 2500, plan: "2" }).slDue, (32500 - 28470) * 0.09, "2,500 interest counted");
  near(run({ employment: 30000, interest: 1500, pgl: "yes" }).slDue, (30000 - 21000) * 0.06, "postgraduate loan the same way");
});

test("Plan 5 collects nothing in 2025/26 (repayments start in April 2026)", () => {
  const r = run({ employment: 40000, plan: "5" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.slDue, 0);
  assert.match(titles(r), /Plan 5 repayments start in April 2026/);
  near(run({ employment: 40000, plan: "4" }).slDue, (40000 - 32745) * 0.09, "Plan 4");
  near(run({ employment: 40000, plan: "1" }).slDue, (40000 - 26065) * 0.09, "Plan 1");
});

test("the property route with the lower bill wins, so a small expense figure no longer forfeits the mortgage credit", () => {
  // Audit case: 30,000 pay, 10,000 rent, 500 expenses, 6,000 mortgage interest.
  // Allowance route: profit 9,000, no credit -> 3,486 + 1,800 = 5,286.
  // Expenses route: profit 9,500, credit 20% x 6,000 = 1,200 -> 3,486 + 1,900 - 1,200 = 4,186.
  const r = run({ employment: 30000, rent: 10000, rentExpenses: 500, mortgageInterest: 6000 });
  assert.equal(r.propUsedAllowance, false);
  near(r.propProfit, 9500, "property profit");
  near(r.credit, 1200, "credit");
  near(r.incomeTax, 4186, "income tax");
  // No cliff: at the old switch point (expenses 1,000 -> 1,001) the bill moved by 1,200; now by 20p.
  const at = (e) => run({ employment: 30000, rent: 10000, rentExpenses: e, mortgageInterest: 6000 }).incomeTax;
  assert.ok(Math.abs(at(1001) - at(1000)) < 1, `${at(1001)} vs ${at(1000)}`);
  // Without mortgage interest the allowance still wins when it beats expenses.
  const r3 = run({ employment: 30000, rent: 10000, rentExpenses: 500 });
  assert.equal(r3.propUsedAllowance, true);
  near(r3.propProfit, 9000, "allowance route");
});

test("the allowance-over-credit warning appears only when the allowance really is the better route", () => {
  const warn = /property allowance/;
  assert.doesNotMatch(titles(run({ employment: 30000, rent: 10000, rentExpenses: 500, mortgageInterest: 6000 })).replace(/trading allowance/g, ""), /cannot be combined/);
  // Tiny mortgage interest: 20% x 100 = 20 credit is worth less than the 900 extra relief.
  const r = run({ employment: 30000, rent: 10000, rentExpenses: 100, mortgageInterest: 100 });
  assert.equal(r.propUsedAllowance, true);
  assert.match(titles(r), warn);
  assert.match(titles(r), /cannot be combined/);
  // No rent, no warning.
  assert.doesNotMatch(titles(run({ employment: 30000, mortgageInterest: 100 })), /cannot be combined/);
});

test("a refund is reported as a refund", () => {
  const r = run({ employment: 20000, paye: 3000 });
  near(r.total, -1514, "3,000 PAYE against 1,486 tax");
  near(r.refund, 1514, "refund");
  assert.equal(r.jan, 0);
  assert.match(titles(r), /a refund of GBP 1,514/);
  assert.equal(run({ employment: 20000, paye: 1486 }).refund, 0);
});

test("effective rate is a percentage of total income", () => {
  near(run({ employment: 50000 }).effective, 7486 / 500, "7,486 on 50,000 is 14.97%");
});

test("the headline names the bill, and a sub-1,000 bill says no payments on account", () => {
  const r = run({ employment: 20000, tradingIncome: 2000 });
  // 1,000 profit after the trading allowance: 200 tax, no Class 4.
  near(r.total, 1686, "PAYE is zero, so the whole 1,686 is due");
  assert.match(titles(r), /Estimated 2025\/26 bill: GBP 1,686 to pay/);
  const small = run({ employment: 20000, paye: 1486, tradingIncome: 1001 });
  near(small.total, 0.2, "1 pound of profit, 20p tax");
  assert.match(titles(small), /No payments on account are triggered/);
  assert.doesNotMatch(titles(run({ employment: 20000, paye: 1486 })), /No payments on account/);
});

test("the Class 4 note appears only once profit passes the lower limit", () => {
  assert.doesNotMatch(titles(run({ tradingIncome: 13570 })), /Class 4 National Insurance: GBP/);
  assert.match(titles(run({ tradingIncome: 13571 })), /Class 4 National Insurance: GBP 0\.06/);
});

test("both what-ifs are priced on a 1,000 net outlay", () => {
  const r = run({ employment: 60000 });
  assert.deepEqual(r.savings.map((s) => s.cost), [1000, 1000]);
  // Higher rate: 1,250 gross extends the basic band, saving 20% x 1,250 = 250 each.
  for (const s of r.savings) near(s.delta, 250, s.label);
});

test("the headline names Class 4 National Insurance when there is any", () => {
  assert.match(titles(run({ tradingIncome: 22000 })), /^Estimated 2025\/26 bill: .*Class 4 National Insurance GBP 505\.80/m);
});
