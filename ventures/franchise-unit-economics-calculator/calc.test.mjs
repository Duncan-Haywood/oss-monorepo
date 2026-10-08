import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, money, pct, monthlyPayment, investment, steady, simulate, irr, revenueForCashFlow, sensitivity, versusIndependent, analyze } from "./calc.mjs";

// Hand-checkable unit: $1.2M a year, 50% variable costs, 10% fixed, 6% royalty + 2% ad fund.
const flat = {
  ...DEFAULTS, franchiseFee: 50000, buildout: 100000, equipment: 50000, workingCapital: 0, loanAmount: 0,
  annualRevenue: 1200000, rampStartPct: 100, rampMonths: 0, growthPct: 0, cogsPct: 30, laborPct: 18, otherVarPct: 2,
  fixedMonthly: 10000, operatorPayMonthly: 0, costEscPct: 0, royaltyPct: 6, royaltyMinMonthly: 0, adFundPct: 2,
  techFeeMonthly: 0, years: 5, exitMultiple: 0, targetCashFlow: 0,
};

test("num parses money and percents, NaN otherwise", () => {
  assert.equal(num("$1,250"), 1250);
  assert.equal(num("8%"), 8);
  assert.ok(Number.isNaN(num("abc")));
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(pct(0.1234), "12.3%");
});

test("loan payment matches the standard annuity formula", () => {
  assert.ok(Math.abs(monthlyPayment(100000, 6, 10) - 1110.2) < 0.05);
  assert.equal(monthlyPayment(120000, 0, 10), 1000);
  assert.equal(monthlyPayment(0, 6, 10), 0);
});

test("investment adds the four lines and caps the loan at the total", () => {
  assert.deepEqual(investment({ ...flat, workingCapital: 25000, loanAmount: 100000 }), { total: 225000, loan: 100000, equity: 125000 });
  assert.equal(investment({ ...flat, loanAmount: 9e9 }).equity, 0);
});

test("steady month: revenue minus variable, fees and fixed", () => {
  const s = steady(flat, 1200000);
  assert.equal(s.rev, 100000);
  assert.equal(s.royalty, 6000);
  assert.equal(s.ad, 2000);
  assert.equal(s.operating, 100000 - 50000 - 6000 - 2000 - 10000);
  assert.equal(s.debt, 0);
});

test("royalty minimum applies when the percentage falls below it", () => {
  assert.equal(steady({ ...flat, royaltyMinMonthly: 9000 }, 1200000).royalty, 9000);
});

test("flat simulation: five identical years, payback from first dollars", () => {
  const sim = simulate(flat);
  assert.equal(sim.rows.length, 60);
  assert.equal(sim.byYear[0].free, 32000 * 12);
  assert.equal(sim.byYear[4].free, 32000 * 12);
  assert.equal(sim.inv.equity, 200000);
  assert.equal(sim.payback, 7); // 200000 / 32000 = 6.25 months
  assert.equal(sim.feeLoad, 0.08);
  assert.equal(sim.feesTotal, 8000 * 60);
});

test("ramp starts low and reaches full sales after rampMonths", () => {
  const sim = simulate({ ...flat, rampStartPct: 50, rampMonths: 10 });
  assert.equal(sim.rows[0].rev, 50000);
  assert.equal(sim.rows[10].rev, 100000);
  assert.ok(sim.rows[4].rev > sim.rows[3].rev);
});

test("growth and cost escalation apply once a year", () => {
  const sim = simulate({ ...flat, growthPct: 10, costEscPct: 10 });
  assert.ok(Math.abs(sim.rows[12].rev - 110000) < 1e-6);
  assert.ok(Math.abs(sim.rows[12].fixed - 11000) < 1e-6);
  assert.equal(sim.rows[11].rev, 100000);
});

test("loan: payments stop at term, remaining balance is zero at term end", () => {
  const sim = simulate({ ...flat, loanAmount: 150000, loanRatePct: 8, loanYears: 3, years: 5 });
  assert.equal(sim.inv.equity, 50000);
  assert.ok(sim.rows[35].debt > 0);
  assert.equal(sim.rows[36].debt, 0);
  assert.equal(sim.remainingLoan, 0);
  const mid = simulate({ ...flat, loanAmount: 150000, loanRatePct: 8, loanYears: 10, years: 5 });
  assert.ok(mid.remainingLoan > 0 && mid.remainingLoan < 150000);
});

test("working capital cushion: cash trough and month it runs out", () => {
  // operating = 21000*(1-0.5-0.08) - 10000 = -1180 a month; 3000 cushion -> negative in month 3.
  const sim = simulate({ ...flat, annualRevenue: 12 * 21000, workingCapital: 3000 });
  assert.equal(Math.round(sim.rows[0].operating), -1180);
  assert.equal(sim.runOut, 3);
  assert.ok(sim.extraCapital > 0);
  assert.equal(sim.payback, null);
});

test("irr: matches a known rate and handles missing sign change", () => {
  const m = Math.pow(1.1, 1 / 12) - 1;
  assert.ok(Math.abs(irr([-100, 100 * (1 + m)]) - 0.1) < 1e-6);
  assert.equal(irr([-100, -5]), null);
  assert.equal(irr([100, 5]), null);
});

test("exit multiple adds a terminal value", () => {
  const a = simulate({ ...flat, exitMultiple: 0 });
  const b = simulate({ ...flat, exitMultiple: 2 });
  assert.equal(b.terminal - a.terminal, 2 * 32000 * 12);
  assert.ok(b.irr > a.irr);
});

test("break-even revenue is exact: a steady year pays the target after debt", () => {
  for (const target of [0, 30000, 80000]) {
    const R = revenueForCashFlow(DEFAULTS, target);
    assert.ok(Math.abs(steady(DEFAULTS, R).afterDebt * 12 - target) < 0.01, String(target));
  }
});

test("break-even revenue handles the royalty minimum", () => {
  const o = { ...DEFAULTS, royaltyMinMonthly: 12000 };
  const R = revenueForCashFlow(o, 0);
  assert.ok(Math.abs(steady(o, R).afterDebt * 12) < 0.01);
  assert.equal(steady(o, R).royalty, 12000);
});

test("break-even is null when costs and fees eat every dollar", () => {
  assert.equal(revenueForCashFlow({ ...DEFAULTS, cogsPct: 60, laborPct: 30, royaltyPct: 8 }, 0), null);
});

test("sensitivity grid: base cell equals steady, worse prime cost lowers it", () => {
  const g = sensitivity(DEFAULTS);
  const base = g[2].cells[1].afterDebt;
  assert.ok(Math.abs(base - steady(DEFAULTS, DEFAULTS.annualRevenue).afterDebt * 12) < 1e-6);
  assert.ok(g[2].cells[2].afterDebt < base);
  assert.ok(g[3].cells[1].afterDebt > base);
});

test("versus independent: the tie point is where the two results match", () => {
  const v = versusIndependent(DEFAULTS);
  assert.ok(Math.abs(versusIndependent({ ...DEFAULTS, indepRevenuePct: v.tiePct * 100 }).diff) < 1);
  assert.equal(v.franchiseWins, DEFAULTS.indepRevenuePct / 100 < v.tiePct);
});

test("no sales lift, no fee, same marketing: franchise trails by exactly royalty plus tech fee", () => {
  const v = versusIndependent({ ...flat, indepRevenuePct: 100, indepMarketingPct: 2, franchiseFee: 0 });
  assert.equal(Math.round(v.diff), -0.06 * 1200000);
});

test("defaults give a coherent analysis, and garbage input does not throw", () => {
  const a = analyze({});
  assert.ok(a.sim.irr > 0 && a.sim.payback > 12);
  assert.ok(a.beRevenue < a.targetRevenue);
  assert.doesNotThrow(() => analyze({ annualRevenue: NaN, loanAmount: -5, years: 0, rampMonths: "x" }));
  assert.doesNotThrow(() => analyze({ annualRevenue: 0 }));
});
