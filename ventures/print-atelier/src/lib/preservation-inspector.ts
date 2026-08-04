/**
 * Automated Print Archival Framing Grade & UV Light Preservation Inspector
 * 
 * Evaluates print paper composition, pigment lightfastness, UV protective glazing, and ambient
 * lighting exposure to predict archival lifespan and enforce 100-year museum-grade preservation standards.
 */

export type PaperMaterial = "cotton_rag" | "baryta" | "alpha_cellulose" | "canvas";
export type InkType = "pigment_archival" | "dye_based" | "solvent";
export type GlassType = "museum_acrylic_99uv" | "conservation_clear_99uv" | "standard_glass";
export type PreservationGrade =
  | "museum_grade_100yr"
  | "gallery_grade_50yr"
  | "standard_display_20yr"
  | "non_archival";

export interface PrintPreservationInput {
  printId: string;
  paperMaterial: PaperMaterial;
  inkType: InkType;
  glassType: GlassType;
  ambientLux: number; // Average gallery light intensity in Lux (e.g., 400 lux)
  directSunlightHoursPerDay: number; // Hours per day exposed to direct sunlight
  targetDisplayYears: number; // Desired lifespan target (e.g., 50 or 100 years)
}

export interface PreservationInspectionResult {
  printId: string;
  estimatedLifespanYears: number;
  preservationGrade: PreservationGrade;
  lightfastnessScore: number; // 0 to 100 score
  uvProtectionPercent: number;
  isTargetAchieved: boolean;
  degradationRiskLevel: "low" | "moderate" | "severe";
  recommendations: string[];
  inspectedAt: number;
}

export interface PreservationSummary {
  totalInspected: number;
  averageEstimatedLifespanYears: number;
  targetMetPercentage: number;
  gradeDistribution: Record<PreservationGrade, number>;
  riskDistribution: Record<"low" | "moderate" | "severe", number>;
}

// Base material lifespan multipliers (under standard 400 Lux indoor display, 0 direct sunlight)
const PAPER_LIFESPAN_BASE_YEARS: Record<PaperMaterial, number> = {
  cotton_rag: 120,
  baryta: 100,
  alpha_cellulose: 60,
  canvas: 40,
};

const INK_LIFESPAN_MULTIPLIER: Record<InkType, number> = {
  pigment_archival: 1.0,
  dye_based: 0.25,
  solvent: 0.50,
};

const GLASS_UV_BLOCK_PERCENT: Record<GlassType, number> = {
  museum_acrylic_99uv: 99.0,
  conservation_clear_99uv: 99.0,
  standard_glass: 45.0,
};

const preservationInspectionStore: Map<string, PreservationInspectionResult> = new Map();

/**
 * Inspects print specifications and environmental conditions to calculate archival lifespan.
 */
export function evaluatePrintPreservation(input: PrintPreservationInput): PreservationInspectionResult {
  const { printId, paperMaterial, inkType, glassType, ambientLux, directSunlightHoursPerDay, targetDisplayYears } = input;
  const recommendations: string[] = [];

  const basePaperLifespan = PAPER_LIFESPAN_BASE_YEARS[paperMaterial] || 50;
  const inkMultiplier = INK_LIFESPAN_MULTIPLIER[inkType] || 0.5;
  const uvBlock = GLASS_UV_BLOCK_PERCENT[glassType] || 45.0;

  // Calculate light degradation factor based on Lux and sunlight
  // Standard gallery exposure baseline is 400 lux, 0 hrs direct sunlight.
  const luxFactor = Math.max(0.5, ambientLux / 400.0);
  const sunlightPenalty = directSunlightHoursPerDay * 0.15; // 15% reduction per daily sunlight hour
  const uvGlassProtectionFactor = uvBlock >= 99.0 ? 1.0 : (uvBlock / 100.0) * 0.6;

  const rawLifespan = (basePaperLifespan * inkMultiplier) / (luxFactor + sunlightPenalty);
  const estimatedLifespanYears = Math.max(1, Math.round(rawLifespan * (0.5 + uvGlassProtectionFactor * 0.5)));

  // Calculate lightfastness score (0 - 100)
  const lightfastnessScore = Math.min(100, Math.round((estimatedLifespanYears / 100) * 100));

  // Determine Preservation Grade
  let preservationGrade: PreservationGrade = "non_archival";
  if (estimatedLifespanYears >= 100 && inkType === "pigment_archival" && (paperMaterial === "cotton_rag" || paperMaterial === "baryta")) {
    preservationGrade = "museum_grade_100yr";
  } else if (estimatedLifespanYears >= 50) {
    preservationGrade = "gallery_grade_50yr";
  } else if (estimatedLifespanYears >= 20) {
    preservationGrade = "standard_display_20yr";
  } else {
    preservationGrade = "non_archival";
  }

  // Determine degradation risk
  let degradationRiskLevel: "low" | "moderate" | "severe" = "low";
  if (directSunlightHoursPerDay > 2 || glassType === "standard_glass" || inkType === "dye_based") {
    degradationRiskLevel = "severe";
  } else if (estimatedLifespanYears < targetDisplayYears || ambientLux > 800) {
    degradationRiskLevel = "moderate";
  }

  // Generate actionable recommendations
  if (inkType === "dye_based") {
    recommendations.push("Replace dye-based ink with archival pigment ink to prevent rapid photo-fading.");
  }
  if (glassType === "standard_glass") {
    recommendations.push("Upgrade to Museum Acrylic or Conservation Clear glass to block 99% of damaging UV light.");
  }
  if (directSunlightHoursPerDay > 0) {
    recommendations.push(`Relocate print away from direct sunlight (currently ${directSunlightHoursPerDay} hrs/day) to prevent accelerated yellowing.`);
  }
  if (preservationGrade === "museum_grade_100yr") {
    recommendations.push("Certified 100-Year Museum Grade: Meets all archival preservation standards.");
  }

  const isTargetAchieved = estimatedLifespanYears >= targetDisplayYears;

  const result: PreservationInspectionResult = {
    printId,
    estimatedLifespanYears,
    preservationGrade,
    lightfastnessScore,
    uvProtectionPercent: uvBlock,
    isTargetAchieved,
    degradationRiskLevel,
    recommendations,
    inspectedAt: Date.now(),
  };

  preservationInspectionStore.set(printId, result);
  return result;
}

/**
 * Summarizes preservation results across a batch of inspected prints.
 */
export function summarizePreservationInspection(inputs: PrintPreservationInput[]): PreservationSummary {
  const totalInspected = inputs.length;
  if (totalInspected === 0) {
    return {
      totalInspected: 0,
      averageEstimatedLifespanYears: 0,
      targetMetPercentage: 0,
      gradeDistribution: {
        museum_grade_100yr: 0,
        gallery_grade_50yr: 0,
        standard_display_20yr: 0,
        non_archival: 0,
      },
      riskDistribution: { low: 0, moderate: 0, severe: 0 },
    };
  }

  const gradeDistribution: Record<PreservationGrade, number> = {
    museum_grade_100yr: 0,
    gallery_grade_50yr: 0,
    standard_display_20yr: 0,
    non_archival: 0,
  };
  const riskDistribution: Record<"low" | "moderate" | "severe", number> = {
    low: 0,
    moderate: 0,
    severe: 0,
  };

  let totalLifespanSum = 0;
  let targetsMetCount = 0;

  for (const input of inputs) {
    const res = evaluatePrintPreservation(input);
    totalLifespanSum += res.estimatedLifespanYears;
    if (res.isTargetAchieved) targetsMetCount++;

    gradeDistribution[res.preservationGrade] = (gradeDistribution[res.preservationGrade] || 0) + 1;
    riskDistribution[res.degradationRiskLevel] = (riskDistribution[res.degradationRiskLevel] || 0) + 1;
  }

  return {
    totalInspected,
    averageEstimatedLifespanYears: Math.round((totalLifespanSum / totalInspected) * 10) / 10,
    targetMetPercentage: Math.round((targetsMetCount / totalInspected) * 1000) / 10,
    gradeDistribution,
    riskDistribution,
  };
}

/**
 * Generates Convex Schema snippet for print preservation inspection logs.
 */
export function generateConvexPreservationInspectorSchema(): string {
  return `
export const print_preservation_logs = defineTable({
  printId: v.string(),
  paperMaterial: v.string(),
  inkType: v.string(),
  glassType: v.string(),
  estimatedLifespanYears: v.number(),
  preservationGrade: v.string(),
  lightfastnessScore: v.number(),
  isTargetAchieved: v.boolean(),
  inspectedAt: v.number(),
}).index("by_print", ["printId"])
  .index("by_grade", ["preservationGrade"]);
`.trim();
}

/**
 * Retrieves a cached inspection result by print ID.
 */
export function getPreservationInspection(printId: string): PreservationInspectionResult | undefined {
  return preservationInspectionStore.get(printId);
}

/**
 * Clears the in-memory inspection store for testing.
 */
export function clearPreservationStoreForTesting(): void {
  preservationInspectionStore.clear();
}
