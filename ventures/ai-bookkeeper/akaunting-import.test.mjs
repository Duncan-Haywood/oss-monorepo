// Akaunting's transactions import workbook (akaunting/akaunting, public/files/import/transactions.xlsx, GPL, cloned at run time, nothing copied; every row here is made up in its shape): `paid_at` was not a date header and `type` holds income/expense beside a positive amount, so the file read zero rows.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

const head = "type,number,paid_at,amount,currency_code,currency_rate,account_name,invoice_bill_number,contact_email,category_name,description,payment_method,reference,reconciled";

test("income and expense rows take their sign from the type column", () => {
  const r = readStatement([head,
    "income,TRA-00001,2024-01-02,120.50,USD,1,Cash,INV-00001,a@example.com,Sales,Invoice paid,offline-payments.cash.1,,",
    "expense,TRA-00002,2024-01-03,40.00,USD,1,Cash,,,Office,Printer paper,offline-payments.cash.1,,",
    "income-recurring,TRA-00003,2024-01-04,10.00,USD,1,Cash,,,Deposit,,offline-payments.cash.1,,"].join("\n"));
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2024-01-02", 12050], ["2024-01-03", -4000], ["2024-01-04", 1000]]);
  assert.equal(r.rows[1].desc.includes("Printer paper"), true);
});

test("a Type column of Sale/Return words is still left alone", () => {
  const r = readStatement("Date,Type,Description,Amount\n2024-01-02,Sale,A,10.00\n2024-01-03,Return,B,-5.00\n");
  assert.deepEqual(r.rows.map((x) => x.cents), [10, -5].map((n) => n * 100));
});
