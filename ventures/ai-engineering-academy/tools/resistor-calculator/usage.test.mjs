import test from "node:test";
import assert from "node:assert/strict";

// Minimal in-memory localStorage stand-in — this module is meant to run in
// a browser, but its logic (opt-out, event aggregation) is worth unit
// testing directly rather than only by hand in a browser.
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
  recordEvent("resistor_decoded");
  recordEvent("resistor_decoded");
  recordEvent("ohms_law_solved");
  const events = readLocalUsage();
  const keys = Object.keys(events);
  assert.equal(keys.filter((k) => k.startsWith("resistor_decoded:")).length, 1);
  const decodedKey = keys.find((k) => k.startsWith("resistor_decoded:"));
  assert.equal(events[decodedKey], 2);
});

test("opting out stops recording and is reversible", () => {
  globalThis.localStorage = new FakeStorage();
  setUsageCountingEnabled(false);
  assert.equal(isUsageCountingEnabled(), false);
  recordEvent("resistor_decoded");
  assert.deepEqual(readLocalUsage(), {});

  setUsageCountingEnabled(true);
  assert.equal(isUsageCountingEnabled(), true);
  recordEvent("resistor_decoded");
  assert.equal(Object.keys(readLocalUsage()).length, 1);
});

test("a Do Not Track / Global Privacy Control signal disables counting even without an explicit opt-out", () => {
  globalThis.localStorage = new FakeStorage();
  setNavigator({ doNotTrack: "1" });
  assert.equal(isUsageCountingEnabled(), false);
  recordEvent("resistor_decoded");
  assert.deepEqual(readLocalUsage(), {});
  setNavigator({ doNotTrack: undefined, globalPrivacyControl: undefined });
});

// These tools recompute on every `input` event. Before recordEventSettled,
// the counter was incremented from that same handler, so typing "220" into
// one field recorded three calculations -- the bug these cases pin down.

test("a burst of keystrokes records one event, not one per keystroke", () => {
  globalThis.localStorage = new FakeStorage();
  cancelSettledEvents();
  for (const _ of "220") recordEventSettled("ohms_law_solved");
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
  recordEventSettled("ohms_law_solved");
  recordEventSettled("some_other_action");
  flushSettledEvents();
  assert.equal(Object.keys(readLocalUsage()).length, 2);
});

test("a settled event still respects opting out", () => {
  globalThis.localStorage = new FakeStorage();
  cancelSettledEvents();
  setUsageCountingEnabled(false);
  recordEventSettled("ohms_law_solved");
  flushSettledEvents();
  assert.deepEqual(readLocalUsage(), {});
  setUsageCountingEnabled(true);
});

test("a settled event still respects Do Not Track", () => {
  globalThis.localStorage = new FakeStorage();
  cancelSettledEvents();
  setNavigator({ doNotTrack: "1" });
  recordEventSettled("ohms_law_solved");
  flushSettledEvents();
  assert.deepEqual(readLocalUsage(), {});
  setNavigator({ doNotTrack: undefined, globalPrivacyControl: undefined });
});

test("settling twice records twice -- two real calculations still count as two", async () => {
  globalThis.localStorage = new FakeStorage();
  cancelSettledEvents();
  recordEventSettled("ohms_law_solved", 5);
  await new Promise((resolve) => setTimeout(resolve, 25));
  recordEventSettled("ohms_law_solved", 5);
  await new Promise((resolve) => setTimeout(resolve, 25));
  const events = readLocalUsage();
  const keys = Object.keys(events);
  assert.equal(keys.length, 1, "same event name and day share one key");
  assert.equal(events[keys[0]], 2);
});
