import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { BOOLEAN_FIELD_ID, NUMBER_FIELD_IDS, decodeInputs, encodeInputs } from "./share.mjs";
import { calculateWeek } from "./calc.mjs";

const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");

// Every field set to something other than the page's own starting default,
// so a dropped field shows up as a changed number rather than coincidentally
// matching what the recipient's page would have shown anyway.
const SENDER = Object.freeze({
  loadedMiles: 2100, emptyMiles: 300, mpg: 6.8, dieselPrice: 3.95,
  truckPayment: 2800, insurance: 1650, permits: 300, otherFixed: 250,
  maintenancePerMile: 0.18, tiresPerMile: 0.04, otherVariablePerMile: 0.06,
  factoringRate: 2.5, offeredLoadedRate: 2.35, taxReservePercent: 25,
  targetWeeklyTakeHome: 950,
  detentionHours: 4, detentionPayPerHour: 45, layoverPay: 100,
  lumperPaid: 60, lumperReimbursed: 20,
  factorAccessorials: false,
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
  assert.match(index, new RegExp(`id="${BOOLEAN_FIELD_ID}"[^>]*type="checkbox"`));
});

test("a round trip preserves every numeric value and the checkbox", () => {
  const decoded = decodeInputs(encodeInputs(SENDER));
  for (const id of NUMBER_FIELD_IDS) {
    assert.equal(decoded[id], SENDER[id], `${id} did not survive the round trip`);
  }
  assert.equal(decoded[BOOLEAN_FIELD_ID], false);
});

test("a checked (true) accessorial factor also survives", () => {
  const decoded = decodeInputs(encodeInputs({ ...SENDER, factorAccessorials: true }));
  assert.equal(decoded[BOOLEAN_FIELD_ID], true);
});

test("the recipient computes the same break-even week the sender saw", () => {
  const sent = calculateWeek(SENDER);
  const received = calculateWeek(decodeInputs(encodeInputs(SENDER)));
  assert.equal(received.breakEvenLoadedRate, sent.breakEvenLoadedRate);
  assert.equal(received.offered?.weeklyProfit, sent.offered?.weeklyProfit);
});

test("dropping the accessorial-factor flag would change the comparison — the field is load-bearing", () => {
  const withFlag = calculateWeek({ ...SENDER, factorAccessorials: true });
  const withoutFlag = calculateWeek({ ...SENDER, factorAccessorials: false });
  assert.notEqual(withFlag.offered?.weeklyProfit, withoutFlag.offered?.weeklyProfit);
});

test("blank or missing fields are omitted so the recipient keeps the page default", () => {
  const encoded = encodeInputs({ loadedMiles: 2000, mpg: "", dieselPrice: null });
  const decoded = decodeInputs(encoded);
  assert.equal(decoded.loadedMiles, 2000);
  assert.ok(!("mpg" in decoded));
  assert.ok(!("dieselPrice" in decoded));
  assert.ok(!(BOOLEAN_FIELD_ID in decoded));
});

test("a truncated or hostile fragment opens the page instead of breaking it", () => {
  assert.deepEqual(decodeInputs(""), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs("#"), {});
  assert.deepEqual(decodeInputs("loadedMiles=abc&mpg=-5"), {});
  assert.deepEqual(decodeInputs("__proto__=polluted&loadedMiles=2000"), { loadedMiles: 2000 });
  assert.equal({}.polluted, undefined);
  // A leading ? or # is accepted either way, since the page reads whichever
  // of hash and search the link arrived in.
  assert.deepEqual(decodeInputs("?loadedMiles=2000"), { loadedMiles: 2000 });
});

test("the visitor's usage-counting choice is never carried between devices", () => {
  assert.ok(!NUMBER_FIELD_IDS.includes("usageOptOut"));
  assert.ok(!("usageOptOut" in decodeInputs("usageOptOut=true&loadedMiles=2000")));
});

test("the page offers the link and reads one back on arrival", () => {
  assert.match(index, /import\s*\{[^}]*encodeInputs[^}]*\}\s*from\s*['"]\.\/share\.mjs['"]/);
  assert.match(index, /id="copyShareLink"/);
  assert.match(index, /window\.location\.hash/);
});
