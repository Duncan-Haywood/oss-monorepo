import test from "node:test";
import assert from "node:assert/strict";

// usage.mjs reads `localStorage` and `navigator` off the global object, so
// these tests stub both before importing it and restore them afterward.

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

async function withGlobals(storage, navigator, fn) {
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  Object.defineProperty(globalThis, "navigator", { value: navigator, configurable: true });
  try {
    return await fn();
  } finally {
    Object.defineProperty(globalThis, "localStorage", { value: originalLocalStorage, configurable: true });
    Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true });
  }
}

test("record counts a named event in localStorage", async () => {
  const storage = memoryStorage();
  await withGlobals(storage, {}, async () => {
    const mod = await import(`./usage.mjs?t=${Date.now()}-a`);
    mod.record("calculate_run");
    mod.record("calculate_run");
    mod.record("link_copied");
    const counts = JSON.parse(storage.getItem("youtube-sponsorship-rate-calculator-usage"));
    assert.equal(counts.calculate_run, 2);
    assert.equal(counts.link_copied, 1);
  });
});

test("record is a no-op once opted out", async () => {
  const storage = memoryStorage();
  await withGlobals(storage, {}, async () => {
    const mod = await import(`./usage.mjs?t=${Date.now()}-b`);
    mod.setUsageOptOut(true);
    mod.record("calculate_run");
    assert.equal(storage.getItem("youtube-sponsorship-rate-calculator-usage"), null);
    assert.equal(mod.usageOptedOut(), true);
  });
});

test("usageOptedOut is true when the browser sends Do Not Track", async () => {
  const storage = memoryStorage();
  await withGlobals(storage, { doNotTrack: "1" }, async () => {
    const mod = await import(`./usage.mjs?t=${Date.now()}-c`);
    mod.record("calculate_run");
    assert.equal(storage.getItem("youtube-sponsorship-rate-calculator-usage"), null);
  });
});

test("record is a no-op when the browser sends Global Privacy Control", async () => {
  const storage = memoryStorage();
  await withGlobals(storage, { globalPrivacyControl: true }, async () => {
    const mod = await import(`./usage.mjs?t=${Date.now()}-d`);
    mod.record("calculate_run");
    assert.equal(storage.getItem("youtube-sponsorship-rate-calculator-usage"), null);
  });
});

test("record does not throw with no localStorage", async () => {
  await withGlobals(undefined, {}, async () => {
    const mod = await import(`./usage.mjs?t=${Date.now()}-e`);
    assert.doesNotThrow(() => mod.record("calculate_run"));
    assert.deepEqual(mod.readUsage(), {});
  });
});

test("setUsageOptOut(false) re-enables counting after an opt-out", async () => {
  const storage = memoryStorage();
  await withGlobals(storage, {}, async () => {
    const mod = await import(`./usage.mjs?t=${Date.now()}-f`);
    mod.setUsageOptOut(true);
    assert.equal(mod.usageOptedOut(), true);
    mod.setUsageOptOut(false);
    assert.equal(mod.usageOptedOut(), false);
    mod.record("calculate_run");
    const counts = JSON.parse(storage.getItem("youtube-sponsorship-rate-calculator-usage"));
    assert.equal(counts.calculate_run, 1);
  });
});

test("no module in this venture can reach the network", async () => {
  // The page's central claim is that nothing is uploaded. That is a property
  // of the source, so it is asserted against the source rather than left to
  // the prose on the page.
  const { readFileSync, readdirSync } = await import("node:fs");
  const here = new URL("./", import.meta.url);
  const modules = readdirSync(here).filter((f) => f.endsWith(".mjs") && !f.endsWith(".test.mjs"));
  assert.ok(modules.length >= 3, "expected calculator.mjs, share.mjs and usage.mjs");
  for (const file of modules) {
    const source = readFileSync(new URL(file, here), "utf8");
    for (const primitive of ["fetch(", "XMLHttpRequest", "navigator.sendBeacon", "WebSocket", "EventSource", "import("]) {
      assert.ok(
        !source.includes(primitive),
        `${file} references ${primitive}, which could move a visitor's figures off the device`,
      );
    }
  }
});
