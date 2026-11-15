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
  record("quote_run");
  record("quote_run");
  record("example_loaded");
  const usage = readUsage();
  assert.equal(usage.quote_run, 2);
  assert.equal(usage.example_loaded, 1);
});

test("opting out clears existing counters and stops new ones", () => {
  record("quote_run");
  setUsageOptOut(true);
  assert.equal(usageOptedOut(), true);
  assert.deepEqual(readUsage(), {});
  record("quote_run");
  assert.deepEqual(readUsage(), {});
});

test("opting back in lets counting resume", () => {
  setUsageOptOut(true);
  setUsageOptOut(false);
  assert.equal(usageOptedOut(), false);
  record("quote_run");
  assert.equal(readUsage().quote_run, 1);
});

test("Do Not Track is honoured even without an explicit opt-out", () => {
  globalThis.navigator.doNotTrack = "1";
  record("quote_run");
  assert.deepEqual(readUsage(), {});
});

test("a missing localStorage never throws", () => {
  delete globalThis.localStorage;
  assert.doesNotThrow(() => record("quote_run"));
  assert.deepEqual(readUsage(), {});
});

test("corrupt stored JSON is treated as empty rather than thrown", () => {
  globalThis.localStorage.setItem("mortgage-points-break-even-calculator-usage", "not json");
  assert.deepEqual(readUsage(), {});
  record("quote_run");
  assert.equal(readUsage().quote_run, 1);
});

// Red-team 2026-11-15: three mutants escaped this suite (the repo-wide
// platform/ci/usage_contract.mjs covers the class; these keep the copy's own
// suite honest too).
test("a stored array, number, string, null or boolean reads as empty and record() recovers", () => {
  for (const stored of ["[]", "5", "\"text\"", "null", "true"]) {
    globalThis.localStorage = fakeStorage();
    globalThis.localStorage.setItem("mortgage-points-break-even-calculator-usage", stored);
    assert.deepEqual(readUsage(), {}, `stored ${stored}`);
    assert.doesNotThrow(() => record("quote_run"), `stored ${stored}`);
    assert.equal(readUsage().quote_run, 1, `stored ${stored}`);
  }
});

test("a store whose reads throw is not read as an opt-out", () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: () => { throw new Error("SecurityError"); },
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  assert.equal(usageOptedOut(), false);
  record("quote_run");
  assert.equal(JSON.parse(store.get("mortgage-points-break-even-calculator-usage")).quote_run, 1);
});
