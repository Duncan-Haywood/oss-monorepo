// ACH "DES:" tags as seen in a real US bank export (an anonymized BofA business export, payees scrambled); every line below is written here.
import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";

const model = { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["learned"]) };
const acct = (desc, cents) => suggest({ desc, cents }, model).account;

test("a payroll debit tagged DES:PAYROLL is wages", () => {
  assert.equal(acct("ACME CO DES:PAYROLL ID:XXXXX00000123 INDN:J DOE CO ID:XXXXX00000124 PPD", -125000), "6150");
});
test("association dues and internet tags map to dues and utilities", () => {
  assert.equal(acct("HOA CLUB DES:ASSN DUES ID:XXXXX00000045 INDN:J DOE CO ID:XXXXX00000046 PPD", -6200), "6170");
  assert.equal(acct("CITY ISP DES:INTERNET ID:XXXXX00000077 INDN:J DOE CO ID:XXXXX00000078 WEB", -6800), "6140");
});
test("ambiguous tags and incoming payroll stay unsuggested", () => {
  for (const [d, c] of [["X CO DES:PAYMENT ID:XXXXX00000047 INDN:J DOE CO ID:XXXXX00000048 WEB", -3000], ["X CO DES:DIRECT DEP ID:XXXXX1 INDN:J DOE CO ID:XXXXX2 PPD", 111912], ["X CO DES:PAYROLL ID:XXXXX1 INDN:J DOE CO ID:XXXXX2 PPD", 50090], ["IRS DES:USATAXPYMT ID:XXXXX1 INDN:J DOE CO ID:XXXXX2 CCD", -4760]])
    assert.equal(acct(d, c), null, d);
});
