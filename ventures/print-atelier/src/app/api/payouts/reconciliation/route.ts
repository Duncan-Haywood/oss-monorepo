import { buildPayoutReconciliationWithDiagnostics } from "@/lib/payout-reconciliation";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const diagnostics = buildPayoutReconciliationWithDiagnostics();
  return NextResponse.json(diagnostics);
}
