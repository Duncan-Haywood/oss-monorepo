import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateSeismicSafetyMultiplier,
  getHardwareShearCapacityLbs,
  evaluateGlazingSafety,
  inspectSeismicMountingSafety,
  SeismicInspectionRequest,
  FramingSpecs,
} from "../src/lib/seismic-mounting-inspector.ts";

describe("Fine Art Framing Seismic & Glazing Safety Inspector", () => {
  it("calculates seismic safety multipliers based on zone, acceleration, and height", () => {
    const lowZone = calculateSeismicSafetyMultiplier("LOW_ZONE_1", 0.1, 5);
    const criticalZoneHighElevated = calculateSeismicSafetyMultiplier("CRITICAL_ZONE_4", 0.5, 15);

    assert.equal(lowZone, 2.0);
    // Base 4.5 + Acceleration >0.4 (+1.0) + Height >12 (+1.5) = 7.0
    assert.equal(criticalZoneHighElevated, 7.0);
  });

  it("returns correct nominal hardware shear capacity in lbs", () => {
    assert.equal(getHardwareShearCapacityLbs("SINGLE_D_RING"), 15);
    assert.equal(getHardwareShearCapacityLbs("DUAL_D_RING"), 35);
    assert.equal(getHardwareShearCapacityLbs("FRENCH_CLEAT_ALUMINUM"), 100);
    assert.equal(getHardwareShearCapacityLbs("SEISMIC_LOCKING_CLEAT"), 250);
  });

  it("evaluates glazing safety and flags shatter hazards in public/seismic spaces", () => {
    const acrylicSafe = evaluateGlazingSafety("ACRYLIC_ANTI_SHATTER", true, true);
    const floatGlassPublicFail = evaluateGlazingSafety("STANDARD_FLOAT", true, false);
    const museumGlassPrivateAcceptable = evaluateGlazingSafety("MUSEUM_WATER_WHITE", false, false);

    assert.equal(acrylicSafe, "PASS_SHATTERPROOF");
    assert.equal(floatGlassPublicFail, "FAIL_SHATTER_HAZARD");
    assert.equal(museumGlassPrivateAcceptable, "PASS_ACCEPTED_RISK");
  });

  it("approves robust museum seismic installation with acrylic anti-shatter glazing", () => {
    const framing: FramingSpecs = {
      artworkWidthInches: 48,
      artworkHeightInches: 60,
      totalWeightLbs: 25,
      glazingType: "ACRYLIC_ANTI_SHATTER",
      mountingHardware: "SEISMIC_LOCKING_CLEAT",
      installedHeightFeet: 6,
      isPublicSpace: true,
    };

    const request: SeismicInspectionRequest = {
      framing,
      seismicZone: "HIGH_ZONE_3",
      expectedPeakGroundAccelerationG: 0.3,
    };

    const evalResult = inspectSeismicMountingSafety(request);

    assert.equal(evalResult.isHardwareCapacitySufficient, true);
    assert.equal(evalResult.glazingSafetyRating, "PASS_SHATTERPROOF");
    assert.equal(evalResult.isApprovedForPublicExhibition, true);
    assert.ok(evalResult.seismicSafetyScore >= 90);
    assert.equal(evalResult.recommendations.length, 0);
  });

  it("rejects inadequate hardware and glass glazing in public high-seismic zone", () => {
    const framing: FramingSpecs = {
      artworkWidthInches: 36,
      artworkHeightInches: 48,
      totalWeightLbs: 30,
      glazingType: "STANDARD_FLOAT",
      mountingHardware: "SINGLE_D_RING",
      installedHeightFeet: 10,
      isPublicSpace: true,
    };

    const request: SeismicInspectionRequest = {
      framing,
      seismicZone: "CRITICAL_ZONE_4",
      expectedPeakGroundAccelerationG: 0.45,
    };

    const evalResult = inspectSeismicMountingSafety(request);

    assert.equal(evalResult.isHardwareCapacitySufficient, false);
    assert.equal(evalResult.glazingSafetyRating, "FAIL_SHATTER_HAZARD");
    assert.equal(evalResult.isApprovedForPublicExhibition, false);
    assert.ok(evalResult.seismicSafetyScore < 50);
    assert.ok(evalResult.recommendations.some((r) => r.includes("Upgrade mounting hardware")));
    assert.ok(evalResult.recommendations.some((r) => r.includes("Replace glass glazing")));
    assert.ok(evalResult.recommendations.some((r) => r.includes("safety aircraft cable tethers")));
  });
});
