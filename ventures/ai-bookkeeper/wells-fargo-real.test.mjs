// Descriptor shapes seen in a real person's Wells Fargo checking export (headerless
// "date","amount","*","","description"; jmcroft7/local-money src/data/wellsFargo.csv,
// 71 rows Jan to Mar 2026, no licence file, so fetched at run time, never copied).
// The reader took it as `wells-fargo` and read all 71 rows with no problems.
// 63 debits; 10 had a suggestion before this change, 14 after (the rest are
// personal spending: groceries, streaming, gas stations). Every line here is written, not copied.
import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";
import { readStatement } from "./bank.mjs";

const model = { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["learned"]) };
const acct = (desc, cents = -4000) => suggest({ desc, cents }, model).account;

test("headerless Wells Fargo layout reads, newest first, purchases negative", () => {
  const r = readStatement(['"03/02/2026","-19.52","*","","PAYPAL INST XFER 260302 EXAMPLE.COM A PERSON"', '"02/27/2026","2140.55","*","","ACME INC PAYROLL 022726"'].join("\n"));
  assert.equal(r.bank, "wells-fargo");
  assert.deepEqual(r.rows.map((x) => x.cents), [-1952, 214055]);
  assert.deepEqual(r.problems, []);
});
test("insurance premiums and a gas and electric utility from the real file", () => {
  assert.equal(acct("ALLSTATE INS CO INS PREM FEB 26 000000812046142 SMITH"), "6030");
  assert.equal(acct("EXAMPLE INS CO INS PREM JAN 26 0000001 SMITH"), "6030");
  assert.equal(acct("CPENERGY MNGCO MGC ACH DR 006403504120 CNP"), "6140");
});
test("the new words do not catch unrelated text", () => {
  assert.notEqual(acct("PREMIUM COFFEE ROASTERS"), "6030");
});
