import { formatStripeCurrency } from "@/lib/stripe-connect";

export type StripeConnectFeeConfig = {
  payoutFeeRate?: number; // Standard: 0.0025 (0.25%)
  payoutFeeFixedCents?: number; // Standard: 25 cents per payout transfer
};

export type PayoutReserveHealthInput = {
  availablePlatformBalanceCents: number;
  pendingArtistTransfersCents: number;
  unresolvedPayoutVariancesCents?: number;
  monthlyFulfillmentLiabilityCents?: number;
  monthlyGrossRevenueCents?: number;
  chargebackReserveRate?: number; // Default 0.05 (5%)
  customReserveTargetCents?: number;
  connectFeeConfig?: StripeConnectFeeConfig;
  transfersCount?: number;
};

export type PayoutReserveHealthStatus = "healthy" | "warning" | "critical";

export type PayoutReserveHealthReport = {
  status: PayoutReserveHealthStatus;
  availablePlatformBalanceCents: number;
  totalPendingLiabilitiesCents: number;
  estimatedConnectPayoutFeesCents: number;
  estimatedChargebackReserveCents: number;
  recommendedReserveBufferCents: number;
  netSafetyMarginCents: number;
  reserveCoverageRatio: number;
  reserveCoveragePercent: number;
  warnings: string[];
  recommendations: string[];
  breakdown: {
    pendingArtistTransfersCents: number;
    unresolvedPayoutVariancesCents: number;
    monthlyFulfillmentLiabilityCents: number;
    estimatedConnectPayoutFeesCents: number;
    estimatedChargebackReserveCents: number;
  };
};

const DEFAULT_CONNECT_FEE_RATE = 0.0025; // 0.25%
const DEFAULT_CONNECT_FEE_FIXED_CENTS = 25; // $0.25
const DEFAULT_CHARGEBACK_RESERVE_RATE = 0.05; // 5%

export function calculateConnectPayoutFeeCents(
  transferAmountCents: number,
  config?: StripeConnectFeeConfig,
): number {
  if (transferAmountCents <= 0) return 0;
  const rate = config?.payoutFeeRate ?? DEFAULT_CONNECT_FEE_RATE;
  const fixed = config?.payoutFeeFixedCents ?? DEFAULT_CONNECT_FEE_FIXED_CENTS;
  return Math.round(transferAmountCents * rate) + fixed;
}

export function inspectPayoutReserveHealth({
  availablePlatformBalanceCents,
  pendingArtistTransfersCents,
  unresolvedPayoutVariancesCents = 0,
  monthlyFulfillmentLiabilityCents = 0,
  monthlyGrossRevenueCents = 0,
  chargebackReserveRate = DEFAULT_CHARGEBACK_RESERVE_RATE,
  customReserveTargetCents,
  connectFeeConfig,
  transfersCount = 1,
}: PayoutReserveHealthInput): PayoutReserveHealthReport {
  const safeTransfersCount = Math.max(transfersCount, 1);
  const perTransferPendingCents =
    safeTransfersCount > 0 ? Math.round(pendingArtistTransfersCents / safeTransfersCount) : 0;

  const estimatedConnectPayoutFeesCents =
    pendingArtistTransfersCents > 0
      ? calculateConnectPayoutFeeCents(perTransferPendingCents, connectFeeConfig) *
        safeTransfersCount
      : 0;

  const estimatedChargebackReserveCents = Math.round(
    monthlyGrossRevenueCents * chargebackReserveRate,
  );

  const totalPendingLiabilitiesCents =
    pendingArtistTransfersCents +
    unresolvedPayoutVariancesCents +
    monthlyFulfillmentLiabilityCents +
    estimatedConnectPayoutFeesCents;

  const recommendedReserveBufferCents =
    typeof customReserveTargetCents === "number" && customReserveTargetCents >= 0
      ? customReserveTargetCents
      : totalPendingLiabilitiesCents + estimatedChargebackReserveCents;

  const netSafetyMarginCents = availablePlatformBalanceCents - recommendedReserveBufferCents;
  const reserveCoverageRatio =
    recommendedReserveBufferCents > 0
      ? Math.round((availablePlatformBalanceCents / recommendedReserveBufferCents) * 1000) / 1000
      : availablePlatformBalanceCents >= 0
      ? 2.0
      : 0.0;

  const reserveCoveragePercent = Math.round(reserveCoverageRatio * 100);

  const warnings: string[] = [];
  const recommendations: string[] = [];

  let status: PayoutReserveHealthStatus = "healthy";

  if (reserveCoverageRatio < 1.0) {
    status = "critical";
    warnings.push(
      `CRITICAL: Platform cash deficit of ${formatStripeCurrency(
        Math.abs(netSafetyMarginCents) / 100,
      )}. Available balance cannot cover pending liabilities and reserve target.`,
    );
    recommendations.push(
      `Pause batch artist Connect transfers immediately until platform account is topped up by ${formatStripeCurrency(
        Math.abs(netSafetyMarginCents) / 100,
      )}.`,
    );
  } else if (reserveCoverageRatio < 1.2) {
    status = "warning";
    warnings.push(
      `WARNING: Reserve buffer coverage is thin (${reserveCoveragePercent}%). Buffer margin is only ${formatStripeCurrency(
        netSafetyMarginCents / 100,
      )} above target liabilities.`,
    );
    recommendations.push(
      `Monitor incoming retail checkout sales before releasing pending Connect payouts.`,
    );
  } else {
    recommendations.push(
      `Platform reserve buffer is healthy (${reserveCoveragePercent}% coverage). Retained margin is sufficient for Connect payouts.`,
    );
  }

  if (pendingArtistTransfersCents > availablePlatformBalanceCents) {
    warnings.push(
      `Pending artist transfers (${formatStripeCurrency(
        pendingArtistTransfersCents / 100,
      )}) exceed current available platform balance (${formatStripeCurrency(
        availablePlatformBalanceCents / 100,
      )}).`,
    );
  }

  if (unresolvedPayoutVariancesCents > 0) {
    warnings.push(
      `Unresolved artist payout variances total ${formatStripeCurrency(
        unresolvedPayoutVariancesCents / 100,
      )} across underpaid Connect accounts.`,
    );
    recommendations.push(
      `Schedule batch transfer top-ups for underpaid accounts after verifying reserve buffer safety.`,
    );
  }

  return {
    status,
    availablePlatformBalanceCents,
    totalPendingLiabilitiesCents,
    estimatedConnectPayoutFeesCents,
    estimatedChargebackReserveCents,
    recommendedReserveBufferCents,
    netSafetyMarginCents,
    reserveCoverageRatio,
    reserveCoveragePercent,
    warnings,
    recommendations,
    breakdown: {
      pendingArtistTransfersCents,
      unresolvedPayoutVariancesCents,
      monthlyFulfillmentLiabilityCents,
      estimatedConnectPayoutFeesCents,
      estimatedChargebackReserveCents,
    },
  };
}

export type ConvexPayoutReserveSnapshotRecord = {
  snapshotId: string;
  timestamp: string;
  status: PayoutReserveHealthStatus;
  availablePlatformBalanceCents: number;
  totalPendingLiabilitiesCents: number;
  recommendedReserveBufferCents: number;
  netSafetyMarginCents: number;
  reserveCoveragePercent: number;
  warningsCount: number;
  warnings: string[];
  recommendations: string[];
  convexSyncedAt: string;
};

const reserveSnapshotStore: ConvexPayoutReserveSnapshotRecord[] = [];

export function generateConvexPayoutReserveHealthSchema() {
  const schemaCode = `
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  payout_reserve_snapshots: defineTable({
    snapshotId: v.string(),
    timestamp: v.string(),
    status: v.union(v.literal("healthy"), v.literal("warning"), v.literal("critical")),
    availablePlatformBalanceCents: v.number(),
    totalPendingLiabilitiesCents: v.number(),
    recommendedReserveBufferCents: v.number(),
    netSafetyMarginCents: v.number(),
    reserveCoveragePercent: v.number(),
    warningsCount: v.number(),
    warnings: v.array(v.string()),
    recommendations: v.array(v.string()),
    convexSyncedAt: v.string(),
  })
    .index("by_snapshotId", ["snapshotId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_status", ["status"]),
});
`;
  return {
    tableName: "payout_reserve_snapshots",
    indexes: ["by_snapshotId", "by_timestamp", "by_status"],
    schemaCode: schemaCode.trim(),
  };
}

export function persistPayoutReserveSnapshot(
  report: PayoutReserveHealthReport,
  timestamp: string = new Date().toISOString(),
): ConvexPayoutReserveSnapshotRecord {
  const snapshotId = `res_snap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const record: ConvexPayoutReserveSnapshotRecord = {
    snapshotId,
    timestamp,
    status: report.status,
    availablePlatformBalanceCents: report.availablePlatformBalanceCents,
    totalPendingLiabilitiesCents: report.totalPendingLiabilitiesCents,
    recommendedReserveBufferCents: report.recommendedReserveBufferCents,
    netSafetyMarginCents: report.netSafetyMarginCents,
    reserveCoveragePercent: report.reserveCoveragePercent,
    warningsCount: report.warnings.length,
    warnings: report.warnings,
    recommendations: report.recommendations,
    convexSyncedAt: timestamp,
  };

  reserveSnapshotStore.unshift(record);
  return record;
}

export function getPayoutReserveSnapshots(options?: {
  status?: PayoutReserveHealthStatus;
  limit?: number;
}): ConvexPayoutReserveSnapshotRecord[] {
  let records = [...reserveSnapshotStore];
  if (options?.status) {
    records = records.filter((r) => r.status === options.status);
  }
  if (options?.limit) {
    records = records.slice(0, options.limit);
  }
  return records;
}

export function clearPayoutReserveSnapshotsForTesting(): void {
  reserveSnapshotStore.length = 0;
}
