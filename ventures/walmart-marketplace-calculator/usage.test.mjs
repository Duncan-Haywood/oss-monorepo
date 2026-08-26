import { test } from "node:test";
import assert from "node:assert/strict";
import { recordUsage } from "./usage.mjs";

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
  };
}

test("records only an aggregate local event, never the inputs", () => {
  const storage = fakeStorage();
  recordUsage(storage, false);
  recordUsage(storage, false);
  const stored = JSON.parse(storage.getItem("walmart-marketplace-usage"));
  assert.equal(stored.listing_profit_calculated, 2);
  assert.ok(stored.last_day);
  assert.deepEqual(Object.keys(stored).sort(), ["last_day", "listing_profit_calculated"]);
});

test("honors opt out", () => {
  const storage = fakeStorage();
  recordUsage(storage, true);
  assert.equal(storage.getItem("walmart-marketplace-usage"), null);
});

test("records named feature events without storing inputs", () => {
  const storage = fakeStorage();
  recordUsage(storage, false, "price_match_checked");
  recordUsage(storage, false, "returns_compared");
  recordUsage(storage, false, "aged_wfs_compared");
  recordUsage(storage, false, "ads_compared");
  recordUsage(storage, false, "match_take_compared");
  const stored = JSON.parse(storage.getItem("walmart-marketplace-usage"));
  assert.equal(stored.price_match_checked, 1);
  assert.equal(stored.returns_compared, 1);
  assert.equal(stored.aged_wfs_compared, 1);
  assert.equal(stored.ads_compared, 1);
  assert.equal(stored.match_take_compared, 1);
  assert.ok(stored.last_day);
});

test("honors Do Not Track and Global Privacy Control", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const restore = () => {
    if (previous) Object.defineProperty(globalThis, "navigator", previous);
    else delete globalThis.navigator;
  };
  try {
    const dntStorage = fakeStorage();
    Object.defineProperty(globalThis, "navigator", {
      value: { doNotTrack: "1" },
      configurable: true,
    });
    recordUsage(dntStorage, false);
    assert.equal(dntStorage.getItem("walmart-marketplace-usage"), null);

    const gpcStorage = fakeStorage();
    Object.defineProperty(globalThis, "navigator", {
      value: { globalPrivacyControl: true },
      configurable: true,
    });
    recordUsage(gpcStorage, false);
    assert.equal(gpcStorage.getItem("walmart-marketplace-usage"), null);
  } finally {
    restore();
  }
});

test("is a no-op without storage", () => {
  assert.doesNotThrow(() => recordUsage(undefined, false));
  assert.doesNotThrow(() => recordUsage(null, false));
});
