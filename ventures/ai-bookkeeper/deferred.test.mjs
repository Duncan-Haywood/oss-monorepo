import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm, journal, closeChecks, addDocuments } from "./engine.mjs";
import { addDeferral, addDeferralsCsv, cancelDeferral, markRefunded, removeDeferral, deferralSchedule, deferredRegister, deferredWaterfall, endAfterMonths, earnedThrough } from "./deferred.mjs";
import { cashBasis } from "./cashbasis.mjs";
import { trialBalance, profitAndLoss } from "./ledger.mjs";

const CSV = `Date,Description,Amount
2026-01-15,ACME CORP ANNUAL PLAN,1200.00
2026-06-30,OFFICE SUPPLIES,-20.00
`;
function base() {
  const b = importStatement(newBooks(), CSV, "1000").books;
  const [a, o] = b.transactions.map((t) => t.id);
  return confirm(b, { [a]: "2400", [o]: "6070" });
}
const bal = (books, code) => { const r = trialBalance(journal(books), books.accounts).rows.find((x) => x.code === code); return r ? r.debit - r.credit : 0; };

test("endAfterMonths gives the day before the anniversary, clamped in short months", () => {
  assert.equal(endAfterMonths("2026-01-15", 12), "2027-01-14");
  assert.equal(endAfterMonths("2026-01-01", 1), "2026-01-31");
  assert.equal(endAfterMonths("2026-01-31", 1), "2026-02-27"); // to 28 Feb exclusive
  assert.equal(endAfterMonths("2024-02-29", 12), "2025-02-27");
});

test("daily method earns by days served and closes the amount exactly", () => {
  const { deferral } = addDeferral(newBooks(), { name: "Plan", start: "2026-01-15", months: 12, amount: "1200" });
  const s = deferralSchedule(deferral);
  assert.equal(s.length, 13); // Jan 2026 part month to Jan 2027 part month
  assert.equal(s.reduce((a, r) => a + r.cents, 0), 120000);
  assert.equal(s[0].date, "2026-01-31");
  assert.equal(s[0].cents, Math.floor((120000 * 17) / 365));
  assert.equal(s.at(-1).date, "2027-01-14");
  assert.equal(earnedThrough(deferral, "2026-06-30"), Math.floor((120000 * 167) / 365));
});

test("monthly method gives an equal share per calendar month touched", () => {
  const { deferral } = addDeferral(newBooks(), { name: "Retainer", start: "2026-03-10", end: "2026-08-09", amount: "600", method: "monthly" });
  const s = deferralSchedule(deferral);
  assert.deepEqual(s.map((r) => r.cents), [10000, 10000, 10000, 10000, 10000, 10000]);
  assert.equal(s.at(-1).date, "2026-08-09");
});

test("odd cents never go missing, for any length and either method", () => {
  for (const method of ["daily", "monthly"]) for (const months of [1, 2, 7, 13, 36]) {
    const { deferral } = addDeferral(newBooks(), { name: "X", start: "2026-02-17", months, amount: "1000.03", method });
    const s = deferralSchedule(deferral);
    assert.equal(s.reduce((a, r) => a + r.cents, 0), 100003, `${method} ${months}`);
    assert.ok(s.every((r) => r.cents > 0));
  }
});

test("income is booked through the latest month in the books, which stay balanced", () => {
  const { books } = addDeferral(base(), { name: "Plan", customer: "Acme", start: "2026-01-15", months: 12, amount: "1200" });
  const earned = Math.floor((120000 * 167) / 365);
  assert.equal(-bal(books, "4000"), earned);
  assert.equal(-bal(books, "2400"), 120000 - earned);
  assert.ok(trialBalance(journal(books), books.accounts).balanced);
  const r = deferredRegister(books);
  assert.equal(r.asOf, "2026-06-30");
  assert.equal(r.unearned, 120000 - earned);
  assert.equal(closeChecks(books).some((c) => c.check === "deferred"), false);
});

test("close check flags a receipt with no row and a row with no receipt", () => {
  const b = base();
  // receipt in 2400, no row
  const extra = addDeferral(b, { name: "Plan", start: "2026-01-15", months: 12, amount: "1200" }).books;
  const noRow = removeDeferral(extra, "DR-1").books;
  noRow.deferrals = [addDeferral(newBooks(), { name: "Tiny", start: "2026-01-01", months: 2, amount: "1" }).deferral];
  assert.ok(closeChecks(noRow).some((c) => c.check === "deferred"));
  // a second row with no receipt
  const twice = addDeferral(extra, { name: "Other", start: "2026-02-01", months: 6, amount: "300" }).books;
  const msg = closeChecks(twice).find((c) => c.check === "deferred");
  assert.match(msg.message, /no receipt filed/);
});

test("cancellation stops earning on the day and leaves a refund until it is paid", () => {
  let { books } = addDeferral(base(), { name: "Plan", start: "2026-01-15", months: 12, amount: "1200" });
  const c = cancelDeferral(books, "DR-1", { date: "2026-03-10" });
  const earned = Math.floor((120000 * 55) / 365); // Jan 15 to Mar 10
  assert.equal(c.refund, 120000 - earned);
  books = c.books;
  const r = deferredRegister(books);
  assert.equal(r.rows[0].earned, earned);
  assert.equal(r.rows[0].unearned, 0);
  assert.equal(r.rows[0].refundDue, 120000 - earned);
  assert.equal(-bal(books, "4000"), earned);
  assert.equal(closeChecks(books).some((x) => x.check === "deferred"), false); // refund still in 2400
  // pay the refund and record it
  let paid = importStatement(books, `Date,Description,Amount\n2026-03-20,REFUND ACME,-${((120000 - earned) / 100).toFixed(2)}\n`, "1000").books;
  const id = paid.transactions.at(-1).id;
  paid = confirm(paid, { [id]: "2400" });
  assert.match(closeChecks(paid).find((x) => x.check === "deferred").message, /deferred refunded/);
  paid = markRefunded(paid, "DR-1", { date: "2026-03-20" }).books;
  assert.equal(closeChecks(paid).some((x) => x.check === "deferred"), false);
  assert.equal(bal(paid, "2400"), 0);
});

test("a kept cancellation earns the rest on the day", () => {
  const { books } = addDeferral(base(), { name: "Plan", start: "2026-01-15", months: 12, amount: "1200" });
  const c = cancelDeferral(books, "DR-1", { date: "2026-03-10", keep: true });
  assert.equal(c.refund, 0);
  assert.equal(-bal(c.books, "4000"), 120000);
  assert.equal(bal(c.books, "2400"), 0);
  const last = deferralSchedule(c.books.deferrals[0]).at(-1);
  assert.equal(last.date, "2026-03-10");
});

test("a monthly row cancelled mid-month earns that month by its days", () => {
  const { deferral } = addDeferral(newBooks(), { name: "R", start: "2026-01-01", months: 10, amount: "1000", method: "monthly" });
  const c = cancelDeferral({ ...newBooks(), deferrals: [deferral] }, "DR-1", { date: "2026-04-15" });
  // Jan-Mar 300.00, then 15/30 of April's 100.00
  assert.equal(earnedThrough(c.deferral, "2026-04-15"), 30000 + 5000);
  assert.equal(c.refund, 100000 - 35000);
});

test("waterfall lists the months ahead and splits current from long term", () => {
  let { books } = addDeferral(base(), { name: "Plan", start: "2026-01-15", months: 12, amount: "1200" });
  books = addDeferral(books, { name: "Three years", start: "2026-06-01", months: 36, amount: "3600", method: "monthly" }).books;
  const w = deferredWaterfall(books, { horizon: 6 });
  assert.equal(w.asOf, "2026-06-30");
  assert.deepEqual(w.months, ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]);
  assert.equal(w.rows[1].byMonth[0], 10000);
  const reg = deferredRegister(books);
  assert.equal(w.unearned, reg.unearned);
  assert.equal(w.current + w.longTerm, w.unearned);
  assert.equal(w.rows[1].later + w.rows[1].byMonth.reduce((a, b) => a + b, 0), w.rows[1].unearned);
  // the three-year plan: 12 of its 35 remaining months are current
  assert.equal(w.longTerm, 23 * 10000);
  assert.equal(w.totals.reduce((a, b) => a + b, 0) + w.later, w.unearned);
});

test("CSV import matches headers by name, skips bad rows with a line number", () => {
  const csv = `Customer,Plan,Amount,Period Start (UTC),Period End (UTC),Date
Acme,Pro annual,1200.00,2026-01-15,2027-01-15,2026-01-15
Beta,Team monthly,abc,2026-02-01,2026-03-01,2026-02-01
Gamma,Pro annual,240,02/01/2026,02/01/2027,
`;
  const r = addDeferralsCsv(newBooks(), csv, { endExclusive: true });
  assert.equal(r.added, 2);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /^line 3: Amount/);
  assert.equal(r.books.deferrals[0].end, "2027-01-14");
  assert.equal(r.books.deferrals[0].customer, "Acme");
  assert.equal(r.books.deferrals[1].start, "2026-02-01");
  assert.equal(r.books.deferrals[1].received, "2026-02-01");
  const bad = addDeferralsCsv(newBooks(), "a,b\n1,2\n");
  assert.equal(bad.added, 0);
  assert.match(bad.problems[0], /no name, amount, start, end or months/);
  const months = addDeferralsCsv(newBooks(), "name,amount,start,months,method\nPass,100,2026-05-01,4,monthly\n");
  assert.equal(months.books.deferrals[0].end, "2026-08-31");
  assert.equal(months.books.deferrals[0].method, "monthly");
});

test("an invoice filed to 2400 is deferred the same way as a bank receipt", () => {
  let b = newBooks();
  b = addDocuments(b, "type,number,date,due,party,amount,account\ninvoice,INV-1,2026-01-01,2026-01-31,Acme,1200.00,2400\n").books;
  b = addDeferral(b, { name: "Support year", start: "2026-01-01", months: 12, amount: "1200", method: "monthly" }).books;
  b = importStatement(b, "Date,Description,Amount\n2026-04-30,COFFEE,-5.00\n", "1000").books;
  b = confirm(b, { [b.transactions[0].id]: "6130" });
  assert.equal(-bal(b, "4000"), 40000); // Jan-Apr
  assert.equal(-bal(b, "2400"), 80000);
  assert.equal(closeChecks(b).some((c) => c.check === "deferred"), false);
});

test("the cash method counts the whole receipt on the day it arrived", () => {
  const { books } = addDeferral(base(), { name: "Plan", start: "2026-01-15", months: 12, amount: "1200" });
  const cb = cashBasis(books, { from: "2026-01-01", to: "2026-06-30" });
  assert.equal(cb.profitAndLoss.totalIncome, 120000);
  assert.ok(cb.notes.some((n) => /received/.test(n)));
  const acc = profitAndLoss(journal(books), books.accounts, { from: "2026-01-01", to: "2026-06-30" });
  assert.equal(acc.totalIncome, Math.floor((120000 * 167) / 365));
});

test("bad input is refused with a sentence", () => {
  const b = newBooks();
  const add = (f) => addDeferral(b, { name: "x", start: "2026-01-01", months: 12, amount: "10", ...f });
  assert.throws(() => add({ amount: "0" }), /positive/);
  assert.throws(() => add({ name: " " }), /name/);
  assert.throws(() => add({ months: 0 }), /1 to 120/);
  assert.throws(() => add({ months: 12, end: "2026-12-31" }), /not both/);
  assert.throws(() => add({ months: undefined }), /last day of service/);
  assert.throws(() => add({ months: undefined, end: "2025-12-31" }), /before it starts/);
  assert.throws(() => add({ start: "2026-02-30" }), /not a YYYY-MM-DD/);
  assert.throws(() => add({ incomeAccount: "6070" }), /not an income account/);
  assert.throws(() => add({ method: "weekly" }), /daily or monthly/);
  const locked = { ...b, lockedThrough: "2026-03-31" };
  assert.throws(() => addDeferral(locked, { name: "x", start: "2026-01-01", months: 12, amount: "10" }), /locked/);
  const { books } = add({});
  assert.throws(() => cancelDeferral(books, "DR-9", { date: "2026-02-01" }), /No deferral/);
  assert.throws(() => cancelDeferral(books, "DR-1", { date: "2027-01-01" }), /nothing is left/);
  assert.throws(() => markRefunded(books, "DR-1", { date: "2026-02-01" }), /no refund owed/);
});

test("the numbers on deferred-revenue-schedule.html come from the register and waterfall", async () => {
  const { readFileSync } = await import("node:fs");
  const csv = "name,customer,amount,start,months,method\nAnnual plan,Acme,1200.00,2026-01-15,12,daily\nSix-month retainer,Beta,3000.00,2026-03-01,6,monthly\nTwo-year plan,Gamma,4800.00,2026-05-10,24,daily\n";
  const { books } = addDeferralsCsv(newBooks(), csv);
  const reg = deferredRegister(books, "2026-06-30");
  const w = deferredWaterfall(books, { asOf: "2026-06-30", horizon: 6 });
  const page = readFileSync(new URL("./deferred-revenue-schedule.html", import.meta.url), "utf8");
  const usd = (c) => "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
  const num = (c) => (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
  for (const r of reg.rows) for (const c of [r.cents, r.earned, r.unearned]) assert.ok(page.includes(usd(c)), usd(c));
  for (const c of [reg.cents, reg.earned, reg.unearned, w.current, w.longTerm]) assert.ok(page.includes(usd(c)), usd(c));
  for (const r of w.rows) for (const c of [...r.byMonth.filter(Boolean), r.later].filter(Boolean)) assert.ok(page.includes(`<td>${num(c)}</td>`), num(c));
  for (const c of [...w.totals, w.later]) assert.ok(page.includes(`<td>${num(c)}</td>`), num(c));
});
