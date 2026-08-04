import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateB2BTradeQuote,
  resolveB2BTradeTier,
  B2B_TRADE_TIERS,
} from "../src/lib/b2b-trade-calculator.ts";

test("resolveB2BTradeTier selects tier by annual spend volume", () => {
  assert.equal(resolveB2BTradeTier(0).name, "standard");
  assert.equal(resolveB2BTradeTier(4999).name, "standard");
  assert.equal(resolveB2BTradeTier(5000).name, "silver");
  assert.equal(resolveB2BTradeTier(19999).name, "silver");
  assert.equal(resolveB2BTradeTier(20000).name, "gold");
  assert.equal(resolveB2BTradeTier(49999).name, "gold");
  assert.equal(resolveB2BTradeTier(50000).name, "platinum");
  assert.equal(resolveB2BTradeTier(100000).name, "platinum");
});

test("resolveB2BTradeTier honors explicit tier override", () => {
  assert.equal(resolveB2BTradeTier(0, "gold").name, "gold");
  assert.equal(resolveB2BTradeTier(100000, "standard").name, "standard");
});

test("calculateB2BTradeQuote calculates correct trade pricing and savings", () => {
  const quote = calculateB2BTradeQuote({
    quantity: 10,
    unitRetailUsd: 100,
    podCostPerUnitUsd: 20,
    annualSpendUsd: 25000, // Gold Tier (35% discount)
    clientName: "Apex Design Studio",
    projectName: "Grand Hotel Lobby",
  });

  assert.equal(quote.tier.name, "gold");
  assert.equal(quote.effectiveDiscountPct, 35);
  assert.equal(quote.unitRetailUsd, 100);
  assert.equal(quote.unitTradePriceUsd, 65); // 100 * (1 - 0.35)
  assert.equal(quote.totalRetailUsd, 1000);
  assert.equal(quote.totalTradePriceUsd, 650);
  assert.equal(quote.totalSavingsUsd, 350);
  assert.equal(quote.podCostTotalUsd, 200); // 20 * 10
  // Gross margin = 650 - 200 = 450
  // Artist payout = 30% of 450 = 135
  assert.equal(quote.artistPayoutTotalUsd, 135);
  // Net venture margin = 450 - 135 = 315
  assert.equal(quote.netVentureMarginUsd, 315);
  assert.equal(quote.payoutSafe, true);
  assert.equal(quote.clientName, "Apex Design Studio");
  assert.equal(quote.projectName, "Grand Hotel Lobby");
});

test("calculateB2BTradeQuote flags unsafe quotes when trade discount destroys profit margin", () => {
  const quote = calculateB2BTradeQuote({
    quantity: 5,
    unitRetailUsd: 30, // Retail $30
    podCostPerUnitUsd: 25, // POD cost $25
    tierOverride: "platinum", // 42% discount -> Trade price $17.40, which is below POD cost $25
  });

  assert.equal(quote.payoutSafe, false);
  assert.notEqual(quote.guardrailWarning, undefined);
  assert.match(quote.guardrailWarning || "", /exceeds profitable margin/i);
});

test("calculateB2BTradeQuote warns when order quantity is below tier minimum", () => {
  const quote = calculateB2BTradeQuote({
    quantity: 1, // Below Gold minimum (5)
    unitRetailUsd: 100,
    tierOverride: "gold",
  });

  assert.notEqual(quote.guardrailWarning, undefined);
  assert.match(quote.guardrailWarning || "", /below tier minimum/i);
});
