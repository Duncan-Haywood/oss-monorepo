import { buildRetargetingEventSummary } from "@/lib/retargeting-events";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function readEnv() {
  return {
    META_PIXEL_ID: process.env.META_PIXEL_ID,
    META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN,
    GOOGLE_ADS_CUSTOMER_ID: process.env.GOOGLE_ADS_CUSTOMER_ID,
    PINTEREST_AD_ACCOUNT_ID: process.env.PINTEREST_AD_ACCOUNT_ID,
    PINTEREST_ACCESS_TOKEN: process.env.PINTEREST_ACCESS_TOKEN,
  };
}

export async function GET() {
  const summary = buildRetargetingEventSummary(readEnv());
  return NextResponse.json(summary);
}
