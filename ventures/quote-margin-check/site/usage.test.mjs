import test from "node:test";
import assert from "node:assert/strict";

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
    pendingCount: () => scheduled.size,
    settle() {
      const due = [...scheduled.values()];
      scheduled.clear();
      for (const fn of due) fn();
    },
  };
}

function counterHarness() {
  const timers = fakeTimers();
  const recorded = [];
  const counter = createReportCounter({ record: (e) => recorded.push(e), ...timers });
  return { timers, recorded, counter };
}

test("usage counting is on by default", () => {
  assert.equal(isUsageCountingEnabled(), true);
});

test("recordEvent aggregates same-day events under one key", () => {
  globalThis.localStorage = new FakeStorage();
  recordEvent("report_generated");
  recordEvent("report_generated");
  recordEvent("csv_exported");
  recordEvent("cost_spike_compared");
  const events = readLocalUsage();
  const keys = Object.keys(events);
  assert.equal(keys.filter((k) => k.startsWith("report_generated:")).length, 1);
  const key = keys.find((k) => k.startsWith("report_generated:"));
  assert.equal(events[key], 2);
  const spikeKey = keys.find((k) => k.startsWith("cost_spike_compared:"));
  assert.equal(events[spikeKey], 1);
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

test("a Do Not Track / Global Privacy Control signal disables counting even without an explicit opt-out", () => {
  globalThis.localStorage = new FakeStorage();
  setNavigator({ doNotTrack: "1" });
  assert.equal(isUsageCountingEnabled(), false);
  recordEvent("report_generated");
  assert.deepEqual(readLocalUsage(), {});
  setNavigator({ doNotTrack: undefined, globalPrivacyControl: undefined });
});

test("a burst of keystrokes counts as one report, not one per character", () => {
  const { timers, recorded, counter } = counterHarness();

  // What typing "4200" into the price field looks like: four recomputes.
  for (const sig of ['{"price":4}', '{"price":42}', '{"price":420}', '{"price":4200}']) {
    counter.count(sig);
  }
  assert.deepEqual(recorded, [], "nothing counted while the numbers are still moving");

  timers.settle();
  assert.deepEqual(recorded, ["report_generated"], "one settled quote is one report");
});

test("the pre-filled first render is seeded, not counted", () => {
  const { timers, recorded, counter } = counterHarness();

  counter.seed('{"price":2400}'); // the page opens with the worked example
  timers.settle();
  assert.deepEqual(recorded, [], "a bare page view is not a report the visitor asked for");

  counter.count('{"price":9000}'); // their first real edit
  timers.settle();
  assert.deepEqual(recorded, ["report_generated"]);
});

test("re-settling on an unchanged quote does not count a second report", () => {
  const { timers, recorded, counter } = counterHarness();

  counter.count('{"price":4200}');
  timers.settle();
  counter.count('{"price":4200}'); // tabbing through fields, or retyping the same figure
  timers.settle();
  assert.equal(recorded.length, 1);

  counter.count('{"price":5000}'); // a genuinely different quote is a new report
  timers.settle();
  assert.equal(recorded.length, 2);
});

test("going invalid mid-edit drops the pending count", () => {
  const { timers, recorded, counter } = counterHarness();

  counter.count('{"price":4200}');
  counter.drop(); // e.g. the visitor clears the price field
  timers.settle();
  assert.deepEqual(recorded, [], "a half-typed quote should not be reported");
  assert.equal(timers.pendingCount(), 0, "no timer left armed");
});

test("seeding cancels a pending count rather than leaving it armed", () => {
  const { timers, recorded, counter } = counterHarness();

  counter.count('{"price":4200}');
  counter.seed('{"price":4200}');
  timers.settle();
  assert.deepEqual(recorded, []);
});
