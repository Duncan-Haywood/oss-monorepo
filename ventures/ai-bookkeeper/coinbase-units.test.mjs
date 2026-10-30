import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Layout of the older Coinbase account history seen in hledger's examples (rows made up).
test("coin-unit account history is refused, not booked as cents", () => {
  const r = readStatement([
    "Timestamp,Balance,Amount,Currency,Notes",
    "2014-01-05 10:00:00 -0800,0.5,0.5,BTC,Received",
  ].join("\n"));
  assert.deepEqual(r.rows, []);
  assert.match(r.problems[0], /crypto account history/);
});

test("a cash file with a Currency column is unaffected", () => {
  const r = readStatement(["Date,Description,Amount,Currency", "2024-01-05,Coffee,-3.50,USD"].join("\n"));
  assert.equal(r.rows.length, 1);
});
