import test from "node:test";
import assert from "node:assert/strict";

const KEY = "brand-deal-rate-calculator-usage";
const OPT = KEY + "-opt-out";

function fakeStore(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    m,
  };
}

async function load(store, nav) {
  delete globalThis.__usageOptOut;
  if (store) globalThis.localStorage = store; else delete globalThis.localStorage;
  Object.defineProperty(globalThis, "navigator", { value: nav ?? {}, configurable: true, writable: true });
  return import("./usage.mjs?" + Math.random());
}

test("record counts events and readUsage returns them", async () => {
  const s = fakeStore();
  const u = await load(s);
  u.record("calc"); u.record("calc"); u.record("share");
  assert.deepEqual(u.readUsage(), { calc: 2, share: 1 });
});

test("corrupt, array or non-object stored counters are reset", async () => {
  for (const bad of ["{not json", "[1,2]", "null", "5"]) {
    const s = fakeStore({ [KEY]: bad });
    const u = await load(s);
    assert.deepEqual(u.readUsage(), {}, bad);
    u.record("a");
    assert.deepEqual(JSON.parse(s.getItem(KEY)), { a: 1 }, bad);
  }
});

test("do-not-track and global privacy control block recording", async () => {
  for (const nav of [{ doNotTrack: "1" }, { globalPrivacyControl: true }]) {
    const s = fakeStore();
    const u = await load(s, nav);
    u.record("x");
    assert.equal(s.getItem(KEY), null);
  }
  const s = fakeStore();
  const u = await load(s, { doNotTrack: "0" });
  u.record("x");
  assert.deepEqual(u.readUsage(), { x: 1 });
});

test("opt-out removes counters, persists across loads, and can be undone", async () => {
  const s = fakeStore();
  let u = await load(s);
  u.record("x");
  u.setUsageOptOut(true);
  assert.equal(s.getItem(KEY), null);
  assert.equal(s.getItem(OPT), "1");
  u.record("y");
  assert.equal(s.getItem(KEY), null);
  // Next page load: fresh realm, only the stored flag remains.
  u = await load(s);
  assert.equal(u.usageOptedOut(), true);
  u.record("z");
  assert.equal(s.getItem(KEY), null);
  u.setUsageOptOut(false);
  assert.equal(s.getItem(OPT), null);
  u.record("z");
  assert.deepEqual(u.readUsage(), { z: 1 });
});

test("without storage nothing throws and nothing is recorded", async () => {
  const u = await load(null);
  u.record("x");
  assert.deepEqual(u.readUsage(), {});
  u.setUsageOptOut(true);
  assert.equal(u.usageOptedOut(), true);
});

test("a throwing store is never read as consent or a crash", async () => {
  const s = fakeStore();
  s.getItem = () => { throw new Error("blocked"); };
  s.setItem = () => { throw new Error("full"); };
  s.removeItem = () => { throw new Error("blocked"); };
  const u = await load(s);
  assert.equal(u.usageOptedOut(), false);
  u.record("x");
  assert.deepEqual(u.readUsage(), {});
  u.setUsageOptOut(true);
  u.setUsageOptOut(false);
});

test("a localStorage getter that throws (site data blocked) counts as no storage", async () => {
  delete globalThis.__usageOptOut;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() { throw new Error("SecurityError"); },
  });
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true, writable: true });
  const u = await import("./usage.mjs?" + Math.random());
  assert.doesNotThrow(() => u.record("x"));
  assert.deepEqual(u.readUsage(), {});
  assert.doesNotThrow(() => u.setUsageOptOut(true));
  assert.equal(u.usageOptedOut(), true);
  delete globalThis.localStorage;
});
