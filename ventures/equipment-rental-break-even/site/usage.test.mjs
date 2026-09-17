import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { enabled, counts, record, clearAndDisable } from "./usage.mjs";

const app = fs.readFileSync(new URL("./app.mjs", import.meta.url), "utf8");

/** A working localStorage, enough for what usage.mjs asks of it. */
function memoryStore(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get size() {
      return map.size;
    },
  };
}

/**
 * Install a `localStorage`/`navigator` pair for one test and restore after.
 *
 * `throws: true` reproduces the real failure this module exists for: a browser
 * with site data blocked raises on the *property access*, so a bare
 * `localStorage.getItem(...)` throws before any method is called. Defining it
 * as a throwing getter is the only faithful way to model that.
 */
function withEnv({ store, throws = false, navigator: nav = {} }, run) {
  const hadStore = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const hadNav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  if (throws) {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
  } else {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: store, writable: true });
  }
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: nav, writable: true });
  try {
    return run();
  } finally {
    if (hadStore) Object.defineProperty(globalThis, "localStorage", hadStore);
    else delete globalThis.localStorage;
    if (hadNav) Object.defineProperty(globalThis, "navigator", hadNav);
    else delete globalThis.navigator;
  }
}

test("storage that throws on access never throws out of this module", () => {
  withEnv({ throws: true }, () => {
    // Each of these sat on a path that reached the visitor. `record` in
    // particular is called from inside render()'s try block, so a throw here
    // was displayed in the results panel as if the calculation had failed.
    assert.doesNotThrow(() => record("calculation"));
    assert.equal(enabled(), false);
    assert.deepEqual(counts(), {});
    assert.equal(clearAndDisable(), false);
  });
});

test("counting works and accumulates when storage is available", () => {
  const store = memoryStore();
  withEnv({ store }, () => {
    assert.equal(enabled(), true);
    record("calculation");
    record("calculation");
    record("export");
    assert.deepEqual(counts(), { calculation: 2, export: 1 });
  });
});

test("an existing opt-out is honoured and never overwritten by recording", () => {
  const store = memoryStore({ "rental-usage-off": "1" });
  withEnv({ store }, () => {
    assert.equal(enabled(), false);
    record("calculation");
    assert.deepEqual(counts(), {});
  });
});

test("Do Not Track and Global Privacy Control both disable counting", () => {
  for (const nav of [{ doNotTrack: "1" }, { globalPrivacyControl: true }]) {
    const store = memoryStore();
    withEnv({ store, navigator: nav }, () => {
      assert.equal(enabled(), false);
      record("calculation");
      assert.deepEqual(counts(), {});
    });
  }
});

test("a corrupted or non-object stored value reads as no counts, not as garbage", () => {
  // Without the shape check a stored `"[]"` or `"7"` reaches the UI and every
  // `data.calculation || 0` lookup silently reports 0 anyway -- but a stored
  // string would index by character, which is worse than useless.
  for (const bad of ["{not json", "[]", '"a string"', "7", "null"]) {
    const store = memoryStore({ "rental-usage": bad });
    withEnv({ store }, () => assert.deepEqual(counts(), {}, `stored value: ${bad}`));
  }
});

test("a setItem that throws (quota full) loses the count but not the page", () => {
  const store = memoryStore();
  store.setItem = () => {
    throw new DOMException("QuotaExceededError", "QuotaExceededError");
  };
  withEnv({ store }, () => {
    assert.doesNotThrow(() => record("calculation"));
  });
});

test("clearing removes the counts and turns counting off for good", () => {
  const store = memoryStore();
  withEnv({ store }, () => {
    record("calculation");
    assert.deepEqual(counts(), { calculation: 1 });
    assert.equal(clearAndDisable(), true);
    assert.deepEqual(counts(), {});
    assert.equal(enabled(), false);
    // The page's copy says the button turns counting off, so a later event
    // must not quietly start it again.
    record("export");
    assert.deepEqual(counts(), {});
  });
});

test("the storage keys are the ones already in visitors' browsers", () => {
  // Renaming either would reset existing counts and, worse, forget an opt-out
  // someone had chosen -- silently re-enabling counting for them.
  const store = memoryStore();
  withEnv({ store }, () => {
    record("calculation");
    assert.equal(store.getItem("rental-usage"), JSON.stringify({ calculation: 1 }));
    clearAndDisable();
    assert.equal(store.getItem("rental-usage-off"), "1");
  });
});

test("app.mjs routes every storage touch through a guarded helper", () => {
  // The regression this file exists for was unguarded `localStorage` in
  // app.mjs. Only the two drafts helpers may name it, and both wrap it.
  const offenders = app
    .split("\n")
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /localStorage/.test(line) && !line.trim().startsWith("//"))
    .filter(([, line]) => !/^function (drafts|saveDrafts)\(/.test(line.trim()));
  assert.deepEqual(offenders, [], "unguarded localStorage in app.mjs");
  // `enabled` joined the import so `showUsage()` can say whether counting is
  // on at all: it used to print "Local usage: 0 calculations" after the
  // visitor turned counting off, which reads exactly like a visitor who has
  // not used the tool yet.
  assert.match(app, /import \{ record as usage, counts as usageCounts, clearAndDisable, enabled as usageEnabled \} from "\.\/usage\.mjs";/);
  assert.doesNotMatch(app, /localStorage\.removeItem\("rental-usage"\)/);
});
