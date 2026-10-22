import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, reports } from "./engine.mjs";
import { importChart, importTrialBalance, parseTitleDate } from "./migrate.mjs";

const QBO_CHART = `Account List
Acme Plumbing LLC
"Tuesday, October 21, 2026"

Account,Type,Detail Type,Description,Balance
Checking,Bank,Checking,,"12,500.00"
Business Visa,Credit Card,Credit Card,,"1,200.00"
Accounts Receivable (A/R),Accounts receivable (A/R),Accounts Receivable (A/R),,"3,000.00"
Truck,Fixed Assets,Vehicles,,"18,000.00"
Accounts Payable (A/P),Accounts payable (A/P),Accounts Payable (A/P),,"800.00"
Van Loan,Long Term Liabilities,Notes Payable,,"9,000.00"
Opening Balance Equity,Equity,Opening Balance Equity,,0
Retained Earnings,Equity,Retained Earnings,,0
Service Income,Income,Service/Fee Income,,0
Subcontractors,Cost of Goods Sold,Supplies & Materials - COS,,0
Rent,Expenses,Rent or Lease of Buildings,,0
Mystery,Weird Type,x,,0
`;

test("QuickBooks account list: matches by name, adds the rest, skips unknown types", () => {
  const r = importChart(newBooks(), QBO_CHART);
  const names = r.added.map((a) => a.name);
  assert.deepEqual(names, ["Business Visa", "Truck", "Accounts Payable (A/P)", "Van Loan", "Service Income", "Subcontractors"]);
  assert.equal(r.added.find((a) => a.name === "Business Visa").bank, true);
  assert.equal(r.added.find((a) => a.name === "Accounts Payable (A/P)").code, "2050");
  assert.deepEqual(r.matched.map((m) => [m.name, m.code]).filter(([n]) => /Receivable|Checking|Rent|Retained|Opening/.test(n)).sort(),
    [["Accounts Receivable (A/R)", "1100"], ["Checking", "1000"], ["Opening Balance Equity", "3000"], ["Rent", "6080"], ["Retained Earnings", "3900"]]);
  assert.match(r.problems[0], /Weird Type/);
  const codes = r.books.accounts.map((a) => a.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(r.books.accounts.find((a) => a.name === "Truck").type, "asset");
});

test("Xero chart keeps its own codes unless they clash", () => {
  const csv = `*Code,*Name,*Type,*Tax Code,Description\n090,Business Bank,Bank,Tax Exempt,\n1500,Plant,Fixed Asset,,\n200,Sales,Revenue,,\n6080,Office Rent,Overhead,,\n`;
  const r = importChart(newBooks(), csv);
  const by = Object.fromEntries(r.added.map((a) => [a.name, a]));
  assert.equal(by.Plant.code !== "1500", true); // 1500 is Equipment already
  assert.equal(by["Office Rent"].code !== "6080", true);
  assert.equal(by["Business Bank"].code, "090");
  assert.equal(by["Business Bank"].bank, true);
  assert.equal(by.Sales, undefined); // matched the existing Sales account
  assert.equal(r.matched[0].code, "4000");
});

test("a file with no header is refused with a pointer to the export", () => {
  const r = importChart(newBooks(), "just,some,numbers\n1,2,3\n");
  assert.match(r.problems[0], /Account List/);
});

const TB = `Acme Plumbing LLC
Trial Balance
As of December 31, 2025

Account,Debit,Credit
Checking,"12,500.00",
Accounts Receivable (A/R),"3,000.00",
Truck,"18,000.00",
Business Visa,,"1,200.00"
Accounts Payable (A/P),,800.00
Van Loan,,"9,000.00"
Retained Earnings,,"22,500.00"
TOTAL,"33,500.00","33,500.00"
`;

test("trial balance by name becomes balanced opening balances dated from the title", () => {
  const books = importChart(newBooks(), QBO_CHART).books;
  const r = importTrialBalance(books, TB);
  assert.deepEqual(r.problems, []);
  assert.equal(r.date, "2025-12-31");
  assert.equal(r.plug, 0);
  const bs = reports({ ...r.books, transactions: [] }).balanceSheet;
  assert.equal(bs.totalAssets, 3350000);
  assert.equal(bs.totalLiabilities, 1100000);
  assert.ok(bs.balanced);
});

test("an account missing from the chart is named, and nothing is set", () => {
  const r = importTrialBalance(newBooks(), TB);
  assert.ok(r.problems.some((p) => /Truck/.test(p)));
  assert.equal(r.books.openingTB, undefined);
});

test("no date in the file and none given is refused; a given date wins", () => {
  const body = TB.replace("As of December 31, 2025", "");
  const books = importChart(newBooks(), QBO_CHART).books;
  assert.match(importTrialBalance(books, body).problems[0], /as of/);
  assert.equal(importTrialBalance(books, body, { date: "2026-01-01" }).books.openingTB.date, "2026-01-01");
});

test("title dates", () => {
  assert.equal(parseTitleDate("Trial balance As of December 31, 2025"), "2025-12-31");
  assert.equal(parseTitleDate("As at 31 Dec 2025"), "2025-12-31");
  assert.equal(parseTitleDate("As of Feb 30, 2025"), null);
  assert.equal(parseTitleDate("nothing here"), null);
});
