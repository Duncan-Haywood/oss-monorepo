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
  const stored = JSON.parse(storage.getItem("shopify-fee-usage"));
  assert.equal(stored.order_profit_calculated, 2);
  assert.ok(stored.last_day);
  assert.deepEqual(Object.keys(stored).sort(), ["last_day", "order_profit_calculated"]);
});

test("honors opt out", () => {
  const storage = fakeStorage();
  recordUsage(storage, true);
  assert.equal(storage.getItem("shopify-fee-usage"), null);
});

test("records named feature events without storing inputs", () => {
  const storage = fakeStorage();
  recordUsage(storage, false, "payment_path_compared");
  recordUsage(storage, false, "plan_upgrade_compared");
  recordUsage(storage, false, "pos_online_compared");
  recordUsage(storage, false, "shipping_labels_compared");
  recordUsage(storage, false, "shop_pay_installments_compared");
  recordUsage(storage, false, "return_resolution_compared");
  recordUsage(storage, false, "shopify_capital_compared");
  recordUsage(storage, false, "manual_payment_compared");
  recordUsage(storage, false, "chargeback_compared");
  recordUsage(storage, false, "local_delivery_compared");
  recordUsage(storage, false, "gift_card_compared");
  recordUsage(storage, false, "markets_duties_compared");
  recordUsage(storage, false, "abandoned_checkout_compared");
  recordUsage(storage, false, "subscriptions_compared");
  recordUsage(storage, false, "pickup_compared");
  recordUsage(storage, false, "upsell_compared");
  recordUsage(storage, false, "refund_rate_compared");
  recordUsage(storage, false, "promos_compared");
  const stored = JSON.parse(storage.getItem("shopify-fee-usage"));
  assert.equal(stored.payment_path_compared, 1);
  assert.equal(stored.plan_upgrade_compared, 1);
  assert.equal(stored.pos_online_compared, 1);
  assert.equal(stored.shipping_labels_compared, 1);
  assert.equal(stored.shop_pay_installments_compared, 1);
  assert.equal(stored.return_resolution_compared, 1);
  assert.equal(stored.shopify_capital_compared, 1);
  assert.equal(stored.manual_payment_compared, 1);
  assert.equal(stored.chargeback_compared, 1);
  assert.equal(stored.local_delivery_compared, 1);
  assert.equal(stored.gift_card_compared, 1);
  assert.equal(stored.markets_duties_compared, 1);
  assert.equal(stored.abandoned_checkout_compared, 1);
  assert.equal(stored.subscriptions_compared, 1);
  assert.equal(stored.pickup_compared, 1);
  assert.equal(stored.upsell_compared, 1);
  assert.equal(stored.refund_rate_compared, 1);
  assert.equal(stored.promos_compared, 1);
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
    assert.equal(dntStorage.getItem("shopify-fee-usage"), null);

    const gpcStorage = fakeStorage();
    Object.defineProperty(globalThis, "navigator", {
      value: { globalPrivacyControl: true },
      configurable: true,
    });
    recordUsage(gpcStorage, false);
    assert.equal(gpcStorage.getItem("shopify-fee-usage"), null);
  } finally {
    restore();
  }
});

test("is a no-op without storage", () => {
  assert.doesNotThrow(() => recordUsage(undefined, false));
  assert.doesNotThrow(() => recordUsage(null, false));
});
