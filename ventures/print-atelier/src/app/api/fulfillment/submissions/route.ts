import { buildFulfillmentSubmissionSummary } from "@/lib/fulfillment-submissions";
import { requireOperator } from "@/lib/api-auth";
import { NextResponse } from "next/server";

/**
 * Operator-only. `recentSubmissions` in the response body is the real order
 * record for each Printful and Gelato submission — order ids, fulfillment
 * status, and which orders are blocked. That is customer order data and a live
 * read of the business's fulfillment position; before the guard below it was
 * served to anyone who requested the URL.
 */

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = requireOperator(request);
  if (denied) {
    return denied;
  }

  const summary = buildFulfillmentSubmissionSummary();
  return NextResponse.json(summary);
}
