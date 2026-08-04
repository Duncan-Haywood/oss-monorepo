import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAnnualLuxHours,
  calculateLightDegradation,
  getGlazingOpticalProperties,
  EnvironmentExposureInput,
} from '../src/lib/art-glass-degradation';

describe('art-glass-degradation', () => {
  it('returns correct optical properties for all glazing types', () => {
    const museum = getGlazingOpticalProperties('museum_anti_reflective_uv');
    assert.equal(museum.uvBlockPercentage, 99.0);
    assert.ok(museum.reflectionPercentage < 1.0);
    assert.equal(museum.conservationGrade, 'museum');

    const acrylic = getGlazingOpticalProperties('standard_uv_acrylic');
    assert.equal(acrylic.uvBlockPercentage, 98.0);
    assert.equal(acrylic.conservationGrade, 'gallery');

    const arGlass = getGlazingOpticalProperties('anti_reflective_glass');
    assert.equal(arGlass.uvBlockPercentage, 70.0);
    assert.equal(arGlass.reflectionPercentage, 1.0);

    const floatGlass = getGlazingOpticalProperties('regular_float_glass');
    assert.equal(floatGlass.uvBlockPercentage, 45.0);
    assert.equal(floatGlass.conservationGrade, 'non_archival');

    const unprotected = getGlazingOpticalProperties('unprotected');
    assert.equal(unprotected.uvBlockPercentage, 0.0);
    assert.equal(unprotected.reflectionPercentage, 0.0);
  });

  it('calculates annual lux-hours accurately', () => {
    // 50 lux * 10 hrs * 365.25 days = 182,625 lux-hours = 0.183 MegaLux-hours
    const luxHours = calculateAnnualLuxHours(50, 10);
    assert.equal(luxHours, 0.183);

    // 500 lux * 12 hrs * 365.25 = 2,191,500 lux-hours = 2.192 MegaLux-hours
    const officeLuxHours = calculateAnnualLuxHours(500, 12);
    assert.equal(officeLuxHours, 2.192);
  });

  it('evaluates archival pigment ink under museum conditions as 100+ years lifespan', () => {
    const input: EnvironmentExposureInput = {
      printId: 'print-001',
      title: 'Ocean Horizon Archival Print',
      pigmentType: 'archival_pigment_ink',
      glazingType: 'museum_anti_reflective_uv',
      ambientLux: 50, // museum standard
      uvIntensityUwLumen: 40, // low UV LED
      exposureHoursPerDay: 8,
    };

    const report = calculateLightDegradation(input);
    assert.equal(report.printId, 'print-001');
    assert.ok(report.estimatedYearsToColorShift >= 100);
    assert.equal(report.durabilityRating, 'archival_100_plus');
    assert.ok(report.opticalClarityScore > 90);
    assert.ok(report.recommendations.includes('Exhibition lighting and glazing meet optimal museum conservation standards'));
  });

  it('detects high degradation risk for dye-based ink under direct sunlight / bright light without UV glass', () => {
    const input: EnvironmentExposureInput = {
      printId: 'print-002',
      title: 'Dye Print Window Display',
      pigmentType: 'dye_based_ink',
      glazingType: 'regular_float_glass',
      ambientLux: 600, // bright room/window
      uvIntensityUwLumen: 350, // direct natural light UV
      exposureHoursPerDay: 12,
    };

    const report = calculateLightDegradation(input);
    assert.ok(report.estimatedYearsToColorShift < 15);
    assert.equal(report.durabilityRating, 'at_risk_under_20');
    assert.ok(report.recommendations.length > 1);
    assert.ok(report.recommendations.some(r => r.includes('Reduce ambient lighting')));
    assert.ok(report.recommendations.some(r => r.includes('re-printing artwork with archival giclée')));
  });

  it('recommends Anti-Reflective glazing when reflection percentage exceeds 5%', () => {
    const input: EnvironmentExposureInput = {
      printId: 'print-003',
      title: 'Gallery Landscape',
      pigmentType: 'silver_halide',
      glazingType: 'standard_uv_acrylic', // 8% reflection
      ambientLux: 100,
      uvIntensityUwLumen: 50,
      exposureHoursPerDay: 10,
    };

    const report = calculateLightDegradation(input);
    assert.ok(report.recommendations.some(r => r.includes('anti-reflective (AR)')));
  });

  it('adjusts estimated years proportionally when target ΔE threshold is changed', () => {
    const baseInput: EnvironmentExposureInput = {
      printId: 'print-004',
      title: 'Monochrome Portrait',
      pigmentType: 'metallic_chrome',
      glazingType: 'anti_reflective_glass',
      ambientLux: 200,
      uvIntensityUwLumen: 100,
      exposureHoursPerDay: 10,
    };

    const defaultReport = calculateLightDegradation({ ...baseInput, targetDeltaEThreshold: 3.0 });
    const strictReport = calculateLightDegradation({ ...baseInput, targetDeltaEThreshold: 1.5 });

    assert.ok(strictReport.estimatedYearsToColorShift < defaultReport.estimatedYearsToColorShift);
  });
});

