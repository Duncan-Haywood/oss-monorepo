import { getOrderRecords, type OrderRecord } from "./orders";
import {
  queryPersistedStripePayoutEvents,
  type PersistedStripePayoutEvent,
} from "./stripe-payout-persistence";

/**
 * Per-artist reconciliation of the 30% net-profit payout we promise against the
 * Stripe Connect transfers we actually sent.
 *
 * Two distinct failures are worth separating:
 *
 * - **Underpayment** is a trust and contract exposure. We told the artist 30% of
 *   net profit; if the transfers do not add up, we owe them money.
 * - **Overpayment** is a margin leak. It never surfaces as a complaint, so
 *   nothing else in the system would catch it.
 *
 * All arithmetic is in integer cents. Payout variance is exactly the place where
 * accumulated float error becomes a real discrepancy, and `artistTransferTotal`
 * arrives from Stripe metadata as a decimal string.
 */

export type ArtistPayoutExpectation = {
  artistAccountId: string;
  artistHandle?: string;
  orderId: string;
  expectedPayoutCents: number;
  currency: string;
  recordedAt: string;
};

export type ArtistPayoutReconciliationStatus =
  | "balanced"
  | "underpaid"
  | "overpaid"
  | "unpaid"
  | "unattributed";

export type ArtistPayoutReconciliationRow = {
  artistAccountId: string;
  artistHandle: string | null;
  currency: string;
  orderCount: number;
  transferCount: number;
  expectedPayoutCents: number;
  settledPayoutCents: number;
  pendingPayoutCents: number;
  failedPayoutCents: number;
  /** (settled + pending) - expected. Pending counts: an in-flight transfer is committed money. */
  varianceCents: number;
  status: ArtistPayoutReconciliationStatus;
  exceptions: string[];
  actionLabel: string;
};

export type ArtistPayoutReconciliationReport = {
  generatedAt: string;
  toleranceCents: number;
  rows: ArtistPayoutReconciliationRow[];
  totals: {
    artists: number;
    orderCount: number;
    expectedPayoutCents: number;
    settledPayoutCents: number;
    pendingPayoutCents: number;
    failedPayoutCents: number;
    netVarianceCents: number;
    /** Positive = money owed to artists. */
    underpaidCents: number;
    /** Positive = margin paid out beyond what was owed. */
    overpaidCents: number;
  };
  statusCounts: Record<ArtistPayoutReconciliationStatus, number>;
  exceptionCount: number;
  summaryLabel: string;
};

export type ArtistPayoutReconciliationOptions = {
  expectations: ArtistPayoutExpectation[];
  payoutEvents?: PersistedStripePayoutEvent[];
  now?: string;
  /**
   * Rounding slack before a difference is called a discrepancy. Stripe rounds
   * transfers to the cent, so a multi-order artist can legitimately drift a few
   * cents from the sum of per-order expectations.
   */
  toleranceCents?: number;
  testMode?: boolean;
};

export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.round(amount * 100);
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export type OrderExpectationSkip = {
  orderId: string;
  reason: string;
};

export type ArtistAccountResolution = {
  artistAccountId: string;
  artistHandle?: string;
};

/**
 * Derives payout expectations from recorded orders.
 *
 * Orders carry the artist payout in `artistTransferTotal` (dollars, from Stripe
 * metadata) but not the destination Connect account, so the caller supplies the
 * mapping. Anything that cannot be attributed is returned in `skipped` rather
 * than silently dropped — an unattributable order is itself a finding.
 */
export function buildExpectationsFromOrders(
  orders: OrderRecord[],
  resolveArtistAccount: (order: OrderRecord) => ArtistAccountResolution | null,
): { expectations: ArtistPayoutExpectation[]; skipped: OrderExpectationSkip[] } {
  const expectations: ArtistPayoutExpectation[] = [];
  const skipped: OrderExpectationSkip[] = [];

  for (const order of orders) {
    if (order.status === "cancelled") {
      skipped.push({ orderId: order.orderId, reason: "Order cancelled — no payout owed" });
      continue;
    }

    if (order.artistTransferTotal === null) {
      skipped.push({
        orderId: order.orderId,
        reason: "No artistTransferTotal on order metadata — cannot verify the 30% split",
      });
      continue;
    }

    const resolved = resolveArtistAccount(order);
    if (!resolved) {
      skipped.push({
        orderId: order.orderId,
        reason: "No Connect account resolved for order — payout cannot be attributed",
      });
      continue;
    }

    expectations.push({
      artistAccountId: resolved.artistAccountId,
      artistHandle: resolved.artistHandle,
      orderId: order.orderId,
      expectedPayoutCents: toCents(order.artistTransferTotal),
      currency: order.currency.toUpperCase(),
      recordedAt: order.recordedAt,
    });
  }

  return { expectations, skipped };
}

type Accumulator = {
  artistAccountId: string;
  artistHandle: string | null;
  currencies: Set<string>;
  orderCount: number;
  transferCount: number;
  expectedPayoutCents: number;
  settledPayoutCents: number;
  pendingPayoutCents: number;
  failedPayoutCents: number;
};

function emptyAccumulator(artistAccountId: string): Accumulator {
  return {
    artistAccountId,
    artistHandle: null,
    currencies: new Set<string>(),
    orderCount: 0,
    transferCount: 0,
    expectedPayoutCents: 0,
    settledPayoutCents: 0,
    pendingPayoutCents: 0,
    failedPayoutCents: 0,
  };
}

function classify(
  expectedCents: number,
  varianceCents: number,
  toleranceCents: number,
  coveredCents: number,
): ArtistPayoutReconciliationStatus {
  if (expectedCents === 0) {
    return coveredCents > toleranceCents ? "unattributed" : "balanced";
  }
  if (coveredCents === 0) {
    return "unpaid";
  }
  if (varianceCents < -toleranceCents) {
    return "underpaid";
  }
  if (varianceCents > toleranceCents) {
    return "overpaid";
  }
  return "balanced";
}

function actionFor(
  status: ArtistPayoutReconciliationStatus,
  varianceCents: number,
): string {
  switch (status) {
    case "unpaid":
      return `Owed ${formatCents(Math.abs(varianceCents))} — no transfer created for settled orders`;
    case "underpaid":
      return `Owed ${formatCents(Math.abs(varianceCents))} — issue a top-up transfer to honour the 30% split`;
    case "overpaid":
      return `Paid ${formatCents(varianceCents)} over — recover on the next payout cycle`;
    case "unattributed":
      return "Transfer sent with no matching order — confirm the payout was intended";
    case "balanced":
    default:
      return "Reconciled — no action";
  }
}

/**
 * Reconciles expected artist payouts against recorded Stripe payout events.
 *
 * Only `transfer.created` and `payout.paid` events count toward coverage.
 * Failed transfers are tracked but deliberately excluded: a failed transfer
 * means the artist is still owed, and folding it into coverage would hide that.
 */
export function buildArtistPayoutReconciliation(
  options: ArtistPayoutReconciliationOptions,
): ArtistPayoutReconciliationReport {
  const {
    expectations,
    now = new Date().toISOString(),
    toleranceCents = 2,
    testMode,
  } = options;

  const payoutEvents =
    options.payoutEvents ??
    queryPersistedStripePayoutEvents(testMode === undefined ? undefined : { testMode });

  const accumulators = new Map<string, Accumulator>();

  const upsert = (artistAccountId: string): Accumulator => {
    let acc = accumulators.get(artistAccountId);
    if (!acc) {
      acc = emptyAccumulator(artistAccountId);
      accumulators.set(artistAccountId, acc);
    }
    return acc;
  };

  for (const expectation of expectations) {
    const acc = upsert(expectation.artistAccountId);
    acc.orderCount += 1;
    acc.expectedPayoutCents += expectation.expectedPayoutCents;
    acc.currencies.add(expectation.currency.toUpperCase());
    if (expectation.artistHandle && !acc.artistHandle) {
      acc.artistHandle = expectation.artistHandle;
    }
  }

  for (const event of payoutEvents) {
    if (event.artistAccountId === null) {
      continue;
    }
    if (testMode !== undefined && event.testMode !== testMode) {
      continue;
    }
    if (event.eventType !== "transfer.created" && event.eventType !== "payout.paid") {
      continue;
    }

    const acc = upsert(event.artistAccountId);
    acc.transferCount += 1;
    acc.currencies.add(event.currency.toUpperCase());
    if (event.artistHandle && !acc.artistHandle) {
      acc.artistHandle = event.artistHandle;
    }

    if (event.status === "settled") {
      acc.settledPayoutCents += event.amountCents;
    } else if (event.status === "pending") {
      acc.pendingPayoutCents += event.amountCents;
    } else {
      acc.failedPayoutCents += event.amountCents;
    }
  }

  const rows: ArtistPayoutReconciliationRow[] = Array.from(accumulators.values()).map((acc) => {
    const coveredCents = acc.settledPayoutCents + acc.pendingPayoutCents;
    const varianceCents = coveredCents - acc.expectedPayoutCents;
    const status = classify(acc.expectedPayoutCents, varianceCents, toleranceCents, coveredCents);

    const exceptions: string[] = [];
    if (acc.currencies.size > 1) {
      exceptions.push(
        `Mixed currencies (${Array.from(acc.currencies).sort().join(", ")}) — totals are not comparable`,
      );
    }
    if (acc.failedPayoutCents > 0) {
      exceptions.push(
        `${formatCents(acc.failedPayoutCents)} in failed transfers — artist is still owed this amount`,
      );
    }
    if (acc.pendingPayoutCents > 0) {
      exceptions.push(`${formatCents(acc.pendingPayoutCents)} in transit, not yet settled`);
    }
    if (status === "unattributed") {
      exceptions.push("Transfers recorded with no matching order expectation");
    }

    return {
      artistAccountId: acc.artistAccountId,
      artistHandle: acc.artistHandle,
      currency: acc.currencies.size === 1 ? Array.from(acc.currencies)[0]! : "MIXED",
      orderCount: acc.orderCount,
      transferCount: acc.transferCount,
      expectedPayoutCents: acc.expectedPayoutCents,
      settledPayoutCents: acc.settledPayoutCents,
      pendingPayoutCents: acc.pendingPayoutCents,
      failedPayoutCents: acc.failedPayoutCents,
      varianceCents,
      status,
      exceptions,
      actionLabel: actionFor(status, varianceCents),
    };
  });

  // Largest money problem first; stable tie-break so the report does not
  // reshuffle between runs on equal variance.
  rows.sort((a, b) => {
    const delta = Math.abs(b.varianceCents) - Math.abs(a.varianceCents);
    return delta !== 0 ? delta : a.artistAccountId.localeCompare(b.artistAccountId);
  });

  const statusCounts: Record<ArtistPayoutReconciliationStatus, number> = {
    balanced: 0,
    underpaid: 0,
    overpaid: 0,
    unpaid: 0,
    unattributed: 0,
  };
  for (const row of rows) {
    statusCounts[row.status] += 1;
  }

  const underpaidCents = rows
    .filter((row) => row.status === "underpaid" || row.status === "unpaid")
    .reduce((sum, row) => sum + Math.abs(row.varianceCents), 0);
  const overpaidCents = rows
    .filter((row) => row.status === "overpaid")
    .reduce((sum, row) => sum + row.varianceCents, 0);

  const totals = {
    artists: rows.length,
    orderCount: rows.reduce((sum, row) => sum + row.orderCount, 0),
    expectedPayoutCents: rows.reduce((sum, row) => sum + row.expectedPayoutCents, 0),
    settledPayoutCents: rows.reduce((sum, row) => sum + row.settledPayoutCents, 0),
    pendingPayoutCents: rows.reduce((sum, row) => sum + row.pendingPayoutCents, 0),
    failedPayoutCents: rows.reduce((sum, row) => sum + row.failedPayoutCents, 0),
    netVarianceCents: rows.reduce((sum, row) => sum + row.varianceCents, 0),
    underpaidCents,
    overpaidCents,
  };

  const unreconciled = statusCounts.underpaid + statusCounts.unpaid + statusCounts.overpaid + statusCounts.unattributed;
  const summaryLabel =
    unreconciled === 0
      ? `${totals.artists} artist accounts reconciled — ${formatCents(totals.expectedPayoutCents)} owed, ${formatCents(totals.settledPayoutCents)} settled`
      : `${unreconciled}/${totals.artists} accounts need review — ${formatCents(underpaidCents)} owed to artists, ${formatCents(overpaidCents)} overpaid`;

  return {
    generatedAt: now,
    toleranceCents,
    rows,
    totals,
    statusCounts,
    exceptionCount: rows.reduce((sum, row) => sum + row.exceptions.length, 0),
    summaryLabel,
  };
}

export type PayoutReconciliationDiagnostics = {
  report: ArtistPayoutReconciliationReport;
  attributionGap: {
    ordersConsidered: number;
    ordersAttributed: number;
    skippedOrders: OrderExpectationSkip[];
    /** Non-null when the report cannot be trusted as a complete reconciliation. */
    blocker: string | null;
  };
};

/**
 * Wires the reconciliation to the live in-memory stores.
 *
 * Orders do not yet carry the destination Connect account — `POST /api/stripe/checkout`
 * stamps `artistTransferTotal` into payment metadata but not the artist account —
 * so without an injected resolver every order lands in `skippedOrders` and the
 * gap is reported rather than papered over. Pass `resolveArtistAccount` once
 * checkout carries the account through.
 */
export function buildPayoutReconciliationWithDiagnostics(
  options: {
    orders?: OrderRecord[];
    payoutEvents?: PersistedStripePayoutEvent[];
    resolveArtistAccount?: (order: OrderRecord) => ArtistAccountResolution | null;
    now?: string;
    toleranceCents?: number;
    testMode?: boolean;
  } = {},
): PayoutReconciliationDiagnostics {
  const orders = options.orders ?? getOrderRecords();
  const resolveArtistAccount =
    options.resolveArtistAccount ??
    ((order: OrderRecord) => {
      if (order.artistAccountId) {
        return {
          artistAccountId: order.artistAccountId,
          artistHandle: order.artistHandle ?? undefined,
        };
      }
      return null;
    });
  const { expectations, skipped } = buildExpectationsFromOrders(orders, resolveArtistAccount);

  const report = buildArtistPayoutReconciliation({
    expectations,
    payoutEvents: options.payoutEvents,
    now: options.now,
    toleranceCents: options.toleranceCents,
    testMode: options.testMode,
  });

  const unattributable = skipped.filter((entry) => entry.reason.includes("Connect account")).length;
  const blocker =
    unattributable > 0
      ? `${unattributable} order(s) carry no Connect account — checkout must stamp the artist account into payment metadata before payouts can be fully reconciled`
      : null;

  return {
    report,
    attributionGap: {
      ordersConsidered: orders.length,
      ordersAttributed: expectations.length,
      skippedOrders: skipped,
      blocker,
    },
  };
}

export type PayoutExceptionResolutionVelocity = {
  totalAccounts: number;
  balancedAccounts: number;
  underpaidAccounts: number;
  overpaidAccounts: number;
  unpaidAccounts: number;
  unattributedAccounts: number;
  resolutionRatePercent: number;
  underpaidCentsOwed: number;
  overpaidCentsLeaked: number;
  totalDiscrepancies: number;
  estimatedResolutionHours: number;
  velocityLabel: string;
};

export function calculatePayoutExceptionResolutionVelocity(
  report: ArtistPayoutReconciliationReport,
  hoursPerDiscrepancy: number = 1.5,
): PayoutExceptionResolutionVelocity {
  const total = report.totals.artists;
  const balanced = report.statusCounts.balanced;
  const underpaid = report.statusCounts.underpaid;
  const overpaid = report.statusCounts.overpaid;
  const unpaid = report.statusCounts.unpaid;
  const unattributed = report.statusCounts.unattributed;
  const totalDiscrepancies = underpaid + overpaid + unpaid + unattributed;

  const resolutionRatePercent = total > 0 ? Math.round((balanced / total) * 1000) / 10 : 100;
  const estimatedResolutionHours = Math.round(totalDiscrepancies * hoursPerDiscrepancy * 10) / 10;

  const velocityLabel =
    totalDiscrepancies === 0
      ? `100% reconciliation velocity — 0 open exceptions across ${total} accounts`
      : `${resolutionRatePercent}% clean payout rate — ${totalDiscrepancies} open exceptions (~${estimatedResolutionHours}h resolution workload)`;

  return {
    totalAccounts: total,
    balancedAccounts: balanced,
    underpaidAccounts: underpaid,
    overpaidAccounts: overpaid,
    unpaidAccounts: unpaid,
    unattributedAccounts: unattributed,
    resolutionRatePercent,
    underpaidCentsOwed: report.totals.underpaidCents,
    overpaidCentsLeaked: report.totals.overpaidCents,
    totalDiscrepancies,
    estimatedResolutionHours,
    velocityLabel,
  };
}

export type PayoutAnomalyAlert = {
  artistAccountId: string;
  artistHandle: string | null;
  varianceCents: number;
  variancePercent: number;
  status: ArtistPayoutReconciliationStatus;
  severity: "high" | "medium" | "low";
  anomalyType: "large_underpayment" | "large_overpayment" | "unattributed_funds";
  message: string;
};

export type PayoutAnomalyReport = {
  totalAnomalies: number;
  highSeverityCount: number;
  mediumSeverityCount: number;
  alerts: PayoutAnomalyAlert[];
  summaryLabel: string;
};

export function detectPayoutVarianceAnomalies(
  report: ArtistPayoutReconciliationReport,
  options?: {
    thresholdCents?: number;
    thresholdPercent?: number;
  },
): PayoutAnomalyReport {
  const thresholdCents = options?.thresholdCents ?? 1000; // $10.00 default
  const thresholdPercent = options?.thresholdPercent ?? 15; // 15% variance default

  const alerts: PayoutAnomalyAlert[] = [];

  for (const row of report.rows) {
    if (row.status === "balanced") continue;

    const absVariance = Math.abs(row.varianceCents);
    const expected = row.expectedPayoutCents;
    const variancePercent = expected > 0 ? Math.round((absVariance / expected) * 100) : 100;

    if (row.status === "unattributed") {
      alerts.push({
        artistAccountId: row.artistAccountId,
        artistHandle: row.artistHandle,
        varianceCents: row.varianceCents,
        variancePercent,
        status: row.status,
        severity: "high",
        anomalyType: "unattributed_funds",
        message: `Unattributed transfer of ${formatCents(row.settledPayoutCents)} without order expectation`,
      });
      continue;
    }

    if (absVariance >= thresholdCents || variancePercent >= thresholdPercent) {
      const isUnderpaid = row.status === "underpaid" || row.status === "unpaid";
      const anomalyType = isUnderpaid ? "large_underpayment" : "large_overpayment";
      const severity: "high" | "medium" | "low" =
        absVariance >= 5000 || variancePercent >= 50 ? "high" : "medium";

      const message = isUnderpaid
        ? `Underpayment anomaly: ${row.artistHandle || row.artistAccountId} is owed ${formatCents(absVariance)} (${variancePercent}% variance)`
        : `Overpayment anomaly: ${row.artistHandle || row.artistAccountId} was overpaid by ${formatCents(absVariance)} (${variancePercent}% variance)`;

      alerts.push({
        artistAccountId: row.artistAccountId,
        artistHandle: row.artistHandle,
        varianceCents: row.varianceCents,
        variancePercent,
        status: row.status,
        severity,
        anomalyType,
        message,
      });
    }
  }

  const highSeverityCount = alerts.filter((a) => a.severity === "high").length;
  const mediumSeverityCount = alerts.filter((a) => a.severity === "medium").length;

  const summaryLabel =
    alerts.length === 0
      ? `0 payout variance anomalies detected across ${report.totals.artists} accounts`
      : `${alerts.length} payout variance anomaly alert(s) (${highSeverityCount} high severity, ${mediumSeverityCount} medium severity)`;

  return {
    totalAnomalies: alerts.length,
    highSeverityCount,
    mediumSeverityCount,
    alerts,
    summaryLabel,
  };
}

