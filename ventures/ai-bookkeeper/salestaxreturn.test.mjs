import test from "node:test";
import assert from "node:assert/strict";
import { newBooks, addDocuments, importStatement, confirm } from "./engine.mjs";
import { salesTaxReturn, dueDate, stateDueDay, stateEndMonth } from "./salestaxreturn.mjs";

const csv = [
  "type,number,date,due,party,amount,account,description",
  "invoice,1,2026-01-10,,A Co,100.00,4000,Goods",
  "invoice,1,2026-01-10,,A Co,6.00,2100,CA state",
  "invoice,1,2026-01-10,,A Co,1.00,2100,LA county",
  "invoice,2,2026-03-31,,B Co,200.00,4000,Goods",
  "invoice,2,2026-03-31,,B Co,12.00,2100,CA state",
  "invoice,3,2026-02-01,,C Co,50.00,4000,Resale exempt",
  "credit note,9,2026-02-15,,A Co,50.00,4000,Return",
  "credit note,9,2026-02-15,,A Co,3.00,2100,CA state",
  "invoice,4,2026-04-02,,D Co,10.00,4000,Goods",
  "invoice,4,2026-04-02,,D Co,0.90,2100,",
].join("\n") + "\n";
const books = () => addDocuments(importStatement(newBooks(), "Date,Description,Amount\n2026-01-01,X,1.00\n", "1000").books, csv).books;

test("tax is split by jurisdiction and quarter, credits netted, exempt sales kept apart", () => {
  const r = salesTaxReturn(books());
  const q1 = r.periods.find((p) => p.period === "2026-Q1");
  const ca = q1.rows.find((x) => x.jurisdiction === "CA state");
  assert.equal(ca.taxableSales, 25000);
  assert.equal(ca.tax, 1500);
  assert.equal(ca.taxCredited, 300);
  assert.equal(q1.rows.find((x) => x.jurisdiction === "LA county").tax, 100);
  assert.equal(q1.nonTaxableSales, 5000);
  assert.equal(ca.due, "2026-04-20");
});

test("rate check and unlabelled tax lines warn", () => {
  const r = salesTaxReturn(books(), { rates: { "LA county": 0.0225 } });
  assert.ok(r.warnings.some((w) => /LA county.*1\.00%.*2\.25%/.test(w)));
  assert.ok(r.warnings.some((w) => /no description/.test(w)));
});

test("monthly frequency and December rolls into January", () => {
  assert.equal(salesTaxReturn(books(), { frequency: "monthly" }).periods[0].period, "2026-01");
  assert.equal(dueDate("2026-12", 25), "2027-01-25");
  assert.equal(dueDate("2026-Q4"), "2027-01-20");
  assert.throws(() => salesTaxReturn(books(), { frequency: "weekly" }));
});

import { nextBusinessDay, usHolidays } from "./salestaxreturn.mjs";

test("due dates roll past weekends and observed federal holidays", () => {
  assert.equal(nextBusinessDay("2026-10-20"), "2026-10-20"); // Tuesday
  assert.equal(nextBusinessDay("2026-07-04"), "2026-07-06"); // Saturday, Friday 3rd is the observed holiday
  assert.equal(nextBusinessDay("2026-05-23"), "2026-05-26"); // Saturday before Memorial Day
  assert.equal(nextBusinessDay("2027-01-01"), "2027-01-04");
  assert.ok(usHolidays(2026).has("2026-11-26") && usHolidays(2026).has("2026-10-12"));
  const r = salesTaxReturn(books(), { frequency: "monthly", dueDay: 4 });
  assert.equal(r.periods[0].rows[0].due, "2026-02-04"); // Wednesday, unchanged
  const jul = salesTaxReturn(books(), { dueDay: 4 }).periods.find((p) => p.period === "2026-Q2");
  assert.equal(jul.rows[0].due, "2026-07-06");
  assert.equal(salesTaxReturn(books(), { dueDay: 4, rollover: false }).periods.find((p) => p.period === "2026-Q2").rows[0].due, "2026-07-04");
});

test("timely-filing discount is capped, and payments are matched to the period they pay", () => {
  let b = importStatement(books(), "Date,Description,Amount\n2026-04-18,CA DTFA remittance,-14.00\n2026-05-02,Late LA county,-0.50\n", "1000").books;
  b = confirm(b, Object.fromEntries(b.transactions.filter((t) => /remittance|Late/.test(t.desc)).map((t) => [t.id, "2100"])));
  const r = salesTaxReturn(b, { discounts: { "CA state": { rate: 0.1, cap: 100 } }, asOf: "2026-12-01" });
  const q1 = r.periods.find((p) => p.period === "2026-Q1");
  const ca = q1.rows.find((x) => x.jurisdiction === "CA state");
  assert.equal(ca.discount, 100); // 10% of 1500 = 150, capped at 100
  assert.equal(ca.payable, 1400);
  assert.equal(r.totals.discount, 100);
  assert.equal(q1.paid, 1450);
  assert.equal(q1.payable, 1500); // CA 1400 + LA 100
  assert.equal(q1.owed, 50);
  const q2 = r.periods.find((p) => p.period === "2026-Q2");
  assert.equal(q2.owed, 90);
  assert.ok(r.warnings.some((w) => /2026-Q2.*\$0\.90 still unpaid after the 2026-07-20/.test(w)));
  assert.ok(!salesTaxReturn(b).warnings.some((w) => /still unpaid/.test(w)));
});

test("state presets: California is due at month end, Washington on the 25th", async () => {
  const { STATE_DUE_DAYS } = await import("./salestaxreturn.mjs");
  assert.equal(dueDate("2026-Q1", STATE_DUE_DAYS.CA), "2026-04-30");
  assert.equal(dueDate("2026-01", STATE_DUE_DAYS.CA), "2026-02-28");
  assert.equal(dueDate("2027-Q4", STATE_DUE_DAYS.CA), "2028-01-31");
  assert.equal(dueDate("2026-Q1", STATE_DUE_DAYS.WA), "2026-04-25");
});

test("Washington quarterly returns are due at the end of the next month, monthly on the 25th", async () => {
  const { stateDueDay } = await import("./salestaxreturn.mjs");
  assert.equal(dueDate("2026-Q3", stateDueDay("wa", "quarterly")), "2026-10-31");
  assert.equal(dueDate("2026-10", stateDueDay("WA", "monthly")), "2026-11-25");
  assert.equal(dueDate("2026-Q1", stateDueDay("TX", "quarterly")), "2026-04-20");
  assert.equal(stateDueDay(undefined), 20);
});

test("NY, IL and PA monthly returns are due the 20th; PA annual gets a note", async () => {
  const { stateDueDay, stateFilingNote } = await import("./salestaxreturn.mjs");
  for (const s of ["NY", "IL", "PA"]) assert.equal(dueDate("2026-10", stateDueDay(s, "monthly")), "2026-11-20");
  assert.equal(stateFilingNote("ny", "quarterly"), null);
  assert.equal(stateFilingNote("NY", "monthly"), null);
  assert.match(stateFilingNote("PA", "annual"), /semiannual/);
  assert.equal(stateFilingNote("IL", "quarterly"), null);
  assert.equal(stateFilingNote(undefined), null);
});

test("New York quarters run Dec-Feb, Mar-May, Jun-Aug, Sep-Nov and are due the 20th after", () => {
  assert.equal(stateEndMonth("ny", "quarterly"), 2);
  assert.equal(stateEndMonth("NY", "monthly"), null);
  const r = salesTaxReturn(books(), { endMonth: stateEndMonth("NY"), dueDay: stateDueDay("NY") });
  assert.deepEqual(r.periods.map((p) => p.period), ["2026-02", "2026-05"]);
  const first = r.periods[0].rows.find((x) => x.jurisdiction === "CA state");
  assert.equal(first.tax, 600 - 300); // Jan 10 invoice less the Feb 15 credit; the Mar 31 invoice is the next quarter
  assert.equal(first.due, "2026-03-20");
  assert.equal(r.periods[1].rows.find((x) => x.jurisdiction === "CA state").due, "2026-06-22"); // Jun 20 2026 is a Saturday
});

test("Pennsylvania semiannual periods are Feb-Jul and Aug-Jan, due Aug 20 and Feb 20", () => {
  assert.equal(stateEndMonth("PA", "semiannual"), 1);
  const r = salesTaxReturn(books(), { frequency: "semiannual", endMonth: 1, dueDay: 20 });
  assert.deepEqual(r.periods.map((p) => p.period), ["2026-01", "2026-07"]);
  assert.equal(r.periods[0].rows[0].due, "2026-02-20");
  assert.equal(r.periods[1].rows[0].due, "2026-08-20");
  const cal = salesTaxReturn(books(), { frequency: "semiannual" });
  assert.deepEqual(cal.periods.map((p) => p.period), ["2026-H1"]);
});

test("a payment is matched to the shifted period that ended before it", () => {
  let b = importStatement(books(), "Date,Description,Amount\n2026-03-25,State tax,-3.00\n", "1000").books;
  b = confirm(b, Object.fromEntries(b.transactions.filter((t) => /State tax/.test(t.desc)).map((t) => [t.id, "2100"])));
  const r = salesTaxReturn(b, { endMonth: 2 });
  assert.equal(r.periods[0].period, "2026-02");
  assert.equal(r.periods[0].paid, 300);
  assert.equal(r.periods[0].owed, 100);
});

test("endMonth outside the first period is refused", () => {
  assert.throws(() => salesTaxReturn(books(), { endMonth: 4 }));
  assert.throws(() => salesTaxReturn(books(), { frequency: "monthly", endMonth: 2 }));
});

test("NJ, GA and NC are due the 20th and OH the 23rd of the month after the period", () => {
  for (const s of ["NJ", "GA", "NC"]) assert.equal(dueDate("2026-Q3", stateDueDay(s, "quarterly")), "2026-10-20");
  assert.equal(dueDate("2026-Q1", stateDueDay("oh", "quarterly")), "2026-04-23");
  assert.equal(dueDate("2026-H2", stateDueDay("OH", "semiannual")), "2027-01-23");
});

test("Massachusetts: quarterly and annual returns are due 30 days after the period, monthly the 20th", () => {
  assert.equal(dueDate("2026-Q1", stateDueDay("MA", "quarterly")), "2026-04-30");
  assert.equal(dueDate("2026-Q2", stateDueDay("MA", "quarterly")), "2026-07-30");
  assert.equal(dueDate("2026-Q4", stateDueDay("MA", "quarterly")), "2027-01-30");
  assert.equal(dueDate("2026", stateDueDay("MA", "annual")), "2027-01-30");
  assert.equal(dueDate("2026-03", stateDueDay("MA", "monthly")), "2026-04-20");
  const r = salesTaxReturn(books(), { dueDay: stateDueDay("MA", "quarterly") });
  assert.equal(r.periods.find((p) => p.period === "2026-Q1").rows[0].due, "2026-04-30");
});
