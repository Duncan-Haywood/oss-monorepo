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
  record("plan_run");
  record("plan_run");
  record("example_loaded");
  const usage = readUsage();
  assert.equal(usage.plan_run, 2);
  assert.equal(usage.example_loaded, 1);
});

test("opting out clears existing counters and stops new ones", () => {
  record("plan_run");
  setUsageOptOut(true);
  assert.equal(usageOptedOut(), true);
  assert.deepEqual(readUsage(), {});
  record("plan_run");
  assert.deepEqual(readUsage(), {});
});

test("opting back in lets counting resume", () => {
  setUsageOptOut(true);
  setUsageOptOut(false);
  assert.equal(usageOptedOut(), false);
  record("plan_run");
  assert.equal(readUsage().plan_run, 1);
});

test("Do Not Track is honoured even without an explicit opt-out", () => {
  globalThis.navigator.doNotTrack = "1";
  record("plan_run");
  assert.deepEqual(readUsage(), {});
});

test("a missing localStorage never throws", () => {
  delete globalThis.localStorage;
  assert.doesNotThrow(() => record("plan_run"));
  assert.deepEqual(readUsage(), {});
});

test("corrupt stored JSON is treated as empty rather than thrown", () => {
  globalThis.localStorage.setItem("stump-grinding-price-calculator-usage", "not json");
  assert.deepEqual(readUsage(), {});
  record("plan_run");
  assert.equal(readUsage().plan_run, 1);
});

// Red team 2026-11-15: three mutants of this file escaped the suite above.
test("stored JSON that is not a plain object reads as {} and record() recovers", () => {
  const key = "stump-grinding-price-calculator-usage";
  for (const stored of ["null", "5", "true", '"text"', "[]", "[1,2]"]) {
    globalThis.localStorage.setItem(key, stored);
    assert.deepEqual(readUsage(), {}, `readUsage with ${stored}`);
    assert.doesNotThrow(() => record("plan_run"), `record with ${stored}`);
    assert.deepEqual(readUsage(), { plan_run: 1 }, `count after ${stored}`);
  }
});

test("a store whose reads throw is never read as an opt-out", () => {
  globalThis.localStorage = {
    getItem: () => { throw new Error("SecurityError"); },
    setItem: () => {},
    removeItem: () => {},
  };
  assert.equal(usageOptedOut(), false);
});

test("an opt-out survives a page reload (the in-memory flag is gone)", () => {
  setUsageOptOut(true);
  globalThis.__usageOptOut = false;
  assert.equal(usageOptedOut(), true);
  record("plan_run");
  assert.deepEqual(readUsage(), {});
});
