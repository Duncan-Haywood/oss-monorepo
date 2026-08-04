import {
  buildAdCatalogFeed,
  type AdCatalogFeedItem,
  type AdCatalogPlatform,
} from "./ad-catalog";
import {
  executeAdCatalogSync,
  type AdCatalogSyncPlatformResult,
  type AdCatalogSyncResult,
} from "./ad-catalog-sync";
import type { AdCatalogFeedOptions } from "./ad-catalog";

export type HttpPushResult = {
  ok: boolean;
  statusCode: number;
  responseBody: string;
  bytesSent: number;
};

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export type AdCatalogSyncLivePlatformResult = AdCatalogSyncPlatformResult & {
  httpStatus?: number;
  httpOk?: boolean;
  responseSnippet?: string;
};

export type AdCatalogSyncLiveResult = Omit<AdCatalogSyncResult, "platforms"> & {
  platforms: AdCatalogSyncLivePlatformResult[];
};

function buildMetaBatchPayload(items: AdCatalogFeedItem[]): string {
  const requests = items.map((item) => ({
    method: "UPDATE",
    retailer_id: item.id,
    data: {
      title: item.title,
      description: item.description,
      availability: item.availability,
      condition: item.condition,
      price: item.price,
      link: item.link,
      image_link: item.imageLink,
      brand: item.brand,
    },
  }));
  return JSON.stringify({ requests });
}

function buildGoogleBatchPayload(items: AdCatalogFeedItem[]): string {
  const entries = items.map((item) => ({
    batchId: item.id,
    method: "insert",
    product: {
      offerId: item.id,
      title: item.title,
      description: item.description,
      link: item.link,
      imageLink: item.imageLink,
      contentLanguage: "en",
      targetCountry: "US",
      channel: "online",
      availability: item.availability,
      condition: item.condition,
      price: { value: item.price.replace(/[^0-9.]/g, ""), currency: item.currency },
    },
  }));
  return JSON.stringify({ entries });
}

function buildPinterestBatchPayload(items: AdCatalogFeedItem[]): string {
  return JSON.stringify({
    items: items.map((item) => ({
      item_id: item.id,
      title: item.title,
      description: item.description,
      link: item.link,
      image_link: item.imageLink,
      price: item.price,
      availability: item.availability,
    })),
  });
}

export function buildPlatformCatalogPayload(
  platform: AdCatalogPlatform,
  items: AdCatalogFeedItem[],
): string {
  switch (platform) {
    case "meta":
      return buildMetaBatchPayload(items);
    case "google":
      return buildGoogleBatchPayload(items);
    case "pinterest":
      return buildPinterestBatchPayload(items);
    default: {
      const exhaustive: never = platform;
      return String(exhaustive);
    }
  }
}

function resolveLiveEndpoint(
  platform: AdCatalogPlatform,
  endpointTemplate: string,
  env: Record<string, string | undefined>,
): string {
  switch (platform) {
    case "meta":
      return endpointTemplate.replace("{catalog_id}", env.META_CATALOG_ID ?? "");
    case "google":
      return endpointTemplate.replace("{merchant_id}", env.GOOGLE_MERCHANT_CENTER_ID ?? "");
    case "pinterest":
      return endpointTemplate.replace("{catalog_id}", env.PINTEREST_AD_ACCOUNT_ID ?? "");
    default: {
      const exhaustive: never = platform;
      return String(exhaustive);
    }
  }
}

function authHeadersForPlatform(
  platform: AdCatalogPlatform,
  env: Record<string, string | undefined>,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (platform === "meta" && env.META_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${env.META_ACCESS_TOKEN}`;
  }
  if (platform === "pinterest" && env.PINTEREST_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${env.PINTEREST_ACCESS_TOKEN}`;
  }
  return headers;
}

export async function pushPlatformCatalogHttp(
  platform: AdCatalogPlatform,
  endpointTemplate: string,
  items: AdCatalogFeedItem[],
  env: Record<string, string | undefined>,
  fetchFn: FetchLike,
): Promise<HttpPushResult> {
  const endpoint = resolveLiveEndpoint(platform, endpointTemplate, env);
  const body = buildPlatformCatalogPayload(platform, items);
  const response = await fetchFn(endpoint, {
    method: "POST",
    headers: authHeadersForPlatform(platform, env),
    body,
  });
  const responseBody = await response.text();
  return {
    ok: response.ok,
    statusCode: response.status,
    responseBody,
    bytesSent: body.length,
  };
}

export async function executeAdCatalogSyncLive(
  platforms: AdCatalogPlatform[] = ["meta", "google", "pinterest"],
  env: Record<string, string | undefined> = {},
  feedOptions: AdCatalogFeedOptions = {},
  fetchFn: FetchLike = fetch,
): Promise<AdCatalogSyncLiveResult> {
  const base = executeAdCatalogSync(platforms, env, feedOptions);
  const livePlatforms: AdCatalogSyncLivePlatformResult[] = [];

  for (const platformResult of base.platforms) {
    if (platformResult.status !== "submitted" || platformResult.mode !== "api_push") {
      livePlatforms.push(platformResult);
      continue;
    }

    const feed = buildAdCatalogFeed({
      ...feedOptions,
      platforms: [platformResult.platform],
    });
    const items = feed.items.filter(
      (item) => item.platform === platformResult.platform && item.eligible,
    );

    try {
      const http = await pushPlatformCatalogHttp(
        platformResult.platform,
        platformResult.apiEndpoint,
        items,
        env,
        fetchFn,
      );
      livePlatforms.push({
        ...platformResult,
        httpStatus: http.statusCode,
        httpOk: http.ok,
        responseSnippet: http.responseBody.slice(0, 200),
        message: http.ok
          ? `Live API push succeeded — ${platformResult.itemsSubmitted} items (${http.bytesSent} bytes)`
          : `Live API push failed (${http.statusCode}) — ${http.responseBody.slice(0, 80) || "error"}`,
        status: http.ok ? "submitted" : "blocked",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown HTTP error";
      livePlatforms.push({
        ...platformResult,
        httpOk: false,
        responseSnippet: message,
        message: `Live API push error — ${message}`,
        status: "blocked",
      });
    }
  }

  const submitted = livePlatforms.filter((entry) => entry.status === "submitted").length;
  const simulated = livePlatforms.filter((entry) => entry.status === "simulated").length;
  const blocked = livePlatforms.filter((entry) => entry.status === "blocked").length;

  let overallStatus: AdCatalogSyncLiveResult["overallStatus"] = "blocked";
  if (submitted > 0) {
    overallStatus = submitted === livePlatforms.length ? "ready" : "partial";
  } else if (simulated > 0) {
    overallStatus = "partial";
  }

  return {
    ...base,
    overallStatus,
    platforms: livePlatforms,
    summaryLabel: `${submitted} live HTTP • ${simulated} simulated • ${blocked} blocked • ${base.eligibleItems} eligible SKUs`,
  };
}
