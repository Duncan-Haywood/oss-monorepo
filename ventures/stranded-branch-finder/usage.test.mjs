import test from "node:test";
import assert from "node:assert/strict";
import { record, readUsage, setUsageOptOut } from "./usage.mjs";
test("record is a no-op without storage and opt-out is honoured", () => {
  record("check_run");
  setUsageOptOut(true);
  record("check_run");
  assert.deepEqual(readUsage(), {});
  setUsageOptOut(false);
});
