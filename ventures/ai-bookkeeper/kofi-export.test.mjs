import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Header follows Ko-fi's transactions export from memory of its help pages (DateTime (UTC),
// From, Message, Item, Received, Given, Currency, TransactionType, TransactionId, ...); rows are made up.
const csv = [
  "DateTime (UTC),From,Message,Item,Received,Given,Currency,TransactionType,TransactionId,Reference,SalesCount,Quantity",
  "2026-10-02 14:05:11,Sam,thanks!,,5.00,,USD,Donation,aaa-111,r1,,",
  "2026-10-09 09:00:00,Lee,,Monthly tier,10.00,,USD,Subscription,bbb-222,r2,,",
  "2026-10-12 09:00:00,Me,,Tip to another creator,,3.00,USD,Donation,ddd-444,r4,,",
  "2026-10-15 09:00:00,Jo,,Sticker pack,12.00,,USD,Shop Order,ccc-333,r3,1,1",
].join("\n");

test("Ko-fi export: Received is money in, Given is money out", () => {
  const rows = readStatement(csv).rows;
  assert.deepEqual(rows.map((r) => r.cents), [500, 1000, -300, 1200]);
  assert.equal(rows[1].desc, "Subscription");
});

test("Ko-fi export with only receipts no longer warns that every amount is positive", () => {
  const only = csv.split("\n").filter((l, i) => i !== 3).join("\n");
  const { problems } = readStatement(only);
  assert.ok(!problems.some((p) => /positive/.test(p)));
});
