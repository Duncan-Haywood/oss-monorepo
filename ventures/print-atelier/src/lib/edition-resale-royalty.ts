/**
 * Automated Print Edition Rarity & Secondary Market Resale Royalty Tracker
 *
 * Calculates fine art secondary market resale royalties (Droit de Suite / Artist Resale Right),
 * computes edition rarity metrics, and tracks primary vs secondary price appreciation.
 */

export type EditionType = 'limited_edition' | 'artist_proof' | 'monoprint_unique' | 'open_edition';

export interface EditionResaleTransactionRequest {
  transactionId: string;
  artworkId: string;
  artistId: string;
  editionType: EditionType;
  editionNumber: number;
  totalEditionSize: number;
  primaryPriceUsd: number;
  resalePriceUsd: number;
  resaleRoyaltyRatePercent: number; // e.g. 5.0%
  resaleTimestamp: number;
}

export interface EditionResaleRoyaltyResult {
  transactionId: string;
  artworkId: string;
  artistId: string;
  rarityScore: number; // 0 - 100 higher is rarer
  priceAppreciationPercent: number;
  resaleRoyaltyAmountUsd: number;
  platformSettlementFeeUsd: number;
  netArtistRoyaltyUsd: number;
  isEligibleForRoyalty: boolean;
  formattedEditionLabel: string;
}

export interface ResaleRoyaltyPortfolioSummary {
  totalResales: number;
  totalResaleVolumeUsd: number;
  totalArtistRoyaltiesUsd: number;
  averagePriceAppreciationPercent: number;
  editionTypeBreakdown: Record<EditionType, number>;
}

const resaleStore = new Map<string, EditionResaleRoyaltyResult>();

export function calculateEditionResaleRoyalty(request: EditionResaleTransactionRequest): EditionResaleRoyaltyResult {
  const {
    transactionId,
    artworkId,
    artistId,
    editionType,
    editionNumber,
    totalEditionSize,
    primaryPriceUsd,
    resalePriceUsd,
    resaleRoyaltyRatePercent,
  } = request;

  // Compute Rarity Score (0 - 100)
  let rarityScore = 50;
  if (editionType === 'monoprint_unique') {
    rarityScore = 100;
  } else if (editionType === 'artist_proof') {
    rarityScore = 90;
  } else if (totalEditionSize <= 10) {
    rarityScore = 85;
  } else if (totalEditionSize <= 50) {
    rarityScore = 70;
  } else if (totalEditionSize <= 250) {
    rarityScore = 55;
  } else {
    rarityScore = 30;
  }

  // Price appreciation %
  const priceAppreciationPercent = primaryPriceUsd > 0
    ? parseFloat((((resalePriceUsd - primaryPriceUsd) / primaryPriceUsd) * 100).toFixed(2))
    : 0;

  // Minimum threshold for resale royalty (e.g., $100 minimum resale value)
  const isEligibleForRoyalty = resalePriceUsd >= 100.0 && resaleRoyaltyRatePercent > 0;

  let resaleRoyaltyAmountUsd = 0;
  let platformSettlementFeeUsd = 0;
  let netArtistRoyaltyUsd = 0;

  if (isEligibleForRoyalty) {
    resaleRoyaltyAmountUsd = parseFloat(((resalePriceUsd * resaleRoyaltyRatePercent) / 100).toFixed(2));
    // 10% platform processing fee on royalty
    platformSettlementFeeUsd = parseFloat((resaleRoyaltyAmountUsd * 0.10).toFixed(2));
    netArtistRoyaltyUsd = parseFloat((resaleRoyaltyAmountUsd - platformSettlementFeeUsd).toFixed(2));
  }

  const formattedEditionLabel = editionType === 'artist_proof'
    ? `AP #${editionNumber}`
    : editionType === 'monoprint_unique'
    ? '1/1 Unique Monoprint'
    : `#${editionNumber} of ${totalEditionSize}`;

  const result: EditionResaleRoyaltyResult = {
    transactionId,
    artworkId,
    artistId,
    rarityScore,
    priceAppreciationPercent,
    resaleRoyaltyAmountUsd,
    platformSettlementFeeUsd,
    netArtistRoyaltyUsd,
    isEligibleForRoyalty,
    formattedEditionLabel,
  };

  resaleStore.set(transactionId, result);
  return result;
}

export function summarizeResaleRoyaltyPortfolio(transactions: EditionResaleTransactionRequest[]): ResaleRoyaltyPortfolioSummary {
  const totalResales = transactions.length;
  if (totalResales === 0) {
    return {
      totalResales: 0,
      totalResaleVolumeUsd: 0,
      totalArtistRoyaltiesUsd: 0,
      averagePriceAppreciationPercent: 0,
      editionTypeBreakdown: {
        limited_edition: 0,
        artist_proof: 0,
        monoprint_unique: 0,
        open_edition: 0,
      },
    };
  }

  let totalResaleVolumeUsd = 0;
  let totalArtistRoyaltiesUsd = 0;
  let totalAppreciation = 0;

  const editionTypeBreakdown: Record<EditionType, number> = {
    limited_edition: 0,
    artist_proof: 0,
    monoprint_unique: 0,
    open_edition: 0,
  };

  for (const tx of transactions) {
    const result = calculateEditionResaleRoyalty(tx);
    totalResaleVolumeUsd += tx.resalePriceUsd;
    totalArtistRoyaltiesUsd += result.netArtistRoyaltyUsd;
    totalAppreciation += result.priceAppreciationPercent;
    editionTypeBreakdown[tx.editionType] += 1;
  }

  return {
    totalResales,
    totalResaleVolumeUsd: parseFloat(totalResaleVolumeUsd.toFixed(2)),
    totalArtistRoyaltiesUsd: parseFloat(totalArtistRoyaltiesUsd.toFixed(2)),
    averagePriceAppreciationPercent: parseFloat((totalAppreciation / totalResales).toFixed(2)),
    editionTypeBreakdown,
  };
}

export function clearEditionResaleRoyaltyStoreForTesting(): void {
  resaleStore.clear();
}

export class EditionResaleRoyaltyStore {
  generateConvexSchema(): string {
    return `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  edition_resale_royalties: defineTable({
    transactionId: v.string(),
    artworkId: v.string(),
    artistId: v.string(),
    editionType: v.string(),
    resalePriceUsd: v.number(),
    resaleRoyaltyAmountUsd: v.number(),
    netArtistRoyaltyUsd: v.number(),
    priceAppreciationPercent: v.number(),
    isEligibleForRoyalty: v.boolean(),
  }).index("by_artist", ["artistId"])
    .index("by_artwork", ["artworkId"]),
});`;
  }
}

export const editionResaleRoyaltyStore = new EditionResaleRoyaltyStore();
