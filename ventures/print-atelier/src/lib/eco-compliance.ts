/**
 * Packaging & Eco-Certificate Compliance Validator for EU & UK Customs Import Regulations
 * 
 * Supports:
 * - EU PPWR (Packaging and Packaging Waste Regulation) & EPR (Extended Producer Responsibility) validations
 * - UK Plastic Packaging Tax (PPT) calculation (>30% recycled threshold requirement)
 * - FSC (Forest Stewardship Council) & OEKO-TEX certificate verification
 * - Package carbon footprint estimation (materials + transport by destination)
 * - Convex schema & state snapshot persistence for compliance audits
 */

export type PackagingMaterialType = 
  | "cardboard"
  | "paper"
  | "bubble_wrap"
  | "polythene"
  | "biodegradable_mailer"
  | "wooden_crate";

export interface PackagingMaterial {
  type: PackagingMaterialType;
  weightGrams: number;
  recycledContentPercent: number; // 0-100
  isFscCertified: boolean;
}

export type ProductType = 
  | "paper_print"
  | "framed_canvas"
  | "acrylic_print"
  | "metal_print";

export interface EprRegistrationNumbers {
  germanyLucid?: string;
  franceLecoop?: string;
  ukPrn?: string;
  spainEnvases?: string;
  austriaEpr?: string;
}

export interface EcoComplianceInput {
  orderId?: string;
  packagingMaterials: PackagingMaterial[];
  destinationCountry: string; // ISO 2-letter e.g. "GB", "DE", "FR", "US"
  totalPackageWeightGrams: number;
  productType: ProductType;
  eprRegistrations?: EprRegistrationNumbers;
  fscCertificateId?: string;
  oekoTexCertificateId?: string;
}

export interface PackagingTaxAssessment {
  applies: boolean;
  taxRatePerKgCents: number; // UK PPT rate is approx £217.85/tonne = ~21.785p/kg => ~28 cents/kg
  taxablePlasticWeightGrams: number;
  estimatedTaxCents: number;
  reason: string;
}

export interface CustomsEcoDeclaration {
  orderId?: string;
  compliant: boolean;
  fscStatus: "certified" | "uncertified" | "exempt";
  ukPlasticTax: PackagingTaxAssessment;
  euPpwrStatus: "compliant" | "non_compliant" | "conditional";
  eprStatus: "valid" | "missing_registration" | "not_applicable";
  carbonFootprintGrams: number;
  missingRequirements: string[];
  recommendations: string[];
}

export interface BatchEcoComplianceReport {
  totalValidated: number;
  compliantCount: number;
  nonCompliantCount: number;
  totalEstimatedPlasticTaxCents: number;
  totalCarbonFootprintKg: number;
  declarations: CustomsEcoDeclaration[];
}

// In-memory compliance ledger for testing/persistence
let ecoComplianceStore: CustomsEcoDeclaration[] = [];

/**
 * Calculates overall recycled percentage for plastic materials in packaging
 */
export function calculatePlasticRecycledPercentage(materials: PackagingMaterial[]): number {
  const plasticTypes: PackagingMaterialType[] = ["bubble_wrap", "polythene"];
  const plasticMaterials = materials.filter((m) => plasticTypes.includes(m.type));
  if (plasticMaterials.length === 0) return 100; // No plastic present

  const totalPlasticWeight = plasticMaterials.reduce((acc, m) => acc + m.weightGrams, 0);
  if (totalPlasticWeight === 0) return 100;

  const recycledWeight = plasticMaterials.reduce(
    (acc, m) => acc + (m.weightGrams * Math.min(100, Math.max(0, m.recycledContentPercent))) / 100,
    0
  );

  return Math.round((recycledWeight / totalPlasticWeight) * 100);
}

/**
 * Assesses UK Plastic Packaging Tax (PPT).
 * Plastic packaging with < 30% recycled content is subject to PPT (£217.85/tonne ~= 22 pence/kg).
 */
export function assessUkPlasticPackagingTax(
  materials: PackagingMaterial[],
  destinationCountry: string
): PackagingTaxAssessment {
  if (destinationCountry.toUpperCase() !== "GB" && destinationCountry.toUpperCase() !== "UK") {
    return {
      applies: false,
      taxRatePerKgCents: 0,
      taxablePlasticWeightGrams: 0,
      estimatedTaxCents: 0,
      reason: "Destination outside UK jurisdiction",
    };
  }

  const plasticTypes: PackagingMaterialType[] = ["bubble_wrap", "polythene"];
  const plasticMaterials = materials.filter((m) => plasticTypes.includes(m.type));
  if (plasticMaterials.length === 0) {
    return {
      applies: false,
      taxRatePerKgCents: 0,
      taxablePlasticWeightGrams: 0,
      estimatedTaxCents: 0,
      reason: "No plastic packaging materials used",
    };
  }

  let taxableWeightGrams = 0;
  for (const m of plasticMaterials) {
    if (m.recycledContentPercent < 30) {
      taxableWeightGrams += m.weightGrams;
    }
  }

  if (taxableWeightGrams === 0) {
    return {
      applies: false,
      taxRatePerKgCents: 28, // UK PPT rate ~28 cents/kg
      taxablePlasticWeightGrams: 0,
      estimatedTaxCents: 0,
      reason: "All plastic packaging meets or exceeds 30% recycled content threshold",
    };
  }

  // Rate: ~28 USD cents / kg (approx £0.21785 / kg)
  const ratePerKgCents = 28;
  const taxableKg = taxableWeightGrams / 1000;
  const estimatedTaxCents = Math.ceil(taxableKg * ratePerKgCents);

  return {
    applies: true,
    taxRatePerKgCents: ratePerKgCents,
    taxablePlasticWeightGrams: taxableWeightGrams,
    estimatedTaxCents,
    reason: `Plastic packaging has < 30% recycled content (${taxableWeightGrams}g taxable)`,
  };
}

/**
 * Calculates estimated carbon footprint in grams of CO2e.
 * Baseline packaging emissions factor: ~1.5g CO2e/g paper, ~2.5g CO2e/g plastic, ~3.0g CO2e/g wood.
 * Transport emission multipliers based on destination region distance.
 */
export function calculatePackageCarbonFootprintGrams(
  materials: PackagingMaterial[],
  destinationCountry: string,
  totalWeightGrams: number
): number {
  let materialEmissionsGrams = 0;

  for (const m of materials) {
    let factor = 1.5; // default paper/cardboard factor
    if (m.type === "bubble_wrap" || m.type === "polythene") {
      factor = 2.5 * (1 - (m.recycledContentPercent / 100) * 0.5); // recycled plastic reduces emissions by up to 50%
    } else if (m.type === "wooden_crate") {
      factor = 1.8;
    } else if (m.type === "biodegradable_mailer") {
      factor = 0.9;
    }
    materialEmissionsGrams += m.weightGrams * factor;
  }

  // Transport multiplier per kg
  const destUpper = destinationCountry.toUpperCase();
  const euCountries = ["DE", "FR", "ES", "IT", "NL", "BE", "AT", "SE", "DK", "PL", "IE", "PT", "FI"];
  
  let transportFactorPerKg = 250; // standard intra-EU/UK air/road mix (250g CO2e / kg)
  if (destUpper === "GB" || destUpper === "UK") {
    transportFactorPerKg = 200;
  } else if (euCountries.includes(destUpper)) {
    transportFactorPerKg = 220;
  } else if (destUpper === "US" || destUpper === "CA") {
    transportFactorPerKg = 850; // Transatlantic air/freight
  } else {
    transportFactorPerKg = 1200; // Rest of world
  }

  const transportEmissionsGrams = (totalWeightGrams / 1000) * transportFactorPerKg;
  return Math.round(materialEmissionsGrams + transportEmissionsGrams);
}

/**
 * Validates Customs Eco-Compliance declaration for EU & UK regulations.
 */
export function validateCustomsEcoCompliance(input: EcoComplianceInput): CustomsEcoDeclaration {
  const missingRequirements: string[] = [];
  const recommendations: string[] = [];

  const destUpper = input.destinationCountry.toUpperCase();
  const euCountries = ["DE", "FR", "ES", "IT", "NL", "BE", "AT", "SE", "DK", "PL", "IE", "PT", "FI"];
  const isEu = euCountries.includes(destUpper);
  const isUk = destUpper === "GB" || destUpper === "UK";

  // 1. FSC Certificate Verification
  const paperMaterials = input.packagingMaterials.filter((m) =>
    ["cardboard", "paper"].includes(m.type)
  );
  let fscStatus: "certified" | "uncertified" | "exempt" = "exempt";
  if (paperMaterials.length > 0) {
    const hasUncertifiedPaper = paperMaterials.some((m) => !m.isFscCertified);
    if (!input.fscCertificateId || hasUncertifiedPaper) {
      fscStatus = "uncertified";
      missingRequirements.push("FSC packaging certificate ID or FSC-certified paper materials missing");
      recommendations.push("Source FSC Mix or 100% FSC certified cardboard/paper packaging");
    } else {
      fscStatus = "certified";
    }
  }

  // 2. OEKO-TEX Certificate for textiles (framed canvas)
  if (input.productType === "framed_canvas" && !input.oekoTexCertificateId) {
    missingRequirements.push("OEKO-TEX Standard 100 certificate missing for textile/canvas product");
    recommendations.push("Obtain OEKO-TEX Standard 100 certification for printed canvas textile substrate");
  }

  // 3. EPR Registration validation (EU requirement: DE LUCID, FR Lecoop, ES Envases, AT EPR)
  let eprStatus: "valid" | "missing_registration" | "not_applicable" = "not_applicable";
  if (isEu) {
    eprStatus = "valid";
    const epr = input.eprRegistrations || {};
    if (destUpper === "DE" && !epr.germanyLucid) {
      eprStatus = "missing_registration";
      missingRequirements.push("Germany LUCID packaging EPR registration number missing");
      recommendations.push("Register with ZSVR LUCID database for German packaging fulfillment");
    } else if (destUpper === "FR" && !epr.franceLecoop) {
      eprStatus = "missing_registration";
      missingRequirements.push("France Lecoop/Citeo EPR registration number missing");
      recommendations.push("Register with Citeo/ADEME for French packaging compliance");
    } else if (destUpper === "ES" && !epr.spainEnvases) {
      eprStatus = "missing_registration";
      missingRequirements.push("Spain Ecoembes / Envases EPR registration number missing");
    } else if (destUpper === "AT" && !epr.austriaEpr) {
      eprStatus = "missing_registration";
      missingRequirements.push("Austria Packaging Ordinance EPR registration number missing");
    }
  }

  // 4. UK Plastic Packaging Tax Assessment
  const ukPlasticTax = assessUkPlasticPackagingTax(input.packagingMaterials, destUpper);
  if (ukPlasticTax.applies) {
    missingRequirements.push(`UK Plastic Packaging Tax applies (£${(ukPlasticTax.estimatedTaxCents / 100).toFixed(2)} tax due)`);
    recommendations.push("Switch plastic packaging to at least 30% recycled content to qualify for PPT exemption");
  }

  // 5. EU PPWR Status
  let euPpwrStatus: "compliant" | "non_compliant" | "conditional" = "compliant";
  if (isEu) {
    const plasticPct = calculatePlasticRecycledPercentage(input.packagingMaterials);
    if (fscStatus === "uncertified" || eprStatus === "missing_registration") {
      euPpwrStatus = "non_compliant";
    } else if (plasticPct < 30) {
      euPpwrStatus = "conditional";
      recommendations.push("EU PPWR recommends minimum 30% recycled plastic content by 2030");
    }
  }

  const carbonFootprintGrams = calculatePackageCarbonFootprintGrams(
    input.packagingMaterials,
    destUpper,
    input.totalPackageWeightGrams
  );

  const compliant = missingRequirements.length === 0;

  return {
    orderId: input.orderId,
    compliant,
    fscStatus,
    ukPlasticTax,
    euPpwrStatus,
    eprStatus,
    carbonFootprintGrams,
    missingRequirements,
    recommendations,
  };
}

/**
 * Validates a batch of eco-compliance inputs and returns a summary report.
 */
export function batchValidateEcoCompliance(inputs: EcoComplianceInput[]): BatchEcoComplianceReport {
  const declarations = inputs.map((input) => validateCustomsEcoCompliance(input));
  const compliantCount = declarations.filter((d) => d.compliant).length;
  const nonCompliantCount = declarations.length - compliantCount;

  const totalEstimatedPlasticTaxCents = declarations.reduce(
    (acc, d) => acc + d.ukPlasticTax.estimatedTaxCents,
    0
  );

  const totalCarbonFootprintGrams = declarations.reduce(
    (acc, d) => acc + d.carbonFootprintGrams,
    0
  );

  return {
    totalValidated: declarations.length,
    compliantCount,
    nonCompliantCount,
    totalEstimatedPlasticTaxCents,
    totalCarbonFootprintKg: Number((totalCarbonFootprintGrams / 1000).toFixed(2)),
    declarations,
  };
}

/**
 * Convex schema definition for eco_compliance_declarations table
 */
export function generateConvexEcoComplianceSchema(): {
  eco_compliance_declarations: {
    columns: Record<string, string>;
    indexes: Record<string, string[]>;
  };
} {
  return {
    eco_compliance_declarations: {
      columns: {
        orderId: "string?",
        compliant: "boolean",
        fscStatus: "string",
        euPpwrStatus: "string",
        eprStatus: "string",
        ukPlasticTaxCents: "number",
        carbonFootprintGrams: "number",
        missingRequirements: "array",
        createdAt: "number",
      },
      indexes: {
        by_order_id: ["orderId"],
        by_compliance_status: ["compliant"],
      },
    },
  };
}

/**
 * Persists an eco compliance declaration record to memory ledger
 */
export function persistEcoComplianceRecord(declaration: CustomsEcoDeclaration): CustomsEcoDeclaration {
  ecoComplianceStore.push(declaration);
  return declaration;
}

/**
 * Retrieves persisted eco compliance declaration records
 */
export function getEcoComplianceRecords(): CustomsEcoDeclaration[] {
  return [...ecoComplianceStore];
}

/**
 * Clears eco compliance declaration store for isolated testing
 */
export function clearEcoComplianceRecordsForTesting(): void {
  ecoComplianceStore = [];
}
