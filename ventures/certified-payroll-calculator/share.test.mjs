import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { NUMBER_FIELD_IDS, decodeInputs, encodeInputs } from "./share.mjs";
import { calculateCertifiedPayroll } from "./calc.mjs";

const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");

// Every field set to something other than the page's own starting default,
// so a dropped field shows up as a changed number rather than coincidentally
// matching what the recipient's page would have shown anyway.
const SENDER = Object.freeze({
  requiredBaseRate: 31, requiredFringeRate: 11.25, actualBaseRate: 29,
  bonaFideFringePerHour: 6, cashFringePerHour: 5.25, straightHours: 40,
  overtimeHours: 9, approvedRatioApprentices: 1, approvedRatioJourneymen: 4,
  journeymenOnSite: 5, apprenticesOnSite: 2, fullJourneymanRate: 42.25,
  excessApprenticeHours: 18,
});

test("every numeric field the page reads rides in the link", () => {
  // FIELD_IDS in index.html and NUMBER_FIELD_IDS here must not drift: a
  // field added to the page but not to the link is exactly the silent drop
  // this module exists to prevent.
  const declared = index.match(/const FIELD_IDS = \[([\s\S]*?)\];/);
  assert.ok(declared, "index.html should declare FIELD_IDS");
  const ids = [...declared[1].matchAll(/'([A-Za-z0-9_]+)'/g)].map((m) => m[1]);
  assert.ok(ids.length > 0, "FIELD_IDS should name at least one field");
  for (const id of ids) {
    assert.ok(NUMBER_FIELD_IDS.includes(id), `${id} is read by the page but dropped from the share link`);
  }
});

test("a round trip preserves every numeric value", () => {
  const decoded = decodeInputs(encodeInputs(SENDER));
  for (const id of NUMBER_FIELD_IDS) {
    assert.equal(decoded[id], SENDER[id], `${id} did not survive the round trip`);
  }
});

test("the recipient computes the same week the sender saw", () => {
  const sent = calculateCertifiedPayroll(SENDER);
  const received = calculateCertifiedPayroll(decodeInputs(encodeInputs(SENDER)));
  assert.equal(received.underpaymentTotal, sent.underpaymentTotal);
  assert.equal(received.ratio?.shortfallTotal, sent.ratio?.shortfallTotal);
});

test("blank or missing fields are omitted so the recipient keeps the page default", () => {
  const encoded = encodeInputs({ requiredBaseRate: 30, actualBaseRate: "", cashFringePerHour: null });
  const decoded = decodeInputs(encoded);
  assert.equal(decoded.requiredBaseRate, 30);
  assert.ok(!("actualBaseRate" in decoded));
  assert.ok(!("cashFringePerHour" in decoded));
});

test("a truncated or hostile fragment opens the page instead of breaking it", () => {
  assert.deepEqual(decodeInputs(""), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs("#"), {});
  assert.deepEqual(decodeInputs("requiredBaseRate=abc&actualBaseRate=-5"), {});
  assert.deepEqual(decodeInputs("__proto__=polluted&requiredBaseRate=30"), { requiredBaseRate: 30 });
  assert.equal({}.polluted, undefined);
  // A leading ? or # is accepted either way, since the page reads whichever
  // of hash and search the link arrived in.
  assert.deepEqual(decodeInputs("?requiredBaseRate=30"), { requiredBaseRate: 30 });
});

test("the visitor's usage-counting choice is never carried between devices", () => {
  assert.ok(!NUMBER_FIELD_IDS.includes("usageOptOut"));
  assert.ok(!("usageOptOut" in decodeInputs("usageOptOut=true&requiredBaseRate=30")));
});

test("the classification label is display-only and never rides in the link", () => {
  assert.ok(!NUMBER_FIELD_IDS.includes("classification"));
});

test("the page offers the link and reads one back on arrival", () => {
  assert.match(index, /import\s*\{[^}]*encodeInputs[^}]*\}\s*from\s*['"]\.\/share\.mjs['"]/);
  assert.match(index, /id="copyShareLink"/);
  assert.match(index, /window\.location\.hash/);
});
