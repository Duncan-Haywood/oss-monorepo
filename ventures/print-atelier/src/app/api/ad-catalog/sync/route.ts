import { NextResponse } from "next/server";
import { executeAdCatalogSyncLive } from "@/lib/ad-catalog-sync-http";
import { executeAdCatalogSync, getAdCatalogSyncEnvFromProcess } from "@/lib/ad-catalog-sync";
import type { AdCatalogPlatform } from "@/lib/ad-catalog";

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

export async function POST(request: Request) {
  const url = new URL(request.url);
  const platforms = parsePlatforms(url.searchParams.get("platforms"));
  const baseUrl =
    url.searchParams.get("baseUrl") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://printatelier.com";

  const result = await executeAdCatalogSyncLive(
    platforms,
    getAdCatalogSyncEnvFromProcess(),
    { baseUrl },
  );

  return NextResponse.json(result);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const platforms = parsePlatforms(url.searchParams.get("platforms"));
  const baseUrl =
    url.searchParams.get("baseUrl") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://printatelier.com";

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
