import {
  buildPayoutReconciliationWithDiagnostics,
  detectPayoutVarianceAnomalies,
} from "@/lib/payout-reconciliation";
import { requireOperator } from "@/lib/api-auth";
import { NextResponse } from "next/server";

/**
 * Operator-only. The diagnostics report, per artist, how much is owed, how much
 * Stripe actually paid, the variance between them, and the Connect account each
 * order is attributed to — third-party financial data, served to anyone who
 * requested the URL before the guard below.
 */

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = requireOperator(request);
  if (denied) {
    return denied;
  }

  const diagnostics = buildPayoutReconciliationWithDiagnostics();
  const anomalies = detectPayoutVarianceAnomalies(diagnostics.report);

  return NextResponse.json({
    ...diagnostics,
    anomalies,
  });
}
