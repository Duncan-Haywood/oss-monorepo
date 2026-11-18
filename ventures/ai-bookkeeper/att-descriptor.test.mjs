// Card and bank feeds write AT&T's bill as "ATT*BILL PAYMENT" (the ampersand is
// dropped), which the "at&t" keyword never matched (found by probing, 2026-11-03).
import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";

const model = { rules: [], codes: null, classifier: { n: 0 } };
const acct = (desc) => suggest({ desc, cents: -8800 }, model).account;

test("ATT*BILL PAYMENT and ATT WIRELESS file under utilities and phone", () => {
  assert.equal(acct("ATT*BILL PAYMENT"), "6140");
  assert.equal(acct("ATT WIRELESS 800-331-0500"), "6140");
  assert.equal(acct("AT&T MOBILITY"), "6140");
});

test("words that merely start with att are not phone bills", () => {
  assert.notEqual(acct("ATTORNEY FEES SMITH LLP"), "6140");
  assert.notEqual(acct("ATTIC INSULATION CO"), "6140");
});
