// A fifth gap probe (~125 made-up descriptions from public company names; 13 expenses and 3 credits were unsuggested). Not a real export.
import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";

const acct = (desc, cents) => suggest({ desc, cents }, {}).account;

test("work-management, password and form tools are software; Bing Ads is advertising", () => {
  for (const d of ["CLICKUP", "MONDAY.COM", "DASHLANE", "BUFFER", "PAGERDUTY", "BOX.COM", "JOTFORM", "PANDADOC", "IFTTT", "HOVER.COM"]) assert.equal(acct(d, -1500), "6060", d);
  for (const d of ["BING ADS", "MICROSOFT ADVERTISING"]) assert.equal(acct(d, -9000), "6000", d);
});

test("Kickstarter and Thinkific credits are sales; ADP and a coworking space stay for a person", () => {
  for (const d of ["KICKSTARTER", "THINKIFIC"]) assert.equal(acct(d, 50000), "4000", d);
  for (const d of ["ADP", "KNOTEL"]) assert.equal(acct(d, -5000), null, d);
});
