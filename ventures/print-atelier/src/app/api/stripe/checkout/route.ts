import {
  buildCheckoutReadiness,
  buildCheckoutSessionPayload,
  calculateCheckoutTotals,
  getCheckoutEnvStatus,
  parseCheckoutCart,
  sanitizeCheckoutLineItems,
  type CheckoutLineItem,
  type CheckoutShippingRegion,
} from "@/lib/checkout";
import {
  buildCheckoutSessionRetargetingEvents,
  recordCheckoutSessionRetargetingEvents,
} from "@/lib/retargeting-events";
import { executeCheckoutRetargetingLive } from "@/lib/retargeting-events-http";
import { createStripeCheckoutSession } from "@/lib/stripe-checkout-server";
import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/api-auth";
import { resolveCheckoutBaseUrl } from "@/lib/checkout-base-url";
import { SITE_URL_UNCONFIGURED_HINT } from "@/lib/site-url";

export const runtime = "nodejs";

function readEnv() {
  return {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_CONNECT_CLIENT_ID: process.env.STRIPE_CONNECT_CLIENT_ID,
    PRINTFUL_API_KEY: process.env.PRINTFUL_API_KEY,
    PRINTFUL_STORE_ID: process.env.PRINTFUL_STORE_ID,
    GELATO_API_KEY: process.env.GELATO_API_KEY,
    GELATO_STORE_ID: process.env.GELATO_STORE_ID,
    META_PIXEL_ID: process.env.META_PIXEL_ID,
    META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN,
    GOOGLE_ADS_CUSTOMER_ID: process.env.GOOGLE_ADS_CUSTOMER_ID,
    GOOGLE_ADS_ACCESS_TOKEN: process.env.GOOGLE_ADS_ACCESS_TOKEN,
    GOOGLE_ADS_CONVERSION_ACTION_ID: process.env.GOOGLE_ADS_CONVERSION_ACTION_ID,
    GOOGLE_ADS_DEVELOPER_TOKEN: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    PINTEREST_AD_ACCOUNT_ID: process.env.PINTEREST_AD_ACCOUNT_ID,
    PINTEREST_ACCESS_TOKEN: process.env.PINTEREST_ACCESS_TOKEN,
  };
}

function shouldFireRetargetingHttp(env: ReturnType<typeof readEnv>): boolean {
  const metaReady = Boolean(env.META_PIXEL_ID && env.META_ACCESS_TOKEN);
  const googleReady = Boolean(
    env.GOOGLE_ADS_CUSTOMER_ID &&
      env.GOOGLE_ADS_ACCESS_TOKEN &&
      env.GOOGLE_ADS_CONVERSION_ACTION_ID,
  );
  const pinterestReady = Boolean(env.PINTEREST_AD_ACCOUNT_ID && env.PINTEREST_ACCESS_TOKEN);
  return metaReady || googleReady || pinterestReady;
}

/** See `resolveCheckoutBaseUrl` for why no request header reaches this origin. */
function unconfiguredSiteUrl(): NextResponse {
  return NextResponse.json(
    {
      error: "Site origin is not configured",
      hint: SITE_URL_UNCONFIGURED_HINT,
    },
    { status: 503 },
  );
}

/**
 * Operator-only, unlike the POST and PUT below. This is the diagnostic that
 * reports which Stripe, Printful and Gelato credentials are configured — a read
 * of the server's secret configuration, and it answered anonymous callers.
 */
export async function GET(request: Request) {
  const denied = requireOperator(request);
  if (denied) {
    return denied;
  }

  const env = readEnv();
  const status = getCheckoutEnvStatus(env);

  return NextResponse.json({
    endpoint: "/api/stripe/checkout",
    methods: ["GET", "POST"],
    ...status,
  });
}

export async function POST(request: Request) {
  const env = readEnv();
  const envStatus = getCheckoutEnvStatus(env);

  let body: { lineItems?: CheckoutLineItem[]; region?: CheckoutShippingRegion };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawLineItems = body.lineItems ?? [];
  const lineItems = sanitizeCheckoutLineItems(rawLineItems);
  const region: CheckoutShippingRegion = body.region ?? "US";

  if (lineItems.length === 0) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

  const readiness = buildCheckoutReadiness(lineItems, undefined, undefined, env);
  // `readiness.cartBlockers`, never a filter over `readiness.blockers`: those
  // strings interpolate the caller's own artwork slug, so a cart naming an
  // artwork "Gelato" produced the blocker `Unknown artwork slug: Gelato` and a
  // filter dropping anything containing "Gelato" dropped the rejection with it.
  // An off-catalog line item keeps whatever price and payout account the caller
  // sent, so that filter was the whole of the price check.
  const cartBlockers = readiness.cartBlockers;

  if (cartBlockers.length > 0) {
    return NextResponse.json(
      {
        error: "Cart not eligible for checkout",
        blockers: cartBlockers,
      },
      { status: 422 },
    );
  }

  // Resolved here rather than at the top of the handler so that a malformed body
  // and an ineligible cart still answer 400 and 422. The origin is only needed
  // once a session is actually about to be created, which is the only point at
  // which a wrong one could reach a buyer.
  const resolvedBaseUrl = resolveCheckoutBaseUrl();
  if (!resolvedBaseUrl.ok) {
    return unconfiguredSiteUrl();
  }
  const baseUrl = resolvedBaseUrl.baseUrl;

  const sessionPayload = buildCheckoutSessionPayload(lineItems, region, baseUrl, env);
  const totals = calculateCheckoutTotals(lineItems, region, env);
  const cartValueCents = Math.round(totals.total * 100);
  const retargetingEvents = buildCheckoutSessionRetargetingEvents(
    sessionPayload.sessionId,
    lineItems,
    cartValueCents,
    region,
    env,
  );
  const liveRetargeting = await executeCheckoutRetargetingLive(
    retargetingEvents,
    env,
    shouldFireRetargetingHttp(env) ? fetch : undefined,
  );
  recordCheckoutSessionRetargetingEvents(liveRetargeting.events);

  if (!envStatus.readyForTestCheckout) {
    return NextResponse.json({
      ...envStatus,
      simulated: true,
      session: sessionPayload,
      retargetingEvents: liveRetargeting.events,
      retargetingLiveFired: liveRetargeting.liveFired,
      retargetingSimulated: liveRetargeting.simulated,
      hint: "Test-mode Stripe keys missing — session payload preview only. Add keys to .env.local to create live Checkout Sessions.",
    });
  }

  if (!env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY not configured" }, { status: 500 });
  }

  try {
    const liveSession = await createStripeCheckoutSession(sessionPayload, env.STRIPE_SECRET_KEY);

    return NextResponse.json({
      ...envStatus,
      simulated: false,
      session: sessionPayload,
      sessionId: liveSession.sessionId,
      checkoutUrl: liveSession.checkoutUrl,
      livemode: liveSession.livemode,
      retargetingEvents: liveRetargeting.events,
      retargetingLiveFired: liveRetargeting.liveFired,
      retargetingSimulated: liveRetargeting.simulated,
      hint: "Redirect buyer to checkoutUrl. Webhook at /api/stripe/webhook handles payment_intent.succeeded → POD + Connect transfer.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe session creation failed";
    return NextResponse.json(
      {
        error: message,
        ...envStatus,
        simulated: true,
        session: sessionPayload,
      },
      { status: 502 },
    );
  }
}

export async function PUT(request: Request) {
  const payload = await request.text();
  const cart = parseCheckoutCart(payload || "[]");
  return NextResponse.json({ lineItems: cart, count: cart.length });
}
