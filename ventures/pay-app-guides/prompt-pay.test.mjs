import { test } from "node:test";
import assert from "node:assert/strict";
import { promptPayInterest, PROMPT_PAY } from "./calc.mjs";

test("Texas example: $40,000 due 7 days after the GC is paid, paid 45 days late at 1.5% a month", () => {
  // GC paid 2026-03-01, due 2026-03-08; paid 2026-04-22 is 45 days late.
  // 4,000,000 cents x 0.015 x 45/30 = 90,000 cents.
  const r = promptPayInterest({ amount: "40000", received: "2026-03-01", paid: "2026-04-22", days: 7, rate: "1.5" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.due, "2026-03-08");
  assert.equal(r.daysLate, 45);
  assert.equal(r.interest, 90000);
  assert.equal(r.total, 4090000);
});

test("North Carolina counts each month or part of a month in full", () => {
  // 31 days late = 2 months at 1%: 1,000,000 x 0.02 = 20,000 cents.
  const r = promptPayInterest({ amount: "10000", received: "2026-01-01", paid: "2026-02-08", days: 7, rate: "1", method: "fraction" });
  assert.equal(r.daysLate, 31);
  assert.equal(r.interest, 20000);
});

test("a per-year rate prorates by 365 days (Illinois 10%)", () => {
  // 73 days late on $36,500 at 10%/yr = $730.
  const r = promptPayInterest({ amount: "36500", received: "2026-05-01", paid: "2026-07-28", days: 15, rate: "10", per: "year" });
  assert.equal(r.daysLate, 73);
  assert.equal(r.interest, 73000);
});

test("paid on time or early owes nothing", () => {
  const r = promptPayInterest({ amount: "5000", received: "2026-03-01", paid: "2026-03-05", days: 7, rate: "1.5" });
  assert.equal(r.daysLate, 0);
  assert.equal(r.interest, 0);
});

test("bad input is reported, not computed", () => {
  const r = promptPayInterest({ amount: "-1", received: "2026-02-30", paid: "x", days: "7.5", rate: "500" });
  assert.equal(r.errors.length, 5);
  assert.equal(r.interest, undefined);
});

test("every preset links an official legislature site, and rates are only where confirmed", () => {
  const official = /^https:\/\/(statutes\.capitol\.texas\.gov|leginfo\.legislature\.ca\.gov|www\.ilga\.gov|www\.ncleg\.gov|www\.legis\.state\.pa\.us|law\.lis\.virginia\.gov|www\.leg\.state\.fl\.us)\//;
  for (const [k, p] of Object.entries(PROMPT_PAY)) {
    assert.match(p.url, official, k);
    assert.ok(Number.isInteger(p.days) && p.days > 0, k);
    assert.ok(p.rate === null || (p.rate > 0 && p.rate < 0.2), k);
  }
  assert.equal(PROMPT_PAY.ca.rate, null);
  assert.equal(PROMPT_PAY.pa.rate, null);
});

test("a blank rate is asked for, not read as 0% (the CA, PA and FL presets leave it blank)", () => {
  // Red team 2026-11-25: blank showed "Interest $0.00" for 45 days late, with no error.
  const base = { amount: "40000", received: "2026-03-01", paid: "2026-04-22", days: 7 };
  const r = promptPayInterest({ ...base, rate: "" });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /rate/i);
  assert.equal(r.interest, undefined);
  // An explicit 0% is a real choice (a contract waiving interest) and computes.
  const z = promptPayInterest({ ...base, rate: "0" });
  assert.deepEqual(z.errors, []);
  assert.equal(z.interest, 0);
});

test("a month past 12 or a day past the month's end is not a date", () => {
  const base = { amount: "100", paid: "2027-03-01", days: 7, rate: "1" };
  for (const d of ["2026-13-01", "2026-00-10", "2026-04-31", "2026-02-29"]) {
    assert.equal(promptPayInterest({ ...base, received: d }).errors.length, 1, d);
  }
  assert.deepEqual(promptPayInterest({ ...base, received: "2028-02-29" }).errors, []); // a real leap day
});
