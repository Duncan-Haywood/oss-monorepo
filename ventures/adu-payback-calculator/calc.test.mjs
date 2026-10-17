import { test } from "node:test";
import assert from "node:assert/strict";
import { parseItems, analyze, monthlyPayment, loanBalance, npv, irr, reportCsv, sampleCosts, sampleOpex } from "./calc.mjs";

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const costs = (t) => parseItems(t).rows;

test("parses items, keeping commas in names and counting skips", () => {
  const p = parseItems('"Fees, permits",$18,000\nFraming,70000\nbad line\nNeg,-5', "cost");
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[0].amount, 18000);
  assert.match(p.warnings.join(" "), /2 cost line/);
});

test("loan payment matches the standard annuity formula", () => {
  // 176,000 at 7% over 25 years: known payment about 1,243.93
  near(monthlyPayment(176000, 7, 25), 1243.9313872, 1e-4);
  near(monthlyPayment(120000, 0, 10), 1000);
  assert.equal(monthlyPayment(0, 7, 25), 0);
});

test("loan balance is the principal at 0 payments and zero after the term", () => {
  near(loanBalance(100000, 6, 30, 0), 100000);
  near(loanBalance(100000, 6, 30, 360), 0);
  // standard amortisation table: 100k at 6%/30y leaves 98,771.99 after 12 payments.
  near(loanBalance(100000, 6, 30, 12), 98771.99, 0.01);
  near(loanBalance(120000, 0, 10, 60), 60000);
});

test("npv and irr agree and handle degenerate flows", () => {
  near(npv(0.1, [-100, 110]), 0);
  near(irr([-100, 110]), 0.1, 1e-9);
  near(irr([-1000, 300, 400, 500]), 0.0889635, 1e-5);
  assert.equal(irr([100, 100]), null);
  assert.equal(irr([-100, -5]), null);
});

test("all-cash build: yield, simple payback and IRR by hand", () => {
  // cost 100,000, no contingency, rent 2,000/mo, no vacancy, opex 4,000 flat, no growth
  // NOI = 24,000 - 4,000 = 20,000 -> yield 20%, payback 5 years
  const r = analyze(costs("Build,100000"), costs("Costs,4000"), {
    contingencyPct: 0, loanPct: 0, rentMonthly: 2000, vacancyPct: 0, rentGrowthPct: 0, opexGrowthPct: 0, holdYears: 10, valueUplift: 0, discountPct: 10,
  });
  near(r.unleveredYield, 0.2);
  near(r.simplePayback, 5);
  assert.equal(r.equityPaybackYear, 5);
  near(r.financing.equity, 100000);
  // IRR of -100000 then ten years of 20000
  near(r.irr, irr([-100000, ...Array(10).fill(20000)]), 1e-9);
  assert.ok(r.irr > 0.15 && r.irr < 0.16);
  near(r.npv, npv(0.1, [-100000, ...Array(10).fill(20000)]), 1e-6);
});

test("contingency raises the cost and vacancy and management reduce income", () => {
  const r = analyze(costs("Build,100000"), costs("Costs,0"), {
    contingencyPct: 10, loanPct: 0, rentMonthly: 1000, vacancyPct: 10, managementPct: 10, rentGrowthPct: 0, holdYears: 5,
  });
  near(r.cost.total, 110000);
  // collected 12000 * 0.9 = 10800; management 1080; NOI 9720
  near(r.year1.collected, 10800);
  near(r.year1.noi, 9720);
  near(r.unleveredYield, 9720 / 110000);
});

test("financed build: year-1 debt service is twelve payments and equity is the unfinanced share", () => {
  const r = analyze(costs("Build,200000"), costs("Costs,5000"), {
    contingencyPct: 10, loanPct: 80, loanRate: 7, loanYears: 25, rentMonthly: 2600, vacancyPct: 5, rentGrowthPct: 3, opexGrowthPct: 3, holdYears: 10, valueUplift: 230000, appreciationPct: 3, sellingCostPct: 6, discountPct: 8,
  });
  near(r.financing.loan, 176000);
  near(r.financing.equity, 44000);
  near(r.year1.debt, monthlyPayment(176000, 7, 25) * 12, 1e-6);
  near(r.year1.cash, r.year1.noi - r.year1.debt, 1e-6);
  // exit: uplift grown 10y at 3%, less 6% selling, less balance after 120 payments
  const value = 230000 * Math.pow(1.03, 10);
  near(r.sale.net, value * 0.94 - loanBalance(176000, 7, 25, 120), 1e-4);
  // IRR reproduces from the published year table
  const flows = [-44000, ...r.years.map((y) => y.cash)];
  flows[10] += r.sale.net;
  near(r.irr, irr(flows), 1e-9);
});

test("break-even rents solve their own equations", () => {
  const base = { contingencyPct: 0, loanPct: 80, loanRate: 6, loanYears: 30, rentMonthly: 3000, vacancyPct: 5, managementPct: 0, rentGrowthPct: 2, opexGrowthPct: 2, holdYears: 10, valueUplift: 150000, appreciationPct: 3, sellingCostPct: 6, discountPct: 8 };
  const c = costs("Build,250000"), o = costs("Costs,6000");
  const r = analyze(c, o, base);
  const atBe = analyze(c, o, { ...base, rentMonthly: r.breakEvenRent });
  near(atBe.npv, 0, 1e-3);
  const atCash = analyze(c, o, { ...base, rentMonthly: r.cashBreakEvenRent });
  near(atCash.year1.cash, 0, 1e-6);
});

test("sensitivity: more rent never lowers return, more cost never raises it", () => {
  const r = analyze(costs(sampleCosts()), costs(sampleOpex()), { rentMonthly: 2600, valueUplift: 230000 });
  assert.deepEqual(r.sensitivity.map((s) => s.delta), [-20, -10, 0, 10, 20]);
  for (let i = 1; i < 5; i++) {
    assert.ok(r.sensitivity[i].npv > r.sensitivity[i - 1].npv);
    assert.ok(r.costSens[i].npv < r.costSens[i - 1].npv);
  }
  near(r.sensitivity[2].npv, r.npv, 1e-6);
  near(r.costSens[2].npv, r.npv, 1e-6);
});

test("owner-use months remove rent for those months", () => {
  const a = analyze(costs("B,100000"), [], { loanPct: 0, rentMonthly: 1000, vacancyPct: 0, contingencyPct: 0, rentGrowthPct: 0 });
  const b = analyze(costs("B,100000"), [], { loanPct: 0, rentMonthly: 1000, vacancyPct: 0, contingencyPct: 0, rentGrowthPct: 0, ownerUseMonths: 3 });
  near(a.year1.collected, 12000);
  near(b.year1.collected, 9000);
});

test("zero uplift warns; an all-cash build with no uplift reports no negative equity", () => {
  const r = analyze(costs("B,100000"), [], { loanPct: 0, rentMonthly: 1000 });
  assert.match(r.warnings.join(" "), /Value uplift is zero/);
  assert.ok(r.irr !== null);
  assert.match(r.verdict, /yield on cost|returns/i);
});

test("a 100% financed build has no equity, so IRR and NPV are n/a", () => {
  const r = analyze(costs("B,100000"), [], { loanPct: 100, loanRate: 6, rentMonthly: 1000 });
  assert.equal(r.irr, null);
  assert.equal(r.npv, null);
});

test("rent below loan plus costs warns about negative cash flow", () => {
  const r = analyze(costs("B,300000"), costs("Costs,6000"), { loanPct: 90, loanRate: 8, rentMonthly: 1500 });
  assert.ok(r.year1.cash < 0);
  assert.match(r.warnings.join(" "), /do not cover|does not cover|add cash/i);
});

test("validation errors", () => {
  const c = costs("B,100000");
  assert.match(analyze([], [], { rentMonthly: 1000 }).error, /build cost/);
  assert.match(analyze(c, [], {}).error, /monthly rent/);
  assert.match(analyze(c, [], { rentMonthly: 1000, loanPct: 120 }).error, /100%/);
  assert.match(analyze(c, [], { rentMonthly: 1000, vacancyPct: 100 }).error, /Vacancy/);
  assert.match(analyze(c, [], { rentMonthly: 1000, holdYears: 0 }).error, /Hold period/);
  assert.match(analyze(c, [], { rentMonthly: 1000, holdYears: 41 }).error, /Hold period/);
  assert.match(analyze(c, [], { rentMonthly: 1000, ownerUseMonths: 13 }).error, /12/);
  assert.match(analyze(c, [], { rentMonthly: "abc" }).error, /rentMonthly/);
  assert.match(analyze(c, [], { rentMonthly: 1000, loanRate: -1 }).error, /negative/);
});

test("CSV has the year rows and quotes commas", () => {
  const r = analyze(costs(sampleCosts()), costs(sampleOpex()), { rentMonthly: 2600, valueUplift: 230000 });
  const csv = reportCsv(r);
  const lines = csv.trim().split("\n");
  assert.match(lines[0], /^Year,Rent collected/);
  assert.equal(lines.filter((l) => /^\d+,/.test(l)).length, 10);
  assert.match(csv, /Equity IRR/);
});
