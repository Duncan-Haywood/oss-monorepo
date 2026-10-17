import { test } from "node:test";
import assert from "node:assert/strict";
import { irr, payment, balanceAfter, parseOffers, compare, sampleOffers, offersCsv, breakEvenReturn } from "./calc.mjs";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("amortizing payment matches the textbook figure", () => {
  close(payment(100000, 0.06 / 12, 360), 599.55, 0.01);
  close(payment(1200, 0, 12), 100);
});

test("balance reaches zero at the end of the term", () => {
  close(balanceAfter(50000, 0.08 / 12, 60, 60), 0, 1e-6);
  close(balanceAfter(50000, 0.08 / 12, 60, 0), 50000, 1e-9);
});

test("a no-fee loan's true APR equals its stated APR", () => {
  const { offers } = parseOffers("Plain, loan, 100000, 9, 60");
  const r = compare(offers).results[0];
  close(r.apr, 9, 1e-4);
  close(r.cost, r.total - 100000, 1e-6);
});

test("fees raise the APR above the stated rate and cut cash received", () => {
  const { offers } = parseOffers("Fee, loan, 100000, 9, 60, 3, 1000");
  const r = compare(offers).results[0];
  assert.equal(r.net, 96000);
  assert.ok(r.apr > 9.8);
});

test("factor rate: 1.3 over 12 months is far above 30% APR, and a shorter payback is worse", () => {
  const a = compare(parseOffers("A, factor, 100000, 1.3, 12").offers).results[0];
  const b = compare(parseOffers("B, factor, 100000, 1.3, 6").offers).results[0];
  assert.equal(a.total, 130000);
  assert.ok(a.apr > 50 && a.apr < 60, String(a.apr));
  assert.ok(b.apr > a.apr * 1.8);
  assert.equal(a.cost, 30000);
});

test("irr of a simple one-period flow", () => {
  close(irr([100, -110]), 0.1, 1e-9);
  assert.ok(Number.isNaN(irr([-100, 10])));
  assert.equal(irr([100, -100]), 0);
});

test("weekly payments with the same stated APR give a slightly different effective rate, not a different nominal one", () => {
  const m = compare(parseOffers("M, loan, 100000, 12, 24, 0, 0, 12").offers).results[0];
  const w = compare(parseOffers("W, loan, 100000, 12, 24, 0, 0, 52").offers).results[0];
  close(m.apr, 12, 1e-4); close(w.apr, 12, 1e-4);
  assert.ok(w.ear > m.ear * 0 && Math.abs(w.ear - m.ear) < 0.2);
  assert.ok(w.total < m.total); // more frequent payments -> less interest accrues
});

test("early payoff: a loan with a prepayment penalty costs more per dollar than the penalty-free one", () => {
  const { offers } = parseOffers("Pen, loan, 100000, 10, 60, 0, 0, 12, 3\nFree, loan, 100000, 10, 60, 0, 0, 12, 0");
  const r = compare(offers, { payoffMonth: 12 }).results;
  assert.ok(r[0].early.cost > r[1].early.cost);
  assert.ok(r[0].early.apr > r[1].early.apr);
  close(r[1].early.apr, 10, 1e-3);
});

test("a factor offer repaid early with no discount saves nothing", () => {
  const r = compare(parseOffers("F, factor, 50000, 1.4, 12").offers, { payoffMonth: 6 }).results[0];
  close(r.early.totalPaid, r.total, 1e-6);
});

test("affordability: payment as a share of revenue and cash-flow coverage", () => {
  const r = compare(parseOffers("L, loan, 120000, 8, 60").offers, { monthlyRevenue: 40000, monthlyCashFlow: 5000 }).results[0];
  close(r.payPctRevenue, (r.monthlyPay / 40000) * 100);
  close(r.coverage, 5000 / r.monthlyPay);
});

test("ranking and warnings", () => {
  const c = compare(parseOffers(sampleOffers()).offers);
  assert.equal(c.results.length, 4);
  assert.equal(c.cheapestApr, "Bank term loan");
  assert.equal(c.rankApr[c.rankApr.length - 1], "Cash advance");
  assert.ok(c.warnings.some((w) => /different terms/.test(w)));
  assert.ok(c.results[3].flags.some((f) => /factor rate/.test(f)));
  assert.ok(c.results[3].flags.some((f) => /60%/.test(f)));
});

test("a longer term can have the lower APR and the higher dollar cost", () => {
  const c = compare(parseOffers("Long, loan, 100000, 8, 120\nShort, loan, 100000, 14, 24").offers);
  assert.equal(c.cheapestApr, "Long");
  assert.equal(c.cheapestCost, "Short");
});

test("parser: errors name the line, header and comments are skipped, kind words are forgiving", () => {
  const p = parseOffers("name, kind, amount, rate, term\n# note\nA, mca, 1000, 1.2, 6\nB, term, 1000, 5, 12\nC, loan, abc, 5, 12\nD, wat, 1, 1, 1\nE, factor, 1000, 0.9, 6\nF, loan, 1000, 5, 12, 0, 0, 7\nG, loan, 1000");
  assert.deepEqual(p.offers.map((o) => o.kind), ["factor", "loan"]);
  assert.equal(p.errors.length, 5);
  assert.match(p.errors[0], /^Line 5/);
  assert.match(p.errors.join(" "), /factor rate/);
  assert.match(p.errors.join(" "), /payments per year/);
});

test("empty input and CSV export", () => {
  assert.ok(compare([]).error);
  const csv = offersCsv(compare(parseOffers('"Big, bank", loan, 1000, 6, 12').offers));
  assert.match(csv, /^Offer,Kind/);
  assert.match(csv, /"Big, bank"/);
});

test("break-even return", () => {
  const r = compare(parseOffers("L, loan, 100000, 9, 60, 2").offers).results[0];
  const b = breakEvenReturn(r);
  close(b.monthlyCost * 60, r.cost, 1e-6);
  assert.ok(b.annualPctOfNet > 4 && b.annualPctOfNet < 9);
});

test("a payoff month shorter than one payment is skipped, not shown as NaN", () => {
  const r = compare(parseOffers("L, loan, 100000, 10, 24\nF, factor, 50000, 1.4, 12").offers, { payoffMonth: 0.3 }).results;
  assert.ok(r.every((x) => x.early === undefined));
  const ok = compare(parseOffers("L, loan, 100000, 10, 24").offers, { payoffMonth: 6 }).results[0];
  assert.ok(Number.isFinite(ok.early.apr));
});

test("quarterly and annual payments are accepted and the error lists every allowed frequency", () => {
  const p = parseOffers("Q, loan, 100000, 10, 24, 0, 0, 4\nX, loan, 1000, 5, 12, 0, 0, 7");
  assert.equal(p.offers.length, 1);
  assert.match(p.errors[0], /1, 2, 4, 12, 24, 26, 52, 252/);
});
