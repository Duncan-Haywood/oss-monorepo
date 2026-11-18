import test from "node:test";
import assert from "node:assert/strict";
import { checkFloorHeaders, checkTrimmer, checkCantilever } from "./floor.mjs";
import { openingScheduleCsv } from "./openingschedule.mjs";
import { procurementCsv } from "./procurement.mjs";
import { scheduleCsv } from "./schedule.mjs";

test("floor checks and CSV writers refuse null input with a plain message", () => {
  assert.throws(() => checkFloorHeaders("2x10", [], [], null), /needs a loads object/);
  assert.throws(() => checkTrimmer("2x10", 100, 10, 1, 1, 16, null), /needs a loads object/);
  assert.throws(() => checkCantilever("2x10", 100, 10, 16, null), /needs a loads object/);
  assert.throws(() => openingScheduleCsv(null), /needs an opening schedule/);
  assert.throws(() => procurementCsv(null), /needs a procurement result/);
  assert.throws(() => scheduleCsv(null), /needs a schedule result/);
});
