/**
 * Print Gallery Framing Glass Anti-Reflective Coating & Museum Light Degradation Calculator
 *
 * Calculates light exposure degradation rate, anti-reflective optical clarity,
 * estimated years until color shift (ΔE threshold), and conservation recommendations
 * for fine art prints based on glazing type, pigment durability, and lighting environment.
 */

export type GlazingType =
  | 'museum_anti_reflective_uv' // 99% UV protection, <1% reflection
  | 'standard_uv_acrylic'        // 98% UV protection, ~8% reflection
  | 'anti_reflective_glass'      // 70% UV protection, <1% reflection
  | 'regular_float_glass'        // 45% UV protection, ~8% reflection
  | 'unprotected';               // 0% UV protection, 0% reflection (no glass)

export type PigmentType =
  | 'archival_pigment_ink' // High permanence (Blue Wool Scale 7-8)
  | 'dye_based_ink'        // Low permanence (Blue Wool Scale 3-4)
  | 'silver_halide'        // Moderate permanence (Blue Wool Scale 5-6)
  | 'metallic_chrome';     // Moderate-high permanence (Blue Wool Scale 6-7)

export interface EnvironmentExposureInput {
  printId: string;
  title: string;
  pigmentType: PigmentType;
  glazingType: GlazingType;
  ambientLux: number;          // e.g., 50 lux for museum standard, 500 for bright office
  uvIntensityUwLumen: number;  // µW/lumen (e.g. <75 µW/lumen museum standard, 300+ direct sunlight)
  exposureHoursPerDay: number; // e.g. 10 hours/day
  targetDeltaEThreshold?: number; // ΔE color shift tolerance (default 3.0 = perceptually noticeable)
}

export interface GlazingOpticalProperties {
  uvBlockPercentage: number;
  reflectionPercentage: number;
  lightTransmissionPercentage: number;
  conservationGrade: 'museum' | 'gallery' | 'commercial' | 'non_archival';
}

export interface LightDegradationReport {
  printId: string;
  title: string;
  glazingProperties: GlazingOpticalProperties;
  annualLuxHours: number; // MegaLux-hours per year
  annualUvDoseJoulesPerM2: number;
  estimatedYearsToColorShift: number; // Years to ΔE threshold
  durabilityRating: 'archival_100_plus' | 'long_term_50_plus' | 'moderate_20_plus' | 'at_risk_under_20';
  opticalClarityScore: number; // 0 - 100
  recommendedMaxLux: number;
  recommendations: string[];
}

/**
 * Returns optical properties of framing glazing types
 */
export function getGlazingOpticalProperties(glazing: GlazingType): GlazingOpticalProperties {
  switch (glazing) {
    case 'museum_anti_reflective_uv':
      return {
        uvBlockPercentage: 99.0,
        reflectionPercentage: 0.8,
        lightTransmissionPercentage: 97.0,
        conservationGrade: 'museum',
      };
    case 'standard_uv_acrylic':
      return {
        uvBlockPercentage: 98.0,
        reflectionPercentage: 8.0,
        lightTransmissionPercentage: 92.0,
        conservationGrade: 'gallery',
      };
    case 'anti_reflective_glass':
      return {
        uvBlockPercentage: 70.0,
        reflectionPercentage: 1.0,
        lightTransmissionPercentage: 96.0,
        conservationGrade: 'commercial',
      };
    case 'regular_float_glass':
      return {
        uvBlockPercentage: 45.0,
        reflectionPercentage: 8.0,
        lightTransmissionPercentage: 90.0,
        conservationGrade: 'non_archival',
      };
    case 'unprotected':
      return {
        uvBlockPercentage: 0.0,
        reflectionPercentage: 0.0,
        lightTransmissionPercentage: 100.0,
        conservationGrade: 'non_archival',
      };
  }
}

/**
 * Calculates annual Megalux-hours exposure
 */
export function calculateAnnualLuxHours(ambientLux: number, hoursPerDay: number): number {
  const totalLuxHours = ambientLux * hoursPerDay * 365.25;
  return Math.round((totalLuxHours / 1_000_000) * 1000) / 1000; // MegaLux-hours
}

/**
 * Calculates light degradation and lifespan until ΔE color shift threshold is reached
 */
export function calculateLightDegradation(input: EnvironmentExposureInput): LightDegradationReport {
  const deltaEThreshold = input.targetDeltaEThreshold ?? 3.0;
  const glazingProps = getGlazingOpticalProperties(input.glazingType);
  const annualMegaluxHours = calculateAnnualLuxHours(input.ambientLux, input.exposureHoursPerDay);

  // Base pigment tolerance before ΔE color shift (in MegaLux-hours under 0% UV)
  let baseToleranceMegaluxHours = 10.0; // default for dye
  switch (input.pigmentType) {
    case 'archival_pigment_ink':
      baseToleranceMegaluxHours = 100.0;
      break;
    case 'metallic_chrome':
      baseToleranceMegaluxHours = 60.0;
      break;
    case 'silver_halide':
      baseToleranceMegaluxHours = 35.0;
      break;
    case 'dye_based_ink':
      baseToleranceMegaluxHours = 8.0;
      break;
  }

  // Adjust tolerance based on UV intensity factor & glazing UV filtration
  const unblockedUvFraction = Math.max(0.01, (100 - glazingProps.uvBlockPercentage) / 100);
  const uvFactor = 1.0 + (input.uvIntensityUwLumen / 75.0 - 1.0) * unblockedUvFraction;

  // Effective annual degradation damage units
  const effectiveAnnualDamage = (annualMegaluxHours / baseToleranceMegaluxHours) * Math.max(0.1, uvFactor);

  // Scaled by ΔE threshold ratio (relative to baseline ΔE = 3.0)
  const yearsToColorShift = Math.max(0.5, (deltaEThreshold / 3.0) / effectiveAnnualDamage);
  const roundedYears = Math.round(yearsToColorShift * 10) / 10;

  // Optical clarity score combines high transmission and low reflection
  const opticalClarityScore = Math.round(
    glazingProps.lightTransmissionPercentage * 0.7 + (10 - Math.min(10, glazingProps.reflectionPercentage)) * 3.0
  );

  let durabilityRating: 'archival_100_plus' | 'long_term_50_plus' | 'moderate_20_plus' | 'at_risk_under_20' = 'at_risk_under_20';
  if (roundedYears >= 100) durabilityRating = 'archival_100_plus';
  else if (roundedYears >= 50) durabilityRating = 'long_term_50_plus';
  else if (roundedYears >= 20) durabilityRating = 'moderate_20_plus';

  const recommendations: string[] = [];

  if (input.ambientLux > 200) {
    recommendations.push(`Reduce ambient lighting from ${input.ambientLux} lux to 50-100 lux museum standard`);
  }
  if (input.uvIntensityUwLumen > 75 && glazingProps.uvBlockPercentage < 95) {
    recommendations.push('Upgrade to 99% UV-filtering museum glass or apply UV-blocking window film');
  }
  if (glazingProps.reflectionPercentage > 5.0) {
    recommendations.push('Switch to anti-reflective (AR) coated glazing to eliminate glare and enhance clarity');
  }
  if (input.pigmentType === 'dye_based_ink') {
    recommendations.push('Consider re-printing artwork with archival giclée pigment inks for 10x durability');
  }
  if (recommendations.length === 0) {
    recommendations.push('Exhibition lighting and glazing meet optimal museum conservation standards');
  }

  const recommendedMaxLux = input.pigmentType === 'archival_pigment_ink' ? 150 : 50;

  // Calculate annual UV dose in Joules / m^2 approx
  const annualUvDoseJoulesPerM2 = Math.round(
    annualMegaluxHours * 1000 * (input.uvIntensityUwLumen / 1000) * unblockedUvFraction * 100
  ) / 100;

  return {
    printId: input.printId,
    title: input.title,
    glazingProperties: glazingProps,
    annualLuxHours: annualMegaluxHours,
    annualUvDoseJoulesPerM2,
    estimatedYearsToColorShift: roundedYears,
    durabilityRating,
    opticalClarityScore,
    recommendedMaxLux,
    recommendations,
  };
}
