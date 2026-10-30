import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement } from "./engine.mjs";
import { addPayroll } from "./payroll.mjs";
import { depositSchedule, lookbackTotal } from "./deposits.mjs";

const HEAD = "Pay Date,Gross Pay,Federal Income Tax,Social Security,Medicare,State Income Tax,Other Deductions,Net Pay,Employer Social Security,Employer Medicare,FUTA,SUTA";
// gross g: fed 10%, SS 6.2%, Medicare 1.45%; employer SS and Medicare match. Federal deposit = 10% + 15.3% = 25.3% of g.
const row = (date, g) => {
  const c = Math.round(g * 100), p = (x) => (Math.round(c * x) / 100).toFixed(2);
  const fed = Math.round(c * 0.1), ss = Math.round(c * 0.062), med = Math.round(c * 0.0145);
  return `${date},${(c / 100).toFixed(2)},${(fed / 100).toFixed(2)},${(ss / 100).toFixed(2)},${(med / 100).toFixed(2)},0.00,0.00,${((c - fed - ss - med) / 100).toFixed(2)},${(ss / 100).toFixed(2)},${(med / 100).toFixed(2)},0.00,0.00`;
};
const reg = (rows) => addPayroll(newBooks(), `${HEAD}\n${rows.map(([d, g]) => row(d, g)).join("\n")}\n`).books;

test("no lookback payroll: monthly, due the 15th of the next month, moved off a weekend", () => {
  // 2026-02-13 pay date; March 15 2026 is a Sunday -> Monday March 16.
  const r = depositSchedule(reg([["2026-02-13", 2000]]), 2026);
  assert.equal(r.schedule, "monthly");
  assert.equal(r.deposits.length, 1);
  assert.equal(r.deposits[0].due, "2026-03-16");
  assert.equal(r.deposits[0].amount, 50600);   // 25.3% of 2,000.00
});

test("lookback over $50,000 makes a semiweekly depositor with Wed and Fri due dates", () => {
  // 25.3% of 250,000 = 63,250 in the lookback window.
  const books = reg([["2025-01-10", 250000], ["2026-03-04", 1000], ["2026-03-06", 1000], ["2026-03-09", 1000]]);
  const r = depositSchedule(books, 2026);
  assert.equal(r.schedule, "semiweekly");
  // Wed Mar 4 and Fri Mar 6 -> Friday period ends Mar 6, due Wed Mar 11; Mon Mar 9 -> Tue Mar 10, due Fri Mar 13.
  assert.deepEqual(r.deposits.map((d) => d.due), ["2026-03-11", "2026-03-13"]);
  assert.equal(r.deposits[0].amount, 2 * 25300);
});

test("a holiday inside the three business days pushes a semiweekly deposit out a day", () => {
  // Pay Fri 2026-05-22; period ends that Friday; Mon May 25 is Memorial Day -> Tue, Wed, Thu = Thursday May 28.
  const r = depositSchedule(reg([["2025-01-10", 250000], ["2026-05-22", 1000]]), 2026);
  assert.equal(r.deposits[0].due, "2026-05-28");
});

test("$100,000 of liability on a day is due the next business day", () => {
  const r = depositSchedule(reg([["2026-04-10", 400000]]), 2026);   // 25.3% = 101,200
  assert.equal(r.nextDay, true);
  assert.equal(r.deposits[0].due, "2026-04-13");
  assert.match(r.deposits[0].rule, /next-day/);
});

test("bank lines decide on time, late (with a penalty tier) or not found", () => {
  const books0 = reg([["2026-02-13", 2000], ["2026-03-13", 2000], ["2026-04-10", 2000]]);
  const bank = "Date,Description,Amount\n2026-03-16,IRS USATAXPYMT,-506.00\n2026-04-24,IRS USATAXPYMT,-506.00\n";
  const books = importStatement(books0, bank, "1000").books;
  const r = depositSchedule(books, 2026);
  const by = Object.fromEntries(r.deposits.map((d) => [d.to, d]));
  assert.equal(by["2026-02-13"].status, "on time");
  assert.equal(by["2026-03-13"].status, "late");       // due Apr 15, paid Apr 24
  assert.equal(by["2026-03-13"].daysLate, 9);
  assert.equal(by["2026-03-13"].penaltyPct, 5);
  assert.equal(by["2026-03-13"].penalty, 2530);
  assert.equal(by["2026-04-10"].status, "no bank line found");
});

test("an explicit schedule overrides the lookback and a short register warns", () => {
  const r = depositSchedule(reg([["2026-02-13", 2000]]), 2026, { schedule: "semiweekly" });
  assert.equal(r.schedule, "semiweekly");
  assert.throws(() => depositSchedule(reg([["2026-02-13", 2000]]), 2026, { schedule: "weekly" }), /monthly or semiweekly/);
  assert.match(depositSchedule(reg([["2026-02-13", 2000]]), 2026).warnings.join(" "), /lookback/);
});

test("a monthly depositor who reaches $100,000 turns semiweekly from the next day, and stays so next year", () => {
  // 2026-04-10: 101,200 liability -> next-day. Later runs that year are semiweekly (Wed Apr 15 -> due Wed Apr 22).
  const books = reg([["2026-04-10", 400000], ["2026-04-15", 1000], ["2026-05-06", 1000], ["2027-03-03", 1000]]);
  const r = depositSchedule(books, 2026);
  assert.equal(r.schedule, "monthly");
  assert.equal(r.switchedOn, "2026-04-11");
  assert.deepEqual(r.deposits.map((d) => d.due), ["2026-04-13", "2026-04-22", "2026-05-13"]);
  assert.match(r.deposits[1].rule, /semiweekly/);
  // 2027: the lookback ($101,200+ in the 2025-07..2026-06 window is over $50,000) already says semiweekly.
  const n = depositSchedule(books, 2027);
  assert.equal(n.schedule, "semiweekly");
});

test("the semiweekly carry-over covers the next year even when the lookback is small", () => {
  // Hit in Dec 2026 (lookback for 2027 = Jul 2025..Jun 2026: only 1,000 -> monthly by lookback).
  const books = reg([["2026-12-10", 400000], ["2027-03-03", 1000], ["2029-03-01", 1000]]);
  assert.equal(depositSchedule(books, 2027).schedule, "semiweekly");
  assert.match(depositSchedule(books, 2027).basis, /next-day rule hit on 2026-12-11/);
  assert.equal(depositSchedule(books, 2029).schedule, "monthly");
});

test("a semiweekly period spanning two quarters is two deposits due the same day (Pub. 15 (2026) example)", () => {
  const books = reg([["2025-01-10", 250000], ["2026-09-30", 100000], ["2026-10-02", 100000]]);
  const r = depositSchedule(books, 2026);
  assert.equal(r.schedule, "semiweekly");
  const d = r.deposits.filter((x) => x.from >= "2026-09-30");
  assert.equal(d.length, 2);
  assert.deepEqual(d.map((x) => x.due), ["2026-10-07", "2026-10-07"]);
  assert.ok(d[0].to === "2026-09-30" && d[1].from === "2026-10-02");
});

// Pub. 15 (2026), "$100,000 Next-Day Deposit Rule" examples, read 2026-10-24.
test("Pub. 15 Fir Co.: $110,000 Monday is due Tuesday; $30,000 Tuesday is not added to it and is due Friday", () => {
  const r = depositSchedule(reg([["2026-06-01", 434800], ["2026-06-02", 118600]]), 2026, { schedule: "semiweekly" });
  assert.equal(r.deposits.length, 2);
  assert.equal(r.deposits[0].due, "2026-06-02");
  assert.match(r.deposits[0].rule, /next-day/);
  assert.equal(r.deposits[1].due, "2026-06-05");
  assert.equal(r.deposits[1].rule, "semiweekly");
});

test("Pub. 15: $95,000 Tuesday and $10,000 Wednesday are different periods, so no next-day rule: Friday and the following Wednesday", () => {
  const r = depositSchedule(reg([["2026-06-02", 375500], ["2026-06-03", 39500]]), 2026, { schedule: "semiweekly" });
  assert.equal(r.nextDay, false);
  assert.deepEqual(r.deposits.map((d) => d.due), ["2026-06-05", "2026-06-10"]);
});

test("exactly $100,000 in a semiweekly period triggers the next-day rule (Wed due date), $1 less does not", () => {
  // deposits of 48,135.01 + 51,864.99 dollars = exactly 10,000,000 cents
  const r = depositSchedule(reg([["2026-06-01", 190256.90], ["2026-06-02", 204999.94]]), 2026, { schedule: "semiweekly" });
  assert.equal(r.deposits.reduce((a, d) => a + d.amount, 0), 10000000);
  assert.equal(r.nextDay, true);
  assert.deepEqual(r.deposits.map((d) => d.due), ["2026-06-03"]);
  const s = depositSchedule(reg([["2026-06-01", 190256.90], ["2026-06-02", 204999.90]]), 2026, { schedule: "semiweekly" });
  assert.equal(s.nextDay, false);
  assert.deepEqual(s.deposits.map((d) => d.due), ["2026-06-05"]);
});

test("a Saturday pay date falls in the Sat-Tue period: ends Tuesday, due the Friday after", () => {
  const r = depositSchedule(reg([["2026-06-06", 2000]]), 2026, { schedule: "semiweekly" });   // Sat
  assert.equal(r.deposits[0].due, "2026-06-12");
});

test("late-deposit penalty tiers change at 5/6 and 15/16 days late", () => {
  const tier = (paid) => {
    const bank = `Date,Description,Amount\n${paid},IRS USATAXPYMT,-506.00\n`;
    const books = importStatement(reg([["2026-02-27", 2000]]), bank, "1000").books;
    const d = depositSchedule(books, 2026).deposits[0];   // due 2026-03-16
    return [d.daysLate, d.penaltyPct];
  };
  assert.deepEqual(tier("2026-03-21"), [5, 2]);
  assert.deepEqual(tier("2026-03-22"), [6, 5]);
  assert.deepEqual(tier("2026-03-31"), [15, 5]);
  assert.deepEqual(tier("2026-04-01"), [16, 10]);
});

test("Wednesday, Thursday and Friday pay dates all end the period on that Friday (due the Wednesday after)", () => {
  for (const d of ["2026-06-03", "2026-06-04", "2026-06-05"]) {
    const r = depositSchedule(reg([[d, 2000]]), 2026, { schedule: "semiweekly" });
    assert.equal(r.deposits[0].due, "2026-06-10", d);
  }
});

test("lookback is covered when the FIRST register run is on or before the window start, whatever follows", () => {
  const books = reg([["2024-06-01", 1000], ["2025-01-10", 1000]]);
  assert.equal(lookbackTotal(books, 2026).covered, true);
  assert.equal(depositSchedule(books, 2026).warnings.some((w) => /register starts after/.test(w)), false);
  assert.equal(lookbackTotal(reg([["2024-07-02", 1000], ["2025-01-10", 1000]]), 2026).covered, false);
});

test("a pay date on January 1 belongs to that year's deposits", () => {
  const r = depositSchedule(reg([["2026-01-01", 2000]]), 2026);
  assert.equal(r.deposits.length, 1);
  assert.equal(r.deposits[0].from, "2026-01-01");
});

test("de minimis: a quarter under $2,500 is flagged per quarter; exactly $2,500 is not", () => {
  const r = depositSchedule(reg([["2026-02-13", 2000], ["2026-05-15", 2000], ["2026-08-14", 2000], ["2026-11-13", 2000]]), 2026);
  assert.equal(r.deposits.length, 4);
  for (const d of r.deposits) assert.match(d.rule, /under \$2,500 for the quarter, pay with Form 941/);
  // 25.3% of 9,881.42 = 2,500.00 (checked below), so it is not under the threshold.
  const g = 9881.42;
  const at = depositSchedule(reg([["2026-02-13", g]]), 2026);
  assert.equal(at.deposits[0].amount, 250000);
  assert.doesNotMatch(at.deposits[0].rule, /Form 941/);
  const below = depositSchedule(reg([["2026-02-13", 9880]]), 2026);
  assert.ok(below.deposits[0].amount < 250000);
  assert.match(below.deposits[0].rule, /Form 941/);
});
