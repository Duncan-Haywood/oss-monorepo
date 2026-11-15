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
  record("analysis_run");
  record("analysis_run");
  record("example_loaded");
  const usage = readUsage();
  assert.equal(usage.analysis_run, 2);
  assert.equal(usage.example_loaded, 1);
});

test("opting out clears existing counters and stops new ones", () => {
  record("analysis_run");
  setUsageOptOut(true);
  assert.equal(usageOptedOut(), true);
  assert.deepEqual(readUsage(), {});
  record("analysis_run");
  assert.deepEqual(readUsage(), {});
});

test("opting back in lets counting resume", () => {
  setUsageOptOut(true);
  setUsageOptOut(false);
  assert.equal(usageOptedOut(), false);
  record("analysis_run");
  assert.equal(readUsage().analysis_run, 1);
});

test("Do Not Track is honoured even without an explicit opt-out", () => {
  globalThis.navigator.doNotTrack = "1";
  record("analysis_run");
  assert.deepEqual(readUsage(), {});
});

test("a missing localStorage never throws", () => {
  delete globalThis.localStorage;
  assert.doesNotThrow(() => record("analysis_run"));
  assert.deepEqual(readUsage(), {});
});

test("corrupt stored JSON is treated as empty rather than thrown", () => {
  globalThis.localStorage.setItem("mini-golf-course-profit-calculator-usage", "not json");
  assert.deepEqual(readUsage(), {});
  record("analysis_run");
  assert.equal(readUsage().analysis_run, 1);
});

// Red-team 2026-11-15: three mutants escaped this suite (the repo-wide
// platform/ci/usage_contract.mjs covers the class; these keep the copy's own
// suite honest too).
test("a stored array or number reads as empty and record() recovers", () => {
  for (const stored of ["[]", "5"]) {
    globalThis.localStorage = fakeStorage();
    globalThis.localStorage.setItem("mini-golf-course-profit-calculator-usage", stored);
    assert.doesNotThrow(() => record("analysis_run"));
    assert.equal(readUsage().analysis_run, 1, `stored ${stored}`);
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
  record("analysis_run");
  assert.equal(JSON.parse(store.get("mini-golf-course-profit-calculator-usage")).analysis_run, 1);
});
