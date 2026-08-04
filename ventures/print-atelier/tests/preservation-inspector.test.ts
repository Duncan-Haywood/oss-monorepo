import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  evaluatePrintPreservation,
  summarizePreservationInspection,
  generateConvexPreservationInspectorSchema,
  getPreservationInspection,
  clearPreservationStoreForTesting,
  PrintPreservationInput,
} from "../src/lib/preservation-inspector.js";

describe("preservation-inspector", () => {
  beforeEach(() => {
    clearPreservationStoreForTesting();
  });

  const museumGradePrint: PrintPreservationInput = {
    printId: "print_museum_001",
    paperMaterial: "cotton_rag",
    inkType: "pigment_archival",
    glassType: "museum_acrylic_99uv",
    ambientLux: 400,
    directSunlightHoursPerDay: 0,
    targetDisplayYears: 100,
  };

  describe("evaluatePrintPreservation", () => {
    it("evaluates museum grade 100yr preservation for cotton rag print with 99% UV acrylic", () => {
      const result = evaluatePrintPreservation(museumGradePrint);

      assert.equal(result.printId, "print_museum_001");
      assert.equal(result.preservationGrade, "museum_grade_100yr");
      assert.ok(result.estimatedLifespanYears >= 100);
      assert.equal(result.uvProtectionPercent, 99.0);
      assert.equal(result.isTargetAchieved, true);
      assert.equal(result.degradationRiskLevel, "low");
      assert.ok(result.recommendations.some((r) => r.includes("Certified 100-Year Museum Grade")));
    });

    it("penalizes lifespan and flags severe degradation risk for direct sunlight exposure", () => {
      const sunnyPrint: PrintPreservationInput = {
        ...museumGradePrint,
        directSunlightHoursPerDay: 4, // 4 hours direct sun
      };

      const result = evaluatePrintPreservation(sunnyPrint);

      assert.ok(result.estimatedLifespanYears < 100);
      assert.equal(result.degradationRiskLevel, "severe");
      assert.ok(result.recommendations.some((r) => r.includes("Relocate print away from direct sunlight")));
    });

    it("recommends UV glass upgrade when standard glass is used", () => {
      const standardGlassPrint: PrintPreservationInput = {
        ...museumGradePrint,
        glassType: "standard_glass",
      };

      const result = evaluatePrintPreservation(standardGlassPrint);

      assert.equal(result.uvProtectionPercent, 45.0);
      assert.equal(result.degradationRiskLevel, "severe");
      assert.ok(result.recommendations.some((r) => r.includes("Upgrade to Museum Acrylic")));
    });

    it("evaluates dye-based ink print as non_archival with rapid fading recommendation", () => {
      const dyePrint: PrintPreservationInput = {
        ...museumGradePrint,
        paperMaterial: "canvas",
        inkType: "dye_based",
      };

      const result = evaluatePrintPreservation(dyePrint);

      assert.equal(result.preservationGrade, "non_archival");
      assert.ok(result.recommendations.some((r) => r.includes("Replace dye-based ink")));
    });
  });

  describe("summarizePreservationInspection", () => {
    it("aggregates average lifespan, target met percentage, and grade distributions", () => {
      const p1 = museumGradePrint;
      const p2: PrintPreservationInput = {
        printId: "print_gallery_002",
        paperMaterial: "baryta",
        inkType: "pigment_archival",
        glassType: "conservation_clear_99uv",
        ambientLux: 600,
        directSunlightHoursPerDay: 0,
        targetDisplayYears: 50,
      };

      const summary = summarizePreservationInspection([p1, p2]);

      assert.equal(summary.totalInspected, 2);
      assert.ok(summary.averageEstimatedLifespanYears > 50);
      assert.equal(summary.targetMetPercentage, 100);
      assert.ok(summary.gradeDistribution.museum_grade_100yr >= 1);
    });

    it("handles empty print inspection list gracefully", () => {
      const summary = summarizePreservationInspection([]);
      assert.equal(summary.totalInspected, 0);
      assert.equal(summary.averageEstimatedLifespanYears, 0);
    });
  });

  describe("store & Convex schema", () => {
    it("caches and retrieves inspection result by print ID", () => {
      evaluatePrintPreservation(museumGradePrint);
      const cached = getPreservationInspection("print_museum_001");

      assert.ok(cached);
      assert.equal(cached?.preservationGrade, "museum_grade_100yr");
    });

    it("generates valid Convex schema definition for print_preservation_logs", () => {
      const schema = generateConvexPreservationInspectorSchema();
      assert.ok(schema.includes("export const print_preservation_logs = defineTable({"));
      assert.ok(schema.includes(".index(\"by_print\", [\"printId\"])"));
    });
  });
});
