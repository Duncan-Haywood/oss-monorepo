import { NextResponse } from "next/server";
import { recordUsageEvent, type UsageEventName } from "@/lib/usage-events";

const eventNames: UsageEventName[] = [
  "page_view",
  "catalog_cta",
  "room_visualizer_cta",
  "storefront_search",
  "buyer_portal_search",
  "checkout_add",
];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: string; path?: string };
    if (!eventNames.includes(body.name as UsageEventName) || typeof body.path !== "string") {
      return NextResponse.json({ error: "Invalid usage event" }, { status: 400 });
    }

    recordUsageEvent({
      name: body.name as UsageEventName,
      path: body.path.slice(0, 200),
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ recorded: true });
  } catch {
    return NextResponse.json({ error: "Invalid usage event" }, { status: 400 });
  }
}
