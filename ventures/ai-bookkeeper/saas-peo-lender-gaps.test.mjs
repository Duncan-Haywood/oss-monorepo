// Descriptions a second probe found unsuggested; made up from the companies' public names, not a real export.
import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";

const acct = (desc, cents) => suggest({ desc, cents }, {}).account;

test("work-management and CRM software is software; formation and legal templates are legal", () => {
  for (const d of ["HUBSPOT", "TRELLO", "ASANA", "INTERCOM", "BILL.COM"]) assert.equal(acct(d, -4900), "6060", d);
  assert.equal(acct("ROCKET LAWYER", -3900), "6050");
  assert.equal(acct("CLERKY", -799), "6050");
});

test("PEO debits are wages, Deel and Remote.com are contractors", () => {
  assert.equal(acct("TRINET", -400000), "6150");
  assert.equal(acct("JUSTWORKS", -250000), "6150");
  assert.equal(acct("DEEL", -300000), "6020");
  assert.equal(acct("REMOTE.COM", -300000), "6020");
});

test("small-business lender debits are loan payments; eBay and Paddle payouts are sales", () => {
  for (const d of ["SBA EIDL", "KABBAGE", "BLUEVINE", "FUNDBOX"]) assert.equal(acct(d, -120000), "2200", d);
  assert.equal(acct("EBAY PAYOUT", 80000), "4000");
  assert.equal(acct("PADDLE.COM", 60000), "4000");
});

test("personal-looking lines stay for a person", () => {
  for (const d of ["NETFLIX", "AUDIBLE", "COSTCO WHSE", "VENMO PAYMENT", "CASH APP"]) assert.equal(acct(d, -2000), null, d);
});
