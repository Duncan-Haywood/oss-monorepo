import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  classifyTaxJurisdiction,
  evaluateNexusThreshold,
  generateTaxRemittanceReport,
  generateConvexVatRemittanceSchema,
  persistTaxReport,
  getTaxReports,
  clearTaxReportsForTesting,
  TaxLineItem,
} from "../src/lib/vat-remittance-reporter.ts";

describe("vat-remittance-reporter", () => {
  beforeEach(() => {
    clearTaxReportsForTesting();
  });

  describe("classifyTaxJurisdiction", () => {
    it("correctly classifies EU member state countries as EU_OSS", () => {
      assert.equal(classifyTaxJurisdiction("DE"), "EU_OSS");
      assert.equal(classifyTaxJurisdiction("FR"), "EU_OSS");
      assert.equal(classifyTaxJurisdiction("ES"), "EU_OSS");
    });

    it("correctly classifies UK as UK_HMRC", () => {
      assert.equal(classifyTaxJurisdiction("GB"), "UK_HMRC");
      assert.equal(classifyTaxJurisdiction("UK"), "UK_HMRC");
    });

    it("correctly classifies US as US_STATE", () => {
      assert.equal(classifyTaxJurisdiction("US"), "US_STATE");
    });

    it("falls back to ROW for unmapped countries", () => {
      assert.equal(classifyTaxJurisdiction("JP"), "ROW");
      assert.equal(classifyTaxJurisdiction("SG"), "ROW");
    });
  });

  describe("evaluateNexusThreshold", () => {
    it("identifies nexus when revenue exceeds threshold", () => {
      const orders: TaxLineItem[] = [
        {
          orderId: "O-1",
          destinationCountry: "US",
          stateRegion: "CA",
          currency: "USD",
          orderTotalUsdCents: 60000000, // $600k (exceeds $500k CA threshold)
          taxableAmountUsdCents: 60000000,
          taxCollectedUsdCents: 4200000,
          effectiveTaxRatePercent: 7.0,
          timestamp: Date.now(),
        },
      ];

      const status = evaluateNexusThreshold("US_STATE", "US-CA", orders);
      assert.equal(status.isNexusEstablished, true);
      assert.equal(status.registrationRequired, true);
      assert.equal(status.filingFrequency, "quarterly");
    });

    it("identifies nexus when transaction count exceeds threshold even if revenue is low", () => {
      const orders: TaxLineItem[] = Array.from({ length: 250 }, (_, i) => ({
        orderId: `O-NY-${i}`,
        destinationCountry: "US",
        stateRegion: "NY",
        currency: "USD",
        orderTotalUsdCents: 1000,
        taxableAmountUsdCents: 1000,
        taxCollectedUsdCents: 80,
        effectiveTaxRatePercent: 8.0,
        timestamp: Date.now(),
      }));

      const status = evaluateNexusThreshold("US_STATE", "US-NY", orders);
      assert.equal(status.isNexusEstablished, true);
    });

    it("returns nexus false when below both revenue and transaction count thresholds", () => {
      const orders: TaxLineItem[] = [
        {
          orderId: "O-MIN",
          destinationCountry: "GB",
          currency: "GBP",
          orderTotalUsdCents: 5000,
          taxableAmountUsdCents: 5000,
          taxCollectedUsdCents: 1000,
          effectiveTaxRatePercent: 20.0,
          timestamp: Date.now(),
        },
      ];

      const status = evaluateNexusThreshold("UK_HMRC", "UK", orders);
      assert.equal(status.isNexusEstablished, false);
      assert.equal(status.filingFrequency, "annual");
    });
  });

  describe("generateTaxRemittanceReport", () => {
    it("aggregates line items across all tax jurisdictions", () => {
      const items: TaxLineItem[] = [
        {
          orderId: "DE-1",
          destinationCountry: "DE",
          currency: "EUR",
          orderTotalUsdCents: 10000,
          taxableAmountUsdCents: 10000,
          taxCollectedUsdCents: 1900,
          effectiveTaxRatePercent: 19.0,
          timestamp: Date.now(),
        },
        {
          orderId: "UK-1",
          destinationCountry: "GB",
          currency: "GBP",
          orderTotalUsdCents: 12000,
          taxableAmountUsdCents: 12000,
          taxCollectedUsdCents: 2400,
          effectiveTaxRatePercent: 20.0,
          timestamp: Date.now(),
        },
      ];

      const report = generateTaxRemittanceReport("2026-Q3", items);
      assert.equal(report.reportingPeriod, "2026-Q3");
      assert.equal(report.totalGlobalOrders, 2);
      assert.equal(report.totalGlobalRevenueUsdCents, 22000);
      assert.equal(report.totalTaxCollectedUsdCents, 4300);

      assert.equal(report.jurisdictionSummaries.EU_OSS.totalOrders, 1);
      assert.equal(report.jurisdictionSummaries.UK_HMRC.totalOrders, 1);
      assert.equal(report.jurisdictionSummaries.US_STATE.totalOrders, 0);
    });
  });

  describe("Convex schema and persistence", () => {
    it("generates valid Convex schema definition for vat_remittance_reports", () => {
      const schema = generateConvexVatRemittanceSchema();
      assert.ok(schema.vat_remittance_reports);
      assert.equal(schema.vat_remittance_reports.columns.totalGlobalOrders, "number");
      assert.ok(schema.vat_remittance_reports.indexes.by_period);
    });

    it("persists tax remittance report and retrieves from memory store", () => {
      const report = generateTaxRemittanceReport("2026-Q3", []);
      persistTaxReport(report);

      const reports = getTaxReports();
      assert.equal(reports.length, 1);
      assert.equal(reports[0].reportingPeriod, "2026-Q3");
    });
  });
});
