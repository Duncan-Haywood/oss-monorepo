import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  calculateCarbonFootprint,
  summarizeCarbonFootprints,
  generateConvexCarbonOffsetSchema,
  carbonOffsetStore,
  PrintPackagePayload,
} from "../src/lib/carbon-offset-estimator.js";

describe("carbon-offset-estimator", () => {
  beforeEach(() => {
    carbonOffsetStore.clear();
  });

  const samplePackage: PrintPackagePayload = {
    packageId: "pkg_art_print_101",
    printDimensionsInches: { width: 24, height: 36 },
    weightGrams: 850,
    shippingDistanceKm: 1200,
    packagingMaterial: "fsc_certified_kraft",
    shippingCarrier: "fedex_ground",
    isFrameIncluded: false,
  };

  describe("calculateCarbonFootprint", () => {
    it("calculates packaging & transport emissions and identifies FSC certified packaging", () => {
      const result = calculateCarbonFootprint(samplePackage);

      assert.equal(result.packageId, "pkg_art_print_101");
      assert.equal(result.certification, "fsc_certified");
      assert.equal(result.isEcoFriendlyCertified, true);
      assert.equal(result.ecoBadgeLabel, "FSC® 100% Sustainable Kraft");
      assert.ok(result.totalEmissionsGramsCo2 > 0);
      assert.ok(result.carbonOffsetCostCents >= 1);
      assert.ok(result.notes.some((n) => n.includes("Certified FSC packaging")));
    });

    it("evaluates home compostable packaging wrap", () => {
      const compostablePkg: PrintPackagePayload = {
        ...samplePackage,
        packagingMaterial: "biodegradable_bubble_wrap",
      };

      const result = calculateCarbonFootprint(compostablePkg);

      assert.equal(result.certification, "home_compostable");
      assert.equal(result.isEcoFriendlyCertified, true);
      assert.equal(result.ecoBadgeLabel, "100% Home Compostable Protective Wrap");
    });

    it("evaluates 100% recycled cardboard packaging", () => {
      const recycledPkg: PrintPackagePayload = {
        ...samplePackage,
        packagingMaterial: "recycled_cardboard",
      };

      const result = calculateCarbonFootprint(recycledPkg);

      assert.equal(result.certification, "100_percent_recycled");
      assert.equal(result.isEcoFriendlyCertified, true);
      assert.equal(result.ecoBadgeLabel, "100% Recycled Rigid Board");
    });

    it("flags conventional plastic packaging as non-eco-friendly", () => {
      const plasticPkg: PrintPackagePayload = {
        ...samplePackage,
        packagingMaterial: "standard_plastic",
      };

      const result = calculateCarbonFootprint(plasticPkg);

      assert.equal(result.certification, "conventional");
      assert.equal(result.isEcoFriendlyCertified, false);
      assert.equal(result.ecoBadgeLabel, "Standard Packaging");
      assert.ok(result.notes.some((n) => n.includes("Conventional plastic packaging material")));
    });

    it("adjusts emissions when wooden frame is included", () => {
      const framedPkg: PrintPackagePayload = {
        ...samplePackage,
        isFrameIncluded: true,
      };

      const unframedResult = calculateCarbonFootprint(samplePackage);
      const framedResult = calculateCarbonFootprint(framedPkg);

      assert.ok(framedResult.transportEmissionsGramsCo2 > unframedResult.transportEmissionsGramsCo2);
      assert.ok(framedResult.notes.some((n) => n.includes("Package includes protective framing")));
    });
  });

  describe("summarizeCarbonFootprints", () => {
    it("aggregates total weight, total emissions, carbon offset cost, and eco percentage", () => {
      const p1 = samplePackage;
      const p2: PrintPackagePayload = {
        packageId: "pkg_art_print_102",
        printDimensionsInches: { width: 12, height: 18 },
        weightGrams: 400,
        shippingDistanceKm: 500,
        packagingMaterial: "standard_plastic",
        shippingCarrier: "usps_priority",
        isFrameIncluded: false,
      };

      const summary = summarizeCarbonFootprints([p1, p2]);

      assert.equal(summary.totalPackages, 2);
      assert.equal(summary.totalWeightKg, 1.25);
      assert.equal(summary.ecoCertifiedPercentage, 50);
      assert.ok(summary.totalEmissionsKgCo2 > 0);
      assert.ok(summary.averageEmissionsPerPackageGrams > 0);
    });

    it("handles empty package list gracefully", () => {
      const summary = summarizeCarbonFootprints([]);
      assert.equal(summary.totalPackages, 0);
      assert.equal(summary.totalWeightKg, 0);
    });
  });

  describe("carbonOffsetStore & Convex schema", () => {
    it("registers and retrieves package from in-memory store", () => {
      carbonOffsetStore.registerPackage(samplePackage);
      const retrieved = carbonOffsetStore.getPackage("pkg_art_print_101");

      assert.ok(retrieved);
      assert.equal(retrieved?.packagingMaterial, "fsc_certified_kraft");
    });

    it("generates valid Convex schema definition for carbon_offset_logs", () => {
      const schema = generateConvexCarbonOffsetSchema();
      assert.ok(schema.includes("export const carbon_offset_logs = defineTable({"));
      assert.ok(schema.includes(".index(\"by_package\", [\"packageId\"])"));
    });
  });
});
