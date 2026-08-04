import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  processDamageClaim,
  summarizeDamageClaims,
  generateConvexDamageClaimsSchema,
  damageClaimsStore,
  DamageClaimPayload,
} from "../src/lib/print-damage-claims.js";

describe("print-damage-claims", () => {
  beforeEach(() => {
    damageClaimsStore.clear();
  });

  const samplePayload: DamageClaimPayload = {
    claimId: "clm_001",
    orderId: "ord_555",
    trackingNumber: "1Z9999999999999999",
    carrier: "ups",
    declaredValueCents: 25000, // $250
    podReplacementCostCents: 4500, // $45
    damagePhotosCount: 3,
    reason: "glass_shattered",
    customerNotes: "Framed glass shattered upon unboxing.",
  };

  describe("processDamageClaim", () => {
    it("processes valid damage claim with full photo verification and auto-reprint approval", () => {
      const result = processDamageClaim(samplePayload);

      assert.equal(result.claimId, "clm_001");
      assert.equal(result.photoEvidenceValid, true);
      assert.equal(result.autoApprovedForReprint, true);
      assert.equal(result.reimbursementClaimedCents, 25000);
      assert.equal(result.status, "carrier_approved");
      assert.equal(result.reprintOrderPayload.expeditedPriority, true);
      assert.ok(result.carrierInsuranceFilingPayload.claimDescription.includes("glass_shattered"));
    });

    it("requires manual review when photo evidence count is below threshold", () => {
      const insufficientEvidencePayload: DamageClaimPayload = {
        ...samplePayload,
        claimId: "clm_002",
        damagePhotosCount: 1,
        declaredValueCents: 30000, // $300 (above $150 threshold)
      };

      const result = processDamageClaim(insufficientEvidencePayload);

      assert.equal(result.photoEvidenceValid, false);
      assert.equal(result.autoApprovedForReprint, false);
      assert.equal(result.status, "under_review");
      assert.ok(result.notes.some((n) => n.includes("Insufficient photo evidence")));
    });

    it("auto-approves low declared value claims even with insufficient photos", () => {
      const lowValuePayload: DamageClaimPayload = {
        ...samplePayload,
        claimId: "clm_003",
        damagePhotosCount: 1,
        declaredValueCents: 5000, // $50 (below $150 threshold)
      };

      const result = processDamageClaim(lowValuePayload);

      assert.equal(result.photoEvidenceValid, false);
      assert.equal(result.autoApprovedForReprint, true);
    });
  });

  describe("summarizeDamageClaims", () => {
    it("aggregates totals, recovery rates, and carrier breakdown", () => {
      const r1 = processDamageClaim(samplePayload);
      const r2 = processDamageClaim({
        ...samplePayload,
        claimId: "clm_002",
        carrier: "fedex",
        declaredValueCents: 15000,
        damagePhotosCount: 2,
      });

      const summary = summarizeDamageClaims([r1, r2]);

      assert.equal(summary.totalClaims, 2);
      assert.equal(summary.totalDeclaredValueCents, 40000);
      assert.equal(summary.totalReimbursementClaimedCents, 40000);
      assert.equal(summary.autoApprovalRatePercent, 100);
      assert.equal(summary.carrierBreakdown.ups, 1);
      assert.equal(summary.carrierBreakdown.fedex, 1);
    });

    it("handles empty claim list gracefully", () => {
      const summary = summarizeDamageClaims([]);
      assert.equal(summary.totalClaims, 0);
      assert.equal(summary.totalDeclaredValueCents, 0);
      assert.equal(summary.autoApprovalRatePercent, 0);
    });
  });

  describe("damageClaimsStore & Convex Schema", () => {
    it("records and retrieves claims from store", () => {
      const result = processDamageClaim(samplePayload);
      damageClaimsStore.recordClaim(result);

      const retrieved = damageClaimsStore.getClaimById("clm_001");
      assert.ok(retrieved);
      assert.equal(retrieved?.orderId, "ord_555");
      assert.equal(damageClaimsStore.getClaims().length, 1);
    });

    it("generates valid Convex schema definition for damage_claims", () => {
      const schema = generateConvexDamageClaimsSchema();
      assert.ok(schema.includes("export const damage_claims = defineTable({"));
      assert.ok(schema.includes(".index(\"by_order\", [\"orderId\"])"));
    });
  });
});
