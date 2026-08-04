/**
 * Automated Artist Payout Threshold Alerts & Tax Withholding Ledger Exporter
 * 
 * Enforces IRS 1099-K / W-8BEN tax compliance thresholds ($600 YTD), manages backup withholding,
 * blocks non-compliant disbursements, and exports IRS tax reporting ledgers.
 */

export type TaxFormType = "W9_US_RESIDENT" | "W8BEN_NON_US_INDIVIDUAL" | "W8BEN_E_NON_US_ENTITY";

export interface ArtistTaxProfile {
  artistId: string;
  legalName: string;
  taxFormType: TaxFormType;
  isFormVerified: boolean;
  countryCode: string; // e.g. "US", "DE", "GB", "JP"
  ytdGrossPayoutUsdCents: number;
}

export interface PayoutTaxLedgerEntry {
  entryId: string;
  artistId: string;
  legalName: string;
  grossPayoutUsdCents: number;
  ytdGrossPayoutUsdCentsAfterPayout: number;
  withholdingRatePercent: number;
  taxWithheldUsdCents: number;
  netPayoutUsdCents: number;
  requires1099K: boolean;
  isPayoutBlockedForTaxForm: boolean;
  notes: string[];
  processedAt: number;
}

export interface TaxLedgerReportSummary {
  totalEntries: number;
  totalGrossUsdCents: number;
  totalTaxWithheldUsdCents: number;
  totalNetUsdCents: number;
  requires1099KCount: number;
  blockedPayoutsCount: number;
  csvExportHeader: string;
  csvRows: string[];
}

// IRS 1099-K / Tax Threshold in USD cents ($600 USD = 60,000 cents)
export const TAX_REPORTING_THRESHOLD_USD_CENTS = 60000;

// Default backup withholding rates
const US_BACKUP_WITHHOLDING_RATE = 24.0; // 24% for unverified US W-9
const NON_RESIDENT_DEFAULT_WITHHOLDING_RATE = 30.0; // 30% default for unverified W-8BEN

let taxLedgerAuditStore: Map<string, PayoutTaxLedgerEntry> = new Map();

/**
 * Calculates tax withholding and enforces IRS reporting blocks for artist payouts.
 */
export function processPayoutTaxLedger(
  profile: ArtistTaxProfile,
  grossPayoutUsdCents: number,
  entryId: string
): PayoutTaxLedgerEntry {
  const notes: string[] = [];
  const updatedYtd = profile.ytdGrossPayoutUsdCents + grossPayoutUsdCents;
  const requires1099K = updatedYtd >= TAX_REPORTING_THRESHOLD_USD_CENTS;

  let isPayoutBlockedForTaxForm = false;
  let withholdingRatePercent = 0.0;

  if (requires1099K && !profile.isFormVerified) {
    isPayoutBlockedForTaxForm = true;
    notes.push(
      `Tax Compliance Block: YTD earnings ($${(updatedYtd / 100).toFixed(
        2
      )}) exceed $600 threshold without verified ${profile.taxFormType}.`
    );
  }

  // Determine withholding rate
  if (profile.taxFormType === "W9_US_RESIDENT") {
    if (profile.isFormVerified) {
      withholdingRatePercent = 0.0;
      notes.push("Verified W-9 on file: 0% US backup withholding applied.");
    } else {
      withholdingRatePercent = US_BACKUP_WITHHOLDING_RATE;
      notes.push(`Unverified W-9: ${US_BACKUP_WITHHOLDING_RATE}% US backup withholding applied.`);
    }
  } else {
    // Non-US W-8BEN / W-8BEN-E
    if (profile.isFormVerified) {
      // Simplified tax treaty rate assumption (e.g. 0% for treaty countries)
      withholdingRatePercent = 0.0;
      notes.push(`Verified ${profile.taxFormType}: Tax treaty 0% non-resident withholding applied.`);
    } else {
      withholdingRatePercent = NON_RESIDENT_DEFAULT_WITHHOLDING_RATE;
      notes.push(`Unverified ${profile.taxFormType}: ${NON_RESIDENT_DEFAULT_WITHHOLDING_RATE}% statutory non-resident withholding applied.`);
    }
  }

  const taxWithheldUsdCents = Math.round(grossPayoutUsdCents * (withholdingRatePercent / 100.0));
  const netPayoutUsdCents = isPayoutBlockedForTaxForm ? 0 : grossPayoutUsdCents - taxWithheldUsdCents;

  const result: PayoutTaxLedgerEntry = {
    entryId,
    artistId: profile.artistId,
    legalName: profile.legalName,
    grossPayoutUsdCents,
    ytdGrossPayoutUsdCentsAfterPayout: updatedYtd,
    withholdingRatePercent,
    taxWithheldUsdCents,
    netPayoutUsdCents,
    requires1099K,
    isPayoutBlockedForTaxForm,
    notes,
    processedAt: Date.now(),
  };

  taxLedgerAuditStore.set(entryId, result);
  return result;
}

/**
 * Summarizes tax withholding ledgers and generates CSV export rows for accounting/IRS reporting.
 */
export function exportTaxLedgerReport(entries: PayoutTaxLedgerEntry[]): TaxLedgerReportSummary {
  const totalEntries = entries.length;
  const csvExportHeader = "EntryID,ArtistID,LegalName,GrossUSD,TaxWithheldUSD,NetUSD,Requires1099K,Blocked";
  const csvRows: string[] = [];

  let totalGrossUsdCents = 0;
  let totalTaxWithheldUsdCents = 0;
  let totalNetUsdCents = 0;
  let requires1099KCount = 0;
  let blockedPayoutsCount = 0;

  for (const e of entries) {
    totalGrossUsdCents += e.grossPayoutUsdCents;
    totalTaxWithheldUsdCents += e.taxWithheldUsdCents;
    totalNetUsdCents += e.netPayoutUsdCents;
    if (e.requires1099K) requires1099KCount++;
    if (e.isPayoutBlockedForTaxForm) blockedPayoutsCount++;

    const grossUsd = (e.grossPayoutUsdCents / 100).toFixed(2);
    const taxUsd = (e.taxWithheldUsdCents / 100).toFixed(2);
    const netUsd = (e.netPayoutUsdCents / 100).toFixed(2);

    csvRows.push(
      `"${e.entryId}","${e.artistId}","${e.legalName}",${grossUsd},${taxUsd},${netUsd},${e.requires1099K},${e.isPayoutBlockedForTaxForm}`
    );
  }

  return {
    totalEntries,
    totalGrossUsdCents,
    totalTaxWithheldUsdCents,
    totalNetUsdCents,
    requires1099KCount,
    blockedPayoutsCount,
    csvExportHeader,
    csvRows,
  };
}

/**
 * Generates Convex Schema snippet for payout_tax_ledgers table.
 */
export function generateConvexPayoutTaxLedgerSchema(): string {
  return `
export const payout_tax_ledgers = defineTable({
  entryId: v.string(),
  artistId: v.string(),
  legalName: v.string(),
  grossPayoutUsdCents: v.number(),
  taxWithheldUsdCents: v.number(),
  netPayoutUsdCents: v.number(),
  requires1099K: v.boolean(),
  isPayoutBlockedForTaxForm: v.boolean(),
  processedAt: v.number(),
}).index("by_artist", ["artistId"])
  .index("by_blocked", ["isPayoutBlockedForTaxForm"]);
`.trim();
}

/**
 * Retrieves a cached tax ledger entry by entry ID.
 */
export function getPayoutTaxLedgerEntry(entryId: string): PayoutTaxLedgerEntry | undefined {
  return taxLedgerAuditStore.get(entryId);
}

/**
 * Clears the in-memory tax ledger store for testing.
 */
export function clearTaxLedgerStoreForTesting(): void {
  taxLedgerAuditStore.clear();
}
