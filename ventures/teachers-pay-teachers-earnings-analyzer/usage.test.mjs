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
  globalThis.localStorage.setItem("teachers-pay-teachers-earnings-analyzer-usage", "not json");
  assert.deepEqual(readUsage(), {});
  record("csv_analyzed");
  assert.equal(readUsage().csv_analyzed, 1);
});

// Red team 2026-11-16: three mutants of the shape checks survived here (CI's
// platform/ci/usage_contract.mjs caught them); valid JSON that is not a plain
// object must read as {} and record() must recover from it.
test("stored JSON that is not a plain object reads as empty and record recovers", () => {
  const KEY = "teachers-pay-teachers-earnings-analyzer-usage";
  for (const stored of ["[1,2]", "[]", "5", '"text"', "true", "null"]) {
    globalThis.localStorage.setItem(KEY, stored);
    assert.deepEqual(readUsage(), {}, `readUsage with ${stored}`);
    assert.doesNotThrow(() => record("csv_analyzed"), `record with ${stored}`);
    assert.deepEqual(readUsage(), { csv_analyzed: 1 }, `record after ${stored}`);
  }
});
