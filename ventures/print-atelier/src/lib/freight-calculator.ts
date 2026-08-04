export type ArtworkMedium = "stretched_canvas" | "framed_canvas" | "fine_art_paper" | "acrylic_glass";

export type FrameMaterial = "wood" | "metal" | "acrylic" | "none";

export interface ArtworkDimensionsSpec {
  widthInches: number;
  heightInches: number;
  depthInches: number;
  medium: ArtworkMedium;
  frameMaterial?: FrameMaterial;
}

export interface FreightCalculationResult {
  artworkDimensions: {
    widthInches: number;
    heightInches: number;
    depthInches: number;
  };
  packagedDimensions: {
    lengthInches: number;
    widthInches: number;
    heightInches: number;
  };
  actualWeightLbs: number;
  volumetricWeightLbs: number;
  billableWeightLbs: number;
  girthInches: number;
  isOversizedFreight: boolean;
  oversizeSurchargeUsd: number;
  recommendedPackaging: "standard_flat_mailer" | "heavy_duty_box" | "reinforced_wood_crate";
  estimatedBaseFreightCostUsd: number;
}

// IATA standard volumetric divisor for air freight
const DIMENSIONAL_WEIGHT_DIVISOR = 139;

export function calculateVolumetricFreight(
  spec: ArtworkDimensionsSpec
): FreightCalculationResult {
  const { widthInches, heightInches, depthInches, medium, frameMaterial = "none" } = spec;

  // Compute packaging padding allowances
  let paddingL = 2;
  let paddingW = 2;
  let paddingH = 1.5;

  if (medium === "framed_canvas" || medium === "acrylic_glass" || frameMaterial !== "none") {
    paddingL = 4;
    paddingW = 4;
    paddingH = 3;
  }

  const lengthPkg = Math.ceil(Math.max(widthInches, heightInches) + paddingL);
  const widthPkg = Math.ceil(Math.min(widthInches, heightInches) + paddingW);
  const heightPkg = Math.ceil(depthInches + paddingH);

  // Compute base artwork & packaging weight estimates
  let baseDensityMultiplier = 0.005; // lbs per sq inch base
  if (medium === "framed_canvas") baseDensityMultiplier = 0.008;
  if (medium === "acrylic_glass") baseDensityMultiplier = 0.012;

  const areaSqInches = widthInches * heightInches;
  let actualWeightLbs = Math.round((areaSqInches * baseDensityMultiplier) * 10) / 10;

  if (frameMaterial === "wood") actualWeightLbs += 3.5;
  if (frameMaterial === "metal") actualWeightLbs += 4.5;

  actualWeightLbs = Math.max(1.0, actualWeightLbs);

  // Volumetric weight: (L * W * H) / 139
  const volumeCuInches = lengthPkg * widthPkg * heightPkg;
  const volumetricWeightLbs = Math.round((volumeCuInches / DIMENSIONAL_WEIGHT_DIVISOR) * 10) / 10;

  const billableWeightLbs = Math.max(actualWeightLbs, volumetricWeightLbs);

  // Length + Girth (2W + 2H)
  const girthInches = lengthPkg + 2 * (widthPkg + heightPkg);
  const isOversizedFreight = girthInches > 130 || lengthPkg > 48;

  let oversizeSurchargeUsd = 0;
  if (girthInches > 165 || lengthPkg > 90) {
    oversizeSurchargeUsd = 150;
  } else if (isOversizedFreight) {
    oversizeSurchargeUsd = 45;
  }

  let recommendedPackaging: FreightCalculationResult["recommendedPackaging"] = "heavy_duty_box";
  if (isOversizedFreight || medium === "acrylic_glass" || billableWeightLbs >= 30) {
    recommendedPackaging = "reinforced_wood_crate";
  } else if (medium === "fine_art_paper" && widthInches <= 24 && heightInches <= 36) {
    recommendedPackaging = "standard_flat_mailer";
  }

  const baseRatePerLb = 3.5;
  const estimatedBaseFreightCostUsd = Math.round(
    (billableWeightLbs * baseRatePerLb + oversizeSurchargeUsd) * 100
  ) / 100;

  return {
    artworkDimensions: { widthInches, heightInches, depthInches },
    packagedDimensions: { lengthInches: lengthPkg, widthInches: widthPkg, heightInches: heightPkg },
    actualWeightLbs,
    volumetricWeightLbs,
    billableWeightLbs,
    girthInches,
    isOversizedFreight,
    oversizeSurchargeUsd,
    recommendedPackaging,
    estimatedBaseFreightCostUsd,
  };
}
