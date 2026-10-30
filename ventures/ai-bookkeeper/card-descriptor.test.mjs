// Card-statement descriptors as banks print them (processor prefixes, padded spaces, asterisks).
import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";

const ctx = { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["learned"]) };
const acct = (desc) => suggest({ desc, cents: -5000 }, ctx).account;

test("padded Uber trip descriptors are travel", () => {
  assert.equal(acct("UBER   *TRIP HELP.UBER.COM"), "6120");
  assert.equal(acct("UBER *TRIP"), "6120");
});

test("Meta's FACEBK descriptor is advertising", () => {
  assert.equal(acct("FACEBK *ADS 12345"), "6000");
});

test("small-business descriptors in bank-feed formats (Toast prefix, tolls, ad networks, trades) get an account", () => {
  const out = (d) => suggest({ desc: d, cents: -5000 }, ctx).account;
  assert.equal(out("TST* THE LOCAL PUB"), "6130");
  assert.equal(out("COSTCO GAS #123"), "6160");
  assert.equal(out("EZPASS NY"), "6120");
  assert.equal(out("UNITED 0162345678"), "6120");
  assert.equal(out("GOOGLE *ADS123"), "6000");
  assert.equal(out("SERVPRO OF DALLAS"), "6090");
  assert.equal(out("DELAWARE DIV OF CORP"), "6110");
  assert.equal(suggest({ desc: "AMAZON PAYMENTS SETTLEMENT", cents: 90000 }, ctx).account, "4000");
});

test("ambiguous payees stay open: IRS payments, bare checks, Zelle to a person", () => {
  const out = (d) => suggest({ desc: d, cents: -5000 }, ctx).account;
  assert.equal(out("IRS USATAXPYMT"), null);
  assert.equal(out("CHECK #1042"), null);
  assert.equal(out("ZELLE TO LANDLORD"), null);
});

test("plain-word payees from another app's fixture: groceries and phone are filed, pharmacy and cinema (personal) are not", () => {
  const out = (d) => suggest({ desc: d, cents: -5000 }, ctx).account;
  assert.equal(out("Grocery Store"), "6130");
  assert.equal(out("Mobile Phone Provider"), "6140");
  assert.equal(out("Pharmacy"), null);
  assert.equal(out("Movie Theater"), null);
});
