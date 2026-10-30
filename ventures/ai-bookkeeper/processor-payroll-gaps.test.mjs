// Descriptions a probe found unsuggested; made up from the companies' public names, not a real export.
import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";

const acct = (desc, cents) => suggest({ desc, cents }, {}).account;

test("ADP TotalSource and ADP Run debits are wages", () => {
  assert.equal(acct("ADP TOTALSOURCE", -200000), "6150");
  assert.equal(acct("ADP RUN PAYROLL", -200000), "6150");
});

test("Square and Toast deposits and Amazon marketplace payments are sales", () => {
  assert.equal(acct("SQUARE DEPOSIT", 50000), "4000");
  assert.equal(acct("TOAST INC DEPOSIT", 40000), "4000");
  assert.equal(acct("AMAZON MKTPLACE PMTS", 90000), "4000");
});

test("SendGrid is software; IRS tax payments stay for a person to file", () => {
  assert.equal(acct("SENDGRID", -1500), "6060");
  assert.equal(acct("IRS USATAXPYMT", -100000), null);
});
