import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseDate, federalHolidays, isBankingDay, addBankingDays, semiweeklyPeriodEnd, semiweeklyDue, monthlyDue, nextDayDue,
  depositorSchedule, buildObligations, penaltyPct, allocate, analyse, parseRows, toCents, findings,
} from "./calc.mjs";

test("2026 federal holidays, hand counted, Saturday July 4 is not moved", () => {
  const h = [...federalHolidays(2026)].sort();
  assert.deepEqual(h, ["2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19", "2026-07-04", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25"]);
  assert.equal(isBankingDay("2026-07-03"), true); // Fed stays open the Friday
  assert.equal(isBankingDay("2026-07-04"), false);
});

test("a Sunday holiday is observed on Monday", () => {
  assert.equal(federalHolidays(2027).has("2027-07-05"), true);
  assert.equal(isBankingDay("2027-07-05"), false);
});

test("parseDate accepts both formats and rejects impossible dates", () => {
  assert.equal(parseDate("3/4/2026"), "2026-03-04");
  assert.equal(parseDate("2026-03-04"), "2026-03-04");
  assert.throws(() => parseDate("2026-02-30"), /real calendar date/);
  assert.throws(() => parseDate("soon"), /not a date/);
});

test("semiweekly: Wed-Fri paydays are due the following Wednesday, Sat-Tue the following Friday", () => {
  assert.equal(semiweeklyPeriodEnd("2026-03-04"), "2026-03-06");
  assert.equal(semiweeklyDue("2026-03-04"), "2026-03-11");
  assert.equal(semiweeklyDue("2026-03-06"), "2026-03-11");
  assert.equal(semiweeklyPeriodEnd("2026-03-07"), "2026-03-10");
  assert.equal(semiweeklyDue("2026-03-07"), "2026-03-13");
  assert.equal(semiweeklyDue("2026-03-10"), "2026-03-13");
});

test("semiweekly: Memorial Day inside the window pushes the due date one banking day", () => {
  assert.equal(semiweeklyDue("2026-05-22"), "2026-05-28"); // Thu, not Wed
});

test("monthly: the 15th, rolled past a weekend and Presidents Day", () => {
  assert.equal(monthlyDue("2026-01-09"), "2026-02-17"); // Feb 15 Sun, 16 holiday
  assert.equal(monthlyDue("2026-02-06"), "2026-03-16"); // Mar 15 is a Sunday
  assert.equal(monthlyDue("2026-12-04"), "2027-01-15");
});

test("next-day rule skips weekends", () => {
  assert.equal(nextDayDue("2026-03-05"), "2026-03-06");
  assert.equal(nextDayDue("2026-03-06"), "2026-03-09");
  assert.equal(addBankingDays("2026-11-25", 1), "2026-11-27");
});

test("lookback: $50,000 exactly is monthly, one dollar more is semiweekly", () => {
  assert.equal(depositorSchedule({ lookbackTotal: "50000" }).schedule, "monthly");
  assert.equal(depositorSchedule({ lookbackTotal: "50000.01" }).schedule, "semiweekly");
  assert.equal(depositorSchedule({ newEmployer: true }).schedule, "monthly");
  assert.throws(() => depositorSchedule({ lookbackTotal: "abc" }), /must be a number/);
});

test("penalty tiers: 2% days 1-5, 5% days 6-15, 10% from day 16", () => {
  assert.deepEqual([0, 1, 5, 6, 15, 16, 400].map(penaltyPct), [0, 2, 2, 5, 5, 10, 10]);
});

test("monthly liabilities group by month and carry the right due date", () => {
  const { obligations } = buildObligations(parseRows("2026-01-09, 4000\n2026-01-23, 6000\n2026-02-06, 12000", "Payday"), "monthly");
  assert.equal(obligations.length, 2);
  assert.equal(obligations[0].cents, 1_000_000);
  assert.equal(obligations[0].due, "2026-02-17");
  assert.equal(obligations[1].due, "2026-03-16");
});

test("the $100,000 rule makes that amount due next banking day and flips a monthly depositor", () => {
  const { obligations, notes, endSchedule } = buildObligations(parseRows("2026-03-02, 60000\n2026-03-04, 45000\n2026-03-11, 3000", "Payday"), "monthly");
  assert.equal(obligations[0].rule, "next-day");
  assert.equal(obligations[0].cents, 10_500_000);
  assert.equal(obligations[0].due, "2026-03-05");
  assert.equal(obligations[1].rule, "semiweekly"); // after the switch
  assert.equal(obligations[1].due, "2026-03-18");
  assert.equal(endSchedule, "semiweekly");
  assert.ok(notes.some((n) => /becomes semiweekly/.test(n)));
});

test("a quarter under $2,500 is flagged as payable with the return", () => {
  const { notes } = buildObligations(parseRows("2026-01-09, 900\n2026-02-06, 1000", "Payday"), "monthly");
  assert.ok(notes.some((n) => /2026-Q1/.test(n) && /under \$2,500/.test(n)));
});

const SCENARIO = {
  newEmployer: false,
  lookbackTotal: "30000",
  asOf: "2026-03-20",
  liabilities: "2026-01-09, 10000\n2026-02-06, 12000",
  deposits: "2026-03-02, 10000",
};

test("default ordering applies the deposit to the newest liability, leaving the oldest at 10%", () => {
  const r = analyse(SCENARIO);
  // Feb obligation gets 10,000 on time; Jan 10,000 unpaid 31 days late = 10% = 1,000;
  // Feb remainder 2,000 unpaid 4 days late = 2% = 40.
  assert.equal(r.default.penaltyCents, 104_000);
});

test("oldest-first designation: Jan gets it 13 days late (5% = 500), Feb 12,000 unpaid 4 days late (2% = 240)", () => {
  assert.equal(analyse(SCENARIO).oldest.penaltyCents, 74_000);
});

test("optimal matching equals the better hand answer here and the saving is 300", () => {
  const r = analyse(SCENARIO);
  assert.equal(r.optimal.penaltyCents, 74_000);
  assert.equal(r.savingCents, 30_000);
});

test("optimal is never worse than either ordering on a mixed scenario", () => {
  const r = analyse({
    newEmployer: false, lookbackTotal: "80000", asOf: "2026-04-30",
    liabilities: "2026-03-04, 8000\n2026-03-11, 9000\n2026-03-18, 7000\n2026-03-25, 11000\n2026-04-01, 6000",
    deposits: "2026-03-30, 9000\n2026-04-08, 7000\n2026-04-20, 12000",
  });
  assert.ok(r.optimal.penaltyCents <= r.default.penaltyCents);
  assert.ok(r.optimal.penaltyCents <= r.oldest.penaltyCents);
  const paid = r.optimal.chunks.reduce((a, c) => a + c.cents, 0);
  assert.equal(paid, r.owedCents);
});

test("everything deposited on time costs nothing", () => {
  const r = analyse({ newEmployer: false, lookbackTotal: "10000", asOf: "2026-03-20", liabilities: "2026-01-09, 5000", deposits: "2026-02-13, 5000" });
  assert.equal(r.default.penaltyCents, 0);
  assert.equal(r.optimal.penaltyCents, 0);
  assert.equal(findings(r)[0].severity, "info");
});

test("a deposit before any liability accrued is surplus, not applied", () => {
  const r = analyse({ newEmployer: false, lookbackTotal: "10000", asOf: "2026-03-20", liabilities: "2026-02-06, 5000", deposits: "2026-01-02, 5000" });
  assert.equal(r.default.surplusCents, 500_000);
  assert.equal(r.default.unpaidLateCents, 500_000);
});

test("deposits dated after the as-of date are ignored and said so", () => {
  const r = analyse({ ...SCENARIO, deposits: "2026-03-02, 10000\n2026-04-02, 5000" });
  assert.ok(r.notes.some((n) => /ignored/.test(n)));
  assert.equal(r.default.penaltyCents, 104_000);
});

test("bad input throws with the line number", () => {
  assert.throws(() => parseRows("2026-01-09 5000\n2026-13-01, 5", "Payday"), /Payday line 2/);
  assert.throws(() => toCents("-5"), /cannot be negative/);
  assert.throws(() => analyse({ ...SCENARIO, liabilities: "" }), /at least one payday/);
});

test("calc has no network access", () => {
  assert.doesNotMatch(readFileSync(new URL("./calc.mjs", import.meta.url), "utf8"), /\bfetch\(|XMLHttpRequest/);
});
