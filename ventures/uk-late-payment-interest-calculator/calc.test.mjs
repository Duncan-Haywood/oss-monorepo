import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, compensationFor, referenceKey, SAMPLE, summaryText } from "./calc.mjs";

test("fixed compensation tiers", () => {
  assert.equal(compensationFor(999.99), 40);
  assert.equal(compensationFor(1000), 70);
  assert.equal(compensationFor(9999.99), 70);
  assert.equal(compensationFor(10000), 100);
});

test("reference half-year follows the due date", () => {
  assert.equal(referenceKey(Date.parse("2026-06-30T00:00:00Z")), "2026-H1");
  assert.equal(referenceKey(Date.parse("2026-07-01T00:00:00Z")), "2026-H2");
});

test("worked example: £4,800 due 31 Jul 2026, 75 days late", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.equal(r.daysLate, 75);
  assert.equal(r.rate, 11.75);
  assert.equal(r.interest, Math.round(4800 * 0.1175 / 365 * 75 * 100) / 100);
  assert.equal(r.compensation, 70);
  assert.equal(r.total, Math.round((4800 + r.interest + 70) * 100) / 100);
});

test("not yet overdue gives zero interest", () => {
  const r = compute({ ...SAMPLE, asOf: "2026-07-31" });
  assert.equal(r.daysLate, 0);
  assert.equal(r.interest, 0);
});

test("30-day default when no date was agreed", () => {
  const r = compute({ ...SAMPLE, dueMode: "invoice30", dueDate: "2026-06-01" });
  assert.equal(r.dueDate, "2026-07-01");
  assert.equal(referenceKey(r.dueTime), "2026-H2");
});

test("base rate override and unknown periods", () => {
  assert.equal(compute({ ...SAMPLE, baseOverride: "4" }).rate, 12);
  const old = compute({ ...SAMPLE, dueDate: "2021-03-01" });
  assert.match(old.errors[0], /No base rate is built in/);
});

test("consumers and bad input are refused", () => {
  assert.match(compute({ ...SAMPLE, clientType: "consumer" }).errors[0], /two businesses/);
  assert.ok(compute({ ...SAMPLE, amount: "0" }).errors.length);
  assert.ok(compute({ ...SAMPLE, dueDate: "31/07/2026" }).errors.length);
});

test("recovery costs are added and letter carries the figures", () => {
  const r = compute({ ...SAMPLE, recoveryCosts: "50" });
  assert.equal(r.claimable, Math.round((r.interest + 70 + 50) * 100) / 100);
  assert.match(r.letter, /Late Payment of Commercial Debts/);
  assert.match(r.letter, /Northgate Fabrication Ltd/);
  assert.match(summaryText(r), /Not legal advice/);
});

test("base rate override is bounded to 0-30 inclusive", () => {
  assert.equal(compute({ ...SAMPLE, baseOverride: "30" }).rate, 38);
  assert.equal(compute({ ...SAMPLE, baseOverride: "0" }).rate, 8);
  for (const bad of ["-1", "30.5", "31", "abc"]) {
    assert.match(compute({ ...SAMPLE, baseOverride: bad }).errors[0] || "", /between 0 and 30/, bad);
  }
});

test("30/60/90 day horizon dates step forward from the as-of date", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.horizon.map((h) => h.date), ["2026-11-13", "2026-12-13", "2027-01-12"]);
  assert.equal(r.horizon[0].interest, Math.round(4800 * 0.1175 / 365 * 105 * 100) / 100);
});

test("impossible calendar dates are refused, not rolled into the next month", () => {
  assert.ok(compute({ ...SAMPLE, dueDate: "2026-02-30" }).errors.length);
  assert.ok(compute({ ...SAMPLE, asOf: "2026-09-31" }).errors.length);
  assert.deepEqual(compute({ ...SAMPLE, dueDate: "2028-02-29", asOf: "2028-03-01" }).errors.filter((e) => /YYYY/.test(e)), []);
});

test("a non-finite amount or a blank base rate is not a number", () => {
  assert.ok(compute({ ...SAMPLE, amount: "Infinity" }).errors.length);
  assert.equal(compute({ ...SAMPLE, baseOverride: "  " }).rate, 11.75);
});

test("before the due date nothing is claimable and the horizon counts only days actually late", () => {
  // due 31 Jul 2026, figure on 21 Jul: 10 days early
  const r = compute({ ...SAMPLE, asOf: "2026-07-21" });
  assert.equal(r.daysLate, 0);
  assert.equal(r.compensation, 0);
  assert.equal(r.claimable, 0);
  assert.equal(r.total, 4800);
  assert.match(summaryText(r), /claimable on top of the invoice: £0\.00/);
  // 30 days on (20 Aug) it is 20 days late, with the £70 fixed sum now due
  const perDay = 4800 * 0.1175 / 365;
  assert.equal(r.horizon[0].interest, Math.round(perDay * 20 * 100) / 100);
  assert.equal(r.horizon[0].total, Math.round((4800 + perDay * 20 + 70) * 100) / 100);
  // a horizon date still before the due date carries neither interest nor compensation
  const early = compute({ ...SAMPLE, asOf: "2026-05-01" });
  assert.equal(early.horizon[0].interest, 0);
  assert.equal(early.horizon[0].total, 4800);
});
