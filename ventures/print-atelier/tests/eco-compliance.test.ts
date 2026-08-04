import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  calculatePlasticRecycledPercentage,
  assessUkPlasticPackagingTax,
  calculatePackageCarbonFootprintGrams,
  validateCustomsEcoCompliance,
  batchValidateEcoCompliance,
  generateConvexEcoComplianceSchema,
  persistEcoComplianceRecord,
  getEcoComplianceRecords,
  clearEcoComplianceRecordsForTesting,
  PackagingMaterial,
  EcoComplianceInput,
} from "../src/lib/eco-compliance";

describe("eco-compliance validator", () => {
  beforeEach(() => {
    clearEcoComplianceRecordsForTesting();
  });

  describe("calculatePlasticRecycledPercentage", () => {
    it("returns 100% when no plastic materials are present", () => {
      const materials: PackagingMaterial[] = [
        { type: "cardboard", weightGrams: 300, recycledContentPercent: 80, isFscCertified: true },
        { type: "paper", weightGrams: 50, recycledContentPercent: 100, isFscCertified: true },
      ];
      assert.equal(calculatePlasticRecycledPercentage(materials), 100);
    });

    it("calculates weighted average recycled plastic percentage", () => {
      const materials: PackagingMaterial[] = [
        { type: "bubble_wrap", weightGrams: 100, recycledContentPercent: 50, isFscCertified: false },
        { type: "polythene", weightGrams: 100, recycledContentPercent: 10, isFscCertified: false },
      ];
      // total plastic weight = 200g. recycled = 50 + 10 = 60g -> 60/200 = 30%
      assert.equal(calculatePlasticRecycledPercentage(materials), 30);
    });
  });

  describe("assessUkPlasticPackagingTax", () => {
    it("returns non-applicable for non-UK destinations", () => {
      const materials: PackagingMaterial[] = [
        { type: "bubble_wrap", weightGrams: 200, recycledContentPercent: 0, isFscCertified: false },
      ];
      const result = assessUkPlasticPackagingTax(materials, "DE");
      assert.equal(result.applies, false);
      assert.equal(result.estimatedTaxCents, 0);
    });

    it("applies UK PPT when plastic packaging has < 30% recycled content", () => {
      const materials: PackagingMaterial[] = [
        { type: "bubble_wrap", weightGrams: 500, recycledContentPercent: 20, isFscCertified: false },
      ];
      const result = assessUkPlasticPackagingTax(materials, "GB");
      assert.equal(result.applies, true);
      assert.equal(result.taxablePlasticWeightGrams, 500);
      // 0.5kg * 28 cents/kg = 14 cents
      assert.equal(result.estimatedTaxCents, 14);
    });

    it("exempts UK packaging when recycled content is >= 30%", () => {
      const materials: PackagingMaterial[] = [
        { type: "polythene", weightGrams: 400, recycledContentPercent: 50, isFscCertified: false },
      ];
      const result = assessUkPlasticPackagingTax(materials, "UK");
      assert.equal(result.applies, false);
      assert.equal(result.taxablePlasticWeightGrams, 0);
      assert.equal(result.estimatedTaxCents, 0);
    });
  });

  describe("calculatePackageCarbonFootprintGrams", () => {
    it("calculates material and transport emissions for US shipment", () => {
      const materials: PackagingMaterial[] = [
        { type: "cardboard", weightGrams: 400, recycledContentPercent: 100, isFscCertified: true },
      ];
      // Material: 400 * 1.5 = 600g
      // Transport (US): 0.4kg * 850 = 340g
      // Total: 940g
      const footprint = calculatePackageCarbonFootprintGrams(materials, "US", 400);
      assert.equal(footprint, 940);
    });
  });

  describe("validateCustomsEcoCompliance", () => {
    it("flags missing FSC certificate when uncertified paper is used", () => {
      const input: EcoComplianceInput = {
        packagingMaterials: [
          { type: "cardboard", weightGrams: 300, recycledContentPercent: 50, isFscCertified: false },
        ],
        destinationCountry: "DE",
        totalPackageWeightGrams: 300,
        productType: "paper_print",
        eprRegistrations: { germanyLucid: "LUCID-12345" },
      };

      const decl = validateCustomsEcoCompliance(input);
      assert.equal(decl.compliant, false);
      assert.equal(decl.fscStatus, "uncertified");
      assert.ok(decl.missingRequirements.some((r) => r.includes("FSC")));
    });

    it("flags missing OEKO-TEX certificate for framed canvas", () => {
      const input: EcoComplianceInput = {
        packagingMaterials: [
          { type: "cardboard", weightGrams: 500, recycledContentPercent: 80, isFscCertified: true },
        ],
        destinationCountry: "FR",
        totalPackageWeightGrams: 1200,
        productType: "framed_canvas",
        fscCertificateId: "FSC-C123456",
        eprRegistrations: { franceLecoop: "FR-LECOOP-789" },
      };

      const decl = validateCustomsEcoCompliance(input);
      assert.equal(decl.compliant, false);
      assert.ok(decl.missingRequirements.some((r) => r.includes("OEKO-TEX")));
    });

    it("flags missing German LUCID registration for DE destination", () => {
      const input: EcoComplianceInput = {
        packagingMaterials: [
          { type: "cardboard", weightGrams: 300, recycledContentPercent: 80, isFscCertified: true },
        ],
        destinationCountry: "DE",
        totalPackageWeightGrams: 350,
        productType: "paper_print",
        fscCertificateId: "FSC-C123456",
      };

      const decl = validateCustomsEcoCompliance(input);
      assert.equal(decl.compliant, false);
      assert.equal(decl.eprStatus, "missing_registration");
      assert.ok(decl.missingRequirements.some((r) => r.includes("LUCID")));
    });

    it("passes validation when all EU requirements & certifications are met", () => {
      const input: EcoComplianceInput = {
        orderId: "ORD-DE-999",
        packagingMaterials: [
          { type: "cardboard", weightGrams: 300, recycledContentPercent: 100, isFscCertified: true },
        ],
        destinationCountry: "DE",
        totalPackageWeightGrams: 350,
        productType: "paper_print",
        fscCertificateId: "FSC-C123456",
        eprRegistrations: { germanyLucid: "DE1234567890" },
      };

      const decl = validateCustomsEcoCompliance(input);
      assert.equal(decl.compliant, true);
      assert.equal(decl.fscStatus, "certified");
      assert.equal(decl.eprStatus, "valid");
      assert.equal(decl.euPpwrStatus, "compliant");
      assert.equal(decl.missingRequirements.length, 0);
    });
  });

  describe("batchValidateEcoCompliance", () => {
    it("processes batch of orders and aggregates carbon footprint and plastic tax", () => {
      const inputs: EcoComplianceInput[] = [
        {
          orderId: "ORD-1",
          packagingMaterials: [
            { type: "cardboard", weightGrams: 300, recycledContentPercent: 100, isFscCertified: true },
          ],
          destinationCountry: "DE",
          totalPackageWeightGrams: 350,
          productType: "paper_print",
          fscCertificateId: "FSC-C123",
          eprRegistrations: { germanyLucid: "DE123" },
        },
        {
          orderId: "ORD-2",
          packagingMaterials: [
            { type: "bubble_wrap", weightGrams: 200, recycledContentPercent: 0, isFscCertified: false },
          ],
          destinationCountry: "GB",
          totalPackageWeightGrams: 500,
          productType: "paper_print",
        },
      ];

      const report = batchValidateEcoCompliance(inputs);
      assert.equal(report.totalValidated, 2);
      assert.equal(report.compliantCount, 1);
      assert.equal(report.nonCompliantCount, 1);
      assert.ok(report.totalEstimatedPlasticTaxCents > 0);
      assert.ok(report.totalCarbonFootprintKg > 0);
    });
  });

  describe("Convex schema and persistence", () => {
    it("generates valid Convex schema definition for eco_compliance_declarations", () => {
      const schema = generateConvexEcoComplianceSchema();
      assert.ok(schema.eco_compliance_declarations);
      assert.equal(schema.eco_compliance_declarations.columns.compliant, "boolean");
      assert.ok(schema.eco_compliance_declarations.indexes.by_order_id);
    });

    it("persists declaration record and retrieves from memory store", () => {
      const decl = validateCustomsEcoCompliance({
        orderId: "TEST-ORD-001",
        packagingMaterials: [
          { type: "biodegradable_mailer", weightGrams: 50, recycledContentPercent: 100, isFscCertified: true },
        ],
        destinationCountry: "US",
        totalPackageWeightGrams: 200,
        productType: "paper_print",
        fscCertificateId: "FSC-C001",
      });

      persistEcoComplianceRecord(decl);
      const records = getEcoComplianceRecords();
      assert.equal(records.length, 1);
      assert.equal(records[0].orderId, "TEST-ORD-001");
    });
  });
});
