const test = require("node:test");
const assert = require("node:assert/strict");

function freshStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

test("usage is disabled when localStorage is unavailable", () => {
  delete require.cache[require.resolve("./usage.js")];
  const usage = require("./usage.js");
  assert.equal(usage.isUsageEnabled(), false);
});

test("recordUsage is a no-op without throwing when disabled", () => {
  delete require.cache[require.resolve("./usage.js")];
  const usage = require("./usage.js");
  assert.doesNotThrow(() => usage.recordUsage("snapshot_compared"));
});

test("setUsageEnabled does not throw without storage", () => {
  delete require.cache[require.resolve("./usage.js")];
  const usage = require("./usage.js");
  assert.doesNotThrow(() => usage.setUsageEnabled(false));
  assert.doesNotThrow(() => usage.setUsageEnabled(true));
});

test("STORAGE_KEY and OPT_OUT_KEY are venture-scoped", () => {
  delete require.cache[require.resolve("./usage.js")];
  const usage = require("./usage.js");
  assert.match(usage.STORAGE_KEY, /^vendor-change-evidence:/);
  assert.match(usage.OPT_OUT_KEY, /^vendor-change-evidence:/);
});

test("records and toggles events when storage is present", () => {
  const originalHasLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const originalHasNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  globalThis.localStorage = freshStorage();
  globalThis.navigator = {};
  delete require.cache[require.resolve("./usage.js")];
  const usage = require("./usage.js");
  try {
    assert.equal(usage.isUsageEnabled(), true);
    usage.recordUsage("snapshot_compared");
    const stored = JSON.parse(globalThis.localStorage.getItem(usage.STORAGE_KEY));
    assert.equal(Object.values(stored)[0], 1);
    usage.setUsageEnabled(false);
    assert.equal(usage.isUsageEnabled(), false);
  } finally {
    if (originalHasLocalStorage) Object.defineProperty(globalThis, "localStorage", originalHasLocalStorage);
    else delete globalThis.localStorage;
    if (originalHasNavigator) Object.defineProperty(globalThis, "navigator", originalHasNavigator);
    else delete globalThis.navigator;
    delete require.cache[require.resolve("./usage.js")];
  }
});
