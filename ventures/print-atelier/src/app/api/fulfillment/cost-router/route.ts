import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/api-auth";
import {
  optimizeFulfillmentRouting,
  evaluateFulfillmentRoutingBatch,
  persistFulfillmentRoutingDecision,
  getFulfillmentRouteRecords,
  type FulfillmentRegion,
} from "@/lib/fulfillment-cost-router";

export async function GET(request: Request) {
  const denied = requireOperator(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  const region = (url.searchParams.get("region") as FulfillmentRegion) || "US";
  const retailPrice = url.searchParams.get("price") ? parseFloat(url.searchParams.get("price")!) : undefined;

  if (slug) {
    const decision = optimizeFulfillmentRouting(slug, region, retailPrice);
    persistFulfillmentRoutingDecision(decision);
    const batchReport = evaluateFulfillmentRoutingBatch([slug], [region]);
    return NextResponse.json({
      success: true,
      decision,
      singleDecision: decision,
      batchReport,
    });
  }

  const history = getFulfillmentRouteRecords(50);
  return NextResponse.json({
    success: true,
    endpoint: "/api/fulfillment/cost-router",
    recordCount: history.length,
    recentRoutes: history,
  });
}

export async function POST(request: Request) {
  const denied = requireOperator(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { slugs, regions } = body;

    if (!Array.isArray(slugs) || slugs.length === 0) {
      return NextResponse.json({ error: "Missing or empty 'slugs' array" }, { status: 400 });
    }

    const report = evaluateFulfillmentRoutingBatch(slugs, regions);
    for (const d of report.decisions) {
      persistFulfillmentRoutingDecision(d);
    }

    return NextResponse.json({ success: true, report });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}
