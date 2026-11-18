import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { record, readUsage, setUsageOptOut, usageOptedOut } from "./usage.mjs";

const KEY = "systemd-unit-hardening-check-usage";
const OPT_OUT = "systemd-unit-hardening-check-usage-opt-out";

function fakeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    raw: store,
  };
}

beforeEach(() => {
  globalThis.localStorage = fakeStorage();
  globalThis.__usageOptOut = false;
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
});

test("record counts events, and readUsage reads them back", () => {
  record("file_checked");
  record("file_checked");
  record("example_loaded");
  const usage = readUsage();
  assert.equal(usage.file_checked, 2);
  assert.equal(usage.example_loaded, 1);
  assert.deepEqual(JSON.parse(localStorage.getItem(KEY)), { file_checked: 2, example_loaded: 1 });
});

test("opting out clears existing counters, stores the flag and stops new ones", () => {
  record("file_checked");
  setUsageOptOut(true);
  assert.equal(usageOptedOut(), true);
  assert.equal(localStorage.getItem(KEY), null);
  assert.equal(localStorage.getItem(OPT_OUT), "1");
  assert.deepEqual(readUsage(), {});
  record("file_checked");
  assert.deepEqual(readUsage(), {});
});

test("the opt-out survives a new page load (stored flag, no in-memory flag)", () => {
  setUsageOptOut(true);
  globalThis.__usageOptOut = false;
  assert.equal(usageOptedOut(), true);
  record("file_checked");
  assert.deepEqual(readUsage(), {});
});

test("opting back in removes the stored flag and lets counting resume", () => {
  setUsageOptOut(true);
  setUsageOptOut(false);
  assert.equal(usageOptedOut(), false);
  assert.equal(localStorage.getItem(OPT_OUT), null);
  record("file_checked");
  assert.equal(readUsage().file_checked, 1);
});

test("Do Not Track and Global Privacy Control are honoured without an explicit opt-out", () => {
  globalThis.navigator.doNotTrack = "1";
  record("file_checked");
  assert.deepEqual(readUsage(), {});
  delete globalThis.navigator.doNotTrack;
  globalThis.navigator.globalPrivacyControl = true;
  record("file_checked");
  assert.deepEqual(readUsage(), {});
  globalThis.navigator.globalPrivacyControl = false;
  globalThis.navigator.doNotTrack = "0";
  record("file_checked");
  assert.equal(readUsage().file_checked, 1);
});

test("a missing localStorage never throws", () => {
  delete globalThis.localStorage;
  assert.doesNotThrow(() => record("file_checked"));
  assert.doesNotThrow(() => setUsageOptOut(true));
  assert.deepEqual(readUsage(), {});
});

test("storage that throws is never read as consent and never throws", () => {
  const boom = () => { throw new Error("blocked"); };
  globalThis.localStorage = { getItem: boom, setItem: boom, removeItem: boom };
  assert.equal(usageOptedOut(), false);
  assert.doesNotThrow(() => record("file_checked"));
  assert.doesNotThrow(() => setUsageOptOut(true));
  assert.deepEqual(readUsage(), {});
});

test("a store that cannot be written does not break record", () => {
  globalThis.localStorage = { getItem: () => null, setItem: () => { throw new Error("full"); }, removeItem: () => {} };
  assert.doesNotThrow(() => record("file_checked"));
});

test("corrupt, array and non-object stored values are treated as empty", () => {
  for (const bad of ["not json", "[1,2]", "null", "7"]) {
    localStorage.setItem(KEY, bad);
    assert.deepEqual(readUsage(), {});
    record("file_checked");
    assert.deepEqual(readUsage(), { file_checked: 1 });
    localStorage.removeItem(KEY);
  }
});

