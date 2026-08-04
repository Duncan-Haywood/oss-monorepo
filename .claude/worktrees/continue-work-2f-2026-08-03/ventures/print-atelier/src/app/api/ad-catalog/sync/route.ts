import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/api-auth";
import { executeAdCatalogSyncLive } from "@/lib/ad-catalog-sync-http";
import { executeAdCatalogSync, getAdCatalogSyncEnvFromProcess } from "@/lib/ad-catalog-sync";
import type { AdCatalogPlatform } from "@/lib/ad-catalog";

/**
 * Operator-only. POST — and GET with `?live=true` — authenticate to Meta
 * Commerce, Google Merchant Center and Pinterest with the server's own
 * credentials and write the product catalog those ad accounts sell from.
 * Before the guard below anyone who found the URL could trigger that write.
 *
 * `baseUrl` is the second half of the same problem: it is interpolated into
 * every `link` and `imageLink` in the pushed feed, so an anonymous caller could
 * point the operator's live ad catalog at a domain they control. It is now
 * validated rather than trusted, and the guard means only an operator can set
 * it at all.
 *
 * `src/lib/api-auth.ts` names this route in its own documentation — "trigger
 * outbound syncs that spend real ad budget" — but was only wired into
 * `/api/credentials/vercel-pull`.
 */

export const runtime = "nodejs";

const validPlatforms: AdCatalogPlatform[] = ["meta", "google", "pinterest"];

function parsePlatforms(value: string | null): AdCatalogPlatform[] {
  if (!value) {
    return validPlatforms;
  }
  const requested = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry): entry is AdCatalogPlatform =>
      validPlatforms.includes(entry as AdCatalogPlatform),
    );
  return requested.length > 0 ? requested : validPlatforms;
}

/**
 * The origin the feed's product links are built from. Returns null for a value
 * that is not an absolute `http(s)` URL — the previous code passed any string
 * straight through, so `baseUrl=javascript:alert(1)` or a bare `not a url`
 * reached the ad platforms inside every product link.
 */
function parseBaseUrl(value: string | null): string | null {
  if (value === null) {
    return process.env.NEXT_PUBLIC_SITE_URL ?? "https://printatelier.com";
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }
  return parsed.origin;
}

const INVALID_BASE_URL = NextResponse.json(
  { error: "`baseUrl` must be an absolute http(s) URL" },
  { status: 400 },
);

export async function POST(request: Request) {
  const denied = requireOperator(request);
  if (denied) {
    return denied;
  }

  const url = new URL(request.url);
  const platforms = parsePlatforms(url.searchParams.get("platforms"));
  const baseUrl = parseBaseUrl(url.searchParams.get("baseUrl"));
  if (baseUrl === null) {
    return INVALID_BASE_URL;
  }

  const result = await executeAdCatalogSyncLive(
    platforms,
    getAdCatalogSyncEnvFromProcess(),
    { baseUrl },
  );

  return NextResponse.json(result);
}

export async function GET(request: Request) {
  const denied = requireOperator(request);
  if (denied) {
    return denied;
  }

  const url = new URL(request.url);
  const platforms = parsePlatforms(url.searchParams.get("platforms"));
  const baseUrl = parseBaseUrl(url.searchParams.get("baseUrl"));
  if (baseUrl === null) {
    return INVALID_BASE_URL;
  }

  const live = url.searchParams.get("live") === "true";
  const result = live
    ? await executeAdCatalogSyncLive(
        platforms,
        getAdCatalogSyncEnvFromProcess(),
        { baseUrl },
      )
    : executeAdCatalogSync(platforms, getAdCatalogSyncEnvFromProcess(), { baseUrl });

  return NextResponse.json({
    endpoint: "/api/ad-catalog/sync",
    methods: ["GET", "POST"],
    supportedPlatforms: validPlatforms,
    ...result,
  });
}
