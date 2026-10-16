import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORY_PRESETS,
  CHANNELS,
  CHANNEL_IDS,
  EXCLUDED_CHANNELS,
  calculateChannel,
  compareChannels,
  compareSummary,
  comparisonText,
  loadItem,
  priceForProfit,
  resolveChannels,
} from "./calc.mjs";

const ITEM = {
  price: 40,
  shippingCharged: 0,
  itemCost: 12,
  shippingCost: 5,
  otherCost: 1,
  monthlyOrders: 50,
  categoryId: "home",
};

test("loads an item and defaults the volume used to spread subscriptions", () => {
  const item = loadItem({ price: 40 });
  assert.equal(item.price, 40);
  assert.equal(item.monthlyOrders, 50);
  assert.equal(item.categoryId, "everything_else");
});

test("a zero or missing monthly order count puts the whole subscription on one order", () => {
  // Not a division by zero, and not silently ignored: a seller who sells
  // nothing on Amazon this month really is carrying the $39.99 alone.
  assert.equal(loadItem({ price: 10, monthlyOrders: 0 }).monthlyOrders, 1);
});

test("rejects negative money and unknown categories rather than computing on them", () => {
  assert.throws(() => loadItem({ price: -1 }), /Item price/);
  assert.throws(() => loadItem({ price: 10, categoryId: "nope" }), /Unknown category/);
});

test("percentage fees are charged on shipping the buyer paid, not just the item", () => {
  const withFreeShipping = loadItem({ ...ITEM, price: 45, shippingCharged: 0 });
  const withPaidShipping = loadItem({ ...ITEM, price: 40, shippingCharged: 5 });
  const ebay = (item) =>
    calculateChannel(resolveChannels(item).find((c) => c.id === "ebay"), item);
  // Same $45 order either way, so eBay's cut is the same either way. A seller
  // who thinks folding postage into the price avoids the fee is wrong, and this
  // is the assertion that keeps the page honest about it.
  assert.equal(ebay(withFreeShipping).percentFee.toFixed(4), ebay(withPaidShipping).percentFee.toFixed(4));
});

test("referral rates follow the category, and differ per marketplace for the same item", () => {
  const jewelry = loadItem({ ...ITEM, categoryId: "jewelry" });
  const resolved = resolveChannels(jewelry);
  const rate = (id) => resolved.find((c) => c.id === id).percentRate;
  assert.equal(rate("amazon"), 20);
  assert.equal(rate("walmart"), 20);
  // eBay and Etsy do not vary by category — that difference is the whole point
  // of running the comparison on a high-referral category.
  assert.equal(rate("ebay"), 13.25);
  assert.equal(rate("etsy"), 9.5);
});

test("an override replaces the default rate without forking the model", () => {
  const item = loadItem(ITEM);
  const resolved = resolveChannels(item, { ebay: 9 });
  assert.equal(resolved.find((c) => c.id === "ebay").percentRate, 9);
  assert.throws(() => resolveChannels(item, { ebay: 100 }), /below 100%/);
});

test("an empty override falls back to the default instead of reading as zero", () => {
  const item = loadItem(ITEM);
  for (const blank of ["", null, undefined]) {
    assert.equal(
      resolveChannels(item, { ebay: blank }).find((c) => c.id === "ebay").percentRate,
      13.25,
      `${JSON.stringify(blank)} must not be read as a 0% fee`,
    );
  }
});

test("eBay arithmetic matches the fee model by hand", () => {
  const item = loadItem(ITEM);
  const row = calculateChannel(resolveChannels(item).find((c) => c.id === "ebay"), item);
  // 40 * 13.25% = 5.30, plus $0.30 fixed, no subscription.
  assert.equal(row.percentFee.toFixed(2), "5.30");
  assert.equal(row.channelFees.toFixed(2), "5.60");
  assert.equal(row.cashInvested.toFixed(2), "18.00");
  assert.equal(row.profit.toFixed(2), "16.40");
  assert.equal(row.margin.toFixed(2), "41.00");
});

test("a subscription is spread over the seller's own volume, not ignored", () => {
  const busy = loadItem({ ...ITEM, monthlyOrders: 100 });
  const quiet = loadItem({ ...ITEM, monthlyOrders: 10 });
  const amazon = (item) =>
    calculateChannel(resolveChannels(item).find((c) => c.id === "amazon"), item);
  assert.equal(amazon(busy).subscriptionPerOrder.toFixed(4), (39.99 / 100).toFixed(4));
  assert.ok(
    amazon(busy).profit > amazon(quiet).profit,
    "the same item must net more on Amazon at higher volume, because the plan fee is spread further",
  );
});

test("marketplace fees stay out of invested cash so ROI stays comparable", () => {
  const item = loadItem(ITEM);
  for (const row of compareChannels(item)) {
    // Poshmark's buyer buys the prepaid label, so the seller's $5 postage is not theirs.
    const expected = row.id === "poshmark" ? "13.00" : "18.00";
    assert.equal(row.cashInvested.toFixed(2), expected, `${row.label} moved the cash basis`);
  }
});

test("Poshmark: flat $2.95 under $15, 20% of the price from $15, postage ignored", () => {
  const posh = (price, extra = {}) =>
    compareChannels(loadItem({ ...ITEM, price, ...extra })).find((row) => row.id === "poshmark");
  assert.equal(posh(10).channelFees.toFixed(2), "2.95");
  assert.equal(posh(14.99).channelFees.toFixed(2), "2.95");
  assert.equal(posh(15).channelFees.toFixed(2), "3.00");
  assert.equal(posh(50).channelFees.toFixed(2), "10.00");
  // Buyer-paid postage is not seller revenue and not commissioned.
  assert.equal(posh(50, { shippingCharged: 9 }).channelFees.toFixed(2), "10.00");
  assert.equal(posh(50, { shippingCharged: 9 }).revenue, 50);
  // Never charge more than the price on a tiny sale.
  assert.equal(posh(2).channelFees.toFixed(2), "2.00");
});

test("Poshmark break-even and parity prices land on the right side of the cliff", () => {
  const poshChannel = CHANNELS.find((c) => c.id === "poshmark");
  const item = loadItem({ ...ITEM, itemCost: 5, shippingCost: 0, otherCost: 0 });
  // Needs 5 net: flat branch gives 7.95, under $15, so that is the answer.
  assert.equal(priceForProfit(poshChannel, item, 0).toFixed(2), "7.95");
  // Needs 12.10 net: flat gives 15.05 (over the cliff), percent gives 15.125.
  assert.equal(priceForProfit(poshChannel, item, 7.1).toFixed(3), "15.125");
  // Needs 12.00 net: flat 14.95 still nets exactly 12.00.
  assert.equal(priceForProfit(poshChannel, item, 7).toFixed(2), "14.95");
  // Needs 40 net: percent branch, 40 / 0.8 = 50.
  assert.equal(priceForProfit(poshChannel, item, 35).toFixed(2), "50.00");
});

test("break-even price is the price at which that channel nets zero", () => {
  const item = loadItem(ITEM);
  for (const row of compareChannels(item)) {
    const atBreakEven = calculateChannel(
      resolveChannels({ ...item, price: row.breakEvenPrice }).find((c) => c.id === row.id),
      { ...item, price: row.breakEvenPrice },
    );
    assert.ok(
      Math.abs(atBreakEven.profit) < 0.01,
      `${row.label} break-even ${row.breakEvenPrice} still nets ${atBreakEven.profit}`,
    );
  }
});

test("the comparison is ranked by net profit and covers every channel", () => {
  const rows = compareChannels(loadItem(ITEM));
  assert.equal(rows.length, CHANNELS.length);
  assert.deepEqual(
    [...rows].map((r) => r.id).sort(),
    [...CHANNEL_IDS].sort(),
  );
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(rows[i - 1].profit >= rows[i].profit, "rows must be ordered best-first");
  }
});

test("identical channels tie in a stable order rather than swapping between runs", () => {
  const item = loadItem(ITEM);
  // Force eBay and TikTok onto the same effective cost, then confirm repeated
  // comparisons agree — a table that reshuffles while a seller reads it is
  // worse than one that is merely approximate.
  const overrides = { tiktok: 13.25 };
  const first = compareChannels(item, overrides).map((r) => r.id);
  const second = compareChannels(item, overrides).map((r) => r.id);
  assert.deepEqual(first, second);
});

test("the summary names the winner, the gap, and the own-store caveat", () => {
  const rows = compareChannels(loadItem(ITEM));
  const summary = compareSummary(rows);
  assert.match(summary, new RegExp(rows[0].label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(summary, /nets the most/);
  if (!rows[0].demandIncluded) assert.match(summary, /sends you no buyers/);
});

test("a channel that sends no buyers always carries that caveat when it wins", () => {
  // Shopify wins on fees for almost any item, which is exactly why the caveat
  // has to be attached to the win rather than left in the small print.
  const rows = compareChannels(loadItem({ ...ITEM, price: 200, itemCost: 40 }));
  if (!rows[0].demandIncluded) {
    assert.match(compareSummary(rows), /no buyers/);
  }
});

test("a near-tie is reported as a tie rather than a ranking", () => {
  const item = loadItem(ITEM);
  const ebayRow = calculateChannel(resolveChannels(item).find((c) => c.id === "ebay"), item);
  // Put TikTok within a few cents of eBay's total cost.
  const overrides = { tiktok: (ebayRow.channelFees / ebayRow.revenue) * 100 - 0.5, shopify: 90 };
  const summary = compareSummary(compareChannels(item, overrides));
  assert.match(summary, /treat them as tied|nets the most/);
});

test("an item that loses money everywhere says so instead of naming a winner", () => {
  const rows = compareChannels(loadItem({ ...ITEM, price: 10, itemCost: 30 }));
  const summary = compareSummary(rows);
  assert.match(summary, /No channel here leaves a profit/);
  assert.doesNotMatch(summary, /nets the most/);
});

test("Faire is excluded with a stated reason and a pointer, not silently dropped", () => {
  assert.ok(EXCLUDED_CHANNELS.length >= 1);
  const faire = EXCLUDED_CHANNELS.find((c) => c.deepTool === "faire-wholesale-calculator");
  assert.ok(faire, "Faire must remain in EXCLUDED_CHANNELS");
  assert.match(faire.why, /wholesale/i);
  assert.equal(faire.deepTool, "faire-wholesale-calculator");
  assert.ok(!CHANNEL_IDS.includes("faire"));
});

test("Whatnot is excluded with a stated reason and a pointer, not silently dropped", () => {
  const whatnot = EXCLUDED_CHANNELS.find((c) => c.deepTool === "whatnot-seller-payout");
  assert.ok(whatnot, "Whatnot must be in EXCLUDED_CHANNELS");
  assert.match(whatnot.why, /livestream|auction|hammer/i);
  assert.equal(whatnot.deepTool, "whatnot-seller-payout");
  assert.ok(!CHANNEL_IDS.includes("whatnot"));
});

test("every channel points at the deep calculator that carries what it cannot", () => {
  for (const channel of CHANNELS) {
    assert.ok(channel.deepTool, `${channel.label} has no deep tool`);
    assert.ok(channel.notCovered, `${channel.label} does not say what it leaves out`);
  }
});

test("the pasteable comparison carries the inputs, the ranking, and the disclaimer", () => {
  const item = loadItem(ITEM);
  const text = comparisonText(item, compareChannels(item), "2026-08-27");
  assert.match(text, /Generated: 2026-08-27/);
  assert.match(text, /Item price: \$40\.00/);
  assert.match(text, /Category: Home & kitchen/);
  assert.match(text, /eBay: net \$/);
  assert.match(text, /not tax, financial, or business advice/);
  assert.match(text, /not a live fee schedule/);
});

test("category presets carry a rate for every category-driven channel", () => {
  for (const [id, preset] of Object.entries(CATEGORY_PRESETS)) {
    assert.ok(preset.label, `${id} has no label`);
    for (const channel of CHANNELS.filter((c) => c.categoryKey)) {
      assert.equal(
        typeof preset[channel.categoryKey],
        "number",
        `${id} has no ${channel.categoryKey} rate`,
      );
    }
  }
});

test("parity price: charging it on a channel nets exactly the best demand channel's profit", () => {
  const item = loadItem(ITEM);
  const rows = compareChannels(item);
  const anchor = rows.filter((r) => r.demandIncluded)[0];
  for (const row of rows) {
    assert.equal(row.parityAnchorLabel, anchor.label);
    const channel = resolveChannels(item).find((c) => c.id === row.id);
    const repriced = calculateChannel(channel, { ...item, price: row.parityPrice });
    assert.ok(Math.abs(repriced.profit - anchor.profit) < 1e-9, row.id);
  }
  assert.ok(Math.abs(rows.find((r) => r.id === anchor.id).parityPrice - item.price) < 1e-9);
});

test("parity price ignores an own-store row that wins on fees but brings no buyers", () => {
  const item = loadItem({ ...ITEM, monthlyOrders: 5000 });
  const rows = compareChannels(item);
  assert.ok(rows.every((r) => r.parityAnchorLabel !== "Your own Shopify store"));
});

test("priceForProfit nets out shipping the buyer paid and floors at zero", () => {
  const item = loadItem({ ...ITEM, shippingCharged: 6 });
  const channel = resolveChannels(item).find((c) => c.id === "ebay");
  const price = priceForProfit(channel, item, 10);
  assert.ok(Math.abs(calculateChannel(channel, { ...item, price }).profit - 10) < 1e-9);
  assert.equal(priceForProfit(channel, loadItem({ price: 1, itemCost: 0, shippingCcharged: 50 }), -100), 0);
});

test("Depop (US) charges 3.3% plus $0.45 on item and buyer-paid shipping, nothing else", () => {
  const item = loadItem({ price: 40, shippingCharged: 6, itemCost: 10 });
  const row = compareChannels(item).find((r) => r.id === "depop");
  assert.ok(row);
  assert.ok(Math.abs(row.channelFees - (46 * 0.033 + 0.45)) < 1e-9);
});

test("Facebook Marketplace shipped fee is 10% but never below $0.80", () => {
  const find = (price) =>
    compareChannels(loadItem({ price, shippingCharged: 0, itemCost: 1 })).find((r) => r.id === "facebook");
  assert.ok(Math.abs(find(50).channelFees - 5) < 1e-9);
  assert.equal(find(5).channelFees, 0.8);
  // Break-even sits on the floor branch for a cheap item: price = 0.80 + cost.
  assert.ok(Math.abs(find(5).breakEvenPrice - 1.8) < 1e-9);
});

test("parity price honours a minimum-fee floor", () => {
  const item = loadItem({ price: 5, itemCost: 1 });
  const channel = resolveChannels(item).find((c) => c.id === "facebook");
  const price = priceForProfit(channel, item, 0.5);
  assert.ok(Math.abs(calculateChannel(channel, { ...item, price }).profit - 0.5) < 1e-9);
});
