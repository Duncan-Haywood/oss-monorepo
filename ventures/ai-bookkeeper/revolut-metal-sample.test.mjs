import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Layout of a public Revolut export sample (github.com/pablovazquezg/expense-manager,
// media/account_activity_example.csv; the authors' made-up rows, written out by hand here):
// a BOM, no Balance column, m/d/yy h:mm dates, "Savings" cashback rows beside "Current" card
// rows, and whole-number amounts without decimals. Layout only; no real Revolut account tried.
const csv = "﻿Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State\n" +
  "CASHBACK,Savings,4/29/23 9:12,4/30/23 10:24,Metal Cashback,0.02,0,EUR,COMPLETED\n" +
  "CARD_PAYMENT,Current,4/29/23 9:12,4/30/23 10:24,Cocktail bar,-15.67,0,EUR,COMPLETED\n" +
  "TOPUP,Current,4/25/23 7:00,4/25/23 7:00,Payment from Someone,750,0,EUR,COMPLETED\n" +
  "CARD_PAYMENT,Current,4/26/23 17:18,4/27/23 3:50,Department store,-95,0,EUR,COMPLETED\n";

test("Revolut export without a balance column reads completed dates, signs and whole amounts", () => {
  const r = readStatement(csv);
  assert.equal(r.bank, "revolut");
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [
    ["2023-04-30", 2], ["2023-04-30", -1567], ["2023-04-25", 75000], ["2023-04-27", -9500],
  ]);
});

test("Revolut export without a balance column still takes the fee off the amount", () => {
  const r = readStatement("Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State\n" +
    "EXCHANGE,Current,4/25/23 7:00,4/25/23 7:00,Exchanged to USD,-100.00,1.50,EUR,COMPLETED\n");
  assert.equal(r.bank, "revolut");
  assert.equal(r.rows[0].cents, -10150);
});
