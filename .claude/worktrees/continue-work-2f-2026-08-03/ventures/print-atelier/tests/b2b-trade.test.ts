import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getB2BTier,
  calculateVolumeBonusPct,
  calculateB2BQuote,
  B2BQuoteItem,
} from "../src/lib/b2b-trade.js";

test("correctly maps annual spend to trade program tiers", () => {
  assert.equal(getB2BTier(0).tier, "member");
  assert.equal(getB2BTier(4999).tier, "member");
  assert.equal(getB2BTier(5000).tier, "preferred");
  assert.equal(getB2BTier(19999).tier, "preferred");
  assert.equal(getB2BTier(20000).tier, "vip");
  assert.equal(getB2BTier(50000).tier, "executive");
  assert.equal(getB2BTier(100000).tier, "executive");
});

test("calculates volume bonuses for large orders", () => {
  assert.equal(calculateVolumeBonusPct(5, 500), 0);
  assert.equal(calculateVolumeBonusPct(10, 2500), 1.5);
  assert.equal(calculateVolumeBonusPct(20, 4000), 3);
  assert.equal(calculateVolumeBonusPct(50, 12000), 5);
});

test("calculates B2B quotes accurately while protecting 30% artist net profit", () => {
  const sampleItems: B2BQuoteItem[] = [
    { sku: "PRINT-001", title: "Midnight Coast", retailPrice: 100, podCost: 30, quantity: 10 },
    { sku: "PRINT-002", title: "Desert Sun", retailPrice: 200, podCost: 50, quantity: 5 },
  ];

  const quote = calculateB2BQuote({
    annualSpendToDate: 10000,
    items: sampleItems,
  });

  assert.equal(quote.tier.tier, "preferred");
  assert.equal(quote.totalRetail, 2000);
  assert.equal(quote.effectiveDiscountPct, 26.5);
  assert.equal(quote.subtotalTrade, 1470);
  assert.equal(quote.totalPodCost, 550);
  assert.equal(quote.artistPayoutTotal, 276);
  assert.equal(quote.platformNetMargin, 644);
  assert.equal(quote.marginSafe, true);
  assert.equal(quote.freeShippingEligible, true);
  assert.equal(quote.finalShipping, 0);
});

test("enforces maximum discount cap of 40%", () => {
  const quote = calculateB2BQuote({
    annualSpendToDate: 60000,
    items: [{ sku: "P1", title: "Art", retailPrice: 200, podCost: 40, quantity: 60 }],
  });

  assert.equal(quote.effectiveDiscountPct, 40);
});
