export type PayoutDisputeReason =
  | "missing_payout"
  | "fee_discrepancy"
  | "tax_withholding"
  | "other";

export type PayoutDisputeStatus =
  | "open"
  | "investigating"
  | "resolved"
  | "dismissed";

export interface PayoutDisputeRecord {
  disputeId: string;
  artistHandle: string;
  payoutId: string;
  disputedAmountUsdCents: number;
  reason: PayoutDisputeReason;
  status: PayoutDisputeStatus;
  resolutionNotes?: string;
  openedAt: number;
  resolvedAt?: number;
}

export interface DisputeSlaVelocityMetrics {
  totalDisputesLogged: number;
  openDisputesCount: number;
  resolvedDisputesCount: number;
  averageResolutionHours: number;
  withinSlaResolutionPercent: number;
  totalDisputedUsdCents: number;
}

const disputesStore = new Map<string, PayoutDisputeRecord>();

export function clearDisputesForTesting(): void {
  disputesStore.clear();
}

export function logPayoutDispute(
  artistHandle: string,
  payoutId: string,
  disputedAmountUsdCents: number,
  reason: PayoutDisputeReason,
): PayoutDisputeRecord {
  const disputeId = `disp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const record: PayoutDisputeRecord = {
    disputeId,
    artistHandle,
    payoutId,
    disputedAmountUsdCents,
    reason,
    status: "open",
    openedAt: Date.now(),
  };
  disputesStore.set(disputeId, record);
  return record;
}

export function resolvePayoutDispute(
  disputeId: string,
  resolutionNotes?: string,
): PayoutDisputeRecord | undefined {
  const record = disputesStore.get(disputeId);
  if (!record) return undefined;

  record.status = "resolved";
  record.resolvedAt = Date.now();
  if (resolutionNotes) {
    record.resolutionNotes = resolutionNotes;
  }
  return record;
}

export function calculateDisputeSlaVelocityMetrics(
  slaTargetHours = 48,
): DisputeSlaVelocityMetrics {
  const all = Array.from(disputesStore.values());
  if (all.length === 0) {
    return {
      totalDisputesLogged: 0,
      openDisputesCount: 0,
      resolvedDisputesCount: 0,
      averageResolutionHours: 0,
      withinSlaResolutionPercent: 100,
      totalDisputedUsdCents: 0,
    };
  }

  const openDisputes = all.filter(
    (d) => d.status === "open" || d.status === "investigating",
  );
  const resolvedDisputes = all.filter((d) => d.status === "resolved");

  let totalResolutionHours = 0;
  let withinSlaCount = 0;

  for (const dispute of resolvedDisputes) {
    const durationHours =
      ((dispute.resolvedAt || Date.now()) - dispute.openedAt) / (1000 * 3600);
    totalResolutionHours += durationHours;
    if (durationHours <= slaTargetHours) {
      withinSlaCount++;
    }
  }

  const averageResolutionHours =
    resolvedDisputes.length > 0
      ? totalResolutionHours / resolvedDisputes.length
      : 0;

  const withinSlaResolutionPercent =
    resolvedDisputes.length > 0
      ? Math.round((withinSlaCount / resolvedDisputes.length) * 100)
      : 100;

  const totalDisputedUsdCents = all.reduce(
    (acc, d) => acc + d.disputedAmountUsdCents,
    0,
  );

  return {
    totalDisputesLogged: all.length,
    openDisputesCount: openDisputes.length,
    resolvedDisputesCount: resolvedDisputes.length,
    averageResolutionHours,
    withinSlaResolutionPercent,
    totalDisputedUsdCents,
  };
}

export function getPrioritizedOpenDisputes(): PayoutDisputeRecord[] {
  return Array.from(disputesStore.values())
    .filter((d) => d.status === "open" || d.status === "investigating")
    .sort((a, b) => b.disputedAmountUsdCents - a.disputedAmountUsdCents);
}

export function generateConvexDisputeSchema(): Record<string, any> {
  return {
    payout_dispute_logs: {
      fields: {
        disputeId: "string",
        artistHandle: "string",
        payoutId: "string",
        disputedAmountUsdCents: "number",
        reason: "string",
        status: "string",
        resolutionNotes: "optional(string)",
        openedAt: "number",
        resolvedAt: "optional(number)",
      },
      indexes: {
        by_artist: ["artistHandle"],
        by_status: ["status"],
        by_opened_at: ["openedAt"],
      },
    },
  };
}
