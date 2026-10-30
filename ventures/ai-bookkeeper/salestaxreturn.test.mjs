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

test("IA: a note says semi-monthly prepayment filers are not modelled", () => {
  assert.match(stateFilingNote("IA", "quarterly"), /semi-monthly/);
  assert.equal(stateFilingNote("IA", "monthly") !== null, true);
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
