import { buildRetargetingEventSummary } from "@/lib/retargeting-events";
import { requireOperator } from "@/lib/api-auth";
import { NextResponse } from "next/server";

/**
 * Operator-only. The summary reports which ad platforms have working
 * credentials — a direct read of the server's configured secrets, stated as
 * readiness — alongside recorded checkout-abandon events carrying cart values,
 * session ids and the items each abandoned cart held. Before the guard below
 * both were served to anyone who requested the URL.
 */

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

export async function GET(request: Request) {
  const denied = requireOperator(request);
  if (denied) {
    return denied;
  }

  const summary = buildRetargetingEventSummary(readEnv());
  return NextResponse.json(summary);
}
