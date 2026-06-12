import { NextResponse } from "next/server";
import {
  executeAdCatalogSync,
  getAdCatalogSyncEnvFromProcess,
} from "@/lib/ad-catalog-sync";
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

  const result = executeAdCatalogSync(
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

  const result = executeAdCatalogSync(
    platforms,
    getAdCatalogSyncEnvFromProcess(),
    { baseUrl },
  );

  return NextResponse.json({
    endpoint: "/api/ad-catalog/sync",
    methods: ["GET", "POST"],
    supportedPlatforms: validPlatforms,
    ...result,
  });
}
