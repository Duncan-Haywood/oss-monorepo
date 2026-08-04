export type PigmentType = "ARCHIVAL_PIGMENT" | "DYE_BASED" | "OIL_PAINT" | "WATERCOLOR" | "GICLEE_CANVAS";
export type LightSourceType = "LED_MUSEUM" | "INCANDESCENT" | "HALOGEN" | "FLUORESCENT" | "DIRECT_SUNLIGHT";

export interface LightingEnvironment {
  lightSource: LightSourceType;
  illuminanceLux: number;
  colorTemperatureKelvin: number; // e.g. 2700K to 6500K
  colorRenderingIndexCri: number; // 0-100
  uvOutputMicrowattsPerLumen: number;
  dailyExposureHours: number;
}

export interface FadingRiskInspectionRequest {
  pigment: PigmentType;
  environment: LightingEnvironment;
}

export interface FadingRiskInspectionResult {
  annualLuxHours: number;
  annualUvExposureMicrowattsHour: number;
  pigmentStabilityRating: "HIGHLY_STABLE" | "MODERATELY_STABLE" | "HIGH_RISK_FADING";
  estimatedYearsToFadingNoticeable: number;
  lightingQualityGrade: "MUSEUM_GRADE" | "COMMERCIAL_ACCEPTABLE" | "SUBOPTIMAL_LIGHTING" | "HAZARDOUS_EXPOSURE";
  isCriOptimalForArtDisplay: boolean;
  recommendations: string[];
}

/**
 * Calculates annual lux hours of light exposure.
 */
export function calculateAnnualLuxHours(illuminanceLux: number, dailyHours: number): number {
  return Math.round(illuminanceLux * dailyHours * 365);
}

/**
 * Gets base lightfastness rating factor in lux-hours before noticeable fading (delta E >= 3).
 */
export function getBasePigmentLightfastnessLuxHours(pigment: PigmentType): number {
  switch (pigment) {
    case "ARCHIVAL_PIGMENT":
      return 100_000_000; // ~100 years at museum standard 50 lux, 10h/day (182,500 lux-h/yr)
    case "GICLEE_CANVAS":
      return 60_000_000;
    case "OIL_PAINT":
      return 80_000_000;
    case "WATERCOLOR":
      return 30_000_000;
    case "DYE_BASED":
      return 10_000_000; // ~5 years under bright light
  }
}

/**
 * Gets UV damage acceleration factor. UV above 75 uW/lumen accelerates fading drastically.
 */
export function calculateUvDamageFactor(uvMicrowattsPerLumen: number, lightSource: LightSourceType): number {
  let baseFactor = 1.0;
  if (lightSource === "DIRECT_SUNLIGHT") {
    baseFactor = 10.0;
  } else if (lightSource === "FLUORESCENT") {
    baseFactor = 2.5;
  } else if (lightSource === "HALOGEN") {
    baseFactor = 1.8;
  } else if (lightSource === "LED_MUSEUM") {
    baseFactor = 1.0;
  }

  if (uvMicrowattsPerLumen > 300) {
    baseFactor *= 3.0;
  } else if (uvMicrowattsPerLumen > 75) {
    baseFactor *= 1.8;
  }

  return Math.round(baseFactor * 10) / 10;
}

/**
 * Inspects gallery lighting and predicts pigment fading risk and display quality.
 */
export function inspectGalleryLighting(request: FadingRiskInspectionRequest): FadingRiskInspectionResult {
  const { pigment, environment } = request;

  const annualLuxHours = calculateAnnualLuxHours(environment.illuminanceLux, environment.dailyExposureHours);
  const annualUvExposureMicrowattsHour = Math.round(annualLuxHours * environment.uvOutputMicrowattsPerLumen);

  const baseLightfastness = getBasePigmentLightfastnessLuxHours(pigment);
  const uvFactor = calculateUvDamageFactor(environment.uvOutputMicrowattsPerLumen, environment.lightSource);

  const effectiveAnnualExposure = annualLuxHours * uvFactor;
  const rawYears = baseLightfastness / Math.max(effectiveAnnualExposure, 1);
  const estimatedYearsToFadingNoticeable = Math.max(1, Math.round(rawYears));

  let pigmentStabilityRating: "HIGHLY_STABLE" | "MODERATELY_STABLE" | "HIGH_RISK_FADING" = "HIGHLY_STABLE";
  if (estimatedYearsToFadingNoticeable < 20) {
    pigmentStabilityRating = "HIGH_RISK_FADING";
  } else if (estimatedYearsToFadingNoticeable < 60) {
    pigmentStabilityRating = "MODERATELY_STABLE";
  }

  const isCriOptimal = environment.colorRenderingIndexCri >= 95;
  const isLuxMuseumStandard = environment.illuminanceLux <= 200; // Museum standard for paper prints is <= 150-200 lux
  const isUvMuseumStandard = environment.uvOutputMicrowattsPerLumen <= 75;

  let lightingQualityGrade: "MUSEUM_GRADE" | "COMMERCIAL_ACCEPTABLE" | "SUBOPTIMAL_LIGHTING" | "HAZARDOUS_EXPOSURE" =
    "MUSEUM_GRADE";

  if (environment.lightSource === "DIRECT_SUNLIGHT" || environment.uvOutputMicrowattsPerLumen > 300 || environment.illuminanceLux > 1000) {
    lightingQualityGrade = "HAZARDOUS_EXPOSURE";
  } else if (!isCriOptimal || !isUvMuseumStandard || !isLuxMuseumStandard) {
    if (environment.colorRenderingIndexCri < 80 || environment.illuminanceLux > 500) {
      lightingQualityGrade = "SUBOPTIMAL_LIGHTING";
    } else {
      lightingQualityGrade = "COMMERCIAL_ACCEPTABLE";
    }
  }

  const recommendations: string[] = [];

  if (environment.illuminanceLux > 200) {
    recommendations.push(
      `Reduce light intensity from ${environment.illuminanceLux} lux to museum standard <= 150-200 lux for paper prints.`
    );
  }

  if (environment.uvOutputMicrowattsPerLumen > 75) {
    recommendations.push(
      `Install UV-filtering film or switch to Museum LED (UV output is ${environment.uvOutputMicrowattsPerLumen} uW/lm, threshold is <= 75 uW/lm).`
    );
  }

  if (environment.colorRenderingIndexCri < 95) {
    recommendations.push(
      `Upgrade to CRI 95+ LED fixtures (current CRI is ${environment.colorRenderingIndexCri}) for accurate color reproduction.`
    );
  }

  if (environment.colorTemperatureKelvin < 2700 || environment.colorTemperatureKelvin > 4000) {
    recommendations.push(
      `Adjust CCT color temperature from ${environment.colorTemperatureKelvin}K to optimal warm gallery range (2700K-3500K).`
    );
  }

  return {
    annualLuxHours,
    annualUvExposureMicrowattsHour,
    pigmentStabilityRating,
    estimatedYearsToFadingNoticeable,
    lightingQualityGrade,
    isCriOptimalForArtDisplay: isCriOptimal,
    recommendations,
  };
}
