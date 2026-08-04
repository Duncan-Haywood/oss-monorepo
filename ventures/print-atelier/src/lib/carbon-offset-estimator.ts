/**
 * Eco-Packaging Certification & Carbon Offset Footprint Estimator
 * 
 * Calculates environmental footprint (g CO2e emissions) for fine art print shipping,
 * evaluates FSC certified / compostable packaging materials, and computes carbon offset contribution costs
 * to support sustainable e-commerce practices and transparent sustainability badges.
 */

export type PackagingMaterial =
  | "recycled_cardboard"
  | "biodegradable_bubble_wrap"
  | "fsc_certified_kraft"
  | "standard_plastic";

export type ShippingCarrier =
  | "dhl_express"
  | "fedex_ground"
  | "usps_priority"
  | "courier_local";

export type PackagingCertification =
  | "fsc_certified"
  | "100_percent_recycled"
  | "home_compostable"
  | "conventional";

export interface PrintPackagePayload {
  packageId: string;
  printDimensionsInches: { width: number; height: number };
  weightGrams: number;
  shippingDistanceKm: number;
  packagingMaterial: PackagingMaterial;
  shippingCarrier: ShippingCarrier;
  isFrameIncluded: boolean;
}

export interface CarbonFootprintResult {
  packageId: string;
  packagingEmissionsGramsCo2: number;
  transportEmissionsGramsCo2: number;
  totalEmissionsGramsCo2: number;
  totalEmissionsKgCo2: number;
  carbonOffsetCostCents: number;
  certification: PackagingCertification;
  isEcoFriendlyCertified: boolean;
  ecoBadgeLabel: string;
  notes: string[];
}

export interface CarbonFootprintSummary {
  totalPackages: number;
  totalWeightKg: number;
  totalEmissionsKgCo2: number;
  totalOffsetCostCents: number;
  ecoCertifiedPercentage: number;
  averageEmissionsPerPackageGrams: number;
}

// Emission factors (grams CO2e per gram of material)
const MATERIAL_EMISSION_FACTORS: Record<PackagingMaterial, number> = {
  fsc_certified_kraft: 0.85,
  recycled_cardboard: 1.1,
  biodegradable_bubble_wrap: 1.4,
  standard_plastic: 3.2,
};

// Transport emission factors (grams CO2e per gram of package per km)
const CARRIER_EMISSION_FACTORS: Record<ShippingCarrier, number> = {
  courier_local: 0.00012,
  usps_priority: 0.00018,
  fedex_ground: 0.00022,
  dhl_express: 0.00055, // Air freight component
};

const CARBON_OFFSET_COST_PER_KG_CENTS = 1.5; // $15 per metric ton ($0.015 per kg = 1.5 cents/kg)

/**
 * Calculates carbon footprint emissions, eco-certification, and carbon offset cost for a print package.
 */
export function calculateCarbonFootprint(pkg: PrintPackagePayload): CarbonFootprintResult {
  const notes: string[] = [];

  // Material emissions
  const materialFactor = MATERIAL_EMISSION_FACTORS[pkg.packagingMaterial] ?? 2.0;
  const packagingEmissionsGramsCo2 = Math.round(pkg.weightGrams * materialFactor * 10) / 10;

  // Transport emissions
  const carrierFactor = CARRIER_EMISSION_FACTORS[pkg.shippingCarrier] ?? 0.0003;
  // Frame multiplier if heavy wooden/metal frame is shipped
  const weightMultiplier = pkg.isFrameIncluded ? 1.5 : 1.0;
  const transportEmissionsGramsCo2 =
    Math.round(pkg.weightGrams * weightMultiplier * pkg.shippingDistanceKm * carrierFactor * 10) / 10;

  const totalEmissionsGramsCo2 = Math.round((packagingEmissionsGramsCo2 + transportEmissionsGramsCo2) * 10) / 10;
  const totalEmissionsKgCo2 = Math.round((totalEmissionsGramsCo2 / 1000) * 100) / 100;

  // Offset cost in cents
  const carbonOffsetCostCents = Math.max(1, Math.ceil(totalEmissionsKgCo2 * CARBON_OFFSET_COST_PER_KG_CENTS));

  // Determine packaging certification tier
  let certification: PackagingCertification = "conventional";
  let isEcoFriendlyCertified = false;
  let ecoBadgeLabel = "Standard Packaging";

  if (pkg.packagingMaterial === "fsc_certified_kraft") {
    certification = "fsc_certified";
    isEcoFriendlyCertified = true;
    ecoBadgeLabel = "FSC® 100% Sustainable Kraft";
    notes.push("Certified FSC packaging sourced from responsibly managed forests.");
  } else if (pkg.packagingMaterial === "biodegradable_bubble_wrap") {
    certification = "home_compostable";
    isEcoFriendlyCertified = true;
    ecoBadgeLabel = "100% Home Compostable Protective Wrap";
    notes.push("Packaging wrap fully decomposes in home compost within 180 days.");
  } else if (pkg.packagingMaterial === "recycled_cardboard") {
    certification = "100_percent_recycled";
    isEcoFriendlyCertified = true;
    ecoBadgeLabel = "100% Recycled Rigid Board";
    notes.push("Packaging made entirely of post-consumer recycled fiber.");
  } else {
    notes.push("Conventional plastic packaging material. Consider upgrading to FSC Kraft.");
  }

  if (pkg.isFrameIncluded) {
    notes.push("Package includes protective framing; weight and transport emissions adjusted.");
  }

  return {
    packageId: pkg.packageId,
    packagingEmissionsGramsCo2,
    transportEmissionsGramsCo2,
    totalEmissionsGramsCo2,
    totalEmissionsKgCo2,
    carbonOffsetCostCents,
    certification,
    isEcoFriendlyCertified,
    ecoBadgeLabel,
    notes,
  };
}

/**
 * Aggregates carbon footprint measurements across a shipping batch.
 */
export function summarizeCarbonFootprints(packages: PrintPackagePayload[]): CarbonFootprintSummary {
  const totalPackages = packages.length;
  if (totalPackages === 0) {
    return {
      totalPackages: 0,
      totalWeightKg: 0,
      totalEmissionsKgCo2: 0,
      totalOffsetCostCents: 0,
      ecoCertifiedPercentage: 0,
      averageEmissionsPerPackageGrams: 0,
    };
  }

  let totalWeightGrams = 0;
  let totalEmissionsGramsCo2 = 0;
  let totalOffsetCostCents = 0;
  let ecoCertifiedCount = 0;

  for (const pkg of packages) {
    totalWeightGrams += pkg.weightGrams;
    const res = calculateCarbonFootprint(pkg);
    totalEmissionsGramsCo2 += res.totalEmissionsGramsCo2;
    totalOffsetCostCents += res.carbonOffsetCostCents;
    if (res.isEcoFriendlyCertified) {
      ecoCertifiedCount++;
    }
  }

  return {
    totalPackages,
    totalWeightKg: Math.round((totalWeightGrams / 1000) * 100) / 100,
    totalEmissionsKgCo2: Math.round((totalEmissionsGramsCo2 / 1000) * 100) / 100,
    totalOffsetCostCents,
    ecoCertifiedPercentage: Math.round((ecoCertifiedCount / totalPackages) * 10000) / 100,
    averageEmissionsPerPackageGrams: Math.round(totalEmissionsGramsCo2 / totalPackages),
  };
}

/**
 * Generates Convex Schema snippet for carbon footprint packaging logs.
 */
export function generateConvexCarbonOffsetSchema(): string {
  return `
export const carbon_offset_logs = defineTable({
  packageId: v.string(),
  packagingMaterial: v.string(),
  shippingCarrier: v.string(),
  totalEmissionsGramsCo2: v.number(),
  carbonOffsetCostCents: v.number(),
  isEcoFriendlyCertified: v.boolean(),
  createdAt: v.number(),
}).index("by_package", ["packageId"])
  .index("by_certification", ["isEcoFriendlyCertified"]);
`.trim();
}

/**
 * In-memory store for carbon offset package records.
 */
class CarbonOffsetStore {
  private packages: Map<string, PrintPackagePayload> = new Map();

  public registerPackage(pkg: PrintPackagePayload): void {
    this.packages.set(pkg.packageId, pkg);
  }

  public getPackage(packageId: string): PrintPackagePayload | undefined {
    return this.packages.get(packageId);
  }

  public clear(): void {
    this.packages.clear();
  }
}

export const carbonOffsetStore = new CarbonOffsetStore();
