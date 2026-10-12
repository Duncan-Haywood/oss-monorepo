import { test } from "node:test";
import assert from "node:assert/strict";
import { toCents, parseDate, addMonths, monthlySeries, deductibleCents, needsReceipt, paymentPeriod, summarize, taxSaved, scheduleCRows, suggestCategory, parseCsv, importBankCsv, findDuplicates, entriesToCsv, warnings, formatMoney } from "./calc.mjs";

const e = (o) => ({ date: "2026-03-04", vendor: "X", cents: 10000, category: "supplies", bizPct: 100, receipt: true, note: "", ...o });

test("toCents handles symbols, commas, parentheses and rejects junk", () => {
  assert.equal(toCents("$1,234.56"), 123456);
  assert.equal(toCents("12.5"), 1250);
  assert.equal(toCents("(45.10)"), -4510);
  assert.equal(toCents("-3"), -300);
  assert.equal(toCents("abc"), 0);
  assert.equal(toCents(""), 0);
});

test("parseDate accepts ISO and US forms and rejects impossible dates", () => {
  assert.equal(parseDate("2026-3-4"), "2026-03-04");
  assert.equal(parseDate("3/4/2026"), "2026-03-04");
  assert.equal(parseDate("12/31/26"), "2026-12-31");
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(parseDate("13/01/2026"), null);
  assert.equal(parseDate("soon"), null);
});

test("monthly series clamps the day to month end and rolls the year", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonths("2026-11-15", 2), "2027-01-15");
  assert.deepEqual(monthlySeries("2026-10-31", 3), ["2026-10-31", "2026-11-30", "2026-12-31"]);
  assert.equal(monthlySeries("2026-01-01", 500).length, 60);
});

test("deductible share: meals are half, personal is zero, business use scales", () => {
  assert.equal(deductibleCents(e({ category: "meals", cents: 10001 })), 5001);
  assert.equal(deductibleCents(e({ category: "personal" })), 0);
  assert.equal(deductibleCents(e({ category: "utilities", cents: 12000, bizPct: 25 })), 3000);
  assert.equal(deductibleCents(e({ category: "meals", cents: 10000, bizPct: 50 })), 2500);
  assert.equal(deductibleCents(e({ bizPct: 250 })), 10000, "out-of-range percent falls back to 100");
});

test("receipt flag starts at $75, skips personal and kept receipts", () => {
  assert.equal(needsReceipt(e({ cents: 7499, receipt: false })), false);
  assert.equal(needsReceipt(e({ cents: 7500, receipt: false })), true);
  assert.equal(needsReceipt(e({ cents: 9000, receipt: true })), false);
  assert.equal(needsReceipt(e({ cents: 9000, receipt: false, category: "personal" })), false);
});

test("IRS payment periods are 3, 2, 3 and 4 months", () => {
  assert.deepEqual(["2026-01-01", "2026-03-31", "2026-04-01", "2026-05-31", "2026-06-01", "2026-08-31", "2026-09-01", "2026-12-31"].map(paymentPeriod), [1, 1, 2, 2, 3, 3, 4, 4]);
});

test("summarize totals one year only and splits by category, month and period", () => {
  const list = [e({ cents: 10000 }), e({ date: "2026-04-10", category: "meals", cents: 4000, receipt: false }), e({ date: "2025-12-31", cents: 99999 }), e({ date: "2026-10-01", category: "personal", cents: 5000 })];
  const s = summarize(list, 2026);
  assert.equal(s.count, 3);
  assert.equal(s.spent, 19000);
  assert.equal(s.deductible, 12000);
  assert.equal(s.notDeductible, 7000);
  assert.equal(s.byCategory.meals.deductible, 2000);
  assert.equal(s.byMonth[2], 10000);
  assert.equal(s.byPeriod[1], 10000);
  assert.equal(s.byPeriod[2], 2000);
  assert.equal(s.missing, 0);
});

test("taxSaved is a capped percentage and zero for bad input", () => {
  assert.equal(taxSaved(100000, 30), 30000);
  assert.equal(taxSaved(100000, 0), 0);
  assert.equal(taxSaved(100000, "x"), 0);
  assert.equal(taxSaved(100000, 500), 70000);
});

test("Schedule C rows are ordered by printed line and omit personal", () => {
  const s = summarize([e({ category: "other" }), e({ category: "advertising" }), e({ category: "travel" }), e({ category: "meals" }), e({ category: "personal" }), e({ category: "rent_equipment" }), e({ category: "interest" })], 2026);
  assert.deepEqual(scheduleCRows(s).map((r) => r.line), ["8", "16b", "20a", "24a", "24b", "27a"]);
});

test("keyword rules pick a category and default to other", () => {
  assert.equal(suggestCategory("STARBUCKS #1234"), "meals");
  assert.equal(suggestCategory("DELTA AIR 0062"), "travel");
  assert.equal(suggestCategory("GITHUB INC"), "other");
  assert.equal(suggestCategory("Verizon Wireless"), "utilities");
  assert.equal(suggestCategory("zzz unknown"), "other");
});

test("CSV parser handles quotes, embedded commas and CRLF", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n'), [["a", "b"], ["x, y", 'say "hi"']]);
});

test("bank import keeps money out, skips credits, counts bad rows", () => {
  const csv = "Date,Description,Amount\n03/04/2026,STARBUCKS,-5.40\n03/05/2026,CLIENT PAYMENT,2500.00\n03/06/2026,ADOBE,(54.99)\nnotadate,X,-1\n";
  const r = importBankCsv(csv);
  assert.equal(r.entries.length, 2);
  assert.equal(r.skipped, 1);
  assert.equal(r.bad, 1);
  assert.equal(r.entries[0].cents, 540);
  assert.equal(r.entries[0].category, "meals");
  assert.equal(r.entries[1].date, "2026-03-06");
});

test("bank import supports a debit column and reports unreadable headers", () => {
  const r = importBankCsv("Posted,Merchant,Debit,Credit\n2026-01-02,UPS STORE,12.00,\n2026-01-03,REFUND,,9.00\n");
  assert.equal(r.entries.length, 1);
  assert.equal(r.skipped, 1);
  assert.match(importBankCsv("foo,bar\n1,2\n").problem, /Could not find/);
  assert.match(importBankCsv("").problem, /No rows/);
});

test("duplicates match on date, amount and vendor ignoring case", () => {
  const have = [e({ vendor: "Adobe" })];
  assert.equal(findDuplicates(have, [e({ vendor: " adobe " }), e({ vendor: "Adobe", cents: 1 })]).length, 1);
});

test("CSV export neutralises formulas and quotes commas", () => {
  const csv = entriesToCsv([e({ vendor: "=HYPERLINK(1)", note: 'a,"b"' })]);
  assert.match(csv, /'=HYPERLINK\(1\)/);
  assert.match(csv, /"a,""b"""/);
  assert.match(csv.split("\n")[0], /Schedule C line/);
});

test("warnings flag missing receipts and large purchases", () => {
  const w = warnings([e({ cents: 9000, receipt: false }), e({ cents: 300000, receipt: true })], 2026);
  assert.equal(w.length, 2);
  assert.match(w[0], /1 expense/);
  assert.match(w[1], /2,500/);
  assert.deepEqual(warnings([], 2026), []);
});

test("formatMoney falls back on a bad currency code", () => {
  assert.equal(formatMoney(12345, "USD"), "$123.45");
  assert.equal(formatMoney(12345, "??"), "123.45");
});

import { invoiceIncome, readInvoiceBox, netProfit, setAside } from "./calc.mjs";
test("invoice income excludes sales tax and counts paid share", () => {
  const box = readInvoiceBox(JSON.stringify({ invoices: [
    { issued: "2026-02-01", sent: true, lines: [{ qty: 1, rate: "1000" }], taxRate: 10, paid: "550" },
    { issued: "2026-03-01", void: true, lines: [{ qty: 1, rate: "999" }], paid: "999" },
    { issued: "2025-03-01", sent: true, lines: [{ qty: 1, rate: "500" }], paid: "500" },
  ] }));
  assert.equal(invoiceIncome(box, 2026, "paid").cents, 50000);
  assert.equal(invoiceIncome(box, 2026, "invoiced").cents, 100000);
  assert.equal(invoiceIncome(null, 2026).cents, 0);
  assert.equal(readInvoiceBox("garbage"), null);
});
test("net profit and set-aside", () => {
  assert.equal(netProfit(100000, 30000), 70000);
  assert.equal(setAside(70000, 25), 17500);
  assert.equal(setAside(-5, 25), 0);
  assert.equal(setAside(70000, "x"), 0);
});
