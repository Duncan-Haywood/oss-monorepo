import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Layouts seen in sample files of the Paisa project (ICICI credit-card CSV) and
// GnuCash's doc/examples (Quicken QIF, 1990s). Read at run time, nothing copied;
// every row below is made up.

test("ICICI card CSV: blank BillingAmountSign is a charge, CR a credit, dates day first", () => {
  const r = readStatement([
    '"Accountno:","0000000000000001"',
    '"Transaction Details:"',
    '"Date","Sr.No.","Transaction Details","Reward Point Header","Intl.Amount","Amount(in Rs)","BillingAmountSign"',
    '"0049XXXXXXXX0000"',
    '"01/03/2023","1","SHOP ONE MUMBAI IN","1","0","165.72",""',
    '"02/03/2023","2","PAYMENT RECEIVED","0","0","1,000.00","CR"',
  ].join("\n"));
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2023-03-01", -16572], ["2023-03-02", 100000]]);
});

test("QIF: Quicken apostrophe years and category/class lists", () => {
  const r = readStatement([
    "!Type:Class", "Nfoo", "Dsome description", "^",
    "!Type:Cat", "NDiv Income", "DDividend Income", "^",
    "!Type:Bank",
    "D3/29' 0", "T-36.00", "PShop", "^",
    "D1/11'05", "T10.00", "PShop2", "^",
  ].join("\n"));
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2000-03-29", -3600], ["2005-01-11", 1000]]);
  assert.deepEqual(r.problems, []);
});

// Paisa's HDFC account statement (fixed-width text export, columns padded with
// spaces, "Value Dat" truncated): rows below are made up.
test("HDFC text export: truncated 'Value Dat' is not the amount; day-first header clears the ambiguity note", () => {
  const r = readStatement([
    "  Date     ,Narration          ,Value Dat,Debit Amount       ,Credit Amount      ,Chq/Ref Number   ,Closing Balance",
    " 03/05/23  ,UPI                ,03/05/23 ,        110.00     ,          0.00     ,00003       ,     30192.98  ",
    " 05/05/23  ,UPI                ,05/05/23 ,          0.00     ,        237.00     ,00003       ,     30429.98  ",
  ].join("\n"));
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2023-05-03", -11000], ["2023-05-05", 23700]]);
  assert.equal(r.columns.amount, -1);
  assert.ok(!r.inferred || !/month first/.test(r.inferred));
});

// Paisa's SBI account workbook, as the xlsx reader prints it (rows made up).
test("SBI: Txn Date beats Value Date, and a computer-generated-statement line is not a wrapped description", () => {
  const r = readStatement([
    "Txn Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance",
    "2022-11-12,2022-11-13,TO TRANSFER,TRANSFER TO 1,250,,\"12,84.53\"",
    "2022-11-14,2022-11-15,BY TRANSFER,TRANSFER FROM 2,,120,\"13,04.53\"",
    "**This is a computer generated statement and does not require a signature,,,,,,",
  ].join("\n"));
  assert.deepEqual(r.rows.map((x) => [x.date, x.desc, x.cents]), [["2022-11-12", "TO TRANSFER", -25000], ["2022-11-14", "BY TRANSFER", 12000]]);
});
