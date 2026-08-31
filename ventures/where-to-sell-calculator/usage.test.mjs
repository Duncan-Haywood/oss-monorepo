import assert from "node:assert/strict";
import { test } from "node:test";
import { readOptOut, readUsage, recordUsage, writeOptOut } from "./usage.mjs";

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

test("counts an event and the day, and nothing else", () => {
  const storage = fakeStorage();
  recordUsage(storage, false, "comparison_calculated");
  recordUsage(storage, false, "comparison_calculated");
  const stored = JSON.parse(storage.data["where-to-sell-usage"]);
  assert.equal(stored.comparison_calculated, 2);
  assert.match(stored.last_day, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(stored).sort(), ["comparison_calculated", "last_day"]);
});

test("distinct events are counted separately", () => {
  const storage = fakeStorage();
  recordUsage(storage, false, "comparison_calculated");
  recordUsage(storage, false, "channel_rates_edited");
  assert.deepEqual(readUsage(storage).comparison_calculated, 1);
  assert.deepEqual(readUsage(storage).channel_rates_edited, 1);
});

test("opting out records nothing", () => {
  const storage = fakeStorage();
  recordUsage(storage, true, "comparison_calculated");
  assert.equal(storage.data["where-to-sell-usage"], undefined);
});

test("a missing storage is not an error", () => {
  assert.doesNotThrow(() => recordUsage(null, false, "comparison_calculated"));
  assert.deepEqual(readUsage(null), {});
});

test("a storage that throws does not break the caller", () => {
  const hostile = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  assert.doesNotThrow(() => recordUsage(hostile, false, "comparison_calculated"));
  assert.deepEqual(readUsage(hostile), {});
  assert.equal(readOptOut(hostile), false);
  assert.doesNotThrow(() => writeOptOut(hostile, true));
});

test("corrupt stored counts are replaced rather than thrown on", () => {
  const storage = fakeStorage({ "where-to-sell-usage": "not json" });
  assert.deepEqual(readUsage(storage), {});
  assert.doesNotThrow(() => recordUsage(storage, false, "comparison_calculated"));
});

test("the opt-out choice persists and clears what was already counted", () => {
  const storage = fakeStorage();
  recordUsage(storage, false, "comparison_calculated");
  assert.equal(readOptOut(storage), false);

  writeOptOut(storage, true);
  assert.equal(readOptOut(storage), true);
  assert.equal(storage.data["where-to-sell-usage"], undefined, "opting out discards existing counts");

  writeOptOut(storage, false);
  assert.equal(readOptOut(storage), false);
});

test("Do Not Track and Global Privacy Control suppress counting", () => {
  const original = globalThis.navigator;
  try {
    for (const signal of [{ doNotTrack: "1" }, { globalPrivacyControl: true }]) {
      const storage = fakeStorage();
      Object.defineProperty(globalThis, "navigator", { value: signal, configurable: true });
      recordUsage(storage, false, "comparison_calculated");
      assert.equal(storage.data["where-to-sell-usage"], undefined, `${JSON.stringify(signal)} must suppress`);
    }
  } finally {
    if (original === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, "navigator", { value: original, configurable: true });
  }
});
