import test from "node:test";
import assert from "node:assert/strict";
import {
  recordUsage,
  readUsage,
  setUsageOptOut,
  usageOptedOut,
  USAGE_KEY,
  OPT_OUT_KEY,
} from "./usage.mjs";

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("counts a named event and the day, and nothing else", () => {
  const storage = fakeStorage();
  recordUsage("estimate", storage);
  const stored = JSON.parse(storage.values.get(USAGE_KEY));
  assert.equal(stored.estimate, 1);
  assert.match(stored.last_day, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(stored).sort(), ["estimate", "last_day"]);
});

test("increments across events without mixing them up", () => {
  const storage = fakeStorage();
  recordUsage("estimate", storage);
  recordUsage("estimate", storage);
  recordUsage("example_loaded", storage);
  recordUsage("inputs_saved", storage);
  const stored = readUsage(storage);
  assert.equal(stored.estimate, 2);
  assert.equal(stored.example_loaded, 1);
  assert.equal(stored.inputs_saved, 1);
});

test("opting out stops counting and clears what was already counted", () => {
  const storage = fakeStorage();
  recordUsage("estimate", storage);
  setUsageOptOut(true, storage);
  recordUsage("estimate", storage);
  assert.equal(usageOptedOut(storage), true);
  assert.equal(storage.values.has(USAGE_KEY), false);
  assert.deepEqual(readUsage(storage), {});
});

test("the opt-out survives a reload, and can be turned back on", () => {
  const storage = fakeStorage({ [OPT_OUT_KEY]: "1" });
  assert.equal(usageOptedOut(storage), true);
  recordUsage("estimate", storage);
  assert.equal(storage.values.has(USAGE_KEY), false);
  setUsageOptOut(false, storage);
  recordUsage("estimate", storage);
  assert.equal(readUsage(storage).estimate, 1);
});

test("Do Not Track and Global Privacy Control switch counting off on their own", () => {
  const storage = fakeStorage();
  // node's own `navigator` is a getter-only accessor, so this stands one in
  // through the property descriptor and puts the original back afterwards.
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const stand = (value) =>
    Object.defineProperty(globalThis, "navigator", { value, configurable: true, writable: true });
  try {
    stand({ doNotTrack: "1" });
    recordUsage("estimate", storage);
    assert.equal(storage.values.has(USAGE_KEY), false);

    stand({ globalPrivacyControl: true });
    recordUsage("estimate", storage);
    assert.equal(storage.values.has(USAGE_KEY), false);

    stand({ doNotTrack: "0" });
    recordUsage("estimate", storage);
    assert.equal(readUsage(storage).estimate, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete globalThis.navigator;
  }
});

test("no storage, or a storage that throws, is a no-op rather than a crash", () => {
  assert.doesNotThrow(() => recordUsage("estimate", null));
  assert.doesNotThrow(() => setUsageOptOut(true, null));
  const hostile = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.doesNotThrow(() => recordUsage("estimate", hostile));
  assert.deepEqual(readUsage(hostile), {});
});

test("corrupt stored counters are replaced rather than propagated", () => {
  const storage = fakeStorage({ [USAGE_KEY]: "not json" });
  recordUsage("estimate", storage);
  assert.equal(readUsage(storage).estimate, 1);

  const arrayed = fakeStorage({ [USAGE_KEY]: "[1,2,3]" });
  recordUsage("estimate", arrayed);
  assert.equal(readUsage(arrayed).estimate, 1);
});
