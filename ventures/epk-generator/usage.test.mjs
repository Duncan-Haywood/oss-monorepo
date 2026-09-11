import test from "node:test";
import assert from "node:assert/strict";
import { record, readUsage, setUsageOptOut } from "./usage.mjs";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
  };
}

const originalLocalStorage = globalThis.localStorage;
const originalNavigator = globalThis.navigator;

function withGlobals(storage, navigatorStub, fn) {
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  Object.defineProperty(globalThis, "navigator", { value: navigatorStub, configurable: true });
  globalThis.__usageOptOut = false;
  try {
    return fn();
  } finally {
    Object.defineProperty(globalThis, "localStorage", { value: originalLocalStorage, configurable: true });
    Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true });
    globalThis.__usageOptOut = false;
  }
}

test("record counts a named event in localStorage under its own key", () => {
  const storage = memoryStorage();
  withGlobals(storage, {}, () => {
    record("kit_built");
    record("kit_built");
    record("one_sheet_copied");
    assert.deepEqual(readUsage(), { kit_built: 2, one_sheet_copied: 1 });
    assert.equal(storage.getItem("epk-generator-usage") !== null, true);
  });
});

test("setUsageOptOut(true) stops further recording and clears existing counts", () => {
  const storage = memoryStorage();
  withGlobals(storage, {}, () => {
    record("kit_built");
    setUsageOptOut(true);
    record("kit_built");
    assert.deepEqual(readUsage(), {});
  });
});

test("Do Not Track blocks recording without an explicit opt-out", () => {
  const storage = memoryStorage();
  withGlobals(storage, { doNotTrack: "1" }, () => {
    record("kit_built");
    assert.deepEqual(readUsage(), {});
  });
});

test("Global Privacy Control blocks recording", () => {
  const storage = memoryStorage();
  withGlobals(storage, { globalPrivacyControl: true }, () => {
    record("kit_built");
    assert.deepEqual(readUsage(), {});
  });
});

test("record and readUsage do not throw with no localStorage", () => {
  withGlobals(undefined, {}, () => {
    assert.doesNotThrow(() => record("kit_built"));
    assert.deepEqual(readUsage(), {});
  });
});

test("readUsage recovers from a corrupted value instead of throwing", () => {
  const storage = memoryStorage();
  withGlobals(storage, {}, () => {
    storage.setItem("epk-generator-usage", "not json");
    assert.deepEqual(readUsage(), {});
  });
});
