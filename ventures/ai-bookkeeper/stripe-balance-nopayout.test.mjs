import test from "node:test";
import assert from "node:assert/strict";
import { readPayoutReport } from "./payouts.mjs";

// Header and row shapes follow Stripe's balance report as published in hledger's
// examples/csv/other/stripe.csv (read at run time, rows rewritten here).
const csv = [
  '"balance_transaction_id","created_utc","available_on_utc","currency","gross","fee","net","reporting_category","description"',
  '"txn_a","2020-01-23 08:26:29","2020-01-27 00:00:00","usd","12.00","0.00","12.00","charge",',
  '"txn_b","2020-01-23 08:26:31","2020-01-27 00:00:00","usd","-0.77","0.00","-0.77","refund","REFUND"',
].join("\n");

test("a Stripe balance report with no payout column says which column to add", () => {
  assert.throws(() => readPayoutReport(csv), /automatic_payout_id.*export again/s);
});
