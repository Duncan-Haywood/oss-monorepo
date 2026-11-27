import { test } from "node:test";
import assert from "node:assert/strict";
import { record, readUsage, setUsageOptOut, usageOptedOut } from "./usage.mjs";

// Property test for the usage counter: random sequences of record, opt out and
// opt in over a fake store, with prototype-key event names, hostile stored
// JSON and a store that throws. Counts equal the events recorded while not
// opted out; an opted-out visitor leaves no counters and no new ones; a bad
// store never throws and is never read as consent.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const NAMES = ["takeoff_run", "example_loaded", "constructor", "__proto__", "toString", "hasOwnProperty", "a b", ""];

function fakeStorage(init = {}) {
  const store = new Map(Object.entries(init));
  return {
    store,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}
function reset(storage) {
  globalThis.localStorage = storage;
  globalThis.__usageOptOut = false;
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
}

test("random record/opt-out sequences keep exact counts", () => {
  const rand = rng(20261102);
  for (let run = 0; run < 300; run++) {
    reset(fakeStorage());
    const expected = new Map();
    let off = false;
    for (let step = 0; step < 30; step++) {
      const x = rand();
      if (x < 0.1) { off = true; setUsageOptOut(true); expected.clear(); }
      else if (x < 0.2) { off = false; setUsageOptOut(false); }
      else {
        const name = NAMES[Math.floor(rand() * NAMES.length)];
        record(name);
        if (!off) expected.set(name, (expected.get(name) || 0) + 1);
      }
      assert.equal(usageOptedOut(), off);
      const got = readUsage();
      assert.equal(Object.keys(got).length, expected.size, `run ${run} step ${step}`);
      for (const [k, v] of expected) {
        assert.ok(Object.prototype.hasOwnProperty.call(got, k), `${k} missing`);
        assert.equal(got[k], v);
      }
      if (off) assert.deepEqual(Object.keys(got), []);
    }
  }
});

test("hostile stored JSON never throws and counting restarts cleanly", () => {
  const junk = ["", "null", "[]", "[1,2]", "7", '"x"', "{", "{\"a\":\"NaN\"}", "{\"takeoff_run\":null}", "{\"takeoff_run\":1e999}", "\u0000"];
  for (const raw of junk) {
    reset(fakeStorage({ "wall-framing-takeoff-usage": raw }));
    assert.doesNotThrow(() => readUsage());
    const before = readUsage();
    assert.ok(before && typeof before === "object" && !Array.isArray(before));
    assert.doesNotThrow(() => record("takeoff_run"));
    const after = readUsage();
    assert.equal(Number.isFinite(after.takeoff_run), true, raw);
    assert.ok(after.takeoff_run >= 1);
  }
});

test("a store that throws on every call is never read as consent or a crash", () => {
  const boom = () => { throw new Error("blocked"); };
  reset({ getItem: boom, setItem: boom, removeItem: boom });
  assert.doesNotThrow(() => record("takeoff_run"));
  assert.deepEqual(readUsage(), {});
  assert.doesNotThrow(() => setUsageOptOut(true));
  assert.equal(usageOptedOut(), true);
  assert.doesNotThrow(() => setUsageOptOut(false));
  assert.equal(usageOptedOut(), false);
});

test("do-not-track and global privacy control stop counting", () => {
  for (const nav of [{ doNotTrack: "1" }, { globalPrivacyControl: true }]) {
    reset(fakeStorage());
    Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true });
    record("takeoff_run");
    assert.deepEqual(readUsage(), {});
  }
});

test("an opt-out survives a fresh page load", () => {
  const s = fakeStorage();
  reset(s);
  setUsageOptOut(true);
  globalThis.__usageOptOut = false; // new realm: only the stored key remains
  assert.equal(usageOptedOut(), true);
  record("takeoff_run");
  assert.deepEqual(readUsage(), {});
});
