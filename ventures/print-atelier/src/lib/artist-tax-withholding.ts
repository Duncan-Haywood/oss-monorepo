export type TaxClassification = "individual" | "sole_proprietor" | "single_member_llc" | "c_corp" | "s_corp" | "partnership";

export type ArtistTaxProfile = {
  artistHandle: string;
  legalName: string;
  email: string;
  tinLast4?: string; // Last 4 of SSN or EIN
  taxClassification: TaxClassification;
  tinStatus: "verified" | "unverified" | "missing";
  usResident: boolean;
  stateCode: string; // e.g. "CA", "NY", "TX"
};

export type ArtistAnnualPayoutData = {
  taxYear: number;
  grossSalesUsd: number;
  totalArtistNetPayoutsUsd: number; // 30% net profit split earnings
  totalStripeFeesUsd: number;
  payoutCount: number;
};

export type TaxWithholdingStatement = {
  statementId: string;
  artistHandle: string;
  legalName: string;
  taxYear: number;
  taxClassification: TaxClassification;
  tinStatus: "verified" | "unverified" | "missing";
  grossSalesUsd: number;
  artistEarningsUsd: number;
  stripeFeesUsd: number;
  backupWithholdingRatePct: number; // e.g. 0.24 = 24% IRS backup withholding rate
  backupWithholdingAmountUsd: number;
  netPayableUsd: number;
  requires1099Nec: boolean;
  requires1099K: boolean;
  requiresStateReporting: boolean;
  reportingNotes: string[];
  status: "draft" | "issued" | "filed";
  generatedAt: string;
};

export type TaxWithholdingBatchReport = {
  taxYear: number;
  statements: TaxWithholdingStatement[];
  totalArtistsProcessed: number;
  total1099NecEligibleCount: number;
  totalWithholdingAmountUsd: number;
  totalNetEarningsDistributedUsd: number;
  missingTinCount: number;
  warnings: string[];
};

export const IRS_1099_THRESHOLD_USD = 600.0;
export const IRS_BACKUP_WITHHOLDING_RATE = 0.24; // 24% mandatory IRS backup withholding for unverified TIN

export function generateArtistTaxStatement(
  profile: ArtistTaxProfile,
  payoutData: ArtistAnnualPayoutData,
): TaxWithholdingStatement {
  const statementId = `tax_stmt_${payoutData.taxYear}_${profile.artistHandle}_${Math.random().toString(36).substring(2, 7)}`;
  const artistEarningsUsd = Math.round(payoutData.totalArtistNetPayoutsUsd * 100) / 100;
  const grossSalesUsd = Math.round(payoutData.grossSalesUsd * 100) / 100;
  const stripeFeesUsd = Math.round(payoutData.totalStripeFeesUsd * 100) / 100;

  const reportingNotes: string[] = [];

  // Determine 1099 eligibility ($600 threshold for non-corporations)
  const isCorporation = profile.taxClassification === "c_corp" || profile.taxClassification === "s_corp";
  const requires1099Nec = !isCorporation && profile.usResident && artistEarningsUsd >= IRS_1099_THRESHOLD_USD;
  const requires1099K = profile.usResident && grossSalesUsd >= IRS_1099_THRESHOLD_USD && payoutData.payoutCount >= 1;

  if (requires1099Nec) {
    reportingNotes.push(`Eligible for Form 1099-NEC (Earnings $${artistEarningsUsd.toFixed(2)} >= $${IRS_1099_THRESHOLD_USD}).`);
  }

  // Backup withholding applies if TIN is missing or unverified for US residents
  let backupWithholdingRatePct = 0;
  let backupWithholdingAmountUsd = 0;

  if (profile.usResident && (profile.tinStatus === "missing" || profile.tinStatus === "unverified")) {
    backupWithholdingRatePct = IRS_BACKUP_WITHHOLDING_RATE;
    backupWithholdingAmountUsd = Math.round(artistEarningsUsd * IRS_BACKUP_WITHHOLDING_RATE * 100) / 100;
    reportingNotes.push(
      `Mandatory 24% IRS backup withholding applied ($${backupWithholdingAmountUsd.toFixed(2)}) due to ${profile.tinStatus} TIN.`,
    );
  }

  const netPayableUsd = Math.round((artistEarningsUsd - backupWithholdingAmountUsd) * 100) / 100;

  // State reporting checks (e.g. CA, NY, MA have specific state filing triggers)
  const stateFilingStates = ["CA", "NY", "MA", "VT", "NJ"];
  const requiresStateReporting = requires1099Nec && stateFilingStates.includes(profile.stateCode.toUpperCase());

  if (requiresStateReporting) {
    reportingNotes.push(`State filing required for state: ${profile.stateCode.toUpperCase()}.`);
  }

  if (isCorporation) {
    reportingNotes.push("Exempt from 1099-NEC filing due to corporate entity tax classification.");
  }

  return {
    statementId,
    artistHandle: profile.artistHandle,
    legalName: profile.legalName,
    taxYear: payoutData.taxYear,
    taxClassification: profile.taxClassification,
    tinStatus: profile.tinStatus,
    grossSalesUsd,
    artistEarningsUsd,
    stripeFeesUsd,
    backupWithholdingRatePct,
    backupWithholdingAmountUsd,
    netPayableUsd,
    requires1099Nec,
    requires1099K,
    requiresStateReporting,
    reportingNotes,
    status: "draft",
    generatedAt: new Date().toISOString(),
  };
}

export function generateAnnualTaxWithholdingBatchReport(
  records: Array<{ profile: ArtistTaxProfile; payoutData: ArtistAnnualPayoutData }>,
  taxYear: number,
): TaxWithholdingBatchReport {
  const statements = records
    .filter((r) => r.payoutData.taxYear === taxYear)
    .map((r) => generateArtistTaxStatement(r.profile, r.payoutData));

  const totalArtistsProcessed = statements.length;
  const total1099NecEligibleCount = statements.filter((s) => s.requires1099Nec).length;
  const totalWithholdingAmountUsd =
    Math.round(statements.reduce((sum, s) => sum + s.backupWithholdingAmountUsd, 0) * 100) / 100;
  const totalNetEarningsDistributedUsd =
    Math.round(statements.reduce((sum, s) => sum + s.netPayableUsd, 0) * 100) / 100;
  const missingTinCount = statements.filter((s) => s.tinStatus === "missing").length;

  const warnings: string[] = [];
  if (missingTinCount > 0) {
    warnings.push(`${missingTinCount} artist(s) have missing TINs and are subject to 24% backup withholding.`);
  }

  return {
    taxYear,
    statements,
    totalArtistsProcessed,
    total1099NecEligibleCount,
    totalWithholdingAmountUsd,
    totalNetEarningsDistributedUsd,
    missingTinCount,
    warnings,
  };
}

export type ConvexTaxStatementRecord = {
  statementId: string;
  artistHandle: string;
  legalName: string;
  taxYear: number;
  grossSalesUsd: number;
  artistEarningsUsd: number;
  backupWithholdingAmountUsd: number;
  netPayableUsd: number;
  requires1099Nec: boolean;
  status: string;
  generatedAt: string;
  convexSyncedAt: string;
};

const taxStatementStore: ConvexTaxStatementRecord[] = [];

export function generateConvexTaxWithholdingSchema() {
  const schemaCode = `
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  artist_tax_statements: defineTable({
    statementId: v.string(),
    artistHandle: v.string(),
    legalName: v.string(),
    taxYear: v.number(),
    grossSalesUsd: v.number(),
    artistEarningsUsd: v.number(),
    backupWithholdingAmountUsd: v.number(),
    netPayableUsd: v.number(),
    requires1099Nec: v.boolean(),
    status: v.string(),
    generatedAt: v.string(),
    convexSyncedAt: v.string(),
  })
    .index("by_statementId", ["statementId"])
    .index("by_artist_year", ["artistHandle", "taxYear"]),
});
`;
  return {
    tableName: "artist_tax_statements",
    indexes: ["by_statementId", "by_artist_year"],
    schemaCode: schemaCode.trim(),
  };
}

export function persistTaxWithholdingStatement(
  statement: TaxWithholdingStatement,
  timestamp: string = new Date().toISOString(),
): ConvexTaxStatementRecord {
  const record: ConvexTaxStatementRecord = {
    statementId: statement.statementId,
    artistHandle: statement.artistHandle,
    legalName: statement.legalName,
    taxYear: statement.taxYear,
    grossSalesUsd: statement.grossSalesUsd,
    artistEarningsUsd: statement.artistEarningsUsd,
    backupWithholdingAmountUsd: statement.backupWithholdingAmountUsd,
    netPayableUsd: statement.netPayableUsd,
    requires1099Nec: statement.requires1099Nec,
    status: statement.status,
    generatedAt: statement.generatedAt,
    convexSyncedAt: timestamp,
  };

  taxStatementStore.unshift(record);
  return record;
}

export function getTaxStatementRecords(limit?: number): ConvexTaxStatementRecord[] {
  let records = [...taxStatementStore];
  if (limit) records = records.slice(0, limit);
  return records;
}

export function clearTaxStatementStoreForTesting(): void {
  taxStatementStore.length = 0;
}
