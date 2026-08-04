import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  calculateConsignmentSplit,
  summarizeConsignmentPortfolio,
  generateConvexConsignmentSplitterSchema,
  getConsignmentSplit,
  clearConsignmentSplitStoreForTesting,
  ConsignmentAgreement,
  ConsignmentSaleEvent,
} from "../src/lib/gallery-consignment-splitter.js";

describe("gallery-consignment-splitter", () => {
  beforeEach(() => {
    clearConsignmentSplitStoreForTesting();
  });

  const agreement: ConsignmentAgreement = {
    agreementId: "agree_salon_001",
    galleryId: "gal_soho_88",
    galleryName: "SoHo Modern Atelier",
    artistId: "artist_picasso_01",
    tier: "flagship_salon",
    gallerySplitPercent: 40,
    artistSplitPercent: 50,
    platformFeePercent: 10,
    wallSpaceLinearFeet: 12,
    monthlyWallRentUsdCents: 40000, // $400 USD / mo wall rent
  };

  const sale: ConsignmentSaleEvent = {
    saleId: "sale_print_9901",
    agreementId: "agree_salon_001",
    saleAmountUsdCents: 100000, // $1,000 USD gross sale
    isWallRentOffsetApplied: true,
  };

  describe("calculateConsignmentSplit", () => {
    it("calculates 40/50/10 split and credits wall rent offset to artist", () => {
      const result = calculateConsignmentSplit(agreement, sale);

      assert.equal(result.saleId, "sale_print_9901");
      assert.equal(result.grossSaleUsdCents, 100000);
      assert.equal(result.artistPayoutUsdCents, 50000); // Base $500
      assert.equal(result.platformFeeUsdCents, 10000); // $100 platform fee
      assert.equal(result.wallRentDeductedUsdCents, 10000); // 25% of $400 = $100 wall rent credit
      assert.equal(result.galleryPayoutUsdCents, 30000); // $400 base gallery payout - $100 offset = $300
      assert.equal(result.netArtistPayoutUsdCents, 60000); // $500 base + $100 offset = $600
      assert.ok(result.notes.some((n) => n.includes("Wall space rent offset applied")));
    });

    it("calculates standard split without wall rent offset when not applied", () => {
      const standardSale: ConsignmentSaleEvent = {
        ...sale,
        saleId: "sale_print_9902",
        isWallRentOffsetApplied: false,
      };

      const result = calculateConsignmentSplit(agreement, standardSale);

      assert.equal(result.galleryPayoutUsdCents, 40000);
      assert.equal(result.netArtistPayoutUsdCents, 50000);
      assert.equal(result.wallRentDeductedUsdCents, 0);
    });
  });

  describe("summarizeConsignmentPortfolio", () => {
    it("aggregates total sales count, gross, gallery payouts, artist payouts, and fees", () => {
      const res1 = calculateConsignmentSplit(agreement, sale);
      const res2 = calculateConsignmentSplit(agreement, {
        ...sale,
        saleId: "sale_print_9903",
        isWallRentOffsetApplied: false,
      });

      const summary = summarizeConsignmentPortfolio([res1, res2]);

      assert.equal(summary.totalSalesCount, 2);
      assert.equal(summary.totalGrossUsdCents, 200000);
      assert.equal(summary.totalGalleryPayoutsUsdCents, 70000); // 30000 + 40000
      assert.equal(summary.totalArtistPayoutsUsdCents, 110000); // 60000 + 50000
      assert.equal(summary.totalPlatformFeesUsdCents, 20000);
      assert.equal(summary.averageArtistSharePercent, 55.0); // 110000 / 200000 = 55%
    });

    it("handles empty results list gracefully", () => {
      const summary = summarizeConsignmentPortfolio([]);
      assert.equal(summary.totalSalesCount, 0);
      assert.equal(summary.averageArtistSharePercent, 0);
    });
  });

  describe("store & Convex schema", () => {
    it("caches and retrieves consignment split by sale ID", () => {
      calculateConsignmentSplit(agreement, sale);
      const cached = getConsignmentSplit("sale_print_9901");

      assert.ok(cached);
      assert.equal(cached?.galleryId, "gal_soho_88");
    });

    it("generates valid Convex schema definition for consignment_splits", () => {
      const schema = generateConvexConsignmentSplitterSchema();
      assert.ok(schema.includes("export const consignment_splits = defineTable({"));
      assert.ok(schema.includes(".index(\"by_gallery\", [\"galleryId\"])"));
    });
  });
});
