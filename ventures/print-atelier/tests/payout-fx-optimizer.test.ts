import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  optimizeArtistPayoutFx,
  generateConvexPayoutFxOptimizerSchema,
  getPayoutFxOptimizationRecords,
  clearPayoutFxOptimizerStoreForTesting,
  DEFAULT_FX_RATES,
} from "../src/lib/payout-fx-optimizer.js";

describe("payout-fx-optimizer engine", () => {
  beforeEach(() => {
    clearPayoutFxOptimizerStoreForTesting();
  });

  it("handles USD domestic payouts with zero conversion fee and immediate_spot strategy", () => {
    const result = optimizeArtistPayoutFx({
      artistId: "artist_123",
      orderId: "order_us_001",
      grossPayoutUsdCents: 10000, // $100 USD
      targetCurrency: "USD",
    });

    assert.equal(result.strategy, "immediate_spot");
    assert.equal(result.effectiveConversionRate, 1.0);
    assert.equal(result.totalFeesUsdCents, 0);
    assert.equal(result.feeSavingsUsdCents, 0);
    assert.equal(result.optimizedPayoutTargetUnits, 100);
    assert.equal(result.isArtistMarginProtected, true);
  });

  it("applies batched_threshold strategy when payout volume is below batching threshold", () => {
    const result = optimizeArtistPayoutFx({
      artistId: "artist_eur_456",
      orderId: "order_eur_002",
      grossPayoutUsdCents: 2000, // $20 USD (below $50 threshold)
      targetCurrency: "EUR",
      batchPayoutsUsdCents: 1000,
    });

    assert.equal(result.strategy, "batched_threshold");
    assert.equal(result.targetCurrency, "EUR");
    assert.ok(result.feeSavingsUsdCents > 0);
    assert.ok(result.recommendation.includes("Batched transfer scheduled"));
  });

  it("triggers hedged_rate_lock strategy for high FX volatility currency corridors", () => {
    const result = optimizeArtistPayoutFx({
      artistId: "artist_jpy_789",
      orderId: "order_jpy_003",
      grossPayoutUsdCents: 15000, // $150 USD
      targetCurrency: "JPY",
    });

    assert.equal(result.strategy, "hedged_rate_lock");
    assert.equal(result.effectiveConversionRate, DEFAULT_FX_RATES.JPY.hedgedRate);
    assert.ok(result.feeSavingsUsdCents > 0);
    assert.ok(result.recommendation.includes("High FX volatility"));
  });

  it("persists records into audit store and allows clearing", () => {
    optimizeArtistPayoutFx({
      artistId: "artist_gbp_101",
      orderId: "order_gbp_004",
      grossPayoutUsdCents: 8000,
      targetCurrency: "GBP",
    });

    const records = getPayoutFxOptimizationRecords();
    assert.equal(records.length, 1);
    assert.equal(records[0].artistId, "artist_gbp_101");

    clearPayoutFxOptimizerStoreForTesting();
    assert.equal(getPayoutFxOptimizationRecords().length, 0);
  });

  it("generates valid Convex schema definition for payout_fx_optimizations", () => {
    const schema = generateConvexPayoutFxOptimizerSchema();
    assert.ok(schema.payout_fx_optimizations);
    assert.equal(schema.payout_fx_optimizations.columns.artistId, "string");
    assert.equal(schema.payout_fx_optimizations.columns.strategy, "string");
    assert.deepEqual(schema.payout_fx_optimizations.indexes.by_target_currency, ["targetCurrency"]);
  });
});

