// Plaid transactions JSON. The sample is hand-made from the field names in
// plaid/plaid-openapi (Transaction); it is not a real account's data.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement, sniffFormat } from "./bank.mjs";
import { isPlaid } from "./plaid.mjs";

const tx = (o) => ({ account_id: "a1", transaction_id: "t" + Math.random(), iso_currency_code: "USD", pending: false, ...o });
const FILE = JSON.stringify({ accounts: [], total_transactions: 4, transactions: [
  tx({ transaction_id: "t1", date: "2026-03-02", amount: 12.5, name: "SQ *BLUE BOTTLE 0412", merchant_name: "Blue Bottle Coffee" }),
  tx({ transaction_id: "t2", date: "2026-03-03", amount: -2500, name: "ACH DEPOSIT ACME INC" }),
  tx({ transaction_id: "t3", date: "2026-03-04", amount: 5.1, name: "UBER TRIP", pending: true }),
  tx({ transaction_id: "t1", date: "2026-03-02", amount: 12.5, name: "dup" }),
] });

test("Plaid JSON is recognised; a positive amount (money out) becomes negative", () => {
  assert.ok(isPlaid(FILE));
  assert.equal(sniffFormat(FILE), "plaid");
  const r = readStatement(FILE);
  assert.equal(r.bank, "plaid");
  assert.deepEqual(r.rows.map((x) => x.cents), [-1250, 250000]);
  assert.equal(r.rows[0].desc, "Blue Bottle Coffee");
  assert.equal(r.rows[1].desc, "ACH DEPOSIT ACME INC");
  assert.match(r.problems.join(" "), /1 pending transaction was skipped/);
});

test("/transactions/sync output (added + modified) reads, invert flips, other JSON is not Plaid", () => {
  const sync = JSON.stringify({ added: [tx({ transaction_id: "x", date: "2026-01-01", amount: 3 , name: "A" })], modified: [tx({ transaction_id: "y", date: "2026-01-02", amount: -4, name: "B" })], removed: [], next_cursor: "c" });
  assert.deepEqual(readStatement(sync).rows.map((x) => x.cents), [-300, 400]);
  assert.deepEqual(readStatement(sync, { invert: true }).rows.map((x) => x.cents), [300, -400]);
  assert.equal(isPlaid('{"a":1}'), false);
  assert.equal(isPlaid("date,amount\n2026-01-01,5\n"), false);
  assert.equal(isPlaid('[{"date":"2026-01-01","amount":5}]'), false);
});

test("bad rows are reported, mixed currencies and accounts are noted", () => {
  const f = JSON.stringify([tx({ date: "bad", amount: 1 }), tx({ date: "2026-01-01", amount: 1.005, name: "X" }), tx({ date: "2026-01-02", amount: 2, name: "Y", account_id: "a2", iso_currency_code: "EUR" })]);
  const r = readStatement(f);
  assert.equal(r.rows.length, 2);
  const p = r.problems.join(" ");
  assert.match(p, /Transaction 1/); assert.match(p, /EUR, USD/); assert.match(p, /2 accounts/);
});
