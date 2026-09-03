import test from "node:test";
import assert from "node:assert/strict";

class FakeStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
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

test("recordEvent aggregates same-day events and never stores payload content", () => {
  globalThis.localStorage = new FakeStorage();
  recordEvent("inventory_compared");
  recordEvent("inventory_compared");
  recordEvent("report_exported");
  const events = readLocalUsage();
  const keys = Object.keys(events);
  assert.equal(keys.filter((key) => key.startsWith("inventory_compared:")).length, 1);
  assert.equal(events[keys.find((key) => key.startsWith("inventory_compared:"))], 2);
  assert.ok(keys.every((key) => /^(inventory_compared|report_exported):\d{4}-\d{2}-\d{2}$/.test(key)));
});

test("opting out stops recording and is reversible", () => {
  globalThis.localStorage = new FakeStorage();
  setUsageCountingEnabled(false);
  assert.equal(isUsageCountingEnabled(), false);
  recordEvent("inventory_compared");
  assert.deepEqual(readLocalUsage(), {});
  setUsageCountingEnabled(true);
  recordEvent("inventory_compared");
  assert.equal(Object.keys(readLocalUsage()).length, 1);
});

test("Do Not Track disables counting without an explicit opt-out", () => {
  globalThis.localStorage = new FakeStorage();
  setNavigator({ doNotTrack: "1" });
  assert.equal(isUsageCountingEnabled(), false);
  recordEvent("inventory_compared");
  assert.deepEqual(readLocalUsage(), {});
  setNavigator({ doNotTrack: undefined, globalPrivacyControl: undefined });
});
