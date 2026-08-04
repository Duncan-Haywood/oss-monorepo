import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  generateReferralCode,
  createCustomerReferral,
  evaluateReferralCode,
  convertReferralOrder,
  calculateViralLoopMetrics,
  generateConvexReferralsSchema,
  getReferralRecords,
  clearReferralStoreForTesting,
  DEFAULT_REFERRAL_CONFIG,
} from "../src/lib/customer-referrals";

describe("customer-referrals engine", () => {
  beforeEach(() => {
    clearReferralStoreForTesting();
  });

  describe("generateReferralCode", () => {
    it("generates structured referral code with prefix and advocate ID", () => {
      const code = generateReferralCode("ARTIST123");
      assert.ok(code.startsWith("ART-ARTIST-"));
      assert.equal(code.length, 15);
    });
  });

  describe("createCustomerReferral", () => {
    it("creates pending referral record with default expiration", () => {
      const record = createCustomerReferral("ADV-001", "advocate@example.com");
      assert.equal(record.advocateId, "ADV-001");
      assert.equal(record.status, "pending");
      assert.ok(record.expiresAt > Date.now());
      assert.equal(getReferralRecords().length, 1);
    });
  });

  describe("evaluateReferralCode", () => {
    it("rejects unknown referral code", () => {
      const result = evaluateReferralCode("INVALID-CODE", 5000);
      assert.equal(result.valid, false);
      assert.equal(result.discountUsdCents, 0);
      assert.equal(result.reason, "Referral code not found");
    });

    it("rejects orders below minimum order value threshold", () => {
      const record = createCustomerReferral("ADV-002");
      const result = evaluateReferralCode(record.referralCode, 3000); // $30 order < $40 min
      assert.equal(result.valid, false);
      assert.ok(result.reason?.includes("Order value must be at least"));
    });

    it("evaluates valid referral code and applies 15% discount", () => {
      const record = createCustomerReferral("ADV-003");
      const result = evaluateReferralCode(record.referralCode, 10000); // $100 order
      assert.equal(result.valid, true);
      assert.equal(result.discountUsdCents, 1500); // 15% of $100
      assert.equal(result.finalOrderValueUsdCents, 8500);
    });
  });

  describe("convertReferralOrder", () => {
    it("converts pending referral, records referee details and advocate reward", () => {
      const record = createCustomerReferral("ADV-004", "advocate@example.com");
      const converted = convertReferralOrder(
        record.referralCode,
        "referee@example.com",
        "ORD-999",
        10000
      );

      assert.equal(converted.status, "converted");
      assert.equal(converted.refereeEmail, "referee@example.com");
      assert.equal(converted.refereeOrderId, "ORD-999");
      assert.equal(converted.advocateRewardEarnedUsdCents, 1500);
      assert.equal(converted.refereeDiscountAppliedUsdCents, 1500);
      assert.ok(converted.convertedAt);
    });
  });

  describe("calculateViralLoopMetrics", () => {
    it("calculates K-factor, conversion rate, and CAC savings", () => {
      const ref1 = createCustomerReferral("ADV-100");
      const ref2 = createCustomerReferral("ADV-101");
      createCustomerReferral("ADV-102");

      // Convert ref1 and ref2
      convertReferralOrder(ref1.referralCode, "buyer1@example.com", "ORD-1", 10000);
      convertReferralOrder(ref2.referralCode, "buyer2@example.com", "ORD-2", 8000);

      const metrics = calculateViralLoopMetrics(getReferralRecords(), 4500);

      assert.equal(metrics.totalAdvocates, 3);
      assert.equal(metrics.totalInvitesSent, 3);
      assert.equal(metrics.totalConversions, 2);
      // K = (3 / 3) * (2 / 3) = 0.67
      assert.equal(metrics.kFactor, 0.67);
      assert.equal(metrics.viralConversionRatePercent, 66.7);
      assert.equal(metrics.totalAdvocateRewardsEarnedUsdCents, 3000); // 2 * 1500
      assert.equal(metrics.totalRefereeDiscountsGivenUsdCents, 2700); // 1500 + 1200
      // Gross CAC saved = 2 * 4500 = 9000. Net CAC savings = 9000 - 5700 = 3300
      assert.equal(metrics.estimatedCacSavingsUsdCents, 3300);
    });
  });

  describe("Convex schema definition", () => {
    it("generates valid Convex schema definition", () => {
      const schema = generateConvexReferralsSchema();
      assert.ok(schema.customer_referrals);
      assert.equal(schema.customer_referrals.columns.referralCode, "string");
      assert.ok(schema.customer_referrals.indexes.by_code);
    });
  });
});
