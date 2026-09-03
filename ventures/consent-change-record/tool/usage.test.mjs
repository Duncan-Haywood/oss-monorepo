import test from "node:test";
import assert from "node:assert/strict";

// Minimal in-memory localStorage stand-in — this module is meant to run in a
// browser, but its logic (opt-out, event aggregation) is worth unit testing
// directly rather than only by hand in a browser.
class FakeStorage {
  constructor() { this.store = new Map(); }
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
}

function setNavigator(value) {
  Object.defineProperty(globalThis, "navigator", { value, configurable: true, writable: true });
}

globalThis.localStorage = new FakeStorage();
setNavigator({ doNotTrack: undefined, globalPrivacyControl: undefined });

const { recordEvent, isUsageCountingEnabled, setUsageCountingEnabled, readLocalUsage } = await import("./usage.mjs");

test("usage counting is on by default", () => {
  assert.equal(isUsageCountingEnabled(), true);
});

test("recordEvent aggregates same-day events under one key", () => {
  globalThis.localStorage = new FakeStorage();
  recordEvent("diff_generated");
  recordEvent("diff_generated");
  recordEvent("evidence_exported");
  const events = readLocalUsage();
  const keys = Object.keys(events);
  assert.equal(keys.filter((k) => k.startsWith("diff_generated:")).length, 1);
  const diffKey = keys.find((k) => k.startsWith("diff_generated:"));
  assert.equal(events[diffKey], 2);
});

test("opting out stops recording and is reversible", () => {
  globalThis.localStorage = new FakeStorage();
  setUsageCountingEnabled(false);
  assert.equal(isUsageCountingEnabled(), false);
  recordEvent("diff_generated");
  assert.deepEqual(readLocalUsage(), {});

  setUsageCountingEnabled(true);
  assert.equal(isUsageCountingEnabled(), true);
  recordEvent("diff_generated");
  assert.equal(Object.keys(readLocalUsage()).length, 1);
});

test("a Do Not Track / Global Privacy Control signal disables counting even without an explicit opt-out", () => {
  globalThis.localStorage = new FakeStorage();
  setNavigator({ doNotTrack: "1" });
  assert.equal(isUsageCountingEnabled(), false);
  recordEvent("diff_generated");
  assert.deepEqual(readLocalUsage(), {});
  setNavigator({ doNotTrack: undefined, globalPrivacyControl: undefined });
});
