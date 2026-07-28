import { buildFulfillmentSubmissionSummary } from "@/lib/fulfillment-submissions";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const summary = buildFulfillmentSubmissionSummary();
  return NextResponse.json(summary);
}
