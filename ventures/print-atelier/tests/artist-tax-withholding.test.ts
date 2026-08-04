import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  generateArtistTaxStatement,
  generateAnnualTaxWithholdingBatchReport,
  generateConvexTaxWithholdingSchema,
  persistTaxWithholdingStatement,
  getTaxStatementRecords,
  clearTaxStatementStoreForTesting,
  IRS_1099_THRESHOLD_USD,
  IRS_BACKUP_WITHHOLDING_RATE,
  type ArtistTaxProfile,
  type ArtistAnnualPayoutData,
} from "../src/lib/artist-tax-withholding";

describe("artist-tax-withholding", () => {
  beforeEach(() => {
    clearTaxStatementStoreForTesting();
  });

  const sampleProfile: ArtistTaxProfile = {
    artistHandle: "elena_wave",
    legalName: "Elena Rostova",
    email: "elena@example.com",
    tinLast4: "4321",
    taxClassification: "individual",
    tinStatus: "verified",
    usResident: true,
    stateCode: "CA",
  };

  const samplePayouts: ArtistAnnualPayoutData = {
    taxYear: 2026,
    grossSalesUsd: 3000.0,
    totalArtistNetPayoutsUsd: 900.0, // 30% of $3000
    totalStripeFeesUsd: 87.0,
    payoutCount: 12,
  };

  it("generates 1099-NEC eligible statement for earnings >= $600 with verified TIN", () => {
    const stmt = generateArtistTaxStatement(sampleProfile, samplePayouts);

    assert.equal(stmt.artistEarningsUsd, 900.0);
    assert.equal(stmt.requires1099Nec, true);
    assert.equal(stmt.backupWithholdingAmountUsd, 0);
    assert.equal(stmt.netPayableUsd, 900.0);
    assert.equal(stmt.requiresStateReporting, true); // CA is state reporting state
  });

  it("applies 24% IRS backup withholding when TIN is missing", () => {
    const missingTinProfile: ArtistTaxProfile = {
      ...sampleProfile,
      tinStatus: "missing",
    };

    const stmt = generateArtistTaxStatement(missingTinProfile, samplePayouts);

    const expectedWithholding = Math.round(900.0 * IRS_BACKUP_WITHHOLDING_RATE * 100) / 100;
    assert.equal(stmt.backupWithholdingRatePct, 0.24);
    assert.equal(stmt.backupWithholdingAmountUsd, expectedWithholding);
    assert.equal(stmt.netPayableUsd, 900.0 - expectedWithholding);
    assert.equal(stmt.reportingNotes.some((n) => n.includes("backup withholding")), true);
  });

  it("exempts corporate entities from 1099-NEC filing", () => {
    const corpProfile: ArtistTaxProfile = {
      ...sampleProfile,
      taxClassification: "c_corp",
    };

    const stmt = generateArtistTaxStatement(corpProfile, samplePayouts);

    assert.equal(stmt.requires1099Nec, false);
    assert.equal(stmt.reportingNotes.some((n) => n.includes("corporate entity")), true);
  });

  it("exempts earnings below $600 threshold from 1099-NEC", () => {
    const lowPayouts: ArtistAnnualPayoutData = {
      ...samplePayouts,
      totalArtistNetPayoutsUsd: 450.0,
    };

    const stmt = generateArtistTaxStatement(sampleProfile, lowPayouts);

    assert.equal(stmt.requires1099Nec, false);
  });

  it("aggregates batch report for annual tax processing", () => {
    const p1 = { profile: sampleProfile, payoutData: samplePayouts };
    const p2 = {
      profile: { ...sampleProfile, artistHandle: "marcus_art", tinStatus: "missing" as const },
      payoutData: samplePayouts,
    };

    const report = generateAnnualTaxWithholdingBatchReport([p1, p2], 2026);

    assert.equal(report.totalArtistsProcessed, 2);
    assert.equal(report.total1099NecEligibleCount, 2);
    assert.equal(report.missingTinCount, 1);
    assert.ok(report.totalWithholdingAmountUsd > 0);
    assert.equal(report.warnings.length, 1);
  });

  it("generates valid Convex schema code and index definitions", () => {
    const schema = generateConvexTaxWithholdingSchema();

    assert.equal(schema.tableName, "artist_tax_statements");
    assert.ok(schema.indexes.includes("by_statementId"));
    assert.ok(schema.indexes.includes("by_artist_year"));
    assert.ok(schema.schemaCode.includes("defineTable"));
  });

  it("persists tax statement records to Convex store and retrieves them", () => {
    const stmt = generateArtistTaxStatement(sampleProfile, samplePayouts);
    const record = persistTaxWithholdingStatement(stmt);

    assert.equal(record.statementId, stmt.statementId);
    assert.equal(record.artistHandle, "elena_wave");
    assert.equal(record.requires1099Nec, true);

    const history = getTaxStatementRecords();
    assert.equal(history.length, 1);
    assert.equal(history[0].statementId, stmt.statementId);
  });
});
