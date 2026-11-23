import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { record, readUsage, setUsageOptOut, usageOptedOut } from "./usage.mjs";

function fakeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

beforeEach(() => {
  globalThis.localStorage = fakeStorage();
  globalThis.__usageOptOut = false;
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
});

test("record counts events, and readUsage reads them back", () => {
  record("csv_analyzed");
  record("csv_analyzed");
  record("example_loaded");
  const usage = readUsage();
  assert.equal(usage.csv_analyzed, 2);
  assert.equal(usage.example_loaded, 1);
});

test("opting out clears existing counters and stops new ones", () => {
  record("csv_analyzed");
  setUsageOptOut(true);
  assert.equal(usageOptedOut(), true);
  assert.deepEqual(readUsage(), {});
  record("csv_analyzed");
  assert.deepEqual(readUsage(), {});
});

test("opting back in lets counting resume", () => {
  setUsageOptOut(true);
  setUsageOptOut(false);
  assert.equal(usageOptedOut(), false);
  record("csv_analyzed");
  assert.equal(readUsage().csv_analyzed, 1);
});

test("Do Not Track is honoured even without an explicit opt-out", () => {
  globalThis.navigator.doNotTrack = "1";
  record("csv_analyzed");
  assert.deepEqual(readUsage(), {});
});

test("a missing localStorage never throws", () => {
  delete globalThis.localStorage;
  assert.doesNotThrow(() => record("csv_analyzed"));
  assert.deepEqual(readUsage(), {});
});

test("corrupt stored JSON is treated as empty rather than thrown", () => {
  globalThis.localStorage.setItem("fba-reimbursement-claim-finder-usage", "not json");
  assert.deepEqual(readUsage(), {});
  record("csv_analyzed");
  assert.equal(readUsage().csv_analyzed, 1);
});

// Red-team 2026-11-23: three seeded faults escaped this suite (CI's
// platform/ci/usage_contract.mjs caught them, but this copy's own tests did not).
test("stored JSON that is not a plain object reads as {} and record() recovers", () => {
  for (const bad of ["5", '"text"', "true", "null", "[]", "[1,2]"]) {
    globalThis.localStorage.setItem("fba-reimbursement-claim-finder-usage", bad);
    assert.deepEqual(readUsage(), {}, `stored ${bad}`);
    assert.doesNotThrow(() => record("csv_analyzed"), `stored ${bad}`);
    assert.deepEqual(readUsage(), { csv_analyzed: 1 }, `stored ${bad}`);
  }
});

test("a store whose reads throw is never read as an opt-out", () => {
  globalThis.localStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };
  assert.equal(usageOptedOut(), false);
  assert.doesNotThrow(() => record("csv_analyzed"));
  assert.deepEqual(readUsage(), {});
});
