import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Layout seen in the fixtures of the Paisa project (AGPL; layout only, every
// row below is made up). Its Paytm wallet statement has no "description"
// column: the activity is the description. Before, every line imported blank.

test("Paytm wallet statement: Activity is the description, Comment is appended, day-first dates", () => {
  const r = readStatement([
    "Date,Activity,Source/Destination,Wallet Txn ID,Comment,Debit,Credit,Transaction Breakup,Status",
    "30/12/2023 23:38:11,Paid for order,Main Wallet,1001,,65,,,SUCCESS",
    "6/1/2024 17:42,Added to wallet,Main Wallet,1002,Top up,,500,,SUCCESS",
  ].join("\n"));
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents, x.desc]), [
    ["2023-12-30", -6500, "Paid for order"],
    ["2024-01-06", 50000, "Added to wallet Top up"],
  ]);
});
