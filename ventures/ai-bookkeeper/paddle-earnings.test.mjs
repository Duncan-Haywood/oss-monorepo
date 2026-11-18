import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Header follows the Paddle Billing transactions export from memory; rows are made up.
const csv = [
  "Transaction ID,Status,Billed At,Product,Customer Email,Currency,Total,Fee,Earnings",
  "txn_01,completed,2026-10-01,Pro plan,a@example.com,USD,29.00,2.15,26.85",
  "txn_02,completed,2026-10-02,Team plan,b@example.com,USD,99.00,5.45,93.55",
  "txn_03,refunded,2026-10-09,Pro plan,a@example.com,USD,-29.00,-2.15,-26.85",
].join("\n");

test("Paddle transactions export books Earnings under the product", () => {
  const { rows } = readStatement(csv);
  assert.deepEqual(rows.map((r) => r.cents), [2685, 9355, -2685]);
  assert.deepEqual(rows.map((r) => r.desc), ["Pro plan", "Team plan", "Pro plan"]);
  assert.ok(!rows.some((r) => /example\.com/.test(r.desc)));
});
