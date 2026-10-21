import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement } from "./engine.mjs";
import { parseReceipt, splitReceipts, addReceipts, matchReceipts, attachReceipt, removeReceipt, receiptReport } from "./receipts.mjs";

const books = (rows) => importStatement(newBooks(), "Date,Description,Amount\n" + rows.map(([d, n, a]) => `${d},${n},${a}`).join("\n") + "\n", "1000").books;

const CAFE = `Blue Bottle Coffee
66 Mint Plaza, San Francisco
Tel 415-555-0142
03/14/2026 08:41
Latte            5.50
Croissant        4.25
Subtotal         9.75
Sales Tax        0.87
Total           10.62
Visa ****1234`;

test("a receipt is read into merchant, date, total and tax", () => {
  const r = parseReceipt(CAFE);
  assert.equal(r.merchant, "Blue Bottle Coffee");
  assert.equal(r.date, "2026-03-14");
  assert.equal(r.cents, 1062);
  assert.equal(r.taxCents, 87);
  assert.ok(r.ok);
});

test("subtotal, tip and change lines are never taken as the total", () => {
  const r = parseReceipt("Hardware Hank\n2026-02-02\nSubtotal 40.00\nTax 3.20\nTOTAL 43.20\nCash 50.00\nChange 6.80");
  assert.equal(r.cents, 4320);
  assert.equal(r.taxCents, 320);
});

test("written dates, thousands separators and a missing total line", () => {
  const r = parseReceipt("Acme Supply Co\nInvoice date: March 3, 2026\nWidgets 1,200.00\nFreight 35.50");
  assert.equal(r.date, "2026-03-03");
  assert.equal(r.cents, 120000);
  assert.ok(r.notes.some((n) => /largest amount/.test(n)));
  const g = parseReceipt("Acme\n3 Mar 2026\nGrand Total $1,235.50");
  assert.equal(g.cents, 123550);
});

test("a block without a date is skipped with the reason, not guessed", () => {
  const b = addReceipts(books([["2026-03-14", "BLUE BOTTLE 0412", "-10.62"]]), "Mystery shop\nTotal 12.00");
  assert.equal(b.added.length, 0);
  assert.deepEqual(b.skipped[0].notes, ["no date found"]);
});

test("receipts are separated by a rule line and each pairs with its bank line", () => {
  const b0 = books([["2026-03-15", "SQ *BLUE BOTTLE 0412 OAKLAND CA", "-10.62"], ["2026-03-16", "HARDWARE HANK #22", "-43.20"], ["2026-03-20", "OTHER", "-10.62"]]);
  const text = CAFE + "\n---\nHardware Hank\n2026-03-16\nTotal 43.20";
  assert.equal(splitReceipts(text).length, 2);
  const r = addReceipts(b0, text);
  assert.equal(r.added.length, 2);
  const m = r.books.receipts;
  assert.equal(m[0].matched, b0.transactions[0].id, "the coffee goes to the coffee line, not the later same-amount line");
  assert.equal(m[1].matched, b0.transactions[1].id);
});

test("the same receipt twice is kept once and reported", () => {
  const b0 = books([["2026-03-14", "BLUE BOTTLE", "-10.62"]]);
  const one = addReceipts(b0, CAFE);
  const two = addReceipts(one.books, CAFE);
  assert.equal(two.books.receipts.length, 1);
  assert.equal(two.duplicates.length, 1);
});

test("two receipts for one amount do not share a bank line", () => {
  const b0 = books([["2026-03-14", "BLUE BOTTLE", "-10.62"]]);
  const r = addReceipts(b0, CAFE + "\n---\nPeets Coffee\n03/14/2026\nTotal 10.62");
  const matched = r.books.receipts.filter((x) => x.matched);
  assert.equal(matched.length, 1);
  assert.equal(matched[0].merchant, "Blue Bottle Coffee", "the one whose name is on the line wins");
});

test("a tip on top of the receipt total pairs only when the payee agrees", () => {
  const meal = "Luigi's Trattoria\n2026-04-02\nTotal 80.00";
  const ok = addReceipts(books([["2026-04-03", "LUIGIS TRATTORIA", "-96.00"]]), meal);
  assert.equal(ok.books.receipts[0].tipCents, 1600);
  const no = addReceipts(books([["2026-04-03", "SOMETHING ELSE", "-96.00"]]), meal);
  assert.equal(no.books.receipts[0].matched, null);
  const tooMuch = addReceipts(books([["2026-04-03", "LUIGIS TRATTORIA", "-120.00"]]), meal);
  assert.equal(tooMuch.books.receipts[0].matched, null);
});

test("a bank line outside the date window or a deposit never matches", () => {
  const r = addReceipts(books([["2026-03-30", "BLUE BOTTLE", "-10.62"], ["2026-03-14", "BLUE BOTTLE REFUND", "10.62"]]), CAFE);
  assert.equal(r.books.receipts[0].matched, null);
});

test("the report lists spending over the threshold that has no receipt", () => {
  const b0 = books([["2026-03-14", "BLUE BOTTLE", "-10.62"], ["2026-03-16", "BIG VENDOR", "-250.00"], ["2026-03-17", "SMALL SHOP", "-20.00"]]);
  const b1 = addReceipts(b0, CAFE).books;
  const rep = receiptReport(b1, { minCents: 7500 });
  assert.deepEqual(rep.missing.map((t) => t.desc), ["BIG VENDOR"]);
  assert.equal(rep.missingCents, 25000);
  assert.equal(rep.coveredCents, 1062);
  assert.equal(rep.spendCents, 1062 + 25000 + 2000);
  assert.equal(rep.matched.length, 1);
  assert.equal(receiptReport(b1, { minCents: 1000 }).missing.length, 2);
});

test("attach pins a pair by hand, moves it from another receipt, and survives a re-match", () => {
  const b0 = books([["2026-03-14", "BLUE BOTTLE", "-10.62"], ["2026-03-30", "UNRELATED", "-99.00"]]);
  let b = addReceipts(b0, CAFE).books;
  const id = b.receipts[0].id, far = b0.transactions[1].id;
  b = attachReceipt(b, id, far);
  assert.equal(matchReceipts(b).receipts[0].matched, far);
  b = attachReceipt(b, id, null);
  assert.equal(b.receipts[0].matched, null);
  assert.throws(() => attachReceipt(b, id, "nope"), /no line/);
  assert.throws(() => attachReceipt(b, "r9", far), /no receipt/);
  assert.equal(removeReceipt(b, id).receipts.length, 0);
});

test("an exact amount with a different name and a distant date is not paired; a near date is, marked weak", () => {
  const far = addReceipts(books([["2026-03-20", "UBER TRIP", "-10.62"]]), CAFE);
  assert.equal(far.books.receipts[0].matched, null);
  const near = addReceipts(books([["2026-03-15", "UBER TRIP", "-10.62"]]), CAFE);
  assert.ok(near.books.receipts[0].matched);
  assert.equal(near.books.receipts[0].payeeAgrees, false);
  assert.equal(receiptReport(near.books).weak.length, 1);
});

test("payroll and owner draws are not asked for a receipt", async () => {
  const { confirm } = await import("./engine.mjs");
  let b = books([["2026-03-14", "OWNER DRAW", "-900.00"], ["2026-03-15", "GUSTO NET PAY", "-900.00"], ["2026-03-16", "OFFICE DEPOT", "-900.00"]]);
  b = confirm(b, { [b.transactions[0].id]: "3100", [b.transactions[1].id]: "6150", [b.transactions[2].id]: "6070" });
  assert.deepEqual(receiptReport(b).missing.map((t) => t.desc), ["OFFICE DEPOT"]);
});

test("tax on receipts is summed by month and by the account the line was filed to", async () => {
  const { taxOnReceipts } = await import("./receipts.mjs");
  const b0 = books([["2026-03-14", "BLUE BOTTLE COFFEE", "-10.62"], ["2026-04-02", "HARDWARE HANK", "-43.20"]]);
  const text = `${CAFE}\n---\nHardware Hank\n2026-04-02\nSubtotal 40.00\nTax 3.20\nTotal 43.20\n---\nNo Tax Diner\n2026-04-05\nTotal 20.00`;
  let { books: b } = addReceipts(b0, text);
  b = { ...b, transactions: b.transactions.map((t) => /HANK/.test(t.desc) ? { ...t, posted: "6060" } : t) };
  const t = taxOnReceipts(b);
  assert.equal(t.receipts, 2);
  assert.equal(t.taxCents, 87 + 320);
  assert.deepEqual(t.byMonth.map((m) => [m.month, m.taxCents]), [["2026-03", 87], ["2026-04", 320]]);
  assert.equal(t.byAccount.find((a) => a.code === "6060").taxCents, 320);
  assert.equal(t.rows.find((r) => r.merchant === "Hardware Hank").rate, 0.08);
  assert.equal(t.noTax.length, 1);
  assert.equal(taxOnReceipts(b, { from: "2026-04-01" }).taxCents, 320);
});
