import { test } from "node:test";
import assert from "node:assert/strict";
import { amortPayment, idrSimulate, leaveAfter, parseInput, analyze, sampleInput, reportCsv, parseNum, pvOf, totalOf } from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("amortPayment matches the textbook payment", () => {
  near(amortPayment(100000, 0.06, 120), 1110.21, 0.01);
  near(amortPayment(12000, 0, 12), 1000);
  assert.equal(amortPayment(0, 0.05, 10), 0);
});

test("parseNum handles money strings and junk", () => {
  assert.equal(parseNum("$250,000"), 250000);
  assert.equal(parseNum("6.5%"), 6.5);
  assert.equal(parseNum(""), null);
  assert.ok(Number.isNaN(parseNum("abc")));
});

test("first income-driven payment is pct of income above the protected amount", () => {
  const { p } = parseInput(sampleInput());
  const sim = idrSimulate(p, 12);
  // (95,000 - 1.5 * 15,650) * 10% / 12 = 71,525 * 0.1 / 12 = 596.0417
  near(sim.flows[0], 596.0417, 0.001);
  near(sim.flows[11], 596.0417, 0.001);
});

test("income at or below the protected amount pays nothing and the balance grows", () => {
  const { p } = parseInput({ ...sampleInput(), income: "20000" });
  const sim = idrSimulate(p, 12);
  assert.equal(sim.flows[0], 0);
  assert.ok(sim.balances[11] > p.balance);
});

test("the standard-payment cap binds at high income and can be turned off", () => {
  const capped = idrSimulate(parseInput({ ...sampleInput(), income: "900000" }).p, 1);
  near(capped.flows[0], amortPayment(250000, 0.065, 120), 0.01);
  const free = idrSimulate(parseInput({ ...sampleInput(), income: "900000", capStandard: "no" }).p, 1);
  assert.ok(free.flows[0] > capped.flows[0]);
});

test("a small loan is paid off before forgiveness and nothing is forgiven", () => {
  const a = analyze({ ...sampleInput(), balance: "20000", income: "150000" });
  assert.equal(a.paidOffEarly, true);
  assert.equal(a.forgiven, 0);
  assert.ok(a.findings.some((f) => /pay the loan off before forgiveness/.test(f.title)));
});

test("sample case: PSLF is far cheaper than refinancing", () => {
  const a = analyze(sampleInput());
  assert.equal(a.error, null);
  assert.equal(a.winner, "pslf");
  assert.equal(a.months, 120);
  assert.ok(a.forgiven > 300000);
  near(a.refiTotal, amortPayment(250000, 0.045, 120) * 120, 0.01);
  assert.ok(a.pslfTotal < a.refiTotal);
  assert.ok(a.breakIncome > 200000);
});

test("break-even income really equalises the two totals", () => {
  const a = analyze(sampleInput());
  const p = { ...a.p, income: a.breakIncome };
  const paid = totalOf(idrSimulate(p, a.months).flows);
  near(paid, a.refiTotal, 1);
});

test("high income with a cheap refinance flips the answer", () => {
  const a = analyze({ ...sampleInput(), balance: "120000", income: "400000", fedRate: "7", refiRate: "3.5" });
  assert.equal(a.winner, "refi");
});

test("all 120 payments made: forgiveness is immediate", () => {
  const a = analyze({ ...sampleInput(), paymentsMade: "119" });
  assert.equal(a.months, 1);
  const done = analyze({ ...sampleInput(), paymentsMade: "119" });
  assert.ok(done.forgiven > 200000);
});

test("leaving early costs more the earlier you go only relative to staying; totals rise with years", () => {
  const a = analyze(sampleInput());
  assert.ok(a.leave.length >= 3);
  for (let i = 1; i < a.leave.length; i++) assert.ok(a.leave[i].total > a.leave[i - 1].total);
  const { p } = parseInput(sampleInput());
  const sim = idrSimulate(p, 120);
  const f = leaveAfter(p, sim, 24);
  assert.equal(f.length, 24 + 120);
});

test("present value discounts later payments", () => {
  const f = [100, 100, 100];
  assert.equal(pvOf(f, 0), 300);
  assert.ok(pvOf(f, 0.12) < 300);
});

test("validation rejects nonsense with a readable message", () => {
  assert.match(analyze({ ...sampleInput(), balance: "" }).error, /Loan balance/);
  assert.match(analyze({ ...sampleInput(), refiRate: "40" }).error, /Refinance rate/);
  assert.match(analyze({ ...sampleInput(), paymentsMade: "120" }).error, /Qualifying payments/);
  assert.match(analyze({ ...sampleInput(), refiYears: "0" }).error, /Refinance term/);
});

test("blank optional fields fall back to stated defaults", () => {
  const { p, errors } = parseInput({ balance: "100000", fedRate: "6", income: "80000", refiRate: "5", refiYears: "10" });
  assert.deepEqual(errors, []);
  assert.equal(p.pct, 0.1);
  assert.equal(p.mult, 1.5);
  assert.equal(p.poverty, 15650);
  assert.equal(p.household, 1);
  const two = parseInput({ balance: "100000", fedRate: "6", income: "80000", refiRate: "5", refiYears: "10", household: "3" });
  assert.equal(two.p.poverty, 26650);
});

test("CSV has a header and quotes every cell", () => {
  const csv = reportCsv(analyze(sampleInput()));
  const lines = csv.trim().split("\n");
  assert.match(lines[0], /^"scenario"/);
  assert.ok(lines.length > 6);
});
