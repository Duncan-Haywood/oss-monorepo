import { NextResponse } from "next/server";
import Stripe from "stripe";
import { resolveBundleCheckoutLeadSlug } from "@/lib/checkout/organic-attribution";
import { CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY } from "@/lib/checkout/session-persist";
import { BUNDLES, COMMERCE_ADDON, getBundle } from "@/lib/pricing/bundles";
import { recordCheckoutSessionCreated } from "@/lib/db";
import { ConvexPrimaryWriteError } from "@/lib/payments/convex-primary";
import { resolveStripeRedirectAppUrl } from "@/lib/security/app-url";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/security/rate-limit";

/**
 * Creates a Stripe Checkout Session for a bundle tier (+ optional Commerce
 * add-on). See /docs/roadmap#phase-3-payments and /docs/product-bundles.
 *
 * Rate limited per client IP (best-effort, per-instance — see
 * src/lib/security/rate-limit.ts) to blunt scripted checkout-session churn.
 */

interface CheckoutRequestBody {
  tier?: string;
  commerceAddon?: boolean;
  slug?: string;
  customerEmail?: string;
}

function notConfigured(message: string) {
  return NextResponse.json(
    {
      error: "Stripe checkout not configured",
      message,
      docs: "/docs/roadmap#phase-3-payments",
    },
    { status: 501 },
  );
}

export async function POST(request: Request) {
  const clientIp = clientIpFromHeaders(request.headers);
  const rate = checkRateLimit(`stripe-checkout:${clientIp}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests", message: "Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return notConfigured("Set STRIPE_SECRET_KEY, then configure per-tier Stripe Price IDs (see .env.example).");
  }

  let body: CheckoutRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const bundle = getBundle(body.tier ?? "");
  if (!bundle) {
    return NextResponse.json(
      {
        error: "Unknown bundle tier",
        validTiers: BUNDLES.map((b) => b.id),
      },
      { status: 400 },
    );
  }

  const setupPriceId = process.env[bundle.setupPriceIdEnv];
  if (!setupPriceId) {
    return notConfigured(`Set ${bundle.setupPriceIdEnv} to the Stripe Price ID for the ${bundle.name} setup fee.`);
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: setupPriceId, quantity: 1 },
  ];
  let hasRecurring = false;
  const commerceAddonApplied = body.commerceAddon === true;

  if (bundle.monthlyPriceIdEnv) {
    const monthlyPriceId = process.env[bundle.monthlyPriceIdEnv];
    if (!monthlyPriceId) {
      return notConfigured(`Set ${bundle.monthlyPriceIdEnv} to the Stripe Price ID for the ${bundle.name} monthly plan.`);
    }
    lineItems.push({ price: monthlyPriceId, quantity: 1 });
    hasRecurring = true;
  }

  if (commerceAddonApplied) {
    const commerceSetupId = process.env[COMMERCE_ADDON.setupPriceIdEnv];
    const commerceMonthlyId = process.env[COMMERCE_ADDON.monthlyPriceIdEnv];
    if (!commerceSetupId || !commerceMonthlyId) {
      return notConfigured(
        `Set ${COMMERCE_ADDON.setupPriceIdEnv} and ${COMMERCE_ADDON.monthlyPriceIdEnv} for the Commerce add-on.`,
      );
    }
    lineItems.push({ price: commerceSetupId, quantity: 1 }, { price: commerceMonthlyId, quantity: 1 });
    hasRecurring = true;
  }

  // Never trust request.url / Host for Stripe redirect bases — see
  // resolveStripeRedirectAppUrl (Host spoof → post-payment phishing).
  const appUrl = resolveStripeRedirectAppUrl();
  const stripe = new Stripe(secretKey);

  // Homepage CTAs omit slug — mint organic-* so webhook fulfillment + payment
  // stubs still create CRM/handoff rows after Stripe collects money.
  const { leadSlug, mintedOrganic } = resolveBundleCheckoutLeadSlug(body.slug);

  const cancelParams = new URLSearchParams({ cancelled: "1" });
  cancelParams.set("slug", leadSlug);
  cancelParams.set("tier", bundle.id);
  if (commerceAddonApplied) cancelParams.set("commerce", "1");

  try {
    const session = await stripe.checkout.sessions.create({
      mode: hasRecurring ? "subscription" : "payment",
      line_items: lineItems,
      customer_email: body.customerEmail,
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout?${cancelParams.toString()}`,
      metadata: {
        tier: bundle.id,
        commerceAddon: String(commerceAddonApplied),
        slug: leadSlug,
        ...(mintedOrganic ? { organicAttribution: "1" } : {}),
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe session missing checkout URL", message: "Stripe did not return a redirect URL for this session." },
        { status: 502 },
      );
    }

    // Always track — organic slugs recover via session.customerEmail when no
    // CRM lead exists yet; lead-attributed sessions keep prior behavior.
    // When Convex is configured, fail closed (502) rather than return a URL
    // after a SQLite-only write that Convex-first abandoned recovery never sees.
    try {
      await recordCheckoutSessionCreated(
        {
          leadSlug,
          stripeSessionId: session.id,
          tier: bundle.id,
          commerceAddon: commerceAddonApplied,
          customerEmail: body.customerEmail,
          kind: "bundle",
        },
        CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY,
      );
    } catch (e) {
      if (!(e instanceof ConvexPrimaryWriteError)) {
        console.warn(`Failed to record checkout session ${session.id} for recovery tracking`, e);
      }
      return NextResponse.json(
        {
          error: "Checkout tracking unavailable",
          message:
            "Could not record this checkout for recovery tracking. Please try again in a moment.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stripe error";
    return NextResponse.json({ error: "Stripe session creation failed", message }, { status: 502 });
  }
}
