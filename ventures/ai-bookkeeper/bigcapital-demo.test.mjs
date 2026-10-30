// Descriptors from Bigcapital's demo bank-transactions.csv (AGPL; read at run time, nothing copied): the rows here are made up in the same shapes.
import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";

const ctx = { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["learned"]) };
const acct = (desc) => suggest({ desc, cents: -5000 }, ctx).account;

test("grocers and quick-service names on US bank feeds get an account", () => {
  assert.equal(acct("Albertsons"), "6130");
  assert.equal(acct("FOOD LION #1234 RALEIGH NC"), "6130");
  assert.equal(acct("STOP & SHOP #25402 WEST CALDWELL"), "6130");
  assert.equal(acct("PURCHASE-SIG DENNY'S 366992 EUGENE OR"), "6130");
  assert.equal(acct("Krispy Kreme"), "6130");
});

test("parking apps are travel", () => {
  assert.equal(acct("CARD PURCHASE PAYBYPHONE 804665947 11/19"), "6120");
});

test("bare Walmart stays blank on purpose", () => {
  assert.equal(acct("Walmart"), null);
});
