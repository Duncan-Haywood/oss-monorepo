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

const { recordEvent, createReportCounter, isUsageCountingEnabled, setUsageCountingEnabled, readLocalUsage } = await import("./usage.mjs");

// Drives createReportCounter's injected timers by hand, so settle behaviour is
// tested deterministically instead of by sleeping.
function fakeTimers() {
  let next = 1;
  const scheduled = new Map();
  return {
    setTimer: (fn) => { scheduled.set(next, fn); return next++; },
    clearTimer: (id) => { scheduled.delete(id); },
    settle() {
      const due = [...scheduled.values()];
      scheduled.clear();
      for (const fn of due) fn();
    },
  };
}

test("usage counting is on by default", () => {
  assert.equal(isUsageCountingEnabled(), true);
});

test("recordEvent aggregates same-day events under one key", () => {
  globalThis.localStorage = new FakeStorage();
  recordEvent("report_generated");
  recordEvent("report_generated");
  const events = readLocalUsage();
  const keys = Object.keys(events);
  assert.equal(keys.filter((k) => k.startsWith("report_generated:")).length, 1);
  const key = keys.find((k) => k.startsWith("report_generated:"));
  assert.equal(events[key], 2);
});

test("opting out stops recording and is reversible", () => {
  globalThis.localStorage = new FakeStorage();
  setUsageCountingEnabled(false);
  assert.equal(isUsageCountingEnabled(), false);
  recordEvent("report_generated");
  assert.deepEqual(readLocalUsage(), {});

  setUsageCountingEnabled(true);
  assert.equal(isUsageCountingEnabled(), true);
  recordEvent("report_generated");
  assert.equal(Object.keys(readLocalUsage()).length, 1);
});

test("a burst of keystrokes counts as one report, not one per character", () => {
  const timers = fakeTimers();
  const recorded = [];
  const countReport = createReportCounter({ record: (e) => recorded.push(e), ...timers });

  // What typing "4200" into the price field looks like: four recomputes.
  for (const signature of ['{"price":4}', '{"price":42}', '{"price":420}', '{"price":4200}']) {
    countReport(signature);
  }
  assert.deepEqual(recorded, [], "nothing should be counted while input is still moving");

  timers.settle();
  assert.deepEqual(recorded, ["report_generated"], "one settled quote is one report");
});

test("re-settling on an unchanged quote does not count a second report", () => {
  const timers = fakeTimers();
  const recorded = [];
  const countReport = createReportCounter({ record: (e) => recorded.push(e), ...timers });

  countReport('{"price":4200}');
  timers.settle();
  countReport('{"price":4200}'); // e.g. tabbing through fields, or retyping the same figure
  timers.settle();
  assert.equal(recorded.length, 1);

  countReport('{"price":5000}'); // a genuinely different quote is a new report
  timers.settle();
  assert.equal(recorded.length, 2);
});

test("a Do Not Track / Global Privacy Control signal disables counting even without an explicit opt-out", () => {
  globalThis.localStorage = new FakeStorage();
  setNavigator({ doNotTrack: "1" });
  assert.equal(isUsageCountingEnabled(), false);
  recordEvent("report_generated");
  assert.deepEqual(readLocalUsage(), {});
  setNavigator({ doNotTrack: undefined, globalPrivacyControl: undefined });
});
