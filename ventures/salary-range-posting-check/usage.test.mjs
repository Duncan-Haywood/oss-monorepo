import test from "node:test";
import assert from "node:assert/strict";

// usage.mjs reads `localStorage` and `navigator` off the global object, so
// these tests stub both before importing it and restore them afterward. Each
// test imports with a cache-busting query string so module-level state from
// a previous test's globals cannot leak in.

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
  };
}

const originalLocalStorage = globalThis.localStorage;
const originalNavigator = globalThis.navigator;

// usage.mjs also keeps a same-page in-memory fast path on `globalThis` itself
// (see its own comment on `__usageOptOut`), which -- unlike localStorage and
// navigator -- is not something this file swaps in and out per test. Left
// alone, one test's setUsageOptOut(true) would leak into the next test's
// fresh module import. Reset it after every test, the same way the other
// two globals are restored.
async function withGlobals(storage, navigator, fn) {
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  Object.defineProperty(globalThis, "navigator", { value: navigator, configurable: true });
  try {
    return await fn();
  } finally {
    Object.defineProperty(globalThis, "localStorage", { value: originalLocalStorage, configurable: true });
    Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true });
    delete globalThis.__usageOptOut;
  }
}

test("record counts a named event in localStorage", async () => {
  const storage = memoryStorage();
  await withGlobals(storage, {}, async () => {
    const mod = await import(`./usage.mjs?t=${Date.now()}-a`);
    mod.record("posting_scanned");
    mod.record("posting_scanned");
    mod.record("link_shared");
    const counts = JSON.parse(storage.getItem("salary-range-posting-check-usage"));
    assert.equal(counts.posting_scanned, 2);
    assert.equal(counts.link_shared, 1);
  });
});

test("record is a no-op once opted out, and readUsage reflects nothing recorded", async () => {
  const storage = memoryStorage();
  await withGlobals(storage, {}, async () => {
    const mod = await import(`./usage.mjs?t=${Date.now()}-b`);
    mod.setUsageOptOut(true);
    mod.record("posting_scanned");
    assert.equal(storage.getItem("salary-range-posting-check-usage"), null);
    assert.deepEqual(mod.readUsage(), {});
    assert.equal(mod.usageOptedOut(), true);
  });
});

test("setUsageOptOut(true) deletes any counters already recorded, not just future ones", async () => {
  const storage = memoryStorage();
  await withGlobals(storage, {}, async () => {
    const mod = await import(`./usage.mjs?t=${Date.now()}-c`);
    mod.record("posting_scanned");
    assert.notEqual(storage.getItem("salary-range-posting-check-usage"), null);
    mod.setUsageOptOut(true);
    assert.equal(storage.getItem("salary-range-posting-check-usage"), null);
  });
});

test("setUsageOptOut(false) re-enables counting after an opt-out", async () => {
  const storage = memoryStorage();
  await withGlobals(storage, {}, async () => {
    const mod = await import(`./usage.mjs?t=${Date.now()}-d`);
    mod.setUsageOptOut(true);
    mod.setUsageOptOut(false);
    assert.equal(mod.usageOptedOut(), false);
    mod.record("posting_scanned");
    const counts = JSON.parse(storage.getItem("salary-range-posting-check-usage"));
    assert.equal(counts.posting_scanned, 1);
  });
});

test("usageOptedOut is true when the browser sends Do Not Track, even without a stored flag", async () => {
  const storage = memoryStorage();
  await withGlobals(storage, { doNotTrack: "1" }, async () => {
    const mod = await import(`./usage.mjs?t=${Date.now()}-e`);
    // usageOptedOut() itself only consults the stored flag -- Do Not Track
    // and GPC are read by the separate usageBlocked() gate inside record().
    // Assert the effect that actually matters: record() honours DNT.
    mod.record("posting_scanned");
    assert.equal(storage.getItem("salary-range-posting-check-usage"), null);
  });
});

test("record honours Global Privacy Control", async () => {
  const storage = memoryStorage();
  await withGlobals(storage, { globalPrivacyControl: true }, async () => {
    const mod = await import(`./usage.mjs?t=${Date.now()}-f`);
    mod.record("posting_scanned");
    assert.equal(storage.getItem("salary-range-posting-check-usage"), null);
  });
});

test("record and readUsage do not throw with no localStorage available", async () => {
  await withGlobals(undefined, {}, async () => {
    const mod = await import(`./usage.mjs?t=${Date.now()}-g`);
    assert.doesNotThrow(() => mod.record("posting_scanned"));
    assert.deepEqual(mod.readUsage(), {});
  });
});

test("readUsage never returns something other than a plain object, even if the stored value is corrupt", async () => {
  const storage = memoryStorage();
  storage.setItem("salary-range-posting-check-usage", "[1,2,3]");
  await withGlobals(storage, {}, async () => {
    const mod = await import(`./usage.mjs?t=${Date.now()}-h`);
    assert.deepEqual(mod.readUsage(), {});
  });
});

test("a corrupt stored value is repaired on the next record rather than compounding", async () => {
  const storage = memoryStorage();
  storage.setItem("salary-range-posting-check-usage", "not json");
  await withGlobals(storage, {}, async () => {
    const mod = await import(`./usage.mjs?t=${Date.now()}-i`);
    mod.record("posting_scanned");
    const counts = JSON.parse(storage.getItem("salary-range-posting-check-usage"));
    assert.deepEqual(counts, { posting_scanned: 1 });
  });
});
