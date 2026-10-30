// Descriptions a fourth probe (139 lines: trades, restaurant, e-commerce, health) found unsuggested; made up from public company names, not a real export.
import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";

const acct = (desc, cents) => suggest({ desc, cents }, {}).account;

test("POS, CRM, booking and recruiting software are software; job ads are advertising; fees are fees; phone is utilities", () => {
  for (const d of ["TOAST INC", "SALESFORCE", "ZENDESK", "SQSP", "MINDBODY", "ACUITY", "SQUARE APPOINTMENTS", "LINKEDIN PREMIUM", "PRINTIFY"]) assert.equal(acct(d, -9900), "6060", d);
  assert.equal(acct("INDEED", -9900), "6000");
  for (const d of ["ETSY LISTING FEE", "BANK SERVICE FEE"]) assert.equal(acct(d, -300), "6010", d);
  for (const d of ["ATT BILL", "AT&T"]) assert.equal(acct(d, -9000), "6140", d);
});

test("deposits and personal-or-mixed lines stay as they were", () => {
  assert.equal(acct("TOAST INC DEPOSIT", 250000), "4000");
  for (const d of ["WALMART", "TARGET", "NETFLIX", "PLANET FITNESS", "CVS PHARMACY", "ADP"]) assert.equal(acct(d, -5000), null, d);
});
