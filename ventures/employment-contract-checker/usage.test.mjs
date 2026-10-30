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
  record("contract_checked");
  record("contract_checked");
  record("example_loaded");
  const usage = readUsage();
  assert.equal(usage.contract_checked, 2);
  assert.equal(usage.example_loaded, 1);
});

test("opting out clears existing counters and stops new ones", () => {
  record("contract_checked");
  setUsageOptOut(true);
  assert.equal(usageOptedOut(), true);
  assert.deepEqual(readUsage(), {});
  record("contract_checked");
  assert.deepEqual(readUsage(), {});
});

test("opting back in lets counting resume", () => {
  setUsageOptOut(true);
  setUsageOptOut(false);
  assert.equal(usageOptedOut(), false);
  record("contract_checked");
  assert.equal(readUsage().contract_checked, 1);
});

test("Do Not Track is honoured even without an explicit opt-out", () => {
  globalThis.navigator.doNotTrack = "1";
  record("contract_checked");
  assert.deepEqual(readUsage(), {});
});

test("a missing localStorage never throws", () => {
  delete globalThis.localStorage;
  assert.doesNotThrow(() => record("contract_checked"));
  assert.deepEqual(readUsage(), {});
});

test("corrupt stored JSON is treated as empty rather than thrown", () => {
  globalThis.localStorage.setItem("employment-contract-checker-usage", "not json");
  assert.deepEqual(readUsage(), {});
  record("contract_checked");
  assert.equal(readUsage().contract_checked, 1);
});

test("a store that throws on read is not read as an opt-out", () => {
  globalThis.localStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => {},
    removeItem: () => {},
  };
  assert.equal(usageOptedOut(), false);
});

test("stored values that are not a counter object are discarded, not extended", () => {
  const key = "employment-contract-checker-usage";
  for (const bad of ["5", "null", "[1,2]", '"text"', "true"]) {
    globalThis.localStorage.setItem(key, bad);
    assert.deepEqual(readUsage(), {}, `readUsage ${bad}`);
    assert.doesNotThrow(() => record("contract_checked"), `record ${bad}`);
    assert.deepEqual(readUsage(), { contract_checked: 1 }, `after record ${bad}`);
  }
});
