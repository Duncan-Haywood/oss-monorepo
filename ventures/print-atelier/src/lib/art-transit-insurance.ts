/**
 * Print Exhibition Artwork Insurance Appraisal & Transit Risk Scorer
 *
 * Calculates appraisal valuation, transit risk tier, insurance coverage recommendations,
 * and transport climate control requirements for fine art print shipments and gallery exhibitions.
 */

export interface ArtworkAppraisalInput {
  artworkId: string;
  title: string;
  artistTier: 'emerging' | 'established' | 'master';
  medium: 'archival_giclee' | 'canvas' | 'metallic_paper' | 'acrylic_flush';
  dimensionsInches: { width: number; height: number };
  editionType: 'limited' | 'open' | 'artist_proof' | 'one_of_one';
  editionNumber?: number;
  totalEditionSize?: number;
  baseRetailPriceUsd: number;
  framingGrade: 'museum_uv_glass' | 'standard_acrylic' | 'unframed';
}

export interface TransitRiskInput {
  originCountry: string;
  destinationCountry: string;
  distanceKm: number;
  courierTier: 'white_glove' | 'art_freight' | 'standard_express';
  climateControlRequired: boolean;
  transitDaysEstimated: number;
  transitSeason: 'winter' | 'spring' | 'summer' | 'autumn';
}

export interface InsurancePolicyRecommendation {
  appraisedValueUsd: number;
  transitRiskScore: number; // 0 - 100
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  recommendedPolicyTier: 'basic_transit' | 'all_risk_exhibition' | 'museum_wall_to_wall';
  estimatedPremiumUsd: number;
  deductibleUsd: number;
  requiredMitigations: string[];
  climateControlMandatory: boolean;
}

/**
 * Calculates appraised insurance value for an artwork based on edition rarity and artist tier
 */
export function calculateArtworkAppraisal(input: ArtworkAppraisalInput): number {
  let multiplier = 1.0;

  switch (input.artistTier) {
    case 'established':
      multiplier *= 1.45;
      break;
    case 'master':
      multiplier *= 2.2;
      break;
    default:
      multiplier *= 1.0;
  }

  switch (input.editionType) {
    case 'one_of_one':
      multiplier *= 3.0;
      break;
    case 'artist_proof':
      multiplier *= 1.75;
      break;
    case 'limited':
      if (input.totalEditionSize && input.totalEditionSize <= 25) {
        multiplier *= 1.4;
      } else {
        multiplier *= 1.2;
      }
      break;
    default:
      multiplier *= 1.0;
  }

  if (input.framingGrade === 'museum_uv_glass') {
    multiplier += 0.15;
  }

  const rawValuation = input.baseRetailPriceUsd * multiplier;
  return Math.round(rawValuation * 100) / 100;
}

/**
 * Evaluates transit risk score (0-100) and recommends insurance policy parameters
 */
export function scoreTransitRisk(
  appraisal: ArtworkAppraisalInput,
  transit: TransitRiskInput
): InsurancePolicyRecommendation {
  const appraisedValue = calculateArtworkAppraisal(appraisal);
  let riskScore = 15; // base risk score

  // Distance risk
  if (transit.distanceKm > 5000) riskScore += 25;
  else if (transit.distanceKm > 1500) riskScore += 15;
  else if (transit.distanceKm > 500) riskScore += 8;

  // Cross-border risk
  if (transit.originCountry.toUpperCase() !== transit.destinationCountry.toUpperCase()) {
    riskScore += 15;
  }

  // Courier tier risk reduction or penalty
  if (transit.courierTier === 'standard_express') {
    riskScore += 20;
  } else if (transit.courierTier === 'art_freight') {
    riskScore += 5;
  } else if (transit.courierTier === 'white_glove') {
    riskScore -= 10;
  }

  // Transit duration
  if (transit.transitDaysEstimated > 7) riskScore += 15;
  else if (transit.transitDaysEstimated > 3) riskScore += 8;

  // Seasonal climate risk
  if (transit.transitSeason === 'winter' || transit.transitSeason === 'summer') {
    if (!transit.climateControlRequired) {
      riskScore += 15;
    }
  }

  // Large format vulnerability
  const areaSqIn = appraisal.dimensionsInches.width * appraisal.dimensionsInches.height;
  if (areaSqIn > 1200) riskScore += 10;

  // Clamp score
  riskScore = Math.max(0, Math.min(100, riskScore));

  let riskLevel: 'low' | 'moderate' | 'high' | 'critical' = 'low';
  if (riskScore >= 75) riskLevel = 'critical';
  else if (riskScore >= 50) riskLevel = 'high';
  else if (riskScore >= 30) riskLevel = 'moderate';

  let recommendedPolicyTier: 'basic_transit' | 'all_risk_exhibition' | 'museum_wall_to_wall' = 'basic_transit';
  if (appraisedValue > 10000 || riskLevel === 'critical') {
    recommendedPolicyTier = 'museum_wall_to_wall';
  } else if (appraisedValue > 2500 || riskLevel === 'high' || riskLevel === 'moderate') {
    recommendedPolicyTier = 'all_risk_exhibition';
  }

  let ratePercentage = 0.005; // 0.5% base
  if (recommendedPolicyTier === 'museum_wall_to_wall') ratePercentage = 0.012;
  else if (recommendedPolicyTier === 'all_risk_exhibition') ratePercentage = 0.008;

  const estimatedPremiumUsd = Math.max(50, Math.round(appraisedValue * ratePercentage * 100) / 100);

  let deductibleUsd = 100;
  if (appraisedValue >= 10000) deductibleUsd = 500;
  else if (appraisedValue >= 5000) deductibleUsd = 250;

  const requiredMitigations: string[] = [];
  if (riskScore >= 40 || transit.climateControlRequired) {
    requiredMitigations.push('Use thermostatic climate-controlled crate');
  }
  if (appraisedValue > 5000 || transit.courierTier === 'standard_express') {
    requiredMitigations.push('Require GPS real-time location and shock-sensor tracking tag');
  }
  if (appraisal.framingGrade === 'unframed') {
    requiredMitigations.push('Acid-free archival glassine sleeve with rigid corner protectors');
  }
  if (transit.originCountry.toUpperCase() !== transit.destinationCountry.toUpperCase()) {
    requiredMitigations.push('Pre-cleared ATA Carnet or customs bond documentation');
  }

  return {
    appraisedValueUsd: appraisedValue,
    transitRiskScore: riskScore,
    riskLevel,
    recommendedPolicyTier,
    estimatedPremiumUsd,
    deductibleUsd,
    requiredMitigations,
    climateControlMandatory: transit.climateControlRequired || riskScore >= 50,
  };
}
