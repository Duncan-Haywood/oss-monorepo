import { NextResponse } from "next/server";
import { checkUrl, isPlausibleHttpUrl } from "@/lib/check-url";
import type { StoredSnapshot } from "@/lib/watch-store";
import { recordUsageEvent, type UsageEventName } from "@/lib/usage-events";

// Upper bound on a client-supplied baseline's text, matching the MAX_TEXT_LENGTH
// that check-url.ts truncates its own snapshots to. A baseline arrives in the
// request body, so it needs its own ceiling rather than inheriting that one.
const MAX_BASELINE_TEXT = 20_000;

/**
 * Read the caller's own baseline out of the request body.
 *
 * Returns undefined when the field is absent — the caller is not tracking a
 * baseline and wants the server-side store — and null when it is present but
 * unusable, which still means "compare against nothing" rather than falling
 * back to the shared store. That distinction matters: a browser whose stored
 * baseline failed to parse must get a fresh first snapshot, not a diff
 * against whatever some other visitor last checked.
 */
function readBaseline(value: unknown, url: string): StoredSnapshot | null | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.normalizedText !== "string" ||
    typeof candidate.hash !== "string" ||
    candidate.hash.length === 0 ||
    typeof candidate.fetchedAt !== "string" ||
    typeof candidate.httpStatus !== "number"
  ) {
    return null;
  }
  return {
    // The URL under check wins over whatever the body claims, so a baseline
    // cannot be attributed to a different page than the one being fetched.
    url,
    normalizedText: candidate.normalizedText.slice(0, MAX_BASELINE_TEXT),
    hash: candidate.hash,
    fetchedAt: candidate.fetchedAt,
    httpStatus: candidate.httpStatus,
  };
}

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
  let body: { url?: string; baseline?: unknown };
  try {
    body = (await request.json()) as { url?: string; baseline?: unknown };
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

  const result = await checkUrl(url, fetch, readBaseline(body.baseline, url));

  recordUsageEvent({
    name: outcomeEventName(result.outcome),
    path: "/api/watch/check",
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json(result);
}
