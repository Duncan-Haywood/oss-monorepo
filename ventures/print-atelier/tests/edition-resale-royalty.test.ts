import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  calculateEditionResaleRoyalty,
  summarizeResaleRoyaltyPortfolio,
  clearEditionResaleRoyaltyStoreForTesting,
  EditionResaleRoyaltyStore,
  EditionResaleTransactionRequest,
} from "../src/lib/edition-resale-royalty";

describe("edition-resale-royalty", () => {
  beforeEach(() => {
    clearEditionResaleRoyaltyStoreForTesting();
  });

  const monoprintReq: EditionResaleTransactionRequest = {
    transactionId: "tx_mono_001",
    artworkId: "art_mono_12",
    artistId: "artist_elena",
    editionType: "monoprint_unique",
    editionNumber: 1,
    totalEditionSize: 1,
    primaryPriceUsd: 500.0,
    resalePriceUsd: 1800.0,
    resaleRoyaltyRatePercent: 5.0,
    resaleTimestamp: Date.now(),
  };

  const limitedEditionReq: EditionResaleTransactionRequest = {
    transactionId: "tx_ltd_042",
    artworkId: "art_print_88",
    artistId: "artist_marcus",
    editionType: "limited_edition",
    editionNumber: 4,
    totalEditionSize: 50,
    primaryPriceUsd: 250.0,
    resalePriceUsd: 450.0,
    resaleRoyaltyRatePercent: 5.0,
    resaleTimestamp: Date.now(),
  };

  describe("calculateEditionResaleRoyalty", () => {
    it("calculates 100 rarity score and 5% resale royalty for monoprint", () => {
      const result = calculateEditionResaleRoyalty(monoprintReq);

      assert.equal(result.transactionId, "tx_mono_001");
      assert.equal(result.rarityScore, 100);
      assert.equal(result.priceAppreciationPercent, 260.0);
      assert.equal(result.resaleRoyaltyAmountUsd, 90.0); // 5% of $1800
      assert.equal(result.platformSettlementFeeUsd, 9.0); // 10% fee
      assert.equal(result.netArtistRoyaltyUsd, 81.0);
      assert.equal(result.isEligibleForRoyalty, true);
      assert.equal(result.formattedEditionLabel, "1/1 Unique Monoprint");
    });

    it("handles limited edition rarity score and price appreciation", () => {
      const result = calculateEditionResaleRoyalty(limitedEditionReq);

      assert.equal(result.rarityScore, 70);
      assert.equal(result.priceAppreciationPercent, 80.0);
      assert.equal(result.resaleRoyaltyAmountUsd, 22.50); // 5% of $450
      assert.equal(result.formattedEditionLabel, "#4 of 50");
    });
  });

  describe("summarizeResaleRoyaltyPortfolio", () => {
    it("aggregates resale transactions into portfolio volume and artist royalties", () => {
      const summary = summarizeResaleRoyaltyPortfolio([monoprintReq, limitedEditionReq]);

      assert.equal(summary.totalResales, 2);
      assert.equal(summary.totalResaleVolumeUsd, 2250.0);
      assert.equal(summary.totalArtistRoyaltiesUsd, 101.25); // 81.00 + 20.25
      assert.equal(summary.averagePriceAppreciationPercent, 170.0); // (260 + 80) / 2
      assert.equal(summary.editionTypeBreakdown.monoprint_unique, 1);
      assert.equal(summary.editionTypeBreakdown.limited_edition, 1);
    });

    it("handles empty transaction list gracefully", () => {
      const summary = summarizeResaleRoyaltyPortfolio([]);
      assert.equal(summary.totalResales, 0);
      assert.equal(summary.totalResaleVolumeUsd, 0);
      assert.equal(summary.totalArtistRoyaltiesUsd, 0);
    });
  });

  describe("EditionResaleRoyaltyStore", () => {
    it("generates valid Convex schema definition for edition_resale_royalties", () => {
      const store = new EditionResaleRoyaltyStore();
      const schema = store.generateConvexSchema();

      assert.ok(schema.includes("export default defineSchema({"));
      assert.ok(schema.includes("edition_resale_royalties: defineTable({"));
    });
  });
});
