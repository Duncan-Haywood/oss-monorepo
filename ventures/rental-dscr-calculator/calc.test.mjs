import { test } from "node:test";
import assert from "node:assert/strict";
import { loanPayment, maxLoanForPayment, balanceAfter, irr, operating, hold, analyze, sampleInput, reportCsv, parseNum } from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const P = { price: 100000, rent: 1000, otherIncome: 0, loan: 0, apr: 0, termYears: 30, interestOnly: false, cashInvested: 100000, vacancy: 0, propertyTax: 0, insurance: 0, hoa: 0, utilities: 0, management: 0, maintenance: 0, rentGrowth: 0, expenseGrowth: 0, appreciation: 0, sellCost: 0, years: 10, fixedYear1: 0 };

test("loan payment matches the standard amortization figure and interest-only", () => {
  near(loanPayment(200000, 6, 30), 1199.10, 0.01);
  near(loanPayment(200000, 6, 30, true), 1000);
  near(loanPayment(1200, 0, 1), 100);
  assert.equal(loanPayment(0, 5, 5), 0);
});

test("max loan for a payment inverts the payment", () => {
  near(maxLoanForPayment(loanPayment(200000, 6, 30), 6, 30), 200000, 0.5);
  near(maxLoanForPayment(1000, 6, 30, true), 200000);
  near(maxLoanForPayment(100, 0, 1), 1200);
});

test("balance falls with amortization and holds under interest-only", () => {
  near(balanceAfter(200000, 6, 30, 360), 0, 0.5);
  assert.ok(balanceAfter(200000, 6, 30, 120) < 200000);
  assert.equal(balanceAfter(200000, 6, 30, 120, true), 200000);
  near(balanceAfter(200000, 6, 30, 120), 167371.4, 1);
});

test("operating: NOI, DSCR both ways, cash-on-cash and cap rate", () => {
  const p = { ...P, loan: 75000, apr: 0.06, propertyTax: 1200, insurance: 600, vacancy: 0.1, management: 0.1, maintenance: 0.05, cashInvested: 30000 };
  const o = operating(p);
  near(o.gross, 12000); near(o.egi, 10800);
  near(o.opex, 10800 * 0.15 + 1800);
  near(o.noi, 10800 - 1620 - 1800);
  const debt = loanPayment(75000, 6, 30) * 12;
  near(o.debt, debt);
  near(o.dscrNoi, o.noi / debt);
  near(o.dscrRent, 12000 / (debt + 1800));
  near(o.cashOnCash, (o.noi - debt) / 30000);
  near(o.capRate, o.noi / 100000);
});

test("break-even occupancy is where NOI equals debt service", () => {
  const p = { ...P, loan: 75000, apr: 0.06, propertyTax: 1200, insurance: 600, management: 0.1, cashInvested: 30000 };
  const o = operating(p);
  const occ = o.breakEven;
  const noiAt = 12000 * occ * (1 - 0.1) - 1800;
  near(noiAt, o.debt, 0.5);
});

test("hold: flat rents repay principal and sale nets value less costs and balance", () => {
  const p = { ...P, loan: 0, cashInvested: 100000, years: 5 };
  const h = hold(p);
  near(h.rows[0].noi, 12000);
  near(h.rows[4].sale, 100000);
  near(h.profit, 12000 * 5);
  near(h.irr, 0.12, 1e-6);
});

test("hold: growth, appreciation and selling costs apply", () => {
  const h = hold({ ...P, years: 2, rentGrowth: 0.1, appreciation: 0.1, sellCost: 0.05 });
  near(h.rows[1].noi, 12000 * 1.1);
  near(h.rows[1].sale, 100000 * 1.21 * 0.95);
});

test("irr solves and reports null for no sign change", () => {
  near(irr([-100, 110]), 0.1, 1e-6);
  assert.equal(irr([100, 100]), null);
});

test("analyze validates input and finds a sensible answer for the sample", () => {
  assert.match(analyze({}).error, /purchase price/);
  assert.match(analyze({ price: "100000" }).error, /monthly rent/);
  assert.match(analyze({ ...sampleInput(), apr: "99" }).error, /Interest rate/);
  const a = analyze(sampleInput());
  assert.ok(!a.error);
  assert.ok(a.base.dscrRent > a.base.dscrNoi);
  assert.equal(a.rates.length, 5);
  assert.ok(a.rates[4].dscrRent < a.rates[0].dscrRent);
  near(a.p.loan, 262500);
});

test("max loan at the target DSCR clears the target exactly", () => {
  const a = analyze(sampleInput());
  const p = { ...a.p, loan: a.maxLoanRent };
  near(operating(p).dscrRent, a.p.targetDscr, 0.01);
  const q = { ...a.p, loan: a.maxLoanNoi };
  near(operating(q).dscrNoi, a.p.targetDscr, 0.01);
});

test("a weak deal is flagged", () => {
  const a = analyze({ ...sampleInput(), rent: "1800" });
  assert.ok(a.findings.some((f) => /Below your/.test(f.title)));
  assert.ok(a.findings.some((f) => /negative/.test(f.title)));
});

test("interest-only leaves the balance alone", () => {
  const a = analyze({ ...sampleInput(), interestOnly: "yes" });
  assert.ok(a.findings.some((f) => /Interest-only/.test(f.title)));
  near(a.base.debt, 262500 * 0.0725);
});

test("csv neutralises formulas and parseNum is strict", () => {
  assert.equal(parseNum("$1,200"), 1200);
  assert.ok(Number.isNaN(parseNum("1e5")));
  assert.match(reportCsv(analyze(sampleInput())), /^Year,NOI,Debt service/);
});
