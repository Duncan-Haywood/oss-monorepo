import {
  buildListingConsentGate,
  calculatePrintEconomics,
  catalogArtworks,
  defaultListingConsentRecords,
  roundCurrency,
  type CatalogArtwork,
  type ListingConsentRecord,
} from "./marketplace";
import { fulfillmentPartners } from "./partners";
import { formatStripeCurrency } from "./stripe-connect";

export type CheckoutShippingRegion = "US" | "EU" | "UK" | "APAC";

export type CheckoutLineItem = {
  artworkSlug: string;
  title: string;
  artistName: string;
  artistAccountId?: string;
  artistHandle?: string;
  retailPrice: number;
  fulfillmentCost: number;
  quantity: number;
};

export type CheckoutEligibility = {
  artworkSlug: string;
  eligible: boolean;
  blockers: string[];
};

export type FulfillmentRoute = {
  partnerId: string;
  partnerName: string;
  region: CheckoutShippingRegion;
  estimatedFulfillmentCost: number;
  shipDaysMin: number;
  shipDaysMax: number;
  marginSavingsVsPrintful: number;
  reason: string;
};

export type CheckoutTotals = {
  subtotal: number;
  shippingEstimate: number;
  /**
   * Informational only. Nothing in this repository registers Print Atelier for
   * sales tax or VAT anywhere, so this figure is not collected and must never
   * be folded into `total` — see `taxCollectedAtCheckout`.
   */
  taxEstimate: number;
  stripeProcessingFee: number;
  /** Exactly what Stripe will charge: subtotal plus shipping. */
  total: number;
  /**
   * Whether Stripe Tax is enabled for this deployment. When it is, Stripe
   * computes and adds tax on top of `total` at the payment step; when it is
   * not, no tax is charged and the order summary says so rather than showing
   * an amount the buyer is never asked for.
   */
  taxCollectedAtCheckout: boolean;
  artistTransfers: number;
  platformRetained: number;
  netProfit: number;
};

export type CheckoutSessionPayload = {
  sessionId: string;
  mode: "payment";
  currency: "usd";
  lineItems: Array<{ name: string; unitAmountCents: number; quantity: number }>;
  /** The shipping the order summary quotes, as a Stripe shipping rate. */
  shippingAmountCents: number;
  /** Whether the session should ask Stripe to compute tax. */
  automaticTax: boolean;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  fulfillmentPartnerId: string;
  shippingRegion: CheckoutShippingRegion;
};

export type CheckoutEnvStatus = {
  secretKeyConfigured: boolean;
  publishableKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
  connectClientIdConfigured: boolean;
  readyForTestCheckout: boolean;
  blockers: string[];
};

export type CheckoutReadiness = {
  cartEligible: boolean;
  envReady: boolean;
  fulfillmentReady: boolean;
  blockers: string[];
  /**
   * The subset of `blockers` the cart itself produced, as opposed to the ones a
   * missing credential produced.
   *
   * Callers that reject a cart must read this rather than filter `blockers`.
   * Those strings interpolate caller-supplied text — `Unknown artwork slug:
   * ${line.artworkSlug}` — so a filter that drops blockers containing "STRIPE",
   * "PRINTFUL" or "Gelato" could be made to drop the rejection itself by naming
   * an artwork after one of them.
   */
  cartBlockers: string[];
  nextActions: string[];
};

const STORAGE_KEY = "print-atelier-checkout-cart";
const STRIPE_RATE = 0.029;
const STRIPE_FIXED = 0.3;

const regionShipping: Record<CheckoutShippingRegion, number> = {
  US: 6.95,
  EU: 9.5,
  UK: 8.25,
  APAC: 12.5,
};

const regionTaxRate: Record<CheckoutShippingRegion, number> = {
  US: 0.0825,
  EU: 0.2,
  UK: 0.2,
  APAC: 0.1,
};

function generateSessionId(): string {
  return `chk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function artworkToCheckoutLine(
  artwork: CatalogArtwork,
  quantity = 1,
): CheckoutLineItem {
  const accountId =
    artwork.artistAccountId ??
    `acct_${artwork.artistName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  const handle =
    artwork.artistHandle ??
    `@${artwork.artistName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

  return {
    artworkSlug: artwork.slug,
    title: artwork.title,
    artistName: artwork.artistName,
    artistAccountId: accountId,
    artistHandle: handle,
    retailPrice: artwork.retailPrice,
    fulfillmentCost: artwork.fulfillmentCost,
    quantity: Math.max(1, quantity),
  };
}

/**
 * Replace the money-bearing fields of each line with the catalog's own values.
 *
 * This is **not** a security boundary. An item whose slug is not in the catalog
 * is returned untouched, on purpose: dropping it silently would turn a tampered
 * cart into a quietly partial one, and the caller could not tell the difference.
 * Refusing an off-catalog item is `buildCheckoutReadiness`'s job through
 * `cartBlockers`, and `buildCheckoutSessionPayload` refuses to price one at all.
 */
export function sanitizeCheckoutLineItems(
  lineItems: CheckoutLineItem[],
  artworks: CatalogArtwork[] = catalogArtworks,
): CheckoutLineItem[] {
  return lineItems.map((item) => {
    const artwork = artworks.find((a) => a.slug === item.artworkSlug);
    if (!artwork) {
      return item;
    }
    const accountId =
      artwork.artistAccountId ??
      `acct_${artwork.artistName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    const handle =
      artwork.artistHandle ??
      `@${artwork.artistName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

    return {
      ...item,
      title: artwork.title,
      artistName: artwork.artistName,
      artistAccountId: accountId,
      artistHandle: handle,
      retailPrice: artwork.retailPrice,
      fulfillmentCost: artwork.fulfillmentCost,
      quantity: Math.max(1, item.quantity),
    };
  });
}

export function validateCheckoutLineItem(
  artwork: CatalogArtwork,
  consentRecords: ListingConsentRecord[] = defaultListingConsentRecords,
): CheckoutEligibility {
  const blockers: string[] = [];

  if (artwork.status !== "Live") {
    blockers.push(`Listing status is "${artwork.status}" — only Live prints can checkout`);
  }

  const consentGate = buildListingConsentGate([artwork], consentRecords);
  const item = consentGate.items[0];

  if (!item) {
    blockers.push("Consent gate could not evaluate listing");
    return { artworkSlug: artwork.slug, eligible: false, blockers };
  }

  if (item.consentStatus === "release-blocked") {
    blockers.push("Listing blocked by release workflow — resolve ops/finance hold first");
  }

  if (!item.allowedChannels.includes("storefront")) {
    blockers.push("Storefront consent missing — POD license must be accepted");
  }

  if (!artwork.hasApprovedProof) {
    blockers.push("Approved print proof required before buyer checkout");
  }

  const economics = calculatePrintEconomics({
    retailPrice: artwork.retailPrice,
    fulfillmentCost: artwork.fulfillmentCost,
  });

  if (economics.netProfit <= 0) {
    blockers.push("Negative unit economics — raise retail or lower POD cost");
  }

  return {
    artworkSlug: artwork.slug,
    eligible: blockers.length === 0,
    blockers,
  };
}

export function buildFulfillmentRoute(
  lineItems: CheckoutLineItem[],
  region: CheckoutShippingRegion,
  env: Record<string, string | undefined> = {},
): FulfillmentRoute {
  const avgFulfillment =
    lineItems.length > 0
      ? lineItems.reduce((sum, item) => sum + item.fulfillmentCost, 0) / lineItems.length
      : 28;

  const printful = fulfillmentPartners.find((partner) => partner.id === "printful");
  const gelato = fulfillmentPartners.find((partner) => partner.id === "gelato");
  const printfulCost = printful?.avgFulfillmentCost ?? 28;
  const gelatoCost = gelato?.avgFulfillmentCost ?? 26;

  const printfulConfigured = Boolean(env.PRINTFUL_API_KEY && env.PRINTFUL_STORE_ID);
  const gelatoConfigured = Boolean(env.GELATO_API_KEY && env.GELATO_STORE_ID);

  const preferGelato =
    (region === "EU" || region === "APAC") &&
    gelatoConfigured &&
    gelatoCost <= avgFulfillment;

  if (preferGelato && gelato) {
    return {
      partnerId: gelato.id,
      partnerName: gelato.name,
      region,
      estimatedFulfillmentCost: roundCurrency(gelatoCost),
      shipDaysMin: region === "APAC" ? 5 : 3,
      shipDaysMax: region === "APAC" ? 9 : 6,
      marginSavingsVsPrintful: roundCurrency(printfulCost - gelatoCost),
      reason: "EU/APAC margin routing — Gelato credentials configured and beats Printful baseline",
    };
  }

  if (printfulConfigured && printful) {
    return {
      partnerId: printful.id,
      partnerName: printful.name,
      region,
      estimatedFulfillmentCost: roundCurrency(printfulCost),
      shipDaysMin: region === "US" ? 3 : 4,
      shipDaysMax: region === "US" ? 6 : 8,
      marginSavingsVsPrintful: 0,
      reason: printfulConfigured
        ? "Printful primary route — API credentials configured"
        : "Printful default route — add PRINTFUL_API_KEY for live fulfillment",
    };
  }

  return {
    partnerId: "printful",
    partnerName: "Printful",
    region,
    estimatedFulfillmentCost: roundCurrency(avgFulfillment),
    shipDaysMin: 4,
    shipDaysMax: 8,
    marginSavingsVsPrintful: 0,
    reason: "Simulated route — configure Printful or Gelato keys in /partner-setup",
  };
}

/**
 * Stripe Tax is off unless a deployment turns it on. Enabling it requires a tax
 * registration and an origin address configured in the Stripe dashboard, so it
 * cannot be the default: a session with `automatic_tax` enabled on an account
 * without those is rejected, which would take the whole checkout down.
 */
export function isAutomaticTaxEnabled(
  env: Record<string, string | undefined> = {},
): boolean {
  return env.STRIPE_AUTOMATIC_TAX?.trim().toLowerCase() === "enabled";
}

export function calculateCheckoutTotals(
  lineItems: CheckoutLineItem[],
  region: CheckoutShippingRegion,
  env: Record<string, string | undefined> = {},
): CheckoutTotals {
  const subtotal = roundCurrency(
    lineItems.reduce((sum, item) => sum + item.retailPrice * item.quantity, 0),
  );
  const shippingEstimate = lineItems.length > 0 ? regionShipping[region] : 0;
  const taxable = subtotal + shippingEstimate;
  const taxEstimate = roundCurrency(taxable * regionTaxRate[region]);
  // `total` is what the buyer is charged, so it may only contain amounts this
  // checkout actually puts on the Stripe session. Shipping is now a
  // `shipping_options` line; tax is either Stripe's to compute or not charged
  // at all. Adding `taxEstimate` here quoted a US buyer $99.11 against an $85
  // charge, and quoted EU/UK buyers 20% VAT that was never collected or
  // remitted.
  const total = roundCurrency(taxable);
  const stripeProcessingFee = roundCurrency(total * STRIPE_RATE + STRIPE_FIXED);

  let artistTransfers = 0;
  let platformRetained = 0;
  let netProfit = 0;

  for (const item of lineItems) {
    const economics = calculatePrintEconomics({
      retailPrice: item.retailPrice,
      fulfillmentCost: item.fulfillmentCost,
    });
    artistTransfers += economics.artistShare * item.quantity;
    platformRetained += economics.platformShare * item.quantity;
    netProfit += economics.netProfit * item.quantity;
  }

  return {
    subtotal,
    shippingEstimate,
    taxEstimate,
    stripeProcessingFee,
    total,
    taxCollectedAtCheckout: isAutomaticTaxEnabled(env),
    artistTransfers: roundCurrency(artistTransfers),
    platformRetained: roundCurrency(platformRetained),
    netProfit: roundCurrency(netProfit),
  };
}

export function buildCheckoutSessionPayload(
  lineItems: CheckoutLineItem[],
  region: CheckoutShippingRegion,
  baseUrl: string,
  env: Record<string, string | undefined> = {},
  artworks: CatalogArtwork[] = catalogArtworks,
): CheckoutSessionPayload {
  const canonicalLineItems = lineItems.map((item) => {
    const artwork = artworks.find((art) => art.slug === item.artworkSlug);
    if (artwork) {
      return artworkToCheckoutLine(artwork, item.quantity);
    }
    // The money boundary, and it does not depend on a caller having checked
    // first. Returning `item` here carried the caller's own `retailPrice`,
    // `fulfillmentCost` and `artistAccountId` onto a live Stripe session and
    // into the payout metadata the Connect webhook reads.
    throw new Error(
      `Refusing to price "${item.artworkSlug}": not in the catalog. Every amount on a checkout session is derived from a catalog artwork.`,
    );
  });

  const route = buildFulfillmentRoute(canonicalLineItems, region, env);
  const totals = calculateCheckoutTotals(canonicalLineItems, region, env);

  const primaryItem = canonicalLineItems[0];
  const primaryAccountId =
    primaryItem?.artistAccountId ??
    (primaryItem
      ? `acct_${primaryItem.artistName.toLowerCase().replace(/[^a-z0-9]/g, "")}`
      : "");
  const primaryHandle =
    primaryItem?.artistHandle ??
    (primaryItem
      ? `@${primaryItem.artistName.toLowerCase().replace(/[^a-z0-9]/g, "")}`
      : "");

  return {
    sessionId: generateSessionId(),
    mode: "payment",
    currency: "usd",
    lineItems: canonicalLineItems.map((item) => ({
      name: `${item.title} — ${item.artistName}`,
      unitAmountCents: Math.round(item.retailPrice * 100),
      quantity: item.quantity,
    })),
    shippingAmountCents: Math.round(totals.shippingEstimate * 100),
    automaticTax: totals.taxCollectedAtCheckout,
    successUrl: `${baseUrl}/checkout?status=success`,
    cancelUrl: `${baseUrl}/checkout?status=cancelled`,
    metadata: {
      fulfillmentPartnerId: route.partnerId,
      shippingRegion: region,
      artistTransferTotal: totals.artistTransfers.toFixed(2),
      platformRetainedTotal: totals.platformRetained.toFixed(2),
      lineItemCount: String(canonicalLineItems.length),
      // `lineItemCount` is how many *distinct* lines there are. The fulfillment
      // adapters read this metadata and nothing else, so until these two lists
      // existed the only per-line facts reaching a print partner were the slug
      // and the name — the partner was told what to print and never how many,
      // and both adapters filled the gap with `quantity: 1`. These are the same
      // numbers `lineItems` above is built from, which is what the buyer's card
      // is charged against.
      lineItemQuantities: canonicalLineItems.map((item) => item.quantity).join(","),
      lineItemUnitAmounts: canonicalLineItems
        .map((item) => Math.round(item.retailPrice * 100))
        .join(","),
      catalogSlug: canonicalLineItems[0]?.artworkSlug ?? "",
      artistAccountId: primaryAccountId,
      artistHandle: primaryHandle,
      destinationConnectAccountId: primaryAccountId,
      ...Object.fromEntries(
        canonicalLineItems.flatMap((item, index) => {
          const accId =
            item.artistAccountId ??
            `acct_${item.artistName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
          const hnd =
            item.artistHandle ??
            `@${item.artistName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
          return [
            [`catalogSlug_${index}`, item.artworkSlug],
            [`lineItemName_${index}`, `${item.title} — ${item.artistName}`],
            [`artistAccountId_${index}`, accId],
            [`artistHandle_${index}`, hnd],
          ];
        }),
      ),
    },
    fulfillmentPartnerId: route.partnerId,
    shippingRegion: region,
  };
}

export function getCheckoutEnvStatus(env: {
  STRIPE_SECRET_KEY?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_CONNECT_CLIENT_ID?: string;
}): CheckoutEnvStatus {
  const secretKeyConfigured = Boolean(env.STRIPE_SECRET_KEY?.startsWith("sk_"));
  const publishableKeyConfigured = Boolean(env.STRIPE_PUBLISHABLE_KEY?.startsWith("pk_"));
  const webhookSecretConfigured = Boolean(env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_"));
  const connectClientIdConfigured = Boolean(env.STRIPE_CONNECT_CLIENT_ID?.startsWith("ca_"));

  const blockers: string[] = [];
  if (!secretKeyConfigured) {
    blockers.push("STRIPE_SECRET_KEY missing (expect sk_test_…)");
  }
  if (!publishableKeyConfigured) {
    blockers.push("STRIPE_PUBLISHABLE_KEY missing (expect pk_test_…)");
  }
  if (!webhookSecretConfigured) {
    blockers.push("STRIPE_WEBHOOK_SECRET missing for payment_intent.succeeded → fulfillment");
  }
  if (!connectClientIdConfigured) {
    blockers.push("STRIPE_CONNECT_CLIENT_ID missing for artist transfer routing");
  }

  return {
    secretKeyConfigured,
    publishableKeyConfigured,
    webhookSecretConfigured,
    connectClientIdConfigured,
    readyForTestCheckout: blockers.length === 0,
    blockers,
  };
}

export function buildCheckoutReadiness(
  lineItems: CheckoutLineItem[],
  artworks: CatalogArtwork[] = catalogArtworks,
  consentRecords: ListingConsentRecord[] = defaultListingConsentRecords,
  env: Record<string, string | undefined> = {},
): CheckoutReadiness {
  // Kept separate at the point the distinction is actually known, rather than
  // recovered later by matching substrings of the messages. `blockers` stays the
  // full list for display.
  const cartBlockers: string[] = [];
  const envBlockers: string[] = [];
  const nextActions: string[] = [];

  if (lineItems.length === 0) {
    cartBlockers.push("Cart is empty");
  }

  for (const line of lineItems) {
    const artwork = artworks.find((item) => item.slug === line.artworkSlug);
    if (!artwork) {
      cartBlockers.push(`Unknown artwork slug: ${line.artworkSlug}`);
      continue;
    }
    if (typeof line.retailPrice === "number" && Math.abs(line.retailPrice - artwork.retailPrice) > 0.001) {
      cartBlockers.push(`${line.title || line.artworkSlug}: Price mismatch ($${line.retailPrice.toFixed(2)} requested vs $${artwork.retailPrice.toFixed(2)} catalog)`);
    }
    const eligibility = validateCheckoutLineItem(artwork, consentRecords);
    if (!eligibility.eligible) {
      cartBlockers.push(...eligibility.blockers.map((b) => `${line.title}: ${b}`));
    }
  }

  const envStatus = getCheckoutEnvStatus(env);
  if (!envStatus.readyForTestCheckout) {
    envBlockers.push(...envStatus.blockers);
    nextActions.push("Copy test-mode keys from Stripe Dashboard into .env.local");
  }

  const blockers = [...cartBlockers, ...envBlockers];

  const printfulReady = Boolean(env.PRINTFUL_API_KEY && env.PRINTFUL_STORE_ID);
  const gelatoReady = Boolean(env.GELATO_API_KEY && env.GELATO_STORE_ID);
  const fulfillmentReady = printfulReady || gelatoReady;

  if (!fulfillmentReady) {
    nextActions.push("Configure Printful or Gelato credentials at /partner-setup");
  } else {
    nextActions.push("POST /api/stripe/checkout to create a test Checkout Session");
  }

  if (blockers.length === 0) {
    nextActions.push("On payment_intent.succeeded webhook → trigger POD job + Connect transfer");
  }

  return {
    cartEligible: lineItems.length > 0 && cartBlockers.length === 0,
    envReady: envStatus.readyForTestCheckout,
    fulfillmentReady,
    blockers,
    cartBlockers,
    nextActions,
  };
}

export function buildSampleCheckoutCart(
  artworks: CatalogArtwork[] = catalogArtworks,
  consentRecords: ListingConsentRecord[] = defaultListingConsentRecords,
): CheckoutLineItem[] {
  const eligible = artworks.filter((artwork) => {
    const eligibility = validateCheckoutLineItem(artwork, consentRecords);
    return eligibility.eligible;
  });

  return eligible.slice(0, 2).map((artwork) => artworkToCheckoutLine(artwork, 1));
}

export function serializeCheckoutCart(lineItems: CheckoutLineItem[]): string {
  return JSON.stringify(lineItems);
}

export function parseCheckoutCart(raw: string | null): CheckoutLineItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CheckoutLineItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        typeof item.artworkSlug === "string" &&
        typeof item.retailPrice === "number" &&
        typeof item.quantity === "number",
    );
  } catch {
    return [];
  }
}

export function loadCheckoutCartFromStorage(): CheckoutLineItem[] {
  if (typeof window === "undefined") return [];
  return parseCheckoutCart(window.localStorage.getItem(STORAGE_KEY));
}

export function saveCheckoutCartToStorage(lineItems: CheckoutLineItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, serializeCheckoutCart(lineItems));
}

export function formatCheckoutCurrency(value: number): string {
  return formatStripeCurrency(value);
}

export type CheckoutFunnelStage = {
  stage: string;
  count: number;
  conversionFromPrevious: number | null;
  blockers: string[];
  status: "healthy" | "watch" | "blocked";
};

export type CheckoutFunnelMetrics = {
  eligibleListings: number;
  sampleCartItems: number;
  cartEligible: boolean;
  stripeEnvReady: boolean;
  fulfillmentReady: boolean;
  checkoutSessionReady: boolean;
  overallReadiness: number;
  stages: CheckoutFunnelStage[];
  nextActions: string[];
};

export function buildCheckoutFunnelMetrics(
  artworks: CatalogArtwork[] = catalogArtworks,
  consentRecords?: ListingConsentRecord[],
  env: Record<string, string | undefined> = {},
): CheckoutFunnelMetrics {
  const consents = consentRecords ?? defaultListingConsentRecords;
  const eligible = artworks.filter((artwork) => {
    const result = validateCheckoutLineItem(artwork, consents);
    return result.eligible;
  });

  const sampleCart = buildSampleCheckoutCart(artworks, consents);
  const readiness = buildCheckoutReadiness(sampleCart, artworks, consents, env);
  const envStatus = getCheckoutEnvStatus(env);
  const printfulReady = Boolean(env.PRINTFUL_API_KEY && env.PRINTFUL_STORE_ID);
  const gelatoReady = Boolean(env.GELATO_API_KEY && env.GELATO_STORE_ID);
  const fulfillmentReady = printfulReady || gelatoReady;
  const checkoutSessionReady =
    readiness.cartEligible && envStatus.readyForTestCheckout && fulfillmentReady;

  const stages: CheckoutFunnelStage[] = [
    {
      stage: "Consent-cleared listings",
      count: eligible.length,
      conversionFromPrevious: null,
      blockers:
        eligible.length < artworks.length
          ? [`${artworks.length - eligible.length} listings blocked by consent or proof`]
          : [],
      status: eligible.length >= 3 ? "healthy" : eligible.length >= 1 ? "watch" : "blocked",
    },
    {
      stage: "Sample cart eligible",
      count: sampleCart.length,
      conversionFromPrevious:
        eligible.length > 0 ? Math.round((sampleCart.length / eligible.length) * 100) : 0,
      blockers: readiness.cartEligible ? [] : readiness.cartBlockers,
      status: readiness.cartEligible ? "healthy" : "blocked",
    },
    {
      stage: "Stripe test env",
      count: envStatus.readyForTestCheckout ? 1 : 0,
      conversionFromPrevious: readiness.cartEligible
        ? envStatus.readyForTestCheckout
          ? 100
          : 0
        : null,
      blockers: envStatus.blockers,
      status: envStatus.readyForTestCheckout ? "healthy" : "watch",
    },
    {
      stage: "POD fulfillment configured",
      count: fulfillmentReady ? 1 : 0,
      conversionFromPrevious: envStatus.readyForTestCheckout
        ? fulfillmentReady
          ? 100
          : 0
        : null,
      blockers: fulfillmentReady
        ? []
        : ["Configure Printful or Gelato credentials at /partner-setup"],
      status: fulfillmentReady ? "healthy" : "watch",
    },
    {
      stage: "Live checkout session",
      count: checkoutSessionReady ? 1 : 0,
      conversionFromPrevious: fulfillmentReady ? (checkoutSessionReady ? 100 : 0) : null,
      blockers: checkoutSessionReady ? [] : ["Complete cart, Stripe keys, and POD credentials"],
      status: checkoutSessionReady ? "healthy" : "blocked",
    },
  ];

  const healthyStages = stages.filter((stage) => stage.status === "healthy").length;
  const overallReadiness = Math.round((healthyStages / stages.length) * 100);

  const nextActions = [...readiness.nextActions];
  if (checkoutSessionReady) {
    nextActions.unshift("POST /api/stripe/checkout creates live Stripe Checkout Sessions");
  }

  return {
    eligibleListings: eligible.length,
    sampleCartItems: sampleCart.length,
    cartEligible: readiness.cartEligible,
    stripeEnvReady: envStatus.readyForTestCheckout,
    fulfillmentReady,
    checkoutSessionReady,
    overallReadiness,
    stages,
    nextActions,
  };
}
