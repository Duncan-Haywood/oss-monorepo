import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateArtworkAppraisal,
  scoreTransitRisk,
  ArtworkAppraisalInput,
  TransitRiskInput,
} from '../src/lib/art-transit-insurance';

test('calculateArtworkAppraisal applies artist tier and edition multipliers', () => {
  const input: ArtworkAppraisalInput = {
    artworkId: 'art-001',
    title: 'Midnight Solitude',
    artistTier: 'master',
    medium: 'archival_giclee',
    dimensionsInches: { width: 24, height: 36 },
    editionType: 'one_of_one',
    baseRetailPriceUsd: 1000,
    framingGrade: 'museum_uv_glass',
  };

  const valuation = calculateArtworkAppraisal(input);
  // master (2.2) * one_of_one (3.0) + museum_uv_glass (+0.15 => 2.2 * 3.0 + 0.15 = 6.75) * 1000 = 6750
  assert.ok(valuation > 6000, `Expected valuation > 6000, got ${valuation}`);
});

test('scoreTransitRisk calculates risk level, mitigations, and premium', () => {
  const appraisal: ArtworkAppraisalInput = {
    artworkId: 'art-002',
    title: 'Abstract Echoes',
    artistTier: 'established',
    medium: 'canvas',
    dimensionsInches: { width: 40, height: 50 },
    editionType: 'limited',
    totalEditionSize: 10,
    baseRetailPriceUsd: 2500,
    framingGrade: 'standard_acrylic',
  };

  const transit: TransitRiskInput = {
    originCountry: 'US',
    destinationCountry: 'UK',
    distanceKm: 6500,
    courierTier: 'standard_express',
    climateControlRequired: true,
    transitDaysEstimated: 8,
    transitSeason: 'winter',
  };

  const result = scoreTransitRisk(appraisal, transit);

  assert.ok(result.appraisedValueUsd > 2500);
  assert.ok(result.transitRiskScore > 50, `Expected risk score > 50, got ${result.transitRiskScore}`);
  assert.equal(result.riskLevel === 'high' || result.riskLevel === 'critical', true);
  assert.ok(result.requiredMitigations.length >= 2);
  assert.equal(result.climateControlMandatory, true);
  assert.ok(result.estimatedPremiumUsd > 0);
});
