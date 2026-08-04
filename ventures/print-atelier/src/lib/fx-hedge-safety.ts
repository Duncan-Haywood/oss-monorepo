/**
 * Automated Multi-Currency FX Hedge Loss Alert & Artist Payout Margin Safety Inspector
 * 
 * Protects cross-border marketplace profitability and artist payouts against foreign exchange
 * rate volatility, currency slippage, and international payout conversion fees.
 * 
 * Features:
 * - Real-time FX drift & volatility calculation relative to fixed baseline rates
 * - Artist payout net margin erosion detection (alerts if profit margin falls below 25.0%)
 * - Auto-trigger FX hedge warnings when rate slippage > maxSlippagePercent (default 2.5%)
 * - Recommended FX buffer adjustment percentages for high-volatility currency corridors
 * - Convex schema definition & state persistence for FX hedge audit logs
 */

export type CurrencyCode = "USD" | "EUR" | "GBP" | "CAD" | "AUD" | "JPY" | "CHF" | "SEK";

export interface FxHedgeConfig {
  maxSlippagePercent: number;        // e.g. 2.5% slippage threshold before alert
  minArtistMarginPercent: number;    // e.g. 25.0% minimum target profit share
  recommendedBufferPercent: number; // e.g. 3.0% safety buffer for volatile pairs
}

export const DEFAULT_HEDGE_CONFIG: FxHedgeConfig = {
  maxSlippagePercent: 2.5,
  minArtistMarginPercent: 25.0,
  recommendedBufferPercent: 3.0,
};

export interface CurrencyPairRate {
  baseCurrency: "USD";
  quoteCurrency: CurrencyCode;
  baselineRate: number;  // Fixed rate configured at pricing time
  currentRate: number;   // Current spot rate
}

export interface FxSafetyAssessment {
  pair: string; // e.g. "USD/EUR"
  baselineRate: number;
  currentRate: number;
  slippagePercent: number; // Positive = gain, Negative = loss/slippage
  isSlippageAlertTriggered: boolean;
  baseArtistPayoutCents: number;
  adjustedArtistPayoutCents: number;
  payoutMarginLossCents: number;
  effectiveArtistMarginPercent: number;
  isMarginProtected: boolean;
  recommendedBufferPercent: number;
  status: "safe" | "warning" | "critical";
  assessedAt: number;
}

// In-memory store for FX safety audit records
let fxSafetyAuditStore: FxSafetyAssessment[] = [];

/**
 * Calculates FX rate slippage percentage
 */
export function calculateFxSlippagePercent(baselineRate: number, currentRate: number): number {
  if (baselineRate <= 0) return 0;
  // Slippage = ((currentRate - baselineRate) / baselineRate) * 100
  const slippage = ((currentRate - baselineRate) / baselineRate) * 100;
  return Number(slippage.toFixed(2));
}

/**
 * Assesses FX volatility impact and payout safety for a cross-border artist order
 */
export function assessFxHedgeSafety(
  rateInfo: CurrencyPairRate,
  orderSubtotalUsdCents: number,
  artistNetPayoutUsdCents: number,
  config: FxHedgeConfig = DEFAULT_HEDGE_CONFIG
): FxSafetyAssessment {
  const pair = `${rateInfo.baseCurrency}/${rateInfo.quoteCurrency}`;
  const slippagePercent = calculateFxSlippagePercent(rateInfo.baselineRate, rateInfo.currentRate);

  // FX slippage alert triggers if currency depreciated by more than maxSlippagePercent
  const isSlippageAlertTriggered = Math.abs(slippagePercent) >= config.maxSlippagePercent;

  // Base artist payout in target quote currency
  const baseArtistPayoutCents = Math.round(artistNetPayoutUsdCents * rateInfo.baselineRate);
  const adjustedArtistPayoutCents = Math.round(artistNetPayoutUsdCents * rateInfo.currentRate);

  const payoutMarginLossCents = baseArtistPayoutCents - adjustedArtistPayoutCents;

  // Net revenue in quote currency
  const netRevenueQuoteCents = Math.round(orderSubtotalUsdCents * rateInfo.currentRate);
  const effectiveArtistMarginPercent =
    netRevenueQuoteCents > 0
      ? Number(((adjustedArtistPayoutCents / netRevenueQuoteCents) * 100).toFixed(1))
      : 0;

  const isMarginProtected = effectiveArtistMarginPercent >= config.minArtistMarginPercent;

  let status: "safe" | "warning" | "critical" = "safe";
  let recommendedBufferPercent = 0;

  if (!isMarginProtected || Math.abs(slippagePercent) >= 5.0) {
    status = "critical";
    recommendedBufferPercent = config.recommendedBufferPercent + 2.0; // 5.0% buffer needed
  } else if (isSlippageAlertTriggered) {
    status = "warning";
    recommendedBufferPercent = config.recommendedBufferPercent; // 3.0% buffer
  }

  const assessment: FxSafetyAssessment = {
    pair,
    baselineRate: rateInfo.baselineRate,
    currentRate: rateInfo.currentRate,
    slippagePercent,
    isSlippageAlertTriggered,
    baseArtistPayoutCents,
    adjustedArtistPayoutCents,
    payoutMarginLossCents,
    effectiveArtistMarginPercent,
    isMarginProtected,
    recommendedBufferPercent,
    status,
    assessedAt: Date.now(),
  };

  fxSafetyAuditStore.push(assessment);
  return assessment;
}

/**
 * Convex schema definition for fx_hedge_audits table
 */
export function generateConvexFxHedgeSchema(): {
  fx_hedge_audits: {
    columns: Record<string, string>;
    indexes: Record<string, string[]>;
  };
} {
  return {
    fx_hedge_audits: {
      columns: {
        pair: "string",
        baselineRate: "number",
        currentRate: "number",
        slippagePercent: "number",
        isSlippageAlertTriggered: "boolean",
        baseArtistPayoutCents: "number",
        adjustedArtistPayoutCents: "number",
        payoutMarginLossCents: "number",
        effectiveArtistMarginPercent: "number",
        isMarginProtected: "boolean",
        recommendedBufferPercent: "number",
        status: "string",
        assessedAt: "number",
      },
      indexes: {
        by_pair: ["pair"],
        by_status: ["status"],
      },
    },
  };
}

/**
 * Retrieves stored FX safety audit records
 */
export function getFxSafetyAuditRecords(): FxSafetyAssessment[] {
  return [...fxSafetyAuditStore];
}

/**
 * Clears FX safety audit store for isolated testing
 */
export function clearFxSafetyAuditStoreForTesting(): void {
  fxSafetyAuditStore = [];
}
