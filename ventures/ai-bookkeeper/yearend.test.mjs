import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm, journal, reports, exportJournal, closeChecks } from "./engine.mjs";
import { closeYear, reopenYear, yearEndReport, closingEntries, fiscalSpan } from "./yearend.mjs";
import { balances } from "./ledger.mjs";

const pick = { SALE: "4000", HOST: "6130", FEE: "6010", DRAW: "3100", PUT: "3010" };
const filed = (rows, start = newBooks()) => {
  const b = importStatement(start, "Date,Description,Amount\n" + rows.map(([d, n, a]) => `${d},${n},${a}`).join("\n") + "\n", "1000").books;
  return confirm(b, Object.fromEntries(b.transactions.map((t) => [t.id, pick[t.desc.split(" ")[0]]])));
};
const books = filed([
  ["2025-03-05", "SALE ONE", "1000.00"], ["2025-04-09", "HOST A", "-250.00"], ["2025-11-12", "FEE X", "-40.00"], ["2025-12-01", "DRAW OWNER", "-100.00"],
  ["2026-02-05", "SALE TWO", "500.00"],
]);

test("closing a year posts one entry to retained earnings and locks the year", () => {
  const c = closeYear(books, 2025);
  assert.equal(c.lockedThrough, "2025-12-31");
  const entry = journal(c, { withClosing: true }).find((e) => e.id === "CLOSE-2025");
  assert.equal(entry.date, "2025-12-31");
  // sales 1000 credit closes with a debit; two expenses close with credits; profit 710 to 3900
  const re = entry.lines.find((l) => l.account === "3900");
  assert.deepEqual([re.debit, re.credit], [0, 71000]);
  assert.equal(entry.lines.reduce((a, l) => a + l.debit - l.credit, 0), 0);
  assert.equal(entry.lines.some((l) => l.account === "3100"), false);
});

test("the profit and loss and the plain journal still show the closed year", () => {
  const c = closeYear(books, 2025);
  assert.equal(journal(c).some((e) => e.closing), false);
  assert.equal(reports(c, { from: "2025-01-01", to: "2026-12-31" }).profitAndLoss.net, 71000 + 50000);
  assert.equal(reports(c, { from: "2025-01-01", to: "2025-12-31" }).cashFlow.ties, true);
});

test("the balance sheet holds the year in retained earnings and still balances", () => {
  const c = closeYear(books, 2025);
  const bs = reports(c, { to: "2026-02-28" }).balanceSheet;
  assert.equal(bs.balanced, true);
  assert.equal(bs.equity.find((r) => r.code === "3900").amount, 71000);
  assert.equal(bs.currentEarnings, 50000);
  const open = reports(books, { to: "2026-02-28" }).balanceSheet;
  assert.equal(open.totalEquity, bs.totalEquity);
  assert.equal(open.currentEarnings, 121000);
});

test("after the close, income and expense accounts are zero for that year in the exported journal", () => {
  const c = closeYear(books, 2025);
  const csv = exportJournal(c, "csv");
  assert.match(csv, /CLOSE-2025,2025-12-31,3900,Retained earnings,,710\.00/);
  const all = journal(c, { withClosing: true });
  const b = balances(all, { from: "2025-01-01", to: "2025-12-31" });
  for (const code of ["4000", "6130", "6010"]) assert.equal(b.get(code) ?? 0, 0);
});

test("--draws closes owner draws and contributions too; otherwise they stay", () => {
  const c = closeYear(books, 2025, { draws: true });
  const entry = journal(c, { withClosing: true }).find((e) => e.id === "CLOSE-2025");
  assert.equal(entry.lines.find((l) => l.account === "3900").credit, 61000);
  assert.equal(entry.lines.find((l) => l.account === "3100").credit, 10000);
});

test("a loss closes with a debit to retained earnings", () => {
  const b = filed([["2025-03-05", "HOST A", "-300.00"], ["2025-03-06", "SALE ONE", "100.00"]]);
  const entry = journal(closeYear(b, 2025), { withClosing: true }).find((e) => e.id === "CLOSE-2025");
  const re = entry.lines.find((l) => l.account === "3900");
  assert.deepEqual([re.debit, re.credit], [20000, 0]);
  assert.equal(yearEndReport(closeYear(b, 2025), 2025).retainedAfter, -20000);
});

test("refuses a second close, an earlier year after a later one, and a year with lines in review", () => {
  const c = closeYear(books, 2025);
  assert.throws(() => closeYear(c, 2025), /already closed/);
  const c2 = closeYear(c, 2026);
  assert.throws(() => closeYear(c2, 2025), /already closed|later year/);
  const pending = importStatement(newBooks(), "Date,Description,Amount\n2025-05-05,MYSTERY THING,-5.00\n", "1000").books;
  assert.throws(() => closeYear(pending, 2025), /still need an account/);
  assert.throws(() => closeYear(books, "abc"), /four-digit/);
});

test("reopen removes the entry and restores the earlier lock", () => {
  const locked = { ...closeYear(books, 2025), };
  const c2 = closeYear(locked, 2026);
  assert.throws(() => reopenYear(c2, 2025), /Only the latest/);
  const r = reopenYear(c2, 2026);
  assert.equal(r.lockedThrough, "2025-12-31");
  const back = reopenYear(r, 2025);
  assert.equal(back.lockedThrough, undefined);
  assert.equal(back.yearEnd, undefined);
  assert.equal(journal(back, { withClosing: true }).some((e) => e.closing), false);
});

test("the entry follows the year's postings and report says what moved", () => {
  const c = closeYear(books, 2025);
  const rep = yearEndReport(c, 2025);
  assert.deepEqual([rep.closed, rep.netToRetained, rep.retainedBefore, rep.retainedAfter], [true, 71000, 0, 71000]);
  assert.equal(yearEndReport(books, 2025).closed, false);
  assert.equal(closeChecks(c).some((x) => x.severity === "high"), false);
  assert.deepEqual(closingEntries(books, journal(books)), []);
});

// A fiscal year ending 30 June 2026 runs 2025-07-01 to 2026-06-30.
const fy = filed([
  ["2025-03-05", "SALE ONE", "400.00"], // before the fiscal year: stays out of it
  ["2025-08-05", "SALE TWO", "1000.00"], ["2025-09-09", "HOST A", "-250.00"],
  ["2026-06-30", "FEE X", "-40.00"], // last day, in
  ["2026-07-01", "SALE TWO", "500.00"], // first day of the next year, out
]);

test("a fiscal year closes the twelve months ending in its month, dated its last day", () => {
  const c = closeYear(fy, 2026, { month: 6 });
  assert.equal(c.lockedThrough, "2026-06-30");
  assert.equal(c.yearEnd[0].month, 6);
  const entry = journal(c, { withClosing: true }).find((e) => e.id === "CLOSE-2026");
  assert.equal(entry.date, "2026-06-30");
  const re = entry.lines.find((l) => l.account === "3900");
  assert.deepEqual([re.debit, re.credit], [0, 71000]); // 1000 - 250 - 40, not the March or July sales
  assert.equal(entry.lines.reduce((a, l) => a + l.debit - l.credit, 0), 0);
});

test("a fiscal-year report starts from the day before the year and the balance sheet balances", () => {
  const c = closeYear(fy, 2026, { month: 6 });
  const r = yearEndReport(c, 2026);
  assert.equal(r.netToRetained, 71000);
  assert.equal(r.retainedBefore, 0);
  assert.equal(r.retainedAfter, 71000);
  const bs = reports(c, { to: "2026-07-31" }).balanceSheet;
  assert.equal(bs.balanced, true);
  assert.equal(bs.equity.find((x) => x.code === "3900").amount, 71000);
});

test("a leap-year February year-end falls on the 29th", () => {
  assert.equal(fiscalSpan(2028, 2).to, "2028-02-29");
  assert.equal(fiscalSpan(2027, 2).to, "2027-02-28");
  assert.deepEqual(fiscalSpan(2026), { from: "2026-01-01", to: "2026-12-31" });
});

test("the year-end month must be valid and stay the same across closes", () => {
  assert.throws(() => closeYear(fy, 2026, { month: 13 }), /1 to 12/);
  const c = closeYear(fy, 2026, { month: 6 });
  assert.throws(() => closeYear(c, 2027, { month: 12 }), /keep the same year-end month/);
  assert.equal(closeYear(c, 2027, { month: 6 }).lockedThrough, "2027-06-30");
  assert.equal(reopenYear(c, 2026).yearEnd, undefined);
});
