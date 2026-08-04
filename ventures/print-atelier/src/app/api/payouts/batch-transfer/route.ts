import { requireOperator } from "@/lib/api-auth";
import { buildPayoutReconciliationWithDiagnostics } from "@/lib/payout-reconciliation";
import { executeConnectPayoutBatchTransfer } from "@/lib/stripe-connect";
import { NextResponse } from "next/server";

/**
 * Operator-only API endpoint to prepare and execute automated Stripe Connect
 * payout batch transfer top-ups for underpaid artist reconciliation accounts.
 */

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = requireOperator(request);
  if (denied) {
    return denied;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const minTransferCents = typeof body.minTransferCents === "number" ? body.minTransferCents : 100;
    const maxTransferCents = typeof body.maxTransferCents === "number" ? body.maxTransferCents : 100000;
    const testMode = typeof body.testMode === "boolean" ? body.testMode : true;

    const diagnostics = buildPayoutReconciliationWithDiagnostics();
    const result = executeConnectPayoutBatchTransfer({
      report: diagnostics.report,
      minTransferCents,
      maxTransferCents,
      testMode,
    });

    return NextResponse.json({
      success: true,
      result,
      diagnostics: {
        totalAccountsConsidered: diagnostics.report.totals.artists,
        underpaidAccountsCount: diagnostics.report.statusCounts.underpaid + diagnostics.report.statusCounts.unpaid,
        attributionBlocker: diagnostics.attributionGap.blocker,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to execute Connect payout batch transfer",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
