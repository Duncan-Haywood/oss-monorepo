import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement } from "./engine.mjs";
import { addPayroll } from "./payroll.mjs";
import { depositSchedule } from "./deposits.mjs";

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
