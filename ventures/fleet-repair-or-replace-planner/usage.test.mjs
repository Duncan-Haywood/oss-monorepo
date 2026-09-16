import test from "node:test";
import assert from "node:assert/strict";

/**
 * A localStorage good enough to prove the point, plus the one thing the real
 * bug depended on: `freshRealm()` re-imports the module with the store intact,
 * which is what a page reload is. Keeping the store and dropping the module
 * state is precisely the distinction the in-memory opt-out failed on.
 */
function installStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
  };
  return store;
}

let realmCounter = 0;
async function freshRealm() {
  // A distinct query string forces a new module instance, so module- and
  // globalThis-scoped state is discarded exactly as it is on a reload.
  delete globalThis.__usageOptOut;
  realmCounter += 1;
  return import(`./usage.mjs?realm=${realmCounter}`);
}

test("counting records events when the visitor has not opted out", async () => {
  installStorage();
  const usage = await freshRealm();
  usage.record("row_added");
  usage.record("row_added");
  usage.record("csv_exported");
  assert.deepEqual(usage.readUsage(), { row_added: 2, csv_exported: 1 });
});

test("opting out clears the counters and stops further counting", async () => {
  installStorage();
  const usage = await freshRealm();
  usage.record("row_added");
  usage.setUsageOptOut(true);
  assert.deepEqual(usage.readUsage(), {}, "existing counters are deleted");
  usage.record("row_added");
  assert.deepEqual(usage.readUsage(), {}, "nothing is counted after opting out");
});

// The regression. Before the fix the opt-out lived only in `globalThis`, so
// this test's second realm counted happily and the footer's switch silently
// reset itself on every visit.
test("the opt-out survives a reload", async () => {
  const store = installStorage();
  const first = await freshRealm();
  first.setUsageOptOut(true);
  assert.equal(store.get("fleet-repair-or-replace-planner-optout"), "1");

  const second = await freshRealm(); // same storage, new realm — a reload
  assert.equal(second.isOptedOut(), true, "the stored opt-out must be read back");
  second.record("row_added");
  assert.deepEqual(second.readUsage(), {}, "a reload must not resume counting");
});

test("the opt-out is stored separately from the counters", async () => {
  // Clearing counters must never be the thing that re-enables collection.
  const store = installStorage();
  const usage = await freshRealm();
  usage.setUsageOptOut(true);
  store.delete("fleet-repair-or-replace-planner-usage");
  assert.equal(usage.isOptedOut(), true);
});

test("opting back in is possible and removes the stored flag", async () => {
  const store = installStorage();
  const usage = await freshRealm();
  usage.setUsageOptOut(true);
  usage.setUsageOptOut(false);
  assert.equal(store.has("fleet-repair-or-replace-planner-optout"), false);
  usage.record("row_added");
  assert.deepEqual(usage.readUsage(), { row_added: 1 });
});

test("a browser that refuses storage is treated as opted out, not as consenting", async () => {
  globalThis.localStorage = {
    getItem() { throw new Error("SecurityError"); },
    setItem() { throw new Error("SecurityError"); },
    removeItem() { throw new Error("SecurityError"); },
  };
  const usage = await freshRealm();
  assert.equal(usage.isOptedOut(), true);
  usage.record("row_added"); // must not throw
  assert.deepEqual(usage.readUsage(), {});
});

test("Do Not Track and Global Privacy Control are honoured without a click", async () => {
  for (const nav of [{ doNotTrack: "1" }, { globalPrivacyControl: true }]) {
    installStorage();
    const usage = await freshRealm();
    const previous = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true });
    try {
      usage.record("row_added");
      assert.deepEqual(usage.readUsage(), {}, `not honoured: ${JSON.stringify(nav)}`);
    } finally {
      Object.defineProperty(globalThis, "navigator", { value: previous, configurable: true });
    }
  }
});

// The visitor clicked a switch advertised as permanent. If only one of the two
// writes can succeed, deleting their existing data is the half worth having.
test("a failed opt-out flag write still clears the counters", async () => {
  const store = new Map([["fleet-repair-or-replace-planner-usage", '{"row_added":3}']]);
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem() { throw new Error("QuotaExceededError"); },
    removeItem: (k) => void store.delete(k),
  };
  const usage = await freshRealm();
  usage.setUsageOptOut(true); // must not throw
  assert.equal(
    store.has("fleet-repair-or-replace-planner-usage"),
    false,
    "counters must be deleted even though the flag could not be stored",
  );
  // And the in-memory guard still holds for this page view.
  usage.record("row_added");
  assert.deepEqual(usage.readUsage(), {});
});

test("a failed counter delete still attempts to store the opt-out flag", async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem(k) {
      if (k === "fleet-repair-or-replace-planner-usage") throw new Error("SecurityError");
      store.delete(k);
    },
  };
  const usage = await freshRealm();
  usage.setUsageOptOut(true);
  assert.equal(
    store.get("fleet-repair-or-replace-planner-optout"),
    "1",
    "the two writes must be independent, not share a try",
  );
});
