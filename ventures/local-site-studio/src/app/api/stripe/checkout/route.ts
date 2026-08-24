import { NextResponse } from "next/server";
import Stripe from "stripe";
import { parseCheckoutAcquisitionSource } from "@/lib/checkout/acquisition-source";
import {
  normalizeCheckoutBusinessName,
  normalizeCheckoutBusinessPhone,
} from "@/lib/checkout/business-fields";
import { normalizeCheckoutCustomerEmail } from "@/lib/checkout/customer-email";
import { parseClientIdempotencyKey } from "@/lib/checkout/idempotency-key";
import { resolveBundleCheckoutLeadSlug } from "@/lib/checkout/organic-attribution";
import { CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY } from "@/lib/checkout/session-persist";
import { existingRecurringStripeCustomerId } from "@/lib/orders/recurring";
import { BUNDLES, COMMERCE_ADDON, getBundle, parseBundleBillingInterval } from "@/lib/pricing/bundles";
import { listOrdersByLeadSlug, recordCheckoutSessionCreated } from "@/lib/db";
import { captureError } from "@/lib/observability/error-tracking";
import { ConvexPrimaryWriteError } from "@/lib/payments/convex-primary";
import { resolveStripeRedirectAppUrl } from "@/lib/security/app-url";
import { readJsonBodyWithByteLimit } from "@/lib/security/json-body";
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
  billingInterval?: string;
  slug?: string;
  customerEmail?: string;
  idempotencyKey?: string;
  acquisitionSource?: string;
  businessName?: string;
  businessPhone?: string;
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

  const parsedBody = await readJsonBodyWithByteLimit<CheckoutRequestBody>(request);
  if (!parsedBody.ok) {
    if (parsedBody.reason === "too_large") {
      return NextResponse.json({ error: "Request body is too large" }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = parsedBody.value;

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

  // Resolved early (normally derived further down, alongside customerEmail/
  // acquisitionSource) purely so the setup-fee skip below can run before the
  // line items are built — see the doc comment on hasExistingOrder.
  const idempotencyKey = parseClientIdempotencyKey(body.idempotencyKey);
  const { leadSlug, mintedOrganic } = resolveBundleCheckoutLeadSlug(body.slug, {
    idempotencyKey,
  });

  // A tier-upgrade checkout for a lead that already has ANY prior bundle
  // order (Starter/Growth/Complete all share the same one-time setup fee —
  // see BUNDLES) must not charge the one-time setup fee again — every tier's
  // setupPriceUsd covers the same site build, done once. Both the Starter
  // and Growth upsell emails (sendStarterUpsellEmail / sendGrowthUpsellEmail
  // in src/lib/email/resend.ts) explicitly tell the customer "Setup is
  // already covered by what you paid" before linking to this exact route
  // with no other signal of "this is an upgrade" — the promise is only true
  // if this route independently rediscovers the same fact via the lead's own
  // order history. Previously it did not: every checkout unconditionally
  // priced in the setup fee regardless of prior orders, silently
  // overcharging an upgrading customer by the full setup amount and
  // contradicting the email they just read. See
  // checkout-setup-fee-skip-on-upgrade.
  //
  // Deliberately does not filter out refunded/disputed prior orders (mirrors
  // existingRecurringStripeCustomerId's own no-filter precedent just below):
  // the only two paths that ever reach this route with a lead that has prior
  // orders are the upsell emails above, whose own eligibility checks
  // (isStarterOnlyOrder / isLiveGrowthOrder) already exclude a
  // refunded/disputed source order before the email is ever sent.
  const existingOrders = await listOrdersByLeadSlug(leadSlug);
  const hasExistingOrder = existingOrders.length > 0;

  let setupPriceId: string | undefined;
  if (!hasExistingOrder) {
    setupPriceId = process.env[bundle.setupPriceIdEnv];
    if (!setupPriceId) {
      return notConfigured(`Set ${bundle.setupPriceIdEnv} to the Stripe Price ID for the ${bundle.name} setup fee.`);
    }
  }

  const commerceAddonApplied = body.commerceAddon === true;
  const billingInterval = parseBundleBillingInterval(body.billingInterval);
  // The Commerce add-on has no annual Price of its own (annual-billing-option
  // deliberately scoped it out — a single Stripe subscription's recurring
  // line items must share one billing interval, and adding a second annual
  // Price for the add-on is a separate, later change). Reject the combination
  // outright rather than silently billing the add-on monthly inside an
  // otherwise-annual subscription, which Stripe would likely reject anyway.
  if (billingInterval === "annual" && commerceAddonApplied) {
    return NextResponse.json(
      {
        error: "Annual billing cannot be combined with the Commerce add-on yet",
        message: "Choose monthly billing to add the Commerce add-on, or purchase it separately afterward.",
      },
      { status: 400 },
    );
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = setupPriceId
    ? [{ price: setupPriceId, quantity: 1 }]
    : [];
  let hasRecurring = false;

  const recurringPriceIdEnv =
    billingInterval === "annual" ? bundle.annualPriceIdEnv : bundle.monthlyPriceIdEnv;
  if (recurringPriceIdEnv) {
    const recurringPriceId = process.env[recurringPriceIdEnv];
    if (!recurringPriceId) {
      return notConfigured(
        `Set ${recurringPriceIdEnv} to the Stripe Price ID for the ${bundle.name} ${billingInterval} plan.`,
      );
    }
    lineItems.push({ price: recurringPriceId, quantity: 1 });
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

  // Only reachable when hasExistingOrder skipped the setup fee AND the tier
  // has no recurring price AND no Commerce add-on was requested (e.g. a
  // repeat Starter checkout for a lead that already has an order) — nothing
  // legitimate to charge, and Stripe rejects an empty line_items array
  // anyway. No real entry point hits this (the upsell emails only ever link
  // to growth/complete, both of which always have a recurring price), but
  // fail with a clear 400 rather than letting a malformed/replayed request
  // reach Stripe with nothing to sell.
  if (lineItems.length === 0) {
    return NextResponse.json(
      {
        error: "Nothing to purchase",
        message: `${bundle.name} has no setup fee to charge for a lead that already has an order, and no recurring plan or add-on was selected.`,
      },
      { status: 400 },
    );
  }

  // Never trust request.url / Host for Stripe redirect bases — see
  // resolveStripeRedirectAppUrl (Host spoof → post-payment phishing).
  const appUrl = resolveStripeRedirectAppUrl();
  const stripe = new Stripe(secretKey);

  // Soft-cap before Stripe + persist — rate limits blunt count, not size.
  const customerEmail = normalizeCheckoutCustomerEmail(body.customerEmail);
  // Never trust a client-supplied acquisition-source string — validate
  // against the fixed allowlist and silently drop anything else (see
  // acquisition-source-checkout-attribution).
  const acquisitionSource = parseCheckoutAcquisitionSource(body.acquisitionSource);
  // Only meaningful on the organic no-preexisting-lead path (mintedOrganic) —
  // a real lead's businessName already lives in the CRM, and CheckoutForm
  // only renders this field when prefill.businessName is absent. Soft-capped,
  // never trusted for anything beyond display/CRM stub defaults.
  const businessName = normalizeCheckoutBusinessName(body.businessName);
  const businessPhone = normalizeCheckoutBusinessPhone(body.businessPhone);

  // A recurring checkout for a lead that already has a live recurring order
  // (e.g. the Growth→Complete upsell email's checkout link) must reuse that
  // order's Stripe Customer instead of letting customer_email mint a fresh
  // one — otherwise the same subscriber ends up with two Customers and two
  // active Subscriptions, silently doubling their bill. See
  // stripe-checkout-recurring-upgrade-dedup. A brand-new subscriber has no
  // prior orders, so this resolves to null and behaves exactly as before.
  // Reuses existingOrders (fetched above for the setup-fee-skip check) rather
  // than a second listOrdersByLeadSlug call.
  const existingCustomerId = hasRecurring
    ? existingRecurringStripeCustomerId(existingOrders)
    : null;

  const cancelParams = new URLSearchParams({ cancelled: "1" });
  cancelParams.set("slug", leadSlug);
  cancelParams.set("tier", bundle.id);
  if (commerceAddonApplied) cancelParams.set("commerce", "1");
  if (billingInterval === "annual") cancelParams.set("billing", "annual");
  // Carry the validated acquisition source back onto /checkout so a
  // shopper who backs out of Stripe and retries doesn't lose attribution
  // (checkout-cancel-url-acquisition-source-round-trip) — CheckoutPage
  // already re-parses ?source= into prefill.acquisitionSource.
  if (acquisitionSource) cancelParams.set("source", acquisitionSource);

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: hasRecurring ? "subscription" : "payment",
        line_items: lineItems,
        // Stripe rejects passing both — reuse the existing Customer for a
        // recurring upgrade (see existingCustomerId above), otherwise fall
        // back to customer_email exactly as before.
        ...(existingCustomerId
          ? { customer: existingCustomerId }
          : { customer_email: customerEmail }),
        allow_promotion_codes: true,
        success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/checkout?${cancelParams.toString()}`,
        metadata: {
          tier: bundle.id,
          commerceAddon: String(commerceAddonApplied),
          billingInterval,
          slug: leadSlug,
          ...(mintedOrganic ? { organicAttribution: "1" } : {}),
          ...(acquisitionSource ? { acquisitionSource } : {}),
          ...(businessName ? { businessName } : {}),
          ...(businessPhone ? { businessPhone } : {}),
        },
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );

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
          customerEmail,
          kind: "bundle",
          billingInterval,
        },
        CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY,
      );
    } catch (e) {
      if (!(e instanceof ConvexPrimaryWriteError)) {
        console.warn(`Failed to record checkout session ${session.id} for recovery tracking`, e);
      }
      await captureError(e, { component: "stripe-checkout", failureKind: "checkout_session_record" });
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
    await captureError(error, { component: "stripe-checkout", failureKind: "session_create" });
    return NextResponse.json({ error: "Stripe session creation failed", message }, { status: 502 });
  }
}
