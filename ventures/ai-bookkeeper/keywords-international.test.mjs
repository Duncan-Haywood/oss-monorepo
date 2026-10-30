// Landlord and non-US telecom names (made up lines, not a real export) reach rent and utilities.
import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";

const model = { rules: [], codes: null, classifier: { n: 0 } };
const acct = (desc) => suggest({ desc, cents: -10000 }, model).account;

test("a property manager or foreign word for rent is rent", () => {
  for (const d of ["Acme Property Management", "Miete Oktober", "LOYER BUREAU 10", "Alquiler local"]) assert.equal(acct(d), "6080", d);
});
test("non-US telecoms and utilities are utilities", () => {
  for (const d of ["Telekom Deutschland GmbH", "VODAFONE LTD", "Virgin Media", "Telstra", "Stadtwerke Munchen", "Rogers Comm"]) assert.equal(acct(d), "6140", d);
});
test("a rent word does not hijack money in", () => {
  assert.notEqual(suggest({ desc: "Acme Property Management refund", cents: 10000 }, model).account, "6080");
});
