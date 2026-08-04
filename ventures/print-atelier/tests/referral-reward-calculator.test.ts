import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  calculateReferralReward,
  summarizeReferralCampaign,
  generateConvexReferralRewardSchema,
  getReferralReward,
  clearReferralStoreForTesting,
  ReferralActivity,
} from "../src/lib/referral-reward-calculator.js";

describe("referral-reward-calculator", () => {
  beforeEach(() => {
    clearReferralStoreForTesting();
  });

  const goldReferrerActivity: ReferralActivity = {
    referrerId: "ref_collector_gold_99",
    referrerTier: "collector_gold",
    invitesSent: 10,
    invitesConverted: 3,
    totalReferredSpendUsdCents: 150000, // $1,500.00 USD
  };

  describe("calculateReferralReward", () => {
    it("calculates 10% credit reward for Gold collector and awards 10% voucher for 3 conversions", () => {
      const result = calculateReferralReward(goldReferrerActivity);

      assert.equal(result.referrerId, "ref_collector_gold_99");
      assert.equal(result.referrerTier, "collector_gold");
      assert.equal(result.invitesSent, 10);
      assert.equal(result.invitesConverted, 3);
      assert.equal(result.conversionRatePercent, 30.0);
      assert.equal(result.viralKFactor, 1.5); // K = 3 / (10/5) = 1.5
      assert.equal(result.isViralAdvocate, true);
      assert.equal(result.discountVoucherPercent, 10);
      assert.ok(result.earnedRewardCreditsUsdCents > 15000); // 150,000 * 0.10 + viral advocate bonus
      assert.ok(result.notes.some((n) => n.includes("Viral Advocate Status")));
    });

    it("awards 25% super advocate voucher when conversions reach 10", () => {
      const superActivity: ReferralActivity = {
        referrerId: "ref_collector_platinum_01",
        referrerTier: "collector_platinum",
        invitesSent: 20,
        invitesConverted: 12,
        totalReferredSpendUsdCents: 500000, // $5,000.00 USD
      };

      const result = calculateReferralReward(superActivity);

      assert.equal(result.discountVoucherPercent, 25);
      assert.ok(result.notes.some((n) => n.includes("Super Advocate Bonus")));
    });

    it("handles zero conversion activity gracefully with 0 credits and sub-viral status", () => {
      const zeroActivity: ReferralActivity = {
        referrerId: "ref_collector_bronze_05",
        referrerTier: "collector_bronze",
        invitesSent: 5,
        invitesConverted: 0,
        totalReferredSpendUsdCents: 0,
      };

      const result = calculateReferralReward(zeroActivity);

      assert.equal(result.conversionRatePercent, 0.0);
      assert.equal(result.viralKFactor, 0.0);
      assert.equal(result.isViralAdvocate, false);
      assert.equal(result.earnedRewardCreditsUsdCents, 0);
      assert.equal(result.discountVoucherPercent, 0);
      assert.ok(result.notes.some((n) => n.includes("Sub-viral")));
    });
  });

  describe("summarizeReferralCampaign", () => {
    it("aggregates total referrers, invites, conversions, revenue, and viral advocates", () => {
      const act1 = goldReferrerActivity;
      const act2: ReferralActivity = {
        referrerId: "ref_collector_silver_12",
        referrerTier: "collector_silver",
        invitesSent: 15,
        invitesConverted: 1,
        totalReferredSpendUsdCents: 50000, // $500.00 USD
      };

      const summary = summarizeReferralCampaign([act1, act2]);

      assert.equal(summary.totalReferrers, 2);
      assert.equal(summary.totalInvitesSent, 25);
      assert.equal(summary.totalInvitesConverted, 4);
      assert.equal(summary.totalReferredRevenueUsdCents, 200000);
      assert.ok(summary.totalRewardsIssuedUsdCents > 0);
      assert.equal(summary.viralAdvocateCount, 1);
      assert.equal(summary.tierBreakdown.collector_gold, 1);
      assert.equal(summary.tierBreakdown.collector_silver, 1);
    });

    it("handles empty campaign activity list gracefully", () => {
      const summary = summarizeReferralCampaign([]);
      assert.equal(summary.totalReferrers, 0);
      assert.equal(summary.totalInvitesSent, 0);
      assert.equal(summary.averageViralKFactor, 0);
    });
  });

  describe("store & Convex schema", () => {
    it("caches and retrieves referral reward result by referrer ID", () => {
      calculateReferralReward(goldReferrerActivity);
      const cached = getReferralReward("ref_collector_gold_99");

      assert.ok(cached);
      assert.equal(cached?.referrerTier, "collector_gold");
    });

    it("generates valid Convex schema definition for referral_rewards", () => {
      const schema = generateConvexReferralRewardSchema();
      assert.ok(schema.includes("export const referral_rewards = defineTable({"));
      assert.ok(schema.includes(".index(\"by_referrer\", [\"referrerId\"])"));
    });
  });
});
