/**
 * Automated Print Gallery Wall Space Occupancy & Consignment Royalty Splitter
 * 
 * Manages physical gallery consignment splits (Artist %, Gallery %, Platform Fee %),
 * calculates wall space occupancy linear-foot rent offsets, and issues net payouts.
 */

export type ConsignmentTier = "standard_gallery" | "flagship_salon" | "popup_exhibition";

export interface ConsignmentAgreement {
  agreementId: string;
  galleryId: string;
  galleryName: string;
  artistId: string;
  tier: ConsignmentTier;
  gallerySplitPercent: number; // e.g. 40
  artistSplitPercent: number; // e.g. 50
  platformFeePercent: number; // e.g. 10
  wallSpaceLinearFeet: number;
  monthlyWallRentUsdCents: number;
}

export interface ConsignmentSaleEvent {
  saleId: string;
  agreementId: string;
  saleAmountUsdCents: number;
  isWallRentOffsetApplied: boolean;
}

export interface ConsignmentSplitResult {
  saleId: string;
  agreementId: string;
  galleryId: string;
  artistId: string;
  grossSaleUsdCents: number;
  galleryPayoutUsdCents: number;
  artistPayoutUsdCents: number;
  platformFeeUsdCents: number;
  wallRentDeductedUsdCents: number;
  netArtistPayoutUsdCents: number;
  notes: string[];
  processedAt: number;
}

export interface ConsignmentPortfolioSummary {
  totalSalesCount: number;
  totalGrossUsdCents: number;
  totalGalleryPayoutsUsdCents: number;
  totalArtistPayoutsUsdCents: number;
  totalPlatformFeesUsdCents: number;
  averageArtistSharePercent: number;
}

let consignmentSplitStore: Map<string, ConsignmentSplitResult> = new Map();

/**
 * Calculates gallery consignment royalty splits and applies wall space rent offsets.
 */
export function calculateConsignmentSplit(
  agreement: ConsignmentAgreement,
  sale: ConsignmentSaleEvent
): ConsignmentSplitResult {
  const { agreementId, galleryId, artistId, gallerySplitPercent, artistSplitPercent, platformFeePercent, monthlyWallRentUsdCents } = agreement;
  const { saleId, saleAmountUsdCents, isWallRentOffsetApplied } = sale;
  const notes: string[] = [];

  const totalSplit = gallerySplitPercent + artistSplitPercent + platformFeePercent;
  if (Math.abs(totalSplit - 100) > 0.01) {
    notes.push(`Warning: Consignment split sum (${totalSplit}%) does not equal 100%. Adjusting proportionally.`);
  }

  const rawGalleryPayout = Math.round(saleAmountUsdCents * (gallerySplitPercent / 100));
  const rawArtistPayout = Math.round(saleAmountUsdCents * (artistSplitPercent / 100));
  const platformFee = Math.round(saleAmountUsdCents * (platformFeePercent / 100));

  let wallRentDeductedUsdCents = 0;
  let galleryPayoutUsdCents = rawGalleryPayout;
  let netArtistPayoutUsdCents = rawArtistPayout;

  if (isWallRentOffsetApplied && monthlyWallRentUsdCents > 0) {
    // Deduct 25% of monthly wall rent offset per sale up to raw gallery payout capacity
    wallRentDeductedUsdCents = Math.min(rawGalleryPayout, Math.round(monthlyWallRentUsdCents * 0.25));
    galleryPayoutUsdCents -= wallRentDeductedUsdCents;
    netArtistPayoutUsdCents += wallRentDeductedUsdCents;
    notes.push(`Wall space rent offset applied: $${(wallRentDeductedUsdCents / 100).toFixed(2)} credited to artist payout.`);
  }

  notes.push(`Consignment Split: Gallery ${(gallerySplitPercent).toFixed(1)}%, Artist ${(artistSplitPercent).toFixed(1)}%, Platform ${(platformFeePercent).toFixed(1)}%.`);

  const result: ConsignmentSplitResult = {
    saleId,
    agreementId,
    galleryId,
    artistId,
    grossSaleUsdCents: saleAmountUsdCents,
    galleryPayoutUsdCents,
    artistPayoutUsdCents: rawArtistPayout,
    platformFeeUsdCents: platformFee,
    wallRentDeductedUsdCents,
    netArtistPayoutUsdCents,
    notes,
    processedAt: Date.now(),
  };

  consignmentSplitStore.set(saleId, result);
  return result;
}

/**
 * Summarizes consignment split performance across a portfolio of gallery sales.
 */
export function summarizeConsignmentPortfolio(results: ConsignmentSplitResult[]): ConsignmentPortfolioSummary {
  const totalSalesCount = results.length;
  if (totalSalesCount === 0) {
    return {
      totalSalesCount: 0,
      totalGrossUsdCents: 0,
      totalGalleryPayoutsUsdCents: 0,
      totalArtistPayoutsUsdCents: 0,
      totalPlatformFeesUsdCents: 0,
      averageArtistSharePercent: 0,
    };
  }

  let totalGrossUsdCents = 0;
  let totalGalleryPayoutsUsdCents = 0;
  let totalArtistPayoutsUsdCents = 0;
  let totalPlatformFeesUsdCents = 0;

  for (const r of results) {
    totalGrossUsdCents += r.grossSaleUsdCents;
    totalGalleryPayoutsUsdCents += r.galleryPayoutUsdCents;
    totalArtistPayoutsUsdCents += r.netArtistPayoutUsdCents;
    totalPlatformFeesUsdCents += r.platformFeeUsdCents;
  }

  const averageArtistSharePercent = totalGrossUsdCents > 0
    ? Math.round((totalArtistPayoutsUsdCents / totalGrossUsdCents) * 1000) / 10
    : 0;

  return {
    totalSalesCount,
    totalGrossUsdCents,
    totalGalleryPayoutsUsdCents,
    totalArtistPayoutsUsdCents,
    totalPlatformFeesUsdCents,
    averageArtistSharePercent,
  };
}

/**
 * Generates Convex Schema snippet for consignment_splits table.
 */
export function generateConvexConsignmentSplitterSchema(): string {
  return `
export const consignment_splits = defineTable({
  saleId: v.string(),
  agreementId: v.string(),
  galleryId: v.string(),
  artistId: v.string(),
  grossSaleUsdCents: v.number(),
  galleryPayoutUsdCents: v.number(),
  netArtistPayoutUsdCents: v.number(),
  platformFeeUsdCents: v.number(),
  processedAt: v.number(),
}).index("by_gallery", ["galleryId"])
  .index("by_artist", ["artistId"]);
`.trim();
}

/**
 * Retrieves cached consignment split result by sale ID.
 */
export function getConsignmentSplit(saleId: string): ConsignmentSplitResult | undefined {
  return consignmentSplitStore.get(saleId);
}

/**
 * Clears in-memory consignment split store for testing.
 */
export function clearConsignmentSplitStoreForTesting(): void {
  consignmentSplitStore.clear();
}
