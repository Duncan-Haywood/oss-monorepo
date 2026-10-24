// Descriptors seen in a real small organisation's bank exports
// (eval/queeriouslabs-bank.mjs); each line below is written here, not copied.
import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";

const model = { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["learned"]) };
const acct = (desc, cents = -5000) => suggest({ desc, cents }, model).account;

test("bank-truncated utility, ISP and cloud descriptors", () => {
  assert.equal(acct("ACH DEBIT PGANDE          -WEB ONLINE"), "6140");
  assert.equal(acct("DEBIT CARD #XXXX 01/01 MONKEYBRAINS     415-974-1313 CA"), "6140");
  assert.equal(acct("DEBIT CARD #XXXX 11/30 GOOGLE*CLOUD 01E INTERNET     CA"), "6060");
  assert.equal(acct("DEBIT CARD #XXXX 10/01 GOOGLE *CLOUD_01 CC@GOOGLE.COMCA"), "6060");
});
test("a truncated Secretary of State charge is a licence/filing fee", () => {
  assert.equal(acct("DEBIT CARD #XXXX 12/02 CA SECRETARY OF  916-6951338  CA"), "6110");
});
test("a Patreon payout is income, not a guess at anything else", () => {
  assert.equal(acct("ACH CREDIT PATREON         -PATREON", 5000), "4000");
});
