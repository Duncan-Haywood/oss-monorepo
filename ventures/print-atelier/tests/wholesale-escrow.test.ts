import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  processWholesaleEscrow,
  summarizeWholesaleEscrows,
  generateConvexWholesaleEscrowSchema,
  wholesaleEscrowStore,
  WholesaleEscrowPayload,
} from "../src/lib/wholesale-escrow.js";

describe("wholesale-escrow", () => {
  beforeEach(() => {
    wholesaleEscrowStore.clear();
  });

  const samplePayload: WholesaleEscrowPayload = {
    escrowId: "esc_101",
    orderId: "ord_bulk_88",
    buyerId: "buyer_gallery_01",
    artistId: "art_elena",
    totalOrderAmountCents: 1000000, // $10,000
    depositPercent: 50,
    status: "deposit_paid",
  };

  describe("processWholesaleEscrow", () => {
    it("calculates 50/50 deposit split and holds full funds upon initial deposit", () => {
      const result = processWholesaleEscrow(samplePayload);

      assert.equal(result.escrowId, "esc_101");
      assert.equal(result.depositAmountCents, 500000);
      assert.equal(result.balanceAmountCents, 500000);
      assert.equal(result.releasedToArtistCents, 0);
      assert.equal(result.heldInEscrowCents, 1000000);
      assert.equal(result.status, "deposit_paid");
    });

    it("releases deposit portion to artist once proof is approved", () => {
      const proofApprovedPayload: WholesaleEscrowPayload = {
        ...samplePayload,
        status: "proof_approved",
      };

      const result = processWholesaleEscrow(proofApprovedPayload);

      assert.equal(result.releasedToArtistCents, 500000);
      assert.equal(result.heldInEscrowCents, 500000);
      assert.equal(result.milestoneEligibleForRelease, true);
    });

    it("releases full order amount when order is delivered", () => {
      const deliveredPayload: WholesaleEscrowPayload = {
        ...samplePayload,
        status: "delivered",
      };

      const result = processWholesaleEscrow(deliveredPayload);

      assert.equal(result.releasedToArtistCents, 1000000);
      assert.equal(result.heldInEscrowCents, 0);
      assert.equal(result.milestoneEligibleForRelease, true);
    });

    it("freezes escrow funds when status is disputed", () => {
      const disputedPayload: WholesaleEscrowPayload = {
        ...samplePayload,
        status: "disputed",
        disputeNotes: "Damaged frame corners reported by gallery receiver.",
      };

      const result = processWholesaleEscrow(disputedPayload);

      assert.equal(result.releasedToArtistCents, 0);
      assert.equal(result.heldInEscrowCents, 1000000);
      assert.equal(result.milestoneEligibleForRelease, false);
      assert.ok(result.notes.some((n) => n.includes("Escrow frozen due to dispute")));
    });
  });

  describe("summarizeWholesaleEscrows", () => {
    it("aggregates escrow volume, released funds, and dispute counts", () => {
      const e1 = processWholesaleEscrow(samplePayload);
      const e2 = processWholesaleEscrow({
        ...samplePayload,
        escrowId: "esc_102",
        status: "delivered",
      });

      const summary = summarizeWholesaleEscrows([e1, e2]);

      assert.equal(summary.totalEscrows, 2);
      assert.equal(summary.totalVolumeCents, 2000000);
      assert.equal(summary.totalReleasedCents, 1000000);
      assert.equal(summary.totalHeldCents, 1000000);
      assert.equal(summary.milestoneCompletionRatePercent, 50);
    });

    it("handles empty list gracefully", () => {
      const summary = summarizeWholesaleEscrows([]);
      assert.equal(summary.totalEscrows, 0);
      assert.equal(summary.totalVolumeCents, 0);
    });
  });

  describe("wholesaleEscrowStore & Convex Schema", () => {
    it("records and retrieves escrows from in-memory store", () => {
      const result = processWholesaleEscrow(samplePayload);
      wholesaleEscrowStore.recordEscrow(result);

      const retrieved = wholesaleEscrowStore.getEscrowById("esc_101");
      assert.ok(retrieved);
      assert.equal(retrieved?.artistId, "art_elena");
    });

    it("generates valid Convex schema definition for wholesale_escrows", () => {
      const schema = generateConvexWholesaleEscrowSchema();
      assert.ok(schema.includes("export const wholesale_escrows = defineTable({"));
      assert.ok(schema.includes(".index(\"by_artist\", [\"artistId\"])"));
    });
  });
});
