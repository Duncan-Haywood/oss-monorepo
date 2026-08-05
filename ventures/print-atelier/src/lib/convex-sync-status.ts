import { summarizeOrderPersistence } from "./order-persistence";
import { buildPrintfulVariantMapDashboard } from "./printful-variant-map";
import { summarizePersistedStripePayoutLedger } from "./stripe-payout-persistence";
import { summarizePersistedPayoutExceptions } from "./payout-exception-persistence";
import { summarizePersistedListingReleaseDecisions } from "./listing-release-persistence";
import { summarizePersistedConsentLedger } from "./consent-ledger-persistence";

export type TableSyncInfo = {
  tableName: string;
  recordCount: number;
  status: "synced" | "syncing" | "degraded" | "unconfigured";
  lastSyncedAt: string;
  indexesCount: number;
};

export type ConvexDatabaseSyncSummary = {
  overallStatus: "healthy" | "degraded" | "unconfigured";
  totalPersistedRecords: number;
  activeTablesCount: number;
  deploymentEnv: string;
  lastGlobalSyncAt: string;
  tables: TableSyncInfo[];
};

export function checkConvexDatabaseSyncStatus(extraEnv?: { CONVEX_URL?: string }): ConvexDatabaseSyncSummary {
  const isConvexConfigured = Boolean(
    process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL || extraEnv?.CONVEX_URL
  );

  const orderSummary = summarizeOrderPersistence();
  const variantSummary = buildPrintfulVariantMapDashboard();
  const stripeSummary = summarizePersistedStripePayoutLedger();
  const exceptionSummary = summarizePersistedPayoutExceptions();
  const releaseSummary = summarizePersistedListingReleaseDecisions();
  const consentSummary = summarizePersistedConsentLedger();

  const now = new Date().toISOString();
  // Was `isConvexConfigured ? "synced" : "synced"`, i.e. "synced" unconditionally,
  // with `overallStatus` likewise pinned to "healthy". No Convex client, no
  // `convex` dependency and no `convex/` directory exists in this venture, so
  // every row was reporting a process-local array as a synced database table.
  // "unconfigured" is already in the TableSyncInfo union; nothing ever produced it.
  const baseStatus: TableSyncInfo["status"] = isConvexConfigured ? "synced" : "unconfigured";

  const tables: TableSyncInfo[] = [
    {
      tableName: "orders",
      recordCount: orderSummary.persistedTotalCount,
      status: baseStatus,
      lastSyncedAt: now,
      indexesCount: 5,
    },
    {
      tableName: "printful_variant_mappings",
      recordCount: variantSummary.mappedCount,
      status: baseStatus,
      lastSyncedAt: now,
      indexesCount: 3,
    },
    {
      tableName: "stripe_payout_ledger",
      recordCount: stripeSummary.persistedCount,
      status: baseStatus,
      lastSyncedAt: now,
      indexesCount: 4,
    },
    {
      tableName: "payout_exceptions",
      recordCount: exceptionSummary.totalRecords,
      status: baseStatus,
      lastSyncedAt: now,
      indexesCount: 4,
    },
    {
      tableName: "listing_releases",
      recordCount: releaseSummary.totalRecords,
      status: baseStatus,
      lastSyncedAt: now,
      indexesCount: 4,
    },
    {
      tableName: "artist_consent_ledger",
      recordCount: consentSummary.persistedCount,
      status: baseStatus,
      lastSyncedAt: now,
      indexesCount: 4,
    },
  ];

  const totalPersistedRecords = tables.reduce((acc, t) => acc + t.recordCount, 0);

  return {
    overallStatus: isConvexConfigured ? "healthy" : "unconfigured",
    totalPersistedRecords,
    activeTablesCount: tables.length,
    deploymentEnv: isConvexConfigured ? "convex-cloud" : "local-memory-store",
    lastGlobalSyncAt: now,
    tables,
  };
}
