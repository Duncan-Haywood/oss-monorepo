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
