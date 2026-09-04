import test from "node:test";
import assert from "node:assert/strict";

// Minimal in-memory localStorage stand-in — this module is meant to run in
// a browser, but its logic (opt-out, event aggregation, keystroke settling)
// is worth unit testing directly rather than only by hand in a browser.
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

const { recordEvent, recordEventSettled, flushSettledEvents, cancelSettledEvents, isUsageCountingEnabled, setUsageCountingEnabled, readLocalUsage } = await import("./usage.mjs");

test("usage counting is on by default", () => {
  assert.equal(isUsageCountingEnabled(), true);
});

test("recordEvent aggregates same-day events under one key", () => {
  globalThis.localStorage = new FakeStorage();
  recordEvent("calculation");
  recordEvent("calculation");
  const events = readLocalUsage();
  const keys = Object.keys(events);
  assert.equal(keys.filter((k) => k.startsWith("calculation:")).length, 1);
  const key = keys.find((k) => k.startsWith("calculation:"));
  assert.equal(events[key], 2);
});

test("opting out stops recording and is reversible", () => {
  globalThis.localStorage = new FakeStorage();
  setUsageCountingEnabled(false);
  assert.equal(isUsageCountingEnabled(), false);
  recordEvent("calculation");
  assert.deepEqual(readLocalUsage(), {});

  setUsageCountingEnabled(true);
  assert.equal(isUsageCountingEnabled(), true);
  recordEvent("calculation");
  assert.equal(Object.keys(readLocalUsage()).length, 1);
});

test("a Do Not Track / Global Privacy Control signal disables counting even without an explicit opt-out", () => {
  globalThis.localStorage = new FakeStorage();
  setNavigator({ doNotTrack: "1" });
  assert.equal(isUsageCountingEnabled(), false);
  recordEvent("calculation");
  assert.deepEqual(readLocalUsage(), {});
  setNavigator({ doNotTrack: undefined, globalPrivacyControl: undefined });
});

// The page recomputes on every `input` event across twelve fields, which is
// right for the result but was wrong for the counter: calling recordEvent()
// straight from that handler counted keystrokes, so typing "10" into one
// field alone recorded two calculations. These cases pin down the fix.

test("a burst of keystrokes records one event, not one per keystroke", () => {
  globalThis.localStorage = new FakeStorage();
  cancelSettledEvents();
  for (const _ of "220") recordEventSettled("calculation");
  assert.deepEqual(readLocalUsage(), {}, "nothing is recorded until the input settles");
  flushSettledEvents();
  const events = readLocalUsage();
  const keys = Object.keys(events);
  assert.equal(keys.length, 1);
  assert.equal(events[keys[0]], 1, "three keystrokes are one calculation");
});

test("distinct events settle independently", () => {
  globalThis.localStorage = new FakeStorage();
  cancelSettledEvents();
  recordEventSettled("calculation");
  recordEventSettled("some_other_action");
  flushSettledEvents();
  assert.equal(Object.keys(readLocalUsage()).length, 2);
});

test("a settled event still respects opting out", () => {
  globalThis.localStorage = new FakeStorage();
  cancelSettledEvents();
  setUsageCountingEnabled(false);
  recordEventSettled("calculation");
  flushSettledEvents();
  assert.deepEqual(readLocalUsage(), {});
  setUsageCountingEnabled(true);
});

test("a settled event still respects Do Not Track", () => {
  globalThis.localStorage = new FakeStorage();
  cancelSettledEvents();
  setNavigator({ doNotTrack: "1" });
  recordEventSettled("calculation");
  flushSettledEvents();
  assert.deepEqual(readLocalUsage(), {});
  setNavigator({ doNotTrack: undefined, globalPrivacyControl: undefined });
});

test("settling twice records twice -- two real calculations still count as two", async () => {
  globalThis.localStorage = new FakeStorage();
  cancelSettledEvents();
  recordEventSettled("calculation", 5);
  await new Promise((resolve) => setTimeout(resolve, 25));
  recordEventSettled("calculation", 5);
  await new Promise((resolve) => setTimeout(resolve, 25));
  const events = readLocalUsage();
  const keys = Object.keys(events);
  assert.equal(keys.length, 1, "same event name and day share one key");
  assert.equal(events[keys[0]], 2);
});
