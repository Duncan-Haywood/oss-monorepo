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
  globalThis.localStorage.setItem("water-well-drilling-bid-calculator-usage", "not json");
  assert.deepEqual(readUsage(), {});
  record("quote_run");
  assert.equal(readUsage().quote_run, 1);
});

test("a localStorage global that throws on access is treated as no storage", () => {
  const backing = fakeStorage();
  let reads = 0;
  delete globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      if (reads++ === 0) throw new Error("SecurityError");
      return backing;
    },
  });
  record("quote_run");
  assert.equal(backing.getItem("water-well-drilling-bid-calculator-usage"), null);
});
