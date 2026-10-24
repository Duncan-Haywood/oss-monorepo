import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement, parseCents } from "./bank.mjs";

// Layouts seen in the sample CSVs of the hledger project's examples/csv
// (GPL, layout only; every row below is made up). Found by importing those
// files with the CLI: csb43 and Stripe read nothing, Amazon payments came in
// as money in, Monefy and Stripe rows had no description, and an Arabic
// currency prefix made the amount unreadable.

test("CSB43 export: underscored headers, item1 is the description", () => {
  const r = readStatement([
    "bank_code,branch_code,account_key,account_number,short_name,currency,initial_date,final_date,item1,transaction_date,value_date,amount",
    "1234,5678,90,1234567890,N.SURNAME,EUR,2019-11-01,2019-11-30,SALARY,2019-11-02,2019-11-02,1500.00",
    "1234,5678,90,1234567890,N.SURNAME,EUR,2019-11-01,2019-11-30,RENT,2019-11-10,2019-11-10,-500.00",
  ].join("\n"));
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents, x.desc]), [
    ["2019-11-02", 150000, "SALARY"],
    ["2019-11-10", -50000, "RENT"],
  ]);
});

test("Stripe balance report: created_utc is the date, the category stands in for a blank description", () => {
  const r = readStatement([
    '"balance_transaction_id","created_utc","currency","gross","fee","net","reporting_category","description"',
    '"txn_1","2020-01-23 08:26:29","usd","12.00","0.00","12.00","charge",',
    '"txn_2","2020-01-23 08:26:31","usd","-0.77","0.00","-0.77","refund","REFUND FOR PAYMENT"',
  ].join("\n"));
  assert.deepEqual(r.rows.map((x) => [x.cents, x.desc]), [[1200, "charge"], [-77, "REFUND FOR PAYMENT"]]);
});

test("To/From beside an unsigned amount: To is money out", () => {
  const r = readStatement(['"Date","Type","To/From","Name","Status","Amount"', '"Jul 29, 2012","Payment","To","Foo","Completed","$20.00"', '"Jul 30, 2012","Payment","From","Bar","Completed","$5.00"'].join("\n"));
  assert.deepEqual(r.rows.map((x) => x.cents), [-2000, 500]);
});

test("Monefy-style rows with no note use the category", () => {
  const r = readStatement(["date,account,category,amount,currency,description", "06/12/2021,Cash,Clothes,-25,USD,", "06/12/2021,Cash,Salary,1280.8,USD,pay"].join("\n"));
  assert.deepEqual(r.rows.map((x) => x.desc), ["Clothes", "pay"]);
});

test("a currency written in letters before the amount is ignored", () => {
  assert.equal(parseCents("د.ا.‏4.750"), 475);
  assert.equal(parseCents("Rs. 1,200.50"), 120050);
  assert.equal(parseCents("(.50)"), -50);
  assert.equal(parseCents("$1,234.00"), 123400);
});

// csv2ofx's test data (MIT, layout only, rows made up), 2026-10-24: Amazon's
// order-history report has no amount header, only "total".
test("Amazon order history: total is the amount, items the memo, pending orders skipped", () => {
  const r = readStatement([
    "order id,order url,items,to,date,total,shipping,shipping_refund,gift,tax,refund,payments",
    "111-0000001-0000001,https://example.com/o,Desk lamp; ,A Person,2022-12-20,19.99,0,0,0,1.20,0,Visa ending in 1234: $19.99;",
    "D01-0000000-0000000,https://example.com/o,,,pending,,,,,,,",
  ].join("\n"), { invert: true });
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents, x.desc]), [["2022-12-20", -1999, "Desk lamp;"]]);
});
