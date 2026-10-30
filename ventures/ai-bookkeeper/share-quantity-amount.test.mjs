import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement, parseCents } from "./bank.mjs";

// Layout of ledger-cli's test/input/1110.csv (Date, Payee, Amount "10 AAPL", Cost); rows made up.
test("a share quantity is not booked as dollars", () => {
  const r = readStatement(["Date,Payee,Amount,Cost", "2014/01/01,Broker,10 AAPL,$500.00"].join("\n"));
  assert.equal(r.rows.length, 0);
  assert.ok(r.problems.length > 0);
});

test("currency codes and debit words after the amount still read", () => {
  assert.equal(parseCents("-1.00 USD"), -100);
  assert.equal(parseCents("15 EUR"), 1500);
  assert.equal(parseCents("12.50 DEBIT"), -1250);
  assert.equal(parseCents("12.50 DR"), -1250);
});
