import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Header follows a creator-support (Buy Me a Coffee style) export from memory; rows are made up.
const csv = [
  "Transaction ID,Date,Supporter Name,Supporter Email,Item,Amount,Currency,Fee,Net,Status",
  "a1,2026-10-02,Sam,s@example.com,Coffee,5.00,USD,0.25,4.75,Completed",
  "a2,2026-10-03,Lee,l@example.com,Membership,10.00,USD,0.50,9.50,Refunded",
  "a3,2026-10-04,Kay,k@example.com,Membership,10.00,USD,0.50,9.50,Completed",
].join("\n");

test("supporter export: item as description, no names, refunded row skipped", () => {
  const { rows, problems } = readStatement(csv);
  assert.deepEqual(rows.map((r) => r.cents), [500, 1000]);
  assert.deepEqual(rows.map((r) => r.desc), ["Coffee", "Membership"]);
  assert.ok(!rows.some((r) => /Sam|Lee|Kay|example\.com/.test(r.desc)));
  assert.ok(problems.some((p) => /refund/i.test(p)));
});
