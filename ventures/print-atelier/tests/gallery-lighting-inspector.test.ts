import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateAnnualLuxHours,
  getBasePigmentLightfastnessLuxHours,
  calculateUvDamageFactor,
  inspectGalleryLighting,
  FadingRiskInspectionRequest,
  LightingEnvironment,
} from "../src/lib/gallery-lighting-inspector.ts";

describe("Print Gallery Lighting & Pigment Fading Risk Inspector", () => {
  it("calculates annual lux hours accurately", () => {
    // 150 lux * 10 hours/day * 365 days = 547,500 lux-hours
    const luxHours = calculateAnnualLuxHours(150, 10);
    assert.equal(luxHours, 547_500);
  });

  it("returns base lightfastness capacity by pigment type", () => {
    assert.equal(getBasePigmentLightfastnessLuxHours("ARCHIVAL_PIGMENT"), 100_000_000);
    assert.equal(getBasePigmentLightfastnessLuxHours("WATERCOLOR"), 30_000_000);
    assert.equal(getBasePigmentLightfastnessLuxHours("DYE_BASED"), 10_000_000);
  });

  it("calculates UV damage acceleration factor for harsh light sources", () => {
    const ledFactor = calculateUvDamageFactor(20, "LED_MUSEUM");
    const sunlightFactor = calculateUvDamageFactor(400, "DIRECT_SUNLIGHT");

    assert.equal(ledFactor, 1.0);
    assert.equal(sunlightFactor, 30.0); // 10.0 base * 3.0 (UV >300)
  });

  it("evaluates museum-grade LED gallery lighting as optimal with multi-decade stability", () => {
    const environment: LightingEnvironment = {
      lightSource: "LED_MUSEUM",
      illuminanceLux: 150,
      colorTemperatureKelvin: 3000,
      colorRenderingIndexCri: 98,
      uvOutputMicrowattsPerLumen: 15,
      dailyExposureHours: 10,
    };

    const request: FadingRiskInspectionRequest = {
      pigment: "ARCHIVAL_PIGMENT",
      environment,
    };

    const result = inspectGalleryLighting(request);

    assert.equal(result.lightingQualityGrade, "MUSEUM_GRADE");
    assert.equal(result.isCriOptimalForArtDisplay, true);
    assert.equal(result.pigmentStabilityRating, "HIGHLY_STABLE");
    assert.ok(result.estimatedYearsToFadingNoticeable >= 100);
    assert.equal(result.recommendations.length, 0);
  });

  it("flags hazardous direct sunlight exposure and recommends corrective actions", () => {
    const environment: LightingEnvironment = {
      lightSource: "DIRECT_SUNLIGHT",
      illuminanceLux: 1200,
      colorTemperatureKelvin: 5500,
      colorRenderingIndexCri: 85,
      uvOutputMicrowattsPerLumen: 450,
      dailyExposureHours: 12,
    };

    const request: FadingRiskInspectionRequest = {
      pigment: "DYE_BASED",
      environment,
    };

    const result = inspectGalleryLighting(request);

    assert.equal(result.lightingQualityGrade, "HAZARDOUS_EXPOSURE");
    assert.equal(result.pigmentStabilityRating, "HIGH_RISK_FADING");
    assert.ok(result.estimatedYearsToFadingNoticeable < 5);
    assert.ok(result.recommendations.some((r) => r.includes("Reduce light intensity")));
    assert.ok(result.recommendations.some((r) => r.includes("Install UV-filtering film")));
    assert.ok(result.recommendations.some((r) => r.includes("CCT color temperature")));
  });
});
