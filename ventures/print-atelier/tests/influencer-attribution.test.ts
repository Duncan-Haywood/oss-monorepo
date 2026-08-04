import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  registerInfluencerAffiliate,
  attributeOrderToInfluencer,
  calculateInfluencerCampaignRoi,
  evaluatePayoutEligibility,
  generateConvexInfluencerSchema,
  clearInfluencersForTesting,
  getInfluencerAffiliates,
} from "../src/lib/influencer-attribution";

describe("influencer-attribution engine", () => {
  beforeEach(() => {
    clearInfluencersForTesting();
  });

  describe("registerInfluencerAffiliate", () => {
    it("registers new influencer affiliate with default standard tier rates", () => {
      const affiliate = registerInfluencerAffiliate("inf_101", "Jane Doe", "jane@example.com");

      assert.equal(affiliate.influencerId, "inf_101");
      assert.equal(affiliate.tier, "standard");
      assert.equal(affiliate.commissionRatePercent, 10.0);
      assert.equal(affiliate.discountRatePercent, 10.0);
      assert.equal(affiliate.promoCode, "JANEDOE10");
    });

    it("registers VIP influencer with custom promo code and 20% commission", () => {
      const affiliate = registerInfluencerAffiliate("inf_102", "Alex Rivers", "alex@example.com", "vip", "ALEXVIP20");

      assert.equal(affiliate.tier, "vip");
      assert.equal(affiliate.commissionRatePercent, 20.0);
      assert.equal(affiliate.promoCode, "ALEXVIP20");
    });
  });

  describe("attributeOrderToInfluencer", () => {
    it("returns null when promo code is not found", () => {
      const result = attributeOrderToInfluencer("ord_001", "INVALID_CODE", 10000);
      assert.equal(result, null);
    });

    it("attributes order, calculates discount and commission case-insensitively", () => {
      registerInfluencerAffiliate("inf_101", "Jane Doe", "jane@example.com", "gold", "JANEDOE15");

      const attribution = attributeOrderToInfluencer("ord_002", "janedoe15", 20000); // $200.00 order

      assert.ok(attribution);
      assert.equal(attribution.influencerId, "inf_101");
      assert.equal(attribution.discountUsdCents, 3000); // 15% discount = $30.00
      assert.equal(attribution.netOrderUsdCents, 17000); // Net = $170.00
      assert.equal(attribution.commissionUsdCents, 2550); // 15% of $170 = $25.50

      const affiliates = getInfluencerAffiliates();
      assert.equal(affiliates[0].pendingPayoutCents, 2550);
      assert.equal(affiliates[0].totalGmvGeneratedCents, 20000);
    });
  });

  describe("calculateInfluencerCampaignRoi", () => {
    it("calculates campaign ROI multiplier and platform net profit", () => {
      registerInfluencerAffiliate("inf_101", "Jane Doe", "jane@example.com", "silver", "JANE15");

      attributeOrderToInfluencer("ord_001", "JANE15", 10000); // $100 -> $15 disc, $85 net, $10.635 comm
      attributeOrderToInfluencer("ord_002", "JANE15", 20000); // $200 -> $30 disc, $170 net, $21.25 comm

      const roi = calculateInfluencerCampaignRoi("inf_101");

      assert.ok(roi);
      assert.equal(roi.totalOrders, 2);
      assert.equal(roi.totalGmvCents, 30000);
      assert.equal(roi.netRevenueCents, 25500);
      assert.ok(roi.roiMultiplier > 1.0);
    });
  });

  describe("evaluatePayoutEligibility", () => {
    it("returns ineligible when pending payout is under $50 minimum threshold", () => {
      registerInfluencerAffiliate("inf_101", "Jane Doe", "jane@example.com", "standard", "JANE10");
      attributeOrderToInfluencer("ord_001", "JANE10", 10000); // $9.00 commission

      const status = evaluatePayoutEligibility("inf_101");

      assert.equal(status.isEligible, false);
      assert.ok(status.remainingToThresholdCents > 0);
    });

    it("returns eligible when pending payout meets or exceeds $50 threshold", () => {
      registerInfluencerAffiliate("inf_101", "Jane Doe", "jane@example.com", "vip", "VIP20");
      attributeOrderToInfluencer("ord_001", "VIP20", 35000); // $280 net -> $56.00 commission

      const status = evaluatePayoutEligibility("inf_101");

      assert.equal(status.isEligible, true);
      assert.equal(status.remainingToThresholdCents, 0);
    });
  });

  describe("Convex schema definition", () => {
    it("generates valid Convex schema definition", () => {
      const schema = generateConvexInfluencerSchema();

      assert.ok(schema.influencer_affiliates);
      assert.ok(schema.influencer_attributions);
      assert.deepEqual(schema.influencer_affiliates.indexes.by_promo, ["promoCode"]);
    });
  });
});
