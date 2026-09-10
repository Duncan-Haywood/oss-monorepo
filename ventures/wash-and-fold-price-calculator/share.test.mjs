import test from "node:test";
import assert from "node:assert/strict";
import { INPUT_FIELDS } from "./calculator.mjs";
import { FIELD_IDS, encodeInputs, decodeInputs } from "./share.mjs";

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
