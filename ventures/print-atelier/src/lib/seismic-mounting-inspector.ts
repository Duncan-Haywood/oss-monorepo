export type GlazingType = "STANDARD_FLOAT" | "ANTI_REFLECTIVE_GLASS" | "MUSEUM_WATER_WHITE" | "ACRYLIC_STANDARD" | "ACRYLIC_ANTI_SHATTER";
export type MountingHardwareType = "SINGLE_D_RING" | "DUAL_D_RING" | "PICTURE_WIRE" | "FRENCH_CLEAT_ALUMINUM" | "SEISMIC_LOCKING_CLEAT";
export type SeismicZoneRating = "LOW_ZONE_1" | "MODERATE_ZONE_2" | "HIGH_ZONE_3" | "CRITICAL_ZONE_4";

export interface FramingSpecs {
  artworkWidthInches: number;
  artworkHeightInches: number;
  totalWeightLbs: number;
  glazingType: GlazingType;
  mountingHardware: MountingHardwareType;
  installedHeightFeet: number;
  isPublicSpace: boolean;
}

export interface SeismicInspectionRequest {
  framing: FramingSpecs;
  seismicZone: SeismicZoneRating;
  expectedPeakGroundAccelerationG: number; // e.g. 0.1g to 0.6g
}

export interface SeismicSafetyEvaluation {
  hardwareSafetyFactor: number;
  requiredHardwareCapacityLbs: number;
  isHardwareCapacitySufficient: boolean;
  glazingSafetyRating: "PASS_SHATTERPROOF" | "PASS_ACCEPTED_RISK" | "FAIL_SHATTER_HAZARD";
  seismicSafetyScore: number; // 0-100
  isApprovedForPublicExhibition: boolean;
  recommendations: string[];
}

/**
 * Calculates safety factor multiplier based on seismic zone and installation height.
 */
export function calculateSeismicSafetyMultiplier(
  zone: SeismicZoneRating,
  peakGroundAccelerationG: number,
  installedHeightFeet: number
): number {
  let baseMultiplier = 2.0;

  switch (zone) {
    case "CRITICAL_ZONE_4":
      baseMultiplier = 4.5;
      break;
    case "HIGH_ZONE_3":
      baseMultiplier = 3.5;
      break;
    case "MODERATE_ZONE_2":
      baseMultiplier = 2.5;
      break;
    case "LOW_ZONE_1":
      baseMultiplier = 2.0;
      break;
  }

  // Adjust for high ground acceleration
  if (peakGroundAccelerationG > 0.4) {
    baseMultiplier += 1.0;
  } else if (peakGroundAccelerationG > 0.2) {
    baseMultiplier += 0.5;
  }

  // Height amplification factor (over 8 feet high adds risk)
  if (installedHeightFeet > 12) {
    baseMultiplier += 1.5;
  } else if (installedHeightFeet > 8) {
    baseMultiplier += 0.8;
  }

  return Math.round(baseMultiplier * 10) / 10;
}

/**
 * Gets nominal shear capacity in Lbs for a given hardware type.
 */
export function getHardwareShearCapacityLbs(hardware: MountingHardwareType): number {
  switch (hardware) {
    case "SINGLE_D_RING":
      return 15;
    case "DUAL_D_RING":
      return 35;
    case "PICTURE_WIRE":
      return 25;
    case "FRENCH_CLEAT_ALUMINUM":
      return 100;
    case "SEISMIC_LOCKING_CLEAT":
      return 250;
  }
}

/**
 * Evaluates glazing safety for seismic and public display hazards.
 */
export function evaluateGlazingSafety(
  glazing: GlazingType,
  isPublicSpace: boolean,
  isHighSeismicZone: boolean
): "PASS_SHATTERPROOF" | "PASS_ACCEPTED_RISK" | "FAIL_SHATTER_HAZARD" {
  if (glazing === "ACRYLIC_ANTI_SHATTER" || glazing === "ACRYLIC_STANDARD") {
    return "PASS_SHATTERPROOF";
  }

  if (isPublicSpace || isHighSeismicZone) {
    if (glazing === "STANDARD_FLOAT" || glazing === "ANTI_REFLECTIVE_GLASS") {
      return "FAIL_SHATTER_HAZARD";
    }
  }

  return "PASS_ACCEPTED_RISK";
}

/**
 * Evaluates total seismic mounting safety and returns actionable recommendations.
 */
export function inspectSeismicMountingSafety(request: SeismicInspectionRequest): SeismicSafetyEvaluation {
  const { framing, seismicZone, expectedPeakGroundAccelerationG } = request;
  const isHighSeismic = seismicZone === "HIGH_ZONE_3" || seismicZone === "CRITICAL_ZONE_4";

  const multiplier = calculateSeismicSafetyMultiplier(
    seismicZone,
    expectedPeakGroundAccelerationG,
    framing.installedHeightFeet
  );

  const requiredHardwareCapacityLbs = Math.round(framing.totalWeightLbs * multiplier);
  const nominalCapacityLbs = getHardwareShearCapacityLbs(framing.mountingHardware);

  const hardwareSafetyFactor = Math.round((nominalCapacityLbs / Math.max(framing.totalWeightLbs, 1)) * 10) / 10;
  const isHardwareCapacitySufficient = nominalCapacityLbs >= requiredHardwareCapacityLbs;

  const glazingSafetyRating = evaluateGlazingSafety(framing.glazingType, framing.isPublicSpace, isHighSeismic);

  const recommendations: string[] = [];

  if (!isHardwareCapacitySufficient) {
    recommendations.push(
      `Upgrade mounting hardware from ${framing.mountingHardware} (rated ${nominalCapacityLbs} lbs) to FRENCH_CLEAT_ALUMINUM or SEISMIC_LOCKING_CLEAT (required minimum: ${requiredHardwareCapacityLbs} lbs).`
    );
  }

  if (glazingSafetyRating === "FAIL_SHATTER_HAZARD") {
    recommendations.push(
      `Replace glass glazing (${framing.glazingType}) with ACRYLIC_ANTI_SHATTER to eliminate glass shard hazard in public/seismic environments.`
    );
  }

  if (framing.installedHeightFeet > 8 && framing.mountingHardware !== "SEISMIC_LOCKING_CLEAT") {
    recommendations.push(
      "Add secondary stainless steel safety aircraft cable tethers for elevated installations above 8 feet."
    );
  }

  // Calculate overall safety score (0 to 100)
  let score = 100;
  if (!isHardwareCapacitySufficient) score -= 40;
  if (glazingSafetyRating === "FAIL_SHATTER_HAZARD") score -= 35;
  if (glazingSafetyRating === "PASS_ACCEPTED_RISK") score -= 10;
  if (hardwareSafetyFactor < multiplier) score -= 15;

  const seismicSafetyScore = Math.max(0, Math.min(100, score));

  const isApprovedForPublicExhibition =
    isHardwareCapacitySufficient &&
    glazingSafetyRating !== "FAIL_SHATTER_HAZARD" &&
    seismicSafetyScore >= 75;

  return {
    hardwareSafetyFactor,
    requiredHardwareCapacityLbs,
    isHardwareCapacitySufficient,
    glazingSafetyRating,
    seismicSafetyScore,
    isApprovedForPublicExhibition,
    recommendations,
  };
}
