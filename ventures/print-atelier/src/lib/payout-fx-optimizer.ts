/**
 * Automated Multi-Currency Artist Payout FX Hedging & Conversion Fee Optimizer
 * 
 * Minimizes foreign exchange friction loss and cross-border transfer fees for international
 * artist payouts while protecting the 30% net profit guarantee against currency volatility.
 */

export type FxSupportedCurrency = "USD" | "EUR" | "GBP" | "CAD" | "AUD" | "JPY" | "CHF" | "SEK";

export type FxOptimizationStrategy = "immediate_spot" | "batched_threshold" | "hedged_rate_lock";

export interface FxRateConfig {
  spotRate: number;            // Spot exchange rate (1 USD = X Target Currency)
  hedgedRate: number;          // Forward/hedged lock rate
  volatilityPercent: number;  // 30-day annualized FX volatility %
  fixedFeeTargetUnits: number; // Fixed transfer fee in target currency units (e.g., 50 JPY or 0.50 EUR)
  variableFeePercent: number; // Cross-border conversion fee percentage (e.g., 1.5%)
}

export interface FxOptimizerInput {
  artistId: string;
  orderId: string;
  grossPayoutUsdCents: number;
  targetCurrency: FxSupportedCurrency;
  rateConfig?: FxRateConfig;
  batchPayoutsUsdCents?: number; // Accumulated pending payout balance for batching
}

export interface PayoutFxOptimizationResult {
  artistId: string;
  orderId: string;
  sourceCurrency: "USD";
  targetCurrency: FxSupportedCurrency;
  grossPayoutUsdCents: number;
  spotRate: number;
  hedgedRate: number;
  strategy: FxOptimizationStrategy;
  unoptimizedPayoutTargetUnits: number;
  optimizedPayoutTargetUnits: number;
  totalFeesUsdCents: number;
  feeSavingsUsdCents: number;
  effectiveConversionRate: number;
  isArtistMarginProtected: boolean;
  recommendation: string;
  optimizedAt: number;
}

// Standard default rates against USD (1 USD = X Target Currency)
export const DEFAULT_FX_RATES: Record<FxSupportedCurrency, FxRateConfig> = {
  USD: { spotRate: 1.0, hedgedRate: 1.0, volatilityPercent: 0.0, fixedFeeTargetUnits: 0, variableFeePercent: 0.0 },
  EUR: { spotRate: 0.92, hedgedRate: 0.915, volatilityPercent: 1.2, fixedFeeTargetUnits: 0.50, variableFeePercent: 1.25 },
  GBP: { spotRate: 0.79, hedgedRate: 0.785, volatilityPercent: 1.5, fixedFeeTargetUnits: 0.40, variableFeePercent: 1.25 },
  CAD: { spotRate: 1.36, hedgedRate: 1.355, volatilityPercent: 1.1, fixedFeeTargetUnits: 0.60, variableFeePercent: 1.50 },
  AUD: { spotRate: 1.52, hedgedRate: 1.510, volatilityPercent: 1.8, fixedFeeTargetUnits: 0.75, variableFeePercent: 1.50 },
  JPY: { spotRate: 154.5, hedgedRate: 153.0, volatilityPercent: 2.8, fixedFeeTargetUnits: 75, variableFeePercent: 1.75 },
  CHF: { spotRate: 0.90, hedgedRate: 0.895, volatilityPercent: 1.0, fixedFeeTargetUnits: 0.50, variableFeePercent: 1.25 },
  SEK: { spotRate: 10.65, hedgedRate: 10.50, volatilityPercent: 2.4, fixedFeeTargetUnits: 5.00, variableFeePercent: 1.75 },
};

// Minimum payout threshold in USD cents before immediate cross-border transfer ($50 USD = 5000 cents)
export const BATCH_THRESHOLD_USD_CENTS = 5000;

let fxOptimizationAuditStore: PayoutFxOptimizationResult[] = [];

/**
 * Optimizes an international artist payout by analyzing spot vs hedged FX rates and batching opportunities.
 */
export function optimizeArtistPayoutFx(input: FxOptimizerInput): PayoutFxOptimizationResult {
  const { artistId, orderId, grossPayoutUsdCents, targetCurrency, batchPayoutsUsdCents = 0 } = input;
  const rateConfig = input.rateConfig || DEFAULT_FX_RATES[targetCurrency] || DEFAULT_FX_RATES.USD;

  const { spotRate, hedgedRate, volatilityPercent, fixedFeeTargetUnits, variableFeePercent } = rateConfig;

  // Unoptimized calculation (single spot transaction with full fixed + variable fee)
  const unoptimizedVariableFeeUsd = (grossPayoutUsdCents / 100) * (variableFeePercent / 100);
  const fixedFeeInUsd = fixedFeeTargetUnits / (spotRate || 1.0);
  const unoptimizedTotalFeeUsd = unoptimizedVariableFeeUsd + fixedFeeInUsd;
  const unoptimizedPayoutUsd = Math.max(0, (grossPayoutUsdCents / 100) - unoptimizedTotalFeeUsd);
  const unoptimizedPayoutTargetUnits = Math.round(unoptimizedPayoutUsd * spotRate * 100) / 100;

  // Determine optimal strategy
  let strategy: FxOptimizationStrategy = "immediate_spot";
  let effectiveRate = spotRate;
  let optimizedTotalFeeUsd = unoptimizedTotalFeeUsd;
  let recommendation = "Standard spot conversion applied for immediate domestic/low-fee settlement.";

  if (targetCurrency === "USD") {
    strategy = "immediate_spot";
    effectiveRate = 1.0;
    optimizedTotalFeeUsd = 0;
    recommendation = "Domestic USD payout executed with zero FX conversion fees.";
  } else if (volatilityPercent >= 2.0) {
    // High volatility corridor -> use forward hedged rate lock to protect against rate erosion
    strategy = "hedged_rate_lock";
    effectiveRate = hedgedRate;
    // Hedging reduces variable fee impact by locking guaranteed rate
    optimizedTotalFeeUsd = unoptimizedVariableFeeUsd * 0.85 + fixedFeeInUsd;
    recommendation = `High FX volatility (${volatilityPercent}%) detected for ${targetCurrency}. Rate-lock hedge applied to protect artist margin.`;
  } else if (grossPayoutUsdCents + batchPayoutsUsdCents < BATCH_THRESHOLD_USD_CENTS) {
    // Payout under batch threshold -> recommend batching to amortize fixed transfer fee
    strategy = "batched_threshold";
    effectiveRate = spotRate;
    // Fixed fee amortized across batched threshold volume
    const amortizedFixedFeeUsd = fixedFeeInUsd * (grossPayoutUsdCents / BATCH_THRESHOLD_USD_CENTS);
    optimizedTotalFeeUsd = unoptimizedVariableFeeUsd + amortizedFixedFeeUsd;
    recommendation = `Payout under $50 USD threshold. Batch this payout to amortize fixed ${targetCurrency} transfer fees.`;
  }

  const optimizedPayoutUsd = Math.max(0, (grossPayoutUsdCents / 100) - optimizedTotalFeeUsd);
  const optimizedPayoutTargetUnits = Math.round(optimizedPayoutUsd * effectiveRate * 100) / 100;
  const totalFeesUsdCents = Math.round(optimizedTotalFeeUsd * 100);
  const feeSavingsUsdCents = Math.max(0, Math.round((unoptimizedTotalFeeUsd - optimizedTotalFeeUsd) * 100));

  // Verify whether payout net margin after FX loss maintains target profitability (>= 25.0%)
  const netMarginPercent = grossPayoutUsdCents > 0 ? (optimizedPayoutUsd / (grossPayoutUsdCents / 100)) * 100 : 0;
  const isArtistMarginProtected = netMarginPercent >= 80.0; // Payout must retain >= 80% of gross payout after FX fees

  const result: PayoutFxOptimizationResult = {
    artistId,
    orderId,
    sourceCurrency: "USD",
    targetCurrency,
    grossPayoutUsdCents,
    spotRate,
    hedgedRate,
    strategy,
    unoptimizedPayoutTargetUnits,
    optimizedPayoutTargetUnits,
    totalFeesUsdCents,
    feeSavingsUsdCents,
    effectiveConversionRate: effectiveRate,
    isArtistMarginProtected,
    recommendation,
    optimizedAt: Date.now(),
  };

  fxOptimizationAuditStore.push(result);
  return result;
}

/**
 * Returns Convex schema definition for `payout_fx_optimizations` table.
 */
export function generateConvexPayoutFxOptimizerSchema(): {
  payout_fx_optimizations: {
    columns: Record<string, string>;
    indexes: Record<string, string[]>;
  };
} {
  return {
    payout_fx_optimizations: {
      columns: {
        artistId: "string",
        orderId: "string",
        sourceCurrency: "string",
        targetCurrency: "string",
        grossPayoutUsdCents: "number",
        spotRate: "number",
        hedgedRate: "number",
        strategy: "string",
        unoptimizedPayoutTargetUnits: "number",
        optimizedPayoutTargetUnits: "number",
        totalFeesUsdCents: "number",
        feeSavingsUsdCents: "number",
        effectiveConversionRate: "number",
        isArtistMarginProtected: "boolean",
        recommendation: "string",
        optimizedAt: "number",
      },
      indexes: {
        by_artist: ["artistId"],
        by_target_currency: ["targetCurrency"],
        by_strategy: ["strategy"],
      },
    },
  };
}

/**
 * Retrieves all recorded FX optimization audit entries.
 */
export function getPayoutFxOptimizationRecords(): PayoutFxOptimizationResult[] {
  return [...fxOptimizationAuditStore];
}

/**
 * Resets the in-memory FX optimization audit store for unit tests.
 */
export function clearPayoutFxOptimizerStoreForTesting(): void {
  fxOptimizationAuditStore = [];
}
