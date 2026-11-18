import test from "node:test";
import assert from "node:assert/strict";
import { compareChannels, EXAMPLE_CHANNELS } from "./channels.mjs";

const base = { price: 50, landed: 15, shipOut: 5, shipCharged: 0, orders: 100 };

test("own shop: 50 - 15 - 5 - (2.9% of 50 = 1.45 + 0.30) = 28.25 per order, 100 orders less 39", () => {
  const r = compareChannels({ ...base, channels: [EXAMPLE_CHANNELS[0]] });
  assert.equal(r.channels[0].netPerOrder, 28.25);
  assert.equal(r.channels[0].profitPerMonth, 2786); // 2825 - 39
  assert.equal(r.channels[0].feesPerOrder, 1.75);
});

test("large marketplace: 15% of 50 = 7.50 off, net 22.50", () => {
  const r = compareChannels({ ...base, channels: [EXAMPLE_CHANNELS[2]] });
  assert.equal(r.channels[0].netPerOrder, 22.5);
});

test("handmade marketplace: commission 3.25 + payment 1.5+0.25 + 0.20 + ads 0.15*0.15*50=1.125", () => {
  const r = compareChannels({ ...base, channels: [EXAMPLE_CHANNELS[1]] });
  // fees = 3.25 + 1.75 + 0.2 + 1.125 = 6.325 ; net = 30 - 6.325 = 23.675 -> 23.68 (rounded half up of 23.675 float)
  assert.equal(r.channels[0].feesPerOrder, 6.33);
  assert.ok(Math.abs(r.channels[0].netPerOrder - 23.68) <= 0.01);
});

test("shop with subscription beats the 15% marketplace from ceil(39 / 5.75) = 7 orders", () => {
  const r = compareChannels({ ...base, channels: [EXAMPLE_CHANNELS[0], EXAMPLE_CHANNELS[2]] });
  // advantage per order 28.25 - 22.50 = 5.75
  assert.deepEqual(r.crossovers, [{ channel: "Own shop (subscription)", beats: "Large marketplace", fromOrdersPerMonth: 7 }]);
});

test("at 5 orders the commission channel wins, at 100 the shop does", () => {
  const two = [EXAMPLE_CHANNELS[0], EXAMPLE_CHANNELS[2]];
  assert.equal(compareChannels({ ...base, orders: 5, channels: two }).best, "Large marketplace");
  assert.equal(compareChannels({ ...base, orders: 100, channels: two }).best, "Own shop (subscription)");
});

test("price for a 30 target on the 15% channel: net = 0.85p - 20 => p = 50/0.85 = 58.82", () => {
  const r = compareChannels({ ...base, targetProfit: 30, channels: [EXAMPLE_CHANNELS[2]] });
  assert.equal(r.channels[0].priceForTarget, 58.82);
});

test("shipping charged to the buyer adds to payment-fee base", () => {
  const r = compareChannels({ ...base, shipCharged: 6, channels: [EXAMPLE_CHANNELS[0]] });
  // buyer pays 56: 56 - 15 - 5 - (1.624 + 0.3) = 34.076
  assert.equal(r.channels[0].netPerOrder, 34.08);
});

test("refusals", () => {
  assert.ok(compareChannels(null).error);
  assert.ok(compareChannels({ ...base, channels: [] }).error);
  assert.ok(compareChannels({ ...base, price: -1, channels: [EXAMPLE_CHANNELS[0]] }).error);
  assert.ok(compareChannels({ ...base, channels: [{ name: "x", commissionPct: 90 }] }).error);
});
