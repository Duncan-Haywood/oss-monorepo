import { test } from "node:test";
import assert from "node:assert/strict";
import { CHANNEL_PRESETS, calculateChannel } from "./calc.mjs";
import { maxBuyPriceForChannel, maxBuyPrices } from "./sourcing.mjs";

const shared = { price: "60", shippingCharged: "0", shippingCost: "8", packagingCost: "1", otherCost: "0", monthlyOrders: "10" };
const channels = () => CHANNEL_PRESETS.map((c) => ({ ...c }));

test("paying the ceiling reaches the target and one more cent does not", () => {
  for (const channel of channels().filter((c) => c.enabled !== false)) {
    for (const target of [0, 10, 25]) {
      const max = maxBuyPriceForChannel(channel, shared, target);
      if (max === null) continue;
      const at = calculateChannel(channel, { ...shared, itemCost: max }).expectedProfit;
      const over = calculateChannel(channel, { ...shared, itemCost: max + 0.02 }).expectedProfit;
      assert.ok(at >= target - 1e-6, `${channel.id} at ${max}: ${at} < ${target}`);
      assert.ok(over < target, `${channel.id} still reaches ${target} at ${max + 0.02}`);
    }
  }
});

test("a higher target lowers the ceiling", () => {
  const ebay = channels().find((c) => c.id === "ebay");
  assert.ok(maxBuyPriceForChannel(ebay, shared, 5) > maxBuyPriceForChannel(ebay, shared, 20));
});

test("null when the channel cannot reach the target even for a free item", () => {
  const ebay = channels().find((c) => c.id === "ebay");
  assert.equal(maxBuyPriceForChannel(ebay, { ...shared, price: "5" }, 500), null);
});

test("turning returns off uses sold-sale profit", () => {
  const ebay = channels().find((c) => c.id === "ebay");
  const withReturns = maxBuyPriceForChannel(ebay, shared, 10);
  const without = maxBuyPriceForChannel(ebay, { ...shared, includeReturns: false }, 10);
  assert.ok(without >= withReturns);
});

test("rows come back best first and skip switched-off channels", () => {
  const list = channels();
  list[0].enabled = false;
  const out = maxBuyPrices(list, shared, 10);
  assert.ok(!out.rows.some((r) => r.id === list[0].id));
  for (let i = 1; i < out.rows.length; i += 1) assert.ok((out.rows[i - 1].maxBuy ?? -1) >= (out.rows[i].maxBuy ?? -1));
  assert.equal(out.best, out.rows[0]);
  assert.throws(() => maxBuyPrices(list.map((c) => ({ ...c, enabled: false })), shared, 10));
});

test("a non-numeric target is rejected", () => {
  assert.throws(() => maxBuyPriceForChannel(channels()[0], shared, "abc"));
});
