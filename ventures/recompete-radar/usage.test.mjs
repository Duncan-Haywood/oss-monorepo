import { test } from "node:test";
import assert from "node:assert/strict";
import { USAGE_KEY, recordUsage } from "./usage.mjs";

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    read: () => JSON.parse(map.get(USAGE_KEY) || "{}"),
  };
}

test("counts an event and the day, and nothing else", () => {
  const storage = fakeStorage();
  recordUsage(storage, false, "search_run");
  const stored = storage.read();
  assert.equal(stored.search_run, 1);
  assert.match(stored.last_day, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(stored).sort(), ["last_day", "search_run"]);
});

test("increments rather than overwriting", () => {
  const storage = fakeStorage();
  recordUsage(storage, false, "search_run");
  recordUsage(storage, false, "search_run");
  recordUsage(storage, false, "comparison_copied");
  assert.equal(storage.read().search_run, 2);
  assert.equal(storage.read().comparison_copied, 1);
});

test("an opted-out visitor is not counted", () => {
  const storage = fakeStorage();
  recordUsage(storage, true, "search_run");
  assert.equal(storage.getItem(USAGE_KEY), null);
});

test("missing storage is a no-op rather than a crash", () => {
  assert.doesNotThrow(() => recordUsage(null, false, "search_run"));
  assert.doesNotThrow(() => recordUsage(undefined, false, "search_run"));
});

test("storage that throws does not take the calculator down with it", () => {
  const hostile = {
    getItem() {
      throw new Error("blocked by site settings");
    },
    setItem() {
      throw new Error("blocked by site settings");
    },
  };
  assert.doesNotThrow(() => recordUsage(hostile, false, "search_run"));
});

test("corrupt stored JSON does not throw into the page", () => {
  const storage = fakeStorage({ [USAGE_KEY]: "{not json" });
  assert.doesNotThrow(() => recordUsage(storage, false, "search_run"));
});

test("Do Not Track and Global Privacy Control suppress counting", () => {
  const original = globalThis.navigator;
  try {
    for (const signal of [{ doNotTrack: "1" }, { globalPrivacyControl: true }]) {
      const storage = fakeStorage();
      Object.defineProperty(globalThis, "navigator", { value: signal, configurable: true });
      recordUsage(storage, false, "search_run");
      assert.equal(storage.getItem(USAGE_KEY), null, `${JSON.stringify(signal)} was not honored`);
    }
  } finally {
    if (original === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, "navigator", { value: original, configurable: true });
  }
});
