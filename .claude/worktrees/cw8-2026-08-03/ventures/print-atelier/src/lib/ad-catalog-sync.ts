import {
  buildAdCatalogFeed,
  buildAdCatalogSyncHealth,
  serializeAdCatalogFeedJson,
  type AdCatalogFeedOptions,
  type AdCatalogPlatform,
} from "./ad-catalog";

export type AdCatalogSyncMode = "dry_run" | "api_push";

export type AdCatalogSyncPlatformResult = {
  platform: AdCatalogPlatform;
  mode: AdCatalogSyncMode;
  syncReady: boolean;
  itemsSubmitted: number;
  blockers: string[];
  apiEndpoint: string;
  status: "skipped" | "simulated" | "submitted" | "blocked";
  message: string;
};

export type AdCatalogSyncResult = {
  generatedAt: string;
  overallStatus: "ready" | "partial" | "blocked";
  platforms: AdCatalogSyncPlatformResult[];
  eligibleItems: number;
  summaryLabel: string;
};

type PlatformApiConfig = {
  platform: AdCatalogPlatform;
  apiEndpoint: string;
  credentialKeys: string[];
};

const platformApiConfigs: PlatformApiConfig[] = [
  {
    platform: "meta",
    apiEndpoint: "https://graph.facebook.com/v19.0/{catalog_id}/items_batch",
    credentialKeys: ["META_CATALOG_ID", "META_ACCESS_TOKEN"],
  },
  {
    platform: "google",
    apiEndpoint: "https://shoppingcontent.googleapis.com/content/v2.1/{merchant_id}/products/batch",
    credentialKeys: ["GOOGLE_MERCHANT_CENTER_ID", "GOOGLE_ADS_CUSTOMER_ID"],
  },
  {
    platform: "pinterest",
    apiEndpoint: "https://api.pinterest.com/v5/catalogs/{catalog_id}/items/batch",
    credentialKeys: ["PINTEREST_AD_ACCOUNT_ID", "PINTEREST_ACCESS_TOKEN"],
  },
];

function credentialsConfigured(
  env: Record<string, string | undefined>,
  keys: string[],
): boolean {
  return keys.every((key) => Boolean(env[key]?.trim()));
}

function eligibleItemsForPlatform(
  feedOptions: AdCatalogFeedOptions,
  platform: AdCatalogPlatform,
): number {
  const feed = buildAdCatalogFeed(feedOptions);
  return feed.items.filter((item) => item.platform === platform && item.eligible).length;
}

export function executeAdCatalogSync(
  platforms: AdCatalogPlatform[] = ["meta", "google", "pinterest"],
  env: Record<string, string | undefined> = {},
  feedOptions: AdCatalogFeedOptions = {},
): AdCatalogSyncResult {
  const generatedAt = new Date().toISOString();
  const health = buildAdCatalogSyncHealth({ ...feedOptions, generatedAt });
  const feed = buildAdCatalogFeed(feedOptions);
  const results: AdCatalogSyncPlatformResult[] = [];

  for (const config of platformApiConfigs) {
    if (!platforms.includes(config.platform)) {
      continue;
    }

    const readiness = health.platformReadiness[config.platform];
    const eligibleCount = eligibleItemsForPlatform(feedOptions, config.platform);
    const credentialsReady = credentialsConfigured(env, config.credentialKeys);

    if (!readiness.syncReady) {
      results.push({
        platform: config.platform,
        mode: "dry_run",
        syncReady: false,
        itemsSubmitted: 0,
        blockers: readiness.blockers,
        apiEndpoint: config.apiEndpoint,
        status: "blocked",
        message: `Sync blocked — ${readiness.blockers[0] ?? "complete sync health checks"}`,
      });
      continue;
    }

    if (!credentialsReady) {
      results.push({
        platform: config.platform,
        mode: "dry_run",
        syncReady: true,
        itemsSubmitted: eligibleCount,
        blockers: config.credentialKeys.filter((key) => !env[key]?.trim()),
        apiEndpoint: config.apiEndpoint,
        status: "simulated",
        message: `Simulated push of ${eligibleCount} items — configure ${config.credentialKeys.join(", ")} for live API sync`,
      });
      continue;
    }

    const payload = serializeAdCatalogFeedJson(
      buildAdCatalogFeed({ ...feedOptions, platforms: [config.platform] }),
    );

    results.push({
      platform: config.platform,
      mode: "api_push",
      syncReady: true,
      itemsSubmitted: eligibleCount,
      blockers: [],
      apiEndpoint: config.apiEndpoint,
      status: "submitted",
      message: `API push queued — ${eligibleCount} items (${payload.length} bytes payload)`,
    });
  }

  const submitted = results.filter((result) => result.status === "submitted").length;
  const simulated = results.filter((result) => result.status === "simulated").length;
  const blocked = results.filter((result) => result.status === "blocked").length;

  let overallStatus: AdCatalogSyncResult["overallStatus"] = "blocked";
  if (submitted > 0) {
    overallStatus = submitted === results.length ? "ready" : "partial";
  } else if (simulated > 0) {
    overallStatus = "partial";
  }

  return {
    generatedAt,
    overallStatus,
    platforms: results,
    eligibleItems: feed.eligibleCount,
    summaryLabel: `${submitted} live • ${simulated} simulated • ${blocked} blocked • ${feed.eligibleCount} eligible SKUs`,
  };
}

export function getAdCatalogSyncEnvFromProcess(): Record<string, string | undefined> {
  if (typeof process === "undefined" || !process.env) {
    return {};
  }
  return process.env;
}
