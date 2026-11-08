import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Header follows the Lemon Squeezy orders export from memory (totals in minor units); rows are made up.
const csv = [
  "id,identifier,order_number,user_name,user_email,currency,subtotal,discount_total,tax,total,status,created_at,refunded_at,product_name",
  "1,aaa,1001,Ann,a@example.com,USD,2900,0,0,2900,paid,2026-10-01T10:00:00Z,,Pro plan",
  "2,bbb,1002,Bob,b@example.com,USD,9900,0,0,9900,paid,2026-10-02T10:00:00Z,,Team plan",
  "3,ccc,1003,Cy,c@example.com,USD,2900,0,0,2900,refunded,2026-10-03T10:00:00Z,2026-10-05T10:00:00Z,Pro plan",
].join("\n");

test("Lemon Squeezy orders export reads minor units under the product", () => {
  const { rows, problems } = readStatement(csv);
  assert.deepEqual(rows.map((r) => r.cents), [2900, 9900]);
  assert.deepEqual(rows.map((r) => r.desc), ["Pro plan", "Team plan"]);
  assert.deepEqual(rows.map((r) => r.date), ["2026-10-01", "2026-10-02"]);
  assert.ok(!rows.some((r) => /example\.com|Ann/.test(r.desc)));
  assert.ok(problems.some((p) => /refund/i.test(p)));
});
