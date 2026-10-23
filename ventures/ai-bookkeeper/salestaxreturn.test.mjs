import test from "node:test";
import assert from "node:assert/strict";
import { newBooks, addDocuments, importStatement, confirm } from "./engine.mjs";
import { salesTaxReturn, dueDate } from "./salestaxreturn.mjs";

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
