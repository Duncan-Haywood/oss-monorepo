import assert from "node:assert/strict";
import { test } from "node:test";
import { CHANNEL_PRESETS } from "./calc.mjs";
import { decodeComparison, encodeComparison } from "./share.mjs";

test("round-trips shared inputs and channel overrides", () => {
  const shared = { price: "48", itemCost: "14", monthlyOrders: "100", includeSubscription: false };
  const channels = CHANNEL_PRESETS.map((channel) => ({ ...channel, price: channel.id === "etsy" ? "62" : undefined }));
  const restored = decodeComparison(encodeComparison(shared, channels));
  assert.deepEqual(restored.shared, { price: 48, itemCost: 14, monthlyOrders: 100 });
  assert.equal(restored.includeSubscription, false);
  assert.equal(restored.channels.find((channel) => channel.id === "etsy").price, 62);
  assert.equal(restored.channels.find((channel) => channel.id === "other").enabled, false);
});

test("ignores unknown fields and malformed links", () => {
  const restored = decodeComparison(encodeURIComponent(JSON.stringify({
    shared: { price: 10, secret: "do not copy", itemCost: -2 },
    channels: [{ id: "ebay", values: { commissionRate: 13, secret: "no" } }],
  })));
  assert.deepEqual(restored.shared, { price: 10 });
  assert.deepEqual(restored.channels[0], { id: "ebay", enabled: true, commissionRate: 13 });
  assert.equal(decodeComparison("not-json"), null);
});

test("drops hostile and invalid channel values before they reach the page", () => {
  const restored = decodeComparison(encodeURIComponent(JSON.stringify({
    channels: [{
      id: "etsy",
      values: {
        price: '"><img src=x onerror=alert(1)>',
        commissionRate: "6.5",
        paymentRate: -1,
        paymentFixed: "not-a-number",
      },
    }],
  })));

  assert.deepEqual(restored.channels[0], {
    id: "etsy",
    enabled: true,
    commissionRate: 6.5,
  });
});

test("does not turn null, empty, or boolean values into zero", () => {
  const restored = decodeComparison(encodeURIComponent(JSON.stringify({
    shared: { price: null, itemCost: "", monthlyOrders: false },
    channels: [{ id: "other", values: { price: null, commissionRate: true } }],
  })));

  assert.deepEqual(restored.shared, {});
  assert.deepEqual(restored.channels[0], { id: "other", enabled: true });
});
