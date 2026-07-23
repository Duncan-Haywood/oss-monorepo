import { NextResponse } from "next/server";
import Stripe from "stripe";
import { normalizeCheckoutCustomerEmail } from "@/lib/checkout/customer-email";
import { parseClientIdempotencyKey } from "@/lib/checkout/idempotency-key";
import { CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY } from "@/lib/checkout/session-persist";
import { leadEligibleForCommerceCatalog } from "@/lib/commerce/catalog";
import {
  MAX_COMMERCE_LINE_ITEM_QUANTITY,
  parseCommerceCheckoutSkuId,
  parseCommerceCheckoutSlug,
} from "@/lib/commerce/checkout-fields";
import {
  getCommerceCatalog,
  getLeadBySlug,
  listOrdersByLeadSlug,
  recordCheckoutSessionCreated,
} from "@/lib/db";
import { leadPreviewAbsoluteUrl } from "@/lib/leads/slug-path";
import { ConvexPrimaryWriteError } from "@/lib/payments/convex-primary";
import { resolveStripeRedirectAppUrl } from "@/lib/security/app-url";
import { readJsonBodyWithByteLimit } from "@/lib/security/json-body";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/security/rate-limit";

/**
 * Creates a Stripe Checkout Session for a single synced Commerce SKU. Only
 * used once stripe-commerce-products-sync has run for the catalog — the
 * preview page falls back to the Request-order → inquiry stub otherwise.
 * The price is always resolved server-side from the persisted catalog, never
 * trusted from the request body, so a tampered client payload cannot buy a
 * SKU below its stored price.
 *
 * Entitlement must match preview + saveCommerceCatalogAction: paid/live with
 * an uncanceled commerceAddon order (leadEligibleForCommerceCatalog). CRM
 * pause/cancel (#344–#347) hides Buy now on preview but must also fail closed
 * on this create path — catalog+stripePriceId alone is not enough.
 *
 * Records kind=commerce_sku on checkout_sessions so abandoned Buy now carts
 * never enter the bundle recovery queue (wrong Finish-checkout email).
 *
 * The line item carries adjustable_quantity so a shopper can buy more than
 * one unit from Stripe's own hosted Checkout page (there is no in-app cart —
 * PreviewCommerceCatalog's Buy now button posts one skuId per Session) —
 * quantity is otherwise hardcoded to 1 and Stripe shows no quantity stepper
 * at all. Safe with every downstream invariant: the webhook ledgers
 * session.amount_total (not catalogItem.priceCents × quantity) and proves
 * Price identity via the stable commerceSkuStripeKey metadata match, both
 * quantity-agnostic (commerce-checkout-adjustable-quantity).
 *
 * Rate limited per client IP (best-effort, per-instance — see
 * src/lib/security/rate-limit.ts) to blunt scripted checkout-session churn.
 */

interface CommerceCheckoutRequestBody {
  slug?: string;
  skuId?: string;
  customerEmail?: string;
  idempotencyKey?: string;
}

function notConfigured(message: string) {
  return NextResponse.json(
    { error: "Commerce checkout not available", message },
    { status: 501 },
  );
}

export async function POST(request: Request) {
  const clientIp = clientIpFromHeaders(request.headers);
  const rate = checkRateLimit(`commerce-checkout:${clientIp}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests", message: "Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return notConfigured("Set STRIPE_SECRET_KEY to enable Commerce checkout.");
  }

  const parsedBody = await readJsonBodyWithByteLimit<CommerceCheckoutRequestBody>(
    request,
  );
  if (!parsedBody.ok) {
    if (parsedBody.reason === "too_large") {
      return NextResponse.json({ error: "Request body is too large" }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = parsedBody.value;

  // Opaque lookup keys — hard-reject over-length before DB/Stripe (never
  // soft-cap; truncation looks up the wrong row and can still burn quota).
  const parsedSlug = parseCommerceCheckoutSlug(body.slug);
  if (!parsedSlug.ok) {
    if (parsedSlug.reason === "too_long") {
      return NextResponse.json({ error: "slug is too long" }, { status: 400 });
    }
    return NextResponse.json({ error: "slug and skuId are required" }, { status: 400 });
  }
  const parsedSkuId = parseCommerceCheckoutSkuId(body.skuId);
  if (!parsedSkuId.ok) {
    if (parsedSkuId.reason === "too_long") {
      return NextResponse.json({ error: "skuId is too long" }, { status: 400 });
    }
    return NextResponse.json({ error: "slug and skuId are required" }, { status: 400 });
  }
  const slug = parsedSlug.value;
  const skuId = parsedSkuId.value;

  // Same predicate as loadPreviewCommerceItems / saveCommerceCatalogAction —
  // never mint a Session after CRM pause/cancel while UI is hidden.
  const lead = await getLeadBySlug(slug);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  const orders = await listOrdersByLeadSlug(slug);
  if (!leadEligibleForCommerceCatalog(lead, orders)) {
    return NextResponse.json(
      { error: "Commerce catalog not available for this lead" },
      { status: 403 },
    );
  }

  const catalog = await getCommerceCatalog(slug);
  const item = catalog?.items.find((sku) => sku.id === skuId);
  if (!catalog || !item) {
    return NextResponse.json({ error: "Catalog item not found" }, { status: 404 });
  }
  if (!item.stripePriceId) {
    return notConfigured(
      "This item has not been synced to Stripe yet — use Request order instead.",
    );
  }

  // Never trust request.url / Host for Stripe redirect bases — see
  // resolveStripeRedirectAppUrl (Host spoof → post-payment phishing).
  const appUrl = resolveStripeRedirectAppUrl();
  const stripe = new Stripe(secretKey);
  // Soft-cap before Stripe + persist — rate limits blunt count, not size.
  const customerEmail = normalizeCheckoutCustomerEmail(body.customerEmail);
  // Client-minted per-attempt key — see idempotency-key.ts for why this must
  // NOT be a stable server-derived key like the catalog/bootstrap/Connect ones.
  const idempotencyKey = parseClientIdempotencyKey(body.idempotencyKey);

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            price: item.stripePriceId,
            quantity: 1,
            adjustable_quantity: {
              enabled: true,
              minimum: 1,
              maximum: MAX_COMMERCE_LINE_ITEM_QUANTITY,
            },
          },
        ],
        customer_email: customerEmail,
        allow_promotion_codes: true,
        success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${leadPreviewAbsoluteUrl(appUrl, slug)}#catalog`,
        metadata: { slug, skuId, kind: "commerce_sku" },
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe session missing checkout URL" },
        { status: 502 },
      );
    }

    // Track for commerce abandoned-cart recovery (kind discriminator required).
    // When Convex is configured, fail closed (502) rather than return a URL
    // after a SQLite-only write that Convex-first abandoned recovery never sees.
    try {
      await recordCheckoutSessionCreated(
        {
          leadSlug: slug,
          stripeSessionId: session.id,
          tier: "",
          commerceAddon: false,
          customerEmail,
          kind: "commerce_sku",
          skuId,
        },
        CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY,
      );
    } catch (e) {
      if (!(e instanceof ConvexPrimaryWriteError)) {
        console.warn(`Failed to record commerce checkout session ${session.id}`, e);
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
