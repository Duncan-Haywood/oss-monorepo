// Descriptions a second probe found unsuggested; made up from the companies' public names, not a real export.
import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";

const acct = (desc, cents) => suggest({ desc, cents }, {}).account;

test("TaxJar, Bill.com, Expensify, Trello and HubSpot are software", () => {
  for (const d of ["TAXJAR", "BILL.COM", "EXPENSIFY", "TRELLO", "HUBSPOT"]) assert.equal(acct(d, -4900), "6060", d);
});

test("ambiguous lines stay for a person to file", () => {
  for (const d of ["AMEX PAYMENT", "SBA EIDL", "COSTCO", "CASH APP"]) assert.equal(acct(d, -4900), null, d);
});
