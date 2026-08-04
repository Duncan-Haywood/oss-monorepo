/**
 * Corporate Art Leasing & Residual Value Optimization Engine
 *
 * Calculates B2B art subscription leasing terms, rotation logistics fees, residual value options,
 * and portfolio security deposit requirements for corporate offices, hotels, and luxury spaces.
 */

export interface CorporateLeaseQuoteParams {
  collectionValuationUsd: number;
  leaseTermMonths: 12 | 24 | 36;
  rotationFrequencyMonths: 3 | 6 | 12; // Rotation cadence for artwork swaps
  framingGrade: 'museum_archival' | 'gallery_standard' | 'minimalist_acrylic';
  includeInsurance: boolean;
  corporateCreditTier: 'prime' | 'standard' | 'high_risk';
}

export interface CorporateLeaseQuote {
  monthlyLeaseRateUsd: number;
  totalLeaseContractValueUsd: number;
  rotationLogisticsFeePerSwapUsd: number;
  residualBuyoutPriceUsd: number; // Purchase price at end of lease term
  requiredSecurityDepositUsd: number;
  estimatedNetMarginPercent: number;
}

export interface CorporateCreditPosture {
  creditTier: 'prime' | 'standard' | 'high_risk';
  maxAllowedLeaseValuationUsd: number;
  securityDepositPercent: number; // % of total collection valuation
  paymentTerms: 'Net-15' | 'Net-30' | 'Net-60';
}

export function calculateCorporateLeaseQuote(params: CorporateLeaseQuoteParams): CorporateLeaseQuote {
  const { collectionValuationUsd, leaseTermMonths, rotationFrequencyMonths, framingGrade, includeInsurance, corporateCreditTier } = params;

  // Base monthly rate calculation (% of collection valuation per year divided by 12)
  let annualRatePercent = 0.36; // 36% annual rate base for 12 months
  if (leaseTermMonths === 24) {
    annualRatePercent = 0.30; // Discounted annual rate for 2-year commitment
  } else if (leaseTermMonths === 36) {
    annualRatePercent = 0.25; // Deep discount for 3-year commitment
  }

  // Framing grade adjustment
  let framingMultiplier = 1.0;
  let framingSwapFee = 150;
  if (framingGrade === 'museum_archival') {
    framingMultiplier = 1.15;
    framingSwapFee = 300;
  } else if (framingGrade === 'minimalist_acrylic') {
    framingMultiplier = 0.95;
    framingSwapFee = 100;
  }

  // Insurance premium (approx 3% of valuation annually)
  const monthlyInsurance = includeInsurance ? (collectionValuationUsd * 0.03) / 12 : 0;

  const baseMonthly = ((collectionValuationUsd * annualRatePercent) / 12) * framingMultiplier;
  const monthlyLeaseRateUsd = parseFloat((baseMonthly + monthlyInsurance).toFixed(2));
  const totalLeaseContractValueUsd = parseFloat((monthlyLeaseRateUsd * leaseTermMonths).toFixed(2));

  // Swap / Rotation logistics fee calculation
  const rotationLogisticsFeePerSwapUsd = parseFloat((framingSwapFee + (collectionValuationUsd * 0.01)).toFixed(2));

  // Residual value estimation (value of artwork after depreciation & display use)
  let residualFactor = 0.40;
  if (leaseTermMonths === 24) residualFactor = 0.25;
  if (leaseTermMonths === 36) residualFactor = 0.15;
  const residualBuyoutPriceUsd = parseFloat((collectionValuationUsd * residualFactor).toFixed(2));

  // Security deposit requirements based on credit tier
  const depositPercent = corporateCreditTier === 'prime' ? 0.05 : corporateCreditTier === 'standard' ? 0.15 : 0.30;
  const requiredSecurityDepositUsd = parseFloat((collectionValuationUsd * depositPercent).toFixed(2));

  // Net margin estimation (subtracting COGS, insurance, depreciation risk)
  const estimatedCostUsd = collectionValuationUsd * 0.35 + (includeInsurance ? monthlyInsurance * leaseTermMonths * 0.5 : 0);
  const totalRevenue = totalLeaseContractValueUsd;
  const netMargin = totalRevenue > 0 ? ((totalRevenue - estimatedCostUsd) / totalRevenue) * 100 : 0;
  const estimatedNetMarginPercent = parseFloat(netMargin.toFixed(2));

  return {
    monthlyLeaseRateUsd,
    totalLeaseContractValueUsd,
    rotationLogisticsFeePerSwapUsd,
    residualBuyoutPriceUsd,
    requiredSecurityDepositUsd,
    estimatedNetMarginPercent,
  };
}

export function evaluateCorporateCreditPosture(
  corporateCreditTier: 'prime' | 'standard' | 'high_risk',
  annualRevenueUsd: number
): CorporateCreditPosture {
  let maxAllowedLeaseValuationUsd = 25000;
  let securityDepositPercent = 15;
  let paymentTerms: CorporateCreditPosture['paymentTerms'] = 'Net-30';

  if (corporateCreditTier === 'prime') {
    maxAllowedLeaseValuationUsd = Math.min(Math.round(annualRevenueUsd * 0.10), 500000);
    securityDepositPercent = 5;
    paymentTerms = 'Net-60';
  } else if (corporateCreditTier === 'standard') {
    maxAllowedLeaseValuationUsd = Math.min(Math.round(annualRevenueUsd * 0.05), 100000);
    securityDepositPercent = 15;
    paymentTerms = 'Net-30';
  } else {
    maxAllowedLeaseValuationUsd = Math.min(Math.round(annualRevenueUsd * 0.02), 25000);
    securityDepositPercent = 30;
    paymentTerms = 'Net-15';
  }

  return {
    creditTier: corporateCreditTier,
    maxAllowedLeaseValuationUsd,
    securityDepositPercent,
    paymentTerms,
  };
}

// In-Memory Storage & Convex Schema Exporter
export class CorporateLeaseStore {
  private quotes = new Map<string, CorporateLeaseQuote>();

  recordQuote(quoteId: string, quote: CorporateLeaseQuote): void {
    this.quotes.set(quoteId, quote);
  }

  getQuote(quoteId: string): CorporateLeaseQuote | undefined {
    return this.quotes.get(quoteId);
  }

  generateConvexSchema(): string {
    return `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  corporate_lease_quotes: defineTable({
    quoteId: v.string(),
    collectionValuationUsd: v.number(),
    leaseTermMonths: v.number(),
    monthlyLeaseRateUsd: v.number(),
    totalLeaseContractValueUsd: v.number(),
    residualBuyoutPriceUsd: v.number(),
    requiredSecurityDepositUsd: v.number(),
    corporateCreditTier: v.string(),
    timestamp: v.string(),
  }).index("by_credit_tier", ["corporateCreditTier"]),
});`;
  }
}

export const corporateLeaseStore = new CorporateLeaseStore();
