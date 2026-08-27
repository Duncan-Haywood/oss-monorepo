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
  const stored = JSON.parse(storage.getItem("amazon-fba-usage"));
  assert.equal(stored.listing_profit_calculated, 2);
  assert.ok(stored.last_day);
  assert.deepEqual(Object.keys(stored).sort(), ["last_day", "listing_profit_calculated"]);
});

test("honors opt out", () => {
  const storage = fakeStorage();
  recordUsage(storage, true);
  assert.equal(storage.getItem("amazon-fba-usage"), null);
});

test("records named feature events without storing inputs", () => {
  const storage = fakeStorage();
  recordUsage(storage, false, "fulfillment_path_compared");
  recordUsage(storage, false, "coupon_compared");
  recordUsage(storage, false, "low_price_fba_compared");
  recordUsage(storage, false, "mcf_compared");
  recordUsage(storage, false, "subscribe_save_compared");
  recordUsage(storage, false, "bulk_buy_compared");
  recordUsage(storage, false, "prep_compared");
  recordUsage(storage, false, "seller_plan_compared");
  recordUsage(storage, false, "vine_compared");
  recordUsage(storage, false, "aged_inventory_compared");
  recordUsage(storage, false, "inbound_placement_compared");
  recordUsage(storage, false, "return_rate_calculated");
  recordUsage(storage, false, "storage_season_compared");
  recordUsage(storage, false, "size_tier_packaging_compared");
  recordUsage(storage, false, "sfp_compared");
  recordUsage(storage, false, "low_inventory_compared");
  recordUsage(storage, false, "awd_compared");
  recordUsage(storage, false, "remote_fulfillment_compared");
  recordUsage(storage, false, "liquidation_compared");
  recordUsage(storage, false, "break_even_acos_calculated");
  const stored = JSON.parse(storage.getItem("amazon-fba-usage"));
  assert.equal(stored.fulfillment_path_compared, 1);
  assert.equal(stored.coupon_compared, 1);
  assert.equal(stored.low_price_fba_compared, 1);
  assert.equal(stored.mcf_compared, 1);
  assert.equal(stored.subscribe_save_compared, 1);
  assert.equal(stored.bulk_buy_compared, 1);
  assert.equal(stored.prep_compared, 1);
  assert.equal(stored.seller_plan_compared, 1);
  assert.equal(stored.vine_compared, 1);
  assert.equal(stored.aged_inventory_compared, 1);
  assert.equal(stored.inbound_placement_compared, 1);
  assert.equal(stored.return_rate_calculated, 1);
  assert.equal(stored.storage_season_compared, 1);
  assert.equal(stored.size_tier_packaging_compared, 1);
  assert.equal(stored.sfp_compared, 1);
  assert.equal(stored.low_inventory_compared, 1);
  assert.equal(stored.awd_compared, 1);
  assert.equal(stored.remote_fulfillment_compared, 1);
  assert.equal(stored.liquidation_compared, 1);
  assert.equal(stored.break_even_acos_calculated, 1);
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
    assert.equal(dntStorage.getItem("amazon-fba-usage"), null);

    const gpcStorage = fakeStorage();
    Object.defineProperty(globalThis, "navigator", {
      value: { globalPrivacyControl: true },
      configurable: true,
    });
    recordUsage(gpcStorage, false);
    assert.equal(gpcStorage.getItem("amazon-fba-usage"), null);
  } finally {
    restore();
  }
});

test("is a no-op without storage", () => {
  assert.doesNotThrow(() => recordUsage(undefined, false));
  assert.doesNotThrow(() => recordUsage(null, false));
});

test("recovers from corrupt local usage data", () => {
  const storage = {
    getItem: () => "not-json",
    setItem: (key, value) => {
      storage.value = JSON.parse(value);
    },
  };
  assert.doesNotThrow(() => recordUsage(storage, false));
  assert.equal(storage.value.listing_profit_calculated, 1);
  assert.ok(storage.value.last_day);
});

test("does not fail when browser storage is unavailable", () => {
  const storage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.doesNotThrow(() => recordUsage(storage, false));
});
