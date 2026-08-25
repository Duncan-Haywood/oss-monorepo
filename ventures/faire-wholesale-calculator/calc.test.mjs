import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateBrandOrder,
  calculateRetailerOrder,
  compareBrandScenarios,
  comparePayoutSpeeds,
  compareRetailerLifetime,
  retailPriceForMargin,
  wholesaleForMargin,
} from "./calc.mjs";

const naReorder = {
  unitWholesale: 20,
  quantity: 10,
  unitCogs: 8,
  shippingReimbursement: 15,
  shippingCost: 15,
  region: "north_america",
  payout: "day_60",
};

test("matches Faire's published NA payout formula on a reorder", () => {
  // $200 subtotal, 15% commission, 1.9% + $0.30 processing, $15 shipping back.
  const result = calculateBrandOrder(naReorder, "marketplace_reorder");
  assert.equal(result.orderSubtotal, 200);
  assert.equal(result.fees.commission, 30);
  assert.equal(result.fees.firstOrder, 0);
  assert.equal(result.fees.processing, 4.1);
  assert.equal(result.payoutAmount, 180.9);
  assert.equal(result.profit, 85.9);
});

test("adds the $10 North America new-customer fee only on a first marketplace order", () => {
  const first = calculateBrandOrder(naReorder, "marketplace_first");
  const reorder = calculateBrandOrder(naReorder, "marketplace_reorder");
  assert.equal(first.fees.firstOrder, 10);
  assert.equal(reorder.fees.firstOrder, 0);
  assert.equal(reorder.profit - first.profit, 10);
});

test("outside-NA first orders use the extra 10% instead of a flat $10", () => {
  const result = calculateBrandOrder({ ...naReorder, region: "outside_na" }, "marketplace_first");
  assert.equal(result.fees.commission, 30);
  assert.equal(result.fees.firstOrder, 20);
  assert.equal(result.commissionRate, 15);
  assert.equal(result.firstOrderExtraRate, 10);
});

test("Faire Direct zeros commission and the new-customer fee but still processes payment", () => {
  const result = calculateBrandOrder(naReorder, "faire_direct");
  assert.equal(result.fees.commission, 0);
  assert.equal(result.fees.firstOrder, 0);
  assert.equal(result.fees.processing, 4.1);
  assert.equal(result.profit, 115.9);
});

test("own invoice zeros Faire fees so a brand can compare keeping the account off-platform", () => {
  const result = calculateBrandOrder(naReorder, "own_invoice");
  assert.equal(result.feeTotal, 0);
  assert.equal(result.payoutAmount, 215);
  assert.equal(result.profit, 120);
});

test("brand-funded promotions come off the commission subtotal, matching Faire's wording", () => {
  const result = calculateBrandOrder({ ...naReorder, openingDiscountRate: 20 }, "marketplace_reorder");
  assert.equal(result.orderSubtotal, 160);
  assert.equal(result.fees.commission, 24);
  assert.equal(result.fees.processing, 3.34);
});

test("ranks first-order, reorder, Direct, and own invoice on the same order", () => {
  const comparison = compareBrandScenarios(naReorder);
  assert.equal(comparison.results.length, 4);
  assert.equal(comparison.best.id, "own_invoice");
  const first = comparison.results.find((row) => row.scenario === "marketplace_first");
  assert.ok(first.gapVsBest > 0);
  assert.equal(first.isBest, false);
});

test("payout-speed comparison only changes the processing line", () => {
  const speeds = comparePayoutSpeeds(naReorder);
  assert.equal(speeds.length, 3);
  const nextDay = speeds.find((row) => row.id === "next_day");
  const slow = speeds.find((row) => row.id === "day_60");
  assert.equal(nextDay.fees.commission, slow.fees.commission);
  assert.ok(nextDay.fees.processing > slow.fees.processing);
  assert.ok(slow.profit > nextDay.profit);
});

test("finds the wholesale unit price that hits a target margin on a first order", () => {
  const price = wholesaleForMargin(naReorder, 40, "marketplace_first");
  const result = calculateBrandOrder({ ...naReorder, unitWholesale: price }, "marketplace_first");
  assert.ok(Math.abs(result.margin - 40) < 1e-9);
});

test("rejects impossible target margins", () => {
  assert.throws(() => wholesaleForMargin({ ...naReorder, commissionRate: 50, paymentRate: 40 }, 15), /not possible/);
});

test("rejects negative or non-numeric brand inputs", () => {
  assert.throws(() => calculateBrandOrder({ unitWholesale: -1 }));
  assert.throws(() => calculateBrandOrder({ unitWholesale: 20, quantity: 1.5 }));
  assert.throws(() => calculateBrandOrder({ unitWholesale: "nope" }));
});

test("retailer landed cost treats opening-order discount and unsold units as cash already spent", () => {
  const result = calculateRetailerOrder({
    unitWholesale: 20,
    quantity: 10,
    unitsSold: 8,
    openingDiscountRate: 20,
    shippingPaid: 12,
    unitRetail: 48,
    storePaymentRate: 2.9,
    storePaymentFixed: 0.3,
    otherCost: 0,
  });
  assert.equal(result.invoiceMerchandise, 160);
  assert.equal(result.landedCost, 172);
  assert.equal(result.retailRevenue, 384);
  assert.equal(result.unsoldUnits, 2);
  assert.ok(result.profit < result.retailRevenue - result.invoiceMerchandise);
});

test("finds the retail price that hits a target margin after store processing", () => {
  const input = {
    unitWholesale: 20,
    quantity: 10,
    unitsSold: 10,
    shippingPaid: 10,
    storePaymentRate: 2.9,
    storePaymentFixed: 0.3,
  };
  const price = retailPriceForMargin(input, 50);
  const result = calculateRetailerOrder({ ...input, unitRetail: price });
  assert.ok(Math.abs(result.margin - 50) < 1e-9);
});

test("lifetime view amortizes the first-order fee across expected reorders", () => {
  const life = compareRetailerLifetime(naReorder, 2);
  assert.equal(life.orders, 3);
  assert.equal(life.amortizedFirstOrderFee, 10 / 3);
  const marketplace = life.paths.find((row) => row.label.startsWith("Marketplace"));
  const direct = life.paths.find((row) => row.label.startsWith("Faire Direct"));
  const own = life.paths.find((row) => row.label.startsWith("Own invoice"));
  assert.equal(marketplace.profit, 75.9 + 85.9 * 2);
  assert.equal(direct.profit, 115.9 * 3);
  assert.equal(own.profit, 120 * 3);
  assert.equal(life.best.label, "Own invoice every order");
  assert.equal(life.reordersUntilPositive, 0);
});

test("counts how many reorders recover a loss-making first marketplace order", () => {
  // Reorder profit is first-order profit plus the $10 fee, so a $16 COGS
  // loses on the opening order and clears a few dollars on each reorder.
  const tight = { ...naReorder, unitCogs: 16 };
  const life = compareRetailerLifetime(tight, 0);
  assert.ok(life.first.profit < 0);
  assert.ok(life.reorder.profit > 0);
  assert.equal(life.reordersUntilPositive, Math.ceil(-life.first.profit / life.reorder.profit));
  const recovered = compareRetailerLifetime(tight, life.reordersUntilPositive);
  const marketplace = recovered.paths.find((row) => row.label.startsWith("Marketplace"));
  assert.ok(marketplace.profit >= 0);
});

test("rejects a fractional expected-reorder count", () => {
  assert.throws(() => compareRetailerLifetime(naReorder, 1.5), /whole number/);
});

test("rejects selling more units than the retailer bought", () => {
  assert.throws(
    () => calculateRetailerOrder({ unitWholesale: 20, quantity: 4, unitsSold: 5, unitRetail: 40 }),
    /cannot exceed/,
  );
});
