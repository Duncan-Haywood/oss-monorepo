import test from "node:test";
import assert from "node:assert/strict";
import { newBooks, addDocuments, importStatement, confirm } from "./engine.mjs";
import { salesTaxDueDates, salesTaxReturn, dueDate, stateDueDay, stateEndMonth, stateFilingNote, STATE_DUE_DAYS } from "./salestaxreturn.mjs";

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

test("a February payment on a monthly return pays January, not a month 13 of the year before (red team 2026-11-26)", () => {
  let b = importStatement(books(), "Date,Description,Amount\n2026-02-10,State tax,-7.00\n", "1000").books;
  b = confirm(b, Object.fromEntries(b.transactions.filter((t) => /State tax/.test(t.desc)).map((t) => [t.id, "2100"])));
  const r = salesTaxReturn(b, { frequency: "monthly" });
  assert.ok(r.periods.every((p) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p.period)), r.periods.map((p) => p.period).join());
  const jan = r.periods.find((p) => p.period === "2026-01");
  assert.equal(jan.paid, 700);
  assert.equal(jan.owed, 0);
});

test("endMonth outside the first period is refused", () => {
  assert.throws(() => salesTaxReturn(books(), { endMonth: 4 }));
  assert.throws(() => salesTaxReturn(books(), { frequency: "monthly", endMonth: 2 }));
});

test("NJ and GA are due the 20th and OH the 23rd of the month after the period", () => {
  for (const s of ["NJ", "GA"]) assert.equal(dueDate("2026-Q3", stateDueDay(s, "quarterly")), "2026-10-20");
  assert.equal(dueDate("2026-Q1", stateDueDay("oh", "quarterly")), "2026-04-23");
  assert.equal(dueDate("2026-H2", stateDueDay("OH", "semiannual")), "2027-01-23");
});

test("VA and AZ are due the 20th of the month after the period, and are listed explicitly", () => {
  for (const s of ["VA", "AZ"]) {
    assert.equal(STATE_DUE_DAYS[s], 20);
    assert.equal(dueDate("2026-Q3", stateDueDay(s, "quarterly")), "2026-10-20");
    assert.equal(dueDate("2026-11", stateDueDay(s, "monthly")), "2026-12-20");
  }
});

test("Massachusetts: monthly, quarterly and annual returns are all due 30 days after the period", () => {
  assert.equal(dueDate("2026-Q1", stateDueDay("MA", "quarterly")), "2026-04-30");
  assert.equal(dueDate("2026-Q2", stateDueDay("MA", "quarterly")), "2026-07-30");
  assert.equal(dueDate("2026-Q4", stateDueDay("MA", "quarterly")), "2027-01-30");
  assert.equal(dueDate("2026", stateDueDay("MA", "annual")), "2027-01-30");
  assert.equal(dueDate("2026-03", stateDueDay("MA", "monthly")), "2026-04-30");
  assert.equal(dueDate("2026-01", stateDueDay("MA", "monthly")), "2026-03-02");
  const r = salesTaxReturn(books(), { dueDay: stateDueDay("MA", "quarterly") });
  assert.equal(r.periods.find((p) => p.period === "2026-Q1").rows[0].due, "2026-04-30");
});

test("MI, CT, WI, UT, IN and KS: due day by state, with Indiana's 30th clamped in February", () => {
  assert.equal(dueDate("2026-Q3", stateDueDay("MI", "quarterly")), "2026-10-20");
  assert.equal(dueDate("2026-Q3", stateDueDay("CT", "quarterly")), "2026-10-31");
  assert.equal(dueDate("2026-Q4", stateDueDay("WI", "quarterly")), "2027-01-31");
  assert.equal(dueDate("2026-Q2", stateDueDay("UT", "quarterly")), "2026-07-31");
  assert.equal(dueDate("2026-Q3", stateDueDay("IN", "quarterly")), "2026-10-30");
  assert.equal(dueDate("2026-01", stateDueDay("IN", "monthly")), "2026-02-28");
  assert.equal(dueDate("2027-01", stateDueDay("IN", "monthly")), "2027-02-28");
  assert.equal(dueDate("2028-01", stateDueDay("IN", "monthly")), "2028-02-29");
  assert.equal(dueDate("2026-Q1", stateDueDay("KS", "quarterly")), "2026-04-25");
});

test("CO and MN are due the 20th of the month after the period", () => {
  for (const s of ["CO", "MN"]) assert.equal(dueDate("2026-Q3", stateDueDay(s, "quarterly")), "2026-10-20");
});

test("TN, AL, SC are due the 20th and NM the 25th", () => {
  for (const s of ["TN", "AL", "SC"]) assert.equal(dueDate("2026-Q3", stateDueDay(s, "quarterly")), "2026-10-20");
  assert.equal(dueDate("2026-Q3", stateDueDay("NM", "quarterly")), "2026-10-25");
});

test("NV and ID are due the 20th (NV from the January 2026 period, AB 594)", () => {
  for (const s of ["NV", "ID"]) assert.equal(dueDate("2026-Q3", stateDueDay(s, "quarterly")), "2026-10-20");
});

test("LA and MD are due the 20th", () => {
  for (const s of ["LA", "MD"]) assert.equal(dueDate("2026-Q3", stateDueDay(s, "quarterly")), "2026-10-20");
});

test("ME is due the 15th, VT the 25th, ND the last day", () => {
  assert.equal(dueDate("2026-Q3", stateDueDay("ME", "quarterly")), "2026-10-15");
  assert.equal(dueDate("2026-Q3", stateDueDay("VT", "quarterly")), "2026-10-25");
  assert.equal(dueDate("2026-Q3", stateDueDay("ND", "quarterly")), "2026-10-31");
});

test("AR, OK, KY, MS, NE are due the 20th; MO and IA the last day", () => {
  for (const s of ["AR", "OK", "KY", "MS", "NE"]) assert.equal(dueDate("2026-Q3", stateDueDay(s, "quarterly")), "2026-10-20");
  for (const s of ["MO", "IA"]) assert.equal(dueDate("2026-Q3", stateDueDay(s, "quarterly")), "2026-10-31");
});

test("HI, DC, WV file on the 20th and WY at month end", () => {
  assert.equal(dueDate("2026-Q1", stateDueDay("hi", "quarterly")), "2026-04-20");
  assert.equal(dueDate("2026-Q1", stateDueDay("DC", "quarterly")), "2026-04-20");
  assert.equal(dueDate("2026-01", stateDueDay("WV", "monthly")), "2026-02-20");
  assert.equal(dueDate("2026-Q1", stateDueDay("WY", "quarterly")), "2026-04-30");
  assert.equal(stateDueDay("RI", "monthly"), 20);
});

test("HI semiannual returns (Jan-Jun, Jul-Dec) are due Jul 20 and Jan 20", () => {
  assert.equal(stateEndMonth("HI", "semiannual"), null);
  assert.equal(dueDate("2026-H1", stateDueDay("HI", "semiannual")), "2026-07-20");
  assert.equal(dueDate("2026-H2", stateDueDay("HI", "semiannual")), "2027-01-20");
});

test("RI and SD return due the 20th, listed explicitly", async () => {
  const { STATE_DUE_DAYS } = await import("./salestaxreturn.mjs");
  assert.equal(STATE_DUE_DAYS.RI, 20);
  assert.equal(STATE_DUE_DAYS.SD, 20);
  assert.equal(dueDate("2026-01", stateDueDay("sd", "monthly")), "2026-02-20");
});

test("Rhode Island quarterly returns are due the last day of the month after the quarter, monthly the 20th", () => {
  assert.equal(dueDate("2026-Q1", stateDueDay("RI", "quarterly")), "2026-04-30");
  assert.equal(dueDate("2026-Q4", stateDueDay("RI", "quarterly")), "2027-01-31");
  assert.equal(dueDate("2026-10", stateDueDay("RI", "monthly")), "2026-11-20");
});

test("North Carolina quarterly returns are due the last day of the month after the quarter, monthly the 20th", () => {
  assert.equal(dueDate("2026-Q1", stateDueDay("NC", "quarterly")), "2026-04-30");
  assert.equal(dueDate("2026-Q4", stateDueDay("NC", "quarterly")), "2027-01-31");
  assert.equal(dueDate("2026-10", stateDueDay("NC", "monthly")), "2026-11-20");
});

test("Minnesota annual returns are due February 5; Colorado annual January 20", () => {
  assert.equal(dueDate("2026", stateDueDay("MN", "annual")), "2027-02-05");
  assert.equal(dueDate("2026-Q4", stateDueDay("MN", "quarterly")), "2027-01-20");
  assert.equal(dueDate("2026", stateDueDay("CO", "annual")), "2027-01-20");
});

test("MI annual returns are due February 28; monthly and quarterly the 20th", () => {
  assert.equal(dueDate("2026", stateDueDay("MI", "annual")), "2027-02-28");
  assert.equal(dueDate("2026-Q3", stateDueDay("MI", "quarterly")), "2026-10-20");
  assert.equal(dueDate("2026-09", stateDueDay("MI", "monthly")), "2026-10-20");
});

test("primary pages read 2026-10-27: WA annual is April 15, Texas 2026 calendar moves weekend 20ths", () => {
  // dor.wa.gov "Filing frequencies & due dates": monthly 25th, quarterly end of next month, annual April 15
  assert.equal(dueDate("2026", stateDueDay("WA", "annual")), "2027-04-15");
  assert.equal(dueDate("2026-Q4", stateDueDay("WA", "quarterly")), "2027-01-31");
  // comptroller.texas.gov due-dates chart for sales and use tax, 2026 reports: 20 20 20 20 20 22 20 20 21 20 20 21
  // (Jan..Dec), dates already moved off weekends; the report month is the one before.
  const tx = (m) => nextBusinessDay(dueDate(m, stateDueDay("TX", "monthly")));
  assert.equal(tx("2026-05"), "2026-06-22");
  assert.equal(tx("2026-08"), "2026-09-21");
  assert.equal(tx("2026-11"), "2026-12-21");
  assert.equal(tx("2026-06"), "2026-07-20");
});

test("New York annual returns cover March to February and are due March 20", () => {
  assert.equal(stateEndMonth("NY", "annual"), 2);
  assert.equal(stateEndMonth("IL", "annual"), null);
  const r = salesTaxReturn(books(), { frequency: "annual", endMonth: stateEndMonth("NY", "annual"), dueDay: stateDueDay("NY", "annual") });
  assert.deepEqual(r.periods.map((p) => p.period), ["2026-02", "2027-02"]);
  assert.equal(r.periods[0].rows[0].due, "2026-03-20");
});

test("Minnesota's own 2026 due-date table (revenue.state.mn.us, read 2026-10-27) matches the preset", () => {
  // "Sales Tax Return Filing Due Dates": report month -> due date, weekend 20ths already moved by the state
  const mn = (m, f = "monthly") => nextBusinessDay(dueDate(m, stateDueDay("MN", f)));
  const table = { "2025-12": "2026-01-20", "2026-01": "2026-02-20", "2026-02": "2026-03-20", "2026-03": "2026-04-20", "2026-04": "2026-05-20", "2026-05": "2026-06-22", "2026-06": "2026-07-20", "2026-07": "2026-08-20", "2026-08": "2026-09-21", "2026-09": "2026-10-20", "2026-10": "2026-11-20", "2026-11": "2026-12-21", "2026-12": "2027-01-20" };
  for (const [m, d] of Object.entries(table)) assert.equal(mn(m), d, m);
  assert.equal(mn("2025-Q4", "quarterly"), "2026-01-20");
  assert.equal(nextBusinessDay(dueDate("2025", stateDueDay("MN", "annual"))), "2026-02-05");
  assert.equal(nextBusinessDay(dueDate("2026", stateDueDay("MN", "annual"))), "2027-02-05");
});

test("Missouri: monthly and quarterly on the last day of the next month, annual January 31 (dor.mo.gov FAQ, read 2026-10-28)", () => {
  assert.equal(dueDate("2026-03", stateDueDay("MO", "monthly")), "2026-04-30");
  assert.equal(dueDate("2026-Q1", stateDueDay("MO", "quarterly")), "2026-04-30");
  assert.equal(dueDate("2026-Q2", stateDueDay("MO", "quarterly")), "2026-07-31");
  assert.equal(dueDate("2026-Q4", stateDueDay("MO", "quarterly")), "2027-01-31");
  assert.equal(dueDate("2026-H2", stateDueDay("MO", "annual")), "2027-01-31");
  // the state's 2% timely payment allowance is a plain --discount rate, with no cap
  const r = salesTaxReturn(books(), { discounts: { "CA state": { rate: 0.02 } } });
  const row = r.periods[0].rows.find((x) => x.jurisdiction === "CA state");
  assert.equal(row.discount, Math.round(row.tax * 0.02));
});

test("Illinois: the 20th after any period; discount 1.75%, $1,000 a month cap (tax.illinois.gov ST-1 instructions R-01/26, read 2026-10-28)", () => {
  assert.equal(dueDate("2026-03", stateDueDay("IL", "monthly")), "2026-04-20");
  assert.equal(dueDate("2026-Q3", stateDueDay("IL", "quarterly")), "2026-10-20");
  assert.equal(dueDate("2026-H2", stateDueDay("IL", "annual")), "2027-01-20");
});

test("a per-month discount cap scales with the return period (Illinois: 1.75%, $1,000 a month)", () => {
  const b = books(); // same fixture as the cap test above
  const mk = (frequency) => salesTaxReturn(b, { frequency, discounts: { "CA state": { rate: 0.1, capPerMonth: 40 } }, asOf: "2026-12-01" });
  const q = mk("quarterly").periods.flatMap((p) => p.rows).find((r) => r.jurisdiction === "CA state");
  assert.equal(q.discount, 120); // 10% of 1500 = 150, capped at 40 x 3 months
  const a = mk("annual").periods.flatMap((p) => p.rows).find((r) => r.jurisdiction === "CA state");
  assert.equal(a.discount, 150); // 40 x 12 = 480 does not bind
});

test("Texas: the 0.5% timely-filing discount is a plain --discount rate with no cap (comptroller.texas.gov sales tax page, 2026-10-28)", () => {
  // the 1.25% prepayment discount needs a prepayment report and a 90% estimate, so it is not modelled
  const r = salesTaxReturn(books(), { discounts: { "CA state": { rate: 0.005 } } });
  const row = r.periods[0].rows.find((x) => x.jurisdiction === "CA state");
  assert.equal(row.discount, Math.round(row.tax * 0.005));
  assert.equal(row.payable, row.tax - row.discount);
});

test("Florida: the collection allowance, 2.5% of the first $1,200 of tax, is a $30 cap per return (Fla. Admin. Code 12A-1.056, via search 2026-10-28)", () => {
  // 2.5% x $1,200 = $30, so `--discount "FL state=2.5,30"` is the whole rule; it applies to a timely electronic return and payment
  const b = books();
  const low = salesTaxReturn(b, { discounts: { "CA state": { rate: 0.025, cap: 3000 } } }).periods[0].rows.find((x) => x.jurisdiction === "CA state");
  assert.equal(low.discount, Math.min(Math.round(low.tax * 0.025), 3000));
  // the $30 ceiling binding is covered by the cap tests above (same code path)
  assert.equal(low.payable, low.tax - low.discount);
});

test("a payment filed after the due date warns that the timely-filing discount may be disallowed", () => {
  const mk = (day) => {
    let b = importStatement(books(), `Date,Description,Amount\n${day},CA DTFA remittance,-14.00\n`, "1000").books;
    return confirm(b, Object.fromEntries(b.transactions.filter((t) => /remittance/.test(t.desc)).map((t) => [t.id, "2100"])));
  };
  const opts = { discounts: { "CA state": { rate: 0.1, cap: 100 } }, asOf: "2026-12-01" };
  assert.ok(!salesTaxReturn(mk("2026-04-18"), opts).warnings.some((w) => /discount assumes/.test(w)));
  // paying on the due date itself is still on time; one day later is not
  assert.ok(!salesTaxReturn(mk("2026-04-20"), opts).warnings.some((w) => /discount assumes/.test(w)));
  assert.ok(salesTaxReturn(mk("2026-04-21"), opts).warnings.some((w) => /discount assumes payment by 2026-04-20.*2026-04-21/.test(w)));
  assert.ok(salesTaxReturn(mk("2026-05-02"), opts).warnings.some((w) => /2026-Q1.*discount assumes payment by 2026-04-20.*2026-05-02/.test(w)));
  assert.ok(!salesTaxReturn(mk("2026-05-02"), { asOf: "2026-12-01" }).warnings.some((w) => /discount assumes/.test(w)));
});

test("DC annual returns end September 30 and are due October 20 (OTR FAQ via search, 2026-10-28)", () => {
  assert.equal(stateEndMonth("DC", "annual"), 9);
  assert.equal(stateEndMonth("DC", "quarterly"), null);
  assert.equal(stateDueDay("DC", "annual"), 20);
  const r = salesTaxReturn(books(), { frequency: "annual", endMonth: stateEndMonth("DC", "annual"), dueDay: stateDueDay("DC", "annual") });
  assert.deepEqual(r.periods.map((p) => p.period), ["2026-09"]);
  assert.equal(r.periods[0].rows[0].due, "2026-10-20");
});

test("states with no state sales tax get a note instead of silence", async () => {
  const { stateFilingNote } = await import("./salestaxreturn.mjs");
  for (const s of ["OR", "mt", "NH", "DE", "AK"]) assert.match(stateFilingNote(s, "quarterly"), /no (statewide )?(general )?(state )?sales tax|no sales tax/i, s);
  assert.equal(stateFilingNote("TX"), null);
});

test("a malformed discount is refused instead of printing NaN", () => {
  const books = newBooks();
  for (const d of [{ rate: NaN }, { rate: 1.5 }, { rate: -0.01 }, { rate: 0.01, cap: NaN }, { rate: 0.01, capPerMonth: -5 }, null]) {
    assert.throws(() => salesTaxReturn(books, { discounts: { "CA state": d } }), /discount for "CA state"/);
  }
  assert.doesNotThrow(() => salesTaxReturn(books, { discounts: { "CA state": { rate: 0.005, cap: 10000 } } }));
});

test("a malformed rate or due day is refused instead of passing silently or printing NaN dates", () => {
  const books = newBooks();
  for (const w of [NaN, -0.01, 1.5, Infinity]) assert.throws(() => salesTaxReturn(books, { rates: { "CA state": w } }), /rate for "CA state"/);
  for (const d of [NaN, 0, 32, 2.5, "abc", null]) assert.throws(() => salesTaxReturn(books, { dueDay: d }), /due day/);
  assert.doesNotThrow(() => salesTaxReturn(books, { rates: { "CA state": 0.0725 }, dueDay: "last" }));
  assert.doesNotThrow(() => salesTaxReturn(books, { dueDay: { months: 2, day: 15 } }));
  assert.doesNotThrow(() => salesTaxReturn(books, { dueDay: 25 }));
});

test("stateDiscounts presets IL, TX and FL under their <ST> state label and nothing else", async () => {
  const { stateDiscounts } = await import("./salestaxreturn.mjs");
  assert.deepEqual(stateDiscounts("il"), { "IL state": { rate: 0.0175, capPerMonth: 100000 } });
  assert.deepEqual(stateDiscounts("TX"), { "TX state": { rate: 0.005 } });
  assert.deepEqual(stateDiscounts("FL"), { "FL state": { rate: 0.025, cap: 3000 } });
  assert.deepEqual(stateDiscounts("oh"), { "OH state": { rate: 0.0075, capPerMonth: 75000 } });
  assert.deepEqual(stateDiscounts("CA"), {});
  assert.equal(stateDiscounts("ga")["GA state"].tiers.length, 2);
  assert.deepEqual(stateDiscounts(undefined), {});
});

test("SC: the 20th for monthly, quarterly and annual returns (dor.sc.gov Due Dates table, read 2026-10-28)", () => {
  assert.equal(dueDate("2026-01", stateDueDay("SC", "monthly")), "2026-02-20");
  assert.equal(dueDate("2026-Q2", stateDueDay("SC", "quarterly")), "2026-07-20");
  assert.equal(dueDate("2026-Q4", stateDueDay("SC", "quarterly")), "2027-01-20");
  assert.equal(dueDate("2026", stateDueDay("SC", "annual")), "2027-01-20");
});

test("OH quarterly returns are due Apr 23, Jul 23, Oct 23 and Jan 23 (Xero and Stripe guides via search 2026-10-29; earlier note says vendors file monthly or semiannual, so the sources disagree on who is quarterly)", () => {
  assert.equal(dueDate("2026-Q1", stateDueDay("OH", "quarterly")), "2026-04-23");
  assert.equal(dueDate("2026-Q2", stateDueDay("OH", "quarterly")), "2026-07-23");
  assert.equal(dueDate("2026-Q3", stateDueDay("OH", "quarterly")), "2026-10-23");
  assert.equal(dueDate("2026-Q4", stateDueDay("OH", "quarterly")), "2027-01-23");
});
test("OH: the 23rd for monthly and semiannual returns (tax.ohio.gov Due Dates and vendor FAQ, via search 2026-10-28)", () => {
  assert.equal(dueDate("2026-01", stateDueDay("OH", "monthly")), "2026-02-23");
  assert.equal(dueDate("2026-H1", stateDueDay("OH", "semiannual")), "2026-07-23");
  assert.equal(dueDate("2026-H2", stateDueDay("OH", "semiannual")), "2027-01-23");
});

test("IA: annual or monthly only, semimonthly remittance ended 2022 (revenue.iowa.gov, read 2026-11-12)", () => {
  assert.match(stateFilingNote("IA", "quarterly"), /lists monthly, annual sales tax filing, not quarterly/);
  assert.match(stateFilingNote("IA", "monthly"), /ended on July 1, 2022/);
  assert.doesNotMatch(stateFilingNote("IA", "monthly"), /lists/);
  assert.equal(dueDate("2026", stateDueDay("IA", "annual")), "2027-01-31");
  assert.equal(dueDate("2026-09", stateDueDay("IA", "monthly")), "2026-10-31");
  assert.equal(stateFilingNote("SC", "monthly"), null);
});

test("GA vendor's compensation: 3% of the first $3,000 of tax, 0.5% of the rest, per return", async () => {
  const { salesTaxReturn, stateDiscounts } = await import("./salestaxreturn.mjs");
  const mk = (cents) => addDocuments(importStatement(newBooks(), "Date,Description,Amount\n2026-03-01,X,1.00\n", "1000").books,
    `type,number,date,due,party,amount,account,description\ninvoice,1,2026-03-10,,A Co,1000.00,4000,Goods\ninvoice,1,2026-03-10,,A Co,${cents / 100}.00,2100,GA state\n`).books;
  const run = (cents) => salesTaxReturn(mk(cents), { frequency: "monthly", discounts: stateDiscounts("GA") }).periods[0].rows.find((x) => x.jurisdiction === "GA state");
  assert.equal(run(200000).discount, 6000);            // $2,000 x 3%
  assert.equal(run(500000).discount, 9000 + 1000);     // $90 + $10: $3,000 x 3% + $2,000 x 0.5%
  assert.equal(run(500000).payable, 500000 - 10000);
  assert.throws(() => salesTaxReturn(mk(100), { discounts: { "GA state": { rate: 0.03, tiers: [{ rate: 2 }] } } }));
});

test("OH vendor discount: 0.75% of tax, capped at $750 for the month (R.C. 5739.12 as amended for 2026)", async () => {
  const { salesTaxReturn, stateDiscounts } = await import("./salestaxreturn.mjs");
  const mk = (cents) => addDocuments(importStatement(newBooks(), "Date,Description,Amount\n2026-03-01,X,1.00\n", "1000").books,
    `type,number,date,due,party,amount,account,description\ninvoice,1,2026-03-10,,A Co,1000.00,4000,Goods\ninvoice,1,2026-03-10,,A Co,${cents / 100}.00,2100,OH state\n`).books;
  const run = (cents) => salesTaxReturn(mk(cents), { frequency: "monthly", discounts: stateDiscounts("OH") }).periods[0].rows.find((x) => x.jurisdiction === "OH state");
  assert.equal(run(1000000).discount, 7500);           // $10,000 x 0.75%
  assert.equal(run(20000000).discount, 75000);         // $200,000 x 0.75% = $1,500, capped at $750
});

test("Utah monthly returns are due at the end of the next month (tax.utah.gov due-dates page, read 2026-10-28)", async () => {
  const { stateDueDay } = await import("./salestaxreturn.mjs");
  assert.equal(dueDate("2026-08", stateDueDay("UT", "monthly")), "2026-09-30");
});

test("a due date that rolls across New Year lands in the later year's calendar (WI monthly, last-day states)", () => {
  // Nov 2023 is due Sun 2023-12-31, moves past the Jan 1 holiday to Tue 2024-01-02, so 2024 lists 13 returns and 2023 lists 12 (Nov 2022 rolled in from 2022-12-31).
  const y24 = salesTaxDueDates(2024, { state: "WI", frequency: "monthly" });
  assert.equal(y24.length, 13);
  assert.deepEqual(y24[0], { period: "2023-11", due: "2024-01-02" });
  assert.equal(y24[1].period, "2023-12");
  assert.equal(salesTaxDueDates(2023, { state: "WI", frequency: "monthly" }).length, 12);
  // no due date falls on a weekend in any year, any state, any frequency
  for (const s of Object.keys(STATE_DUE_DAYS)) for (const f of ["monthly", "quarterly", "semiannual", "annual"]) for (const y of [2026, 2027, 2028])
    for (const e of salesTaxDueDates(y, { state: s, frequency: f })) assert.ok(![0, 6].includes(new Date(`${e.due}T00:00:00Z`).getUTCDay()), `${s} ${f} ${e.due}`);
});

test("NE, MS and OK returns are due the 20th (official text via search excerpts 2026-11-07)", () => {
  for (const st of ["NE", "MS", "OK"]) {
    assert.equal(stateDueDay(st, "monthly"), 20);
    assert.equal(stateDueDay(st, "quarterly"), 20);
  }
  assert.equal(dueDate("2026-09", 20), "2026-10-20");
});

test("AZ and IN carry a filing note that names the open question, other states stay silent", () => {
  assert.match(stateFilingNote("az", "monthly"), /20th.*grace period.*accrue from the 20th/s); // azdor.gov read 2026-11-12: the grace period does not stop penalties
  assert.match(stateFilingNote("IN", "quarterly"), /INTIME/);
  assert.equal(stateDueDay("AZ", "monthly"), 20);
  assert.equal(STATE_DUE_DAYS.IN, 30);
  assert.equal(stateFilingNote("KS", "quarterly"), null);
});

// Each date below was read on the state's own page on 2026-11-12 (STATE_SOURCES; README "State due dates read on the states' own pages").
test("due dates match the states' own pages, read 2026-11-12", async () => {
  const { STATE_SOURCES } = await import("./salestaxreturn.mjs");
  const cases = [
    // [state, frequency, period, due before the weekend move]
    ["AL", "semiannual", "2026-H1", "2026-07-20"], ["AL", "annual", "2026", "2027-01-20"],
    ["AZ", "quarterly", "2026-Q1", "2026-04-20"], ["AZ", "annual", "2025", "2026-01-20"],
    ["CA", "monthly", "2026-06", "2026-07-31"], ["CA", "quarterly", "2026-Q1", "2026-04-30"], ["CA", "annual", "2026", "2027-01-31"],
    ["CT", "quarterly", "2026-Q2", "2026-07-31"], ["DC", "monthly", "2026-05", "2026-06-20"],
    ["HI", "semiannual", "2026-H1", "2026-07-20"], ["HI", "annual", "2026", "2027-04-20"],
    ["ID", "semiannual", "2026-H1", "2026-07-20"], ["ID", "annual", "2026", "2027-01-20"],
    ["KS", "monthly", "2026-03", "2026-04-25"], ["KS", "annual", "2026", "2027-01-25"],
    ["KY", "annual", "2025", "2026-01-20"], ["LA", "quarterly", "2026-Q3", "2026-10-20"],
    ["MI", "quarterly", "2026-Q3", "2026-10-20"], ["MI", "annual", "2026", "2027-02-28"],
    ["MS", "monthly", "2026-10", "2026-11-20"], ["NE", "monthly", "2026-10", "2026-11-20"],
    ["ND", "quarterly", "2026-Q1", "2026-04-30"], ["ND", "semiannual", "2026-H1", "2026-07-31"],
    ["NM", "monthly", "2026-10", "2026-11-25"], ["NM", "semiannual", "2026-H2", "2027-01-25"],
    ["OK", "semiannual", "2026-H1", "2026-07-20"], ["OK", "semiannual", "2026-H2", "2027-01-20"],
    ["PA", "quarterly", "2026-Q3", "2026-10-20"], ["SD", "monthly", "2026-10", "2026-11-20"],
    ["TX", "annual", "2026", "2027-01-20"], ["VT", "monthly", "2026-06", "2026-07-25"], ["VT", "quarterly", "2026-Q3", "2026-10-25"],
    ["WI", "quarterly", "2026-Q2", "2026-07-31"], ["WV", "quarterly", "2026-Q3", "2026-10-20"],
    ["WY", "annual", "2023", "2024-01-31"], ["WY", "quarterly", "2026-Q1", "2026-04-30"],
  ];
  for (const [st, f, period, due] of cases) assert.equal(dueDate(period, stateDueDay(st, f)), due, `${st} ${f} ${period}`);
  // Vermont's own table: Q1 2026 due 4/27/2026 (25th is a Saturday), Q3 10/26/2026, annual 2025 1/26/2026; ND's Jan 31 2026 moved to Feb 2
  const vt = salesTaxDueDates(2026, { state: "VT", frequency: "quarterly" }).map((e) => e.due);
  assert.ok(vt.includes("2026-04-27") && vt.includes("2026-07-27") && vt.includes("2026-10-26"));
  assert.ok(salesTaxDueDates(2026, { state: "VT", frequency: "annual" }).some((e) => e.due === "2026-01-26"));
  assert.ok(salesTaxDueDates(2026, { state: "ND", frequency: "annual" }).some((e) => e.due === "2026-02-02"));
  for (const s of Object.values(STATE_SOURCES)) assert.match(s.url, /^https:\/\//);
});

test("a frequency the state's own page does not offer gets a note naming the ones it does", () => {
  assert.match(stateFilingNote("OK", "quarterly"), /lists monthly, semiannual sales tax filing, not quarterly/);
  assert.match(stateFilingNote("NM", "annual"), /not annual/);
  // NM's approval note is for quarterly and semiannual filers only: a monthly filer needs no approval (red team 2026-11-26)
  assert.match(stateFilingNote("NM", "quarterly"), /approval \(ACD-31015\)/);
  assert.match(stateFilingNote("NM", "semiannual"), /approval \(ACD-31015\)/);
  assert.equal(stateFilingNote("NM", "monthly"), null);
  assert.match(stateFilingNote("CA", "semiannual"), /cdtfa\.ca\.gov.*not semiannual|not semiannual.*cdtfa/);
  assert.match(stateFilingNote("IN", "quarterly"), /not quarterly.*INTIME/);
  assert.match(stateFilingNote("PA", "annual"), /^Pennsylvania has no annual return/);
  assert.equal(stateFilingNote("TX", "quarterly"), null);
  assert.equal(stateFilingNote("CA", "quarterly"), null);
  assert.equal(stateFilingNote("FL", "semiannual"), null); // FL's page lists no frequencies: no claim either way
  assert.match(stateFilingNote("KY", "monthly"), /accelerated filers are due the 25th/);
  assert.match(stateFilingNote("WI", "monthly"), /early monthly filers/);
  assert.match(stateFilingNote("MI", "quarterly"), /February 28/);
  assert.match(stateFilingNote("AZ", "monthly"), /accrue from the 20th/);
});

// Read on each state's own page on 2026-11-14 (eval/state-pages-2026-11-14.md quotes the sentences): GA, IL, MN, NC, NV, SC, VA, WA.
test("eight more states' due dates match their own pages, read 2026-11-14", async () => {
  const { STATE_SOURCES, stateSourceRead, stateDiscounts } = await import("./salestaxreturn.mjs");
  const cases = [
    // [state, frequency, period, due before the weekend move]
    ["GA", "monthly", "2026-10", "2026-11-20"], // "no later than the 20th day of the month following the period being reported"
    ["IL", "monthly", "2026-10", "2026-11-20"], ["IL", "quarterly", "2026-Q3", "2026-10-20"], ["IL", "annual", "2026", "2027-01-20"],
    ["MN", "monthly", "2026-10", "2026-11-20"], ["MN", "quarterly", "2026-Q4", "2027-01-20"], ["MN", "annual", "2026", "2027-02-05"],
    ["NC", "monthly", "2026-10", "2026-11-20"], ["NC", "quarterly", "2026-Q1", "2026-04-30"], ["NC", "quarterly", "2026-Q4", "2027-01-31"],
    ["NV", "monthly", "2026-10", "2026-11-20"], // "Sales and Use Tax returns are now due on the 20th of the month"
    ["SC", "monthly", "2026-10", "2026-11-20"], ["SC", "quarterly", "2026-Q2", "2026-07-20"], ["SC", "annual", "2026", "2027-01-20"],
    ["VA", "monthly", "2026-04", "2026-05-20"], ["VA", "quarterly", "2026-Q4", "2027-01-20"],
    ["WA", "monthly", "2026-06", "2026-07-25"], ["WA", "quarterly", "2026-Q1", "2026-04-30"], ["WA", "annual", "2026", "2027-04-15"],
  ];
  for (const [st, f, period, due] of cases) assert.equal(dueDate(period, stateDueDay(st, f)), due, `${st} ${f} ${period}`);
  for (const st of ["GA", "IL", "MN", "NC", "NV", "SC", "VA", "WA"]) assert.equal(stateSourceRead(st), "2026-11-14", st);
  assert.equal(stateSourceRead("TX"), "2026-11-12");
  // Frequencies the page does not list get a note dated by that page's own reading
  assert.match(stateFilingNote("NC", "annual"), /North Carolina's own page lists monthly, quarterly sales tax filing, not annual .*read 2026-11-14/);
  assert.match(stateFilingNote("VA", "annual"), /Virginia's own page lists monthly, quarterly .*not annual/);
  assert.match(stateFilingNote("WA", "semiannual"), /not semiannual/);
  assert.equal(stateFilingNote("MN", "annual"), null);
  assert.equal(stateFilingNote("GA", "quarterly"), null); // GA's page names no frequency list (monthly unless the state agrees otherwise)
  // Georgia's vendor's compensation, Form ST-3 Part C: 3% of the first $3,000 of tax, .5% of the rest
  assert.deepEqual(stateDiscounts("GA")["GA state"].tiers, [{ upTo: 300000, rate: 0.03 }, { rate: 0.005 }]);
  for (const st of ["GA", "IL", "MN", "NC", "NV", "SC", "VA", "WA"]) assert.match(STATE_SOURCES[st].url, /^https:\/\/[a-z.]*\.(gov|us)\//);
});

// Second 2026-11-14 batch (eval/state-pages-2026-11-14b.md quotes the sentences): MO, NY, OH, TN read on their own pages or statute.
test("MO, NY, OH and TN match their own pages (read 2026-11-14), with Missouri's 2% and New York's vendor collection credit", async () => {
  const { STATE_SOURCES, stateSourceRead, stateDiscounts, salesTaxReturn } = await import("./salestaxreturn.mjs");
  const cases = [
    ["MO", "monthly", "2026-10", "2026-11-30"], ["MO", "quarterly", "2026-Q1", "2026-04-30"], ["MO", "annual", "2026", "2027-01-31"],
    ["NY", "monthly", "2026-10", "2026-11-20"], ["NY", "annual", "2026-02", "2026-03-20"], // ST-101 covers Mar 1 - Feb 28 (period labelled by its end month), "due by March 20"
    ["OH", "monthly", "2026-10", "2026-11-23"], // R.C. 5739.12(A)(1): "on or before the twenty-third day of each month"
    ["TN", "monthly", "2026-10", "2026-11-20"], ["TN", "quarterly", "2026-Q3", "2026-10-20"], ["TN", "annual", "2026", "2027-01-20"],
  ];
  for (const [st, f, period, due] of cases) assert.equal(dueDate(period, stateDueDay(st, f)), due, `${st} ${f} ${period}`);
  for (const st of ["MO", "NY", "OH", "TN"]) { assert.equal(stateSourceRead(st), "2026-11-14", st); assert.match(STATE_SOURCES[st].url, /^https:\/\/[a-z.]*\.gov\//); }
  assert.match(stateFilingNote("TN", "semiannual"), /Tennessee's own page lists monthly, quarterly, annual sales tax filing, not semiannual/);
  assert.equal(stateFilingNote("MO", "quarterly"), null);
  // Missouri: 2% of the tax due, no cap printed
  assert.deepEqual(stateDiscounts("mo"), { "MO state": { rate: 0.02 } });
  // New York: 5% up to $200 per quarterly or annual return; monthly (part-quarterly) filers get none
  assert.deepEqual(stateDiscounts("NY", "quarterly"), { "NY state": { rate: 0.05, cap: 20000 } });
  assert.deepEqual(stateDiscounts("NY", "annual"), { "NY state": { rate: 0.05, cap: 20000 } });
  assert.deepEqual(stateDiscounts("NY", "monthly"), {});
  const mk = (label, dollars) => addDocuments(importStatement(newBooks(), "Date,Description,Amount\n2026-03-01,X,1.00\n", "1000").books,
    `type,number,date,due,party,amount,account,description\ninvoice,1,2026-04-10,,A Co,10000.00,4000,Goods\ninvoice,1,2026-04-10,,A Co,${dollars}.00,2100,${label}\n`).books;
  const row = (st, dollars, frequency) => salesTaxReturn(mk(`${st} state`, dollars), { frequency, endMonth: stateEndMonth(st, frequency), discounts: stateDiscounts(st, frequency) }).periods[0].rows.find((x) => x.jurisdiction === `${st} state`);
  assert.equal(row("NY", 1000, "quarterly").discount, 5000);   // $1,000 x 5% = $50
  assert.equal(row("NY", 10000, "quarterly").discount, 20000); // $500, capped at $200
  assert.equal(row("NY", 10000, "monthly").discount, 0);
  assert.equal(row("MO", 10000, "monthly").discount, 20000);   // $10,000 x 2% = $200, uncapped
  assert.equal(row("MO", 100, "monthly").payable, 9800);       // the FAQ's own example: $100 less $2 is $98
});

// Fourth 2026-11-14 batch (eval/state-pages-2026-11-14d.md quotes the sentences): MD and UT from their statutes, CO from the signed HB25B-1005.
test("MD, UT and CO vendor discounts match their statutes (read 2026-11-14)", async () => {
  const { stateDiscounts, stateDiscountNote, salesTaxReturn } = await import("./salestaxreturn.mjs");
  const mk = (label, dollars) => addDocuments(importStatement(newBooks(), "Date,Description,Amount\n2026-03-01,X,1.00\n", "1000").books,
    `type,number,date,due,party,amount,account,description\ninvoice,1,2026-04-10,,A Co,100000.00,4000,Goods\ninvoice,1,2026-04-10,,A Co,${dollars}.00,2100,${label}\n`).books;
  const row = (st, dollars, frequency) => salesTaxReturn(mk(`${st} state`, dollars), { frequency, discounts: stateDiscounts(st, frequency) }).periods[0].rows.find((x) => x.jurisdiction === `${st} state`);
  // Maryland Tax-General 11-105: 1.2% of the first $6,000 of tax on each return, 0.9% of the rest, at most $500 a return
  assert.equal(row("MD", 5000, "monthly").discount, 6000);    // $5,000 x 1.2% = $60
  assert.equal(row("MD", 20000, "monthly").discount, 19800);  // $72 + 0.9% of $14,000 ($126) = $198
  assert.equal(row("MD", 60000, "monthly").discount, 50000);  // $72 + $486 = $558, capped at $500
  assert.equal(row("MD", 60000, "quarterly").discount, 50000); // the cap is per return, not per month
  assert.equal(row("MD", 20000, "monthly").payable, 2000000 - 19800);
  // Utah Code 59-12-108(2)(b): monthly filers retain 1.31%; quarterly and annual filers nothing
  assert.equal(row("UT", 1000, "monthly").discount, 1310);    // $1,000 x 1.31% = $13.10
  assert.equal(row("UT", 1000, "quarterly").discount, 0);
  assert.deepEqual(stateDiscounts("UT", "annual"), {});
  // Colorado: no state vendor fee from January 1, 2026 (39-26-105(1)(d)(V) as added by HB25B-1005)
  assert.deepEqual(stateDiscounts("CO", "monthly"), {});
  assert.equal(row("CO", 1000, "monthly").discount, 0);
  assert.match(stateDiscountNote("co"), /no state vendor fee from January 1, 2026/);
  assert.match(stateDiscountNote("CO"), /--discount "CO state=4,1000"/);
  assert.match(stateDiscountNote("MD"), /at most \$500 a return/);
  assert.match(stateDiscountNote("UT"), /--freq monthly only/);
});

// Vendor discounts read on the states' own sites 2026-11-12; each figure worked by hand from the quoted rule.
test("vendor discounts read 2026-11-12: tiers, caps, steps and floors per state", async () => {
  const { stateDiscounts, stateDiscountNote } = await import("./salestaxreturn.mjs");
  const mk = (st, cents) => addDocuments(importStatement(newBooks(), "Date,Description,Amount\n2026-03-01,X,1.00\n", "1000").books,
    `type,number,date,due,party,amount,account,description\ninvoice,1,2026-03-10,,A Co,100000.00,4000,Goods\ninvoice,1,2026-03-10,,A Co,${(cents / 100).toFixed(2)},2100,${st} state\n`).books;
  const run = (st, cents, frequency = "monthly") => salesTaxReturn(mk(st, cents), { frequency, discounts: stateDiscounts(st) }).periods[0].rows.find((x) => x.jurisdiction === `${st} state`).discount;
  assert.equal(run("AL", 50000), 500 + 800);           // 5% of $100 + 2% of $400
  assert.equal(run("AL", 5000000), 40000);             // $5 + $998 = $1,003, capped at $400 a month
  assert.equal(run("AL", 20000000, "quarterly"), 120000); // $5 + $3,998 capped at three months of $400
  assert.equal(run("KY", 200000), 1750 + 1500);        // 1.75% of $1,000 + 1.5% of $1,000 = $32.50
  assert.equal(run("KY", 1000000), 5000);              // $17.50 + $135 = $152.50, capped at $50 a return
  assert.equal(run("LA", 10000000), 75000);            // 0.84% of $100,000 = $840, capped at $750 a month
  assert.equal(run("LA", 100000), 840);
  assert.equal(run("MS", 100000), 2000);               // 2% of $1,000
  assert.equal(run("MS", 1000000), 5000);              // $200 capped at $50
  assert.equal(run("NE", 200000), 5000);               // 2.5% of $2,000
  assert.equal(run("NE", 400000), 7500);               // $100 capped at $75
  assert.equal(run("ND", 500000), 7500);               // 1.5% of $5,000
  assert.equal(run("ND", 1000000), 11000);             // $150 capped at $110
  assert.equal(run("PA", 100000), 1000);               // 1% of $1,000
  assert.equal(run("PA", 1000000), 2500);              // $100 capped at $25 monthly
  assert.equal(run("PA", 1000000, "quarterly"), 7500); // $75 quarterly
  assert.equal(run("PA", 5000000, "semiannual"), 15000); // $150 semiannual
  assert.equal(run("SC", 9900), 297);                  // under $100: 3% of $99
  assert.equal(run("SC", 10000), 200);                 // $100 or more: 2% of the whole $100
  assert.equal(run("WI", 50000), 1000);                // 0.75% of $500 = $3.75, floor $10
  assert.equal(run("WI", 500), 500);                   // floor is the lesser of $10 and the $5 tax
  assert.equal(run("WI", 10000000), 75000);            // 0.75% of $100,000
  assert.equal(run("WI", 200000000), 800000);          // $15,000 capped at $8,000 a period
  assert.equal(run("MO", 100000), 2000);               // 2%, no cap
  assert.equal(run("WY", 100000), 1950);               // 1.95% of $1,000
  assert.equal(run("WY", 5000000), 50000);             // $975 capped at $500
  assert.equal(run("AZ", 100000), 1200);               // 1.2% e-filed
  assert.equal(run("FL", 100000), 2500);               // 2.5% of $1,000
  assert.equal(run("FL", 200000), 3000);               // 2.5% of the first $1,200 = $30 at most
  assert.equal(run("TX", 100000), 500);                // 0.5%
  for (const st of ["IN", "OK", "NM"]) assert.deepEqual(stateDiscounts(st), {}, st);
  assert.match(stateDiscountNote("OK"), /no vendor discount line/);
  assert.match(stateDiscountNote("wy"), /postmarked by the 15th/);
  assert.equal(stateDiscountNote("CA"), null);
  assert.throws(() => salesTaxReturn(mk("SC", 100), { discounts: { "SC state": { rate: 0.02, steps: [{ rate: 3 }] } } }));
});

// Read on the states' own sites 2026-11-14 (eval/state-pages-2026-11-14c.md): Michigan's 2026 Form 5080 and 5081 instructions and
// MCL 205.54; Virginia's Form ST-1 instructions, Rev. 09/26. Every figure below is worked by hand from those worksheets.
test("MI discount: the greater of 0.5% of the 4% part and $6 a month, never more than 2/3 of the tax (2026 Form 5080, 5081)", async () => {
  const { salesTaxReturn, stateDiscounts, stateDiscountNote } = await import("./salestaxreturn.mjs");
  const mk = (salesCents, taxCents) => addDocuments(importStatement(newBooks(), "Date,Description,Amount\n2026-03-01,X,1.00\n", "1000").books,
    `type,number,date,due,party,amount,account,description\ninvoice,1,2026-03-10,,A Co,${(salesCents / 100).toFixed(2)},4000,Goods\ninvoice,1,2026-03-10,,A Co,${(taxCents / 100).toFixed(2)},2100,MI state\n`).books;
  const run = (freq, taxCents) => salesTaxReturn(mk(taxCents / 0.06, taxCents), { frequency: freq, discounts: stateDiscounts("MI", freq) }).periods[0].rows[0].discount;
  assert.equal(run("monthly", 600), 400);              // under $9: $6 x 2/3 = $4
  assert.equal(run("monthly", 90000), 600);            // $9 to $1,800 paid by the 20th: $6
  assert.equal(run("monthly", 600000), 2000);          // $6,000 x .6667 x .005 = $20.00
  assert.equal(run("monthly", 600000000), 1500000);    // $6,000,000 x .6667 x .005 = $20,001, at most $15,000 a period
  assert.equal(run("quarterly", 100000), 1800);        // quarterly $27 to $5,400: $18
  assert.equal(run("quarterly", 2400), 1600);          // quarterly under $27: $24 x 2/3 = $16
  assert.equal(run("annual", 50000), 7200);            // annual, $108 or more: $72
  assert.equal(run("annual", 9000), 6000);             // annual under $108: $90 x 2/3 = $60
  assert.match(stateDiscountNote("MI"), /12th/);
  assert.throws(() => salesTaxReturn(mk(100, 6), { discounts: { "MI state": { rate: 0.003, floorPerMonth: -1 } } }));
});

test("VA dealer discount: taxable sales x 0.043 x a rate picked by monthly taxable sales (Form ST-1, Rev. 09/26)", async () => {
  const { salesTaxReturn, stateDiscounts, stateDiscountNote } = await import("./salestaxreturn.mjs");
  const mk = (salesCents, taxCents) => addDocuments(importStatement(newBooks(), "Date,Description,Amount\n2026-03-01,X,1.00\n", "1000").books,
    `type,number,date,due,party,amount,account,description\ninvoice,1,2026-03-10,,A Co,${(salesCents / 100).toFixed(2)},4000,Goods\ninvoice,1,2026-03-10,,A Co,${(taxCents / 100).toFixed(2)},2100,VA state\n`).books;
  const run = (freq, salesCents) => salesTaxReturn(mk(salesCents, Math.round(salesCents * 0.053)), { frequency: freq, discounts: stateDiscounts("VA", freq) }).periods[0].rows[0].discount;
  assert.equal(run("monthly", 1000000), 480);          // $10,000 x 0.043 x .01116 = $4.80
  assert.equal(run("monthly", 10000000), 3599);        // $100,000 a month: x .00837 = $35.99
  assert.equal(run("monthly", 30000000), 7198);        // $300,000 a month: x .00558 = $71.98
  assert.equal(run("monthly", 6250000), 2999);         // $62,500 is still the first band ("less than $62,501"): x .01116 = $29.99
  assert.equal(run("quarterly", 15000000), 7198);      // $150,000 a quarter is $50,000 a month: x .01116 = $71.98
  assert.equal(run("monthly", 15000000), 5399);        // the same $150,000 in one month: x .00837 = $53.99
  assert.match(stateDiscountNote("VA"), /\$20,000/);
  assert.equal(salesTaxReturn(mk(1000000, 53000), { frequency: "monthly", discounts: { "VA state": { rate: 0 } } }).periods[0].rows[0].discount, 0);
});

test("a sales band rate over 100% is refused like every other discount rate (red team 2026-11-14)", async () => {
  const { salesTaxReturn } = await import("./salestaxreturn.mjs");
  const bad = { "VA state": { rate: 0, onSales: 0.043, bands: [{ belowMonthlySales: 6250100, rate: 0.01116 }, { rate: 1.5 }] } };
  assert.throws(() => salesTaxReturn(books(), { discounts: bad }), /discount for "VA state"/);
  assert.doesNotThrow(() => salesTaxReturn(books(), { discounts: { "VA state": { ...bad["VA state"], bands: [{ rate: 1 }] } } }));
});

test("a --state preset that matches no tax line says it was not applied (red team 2026-11-14)", async () => {
  // Before: --state MI on a book labelled "MI" or "Michigan" took no discount, and the Michigan note still said it "is applied".
  const { salesTaxReturn, stateDiscounts, presetDiscountWarning } = await import("./salestaxreturn.mjs");
  const mk = (label) => addDocuments(importStatement(newBooks(), "Date,Description,Amount\n2026-01-01,X,1.00\n", "1000").books,
    `type,number,date,due,party,amount,account,description\ninvoice,1,2026-01-10,,A Co,5000.00,4000,Goods\ninvoice,1,2026-01-10,,A Co,300.00,2100,${label}\n`).books;
  const ret = (label, extra = {}) => salesTaxReturn(mk(label), { frequency: "monthly", discounts: { ...stateDiscounts("MI", "monthly"), ...extra } });
  assert.equal(ret("MI state").periods[0].rows[0].discount, 600);
  assert.equal(presetDiscountWarning("MI", "monthly", ret("MI state")), null);
  for (const label of ["MI", "Michigan"]) {
    const t = ret(label);
    assert.equal(t.periods[0].rows[0].discount, 0);
    const w = presetDiscountWarning("mi", "monthly", t);
    assert.match(w, /^Michigan's preset discount was not applied/);
    assert.ok(w.includes(`"${label}"`) && w.includes('"MI state"'));
  }
  // a discount the user gave for their own label is not a miss
  const own = { MI: { rate: 0.005 } };
  assert.equal(presetDiscountWarning("MI", "monthly", ret("MI", own), own), null);
  // no preset, or nothing on the return: nothing to say
  assert.equal(presetDiscountWarning("IN", "monthly", ret("Indiana")), null);
  assert.equal(presetDiscountWarning("NY", "monthly", ret("NY")), null);
  assert.equal(presetDiscountWarning(null, "monthly", ret("MI")), null);
  assert.equal(presetDiscountWarning("MI", "monthly", { periods: [] }), null);
});

test("CLI: --state MI on a book labelled \"MI\" prints the not-applied warning, not the applied note", async () => {
  const { execFileSync } = await import("node:child_process");
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "stpreset-"));
  const b = addDocuments(importStatement(newBooks(), "Date,Description,Amount\n2026-01-01,X,1.00\n", "1000").books,
    "type,number,date,due,party,amount,account,description\ninvoice,1,2026-01-10,,A Co,5000.00,4000,Goods\ninvoice,1,2026-01-10,,A Co,300.00,2100,MI\n").books;
  writeFileSync(join(dir, "b.json"), JSON.stringify(b));
  const out = JSON.parse(execFileSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "--books", join(dir, "b.json"), "salestax", "return", "--state", "MI", "--freq", "monthly", "--json"], { encoding: "utf8" }));
  assert.ok(out.warnings.some((w) => /preset discount was not applied/.test(w)));
  assert.ok(!out.warnings.some((w) => /discount is applied/.test(w)));
});

test("a jurisdiction whose taxable sales net to zero gets no rate warning (red team 2026-11-14)", () => {
  // a $100 sale and its full credit note in one quarter: rate is null, there is nothing to compare with --rate
  const b = addDocuments(importStatement(newBooks(), "Date,Description,Amount\n2026-01-01,X,1.00\n", "1000").books, [
    "type,number,date,due,party,amount,account,description",
    "invoice,1,2026-01-10,,A Co,100.00,4000,Goods", "invoice,1,2026-01-10,,A Co,6.00,2100,CA state",
    "credit note,2,2026-01-20,,A Co,100.00,4000,Return", "credit note,2,2026-01-20,,A Co,6.00,2100,CA state",
  ].join("\n") + "\n").books;
  const r = salesTaxReturn(b, { rates: { "CA state": 0.06 } });
  assert.equal(r.periods[0].rows[0].rate, null);
  assert.deepEqual(r.warnings.filter((w) => /expected/.test(w)), []);
});

test("from alone (no to) leaves out tax payments dated before it (red team 2026-11-14)", () => {
  const b = addDocuments(importStatement(newBooks(), "Date,Description,Amount\n2026-01-01,X,1.00\n", "1000").books, csv).books;
  const st = importStatement(b, "Date,Description,Amount\n2026-03-05,CDTFA payment,-9.00\n2026-04-15,CDTFA payment,-12.00\n", "1000");
  const books2 = confirm(st.books, Object.fromEntries(st.books.transactions.filter((t) => /CDTFA/.test(t.desc)).map((t) => [t.id, "2100"])));
  assert.equal(salesTaxReturn(books2).totals.paid, 2100);
  assert.equal(salesTaxReturn(books2, { from: "2026-04-01" }).totals.paid, 1200); // the March payment drops out
  assert.equal(salesTaxReturn(books2, { to: "2026-03-31" }).totals.paid, 900);    // and with to alone, the April one
});

// Fifth 2026-11-14 batch (eval/state-pages-2026-11-14e.md quotes each sentence): AR rules GR-77/GR-84, NJ's filing page, the RI, ME and MA
// statutes, and Indiana's bulletins #83 (allowance) and #102 (due day), whose bands are worked out from the book's own past tax.
test("AR's 2% prompt-payment discount is capped at $1,000 for each month of the return (rule GR-84)", async () => {
  const { stateDiscounts, stateDiscountNote, salesTaxReturn } = await import("./salestaxreturn.mjs");
  const mk = (dollars) => addDocuments(importStatement(newBooks(), "Date,Description,Amount\n2026-03-01,X,1.00\n", "1000").books,
    `type,number,date,due,party,amount,account,description\ninvoice,1,2026-04-10,,A Co,900000.00,4000,Goods\ninvoice,1,2026-04-10,,A Co,${dollars}.00,2100,AR state\n`).books;
  const row = (dollars, frequency) => salesTaxReturn(mk(dollars), { frequency, discounts: stateDiscounts("AR", frequency) }).periods[0].rows[0];
  assert.equal(row(10000, "monthly").discount, 20000);      // 2% of $10,000 = $200
  assert.equal(row(80000, "monthly").discount, 100000);     // $1,600 capped at $1,000 a month
  assert.equal(row(80000, "quarterly").discount, 160000);   // a quarter's cap is three months, $3,000, so $1,600 stands
  assert.equal(row(200000, "quarterly").discount, 300000);  // $4,000 capped at $3,000
  assert.match(stateDiscountNote("AR"), /City and county tax gets 2% with no cap/);
});

test("NJ, RI, ME, MA and AR notes come from the pages read on 2026-11-14", async () => {
  const { stateDiscountNote, stateDiscounts, stateSourceRead, STATE_SOURCES } = await import("./salestaxreturn.mjs");
  assert.match(stateFilingNote("NJ", "monthly"), /more than \$30,000.*payments, not returns/);
  assert.match(stateFilingNote("NJ", "annual"), /lists quarterly sales tax filing, not annual/);
  assert.equal(stateFilingNote("NJ", "quarterly"), null);
  assert.match(stateFilingNote("RI", "quarterly"), /written authorization.*\$600/);
  assert.equal(stateFilingNote("RI", "monthly"), null);
  assert.match(stateFilingNote("AR", "quarterly"), /until then, file monthly/);
  assert.match(stateFilingNote("AR", "annual"), /January 20/);
  for (const st of ["NJ", "RI", "ME", "MA"]) {
    assert.deepEqual(stateDiscounts(st, "monthly"), {}, st);
    assert.match(stateDiscountNote(st), /no vendor discount/, st);
    assert.equal(stateSourceRead(st), "2026-11-14", st);
  }
  assert.equal(stateSourceRead("AR"), "2026-11-14");
  assert.match(STATE_SOURCES.IN.url, /gb102\.pdf$/);
  // dates the statutes and rules print: ME the 15th, RI the 20th and last day of the month after a quarter, AR the 20th, MA 30 days after
  assert.equal(dueDate("2026-09", stateDueDay("ME", "monthly")), "2026-10-15");
  assert.equal(dueDate("2026-Q2", stateDueDay("RI", "quarterly")), "2026-07-31");
  assert.equal(dueDate("2026", stateDueDay("AR", "annual")), "2027-01-20");
  assert.equal(dueDate("2026-Q3", stateDueDay("AR", "quarterly")), "2026-10-20");
  assert.equal(dueDate("2026-08", stateDueDay("MA", "monthly")), "2026-09-30");
});

test("Indiana's allowance band and due day are worked out from the book's own past tax (Bulletins #83 and #102)", async () => {
  const { stateHistoryPresets, salesTaxReturn, monthlyTaxByLabel } = await import("./salestaxreturn.mjs");
  // one invoice a month from `start` for `n` months, `dollars` of "IN state" tax each
  const mk = (start, n, dollarsFor) => {
    const lines = ["type,number,date,due,party,amount,account,description"];
    let [y, m] = start.split("-").map(Number);
    for (let i = 0; i < n; i++) {
      const d = `${y}-${String(m).padStart(2, "0")}-10`, tax = dollarsFor(y, m);
      lines.push(`invoice,${i + 1},${d},,A Co,${(tax * 14).toFixed(2)},4000,Goods`, `invoice,${i + 1},${d},,A Co,${tax.toFixed(2)},2100,IN state`);
      m += 1; if (m > 12) { m = 1; y += 1; }
    }
    return addDocuments(importStatement(newBooks(), `Date,Description,Amount\n${start}-01,X,1.00\n`, "1000").books, lines.join("\n") + "\n").books;
  };
  // July 2024 to December 2026 at $4,000 a month: $48,000 in Jul 2024-Jun 2025 (0.73% for 2026), $48,000 a year, $4,000 a month (> $1,000: the 20th)
  const b = mk("2024-07", 30, () => 4000);
  const h = stateHistoryPresets("IN", b, "monthly", { from: "2026-01-01" });
  assert.deepEqual(h.discounts, { "IN state": { rate: 0, byYear: { 2026: 0.0073 } } });
  assert.deepEqual(h.dueDay, { byYear: { 2026: 20 }, otherwise: 30 });
  assert.match(h.notes.join(" "), /0\.73% collection allowance, from \$48,000\.00 of "IN state" tax in July 2024 to June 2025/);
  assert.match(h.notes.join(" "), /due the 20th, from an average of \$4,000\.00 a month/);
  const t = salesTaxReturn(b, { frequency: "monthly", from: "2026-01-01", dueDay: h.dueDay, discounts: h.discounts, rollover: false });
  const jan = t.periods.find((p) => p.period === "2026-01").rows[0];
  assert.equal(jan.discount, 2920);   // 0.73% of $4,000 = $29.20
  assert.equal(jan.due, "2026-02-20");
  // $6,000 a month: $72,000 in the look-back year is over $60,000, so 0.53%
  const hi = stateHistoryPresets("IN", mk("2024-07", 30, () => 6000), "monthly", { from: "2026-01-01" });
  assert.equal(hi.discounts["IN state"].byYear[2026], 0.0053);
  // $600,000.01 and up: 0.26%; exactly $60,000 stays in the 0.73% band
  assert.equal(stateHistoryPresets("IN", mk("2024-07", 30, () => 50001), "annual", { from: "2026-01-01" }).discounts["IN state"].byYear[2026], 0.0026);
  assert.equal(stateHistoryPresets("IN", mk("2024-07", 30, () => 5000), "annual", { from: "2026-01-01" }).discounts["IN state"].byYear[2026], 0.0073);
  // $900 a month in 2025 is not over $1,000: the 30th, clamped to February's last day
  const small = stateHistoryPresets("IN", mk("2024-07", 30, () => 900), "monthly", { from: "2026-01-01" });
  assert.deepEqual(small.dueDay, { byYear: { 2026: 30 }, otherwise: 30 });
  assert.equal(dueDate("2026-01", small.dueDay), "2026-02-28");
  // a book that starts in 2026 holds no look-back months: no allowance, the 30th, and a note naming what is missing
  const fresh = stateHistoryPresets("IN", mk("2026-01", 6, () => 4000), "monthly");
  assert.deepEqual(fresh.discounts, {});
  assert.equal(fresh.dueDay, null);
  assert.match(fresh.notes.join(" "), /2026's allowance needs July 2024 to June 2025; 2026's due day needs all of 2025/);
  // credit notes reduce the look-back tax; other states and labels are untouched
  assert.deepEqual(stateHistoryPresets("OH", b, "monthly"), { discounts: {}, dueDay: null, notes: [] });
  assert.equal(monthlyTaxByLabel(b, "IN state").months["2025-03"], 400000);
  const cn = addDocuments(b, "type,number,date,due,party,amount,account,description\ncredit note,C1,2025-03-20,,A Co,14000.00,4000,Return\ncredit note,C1,2025-03-20,,A Co,1000.00,2100,IN state\n").books;
  assert.equal(monthlyTaxByLabel(cn, "IN state").months["2025-03"], 300000);
  assert.match(stateHistoryPresets("IN", cn, "monthly", { from: "2026-01-01" }).notes.join(" "), /from \$47,000\.00 of "IN state" tax/);
  // a bad per-year rate or due day is refused like any other
  assert.throws(() => salesTaxReturn(b, { discounts: { "IN state": { rate: 0, byYear: { 2026: 2 } } } }), /discount for "IN state"/);
  assert.throws(() => salesTaxReturn(b, { dueDay: { byYear: { 2026: 40 }, otherwise: 30 } }), /due day/);
});
