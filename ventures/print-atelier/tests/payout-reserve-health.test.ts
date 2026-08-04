import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateConnectPayoutFeeCents,
  inspectPayoutReserveHealth,
  generateConvexPayoutReserveHealthSchema,
  persistPayoutReserveSnapshot,
  getPayoutReserveSnapshots,
  clearPayoutReserveSnapshotsForTesting,
} from "../src/lib/payout-reserve-health";

describe("payout reserve health inspector", () => {
  describe("calculateConnectPayoutFeeCents", () => {
    it("calculates standard Connect payout fee (0.25% + $0.25)", () => {
      // $100 payout = 10,000 cents * 0.0025 + 25 = 25 + 25 = 50 cents ($0.50)
      const fee = calculateConnectPayoutFeeCents(10000);
      assert.equal(fee, 50);
    });

    it("returns 0 fee for non-positive payout amounts", () => {
      assert.equal(calculateConnectPayoutFeeCents(0), 0);
      assert.equal(calculateConnectPayoutFeeCents(-500), 0);
    });

    it("supports custom Connect fee configurations", () => {
      // Custom fee: 0.5% + 50 cents
      const fee = calculateConnectPayoutFeeCents(20000, {
        payoutFeeRate: 0.005,
        payoutFeeFixedCents: 50,
      });
      // 20000 * 0.005 = 100 + 50 = 150 cents
      assert.equal(fee, 150);
    });
  });

  describe("inspectPayoutReserveHealth", () => {
    it("returns healthy status when reserve buffer coverage is well above target (>= 120%)", () => {
      const report = inspectPayoutReserveHealth({
        availablePlatformBalanceCents: 500000, // $5,000
        pendingArtistTransfersCents: 100000, // $1,000
        unresolvedPayoutVariancesCents: 20000, // $200
        monthlyFulfillmentLiabilityCents: 150000, // $1,500
        monthlyGrossRevenueCents: 1000000, // $10,000
        transfersCount: 5,
      });

      assert.equal(report.status, "healthy");
      assert.equal(report.reserveCoverageRatio >= 1.2, true);
      assert.equal(report.warnings.length, 1); // Unresolved variance warning
      assert.equal(report.recommendations.length > 0, true);
      assert.equal(report.netSafetyMarginCents > 0, true);
    });

    it("returns warning status when reserve coverage is thin (100% to 119%)", () => {
      const report = inspectPayoutReserveHealth({
        availablePlatformBalanceCents: 330000, // $3,300
        pendingArtistTransfersCents: 100000, // $1,000
        unresolvedPayoutVariancesCents: 50000, // $500
        monthlyFulfillmentLiabilityCents: 100000, // $1,000
        monthlyGrossRevenueCents: 1000000, // $10,000 (reserve target = 1000+500+1000 + fees(5) + 500 = ~3005)
        transfersCount: 1,
      });

      assert.equal(report.status, "warning");
      assert.equal(report.reserveCoveragePercent < 120, true);
      assert.equal(report.reserveCoveragePercent >= 100, true);
      assert.equal(
        report.warnings.some((w) => w.includes("WARNING: Reserve buffer coverage is thin")),
        true,
      );
    });

    it("returns critical status when available platform balance cannot cover liabilities (< 100%)", () => {
      const report = inspectPayoutReserveHealth({
        availablePlatformBalanceCents: 100000, // $1,000 available
        pendingArtistTransfersCents: 150000, // $1,500 pending
        unresolvedPayoutVariancesCents: 50000, // $500 underpaid
        monthlyFulfillmentLiabilityCents: 100000, // $1,000 POD liability
        monthlyGrossRevenueCents: 500000, // $5,000 gross
      });

      assert.equal(report.status, "critical");
      assert.equal(report.reserveCoverageRatio < 1.0, true);
      assert.equal(report.netSafetyMarginCents < 0, true);
      assert.equal(
        report.warnings.some((w) => w.includes("CRITICAL: Platform cash deficit")),
        true,
      );
      assert.equal(
        report.warnings.some((w) => w.includes("Pending artist transfers")),
        true,
      );
    });

    it("honors custom reserve target override when provided", () => {
      const report = inspectPayoutReserveHealth({
        availablePlatformBalanceCents: 200000, // $2,000
        pendingArtistTransfersCents: 50000,
        customReserveTargetCents: 300000, // $3,000 target override
      });

      assert.equal(report.status, "critical");
      assert.equal(report.recommendedReserveBufferCents, 300000);
      assert.equal(report.netSafetyMarginCents, -100000);
    });
  });

  describe("Convex schema generation and snapshot persistence", () => {
    it("generates valid Convex schema definition for payout_reserve_snapshots", () => {
      const schemaDef = generateConvexPayoutReserveHealthSchema();
      assert.equal(schemaDef.tableName, "payout_reserve_snapshots");
      assert.equal(schemaDef.indexes.includes("by_snapshotId"), true);
      assert.equal(schemaDef.indexes.includes("by_status"), true);
      assert.equal(schemaDef.schemaCode.includes("defineTable"), true);
    });

    it("persists snapshot and retrieves records with status filtering", () => {
      clearPayoutReserveSnapshotsForTesting();

      const healthyReport = inspectPayoutReserveHealth({
        availablePlatformBalanceCents: 500000,
        pendingArtistTransfersCents: 100000,
      });
      const criticalReport = inspectPayoutReserveHealth({
        availablePlatformBalanceCents: 50000,
        pendingArtistTransfersCents: 200000,
      });

      const snap1 = persistPayoutReserveSnapshot(healthyReport, "2026-08-01T10:00:00Z");
      const snap2 = persistPayoutReserveSnapshot(criticalReport, "2026-08-01T11:00:00Z");

      assert.match(snap1.snapshotId, /^res_snap_/);
      assert.equal(snap1.status, "healthy");
      assert.equal(snap2.status, "critical");

      const allSnaps = getPayoutReserveSnapshots();
      assert.equal(allSnaps.length, 2);

      const criticalOnly = getPayoutReserveSnapshots({ status: "critical" });
      assert.equal(criticalOnly.length, 1);
      assert.equal(criticalOnly[0].snapshotId, snap2.snapshotId);
    });
  });
});
