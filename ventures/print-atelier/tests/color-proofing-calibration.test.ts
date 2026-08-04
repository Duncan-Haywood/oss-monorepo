import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  recordColorProofingInspection,
  summarizeStudioCalibrationHealth,
  clearColorProofingStoreForTesting,
  ColorProofingCalibrationStore,
  ColorProofingInspectionRequest,
} from "../src/lib/color-proofing-calibration";

describe("color-proofing-calibration", () => {
  beforeEach(() => {
    clearColorProofingStoreForTesting();
  });

  const optimalInspection: ColorProofingInspectionRequest = {
    inspectionId: "insp_epson_9000_01",
    printerModel: "Epson SureColor P9000",
    substrateProfile: "hahnemuhle_photo_rag",
    iccProfileVersion: "v2.4_2026",
    spectrophotometerModel: "X-Rite i1Pro 3",
    measuredDeltaE: 1.1, // Excellent match <= 1.5
    nozzleHealthPercent: 100,
    ambientTemperatureC: 22,
    ambientHumidityPercent: 48,
    inspectedAt: Date.now(),
  };

  const failedInspection: ColorProofingInspectionRequest = {
    inspectionId: "insp_canon_4000_02",
    printerModel: "Canon imagePROGRAF PRO-4000",
    substrateProfile: "canson_infinity_baryta",
    iccProfileVersion: "v1.1_legacy",
    spectrophotometerModel: "X-Rite i1Pro 3",
    measuredDeltaE: 4.2, // Out of tolerance > 3.5
    nozzleHealthPercent: 85, // Critical nozzle clog < 90%
    ambientTemperatureC: 29, // Out of bounds temp > 28C
    ambientHumidityPercent: 25, // Out of bounds RH < 30%
    inspectedAt: Date.now(),
  };

  describe("recordColorProofingInspection", () => {
    it("certifies optimal inspection with production approval", () => {
      const result = recordColorProofingInspection(optimalInspection);

      assert.equal(result.inspectionId, "insp_epson_9000_01");
      assert.equal(result.status, "certified_pass");
      assert.equal(result.deltaEStatus, "optimal");
      assert.equal(result.nozzleStatus, "clean");
      assert.equal(result.environmentalSafety, "optimal");
      assert.equal(result.productionApproved, true);
    });

    it("rejects inspection with high Delta E, nozzle clog, and extreme humidity", () => {
      const result = recordColorProofingInspection(failedInspection);

      assert.equal(result.inspectionId, "insp_canon_4000_02");
      assert.equal(result.status, "failed_rejected");
      assert.equal(result.deltaEStatus, "out_of_tolerance");
      assert.equal(result.nozzleStatus, "critical_clean_required");
      assert.equal(result.environmentalSafety, "out_of_bounds");
      assert.equal(result.productionApproved, false);
      assert.ok(result.notes.some((n) => n.includes("Critical color drift")));
    });
  });

  describe("summarizeStudioCalibrationHealth", () => {
    it("aggregates inspection pass rates, average Delta E, and substrate breakdown", () => {
      const summary = summarizeStudioCalibrationHealth([optimalInspection, failedInspection]);

      assert.equal(summary.totalInspections, 2);
      assert.equal(summary.certifiedPassCount, 1);
      assert.equal(summary.passRatePercent, 50.0);
      assert.equal(summary.averageDeltaE, 2.65);
      assert.equal(summary.statusBreakdown.certified_pass, 1);
      assert.equal(summary.statusBreakdown.failed_rejected, 1);
      assert.equal(summary.substratePassRates.hahnemuhle_photo_rag, 100.0);
      assert.equal(summary.substratePassRates.canson_infinity_baryta, 0.0);
    });

    it("handles empty inspections list gracefully", () => {
      const summary = summarizeStudioCalibrationHealth([]);
      assert.equal(summary.totalInspections, 0);
      assert.equal(summary.passRatePercent, 0);
      assert.equal(summary.averageDeltaE, 0);
    });
  });

  describe("ColorProofingCalibrationStore", () => {
    it("generates valid Convex schema definition for color_proofing_inspections", () => {
      const store = new ColorProofingCalibrationStore();
      const schema = store.generateConvexSchema();

      assert.ok(schema.includes("export default defineSchema({"));
      assert.ok(schema.includes("color_proofing_inspections: defineTable({"));
    });
  });
});
