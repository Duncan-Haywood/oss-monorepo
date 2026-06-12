import { fulfillmentPartners, adPlatformPartners } from "./partners";

export type PartnerCredentialStatus = "ready" | "partial" | "missing";

export type PartnerCredentialKey = {
  key: string;
  label: string;
  configured: boolean;
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

export type PartnerCredentialVault = {
  credentials: PartnerCredential[];
  fulfillmentReady: boolean;
  adsReady: boolean;
  paymentsReady: boolean;
  overallScore: number;
  label: string;
  blockers: string[];
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
  const envKeys = def.envKeys.map((item) => ({
    ...item,
    configured: resolveEnv(env, item.key),
  }));
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

  return {
    credentials,
    fulfillmentReady,
    adsReady,
    paymentsReady,
    overallScore,
    label,
    blockers,
  };
}

export function getPartnerCredentialEnvFromProcess(): EnvSource {
  if (typeof process === "undefined" || !process.env) {
    return {};
  }
  return process.env;
}
