import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, addDocuments } from "./engine.mjs";
import { DEFAULT_ACCOUNTS } from "./ledger.mjs";
import { gstReturn } from "./gstreturn.mjs";

function books() {
  let b = newBooks();
  b.accounts = DEFAULT_ACCOUNTS.concat([{ code: "1300", name: "Tax recoverable", type: "asset" }]);
  const docs = [
    "type,number,date,due,party,amount,account",
    "invoice,1,2026-04-10,,Acme,1000.50,4000", "invoice,1,2026-04-10,,Acme,50.03,2100",
    "bill,7,2026-04-15,,Supply,300.99,6010", "bill,7,2026-04-15,,Supply,15.05,1300",
    "invoice,2,2026-07-01,,Late,100.00,4000", "invoice,2,2026-07-01,,Late,5.00,2100",
  ].join("\n") + "\n";
  return addDocuments(b, docs).books;
}

test("Canada GST/HST return: lines 101-109 in cents, period respected", () => {
  const g = gstReturn(books(), { region: "ca", from: "2026-04-01", to: "2026-06-30" });
  assert.deepEqual(g.lines, { 101: 100050, 103: 5003, 105: 5003, 106: 1505, 108: 1505, 109: 3498 });
  assert.equal(g.payable, "pay");
});

test("Australia BAS: G1 and G11 include GST, whole dollars", () => {
  const g = gstReturn(books(), { region: "au", from: "2026-04-01", to: "2026-06-30" });
  assert.deepEqual(g.lines, { G1: 1051, "1A": 50, G11: 316, "1B": 15, net: 35 });
});

test("a refund and an unknown region", () => {
  let b = newBooks(); b.accounts = DEFAULT_ACCOUNTS.concat([{ code: "1300", name: "Tax recoverable", type: "asset" }]);
  b = addDocuments(b, "type,number,date,due,party,amount,account\nbill,1,2026-04-01,,S,100.00,6010\nbill,1,2026-04-01,,S,10.00,1300\n").books;
  assert.equal(gstReturn(b, { from: "2026-04-01", to: "2026-04-30" }).payable, "refund");
  assert.throws(() => gstReturn(b, { region: "nz" }), /region/);
});
