// A fourth gap probe (~130 made-up descriptions from public company names; 25 were unsuggested). Not a real export.
import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";

const acct = (desc, cents) => suggest({ desc, cents }, {}).account;

test("filing service is legal; small SaaS tools are software", () => {
  assert.equal(acct("INCFILE", -8900), "6050");
  for (const d of ["FRESHBOOKS", "WAVE APPS", "SMALLPDF", "SURVEYMONKEY", "POSTMARK", "FRESHDESK", "GRAMMARLY"]) assert.equal(acct(d, -1500), "6060", d);
});

test("creator-platform payouts are sales; Costco, Walmart and Netflix stay for a person", () => {
  for (const d of ["GUMROAD", "PATREON", "LEMON SQUEEZY"]) assert.equal(acct(d, 50000), "4000", d);
  for (const d of ["COSTCO", "WALMART", "NETFLIX"]) assert.equal(acct(d, -5000), null, d);
});
