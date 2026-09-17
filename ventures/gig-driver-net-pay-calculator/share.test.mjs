import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { NUMBER_FIELD_IDS, decodeInputs, encodeInputs } from "./share.mjs";
import { calculateSession } from "./calc.mjs";

const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");

// Every field set to something other than the page's own starting default,
// so a dropped field shows up as a changed number rather than coincidentally
// matching what the recipient's page would have shown anyway.
const SENDER = Object.freeze({
  grossPay: 210, milesDriven: 105, hoursActive: 5.5, mpg: 24, gasPrice: 3.79,
  maintenancePerMile: 0.08, insuranceMonthly: 160, otherFixedMonthly: 35,
  monthlyMiles: 1400, taxReservePercent: 22, comparisonHourlyWage: 15.5,
  targetHourlyTakeHome: 22,
});

test("every field the page reads rides in the link", () => {
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

test("the recipient computes the same session the sender saw", () => {
  const sent = calculateSession(SENDER);
  const received = calculateSession(decodeInputs(encodeInputs(SENDER)));
  assert.equal(received.netPerHour, sent.netPerHour);
  assert.equal(received.takeHome, sent.takeHome);
  assert.equal(received.target?.grossPayNeeded, sent.target?.grossPayNeeded);
});

test("blank or missing fields are omitted so the recipient keeps the page default", () => {
  const encoded = encodeInputs({ grossPay: 200, mpg: "", gasPrice: null });
  const decoded = decodeInputs(encoded);
  assert.equal(decoded.grossPay, 200);
  assert.ok(!("mpg" in decoded));
  assert.ok(!("gasPrice" in decoded));
});

test("a truncated or hostile fragment opens the page instead of breaking it", () => {
  assert.deepEqual(decodeInputs(""), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs("#"), {});
  assert.deepEqual(decodeInputs("grossPay=abc&mpg=-5"), {});
  assert.deepEqual(decodeInputs("__proto__=polluted&grossPay=200"), { grossPay: 200 });
  assert.equal({}.polluted, undefined);
  // A leading ? or # is accepted either way, since the page reads whichever
  // of hash and search the link arrived in.
  assert.deepEqual(decodeInputs("?grossPay=200"), { grossPay: 200 });
});

test("the visitor's usage-counting choice is never carried between devices", () => {
  assert.ok(!NUMBER_FIELD_IDS.includes("usageOptOut"));
  assert.ok(!("usageOptOut" in decodeInputs("usageOptOut=true&grossPay=200")));
});

test("the page offers the link and reads one back on arrival", () => {
  assert.match(index, /import\s*\{[^}]*encodeInputs[^}]*\}\s*from\s*['"]\.\/share\.mjs['"]/);
  assert.match(index, /id="copyShareLink"/);
  assert.match(index, /window\.location\.hash/);
});
