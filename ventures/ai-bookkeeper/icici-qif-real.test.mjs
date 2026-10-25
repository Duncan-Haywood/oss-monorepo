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
