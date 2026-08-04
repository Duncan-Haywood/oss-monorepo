import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  evaluatePigmentCuringStatus,
  summarizeCuringRoomStatus,
  clearPigmentCuringStoreForTesting,
  PigmentCuringMonitorStore,
  PigmentCuringMonitorRequest,
} from "../src/lib/pigment-curing-monitor";

describe("pigment-curing-monitor", () => {
  beforeEach(() => {
    clearPigmentCuringStoreForTesting();
  });

  const now = Date.now();
  const twentyFourHoursAgo = now - 24 * 3600 * 1000;
  const fiveHoursAgo = now - 5 * 3600 * 1000;

  const completedPrintReq: PigmentCuringMonitorRequest = {
    batchId: "batch_rag_01",
    printId: "print_fineart_101",
    substrateType: "high_rag_cotton", // 24 hours required
    printedAt: twentyFourHoursAgo,
    currentTimestamp: now,
    ambientHumidityPercent: 45,
    ambientTemperatureC: 22,
    hasAirCirculationFan: true,
  };

  const highHumidityPrintReq: PigmentCuringMonitorRequest = {
    batchId: "batch_baryta_02",
    printId: "print_photo_202",
    substrateType: "medium_baryta_coated", // 36 hours base
    printedAt: fiveHoursAgo,
    currentTimestamp: now,
    ambientHumidityPercent: 75, // Retarded drying > 70%
    ambientTemperatureC: 21,
    hasAirCirculationFan: false,
  };

  describe("evaluatePigmentCuringStatus", () => {
    it("evaluates completed curing status and framing readiness for high rag cotton", () => {
      const result = evaluatePigmentCuringStatus(completedPrintReq);

      assert.equal(result.printId, "print_fineart_101");
      assert.equal(result.status, "curing_complete");
      assert.equal(result.elapsedDryingHours, 24);
      assert.equal(result.dryingProgressPercent, 100);
      assert.equal(result.safeForFramingUnderGlass, true);
      assert.equal(result.safeForVarnishing, true);
    });

    it("flags drying retarded status when humidity exceeds 70%", () => {
      const result = evaluatePigmentCuringStatus(highHumidityPrintReq);

      assert.equal(result.printId, "print_photo_202");
      assert.equal(result.status, "drying_retarded_high_rh");
      assert.ok(result.requiredDryingHours > 36); // Extended due to RH
      assert.equal(result.safeForFramingUnderGlass, false);
      assert.ok(result.warnings.some((w) => w.includes("High relative humidity")));
    });
  });

  describe("summarizeCuringRoomStatus", () => {
    it("aggregates curing room batch statuses and progress", () => {
      const summary = summarizeCuringRoomStatus([completedPrintReq, highHumidityPrintReq]);

      assert.equal(summary.totalBatchesMonitored, 2);
      assert.equal(summary.curingCompleteCount, 1);
      assert.equal(summary.retardedDryingCount, 1);
      assert.ok(summary.averageProgressPercent > 0);
    });

    it("handles empty monitors list gracefully", () => {
      const summary = summarizeCuringRoomStatus([]);
      assert.equal(summary.totalBatchesMonitored, 0);
      assert.equal(summary.averageProgressPercent, 0);
    });
  });

  describe("PigmentCuringMonitorStore", () => {
    it("generates valid Convex schema definition for pigment_curing_monitors", () => {
      const store = new PigmentCuringMonitorStore();
      const schema = store.generateConvexSchema();

      assert.ok(schema.includes("export default defineSchema({"));
      assert.ok(schema.includes("pigment_curing_monitors: defineTable({"));
    });
  });
});
