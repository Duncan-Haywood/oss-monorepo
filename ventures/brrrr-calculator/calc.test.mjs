import { test } from "node:test";
import assert from "node:assert/strict";
import { loanPayment, maxLoanForPayment, deal, maxPriceForFullRefi, analyze, sampleInput, reportCsv, parseNum } from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const P = { price: 150000, arv: 250000, rent: 2100, rehab: 40000, holdMonths: 6, carryMonthly: 450, closingPct: 0.03, hardPct: 0.85, hardRehabPct: 1,
  hardRate: 0.11, points: 0.02, refiLtv: 0.75, refiRate: 0.07, refiTerm: 30, refiClosingPct: 0.025, targetDscr: 0, otherIncome: 0, vacancy: 0.05,
  propertyTax: 2800, insurance: 1500, hoa: 0, utilities: 0, management: 0.08, maintenance: 0.06 };

test("loan payment and its inverse", () => {
  near(loanPayment(200000, 6, 30), 1199.10);
  near(maxLoanForPayment(loanPayment(200000, 6, 30), 6, 30), 200000, 0.5);
  assert.equal(loanPayment(0, 5, 5), 0);
});

test("deal: hand-computed costs, cash in and cash out", () => {
  const d = deal(P);
  assert.equal(d.hardLoan, 167500);
  near(d.points, 3350);
  near(d.buyClosing, 4500);
  near(d.interest, 9212.5);
  near(d.carry, 2700);
  near(d.allIn, 209762.5);
  near(d.cashIn, 42262.5);
  near(d.refiLoan, 187500);
  near(d.refiCosts, 4687.5);
  near(d.cashOut, 15312.5);
  near(d.cashLeft, 26950);
  near(d.equity, 62500);
  assert.equal(d.limitedBy, "ltv");
});

test("deal: cash flow after the refinance", () => {
  const d = deal(P);
  near(d.egi, 23940);
  near(d.noi, 16288.4, 0.5);
  near(d.debt, loanPayment(187500, 7, 30) * 12, 0.01);
  near(d.cashFlow, d.noi - d.debt, 0.01);
  near(d.cashOnCash, d.cashFlow / d.cashLeft, 1e-9);
});

test("a deal that returns all cash reports excess and no cash-on-cash", () => {
  const d = deal({ ...P, price: 100000 });
  assert.equal(d.cashLeft, 0);
  assert.ok(d.cashExcess > 0);
  assert.equal(d.cashOnCash, null);
});

test("an all-cash purchase has cash in equal to all-in cost", () => {
  const d = deal({ ...P, hardPct: 0, hardRehabPct: 0, points: 0 });
  near(d.cashIn, 150000 + 40000 + 4500 + 2700);
  assert.equal(d.hardLoan, 0);
});

test("a minimum DSCR can cap the refinance below the LTV limit", () => {
  const d = deal({ ...P, rent: 1200, targetDscr: 1.25 });
  assert.equal(d.limitedBy, "dscr");
  assert.ok(d.refiLoan < d.ltvLoan);
  near(d.refiLoan, d.dscrLoan, 1e-6);
  const annualDebt = 1200 * 12 / 1.25 - 2800 - 1500;
  near(d.dscrLoan, maxLoanForPayment(annualDebt / 12, 7, 30), 0.5);
});

test("maxPriceForFullRefi leaves almost no cash and a higher price leaves some", () => {
  const m = maxPriceForFullRefi(P);
  assert.ok(m > 100000 && m < 150000);
  assert.ok(deal({ ...P, price: m }).cashLeft < 1);
  assert.ok(deal({ ...P, price: m + 1000 }).cashLeft > 0);
});

test("maxPriceForFullRefi is null when even a free property leaves cash in", () => {
  assert.equal(maxPriceForFullRefi({ ...P, rehab: 400000 }), null);
});

test("analyze: sample input, stress tables and findings", () => {
  const a = analyze(sampleInput());
  assert.equal(a.error, undefined);
  assert.equal(a.arvRows.length, 5);
  assert.equal(a.overrunRows.length, 5);
  assert.equal(a.rateRows.length, 4);
  for (let i = 1; i < a.arvRows.length; i++) assert.ok(a.arvRows[i].cashLeft <= a.arvRows[i - 1].cashLeft + 1e-9);
  assert.ok(a.overrunRows[3].cashLeft > a.overrunRows[0].cashLeft);
  near(a.seventy, 250000 * 0.7 - 40000);
  assert.ok(a.findings.length >= 4);
});

test("analyze rejects missing or absurd inputs with a message", () => {
  assert.match(analyze({}).error, /purchase price/);
  assert.match(analyze({ ...sampleInput(), arv: "" }).error, /ARV/);
  assert.match(analyze({ ...sampleInput(), rent: "0" }).error, /rent/);
  assert.match(analyze({ ...sampleInput(), hardPct: "150" }).error, /Hard-money loan/);
  assert.match(analyze({ ...sampleInput(), vacancy: "abc" }).error, /Vacancy/);
});

test("parseNum handles dollars, commas and percents", () => {
  assert.equal(parseNum("$1,250"), 1250);
  assert.equal(parseNum("7.5%"), 7.5);
  assert.ok(Number.isNaN(parseNum("abc")));
});

test("csv neutralises formula cells", () => {
  const a = analyze(sampleInput());
  const csv = reportCsv(a);
  assert.match(csv, /^Item,Amount\n/);
  assert.match(csv, /Cash left in the deal,26950/);
});
