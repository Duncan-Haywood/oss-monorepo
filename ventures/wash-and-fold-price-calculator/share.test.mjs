import test from "node:test";
import assert from "node:assert/strict";
import { INPUT_FIELDS } from "./calculator.mjs";
import { FIELD_IDS, encodeInputs, decodeInputs, formValues } from "./share.mjs";

const SAMPLE = {
  pricePerPound: 1.75, avgOrderPounds: 22, minimumCharge: 20, minimumOrderPounds: 10,
  laborMinutesPerPound: 0.9, fixedMinutesPerOrder: 9, wagePerHour: 16, payrollLoadPct: 18,
  poundsPerWasherLoad: 20, washCostPerLoad: 1.35, poundsPerDryerLoad: 30, dryCostPerLoad: 1.1,
  suppliesCostPerPound: 0.06, deliveryStopsPerOrder: 2, driveMinutesPerStop: 7, milesPerStop: 4,
  vehicleCostPerMile: 0.55, monthlyOverhead: 2400, monthlyPounds: 6000, targetMarginPct: 35,
  monthlyProfitGoal: 3000,
};

test("FIELD_IDS matches calculator.mjs INPUT_FIELDS exactly, so a new arithmetic field is shareable", () => {
  assert.deepEqual(FIELD_IDS, INPUT_FIELDS);
});

test("round-trips every known field", () => {
  const encoded = encodeInputs({ ...SAMPLE, unknown: 99 });
  const decoded = decodeInputs(`?${encoded}`);
  for (const id of FIELD_IDS) {
    assert.equal(decoded[id], SAMPLE[id]);
  }
  assert.equal(decoded.unknown, undefined);
});

test("a leading ? or # is accepted so location.hash needs no trimming", () => {
  assert.deepEqual(decodeInputs("?avgOrderPounds=22"), { avgOrderPounds: 22 });
  assert.deepEqual(decodeInputs("#avgOrderPounds=22"), { avgOrderPounds: 22 });
});

test("ignores a crafted non-numeric or negative query value", () => {
  assert.deepEqual(decodeInputs("avgOrderPounds=abc&wagePerHour=16"), { wagePerHour: 16 });
  assert.equal(encodeInputs({ avgOrderPounds: -5 }).includes("avgOrderPounds="), false);
});

test("a zero value round-trips rather than being dropped as falsy", () => {
  const encoded = encodeInputs({ ...SAMPLE, monthlyOverhead: 0 });
  assert.equal(decodeInputs(encoded).monthlyOverhead, 0);
});

test("a non-string source decodes to nothing rather than throwing", () => {
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs(42), {});
});

// A shared link is a whole scenario, not a patch over whatever the recipient
// already had on screen. A shop with no minimum charge leaves that box blank,
// `encodeInputs` omits it, and applying only the keys the link carried would
// leave the recipient's own saved draft in it -- pricing the sender's
// scenario against a minimum charge the sender never had.
test("formValues clears a field the link did not carry", () => {
  const omitted = "minimumCharge";
  const sender = Object.fromEntries(
    INPUT_FIELDS.filter(id => id !== omitted).map(id => [id, 4]),
  );
  const applied = formValues(decodeInputs(encodeInputs(sender)));

  for (const id of FIELD_IDS) {
    assert.ok(Object.prototype.hasOwnProperty.call(applied, id), `#${id} must be written, not skipped`);
  }
  assert.equal(applied[omitted], "", "a field the sender left blank must arrive blank");
  for (const id of INPUT_FIELDS.filter(id => id !== omitted)) assert.equal(applied[id], "4");
});

test("formValues round-trips a scenario with every field filled", () => {
  const sender = Object.fromEntries(FIELD_IDS.map(id => [id, 6]));
  const applied = formValues(decodeInputs(encodeInputs(sender)));
  for (const id of FIELD_IDS) assert.equal(applied[id], "6");
});
