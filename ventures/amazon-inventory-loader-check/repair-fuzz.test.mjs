// Mutation fuzzing of this checker's repair: validate and repair never throw, and repairing the repaired file
// changes nothing. Seeded, so a failure reproduces; see platform/fuzz/repair.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as calc from "./calc.mjs";
import { checkRepair, describe } from "../../platform/fuzz/repair.mjs";

test("validate and repair survive mutated samples, and repair is idempotent", () => {
  const failures = checkRepair(calc);
  assert.equal(failures.length, 0, describe(failures));
});
