import test from "node:test";
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

function withStorage(fn) {
  const original = globalThis.localStorage;
  globalThis.localStorage = fakeStorage();
  try {
    fn();
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
    setUsageOptOut(false);
  }
}

test("record: counts an event and readUsage reflects it", () => {
  withStorage(() => {
    record("check_run");
    record("check_run");
    record("example_loaded");
    assert.deepEqual(readUsage(), { check_run: 2, example_loaded: 1 });
  });
});

test("setUsageOptOut(true) clears counters and stops future recording", () => {
  withStorage(() => {
    record("check_run");
    setUsageOptOut(true);
    assert.deepEqual(readUsage(), {});
    record("check_run");
    assert.deepEqual(readUsage(), {});
    assert.equal(usageOptedOut(), true);
  });
});

test("readUsage with no storage available returns an empty object, not a throw", () => {
  const original = globalThis.localStorage;
  delete globalThis.localStorage;
  try {
    assert.deepEqual(readUsage(), {});
  } finally {
    if (original !== undefined) globalThis.localStorage = original;
  }
});
