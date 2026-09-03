import { NextResponse } from "next/server";
import { getUsageEventSummary } from "@/lib/usage-events";

export function GET() {
  return NextResponse.json(getUsageEventSummary());
}
