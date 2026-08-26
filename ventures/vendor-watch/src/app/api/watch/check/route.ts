import { NextResponse } from "next/server";
import { checkUrl, isPlausibleHttpUrl } from "@/lib/check-url";
import { recordUsageEvent, type UsageEventName } from "@/lib/usage-events";

function outcomeEventName(outcome: string): UsageEventName {
  switch (outcome) {
    case "first_snapshot":
      return "check_first_snapshot";
    case "unchanged":
      return "check_unchanged";
    case "changed":
      return "check_changed";
    default:
      return "check_inconclusive";
  }
}

export async function POST(request: Request) {
  let body: { url?: string };
  try {
    body = (await request.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url || !isPlausibleHttpUrl(url)) {
    return NextResponse.json(
      { error: "Enter a valid http:// or https:// URL to check." },
      { status: 400 },
    );
  }

  recordUsageEvent({ name: "check_started", path: "/api/watch/check", createdAt: new Date().toISOString() });

  const result = await checkUrl(url);

  recordUsageEvent({
    name: outcomeEventName(result.outcome),
    path: "/api/watch/check",
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json(result);
}
