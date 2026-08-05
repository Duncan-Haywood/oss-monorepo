import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/api-auth";
import { executeAdCatalogSyncLive } from "@/lib/ad-catalog-sync-http";
import { executeAdCatalogSync, getAdCatalogSyncEnvFromProcess } from "@/lib/ad-catalog-sync";
import type { AdCatalogPlatform } from "@/lib/ad-catalog";
import { resolveSiteUrl, SITE_URL_UNCONFIGURED_HINT } from "@/lib/site-url";

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

type BaseUrlResolution =
  | { ok: true; baseUrl: string }
  | { ok: false; response: NextResponse };

/**
 * The origin the feed's product links are built from.
 *
 * Two different failures, answered differently on purpose:
 *
 *   - A caller-supplied `baseUrl` that is not an absolute `http(s)` URL is the
 *     caller's mistake — 400. The previous code passed any string straight
 *     through, so `baseUrl=javascript:alert(1)` or a bare `not a url` reached
 *     the ad platforms inside every product link.
 *   - No `baseUrl` and no configured `NEXT_PUBLIC_SITE_URL` is the operator's
 *     — 503, the same fail-closed answer `requireOperator` gives for an unset
 *     token, and the status `src/lib/operator-client.ts` renders as
 *     "unconfigured" rather than as data. This branch used to substitute
 *     `https://printatelier.com`, which meant an operator with no configuration
 *     at all could push a merchant feed whose every `link` and `imageLink`
 *     named a domain this business does not own. Refusing is the only honest
 *     answer: there is no correct origin to guess.
 */
function resolveFeedBaseUrl(value: string | null): BaseUrlResolution {
  if (value === null) {
    const configured = resolveSiteUrl();
    if (configured === null) {
      return { ok: false, response: unconfiguredSiteUrl() };
    }
    return { ok: true, baseUrl: configured };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, response: invalidBaseUrl() };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, response: invalidBaseUrl() };
  }
  return { ok: true, baseUrl: parsed.origin };
}

// Built per request rather than shared: a `NextResponse` carries a single-use
// body stream, so one module-level instance returned to two callers hands the
// second one a body that has already been read.
function invalidBaseUrl(): NextResponse {
  return NextResponse.json(
    { error: "`baseUrl` must be an absolute http(s) URL" },
    { status: 400 },
  );
}

function unconfiguredSiteUrl(): NextResponse {
  return NextResponse.json(
    {
      error: "Site origin is not configured",
      hint: SITE_URL_UNCONFIGURED_HINT,
    },
    { status: 503 },
  );
}

export async function POST(request: Request) {
  const denied = requireOperator(request);
  if (denied) {
    return denied;
  }

  const url = new URL(request.url);
  const platforms = parsePlatforms(url.searchParams.get("platforms"));
  const resolved = resolveFeedBaseUrl(url.searchParams.get("baseUrl"));
  if (!resolved.ok) {
    return resolved.response;
  }

  const result = await executeAdCatalogSyncLive(
    platforms,
    getAdCatalogSyncEnvFromProcess(),
    { baseUrl: resolved.baseUrl },
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
  const resolved = resolveFeedBaseUrl(url.searchParams.get("baseUrl"));
  if (!resolved.ok) {
    return resolved.response;
  }
  const baseUrl = resolved.baseUrl;

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
