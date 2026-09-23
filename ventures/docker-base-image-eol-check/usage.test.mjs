import test from "node:test";
import assert from "node:assert/strict";
import { record, readUsage, setUsageOptOut, usageOptedOut } from "./usage.mjs";

function withStorage(fn) {
  const store = new Map();
  const fakeStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: fakeStorage, configurable: true });
  try {
    fn(fakeStorage);
  } finally {
    setUsageOptOut(false);
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
}

test("record() counts an event and readUsage() reflects it", () => {
  withStorage(() => {
    record("check_run");
    record("check_run");
    record("example_loaded");
    assert.deepEqual(readUsage(), { check_run: 2, example_loaded: 1 });
  });
});

test("setUsageOptOut(true) removes existing counters and blocks new ones", () => {
  withStorage(() => {
    record("check_run");
    setUsageOptOut(true);
    assert.deepEqual(readUsage(), {});
    record("check_run");
    assert.deepEqual(readUsage(), {});
    assert.equal(usageOptedOut(), true);
  });
});

test("setUsageOptOut(false) re-enables counting", () => {
  withStorage(() => {
    setUsageOptOut(true);
    setUsageOptOut(false);
    record("check_run");
    assert.deepEqual(readUsage(), { check_run: 1 });
  });
});

test("no localStorage present is not an error", () => {
  assert.doesNotThrow(() => record("check_run"));
  assert.deepEqual(readUsage(), {});
});
