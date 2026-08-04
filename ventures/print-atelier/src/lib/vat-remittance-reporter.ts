/**
 * Automated Multi-Currency Tax & VAT Remittance Report Generator for International Nexus Thresholds
 * 
 * Supports:
 * - EU IOSS (Import One Stop Shop) & OSS (One Stop Shop) tax remittance calculation
 * - UK HMRC VAT threshold & quarterly liability reporting
 * - US State Economic Nexus threshold tracking ($100k revenue or 200 transactions)
 * - Tax collected vs tax liability reconciliation by jurisdiction
 * - Convex schema definition & in-memory report persistence for financial audits
 */

export type TaxJurisdiction = "EU_OSS" | "UK_HMRC" | "US_STATE" | "AU_ATO" | "CA_CRA" | "ROW";

export interface TaxLineItem {
  orderId: string;
  destinationCountry: string; // ISO 2-letter e.g. "DE", "GB", "US", "CA", "AU"
  stateRegion?: string; // e.g. "CA", "NY" for US
  currency: string;
  orderTotalUsdCents: number;
  taxableAmountUsdCents: number;
  taxCollectedUsdCents: number;
  effectiveTaxRatePercent: number;
  timestamp: number;
}

export interface NexusThresholdStatus {
  jurisdiction: TaxJurisdiction;
  regionCode: string; // e.g. "EU", "UK", "US-CA", "US-NY"
  annualRevenueUsdCents: number;
  annualTransactionCount: number;
  thresholdRevenueUsdCents: number; // e.g. $100,000 for US CA or €10,000 for EU intra-community
  thresholdTransactionCount?: number; // e.g. 200 for US states
  isNexusEstablished: boolean;
  registrationRequired: boolean;
  filingFrequency: "monthly" | "quarterly" | "annual";
}

export interface VatRemittanceSummary {
  jurisdiction: TaxJurisdiction;
  totalOrders: number;
  totalGrossRevenueUsdCents: number;
  totalTaxableRevenueUsdCents: number;
  totalTaxCollectedUsdCents: number;
  currency: string;
  nexusEstablished: boolean;
  remittanceDueDate: string; // ISO YYYY-MM-DD
  lineItems: TaxLineItem[];
}

export interface GlobalTaxRemittanceReport {
  reportId?: string;
  reportingPeriod: string; // e.g. "2026-Q3"
  totalGlobalOrders: number;
  totalGlobalRevenueUsdCents: number;
  totalTaxCollectedUsdCents: number;
  jurisdictionSummaries: Record<TaxJurisdiction, VatRemittanceSummary>;
  nexusStatuses: NexusThresholdStatus[];
  generatedAt: number;
}

// In-memory store for tax remittance reports
let taxReportStore: GlobalTaxRemittanceReport[] = [];

/**
 * Standard annual nexus thresholds by jurisdiction/region
 */
export const STANDARD_NEXUS_THRESHOLDS: Record<string, { revenueCents: number; txCount?: number }> = {
  "EU": { revenueCents: 1000000 }, // €10,000 intra-EU threshold (1,000,000 USD cents approx)
  "UK": { revenueCents: 9000000 }, // £90,000 HMRC registration threshold
  "US-CA": { revenueCents: 50000000 }, // $500,000 California Economic Nexus
  "US-NY": { revenueCents: 50000000, txCount: 100 }, // $500k + 100 txs New York
  "US-TX": { revenueCents: 50000000 }, // $500,000 Texas
  "US-FL": { revenueCents: 10000000 }, // $100,000 Florida
  "US-DEFAULT": { revenueCents: 10000000, txCount: 200 }, // $100k or 200 txs baseline
  "AU": { revenueCents: 7500000 }, // $75,000 AUD (~$50k USD) GST registration threshold
  "CA": { revenueCents: 3000000 }, // $30,000 CAD (~$22k USD) GST/HST registration threshold
};

/**
 * Categorizes destination country/region into TaxJurisdiction
 */
export function classifyTaxJurisdiction(country: string, state?: string): TaxJurisdiction {
  const destUpper = country.toUpperCase();
  const euCountries = ["DE", "FR", "ES", "IT", "NL", "BE", "AT", "SE", "DK", "PL", "IE", "PT", "FI", "GR", "CZ"];

  if (euCountries.includes(destUpper)) return "EU_OSS";
  if (destUpper === "GB" || destUpper === "UK") return "UK_HMRC";
  if (destUpper === "US") return "US_STATE";
  if (destUpper === "AU") return "AU_ATO";
  if (destUpper === "CA") return "CA_CRA";

  return "ROW";
}

/**
 * Evaluates economic nexus status for a given region based on YTD orders
 */
export function evaluateNexusThreshold(
  jurisdiction: TaxJurisdiction,
  regionCode: string,
  ytdOrders: TaxLineItem[]
): NexusThresholdStatus {
  const matchingOrders = ytdOrders.filter((item) => {
    if (jurisdiction === "US_STATE") {
      return item.destinationCountry.toUpperCase() === "US" && item.stateRegion === regionCode.replace("US-", "");
    }
    return classifyTaxJurisdiction(item.destinationCountry) === jurisdiction;
  });

  const annualRevenueUsdCents = matchingOrders.reduce((sum, item) => sum + item.orderTotalUsdCents, 0);
  const annualTransactionCount = matchingOrders.length;

  const thresholdConfig = STANDARD_NEXUS_THRESHOLDS[regionCode] || STANDARD_NEXUS_THRESHOLDS["US-DEFAULT"];
  const thresholdRev = thresholdConfig.revenueCents;
  const thresholdTx = thresholdConfig.txCount;

  let isNexusEstablished = annualRevenueUsdCents >= thresholdRev;
  if (!isNexusEstablished && thresholdTx !== undefined) {
    isNexusEstablished = annualTransactionCount >= thresholdTx;
  }

  let filingFrequency: "monthly" | "quarterly" | "annual" = "quarterly";
  if (annualRevenueUsdCents >= thresholdRev * 2) {
    filingFrequency = "monthly";
  } else if (annualRevenueUsdCents < thresholdRev * 0.2) {
    filingFrequency = "annual";
  }

  return {
    jurisdiction,
    regionCode,
    annualRevenueUsdCents,
    annualTransactionCount,
    thresholdRevenueUsdCents: thresholdRev,
    thresholdTransactionCount: thresholdTx,
    isNexusEstablished,
    registrationRequired: isNexusEstablished,
    filingFrequency,
  };
}

/**
 * Generates a global tax remittance report from line items
 */
export function generateTaxRemittanceReport(
  period: string,
  lineItems: TaxLineItem[],
  nexusEvaluations?: NexusThresholdStatus[]
): GlobalTaxRemittanceReport {
  const jurisdictions: TaxJurisdiction[] = ["EU_OSS", "UK_HMRC", "US_STATE", "AU_ATO", "CA_CRA", "ROW"];
  // Built up key by key in the loop below, so it starts partial and is asserted
  // complete once every jurisdiction has been visited.
  const jurisdictionSummaries = {} as Record<TaxJurisdiction, VatRemittanceSummary>;

  for (const j of jurisdictions) {
    const jItems = lineItems.filter((item) => classifyTaxJurisdiction(item.destinationCountry, item.stateRegion) === j);
    const totalOrders = jItems.length;
    const totalGross = jItems.reduce((sum, i) => sum + i.orderTotalUsdCents, 0);
    const totalTaxable = jItems.reduce((sum, i) => sum + i.taxableAmountUsdCents, 0);
    const totalTaxCollected = jItems.reduce((sum, i) => sum + i.taxCollectedUsdCents, 0);

    const nexusEstablished = nexusEvaluations
      ? nexusEvaluations.some((n) => n.jurisdiction === j && n.isNexusEstablished)
      : totalGross > 1000000; // default threshold check

    let currency = "USD";
    if (j === "EU_OSS") currency = "EUR";
    if (j === "UK_HMRC") currency = "GBP";
    if (j === "AU_ATO") currency = "AUD";
    if (j === "CA_CRA") currency = "CAD";

    jurisdictionSummaries[j] = {
      jurisdiction: j,
      totalOrders,
      totalGrossRevenueUsdCents: totalGross,
      totalTaxableRevenueUsdCents: totalTaxable,
      totalTaxCollectedUsdCents: totalTaxCollected,
      currency,
      nexusEstablished,
      remittanceDueDate: `${period.slice(0, 4)}-10-31`,
      lineItems: jItems,
    };
  }

  const totalGlobalOrders = lineItems.length;
  const totalGlobalRevenueUsdCents = lineItems.reduce((sum, i) => sum + i.orderTotalUsdCents, 0);
  const totalTaxCollectedUsdCents = lineItems.reduce((sum, i) => sum + i.taxCollectedUsdCents, 0);

  const defaultNexusStatuses: NexusThresholdStatus[] = [
    evaluateNexusThreshold("EU_OSS", "EU", lineItems),
    evaluateNexusThreshold("UK_HMRC", "UK", lineItems),
    evaluateNexusThreshold("US_STATE", "US-CA", lineItems),
  ];

  return {
    reportId: `TAX-RPT-${period}-${Date.now()}`,
    reportingPeriod: period,
    totalGlobalOrders,
    totalGlobalRevenueUsdCents,
    totalTaxCollectedUsdCents,
    jurisdictionSummaries,
    nexusStatuses: nexusEvaluations || defaultNexusStatuses,
    generatedAt: Date.now(),
  };
}

/**
 * Generates Convex schema definition for vat_remittance_reports table
 */
export function generateConvexVatRemittanceSchema(): {
  vat_remittance_reports: {
    columns: Record<string, string>;
    indexes: Record<string, string[]>;
  };
} {
  return {
    vat_remittance_reports: {
      columns: {
        reportId: "string",
        reportingPeriod: "string",
        totalGlobalOrders: "number",
        totalGlobalRevenueUsdCents: "number",
        totalTaxCollectedUsdCents: "number",
        generatedAt: "number",
      },
      indexes: {
        by_period: ["reportingPeriod"],
        by_report_id: ["reportId"],
      },
    },
  };
}

/**
 * Persists a tax remittance report to in-memory store
 */
export function persistTaxReport(report: GlobalTaxRemittanceReport): GlobalTaxRemittanceReport {
  taxReportStore.push(report);
  return report;
}

/**
 * Retrieves persisted tax remittance reports
 */
export function getTaxReports(): GlobalTaxRemittanceReport[] {
  return [...taxReportStore];
}

/**
 * Clears tax report store for isolated testing
 */
export function clearTaxReportsForTesting(): void {
  taxReportStore = [];
}
