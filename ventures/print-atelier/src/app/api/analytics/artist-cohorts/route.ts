import { analyzeArtistCohorts } from "@/lib/artist-cohort-analytics";
import { requireOperator } from "@/lib/api-auth";
import { NextResponse } from "next/server";

/**
 * Operator-only API endpoint for automated artist retention and payout repeat cohort analytics.
 */

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = requireOperator(request);
  if (denied) {
    return denied;
  }

  const analytics = analyzeArtistCohorts();
  return NextResponse.json({
    success: true,
    analytics,
  });
}
