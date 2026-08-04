import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  logPayoutDispute,
  resolvePayoutDispute,
  calculateDisputeSlaVelocityMetrics,
  getPrioritizedOpenDisputes,
  generateConvexDisputeSchema,
  clearDisputesForTesting,
} from "../src/lib/payout-dispute-velocity";

describe("payout-dispute-velocity engine", () => {
  beforeEach(() => {
    clearDisputesForTesting();
  });

  describe("logPayoutDispute", () => {
    it("logs new artist payout dispute with open status", () => {
      const dispute = logPayoutDispute("artist_jane", "pay_001", 15000, "missing_payout");

      assert.equal(dispute.artistHandle, "artist_jane");
      assert.equal(dispute.disputedAmountUsdCents, 15000);
      assert.equal(dispute.reason, "missing_payout");
      assert.equal(dispute.status, "open");
    });
  });

  describe("resolvePayoutDispute", () => {
    it("resolves open dispute and sets resolution timestamp", () => {
      const dispute = logPayoutDispute("artist_bob", "pay_002", 5000, "fee_discrepancy");

      const resolved = resolvePayoutDispute(dispute.disputeId, "Fee credited back to Connect account");

      assert.ok(resolved);
      assert.equal(resolved.status, "resolved");
      assert.ok(resolved.resolvedAt);
    });
  });

  describe("calculateDisputeSlaVelocityMetrics", () => {
    it("computes SLA resolution velocity metrics", () => {
      const d1 = logPayoutDispute("artist_1", "pay_1", 10000, "missing_payout");
      d1.openedAt = Date.now() - 12 * 3600 * 1000; // 12 hours ago
      resolvePayoutDispute(d1.disputeId);

      const metrics = calculateDisputeSlaVelocityMetrics();

      assert.equal(metrics.totalDisputesLogged, 1);
      assert.equal(metrics.resolvedDisputesCount, 1);
      assert.equal(metrics.withinSlaResolutionPercent, 100);
    });
  });

  describe("getPrioritizedOpenDisputes", () => {
    it("ranks open disputes by dollar amount descending", () => {
      logPayoutDispute("artist_small", "pay_s", 2000, "fee_discrepancy");
      logPayoutDispute("artist_large", "pay_l", 50000, "missing_payout");

      const prioritized = getPrioritizedOpenDisputes();

      assert.equal(prioritized.length, 2);
      assert.equal(prioritized[0].artistHandle, "artist_large");
    });
  });

  describe("Convex schema definition", () => {
    it("generates valid Convex schema definition for payout_dispute_logs", () => {
      const schema = generateConvexDisputeSchema();
      assert.ok(schema.payout_dispute_logs);
      assert.deepEqual(schema.payout_dispute_logs.indexes.by_artist, ["artistHandle"]);
    });
  });
});
