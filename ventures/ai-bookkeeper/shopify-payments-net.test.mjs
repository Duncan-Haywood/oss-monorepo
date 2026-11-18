import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Header follows Shopify Payments' transactions export (Transaction Date, Type, Order, ...,
// Payout Status, Payout ID, Amount, Fee, Net); rows are made up.
const csv = [
  "Transaction Date,Type,Order,Card Brand,Card Source,Payout Status,Payout Date,Payout ID,Amount,Fee,Net,Checkout,Payment Method Name,Presentment Amount,Presentment Currency,Currency,Vat",
  "2024-01-05 10:00:00 -0500,charge,#1001,visa,,paid,2024-01-07,99,100.00,3.20,96.80,,visa,100.00,USD,USD,",
  "2024-01-06 10:00:00 -0500,refund,#1001,visa,,paid,2024-01-07,99,-20.00,0.00,-20.00,,visa,-20.00,USD,USD,",
].join("\n");

test("Shopify Payments export books Net, the money that reaches the bank", () => {
  const rows = readStatement(csv).rows ?? readStatement(csv);
  assert.deepEqual(rows.map((r) => r.cents), [9680, -2000]);
  assert.equal(rows[0].desc, "#1001");
});
