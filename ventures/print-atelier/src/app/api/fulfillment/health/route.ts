import { checkPartnerSkuSyncStatus } from "@/lib/fulfillment-health";
import { requireOperator } from "@/lib/api-auth";
import { NextResponse } from "next/server";

/**
 * Operator-only API endpoint for automated Printful and Gelato SKU sync status health check.
 */

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = requireOperator(request);
  if (denied) {
    return denied;
  }

  const health = checkPartnerSkuSyncStatus();
  return NextResponse.json({
    success: true,
    health,
  });
}
