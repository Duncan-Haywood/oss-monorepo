// Faults and gains from a third batch of real US exports in public repositories (eval/us-bank-exports.mjs,
// 2026-11-14 later): a US Bank card download whose memo holds semicolons, and the credit-union layout.
// The rows below are written here, not copied: same columns and quirks, made-up payees and amounts.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement, parseCsv } from "./bank.mjs";
import { newBooks, importStatement } from "./engine.mjs";

// US Bank card: ISO dates, and a memo of "reference; MCC; ; ; ;" on every purchase.
const USB = [
  "Date,Transaction,Name,Memo,Amount",
  "2026-02-08,DEBIT,HILLTOP GROCERY      SPRINGFIELD  IL,24269794038500500000001; 05411; ; ; ;,-52.41",
  "2026-02-12,CREDIT,INTERNET PAYMENT THANK YOU,INTERNET; ; ; ; ;,268.53",
  "2026-02-12,DEBIT,CORNER FUEL 1234      SPRINGFIELD  IL,24316054041548300000002; 05542; ; ; ;,-55.59",
  "2026-02-12,DEBIT,BEAN BARN COFFEE      SPRINGFIELD  IL,24692164040100600000003; 05814; ; ; ;,-9.40",
  "2026-02-13,DEBIT,HILLTOP GROCERY      SPRINGFIELD  IL,24269794043500500000004; 05411; ; ; ;,-92.57",
  "2026-02-15,DEBIT,PARK DISTRICT         SPRINGFIELD  IL,24137464045500600000005; 09399; ; ; ;,-13.23",
].join("\n");

test("US Bank card: semicolons in every memo no longer outvote the comma (real file read 0 of 57 rows)", () => {
  const r = readStatement(USB);
  assert.equal(r.bank, "us-bank");
  assert.equal(r.rows.length, 6);
  assert.deepEqual(r.rows.map((x) => x.cents), [-5241, 26853, -5559, -940, -9257, -1323]);
  assert.equal(r.rows[0].date, "2026-02-08");
});

test("US Bank card: the merchant category code is read from the memo", () => {
  const r = readStatement(USB);
  assert.deepEqual(r.rows.map((x) => x.mcc ?? null), ["5411", null, "5542", "5814", "5411", "9399"]);
});

test("the MCC in the memo gives a first-seen fuel and coffee purchase a suggestion", () => {
  const books = importStatement(newBooks(), USB, "2000", {}).books;
  const names = Object.fromEntries(books.accounts.map((a) => [a.code, a.name]));
  const fuel = books.transactions.find((t) => /CORNER FUEL/.test(t.desc));
  const coffee = books.transactions.find((t) => /BEAN BARN/.test(t.desc));
  assert.equal(fuel.suggestion?.source, "mcc");
  assert.match(names[fuel.suggestion.account], /fuel|vehicle/i);
  assert.match(names[coffee.suggestion.account], /meal/i);
});

test("a memo that only looks like it (short number) gives no MCC", () => {
  const r = readStatement("Date,Transaction,Name,Memo,Amount\n2026-02-08,DEBIT,SHOP,1234; 05411; ;,-5.00\n2026-02-09,DEBIT,SHOP,ORDER; 05411,-6.00\n");
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows.map((x) => x.mcc ?? null), [null, null]);
});

test("a real semicolon file still splits on semicolons when its header names columns", () => {
  const rows = parseCsv("Datum;Omschrijving;Bedrag\n01-03-2026;Koffie, thee;-3,50\n02-03-2026;Huur;-800,00\n");
  assert.equal(rows[0].length, 3);
  assert.equal(rows[1][1], "Koffie, thee");
});

// The credit-union online-banking layout. Checking: newest first, signed Amount, running Balance.
const CU = [
  "Transaction ID,Posting Date,Effective Date,Transaction Type,Amount,Check Number,Reference Number,Description,Transaction Category,Type,Balance,Memo,Extended Description",
  ",10/03/2026,,Credit,1200,,70000004,Deposit ACME PAYROLL,Paycheck,ACH,1374.66,,ACH Deposit ACME PAYROLL",
  ",10/01/2026,,Debit,-29.99,,70000003,Payment to Cable Co,Cable & Satellite,,174.66,,Bill payment Withdrawal CABLE CO",
  ",09/28/2026,,Debit,-18.02,,70000002,Burger Stop,Restaurants & Dining,Debit Card,204.65,,POS Card purchase BURGER STOP 5814",
  ",09/28/2026,,Debit,-3.19,,70000001,Game Store,Entertainment,Debit Card,222.67,,Debit Card purchase GAME STORE",
].join("\n");

test("credit-union layout: named, signed, and the running balance chains", () => {
  const r = readStatement(CU);
  assert.equal(r.bank, "credit-union");
  assert.deepEqual(r.rows.map((x) => x.cents), [120000, -2999, -1802, -319]);
  const res = importStatement(newBooks(), CU, "1000", {});
  assert.equal(res.balanceCheck.checked, true);
  assert.equal(res.balanceCheck.breaks.length, 0);
  assert.equal(res.balanceCheck.closing, 137466);
});

test("credit-union card: the balance owed chains once flipped, and is booked as a liability's closing", () => {
  const csv = [
    "Posting Date,Effective Date,Transaction Type,Amount,Check Number,Reference Number,Description,Transaction Category,Type,Balance,Memo,Extended Description",
    "3/30/2026,3/27/2026,Debit,-60.00000,,1322000003,Ext Credit Card Debit CORNER PUB     SPRINGFIELD IL,,Credit Card,615.69000,,Ext Credit Card Debit CORNER PUB",
    "3/29/2026,3/28/2026,Debit,-19.20000,,1322000002,Ext Credit Card Debit BAKERY        SPRINGFIELD IL,,Credit Card,555.69000,,Ext Credit Card Debit BAKERY",
    "3/01/2026,2/28/2026,Credit,300.00000,,1322000001,Ext Credit Card Credit PAYMENT THANK YOU,,Credit Card,536.49000,,Ext Credit Card Credit PAYMENT",
    "2/20/2026,2/19/2026,Debit,-36.49000,,1322000000,Ext Credit Card Debit HARDWARE    SPRINGFIELD IL,,Credit Card,836.49000,,Ext Credit Card Debit HARDWARE",
  ].join("\n");
  const r = readStatement(csv);
  assert.equal(r.bank, "credit-union");
  const res = importStatement(newBooks(), csv, "2000", {});
  assert.equal(res.balanceCheck.breaks.length, 0);
  assert.equal(res.balanceCheck.closing, -61569);
});
