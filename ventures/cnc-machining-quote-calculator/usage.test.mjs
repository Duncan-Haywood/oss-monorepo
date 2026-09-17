import { test } from "node:test";
import assert from "node:assert/strict";

import {
  OPT_OUT_KEY,
  USAGE_KEY,
  readUsage,
  recordUsage,
  setUsageOptOut,
  usageOptedOut,
} from "./usage.mjs";

/** A minimal in-memory stand-in for `localStorage`. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get size() {
      return map.size;
    },
    keys: () => [...map.keys()],
  };
}

/** A storage that throws on every access — Safari private mode, or a browser
 *  with site data blocked. The counter must never take the page down with it. */
function hostileStorage() {
  return {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
    removeItem() {
      throw new Error("denied");
    },
  };
}

test("a recorded event increments a count and stamps the day", () => {
  const storage = fakeStorage();
  recordUsage("quote", storage);
  recordUsage("quote", storage);
  recordUsage("example_loaded", storage);
  const usage = readUsage(storage);
  assert.equal(usage.quote, 2);
  assert.equal(usage.example_loaded, 1);
  assert.match(usage.last_day, /^\d{4}-\d{2}-\d{2}$/);
});

test("the default event name is recorded when none is given", () => {
  const storage = fakeStorage();
  recordUsage(undefined, storage);
  assert.equal(readUsage(storage).quote, 1);
});

test("nothing but event names, counts and a day is ever stored", () => {
  const storage = fakeStorage();
  recordUsage("quote", storage);
  const raw = storage.getItem(USAGE_KEY);
  const parsed = JSON.parse(raw);
  for (const [key, value] of Object.entries(parsed)) {
    if (key === "last_day") {
      assert.match(value, /^\d{4}-\d{2}-\d{2}$/);
    } else {
      assert.equal(typeof value, "number", `${key} should be a count`);
    }
  }
  // No input of the calculator's can appear in the payload.
  for (const forbidden of ["wage", "rate", "cost", "price", "cycle", "margin", "part"]) {
    assert.doesNotMatch(raw, new RegExp(forbidden, "i"), `"${forbidden}" leaked into storage`);
  }
});

test("opting out stops counting and clears what was already counted", () => {
  const storage = fakeStorage();
  recordUsage("quote", storage);
  assert.equal(readUsage(storage).quote, 1);

  setUsageOptOut(true, storage);
  assert.ok(usageOptedOut(storage));
  assert.deepEqual(readUsage(storage), {}, "the existing count must be deleted, not kept");

  recordUsage("quote", storage);
  assert.deepEqual(readUsage(storage), {}, "nothing is counted while opted out");
});

test("opting back in resumes counting from nothing", () => {
  const storage = fakeStorage({ [OPT_OUT_KEY]: "1" });
  setUsageOptOut(false, storage);
  assert.ok(!usageOptedOut(storage));
  recordUsage("quote", storage);
  assert.equal(readUsage(storage).quote, 1);
});

test("Do Not Track and Global Privacy Control switch counting off on their own", () => {
  // `globalThis.navigator` is getter-only under Node 22, so it is swapped with
  // a property descriptor rather than an assignment, and restored either way.
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const stand = (value) =>
    Object.defineProperty(globalThis, "navigator", { value, configurable: true, writable: true });
  try {
    const storage = fakeStorage();

    stand({ doNotTrack: "1" });
    assert.ok(usageOptedOut(storage));
    recordUsage("quote", storage);
    assert.deepEqual(readUsage(storage), {}, "Do Not Track must suppress counting");

    stand({ globalPrivacyControl: true });
    assert.ok(usageOptedOut(storage));
    recordUsage("quote", storage);
    assert.deepEqual(readUsage(storage), {}, "GPC must suppress counting");

    // And a browser signalling neither is counted as normal.
    stand({ doNotTrack: "0" });
    assert.ok(!usageOptedOut(storage));
    recordUsage("quote", storage);
    assert.equal(readUsage(storage).quote, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete globalThis.navigator;
  }
});

test("corrupt stored JSON is replaced rather than thrown over", () => {
  const storage = fakeStorage({ [USAGE_KEY]: "{not json" });
  assert.deepEqual(readUsage(storage), {});
  recordUsage("quote", storage);
  assert.equal(readUsage(storage).quote, 1);
});

test("a stored array or scalar is discarded rather than counted into", () => {
  for (const junk of ["[1,2,3]", '"a string"', "42", "null"]) {
    const storage = fakeStorage({ [USAGE_KEY]: junk });
    assert.deepEqual(readUsage(storage), {}, `${junk} should read as empty`);
    recordUsage("quote", storage);
    assert.equal(readUsage(storage).quote, 1, `${junk} should be replaced`);
  }
});

test("a storage that throws never takes the page down", () => {
  const storage = hostileStorage();
  assert.doesNotThrow(() => recordUsage("quote", storage));
  assert.doesNotThrow(() => setUsageOptOut(true, storage));
  assert.doesNotThrow(() => usageOptedOut(storage));
  assert.deepEqual(readUsage(storage), {});
});

test("no storage at all is handled without throwing", () => {
  assert.doesNotThrow(() => recordUsage("quote", null));
  assert.doesNotThrow(() => setUsageOptOut(true, null));
  assert.deepEqual(readUsage(null), {});
});

test("the storage keys are namespaced to this venture", () => {
  assert.match(USAGE_KEY, /^cnc-machining-quote-/);
  assert.match(OPT_OUT_KEY, /^cnc-machining-quote-/);
  assert.notEqual(USAGE_KEY, OPT_OUT_KEY);
});
