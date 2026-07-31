import { fulfillmentPartners, adPlatformPartners } from "./partners";

export type PartnerCredentialStatus = "ready" | "partial" | "missing";

export type PartnerCredentialKey = {
  key: string;
  label: string;
  configured: boolean;
  maskedValue?: string;
};

export type PartnerCredential = {
  partnerId: string;
  partnerName: string;
  category: "fulfillment" | "ads" | "payments";
  envKeys: PartnerCredentialKey[];
  status: PartnerCredentialStatus;
  marginRoutingEligible: boolean;
  nextAction: string;
};

export type VercelIntegrationStatus = {
  isVercelEnv: boolean;
  environmentName: string;
  projectIdConfigured: boolean;
  pullCommand: string;
  instructions: string;
};

export type PartnerCredentialVault = {
  credentials: PartnerCredential[];
  fulfillmentReady: boolean;
  adsReady: boolean;
  paymentsReady: boolean;
  overallScore: number;
  label: string;
  blockers: string[];
  vercelStatus: VercelIntegrationStatus;
};

type EnvSource = Record<string, string | undefined>;

const fulfillmentCredentialDefs = [
  {
    partnerId: "printful",
    partnerName: "Printful",
    envKeys: [
      { key: "PRINTFUL_API_KEY", label: "API key" },
      { key: "PRINTFUL_STORE_ID", label: "Store ID" },
    ],
    marginRoutingEligible: true,
    nextAction: "Map catalog slugs to Printful product variants for US/EU routing.",
  },
  {
    partnerId: "gelato",
    partnerName: "Gelato",
    envKeys: [
      { key: "GELATO_API_KEY", label: "API key" },
      { key: "GELATO_STORE_ID", label: "Store ID" },
    ],
    marginRoutingEligible: true,
    nextAction: "Enable as secondary route when EU/APAC margin beats Printful by 2%+.",
  },
] as const;

const adCredentialDefs = [
  {
    partnerId: "meta",
    partnerName: "Meta Ads",
    envKeys: [
      { key: "META_PIXEL_ID", label: "Pixel ID" },
      { key: "META_CATALOG_ID", label: "Catalog ID" },
      { key: "META_ACCESS_TOKEN", label: "Access token" },
    ],
    marginRoutingEligible: false,
    nextAction: "Sync consent-cleared catalog feed after creative quota passes.",
  },
  {
    partnerId: "google",
    partnerName: "Google Ads",
    envKeys: [
      { key: "GOOGLE_ADS_CUSTOMER_ID", label: "Customer ID" },
      { key: "GOOGLE_MERCHANT_CENTER_ID", label: "Merchant Center ID" },
    ],
    marginRoutingEligible: false,
    nextAction: "Upload programmatic SEO slugs to Merchant Center product feed.",
  },
  {
    partnerId: "pinterest",
    partnerName: "Pinterest",
    envKeys: [
      { key: "PINTEREST_AD_ACCOUNT_ID", label: "Ad account ID" },
      { key: "PINTEREST_ACCESS_TOKEN", label: "Access token" },
    ],
    marginRoutingEligible: false,
    nextAction: "Prioritize room-mockup creatives before catalog upload.",
  },
] as const;

const paymentCredentialDefs = [
  {
    partnerId: "stripe",
    partnerName: "Stripe Connect",
    envKeys: [
      { key: "STRIPE_SECRET_KEY", label: "Secret key" },
      { key: "STRIPE_WEBHOOK_SECRET", label: "Webhook secret" },
      { key: "STRIPE_CONNECT_CLIENT_ID", label: "Connect client ID" },
    ],
    marginRoutingEligible: false,
    nextAction: "Enable test-mode Connect transfers before artist onboarding at scale.",
  },
] as const;

export function maskSecretValue(value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    return "Not configured";
  }
  const str = value.trim();
  if (str.length <= 6) {
    return "••••••••";
  }

  const knownPrefixes = ["sk_test_", "sk_live_", "whsec_", "pk_test_", "pk_live_", "ca_"];
  for (const prefix of knownPrefixes) {
    if (str.startsWith(prefix)) {
      const remainder = str.slice(prefix.length);
      const suffix = remainder.slice(-4);
      return `${prefix}••••${suffix}`;
    }
  }

  const prefix = str.slice(0, 3);
  const suffix = str.slice(-4);
  return `${prefix}••••${suffix}`;
}

function resolveEnv(env: EnvSource, key: string): boolean {
  const value = env[key];
  return typeof value === "string" && value.trim().length > 0;
}

function buildCredential(
  def: {
    partnerId: string;
    partnerName: string;
    envKeys: readonly { key: string; label: string }[];
    marginRoutingEligible: boolean;
    nextAction: string;
  },
  category: PartnerCredential["category"],
  env: EnvSource,
): PartnerCredential {
  const envKeys = def.envKeys.map((item) => {
    const isConfigured = resolveEnv(env, item.key);
    return {
      ...item,
      configured: isConfigured,
      maskedValue: isConfigured ? maskSecretValue(env[item.key]) : "Not configured",
    };
  });
  const configuredCount = envKeys.filter((item) => item.configured).length;
  const status: PartnerCredentialStatus =
    configuredCount === envKeys.length
      ? "ready"
      : configuredCount > 0
        ? "partial"
        : "missing";

  return {
    partnerId: def.partnerId,
    partnerName: def.partnerName,
    category,
    envKeys,
    status,
    marginRoutingEligible: def.marginRoutingEligible && status === "ready",
    nextAction: def.nextAction,
  };
}

export function buildPartnerCredentialVault(env: EnvSource = {}): PartnerCredentialVault {
  const fulfillment = fulfillmentCredentialDefs.map((def) =>
    buildCredential(def, "fulfillment", env),
  );
  const ads = adCredentialDefs.map((def) => buildCredential(def, "ads", env));
  const payments = paymentCredentialDefs.map((def) =>
    buildCredential(def, "payments", env),
  );
  const credentials = [...fulfillment, ...ads, ...payments];

  const fulfillmentReady = fulfillment.some((item) => item.status === "ready");
  const adsReady = ads.filter((item) => item.status === "ready").length >= 2;
  const paymentsReady = payments.every((item) => item.status === "ready");

  const readyCount = credentials.filter((item) => item.status === "ready").length;
  const partialCount = credentials.filter((item) => item.status === "partial").length;
  const overallScore = Math.round(
    ((readyCount + partialCount * 0.5) / Math.max(credentials.length, 1)) * 100,
  );

  const blockers = [
    ...credentials
      .filter((item) => item.status !== "ready")
      .map((item) => `${item.partnerName}: ${item.envKeys.filter((k) => !k.configured).map((k) => k.label).join(", ")}`),
    ...fulfillmentPartners
      .filter((partner) => partner.apiStatus === "not_started")
      .map((partner) => `${partner.name} integration not started`),
    ...adPlatformPartners
      .filter((platform) => platform.catalogSyncStatus === "blocked")
      .map((platform) => `${platform.name} catalog sync blocked`),
  ].slice(0, 6);

  const label =
    overallScore >= 85
      ? "Partner stack ready"
      : overallScore >= 55
        ? "Partial credentials — pilot only"
        : "Configure credentials before launch";

  const vercelStatus = getVercelIntegrationStatus(env);

  return {
    credentials,
    fulfillmentReady,
    adsReady,
    paymentsReady,
    overallScore,
    label,
    blockers,
    vercelStatus,
  };
}

export function getVercelIntegrationStatus(env: EnvSource = {}): VercelIntegrationStatus {
  const vercelEnv = env.VERCEL_ENV || env.NODE_ENV;
  const isVercelEnv = Boolean(env.VERCEL || env.VERCEL_ENV || env.VERCEL_URL);
  const projectIdConfigured = Boolean(env.VERCEL_PROJECT_ID);
  const environmentName = (env.VERCEL_ENV as string) ?? (env.NODE_ENV === "production" ? "production" : "development");

  return {
    isVercelEnv,
    environmentName,
    projectIdConfigured,
    pullCommand: "npx vercel env pull .env.local",
    instructions:
      "Run 'npx vercel env pull .env.local' in the project directory to sync production or preview secrets to your local environment.",
  };
}

/**
 * Strips masked secret material from a vault before it crosses a network
 * boundary.
 *
 * `maskSecretValue` deliberately keeps a recognizable prefix and the last four
 * characters so an operator reading the setup screen can tell which key is
 * installed. That is useful beside a human and harmful in an HTTP response: it
 * confirms live-vs-test mode and hands over four real characters of a live
 * credential. `configured` carries everything a remote caller legitimately
 * needs, so the mask never leaves the process.
 */
export function withoutMaskedValues(
  vault: PartnerCredentialVault,
): PartnerCredentialVault {
  return {
    ...vault,
    credentials: vault.credentials.map((credential) => ({
      ...credential,
      envKeys: credential.envKeys.map((item) => ({
        key: item.key,
        label: item.label,
        configured: item.configured,
      })),
    })),
  };
}

export function getPartnerCredentialEnvFromProcess(): EnvSource {
  if (typeof process === "undefined" || !process.env) {
    return {};
  }
  return process.env;
}

export type VercelEnvPullResult = {
  success: boolean;
  pulledCount: number;
  environment: "production" | "preview" | "development";
  vaultSummary: PartnerCredentialVault;
  syncedKeys: string[];
};

export function simulateVercelEnvPull(
  envOverrides: Record<string, string> = {},
  environment: "production" | "preview" | "development" = "production",
): VercelEnvPullResult {
  const currentEnv = getPartnerCredentialEnvFromProcess();
  const mergedEnv = { ...currentEnv, ...envOverrides };
  const vaultSummary = buildPartnerCredentialVault(mergedEnv);
  const syncedKeys = Object.keys(envOverrides);

  return {
    success: true,
    pulledCount: syncedKeys.length,
    environment,
    vaultSummary,
    syncedKeys,
  };
}

