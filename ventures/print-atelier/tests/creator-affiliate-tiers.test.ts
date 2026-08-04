import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  calculateCreatorTier,
  evaluateCreatorPayout,
  summarizeCreatorAffiliates,
  generateConvexCreatorAffiliateSchema,
  creatorAffiliateStore,
  CreatorAffiliatePayload,
} from "../src/lib/creator-affiliate-tiers.js";

describe("creator-affiliate-tiers", () => {
  beforeEach(() => {
    creatorAffiliateStore.clear();
  });

  const sampleCreator: CreatorAffiliatePayload = {
    creatorId: "cr_art_curator_99",
    creatorHandle: "@artcurator_studio",
    totalAttributedSalesCount: 15,
    totalAttributedGmvCents: 120000, // $1,200 GMV (Silver tier)
    accruedCommissionCents: 14400, // $144 accrued (12% of $1,200)
    taxFormVerified: true,
  };

  describe("calculateCreatorTier", () => {
    it("assigns Bronze, Silver, Gold, and Diamond tiers based on GMV and sales volume", () => {
      assert.equal(calculateCreatorTier(50000, 2).tier, "bronze");
      assert.equal(calculateCreatorTier(120000, 5).tier, "silver");
      assert.equal(calculateCreatorTier(600000, 20).tier, "gold");
      assert.equal(calculateCreatorTier(3000000, 100).tier, "diamond");
    });
  });

  describe("evaluateCreatorPayout", () => {
    it("approves payout when commission exceeds minimum threshold and tax form is verified", () => {
      const evaluation = evaluateCreatorPayout(sampleCreator);

      assert.equal(evaluation.creatorId, "cr_art_curator_99");
      assert.equal(evaluation.currentTier, "silver");
      assert.equal(evaluation.commissionRatePercent, 12);
      assert.equal(evaluation.payoutStatus, "payout_ready");
      assert.equal(evaluation.eligiblePayoutAmountCents, 14400);
      assert.ok(evaluation.notes.some((n) => n.includes("Payout approved")));
    });

    it("holds payout if accrued balance is below minimum threshold", () => {
      const lowBalanceCreator: CreatorAffiliatePayload = {
        ...sampleCreator,
        accruedCommissionCents: 2500, // $25 (below default $50 threshold)
      };

      const evaluation = evaluateCreatorPayout(lowBalanceCreator);

      assert.equal(evaluation.payoutStatus, "below_threshold");
      assert.equal(evaluation.eligiblePayoutAmountCents, 0);
    });

    it("holds payout if tax form is unverified", () => {
      const unverifiedCreator: CreatorAffiliatePayload = {
        ...sampleCreator,
        taxFormVerified: false,
      };

      const evaluation = evaluateCreatorPayout(unverifiedCreator);

      assert.equal(evaluation.payoutStatus, "tax_form_missing");
      assert.equal(evaluation.eligiblePayoutAmountCents, 0);
      assert.ok(evaluation.notes.some((n) => n.includes("tax form is verified")));
    });

    it("enforces manual operations hold on payout", () => {
      const heldCreator: CreatorAffiliatePayload = {
        ...sampleCreator,
        holdPayout: true,
      };

      const evaluation = evaluateCreatorPayout(heldCreator);

      assert.equal(evaluation.payoutStatus, "payout_held");
      assert.equal(evaluation.eligiblePayoutAmountCents, 0);
    });
  });

  describe("summarizeCreatorAffiliates", () => {
    it("aggregates total creators, GMV, commissions, ready payout amounts, and tier counts", () => {
      const c1 = sampleCreator;
      const c2: CreatorAffiliatePayload = {
        creatorId: "cr_design_insider",
        creatorHandle: "@design_insider",
        totalAttributedSalesCount: 60,
        totalAttributedGmvCents: 800000, // Gold tier ($8,000 GMV)
        accruedCommissionCents: 120000, // $1,200 accrued
        taxFormVerified: false, // Tax form missing
      };

      const summary = summarizeCreatorAffiliates([c1, c2]);

      assert.equal(summary.totalCreators, 2);
      assert.equal(summary.totalAttributedGmvCents, 920000);
      assert.equal(summary.totalAccruedCommissionsCents, 134400);
      assert.equal(summary.totalReadyForPayoutCents, 14400); // Only c1 ready
      assert.equal(summary.tierBreakdown.silver, 1);
      assert.equal(summary.tierBreakdown.gold, 1);
      assert.equal(summary.payoutStatusBreakdown.payout_ready, 1);
      assert.equal(summary.payoutStatusBreakdown.tax_form_missing, 1);
    });

    it("handles empty creator list gracefully", () => {
      const summary = summarizeCreatorAffiliates([]);
      assert.equal(summary.totalCreators, 0);
      assert.equal(summary.totalAttributedGmvCents, 0);
    });
  });

  describe("creatorAffiliateStore & Convex schema", () => {
    it("registers and retrieves creator from in-memory store", () => {
      creatorAffiliateStore.registerCreator(sampleCreator);
      const retrieved = creatorAffiliateStore.getCreator("cr_art_curator_99");

      assert.ok(retrieved);
      assert.equal(retrieved?.creatorHandle, "@artcurator_studio");
    });

    it("generates valid Convex schema definition for creator_affiliates", () => {
      const schema = generateConvexCreatorAffiliateSchema();
      assert.ok(schema.includes("export const creator_affiliates = defineTable({"));
      assert.ok(schema.includes(".index(\"by_handle\", [\"creatorHandle\"])"));
    });
  });
});
