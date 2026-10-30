// A QuickBooks or Intuit payroll debit is wages, not software; its fee line still is software. Descriptions are made up from the companies' public names.
import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";

const acct = (desc, cents) => suggest({ desc, cents }, {}).account;

test("payroll debits through QuickBooks and Intuit are wages", () => {
  assert.equal(acct("QUICKBOOKS PAYROLL", -150000), "6150");
  assert.equal(acct("INTUIT *QBooks Payroll", -150000), "6150");
  assert.equal(acct("INTUIT PAYROLL", -150000), "6150");
});

test("the payroll fee and the plain QuickBooks subscription stay software", () => {
  assert.equal(acct("INTUIT PAYROLL FEE", -4000), "6060");
  assert.equal(acct("QUICKBOOKS PAYROLL SUBSCRIPTION", -4000), "6060");
  assert.equal(acct("INTUIT QUICKBOOKS", -6000), "6060");
});
