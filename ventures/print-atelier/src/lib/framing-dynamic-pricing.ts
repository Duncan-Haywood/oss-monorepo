/**
 * Automated Print Framing & Mounting Dynamic Pricing Engine
 *
 * Dynamically computes custom framing, matting, glazing, and mounting prices based on physical dimensions,
 * moulding grade, glass protection tier, labor complexity, and platform margin targets.
 */

export type MouldingGrade = 'black_hardwood' | 'oak_natural' | 'walnut_solid' | 'aluminum_matte' | 'gilded_baroque';
export type MatboardPly = 'none' | '4_ply_archival' | '8_ply_museum' | 'floating_deckle';
export type GlazingType = 'standard_acrylic' | 'uv_acrylic' | 'museum_glass';

export interface FramingDimensions {
  widthInches: number;
  heightInches: number;
  matWidthInches: number; // e.g. 2.0 inches surround
}

export interface FramingPriceQuoteRequest {
  quoteId: string;
  artworkId: string;
  dimensions: FramingDimensions;
  mouldingGrade: MouldingGrade;
  matboardPly: MatboardPly;
  glazingType: GlazingType;
  requestedAt: number;
}

export interface FramingPriceQuoteResult {
  quoteId: string;
  unitedInches: number; // (width + mat*2) + (height + mat*2)
  mouldingCostUsd: number;
  matboardCostUsd: number;
  glazingCostUsd: number;
  laborAssemblyCostUsd: number;
  totalWholesaleCostUsd: number;
  suggestedRetailPriceUsd: number;
  platformMarginPercent: number;
  artistFramingRoyaltyUsd: number;
  formattedDimensionsLabel: string;
}

export interface FramingPricingSummary {
  totalQuotes: number;
  averageRetailPriceUsd: number;
  averagePlatformMarginPercent: number;
  mouldingBreakdown: Record<MouldingGrade, number>;
  totalFramingRevenueUsd: number;
}

const quoteStore = new Map<string, FramingPriceQuoteResult>();

export function calculateCustomFramingPrice(request: FramingPriceQuoteRequest): FramingPriceQuoteResult {
  const { quoteId, dimensions, mouldingGrade, matboardPly, glazingType } = request;

  const framedWidth = dimensions.widthInches + dimensions.matWidthInches * 2;
  const framedHeight = dimensions.heightInches + dimensions.matWidthInches * 2;
  const unitedInches = framedWidth + framedHeight;
  const totalAreaSqInches = framedWidth * framedHeight;

  // Moulding cost per united inch
  const mouldingRateMap: Record<MouldingGrade, number> = {
    aluminum_matte: 0.65,
    black_hardwood: 0.85,
    oak_natural: 1.10,
    walnut_solid: 1.45,
    gilded_baroque: 2.10,
  };
  const mouldingCostUsd = parseFloat((unitedInches * mouldingRateMap[mouldingGrade]).toFixed(2));

  // Matboard cost per sq inch
  const matRateMap: Record<MatboardPly, number> = {
    none: 0,
    '4_ply_archival': 0.025,
    '8_ply_museum': 0.045,
    floating_deckle: 0.065,
  };
  const matboardCostUsd = parseFloat((totalAreaSqInches * matRateMap[matboardPly]).toFixed(2));

  // Glazing cost per sq inch
  const glazingRateMap: Record<GlazingType, number> = {
    standard_acrylic: 0.03,
    uv_acrylic: 0.055,
    museum_glass: 0.095,
  };
  const glazingCostUsd = parseFloat((totalAreaSqInches * glazingRateMap[glazingType]).toFixed(2));

  // Labor assembly cost based on size
  let laborAssemblyCostUsd = 15.0;
  if (unitedInches > 60) laborAssemblyCostUsd = 35.0;
  else if (unitedInches > 40) laborAssemblyCostUsd = 25.0;

  const totalWholesaleCostUsd = parseFloat(
    (mouldingCostUsd + matboardCostUsd + glazingCostUsd + laborAssemblyCostUsd).toFixed(2)
  );

  // Target 55% retail margin
  const targetRetail = totalWholesaleCostUsd / (1 - 0.55);
  const suggestedRetailPriceUsd = parseFloat(targetRetail.toFixed(2));
  const platformMarginPercent = parseFloat(
    (((suggestedRetailPriceUsd - totalWholesaleCostUsd) / suggestedRetailPriceUsd) * 100).toFixed(2)
  );

  // 15% framing profit share to artist
  const artistFramingRoyaltyUsd = parseFloat(((suggestedRetailPriceUsd - totalWholesaleCostUsd) * 0.15).toFixed(2));

  const result: FramingPriceQuoteResult = {
    quoteId,
    unitedInches,
    mouldingCostUsd,
    matboardCostUsd,
    glazingCostUsd,
    laborAssemblyCostUsd,
    totalWholesaleCostUsd,
    suggestedRetailPriceUsd,
    platformMarginPercent,
    artistFramingRoyaltyUsd,
    formattedDimensionsLabel: `${framedWidth}" x ${framedHeight}" framed (${mouldingGrade.replace('_', ' ')})`,
  };

  quoteStore.set(quoteId, result);
  return result;
}

export function summarizeFramingPricingPortfolio(quotes: FramingPriceQuoteResult[]): FramingPricingSummary {
  const totalQuotes = quotes.length;
  if (totalQuotes === 0) {
    return {
      totalQuotes: 0,
      averageRetailPriceUsd: 0,
      averagePlatformMarginPercent: 0,
      mouldingBreakdown: {
        black_hardwood: 0,
        oak_natural: 0,
        walnut_solid: 0,
        aluminum_matte: 0,
        gilded_baroque: 0,
      },
      totalFramingRevenueUsd: 0,
    };
  }

  let totalRetail = 0;
  let totalMargin = 0;
  const mouldingBreakdown: Record<MouldingGrade, number> = {
    black_hardwood: 0,
    oak_natural: 0,
    walnut_solid: 0,
    aluminum_matte: 0,
    gilded_baroque: 0,
  };

  for (const quote of quotes) {
    totalRetail += quote.suggestedRetailPriceUsd;
    totalMargin += quote.platformMarginPercent;

    for (const key of Object.keys(mouldingBreakdown) as MouldingGrade[]) {
      if (quote.formattedDimensionsLabel.includes(key.replace('_', ' '))) {
        mouldingBreakdown[key] += 1;
      }
    }
  }

  return {
    totalQuotes,
    averageRetailPriceUsd: parseFloat((totalRetail / totalQuotes).toFixed(2)),
    averagePlatformMarginPercent: parseFloat((totalMargin / totalQuotes).toFixed(2)),
    mouldingBreakdown,
    totalFramingRevenueUsd: parseFloat(totalRetail.toFixed(2)),
  };
}

export function clearFramingPriceStoreForTesting(): void {
  quoteStore.clear();
}

export class FramingDynamicPricingStore {
  generateConvexSchema(): string {
    return `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  framing_price_quotes: defineTable({
    quoteId: v.string(),
    unitedInches: v.number(),
    mouldingCostUsd: v.number(),
    matboardCostUsd: v.number(),
    glazingCostUsd: v.number(),
    totalWholesaleCostUsd: v.number(),
    suggestedRetailPriceUsd: v.number(),
    platformMarginPercent: v.number(),
    artistFramingRoyaltyUsd: v.number(),
  }).index("by_retail_price", ["suggestedRetailPriceUsd"]),
});`;
  }
}

export const framingDynamicPricingStore = new FramingDynamicPricingStore();
