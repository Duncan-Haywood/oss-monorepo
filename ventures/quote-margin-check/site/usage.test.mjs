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

const { recordEvent, isUsageCountingEnabled, setUsageCountingEnabled, readLocalUsage, createSettledRecorder } =
  await import("./usage.mjs");

// A controllable stand-in for setTimeout, so the settling behaviour can be
// tested exactly rather than by sleeping.
function fakeClock() {
  let nextId = 1;
  const pending = new Map();
  return {
    schedule(fn) { const id = nextId++; pending.set(id, fn); return id; },
    cancel(id) { pending.delete(id); },
    /** Fires everything still scheduled, as an idle gap would. */
    settle() { const fns = [...pending.values()]; pending.clear(); for (const fn of fns) fn(); },
    get pendingCount() { return pending.size; },
  };
}

function recorderHarness() {
  const clock = fakeClock();
  const recorded = [];
  const recorder = createSettledRecorder({
    record: (name) => recorded.push(name),
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  return { clock, recorded, recorder };
}

test("typing a figure records one report, not one per keystroke", () => {
  const { clock, recorded, recorder } = recorderHarness();
  // Same shape as typing "2400" into the price field: four renders, one report.
  for (const sig of ["USD|2", "USD|24", "USD|240", "USD|2400"]) {
    recorder.note("report_generated", sig);
  }
  assert.deepEqual(recorded, [], "nothing recorded while the figures are still changing");
  clock.settle();
  assert.deepEqual(recorded, ["report_generated"]);
});

test("the pre-filled first render seeds instead of counting", () => {
  const { clock, recorded, recorder } = recorderHarness();
  recorder.seed("USD|2400");
  clock.settle();
  assert.deepEqual(recorded, [], "a page view is not a report the visitor asked for");
});

test("returning to an already-counted result does not count it again", () => {
  const { clock, recorded, recorder } = recorderHarness();
  recorder.note("report_generated", "USD|2400");
  clock.settle();
  assert.deepEqual(recorded, ["report_generated"]);

  // Typing an extra digit and deleting it lands back on the same report.
  recorder.note("report_generated", "USD|24000");
  recorder.note("report_generated", "USD|2400");
  clock.settle();
  assert.deepEqual(recorded, ["report_generated"], "same figures, still one report");
});

test("a distinct later result is counted separately", () => {
  const { clock, recorded, recorder } = recorderHarness();
  recorder.note("report_generated", "USD|2400");
  clock.settle();
  recorder.note("report_generated", "USD|3600");
  clock.settle();
  assert.deepEqual(recorded, ["report_generated", "report_generated"]);
});

test("input going invalid drops the pending report", () => {
  const { clock, recorded, recorder } = recorderHarness();
  recorder.note("report_generated", "USD|2400");
  recorder.discard();
  clock.settle();
  assert.deepEqual(recorded, [], "a transient invalid state never counted as a report");
  assert.equal(clock.pendingCount, 0);
});

test("a settled report still honours the opt-out, since it routes through recordEvent", () => {
  globalThis.localStorage = new FakeStorage();
  setUsageCountingEnabled(false);
  const clock = fakeClock();
  const recorder = createSettledRecorder({ schedule: clock.schedule, cancel: clock.cancel });
  recorder.note("report_generated", "USD|2400");
  clock.settle();
  assert.deepEqual(readLocalUsage(), {});
  setUsageCountingEnabled(true);
});

test("usage counting is on by default", () => {
  assert.equal(isUsageCountingEnabled(), true);
});

test("recordEvent aggregates same-day events under one key", () => {
  globalThis.localStorage = new FakeStorage();
  recordEvent("report_generated");
  recordEvent("report_generated");
  recordEvent("csv_exported");
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

test("a Do Not Track / Global Privacy Control signal disables counting even without an explicit opt-out", () => {
  globalThis.localStorage = new FakeStorage();
  setNavigator({ doNotTrack: "1" });
  assert.equal(isUsageCountingEnabled(), false);
  recordEvent("report_generated");
  assert.deepEqual(readLocalUsage(), {});
  setNavigator({ doNotTrack: undefined, globalPrivacyControl: undefined });
});
