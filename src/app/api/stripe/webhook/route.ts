import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  clearCommerceOrderDisputed,
  clearCommerceOrderRefunded,
  clearOrderDisputed,
  clearOrderRefunded,
  clearOrdersRecurringCanceledByCustomer,
  getCommerceOrderByStripeSessionId,
  markCheckoutSessionComplete,
  markCheckoutSessionOpen,
  markCommerceOrderDisputed,
  markCommerceOrderRefunded,
  getOrderByStripeSessionId,
  markCompleteOpenBundleCheckoutSessionsForLead,
  markCompleteOpenCommerceCheckoutSessionsForLeadSkuCustomer,
  markOrderDisputed,
  markOrderRefunded,
  markOrdersRecurringCanceledByCustomer,
  recordLeadPayment,
  syncOrdersRecurringEntitlementByCustomer,
} from "@/lib/db";
import { normalizeCheckoutCustomerEmailForMatch } from "@/lib/checkout/abandoned-recovery";
import { stripeCustomerIdFromUnknown } from "@/lib/billing/portal";
import {
  invoicePaidMayRestoreRecurringEntitlement,
  invoicePaymentFailedPausesRecurringEntitlement,
  orderEligibleForPauseNotice,
  orderGrantsSoldCapabilityEntitlement,
  stripeSubscriptionGrantsRecurringEntitlement,
  stripeSubscriptionHasPauseCollection,
  stripeSubscriptionIdFromInvoice,
  stripeSubscriptionPausedAtMs,
  stripeSubscriptionPausesRecurringEntitlement,
  stripeSubscriptionShouldPauseRecurringEntitlement,
  stripeSubscriptionShouldRestoreRecurringEntitlement,
} from "@/lib/orders/recurring";
import {
  deriveLiveRecurringEntitlementFromPriceIds,
  priceIdsFromStripeSubscriptionItems,
  syncedRecurringOrderFields,
} from "@/lib/orders/subscription-entitlement";
import {
  parseCommerceCheckoutSkuId,
  parseCommerceCheckoutSlug,
} from "@/lib/commerce/checkout-fields";
import { parseLeadSlugLookup } from "@/lib/leads/slug";
import { leadPreviewAbsoluteUrl } from "@/lib/leads/slug-path";
import {
  checkRateLimit,
  clientIpFromHeaders,
  type RateLimitConfig,
} from "@/lib/security/rate-limit";
import { isStripeCheckoutCurrencyUsd } from "@/lib/payments/checkout-currency";
import { isStripeCheckoutSessionPaid } from "@/lib/payments/checkout-payment-status";
import {
  chargeHasRefund,
  chargePaymentIntentId,
  disputeStatusClearsDisputeFlag,
  refundChargeId,
  refundStatusReversesRefund,
} from "@/lib/payments/refunds";
import {
  bundleCatalogPriceIdsFromEnv,
  sessionLineItemsIncludeMetadataKey,
  sessionLineItemsMatchBundleCatalogPrices,
} from "@/lib/payments/checkout-price-line-items";
import { commerceSkuStripeKey } from "@/lib/commerce/stripe-sync";
import {
  commerceAddonPriceIdsFromEnv,
  priceIdsFromStripeLineItems,
  resolveCommerceAddonFromLineItems,
} from "@/lib/payments/commerce-addon-line-items";
import { webhookFulfillmentFailureResponse } from "@/lib/payments/webhook-fulfillment";
import {
  expectedBundleCheckoutAmountCents,
  getBundle,
} from "@/lib/pricing/bundles";

/**
 * Stripe webhook receiver — verifies the signature, then acknowledges the
 * events the checkout flow can produce. See /docs/roadmap#phase-3-payments.
 *
 * Required fulfillment writes (bundle payment + handoff, commerce ledger)
 * must succeed or return 5xx so Stripe retries. Email/notify is best-effort
 * after durable writes — do not ACK 200 after swallowing ledger failures.
 * Bundle receipt/DNS emails recover on redelivery via handoff-note sent-markers
 * (planBundleWebhookSideEffects); Commerce client receipts recover via
 * commerceOrders.clientReceiptEmailSentAt (planCommerceWebhookSideEffects) —
 * inquiry presence alone must not skip a failed/suppressed client receipt.
 * Marker writes after a successful send are required (5xx) so retries can skip
 * already-sent mail. sendEmail/sendReceiptEmail/sendCommerceBuyNowClientReceipt
 * never throw on suppression/Resend failure (they resolve { success: false }) —
 * the sent-marker must only be written when result.success is true, or a
 * suppressed/failed send is marked "sent" and never recovers on redelivery.
 *
 * Bundle checkout create already sanitizes+caps slug via
 * resolveBundleCheckoutLeadSlug / sanitizeLeadSlug (MAX_LEAD_SLUG_LENGTH),
 * rejects unknown tiers via getBundle, only sets metadata.commerceAddon when
 * both COMMERCE_ADDON Price IDs are on line_items, and charges only catalog
 * Stripe Price IDs from BUNDLES (+ optional COMMERCE_ADDON) in USD; this
 * handler must mirror slug/tier gates, require BUNDLES setup (+ monthly) env
 * Price IDs on listLineItems, derive commerceAddon from listLineItems Price
 * IDs (never metadata), require session.currency === "usd"
 * (isStripeCheckoutCurrencyUsd), AND require session.amount_total (integer
 * cents) === expectedBundleCheckoutAmountCents(bundle, derivedCommerceAddon)
 * minus session.total_details.amount_discount (Stripe's own server-computed
 * discount from a redeemed allow_promotion_codes promo, never a client-
 * supplied value) before recordLeadPayment / handoff / receipt — a truthy
 * metadata.slug / tier / commerceAddon alone is not enough (Dashboard-minted
 * or tampered Checkout Sessions), and a genuinely promo-discounted session
 * must still fulfill rather than being treated as tampered (bundle-webhook-
 * promotion-code-amount-parity). Over-long slug (parseLeadSlugLookup),
 * unknown tier, missing catalog Prices on line items, non-USD currency, or
 * amount mismatch skips like missing slug/tier (session already marked
 * complete; do not 5xx forever). listLineItems failures return 500 so Stripe
 * retries.
 *
 * Commerce Buy now create already hard-rejects over-long slug via
 * parseCommerceCheckoutSlug, 404s when skuId is not in the lead catalog,
 * requires leadEligibleForCommerceCatalog (getLeadBySlug +
 * listOrdersByLeadSlug), and resolves Price from catalog.stripePriceId
 * (never trusts a client amount; stripe-sync Prices are currency:"usd"); the
 * commerce_sku branch must mirror that slug length gate, CRM entitlement
 * gate, and catalog membership gate (plus parseCommerceCheckoutSkuId
 * length), and require session.currency === "usd" before insertCommerceOrder
 * / inquiry / client receipt — a truthy slug/skuId alone is not enough
 * (unknown ids must not fall back to "Catalog item"; a paused/canceled
 * Commerce subscriber must not ledger pass-through revenue; an over-long
 * slug must not burn getLeadBySlug / getCommerceCatalog).
 *
 * Price verification is by stable metadata key
 * (sessionLineItemsIncludeMetadataKey + commerceSkuStripeKey), NOT by exact
 * match against the catalog's *current* stripePriceId/priceCents
 * (commerce-sku-price-resync-metadata-match) — Stripe Prices are immutable,
 * so an operator editing a SKU's price and re-syncing between Session
 * creation and completion mints a new Price id and overwrites the catalog
 * row, but an already-open Session still legitimately references the OLD
 * (still platform-issued, still valid) Price. Matching only the current
 * stripePriceId/priceCents would silently drop that already-paid sale from
 * the ledger. amountPaidUsd is recorded from the Session's actual
 * session.amount_total (a positive integer cents), never from
 * catalogItem.priceCents, so the ledger reflects what was really charged.
 * Unknown/over-long slug/skuId, missing lead, !leadEligibleForCommerceCatalog,
 * no line item Price carrying the expected metadata key, non-USD currency,
 * or a non-positive/non-integer amount_total all skip like missing skuId
 * (session already marked complete; do not 5xx forever). listLineItems
 * failures return 500 so Stripe retries.
 *
 * Async payment methods (ACH, bank transfer, etc.) fire
 * checkout.session.completed with payment_status !== "paid" while
 * amount_total/currency can still match catalog. Ledger / handoff / receipt
 * must wait for payment_status === "paid" (same event when card settles
 * immediately, or checkout.session.async_payment_succeeded later). Unpaid
 * completed still markCheckoutSessionComplete so abandoned-recovery does
 * not nudge mid-clearing (webhook-checkout-payment-status-paid-gate).
 * checkout.session.async_payment_failed must markCheckoutSessionOpen so a
 * failed ACH cart re-enters Finish-checkout / Buy now recovery (recovery
 * links mint a new Checkout Session — the Stripe Session is terminal).
 *
 * customer.subscription.deleted must markOrdersRecurringCanceledByCustomer by
 * stripeCustomerId (orders.recurringCanceledAt) so canceled Growth/Complete/
 * Commerce subscribers lose marketing/voice/catalog entitlement while keeping
 * stage=paid|live + Billing Portal. Write failures return 5xx
 * (orders_recurring_canceled).
 *
 * customer.subscription.created|updated with status active|trialing must
 * clearOrdersRecurringCanceledByCustomer so Billing Portal / Checkout
 * resubscribers regain packs/catalog — unless pause_collection is set (status
 * stays active while collection is paused; markOrdersRecurringCanceledByCustomer
 * first). past_due|unpaid on the same events (and invoice.payment_failed for
 * subscription invoices) must markOrdersRecurringCanceledByCustomer so failed
 * renewals pause packs before subscription.deleted. invoice.paid is the restore
 * twin of invoice.payment_failed: subscriptions.retrieve then clear only when
 * grants + !pause_collection (blind clear would reopen pause_collection).
 * invoice.payment_failed must re-retrieve before mark so a stale failed after
 * recovery cannot re-pause. Other non-active statuses and missing customer skip
 * (no 5xx). Write failures return 5xx (orders_recurring_reactivated /
 * orders_recurring_canceled). Subscription retrieve failures on invoice twins
 * return 5xx (subscription_retrieve) so Stripe retries.
 *
 * When NEXT_PUBLIC_CONVEX_URL is set, fulfillment writes pass requireConvex so
 * a Convex failure does not silently land only in instance-local SQLite
 * (multi-instance split-brain). Dashboard paths keep the SQLite fallback.
 *
 * charge.refunded (full or partial) must resolve the underlying Checkout
 * Session via stripe.checkout.sessions.list({ payment_intent }) (charges
 * carry no Session id directly) and, when that Session backs a commerceOrders
 * row, mark commerceOrders.refundedAt — a refunded end-customer Buy now sale
 * owes the client nothing, so it must stop counting toward the "owed to
 * client" payout total (listUnpaidCommerceOrders / pipeline-health /
 * Commerce payouts panel), and markCommerceOrderPaidOutAction must reject
 * paying out an order once refundedAt is set. If paidOutAt was already set
 * before the refund arrived, the operator paid the client out of pocket for
 * money Stripe has since returned to the shopper — that is a clawback owed
 * from the client, surfaced via listCommerceOrdersRefunded (uncapped;
 * listUnpaidCommerceOrders drops any row once paidOutAt is set, so it cannot
 * see this case). No payment_intent, no matching Session, or no ledgered
 * commerce order all skip. When the Session backs no commerceOrders row,
 * charge.refunded also checks whether it backs a bundle (Starter/Growth/
 * Complete/Commerce-addon) `orders` row and marks orders.refundedAt there —
 * a refunded bundle purchase must stop counting toward pipeline-health
 * revenueTotalUsd and surface for operator awareness (bundle-order-refund-
 * tracking; no payout-panel double-loss risk on that ledger, so no
 * Mark-paid-out reject / clawback UI, just accurate revenue + visibility).
 * Session-lookup / mark-refunded failures return 5xx
 * (commerce_order_refund_session_lookup / commerce_order_refund /
 * bundle_order_refund) so Stripe retries rather than silently leaving a
 * refund untracked.
 *
 * charge.dispute.created (a chargeback) is the natural follow-up to
 * charge.refunded — Stripe debits the disputed amount from the platform the
 * moment a dispute opens, before any resolution, so it is the same
 * payout-safety exposure. It mirrors the refund handler exactly: resolve the
 * Checkout Session via stripe.checkout.sessions.list({ payment_intent })
 * (Dispute.payment_intent), mark commerceOrders.disputedAt when it backs a
 * ledgered order (idempotent), and markCommerceOrderPaidOutAction rejects
 * paying out a disputed order. Clawback-after-payout surfaces via
 * listCommerceOrdersDisputed (uncapped). When the Session backs no
 * commerceOrders row, also check whether it backs a bundle `orders` row and
 * mark orders.disputedAt (bundle-order-dispute-tracking — visibility +
 * revenueTotalUsd exclusion only; no Mark-paid-out reject / clawback UI).
 * No payment_intent or matching Session skips. Session-lookup / mark-disputed
 * failures return 5xx (commerce_order_dispute_session_lookup /
 * commerce_order_dispute / bundle_order_dispute) so Stripe retries.
 *
 * charge.dispute.closed is the resolution twin: when status is won or
 * warning_closed, clearCommerceOrderDisputed / clearOrderDisputed so Mark paid
 * out and owed totals (commerce) or revenueTotalUsd (bundle) reopen after
 * Stripe reinstates (or never permanently withdrew) funds; when status is
 * lost, ensure disputedAt is set on the matching ledger (created may have
 * been missed). Same Session correlation via payment_intent. Session-lookup /
 * clear / mark-disputed failures return 5xx
 * (commerce_order_dispute_closed_session_lookup / commerce_order_dispute_clear /
 * commerce_order_dispute / bundle_order_dispute_clear / bundle_order_dispute).
 */

/** Webhook revenue path: fail closed when Convex is configured but unreachable. */
const WEBHOOK_CONVEX_PRIMARY = { requireConvex: true } as const;

/**
 * Every other public write route (contact, checkout create, commerce
 * checkout create, billing portal, bootstrap-prices, unsubscribe) gates on
 * checkRateLimit before doing any real work; this route deliberately checks
 * AFTER stripe.webhooks.constructEvent succeeds instead
 * (stripe-webhook-rate-limit-post-verify). clientIpFromHeaders derives its
 * key from x-forwarded-for/x-real-ip, which any direct caller can set to an
 * arbitrary value — and Stripe publishes its webhook-sending IP ranges
 * (stripe.com/docs/ips), so a pre-verification gate keyed on that header lets
 * an attacker impersonate Stripe's IP, burn out the `stripe-webhook:<ip>`
 * bucket with garbage POSTs that fail verification, and then have Stripe's
 * own real redeliveries from that same IP land in the identical
 * already-exhausted bucket and get 429'd before their (valid) signature is
 * ever checked — turning "blunt volumetric abuse" into "deny real
 * fulfillment on demand". Gating only on requests that already produced a
 * cryptographically verified event closes that hole: an attacker without
 * STRIPE_WEBHOOK_SECRET can never reach this check no matter what IP they
 * claim, so the bucket a real Stripe IP lands in is never written to by
 * anyone else. This does mean every request still pays one request.text() +
 * constructEvent() before any throttling applies — unchanged from this
 * route's pre-existing (documented, accepted) unbounded-body trade-off,
 * since Stripe signs the raw payload and a byte ceiling isn't viable here.
 * Sized well above DEFAULT_RATE_LIMIT (20/60s) so a legitimate high-volume
 * merchant's event bursts never trip it; a false-positive 429 is still safe
 * since Stripe retries failed webhook deliveries with backoff.
 */
const STRIPE_WEBHOOK_RATE_LIMIT: RateLimitConfig = { limit: 120, windowMs: 60_000 };

function notConfigured(message: string) {
  return NextResponse.json(
    {
      error: "Stripe webhook not configured",
      message,
      docs: "/docs/roadmap#phase-3-payments",
    },
    { status: 501 },
  );
}

export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    return notConfigured("Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (see .env.example).");
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const payload = await request.text();
  const stripe = new Stripe(secretKey);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown signature verification error";
    return NextResponse.json({ error: "Signature verification failed", message }, { status: 400 });
  }

  // Rate-limit only after signature verification succeeds (stripe-webhook-rate-limit-post-verify)
  // — see STRIPE_WEBHOOK_RATE_LIMIT doc comment for why a pre-verification,
  // IP-keyed gate is unsafe on this specific route.
  const clientIp = clientIpFromHeaders(request.headers);
  const rate = checkRateLimit(`stripe-webhook:${clientIp}`, STRIPE_WEBHOOK_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests", message: "Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;

      // Async methods complete the Session before funds clear. amount_total /
      // currency gates alone are not enough — unpaid completed can still match
      // catalog cents. Do not ledger / handoff / receipt until paid.
      if (!isStripeCheckoutSessionPaid(session.payment_status)) {
        if (event.type === "checkout.session.completed") {
          // Stop abandoned-recovery while ACH/bank transfer is pending.
          try {
            await markCheckoutSessionComplete(session.id, WEBHOOK_CONVEX_PRIMARY);
          } catch (e) {
            console.error(
              `Failed to mark unpaid checkout session ${session.id} complete`,
              e,
            );
            const failure = webhookFulfillmentFailureResponse("checkout_session_mark_complete");
            return NextResponse.json(failure.body, { status: failure.status });
          }
        }
        console.warn(
          `webhook: session ${session.id} event=${event.type} payment_status=${String(
            session.payment_status,
          )} — skipping ledger/handoff/receipt until paid`,
        );
        break;
      }

      const rawSlug = session.metadata?.slug;
      const tier = session.metadata?.tier;
      const metadataCommerceAddon = session.metadata?.commerceAddon === "true";
      const customerEmail = session.customer_details?.email ?? session.customer_email ?? "";
      const stripeCustomerId = stripeCustomerIdFromUnknown(session.customer) ?? undefined;

      // Commerce catalog "Buy now" purchase (stripe-commerce-products-sync) —
      // a paid order for a client's shop item, not a Local Site Studio bundle
      // purchase. There is no lead payment/deploy-handoff to record here;
      // notify the operator through the existing inquiry inbox instead, the
      // same surface Request-order already uses for unsynced SKUs.
      if (session.metadata?.kind === "commerce_sku") {
        const rawOrderSlug = session.metadata.slug;
        const skuId = session.metadata.skuId;
        try {
          await markCheckoutSessionComplete(session.id, WEBHOOK_CONVEX_PRIMARY);
        } catch (e) {
          console.error(`Failed to mark commerce checkout session ${session.id} complete`, e);
          const failure = webhookFulfillmentFailureResponse("checkout_session_mark_complete");
          return NextResponse.json(failure.body, { status: failure.status });
        }
        // Mirror POST /api/commerce/checkout: hard-reject over-long / missing
        // slug before CRM/catalog lookups (never soft-cap opaque keys).
        const parsedSlug = parseCommerceCheckoutSlug(rawOrderSlug);
        if (!parsedSlug.ok) {
          console.warn(
            parsedSlug.reason === "too_long"
              ? `webhook: commerce_sku session ${session.id} over-long slug — skipping ledger/inquiry/client receipt`
              : `webhook: commerce_sku session missing slug metadata ${session.id}`,
          );
          break;
        }
        const orderSlug = parsedSlug.value;
        // Mirror POST /api/commerce/checkout: hard-reject over-long skuId and
        // require catalog membership before ledger/side effects (unknown ids
        // must not fall back to "Catalog item").
        const parsedSkuId = parseCommerceCheckoutSkuId(skuId);
        if (!parsedSkuId.ok) {
          console.warn(
            `webhook: commerce_sku session ${session.id} for ${orderSlug} ${
              parsedSkuId.reason === "too_long" ? "over-long" : "missing"
            } skuId — skipping ledger/inquiry/client receipt`,
          );
          break;
        }
        const knownSkuId = parsedSkuId.value;

        try {
          const {
            getLeadBySlug,
            getCommerceCatalog,
            getCommerceOrderByStripeSessionId,
            insertClientInquiry,
            insertCommerceOrder,
            listCommerceCheckoutInquiriesBySlug,
            listOrdersByLeadSlug,
            markCommerceOrderClientReceiptSent,
          } = await import("@/lib/db");
          const {
            commerceOrderPaidInquiryMessage,
            leadEligibleForCommerceCatalog,
          } = await import("@/lib/commerce/catalog");
          const {
            hasCommerceClientReceiptSentMarker,
            planCommerceWebhookSideEffects,
          } = await import("@/lib/commerce/side-effect-recovery");
          const [lead, catalog] = await Promise.all([
            getLeadBySlug(orderSlug),
            getCommerceCatalog(orderSlug),
          ]);
          // Mirror POST /api/commerce/checkout entitlement: catalog+Price alone
          // is not enough after CRM pause/cancel (#348 create/sync). Missing
          // lead or !leadEligibleForCommerceCatalog → skip like unknown sku
          // (session already markComplete; do not 5xx forever).
          if (!lead) {
            console.warn(
              `webhook: commerce_sku session ${session.id} for ${orderSlug} missing lead — skipping ledger/inquiry/client receipt`,
            );
            break;
          }
          const orders = await listOrdersByLeadSlug(orderSlug);
          if (!leadEligibleForCommerceCatalog(lead, orders)) {
            console.warn(
              `webhook: commerce_sku session ${session.id} for ${orderSlug} CRM entitlement paused/canceled — skipping ledger/inquiry/client receipt`,
            );
            break;
          }
          const catalogItem = catalog?.items.find((item) => item.id === knownSkuId);
          if (!catalogItem) {
            console.warn(
              `webhook: commerce_sku session ${session.id} for ${orderSlug} unknown skuId ${knownSkuId} — skipping ledger/inquiry/client receipt`,
            );
            break;
          }
          // Prove this Session charged a Price this platform minted for this
          // exact leadSlug+skuId — by stable metadata key
          // (commerceSkuStripeKey), NOT by exact-matching the catalog's
          // *current* stripePriceId (commerce-sku-price-resync-metadata-match).
          // Stripe Prices are immutable: an operator editing this SKU's price
          // and re-syncing between Session creation and completion mints a
          // new Price id and overwrites catalog.stripePriceId, but the
          // already-open Session still legitimately references the OLD
          // Price. Matching only the current stripePriceId would reject an
          // already-paid Session outright — real money charged with no
          // ledger row and no abandoned-recovery retry (the Session is
          // already marked complete above).
          const expectedMetadataKey = commerceSkuStripeKey(orderSlug, knownSkuId);
          try {
            const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
              limit: 100,
              expand: ["data.price"],
            });
            if (!sessionLineItemsIncludeMetadataKey(lineItems.data, expectedMetadataKey)) {
              console.warn(
                `webhook: commerce_sku session ${session.id} for ${orderSlug} skuId ${knownSkuId} no line item Price carries metadata key ${expectedMetadataKey} — skipping ledger/inquiry/client receipt`,
              );
              break;
            }
          } catch (lineItemError) {
            console.error(
              `Failed to list line items for commerce_sku Price parity on ${session.id}`,
              lineItemError,
            );
            const failure = webhookFulfillmentFailureResponse("commerce_sku_price_line_items");
            return NextResponse.json(failure.body, { status: failure.status });
          }
          // Mirror Buy now create: stripe-sync Prices are currency:"usd", and
          // amount_total is later divided by 100 into USD dollars. A
          // Dashboard-minted session in another currency with a coincidentally
          // equal minor-unit amount must not skew the Commerce ledger.
          if (!isStripeCheckoutCurrencyUsd(session.currency)) {
            console.warn(
              `webhook: commerce_sku session ${session.id} for ${orderSlug} skuId ${knownSkuId} currency ${String(
                session.currency,
              )} !== usd — skipping ledger/inquiry/client receipt`,
            );
            break;
          }
          // Ledger the amount actually charged (session.amount_total), NOT
          // catalogItem.priceCents — the metadata-key check above already
          // proved the charged Price was platform-issued for this SKU, and
          // that Price may be an older one than the catalog's current price
          // (see the metadata-key comment above). Recording the catalog's
          // current price here instead of the real charge would misstate
          // both the client receipt and the Commerce payouts ledger.
          const amountCents = session.amount_total;
          if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents <= 0) {
            console.warn(
              `webhook: commerce_sku session ${session.id} for ${orderSlug} skuId ${knownSkuId} invalid amount_total ${String(
                amountCents,
              )} — skipping ledger/inquiry/client receipt`,
            );
            break;
          }
          const amountPaidUsd = amountCents / 100;
          const skuName = catalogItem.name;
          const businessName = lead.businessName || orderSlug;

          // Ledger first — commerceOrders is idempotent on stripeSessionId.
          // Inquiry + client receipt are NOT; recover them on Stripe
          // redelivery when missing (session id in inquiry message / receipt
          // sent-marker).

          let alreadyRecorded: boolean;
          try {
            ({ alreadyRecorded } = await insertCommerceOrder(
              {
                leadSlug: orderSlug,
                skuId: knownSkuId,
                skuName,
                amountPaidUsd,
                stripeSessionId: session.id,
              },
              WEBHOOK_CONVEX_PRIMARY,
            ));
          } catch (ledgerError) {
            console.error(
              `Failed to record commerce order ledger for ${orderSlug}`,
              ledgerError,
            );
            const failure = webhookFulfillmentFailureResponse("commerce_order_ledger");
            return NextResponse.json(failure.body, { status: failure.status });
          }

          // Close earlier abandoned open Buy now carts for this shopper + SKU
          // so digest / Send Buy now recovery cannot nudge after pay. Scope by
          // leadSlug+skuId+customerEmail only — never lead+sku alone (multi-
          // shopper). Skip when email is missing. Run only after durable
          // ledger write (mirror bundle after-fulfillment ordering).
          const shopperEmail = normalizeCheckoutCustomerEmailForMatch(customerEmail);
          if (shopperEmail) {
            try {
              await markCompleteOpenCommerceCheckoutSessionsForLeadSkuCustomer(
                orderSlug,
                knownSkuId,
                shopperEmail,
                session.id,
                WEBHOOK_CONVEX_PRIMARY,
              );
            } catch (e) {
              console.error(
                `Failed to close orphan open commerce checkout sessions for ${orderSlug}/${knownSkuId} after ${session.id}`,
                e,
              );
              const failure = webhookFulfillmentFailureResponse(
                "checkout_session_orphan_commerce_cleanup",
              );
              return NextResponse.json(failure.body, { status: failure.status });
            }
          }

          // alreadyRecorded must NOT early-break: if the first delivery
          // wrote the ledger then failed before inquiry/receipt, Stripe
          // retries must still recover those sold-capability notifies.
          // Inquiry idempotency key = stripeSessionId embedded in the
          // inquiry message (commerceOrderPaidInquiryMessage). Receipt
          // idempotency = commerceOrders.clientReceiptEmailSentAt (independent
          // of inquiry — a successful inbox write must not permanently skip a
          // failed/suppressed client order-notification email). Use the
          // uncapped commerce_checkout-only list — listClientInquiriesBySlug's
          // newest 50/200 page can hide an older Buy now notify once
          // contact/Request-order volume exceeds the window.
          const [inquiriesForLead, ledgerOrder] = await Promise.all([
            listCommerceCheckoutInquiriesBySlug(orderSlug),
            getCommerceOrderByStripeSessionId(session.id),
          ]);
          const sideEffects = planCommerceWebhookSideEffects({
            alreadyRecorded,
            inquiriesForLead,
            stripeSessionId: session.id,
            clientReceiptAlreadySent:
              hasCommerceClientReceiptSentMarker(ledgerOrder),
          });

          if (!sideEffects.runInquiry && !sideEffects.runClientReceipt) {
            console.log(
              `Commerce order for ${orderSlug} (${session.id}) ${sideEffects.reason} — skipping duplicate inquiry/client receipt`,
            );
            break;
          }

          if (sideEffects.reason === "redelivery_recovery") {
            console.log(
              `Commerce order for ${orderSlug} (${session.id}) already on ledger — recovering missing inquiry/client receipt`,
            );
          }

          // Inquiry is required after a durable ledger write — ACK 200 here
          // would prevent Stripe retry, so planCommerceWebhookSideEffects
          // recovery never runs for a missing inquiry.
          if (sideEffects.runInquiry) {
            try {
              await insertClientInquiry(
                {
                  leadSlug: orderSlug,
                  businessName,
                  email: customerEmail || undefined,
                  message: commerceOrderPaidInquiryMessage({
                    skuName,
                    amountTotalUsd: amountPaidUsd,
                    stripeSessionId: session.id,
                    skuId: knownSkuId,
                  }),
                  source: "commerce_checkout",
                },
                WEBHOOK_CONVEX_PRIMARY,
              );
            } catch (inquiryError) {
              console.error(
                `Failed to record commerce order inquiry for ${orderSlug}`,
                inquiryError,
              );
              const failure = webhookFulfillmentFailureResponse("commerce_order_inquiry");
              return NextResponse.json(failure.body, { status: failure.status });
            }
          }

          // Commerce sold promise: order notification to the local business
          // (lead.email), not the shopper. Distinct from sendReceiptEmail
          // (bundle buyer) and from Stripe Connect payouts. Send is best-effort
          // on the email itself; durable clientReceiptEmailSentAt after
          // success:true is required (5xx) so Stripe retries can skip already-
          // delivered mail without coupling receipt recovery to inquiry presence.
          if (sideEffects.runClientReceipt) {
            const clientEmail = lead?.email?.trim();
            if (clientEmail) {
              let clientReceiptSendFailed = false;
              try {
                const { sendCommerceBuyNowClientReceipt } = await import(
                  "@/lib/email/resend"
                );
                const baseUrl =
                  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
                const sent = await sendCommerceBuyNowClientReceipt({
                  to: clientEmail,
                  businessName,
                  slug: orderSlug,
                  skuName,
                  amountTotalUsd: amountPaidUsd,
                  stripeSessionId: session.id,
                  customerEmail: customerEmail || undefined,
                  previewUrl: `${leadPreviewAbsoluteUrl(baseUrl, orderSlug)}#catalog`,
                });
                if (sent.success) {
                  try {
                    const marked = await markCommerceOrderClientReceiptSent(
                      session.id,
                      new Date().toISOString(),
                      WEBHOOK_CONVEX_PRIMARY,
                    );
                    if (!marked) {
                      // A concurrent writer (an operator's manual resend, or
                      // another redelivery of this same event) already set
                      // the marker between our read and this write — state
                      // is consistent (already marked sent), so this is not
                      // a fulfillment failure worth a 5xx retry, just a
                      // signal that the send above may have been a duplicate.
                      console.warn(
                        `Commerce client receipt sent-marker for ${orderSlug} was already set by a concurrent writer — this send may have been a duplicate`,
                      );
                    }
                  } catch (markerError) {
                    console.error(
                      `Failed to record commerce client receipt sent-marker for ${orderSlug}`,
                      markerError,
                    );
                    const failure = webhookFulfillmentFailureResponse(
                      "commerce_client_receipt_sent_marker",
                    );
                    return NextResponse.json(failure.body, { status: failure.status });
                  }
                } else {
                  clientReceiptSendFailed = true;
                  console.error(
                    `Commerce client receipt not sent for ${orderSlug} (${sent.reason ?? sent.error ?? "unknown"}) — leaving sent-marker unwritten so redelivery retries`,
                  );
                }
              } catch (emailError) {
                clientReceiptSendFailed = true;
                console.error(
                  `Failed to email commerce client receipt for ${orderSlug}`,
                  emailError,
                );
              }
              if (clientReceiptSendFailed) {
                const failure = webhookFulfillmentFailureResponse(
                  "commerce_client_receipt_send",
                );
                return NextResponse.json(failure.body, { status: failure.status });
              }
            }
          }
        } catch (e) {
          // Failures loading lead/catalog/inquiries before a durable inquiry
          // write must also 5xx — otherwise Stripe never retries and the
          // sold order-notification path is permanently skipped.
          console.error(
            `Failed before commerce order inquiry for ${orderSlug}`,
            e,
          );
          const failure = webhookFulfillmentFailureResponse("commerce_order_inquiry");
          return NextResponse.json(failure.body, { status: failure.status });
        }
        break;
      }

      try {
        await markCheckoutSessionComplete(session.id, WEBHOOK_CONVEX_PRIMARY);
      } catch (e) {
        console.error(`Failed to mark checkout session ${session.id} complete`, e);
        const failure = webhookFulfillmentFailureResponse("checkout_session_mark_complete");
        return NextResponse.json(failure.body, { status: failure.status });
      }

      // Mirror POST /api/stripe/checkout: sanitizeLeadSlug caps at
      // MAX_LEAD_SLUG_LENGTH, getBundle rejects unknown tiers, line_items must
      // include BUNDLES setup (+ monthly) env Prices, commerceAddon follows
      // COMMERCE_ADDON Price IDs on line_items, and amounts match catalog USD.
      // Truthy metadata.slug / tier / commerceAddon alone must not pollute
      // CRM/handoffs or trust a mismatched Stripe amount/Price
      // (slug + tier + catalog Price line-item + commerceAddon line-item +
      // amount-catalog-parity).
      const parsedSlug = parseLeadSlugLookup(rawSlug);
      const slug = parsedSlug.ok ? parsedSlug.slug : undefined;
      const bundle = typeof tier === "string" ? getBundle(tier) : undefined;
      // Orphan open bundle cleanup runs ONLY after catalog gates + durable
      // recordLeadPayment (+ handoff enqueue) succeed below — never on slug
      // parse alone. A paid Session that later skips (unknown tier / wrong
      // Prices / non-USD / amount mismatch) must leave sibling open carts in
      // Finish-checkout / digest recovery (bundle-orphan-cleanup-after-catalog-fulfillment).
      if (slug && bundle) {
        const knownTier = bundle.id;

        // Mirror create-path: require BUNDLES catalog Prices on line_items,
        // and derive commerceAddon only when both COMMERCE_ADDON Price IDs are
        // present. Never trust metadata — amount parity below must use the
        // derived flag too.
        let commerceAddon = false;
        let lineItemPriceIds: string[] = [];
        try {
          const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
            limit: 100,
          });
          lineItemPriceIds = priceIdsFromStripeLineItems(lineItems.data);
          const resolved = resolveCommerceAddonFromLineItems({
            metadataCommerceAddon,
            lineItemPriceIds,
            commercePrices: commerceAddonPriceIdsFromEnv(),
          });
          commerceAddon = resolved.commerceAddon;
          if (resolved.metadataMismatch) {
            console.warn(
              `webhook: bundle session ${session.id} commerceAddon metadata=${metadataCommerceAddon} lineItems=${commerceAddon} — using line items`,
            );
          }
        } catch (lineItemError) {
          console.error(
            `Failed to list line items for catalog Price / commerceAddon parity on ${session.id}`,
            lineItemError,
          );
          const failure = webhookFulfillmentFailureResponse("bundle_commerce_addon_line_items");
          return NextResponse.json(failure.body, { status: failure.status });
        }

        const catalogPrices = bundleCatalogPriceIdsFromEnv(bundle);
        if (
          !catalogPrices ||
          !sessionLineItemsMatchBundleCatalogPrices(lineItemPriceIds, catalogPrices)
        ) {
          console.warn(
            `webhook: bundle session ${session.id} for ${slug} tier ${knownTier} catalog Price IDs not on line items — skipping payment/handoff/receipt`,
          );
          break;
        }

        // Mirror bundle create: catalog Prices are USD; amount_total is later
        // divided by 100 into USD dollars. Non-USD currency must not reach the
        // ledger even when minor units match expectedBundleCheckoutAmountCents.
        if (!isStripeCheckoutCurrencyUsd(session.currency)) {
          console.warn(
            `webhook: bundle session ${session.id} for ${slug} tier ${knownTier} currency ${String(
              session.currency,
            )} !== usd — skipping payment/handoff/receipt`,
          );
          break;
        }

        // allow_promotion_codes is enabled on the create path (checkout-allow-
        // promotion-codes), so a genuinely-discounted session's amount_total is
        // LESS than the full catalog price. Reconcile against Stripe's own
        // total_details.amount_discount (computed server-side from the actual
        // redeemed promotion code, not client-supplied) rather than requiring
        // exact equality to the undiscounted catalog price — a tampered/
        // mismatched amount with no corresponding Stripe-verified discount
        // still fails this check exactly as before.
        const expectedCents = expectedBundleCheckoutAmountCents(bundle, commerceAddon);
        const amountCents = session.amount_total;
        const discountCents = session.total_details?.amount_discount ?? 0;
        const expectedAfterDiscountCents = Math.max(0, expectedCents - discountCents);
        if (
          typeof amountCents !== "number" ||
          !Number.isInteger(amountCents) ||
          !Number.isInteger(discountCents) ||
          discountCents < 0 ||
          amountCents !== expectedAfterDiscountCents
        ) {
          console.warn(
            `webhook: bundle session ${session.id} for ${slug} tier ${knownTier} amount_total ${String(
              amountCents,
            )} !== catalog expectedCents ${expectedCents} minus amount_discount ${discountCents} (commerceAddon=${String(
              commerceAddon,
            )}) — skipping payment/handoff/receipt`,
          );
          break;
        }
        const amountTotal = amountCents / 100;
        let alreadyRecorded: boolean;
        let handoff: Awaited<
          ReturnType<typeof import("@/lib/deploy/handoff").enqueueProductionHandoff>
        >;
        let businessName: string;
        try {
          ({ alreadyRecorded } = await recordLeadPayment(
            {
              slug,
              stripeSessionId: session.id,
              customerEmail,
              tier: knownTier,
              commerceAddon,
              amountTotal,
              stripeCustomerId,
            },
            WEBHOOK_CONVEX_PRIMARY,
          ));

          // Always enqueue the production handoff — it is idempotent on
          // slug + stripeSessionId. alreadyRecorded must NOT skip this:
          // if the first delivery recorded the order but crashed before
          // handoff enqueue, a Stripe retry is the only recovery path.
          const { getLeadBySlug } = await import("@/lib/db");
          const { enqueueProductionHandoff } = await import("@/lib/deploy/handoff");
          const lead = await getLeadBySlug(slug);
          businessName = lead?.businessName || slug;
          handoff = await enqueueProductionHandoff(
            {
              leadSlug: slug,
              businessName,
              tier: knownTier,
              commerceAddon,
              stripeSessionId: session.id,
              customerEmail,
            },
            WEBHOOK_CONVEX_PRIMARY,
          );
          console.log(
            `Production handoff queued for ${slug}: ${handoff.status} → ${handoff.suggestedHost}`,
          );
        } catch (dbError) {
          console.error(`Failed to record lead payment or enqueue handoff for ${slug}:`, dbError);
          const failure = webhookFulfillmentFailureResponse("bundle_payment_or_handoff");
          return NextResponse.json(failure.body, { status: failure.status });
        }

        // Close earlier abandoned open *bundle* carts for this lead so
        // Finish-checkout / digest cannot nudge after a later Session pays.
        // Never commerce_sku (multi-shopper). Only after durable payment —
        // skip paths above must not kill recovery. Starter→Growth after pay
        // mints a new Session. alreadyRecorded retries still run cleanup
        // (idempotent) if the first delivery crashed before this step.
        try {
          await markCompleteOpenBundleCheckoutSessionsForLead(
            slug,
            session.id,
            WEBHOOK_CONVEX_PRIMARY,
          );
        } catch (e) {
          console.error(
            `Failed to close orphan open bundle checkout sessions for ${slug} after ${session.id}`,
            e,
          );
          const failure = webhookFulfillmentFailureResponse(
            "checkout_session_orphan_bundle_cleanup",
          );
          return NextResponse.json(failure.body, { status: failure.status });
        }

        // alreadyRecorded must NOT early-break past buyer emails: if the first
        // delivery recorded payment/handoff then failed before Resend, Stripe
        // retries must still recover receipt + DNS handoff emails. Durable
        // sent-markers live on handoff.notes (per stripeSessionId) — twin of
        // planCommerceWebhookSideEffects for Commerce Buy now.
        const {
          planBundleWebhookSideEffects,
          bundleReceiptEmailSentNote,
          bundleDnsHandoffEmailSentNote,
        } = await import("@/lib/payments/bundle-side-effect-recovery");
        const { updateDeployHandoffStatus } = await import("@/lib/db");

        let handoffNotes = handoff.notes;
        const sideEffects = planBundleWebhookSideEffects({
          alreadyRecorded,
          handoffNotes,
          stripeSessionId: session.id,
          hasCustomerEmail: Boolean(customerEmail),
        });

        if (!sideEffects.runReceiptEmail && !sideEffects.runDnsHandoffEmail) {
          console.log(
            `Payment for ${slug} (${session.id}) ${sideEffects.reason} — skipping duplicate emails (handoff ensured)`,
          );
          break;
        }

        if (sideEffects.reason === "redelivery_recovery") {
          console.log(
            `Payment for ${slug} (${session.id}) already recorded — recovering missing receipt/DNS email(s)`,
          );
        } else if (!alreadyRecorded) {
          console.log(`Payment successfully recorded for lead ${slug}`);
        }

        // Receipt / DNS emails — durable note marker after each successful send
        // so redelivery can skip only what already went out. Send and marker
        // failures return 5xx so Stripe retries (accept one possible duplicate
        // rather than permanently losing a paid notification).
        try {
          const { sendReceiptEmail, sendEmail } = await import("@/lib/email/resend");
          const { formatDnsInstructionsForEmail } = await import("@/lib/deploy/handoff");
          const { brand } = await import("@/lib/brand");
          const { escapeHtmlForEmail } = await import("@/lib/inquiries/reply");

          let emailSendFailed = false;
          if (sideEffects.runReceiptEmail && customerEmail) {
            try {
              const sent = await sendReceiptEmail(
                customerEmail,
                businessName,
                knownTier,
                amountTotal,
              );
              if (sent.success) {
                try {
                  const updated = await updateDeployHandoffStatus(
                    slug,
                    handoff.status,
                    [bundleReceiptEmailSentNote(session.id)],
                    WEBHOOK_CONVEX_PRIMARY,
                  );
                  if (updated) {
                    handoffNotes = updated.notes;
                    handoff = updated;
                  }
                } catch (markerError) {
                  console.error(
                    `Failed to record bundle receipt sent-marker for ${slug}`,
                    markerError,
                  );
                  const failure = webhookFulfillmentFailureResponse("bundle_email_sent_marker");
                  return NextResponse.json(failure.body, { status: failure.status });
                }
              } else {
                emailSendFailed = true;
                console.error(
                  `Receipt email not sent for ${slug} (${sent.reason ?? sent.error ?? "unknown"}) — leaving sent-marker unwritten so redelivery retries`,
                );
              }
            } catch (emailError) {
              emailSendFailed = true;
              console.error(`Failed to send receipt email for ${slug}:`, emailError);
            }
          }

          if (sideEffects.runDnsHandoffEmail && customerEmail) {
            try {
              const safeBiz = escapeHtmlForEmail(businessName);
              const safeBrand = escapeHtmlForEmail(brand.name);
              const sent = await sendEmail({
                to: customerEmail,
                subject: `Next steps: go live with ${businessName} — ${brand.name}`,
                leadSlug: slug,
                // Transactional post-payment handoff — do not honor marketing
                // suppression (cold-outreach unsubscribe must not block DNS).
                skipSuppression: true,
                html: `
                <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">Your site is ready to publish</h2>
                <p style="margin-bottom: 16px;">Payment received for <strong>${safeBiz}</strong>. Here is your production handoff:</p>
                ${formatDnsInstructionsForEmail(handoff)}
                <p style="margin-bottom: 8px;">Reply to this email if you want us to finish DNS for you.</p>
                <p style="font-weight: 500; margin-top: 0;">The ${safeBrand} Team</p>
              `,
              });
              if (sent.success) {
                try {
                  await updateDeployHandoffStatus(
                    slug,
                    handoff.status,
                    [bundleDnsHandoffEmailSentNote(session.id)],
                    WEBHOOK_CONVEX_PRIMARY,
                  );
                } catch (markerError) {
                  console.error(
                    `Failed to record bundle DNS handoff sent-marker for ${slug}`,
                    markerError,
                  );
                  const failure = webhookFulfillmentFailureResponse("bundle_email_sent_marker");
                  return NextResponse.json(failure.body, { status: failure.status });
                }
              } else {
                emailSendFailed = true;
                console.error(
                  `DNS handoff email not sent for ${slug} (${sent.reason ?? sent.error ?? "unknown"}) — leaving sent-marker unwritten so redelivery retries`,
                );
              }
            } catch (emailError) {
              emailSendFailed = true;
              console.error(`Failed to send DNS handoff email for ${slug}:`, emailError);
            }
          }
          if (emailSendFailed) {
            const failure = webhookFulfillmentFailureResponse("bundle_email_send");
            return NextResponse.json(failure.body, { status: failure.status });
          }
        } catch (emailError) {
          console.error(`Failed to send receipt/DNS emails for ${slug}:`, emailError);
          const failure = webhookFulfillmentFailureResponse("bundle_email_send");
          return NextResponse.json(failure.body, { status: failure.status });
        }
      } else if (slug && tier) {
        console.warn(
          "webhook: unknown bundle tier in session metadata",
          session.id,
          tier,
        );
      } else if (!parsedSlug.ok && parsedSlug.reason === "too_long") {
        console.warn(
          "webhook: over-long bundle slug in session metadata — skipping payment/handoff/receipt",
          session.id,
        );
      } else {
        console.warn("webhook: missing slug or tier in session metadata", session.id);
      }
      break;
    }
    case "checkout.session.async_payment_failed": {
      // Unpaid completed marked the local row complete (stop recovery while
      // ACH cleared). A failed async payment must reopen so Finish-checkout /
      // Buy now recovery can nudge a retry — leaving status=complete forever
      // permanently drops that retry revenue.
      const session = event.data.object as Stripe.Checkout.Session;
      try {
        await markCheckoutSessionOpen(session.id, WEBHOOK_CONVEX_PRIMARY);
      } catch (e) {
        console.error(
          `Failed to reopen checkout session ${session.id} after async_payment_failed`,
          e,
        );
        const failure = webhookFulfillmentFailureResponse("checkout_session_mark_open");
        return NextResponse.json(failure.body, { status: failure.status });
      }
      console.warn(
        `webhook: session ${session.id} async_payment_failed — reopened for abandoned-recovery`,
      );
      break;
    }
    case "customer.subscription.deleted": {
      // Billing Portal cancel ends the Stripe Subscription. Without CRM sync,
      // Growth/Complete/Commerce orders keep marketing-pack / voice-pack /
      // commerce-catalog entitlement forever. Mark recurringCanceledAt by
      // stripeCustomerId; keep stage=paid|live + Billing Portal.
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = stripeCustomerIdFromUnknown(subscription.customer);
      if (!customerId) {
        console.warn(
          `webhook: customer.subscription.deleted ${subscription.id} missing customer — skipping CRM sync`,
        );
        break;
      }
      const canceledAt =
        typeof subscription.ended_at === "number" &&
        Number.isFinite(subscription.ended_at) &&
        subscription.ended_at > 0
          ? subscription.ended_at * 1000
          : Date.now();
      try {
        const updated = await markOrdersRecurringCanceledByCustomer(
          customerId,
          canceledAt,
          WEBHOOK_CONVEX_PRIMARY,
        );
        console.warn(
          `webhook: customer.subscription.deleted ${subscription.id} customer=${customerId} marked ${updated} order(s) recurring-canceled`,
        );
      } catch (e) {
        console.error(
          `Failed to mark recurring canceled for customer ${customerId} after subscription ${subscription.id}`,
          e,
        );
        const failure = webhookFulfillmentFailureResponse("orders_recurring_canceled");
        return NextResponse.json(failure.body, { status: failure.status });
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      // Twin of subscription.deleted: Billing Portal / Checkout resubscribe
      // mints an active Subscription for a customer whose CRM orders still
      // carry recurringCanceledAt — clear so packs/catalog resume. past_due|
      // unpaid pause packs (failed renewal before cancel). pause_collection
      // also pauses even when status stays active|trialing (must run before
      // the grants clear). Skip canceled/incomplete (deleted handles cancel;
      // incomplete is pre-pay).
      const subscription = event.data.object as Stripe.Subscription;
      const collectionPaused = stripeSubscriptionHasPauseCollection(
        subscription.pause_collection,
      );
      // pause_collection has no invoice twin at all (no charge is ever
      // attempted), unlike past_due/unpaid which invoice.payment_failed's
      // dunning notice already covers — see subscription-pause-collection-
      // notice. Only notify when THIS event actually changed pause_collection
      // (Stripe's previous_attributes only lists fields that changed), so an
      // unrelated subscription.updated while already paused/unpaused does not
      // re-send, and an ordinary past_due/unpaid pause/restore (already
      // covered by the invoice.* notice pair) does not double-email.
      const pauseCollectionJustChanged = Boolean(
        event.data.previous_attributes &&
          Object.prototype.hasOwnProperty.call(
            event.data.previous_attributes,
            "pause_collection",
          ),
      );
      const grants =
        !collectionPaused &&
        stripeSubscriptionGrantsRecurringEntitlement(subscription.status);
      const pauses =
        collectionPaused ||
        stripeSubscriptionPausesRecurringEntitlement(subscription.status);
      if (!grants && !pauses) {
        break;
      }
      const customerId = stripeCustomerIdFromUnknown(subscription.customer);
      if (!customerId) {
        console.warn(
          `webhook: ${event.type} ${subscription.id} missing customer — skipping CRM ${
            grants ? "reactivate" : "pause"
          }`,
        );
        break;
      }
      if (grants) {
        // Restore only when a create-path catalog recurring Price is on the
        // Subscription — active foreign Prices must not clear pause or keep
        // Complete/Commerce CRM unlock after a Billing Portal downgrade.
        const itemPriceIds = priceIdsFromStripeSubscriptionItems(
          subscription.items?.data ?? [],
        );
        const live = deriveLiveRecurringEntitlementFromPriceIds(itemPriceIds);
        const synced = syncedRecurringOrderFields(live);
        if (!synced) {
          const pausedAt = stripeSubscriptionPausedAtMs(subscription, Date.now());
          try {
            const updated = await markOrdersRecurringCanceledByCustomer(
              customerId,
              pausedAt,
              WEBHOOK_CONVEX_PRIMARY,
            );
            console.warn(
              `webhook: ${event.type} ${subscription.id} customer=${customerId} status=${subscription.status} no catalog recurring Price on items — paused recurring entitlement on ${updated} order(s)`,
            );
          } catch (e) {
            console.error(
              `Failed to pause recurring entitlement for customer ${customerId} after ${event.type} ${subscription.id} (no catalog Price)`,
              e,
            );
            const failure = webhookFulfillmentFailureResponse("orders_recurring_canceled");
            return NextResponse.json(failure.body, { status: failure.status });
          }
          break;
        }
        let cleared = 0;
        try {
          cleared = await clearOrdersRecurringCanceledByCustomer(
            customerId,
            WEBHOOK_CONVEX_PRIMARY,
          );
          const syncedCount = await syncOrdersRecurringEntitlementByCustomer(
            customerId,
            synced,
            WEBHOOK_CONVEX_PRIMARY,
          );
          console.warn(
            `webhook: ${event.type} ${subscription.id} customer=${customerId} status=${subscription.status} cleared recurringCanceledAt on ${cleared} order(s); synced tier=${synced.tier} commerceAddon=${synced.commerceAddon} on ${syncedCount} order(s)`,
          );
        } catch (e) {
          console.error(
            `Failed to restore/sync recurring entitlement for customer ${customerId} after ${event.type} ${subscription.id}`,
            e,
          );
          const failure = webhookFulfillmentFailureResponse("orders_recurring_reactivated");
          return NextResponse.json(failure.body, { status: failure.status });
        }

        // Customer-facing resume notice — best-effort, only when this event
        // actually cleared a prior pause (cleared > 0) AND that pause was
        // specifically pause_collection (pauseCollectionJustChanged) — an
        // ordinary past_due/unpaid recovery is already confirmed by
        // sendPaymentRecoveredNotice from invoice.paid, and firing here too
        // would double-email the same recovery (see subscription-pause-
        // collection-notice). The durable clear/sync above already
        // succeeded, so a notify failure here must not turn it into a
        // 5xx/retry loop.
        if (cleared > 0 && pauseCollectionJustChanged) {
          try {
            const { getOrdersByStripeCustomerId, getLeadBySlug } = await import("@/lib/db");
            const orders = await getOrdersByStripeCustomerId(customerId);
            const recurringOrder = orders.find((order) =>
              orderGrantsSoldCapabilityEntitlement(order),
            );
            if (recurringOrder) {
              const lead = await getLeadBySlug(recurringOrder.leadSlug);
              if (lead?.email) {
                const { sendSubscriptionResumedNotice } = await import("@/lib/email/resend");
                const sent = await sendSubscriptionResumedNotice({
                  to: lead.email,
                  businessName: lead.businessName,
                  slug: recurringOrder.leadSlug,
                  stripeSessionId: recurringOrder.stripeSessionId,
                });
                if (!sent.success) {
                  console.warn(
                    `webhook: ${event.type} ${subscription.id} subscription-resumed notice not sent for ${recurringOrder.leadSlug} (${sent.reason ?? sent.error ?? "unknown"})`,
                  );
                }
              }
            }
          } catch (e) {
            console.error(
              `Failed to send subscription-resumed notice for customer ${customerId} after ${event.type} ${subscription.id}`,
              e,
            );
          }
        }
        break;
      }
      const pausedAt = stripeSubscriptionPausedAtMs(subscription, Date.now());
      let updated = 0;
      try {
        updated = await markOrdersRecurringCanceledByCustomer(
          customerId,
          pausedAt,
          WEBHOOK_CONVEX_PRIMARY,
        );
        console.warn(
          `webhook: ${event.type} ${subscription.id} customer=${customerId} status=${subscription.status}${
            collectionPaused ? " pause_collection" : ""
          } paused recurring entitlement on ${updated} order(s)`,
        );
      } catch (e) {
        console.error(
          `Failed to pause recurring entitlement for customer ${customerId} after ${event.type} ${subscription.id}`,
          e,
        );
        const failure = webhookFulfillmentFailureResponse("orders_recurring_canceled");
        return NextResponse.json(failure.body, { status: failure.status });
      }

      // Customer-facing pause notice — best-effort, only for the
      // pause_collection axis (see subscription-pause-collection-notice): an
      // ordinary past_due/unpaid pause is already covered by
      // sendPaymentFailedNotice from invoice.payment_failed, so firing here
      // too would double-email the same failed-renewal event. pause_collection
      // has no invoice event at all — it is the one pause reason with zero
      // existing customer signal. The durable pause write above already
      // succeeded, so a notify failure here must not turn it into a 5xx/retry
      // loop. Also require updated > 0 (subscription-pause-collection-notice-
      // redelivery-dedup): unlike invoice.payment_failed's dunning notice
      // (which intentionally re-sends once per Smart Retry attempt with no
      // dedup marker), pause_collection has no such "new attempt" concept —
      // every real toggle transitions recurringCanceledAt from unset, so
      // Stripe redelivering the identical event (its previous_attributes is
      // baked into the event payload and stays "changed" on every replay)
      // would otherwise re-send this notice on every redelivery once the
      // pause write has already gone through and the row is no longer NULL.
      if (collectionPaused && pauseCollectionJustChanged && updated > 0) {
        try {
          const { getOrdersByStripeCustomerId, getLeadBySlug } = await import("@/lib/db");
          const orders = await getOrdersByStripeCustomerId(customerId);
          const recurringOrder = orders.find((order) => orderEligibleForPauseNotice(order));
          if (recurringOrder) {
            const lead = await getLeadBySlug(recurringOrder.leadSlug);
            if (lead?.email) {
              const { sendSubscriptionPausedNotice } = await import("@/lib/email/resend");
              const sent = await sendSubscriptionPausedNotice({
                to: lead.email,
                businessName: lead.businessName,
                slug: recurringOrder.leadSlug,
                stripeSessionId: recurringOrder.stripeSessionId,
              });
              if (!sent.success) {
                console.warn(
                  `webhook: ${event.type} ${subscription.id} subscription-paused notice not sent for ${recurringOrder.leadSlug} (${sent.reason ?? sent.error ?? "unknown"})`,
                );
              }
            }
          }
        } catch (e) {
          console.error(
            `Failed to send subscription-paused notice for customer ${customerId} after ${event.type} ${subscription.id}`,
            e,
          );
        }
      }
      break;
    }
    case "invoice.payment_failed": {
      // Failed subscription renewal often races subscription.updated past_due.
      // Pause CRM packs/catalog on the invoice event too so entitlement does
      // not lag if the subscription status webhook is delayed. Re-retrieve the
      // Subscription before mark — a stale/out-of-order payment_failed after
      // recovery must not re-pause when status already grants. One-time
      // invoices (no subscription) skip.
      const invoice = event.data.object as Stripe.Invoice;
      if (!invoicePaymentFailedPausesRecurringEntitlement(invoice)) {
        break;
      }
      const subscriptionId = stripeSubscriptionIdFromInvoice(invoice);
      if (!subscriptionId) {
        break;
      }
      let subscription: Stripe.Subscription;
      try {
        subscription = await stripe.subscriptions.retrieve(subscriptionId);
      } catch (e) {
        console.error(
          `Failed to retrieve subscription ${subscriptionId} for invoice.payment_failed ${invoice.id}`,
          e,
        );
        const failure = webhookFulfillmentFailureResponse("subscription_retrieve");
        return NextResponse.json(failure.body, { status: failure.status });
      }
      if (!stripeSubscriptionShouldPauseRecurringEntitlement(subscription)) {
        console.warn(
          `webhook: invoice.payment_failed ${invoice.id} subscription=${subscriptionId} status=${subscription.status} — skipping CRM pause (already grants or not pause-eligible)`,
        );
        break;
      }
      const customerId =
        stripeCustomerIdFromUnknown(invoice.customer) ??
        stripeCustomerIdFromUnknown(subscription.customer);
      if (!customerId) {
        console.warn(
          `webhook: invoice.payment_failed ${invoice.id} missing customer — skipping CRM pause`,
        );
        break;
      }
      const pausedAt =
        typeof invoice.created === "number" &&
        Number.isFinite(invoice.created) &&
        invoice.created > 0
          ? invoice.created * 1000
          : Date.now();
      try {
        const updated = await markOrdersRecurringCanceledByCustomer(
          customerId,
          pausedAt,
          WEBHOOK_CONVEX_PRIMARY,
        );
        console.warn(
          `webhook: invoice.payment_failed ${invoice.id} customer=${customerId} subscription=${subscriptionId} status=${subscription.status} paused recurring entitlement on ${updated} order(s)`,
        );
      } catch (e) {
        console.error(
          `Failed to pause recurring entitlement for customer ${customerId} after invoice.payment_failed ${invoice.id}`,
          e,
        );
        const failure = webhookFulfillmentFailureResponse("orders_recurring_canceled");
        return NextResponse.json(failure.body, { status: failure.status });
      }

      // Customer-facing dunning notice — best-effort. The durable CRM pause
      // above already succeeded, so a notify failure here must not turn it
      // into a 5xx/retry loop (see recurring-payment-failed-dunning-notice);
      // Stripe fires a new invoice.payment_failed per Smart Retry attempt, so
      // this naturally sends once per attempt without its own dedup marker.
      try {
        const { getOrdersByStripeCustomerId, getLeadBySlug } = await import("@/lib/db");
        const orders = await getOrdersByStripeCustomerId(customerId);
        const recurringOrder = orders.find((order) => orderEligibleForPauseNotice(order));
        if (recurringOrder) {
          const lead = await getLeadBySlug(recurringOrder.leadSlug);
          if (lead?.email) {
            const { sendPaymentFailedNotice } = await import("@/lib/email/resend");
            const sent = await sendPaymentFailedNotice({
              to: lead.email,
              businessName: lead.businessName,
              slug: recurringOrder.leadSlug,
              stripeSessionId: recurringOrder.stripeSessionId,
            });
            if (!sent.success) {
              console.warn(
                `webhook: invoice.payment_failed ${invoice.id} payment-failed notice not sent for ${recurringOrder.leadSlug} (${sent.reason ?? sent.error ?? "unknown"})`,
              );
            }
          }
        }
      } catch (e) {
        console.error(
          `Failed to send payment-failed notice for customer ${customerId} after invoice.payment_failed ${invoice.id}`,
          e,
        );
      }
      break;
    }
    case "invoice.paid": {
      // Restore twin of invoice.payment_failed: #346 pauses on failed so packs
      // do not lag delayed subscription.updated past_due — invoice.paid must
      // clear the same way when payment recovers, or a paying customer stays
      // recurringCanceledAt-paused until a later subscription.updated. Retrieve
      // first; clear only when grants + !pause_collection (blind clear would
      // reopen the pause_collection hole). One-time invoices skip.
      const invoice = event.data.object as Stripe.Invoice;
      if (!invoicePaidMayRestoreRecurringEntitlement(invoice)) {
        break;
      }
      const subscriptionId = stripeSubscriptionIdFromInvoice(invoice);
      if (!subscriptionId) {
        break;
      }
      let subscription: Stripe.Subscription;
      try {
        subscription = await stripe.subscriptions.retrieve(subscriptionId);
      } catch (e) {
        console.error(
          `Failed to retrieve subscription ${subscriptionId} for invoice.paid ${invoice.id}`,
          e,
        );
        const failure = webhookFulfillmentFailureResponse("subscription_retrieve");
        return NextResponse.json(failure.body, { status: failure.status });
      }
      if (!stripeSubscriptionShouldRestoreRecurringEntitlement(subscription)) {
        console.warn(
          `webhook: invoice.paid ${invoice.id} subscription=${subscriptionId} status=${subscription.status}${
            stripeSubscriptionHasPauseCollection(subscription.pause_collection)
              ? " pause_collection"
              : ""
          } — skipping CRM restore`,
        );
        break;
      }
      const customerId =
        stripeCustomerIdFromUnknown(invoice.customer) ??
        stripeCustomerIdFromUnknown(subscription.customer);
      if (!customerId) {
        console.warn(
          `webhook: invoice.paid ${invoice.id} missing customer — skipping CRM restore`,
        );
        break;
      }
      // Same catalog-Price gate + tier/commerceAddon sync as subscription.updated
      // grants — invoice.paid must not restore Complete/Commerce CRM unlock when
      // the live Subscription no longer carries those monthly Prices.
      const itemPriceIds = priceIdsFromStripeSubscriptionItems(
        subscription.items?.data ?? [],
      );
      const live = deriveLiveRecurringEntitlementFromPriceIds(itemPriceIds);
      const synced = syncedRecurringOrderFields(live);
      if (!synced) {
        const pausedAt =
          typeof invoice.created === "number" &&
          Number.isFinite(invoice.created) &&
          invoice.created > 0
            ? invoice.created * 1000
            : Date.now();
        try {
          const updated = await markOrdersRecurringCanceledByCustomer(
            customerId,
            pausedAt,
            WEBHOOK_CONVEX_PRIMARY,
          );
          console.warn(
            `webhook: invoice.paid ${invoice.id} customer=${customerId} subscription=${subscriptionId} status=${subscription.status} no catalog recurring Price on items — paused recurring entitlement on ${updated} order(s)`,
          );
        } catch (e) {
          console.error(
            `Failed to pause recurring entitlement for customer ${customerId} after invoice.paid ${invoice.id} (no catalog Price)`,
            e,
          );
          const failure = webhookFulfillmentFailureResponse("orders_recurring_canceled");
          return NextResponse.json(failure.body, { status: failure.status });
        }
        break;
      }
      let cleared = 0;
      try {
        cleared = await clearOrdersRecurringCanceledByCustomer(
          customerId,
          WEBHOOK_CONVEX_PRIMARY,
        );
        const syncedCount = await syncOrdersRecurringEntitlementByCustomer(
          customerId,
          synced,
          WEBHOOK_CONVEX_PRIMARY,
        );
        console.warn(
          `webhook: invoice.paid ${invoice.id} customer=${customerId} subscription=${subscriptionId} status=${subscription.status} cleared recurringCanceledAt on ${cleared} order(s); synced tier=${synced.tier} commerceAddon=${synced.commerceAddon} on ${syncedCount} order(s)`,
        );
      } catch (e) {
        console.error(
          `Failed to restore/sync recurring entitlement for customer ${customerId} after invoice.paid ${invoice.id}`,
          e,
        );
        const failure = webhookFulfillmentFailureResponse("orders_recurring_reactivated");
        return NextResponse.json(failure.body, { status: failure.status });
      }

      // Customer-facing recovery confirmation — best-effort, and only when
      // this event actually cleared a prior pause (cleared > 0). Every other
      // invoice.paid (ordinary healthy renewal) must stay silent — sending
      // "service resumed" on a subscription that was never paused would be
      // confusing noise, not a useful signal. The durable clear/sync above
      // already succeeded, so a notify failure here must not turn it into a
      // 5xx/retry loop (see payment-recovered-confirmation-notice, the
      // restore twin of recurring-payment-failed-dunning-notice).
      if (cleared > 0) {
        try {
          const { getOrdersByStripeCustomerId, getLeadBySlug } = await import("@/lib/db");
          const orders = await getOrdersByStripeCustomerId(customerId);
          const recurringOrder = orders.find((order) =>
            orderGrantsSoldCapabilityEntitlement(order),
          );
          if (recurringOrder) {
            const lead = await getLeadBySlug(recurringOrder.leadSlug);
            if (lead?.email) {
              const { sendPaymentRecoveredNotice } = await import("@/lib/email/resend");
              const sent = await sendPaymentRecoveredNotice({
                to: lead.email,
                businessName: lead.businessName,
                slug: recurringOrder.leadSlug,
                stripeSessionId: recurringOrder.stripeSessionId,
              });
              if (!sent.success) {
                console.warn(
                  `webhook: invoice.paid ${invoice.id} payment-recovered notice not sent for ${recurringOrder.leadSlug} (${sent.reason ?? sent.error ?? "unknown"})`,
                );
              }
            }
          }
        } catch (e) {
          console.error(
            `Failed to send payment-recovered notice for customer ${customerId} after invoice.paid ${invoice.id}`,
            e,
          );
        }
      }
      break;
    }
    case "charge.refunded": {
      // A refunded (full or partial) commerce_sku Buy now charge owes the
      // client nothing — this order must stop counting toward the "owed to
      // client" payout total, and if the operator already marked it paid out
      // before the refund landed, the app must flag it for clawback rather
      // than silently losing that fact (commerce-order-refund-clawback-tracking).
      // A refunded bundle (Starter/Growth/Complete/Commerce-addon) order has no
      // manual-payout double-loss risk, but still must stop counting toward
      // pipeline-health revenueTotalUsd (bundle-order-refund-tracking).
      const charge = event.data.object as Stripe.Charge;
      if (!chargeHasRefund(charge)) {
        break;
      }
      const paymentIntentId = chargePaymentIntentId(charge);
      if (!paymentIntentId) {
        console.warn(
          `webhook: charge.refunded ${charge.id} has no payment_intent — cannot correlate to a Checkout Session, skipping`,
        );
        break;
      }
      let sessions: Stripe.ApiList<Stripe.Checkout.Session>;
      try {
        sessions = await stripe.checkout.sessions.list({
          payment_intent: paymentIntentId,
          limit: 1,
        });
      } catch (e) {
        console.error(
          `Failed to list Checkout Sessions for refunded charge ${charge.id} (payment_intent=${paymentIntentId})`,
          e,
        );
        const failure = webhookFulfillmentFailureResponse(
          "commerce_order_refund_session_lookup",
        );
        return NextResponse.json(failure.body, { status: failure.status });
      }
      const session = sessions.data[0];
      if (!session) {
        console.warn(
          `webhook: charge.refunded ${charge.id} payment_intent=${paymentIntentId} matched no Checkout Session — not one of our commerce orders, skipping`,
        );
        break;
      }
      const commerceOrder = await getCommerceOrderByStripeSessionId(session.id);
      if (!commerceOrder) {
        // Not a commerce_sku Buy now order — check whether it backs a bundle
        // order instead (Starter/Growth/Complete/Commerce-addon revenue).
        const bundleOrder = await getOrderByStripeSessionId(session.id);
        if (!bundleOrder) {
          console.warn(
            `webhook: charge.refunded ${charge.id} payment_intent=${paymentIntentId} Session ${session.id} matched no commerce or bundle order, skipping`,
          );
          break;
        }
        if (bundleOrder.refundedAt) {
          // Already flagged (Stripe redelivery) — idempotent no-op.
          break;
        }
        try {
          await markOrderRefunded(session.id, new Date().toISOString(), WEBHOOK_CONVEX_PRIMARY);
          console.warn(
            `webhook: charge.refunded ${charge.id} flagged bundle order for session ${session.id} (leadSlug=${bundleOrder.leadSlug}, tier=${bundleOrder.tier})`,
          );
        } catch (e) {
          console.error(
            `Failed to mark bundle order refunded for session ${session.id} after charge.refunded ${charge.id}`,
            e,
          );
          const failure = webhookFulfillmentFailureResponse("bundle_order_refund");
          return NextResponse.json(failure.body, { status: failure.status });
        }
        break;
      }
      if (commerceOrder.refundedAt) {
        // Already flagged (Stripe redelivery) — idempotent no-op.
        break;
      }
      try {
        await markCommerceOrderRefunded(
          session.id,
          new Date().toISOString(),
          WEBHOOK_CONVEX_PRIMARY,
        );
        console.warn(
          `webhook: charge.refunded ${charge.id} flagged commerce order for session ${session.id} (leadSlug=${commerceOrder.leadSlug}, skuId=${commerceOrder.skuId}, paidOut=${Boolean(commerceOrder.paidOutAt)})`,
        );
      } catch (e) {
        console.error(
          `Failed to mark commerce order refunded for session ${session.id} after charge.refunded ${charge.id}`,
          e,
        );
        const failure = webhookFulfillmentFailureResponse("commerce_order_refund");
        return NextResponse.json(failure.body, { status: failure.status });
      }
      break;
    }
    case "charge.dispute.created": {
      // A disputed (charged back) commerce_sku Buy now charge owes the client
      // nothing — Stripe has already debited the amount from the platform
      // pending review. Mirrors charge.refunded exactly (see doc comment
      // above and commerce-order-dispute-clawback-tracking).
      const dispute = event.data.object as Stripe.Dispute;
      const paymentIntentId = chargePaymentIntentId(dispute);
      if (!paymentIntentId) {
        console.warn(
          `webhook: charge.dispute.created ${dispute.id} has no payment_intent — cannot correlate to a Checkout Session, skipping`,
        );
        break;
      }
      let disputeSessions: Stripe.ApiList<Stripe.Checkout.Session>;
      try {
        disputeSessions = await stripe.checkout.sessions.list({
          payment_intent: paymentIntentId,
          limit: 1,
        });
      } catch (e) {
        console.error(
          `Failed to list Checkout Sessions for disputed charge ${dispute.charge} (payment_intent=${paymentIntentId})`,
          e,
        );
        const failure = webhookFulfillmentFailureResponse(
          "commerce_order_dispute_session_lookup",
        );
        return NextResponse.json(failure.body, { status: failure.status });
      }
      const disputeSession = disputeSessions.data[0];
      if (!disputeSession) {
        console.warn(
          `webhook: charge.dispute.created ${dispute.id} payment_intent=${paymentIntentId} matched no Checkout Session — not one of our commerce orders, skipping`,
        );
        break;
      }
      const disputedCommerceOrder = await getCommerceOrderByStripeSessionId(
        disputeSession.id,
      );
      if (!disputedCommerceOrder) {
        // Not a commerce_sku Buy now order — check whether it backs a bundle
        // order instead (Starter/Growth/Complete/Commerce-addon revenue).
        const disputedBundleOrder = await getOrderByStripeSessionId(disputeSession.id);
        if (!disputedBundleOrder) {
          console.warn(
            `webhook: charge.dispute.created ${dispute.id} payment_intent=${paymentIntentId} Session ${disputeSession.id} matched no commerce or bundle order, skipping`,
          );
          break;
        }
        if (disputedBundleOrder.disputedAt) {
          // Already flagged (Stripe redelivery) — idempotent no-op.
          break;
        }
        try {
          await markOrderDisputed(
            disputeSession.id,
            new Date().toISOString(),
            WEBHOOK_CONVEX_PRIMARY,
          );
          console.warn(
            `webhook: charge.dispute.created ${dispute.id} flagged bundle order for session ${disputeSession.id} (leadSlug=${disputedBundleOrder.leadSlug}, tier=${disputedBundleOrder.tier})`,
          );
        } catch (e) {
          console.error(
            `Failed to mark bundle order disputed for session ${disputeSession.id} after charge.dispute.created ${dispute.id}`,
            e,
          );
          const failure = webhookFulfillmentFailureResponse("bundle_order_dispute");
          return NextResponse.json(failure.body, { status: failure.status });
        }
        break;
      }
      if (disputedCommerceOrder.disputedAt) {
        // Already flagged (Stripe redelivery) — idempotent no-op.
        break;
      }
      try {
        await markCommerceOrderDisputed(
          disputeSession.id,
          new Date().toISOString(),
          WEBHOOK_CONVEX_PRIMARY,
        );
        console.warn(
          `webhook: charge.dispute.created ${dispute.id} flagged commerce order for session ${disputeSession.id} (leadSlug=${disputedCommerceOrder.leadSlug}, skuId=${disputedCommerceOrder.skuId}, paidOut=${Boolean(disputedCommerceOrder.paidOutAt)})`,
        );
      } catch (e) {
        console.error(
          `Failed to mark commerce order disputed for session ${disputeSession.id} after charge.dispute.created ${dispute.id}`,
          e,
        );
        const failure = webhookFulfillmentFailureResponse("commerce_order_dispute");
        return NextResponse.json(failure.body, { status: failure.status });
      }
      break;
    }
    case "charge.dispute.closed": {
      // Resolution twin of charge.dispute.created: won / warning_closed clears
      // disputedAt (funds reinstated or inquiry closed); lost keeps/ensures it
      // (commerce-order-dispute-closed-resolution).
      const closedDispute = event.data.object as Stripe.Dispute;
      const closedPaymentIntentId = chargePaymentIntentId(closedDispute);
      if (!closedPaymentIntentId) {
        console.warn(
          `webhook: charge.dispute.closed ${closedDispute.id} has no payment_intent — cannot correlate to a Checkout Session, skipping`,
        );
        break;
      }
      let closedDisputeSessions: Stripe.ApiList<Stripe.Checkout.Session>;
      try {
        closedDisputeSessions = await stripe.checkout.sessions.list({
          payment_intent: closedPaymentIntentId,
          limit: 1,
        });
      } catch (e) {
        console.error(
          `Failed to list Checkout Sessions for closed dispute ${closedDispute.charge} (payment_intent=${closedPaymentIntentId})`,
          e,
        );
        const failure = webhookFulfillmentFailureResponse(
          "commerce_order_dispute_closed_session_lookup",
        );
        return NextResponse.json(failure.body, { status: failure.status });
      }
      const closedDisputeSession = closedDisputeSessions.data[0];
      if (!closedDisputeSession) {
        console.warn(
          `webhook: charge.dispute.closed ${closedDispute.id} payment_intent=${closedPaymentIntentId} matched no Checkout Session — not one of our commerce orders, skipping`,
        );
        break;
      }
      const closedDisputeOrder = await getCommerceOrderByStripeSessionId(
        closedDisputeSession.id,
      );
      if (!closedDisputeOrder) {
        // Not a commerce_sku Buy now order — check whether it backs a bundle
        // order instead (bundle-order-dispute-tracking).
        const closedDisputeBundleOrder = await getOrderByStripeSessionId(
          closedDisputeSession.id,
        );
        if (!closedDisputeBundleOrder) {
          console.warn(
            `webhook: charge.dispute.closed ${closedDispute.id} payment_intent=${closedPaymentIntentId} Session ${closedDisputeSession.id} matched no commerce or bundle order, skipping`,
          );
          break;
        }
        if (disputeStatusClearsDisputeFlag(closedDispute.status)) {
          if (!closedDisputeBundleOrder.disputedAt) {
            break;
          }
          try {
            await clearOrderDisputed(closedDisputeSession.id, WEBHOOK_CONVEX_PRIMARY);
            console.warn(
              `webhook: charge.dispute.closed ${closedDispute.id} status=${closedDispute.status} cleared bundle disputed flag for session ${closedDisputeSession.id} (leadSlug=${closedDisputeBundleOrder.leadSlug}, tier=${closedDisputeBundleOrder.tier})`,
            );
          } catch (e) {
            console.error(
              `Failed to clear bundle order disputed for session ${closedDisputeSession.id} after charge.dispute.closed ${closedDispute.id}`,
              e,
            );
            const failure = webhookFulfillmentFailureResponse(
              "bundle_order_dispute_clear",
            );
            return NextResponse.json(failure.body, { status: failure.status });
          }
          break;
        }
        if (closedDisputeBundleOrder.disputedAt) {
          break;
        }
        try {
          await markOrderDisputed(
            closedDisputeSession.id,
            new Date().toISOString(),
            WEBHOOK_CONVEX_PRIMARY,
          );
          console.warn(
            `webhook: charge.dispute.closed ${closedDispute.id} status=${closedDispute.status} flagged bundle order for session ${closedDisputeSession.id} (leadSlug=${closedDisputeBundleOrder.leadSlug}, tier=${closedDisputeBundleOrder.tier})`,
          );
        } catch (e) {
          console.error(
            `Failed to mark bundle order disputed for session ${closedDisputeSession.id} after charge.dispute.closed ${closedDispute.id}`,
            e,
          );
          const failure = webhookFulfillmentFailureResponse("bundle_order_dispute");
          return NextResponse.json(failure.body, { status: failure.status });
        }
        break;
      }
      if (disputeStatusClearsDisputeFlag(closedDispute.status)) {
        if (!closedDisputeOrder.disputedAt) {
          // Already clear (Stripe redelivery, or created never marked) — idempotent.
          break;
        }
        try {
          await clearCommerceOrderDisputed(
            closedDisputeSession.id,
            WEBHOOK_CONVEX_PRIMARY,
          );
          console.warn(
            `webhook: charge.dispute.closed ${closedDispute.id} status=${closedDispute.status} cleared disputed flag for session ${closedDisputeSession.id} (leadSlug=${closedDisputeOrder.leadSlug}, skuId=${closedDisputeOrder.skuId})`,
          );
        } catch (e) {
          console.error(
            `Failed to clear commerce order disputed for session ${closedDisputeSession.id} after charge.dispute.closed ${closedDispute.id}`,
            e,
          );
          const failure = webhookFulfillmentFailureResponse(
            "commerce_order_dispute_clear",
          );
          return NextResponse.json(failure.body, { status: failure.status });
        }
        break;
      }
      // lost (or any non-clearing closed status): ensure disputedAt is set —
      // created may have been missed (out-of-order delivery / prior handler gap).
      if (closedDisputeOrder.disputedAt) {
        break;
      }
      try {
        await markCommerceOrderDisputed(
          closedDisputeSession.id,
          new Date().toISOString(),
          WEBHOOK_CONVEX_PRIMARY,
        );
        console.warn(
          `webhook: charge.dispute.closed ${closedDispute.id} status=${closedDispute.status} flagged commerce order for session ${closedDisputeSession.id} (leadSlug=${closedDisputeOrder.leadSlug}, skuId=${closedDisputeOrder.skuId}, paidOut=${Boolean(closedDisputeOrder.paidOutAt)})`,
        );
      } catch (e) {
        console.error(
          `Failed to mark commerce order disputed for session ${closedDisputeSession.id} after charge.dispute.closed ${closedDispute.id}`,
          e,
        );
        const failure = webhookFulfillmentFailureResponse("commerce_order_dispute");
        return NextResponse.json(failure.body, { status: failure.status });
      }
      break;
    }
    case "refund.updated": {
      // Reversal twin of charge.refunded / commerce-order-refund-clawback-tracking:
      // a refund that charge.refunded already flagged (amount_refunded > 0) can
      // itself later fail or be canceled — common for bank-sourced refunds (ACH,
      // some debit cards) that Stripe reports as pending/succeeded first, then
      // reverses days later when the destination account rejects it. Funds never
      // actually left the platform, so refundedAt must clear (commerce-order-refund-reversal-tracking).
      // Non-reversal statuses (succeeded/pending/requires_action) are a no-op here
      // — the initial mark already happened via charge.refunded.
      const refund = event.data.object as Stripe.Refund;
      if (!refundStatusReversesRefund(refund.status)) {
        break;
      }
      const refundPaymentIntentId = chargePaymentIntentId(refund);
      if (!refundPaymentIntentId) {
        console.warn(
          `webhook: refund.updated ${refund.id} status=${refund.status} has no payment_intent — cannot correlate to a Checkout Session, skipping`,
        );
        break;
      }
      // Stripe allows multiple independent (e.g. partial) refunds on the same
      // charge. This refund event's own status is not enough to know whether
      // refundedAt should clear — a *different* refund on this same charge may
      // still be genuinely in effect. Re-fetch the charge and re-check its own
      // aggregate amount_refunded (ground truth, same predicate the original
      // charge.refunded handler uses) before clearing anything. See
      // refund-reversal-charge-aggregate-recheck.
      const refundedChargeId = refundChargeId(refund);
      if (!refundedChargeId) {
        console.warn(
          `webhook: refund.updated ${refund.id} status=${refund.status} has no charge — cannot re-verify aggregate refund state, skipping`,
        );
        break;
      }
      let refreshedRefundCharge: Stripe.Charge;
      try {
        refreshedRefundCharge = await stripe.charges.retrieve(refundedChargeId);
      } catch (e) {
        console.error(
          `Failed to retrieve charge ${refundedChargeId} for reversed refund ${refund.id}`,
          e,
        );
        const failure = webhookFulfillmentFailureResponse(
          "commerce_order_refund_reversed_charge_lookup",
        );
        return NextResponse.json(failure.body, { status: failure.status });
      }
      if (chargeHasRefund(refreshedRefundCharge)) {
        console.warn(
          `webhook: refund.updated ${refund.id} status=${refund.status} but charge ${refundedChargeId} still shows amount_refunded=${refreshedRefundCharge.amount_refunded} — a different refund on this charge is still in effect, not clearing refundedAt`,
        );
        break;
      }
      let reversedRefundSessions: Stripe.ApiList<Stripe.Checkout.Session>;
      try {
        reversedRefundSessions = await stripe.checkout.sessions.list({
          payment_intent: refundPaymentIntentId,
          limit: 1,
        });
      } catch (e) {
        console.error(
          `Failed to list Checkout Sessions for reversed refund ${refund.id} (payment_intent=${refundPaymentIntentId})`,
          e,
        );
        const failure = webhookFulfillmentFailureResponse(
          "commerce_order_refund_reversed_session_lookup",
        );
        return NextResponse.json(failure.body, { status: failure.status });
      }
      const reversedRefundSession = reversedRefundSessions.data[0];
      if (!reversedRefundSession) {
        console.warn(
          `webhook: refund.updated ${refund.id} payment_intent=${refundPaymentIntentId} matched no Checkout Session — not one of our commerce orders, skipping`,
        );
        break;
      }
      const reversedCommerceOrder = await getCommerceOrderByStripeSessionId(
        reversedRefundSession.id,
      );
      if (!reversedCommerceOrder) {
        // Not a commerce_sku Buy now order — check whether it backs a bundle
        // order instead (bundle-order-refund-tracking).
        const reversedBundleOrder = await getOrderByStripeSessionId(
          reversedRefundSession.id,
        );
        if (!reversedBundleOrder) {
          console.warn(
            `webhook: refund.updated ${refund.id} payment_intent=${refundPaymentIntentId} Session ${reversedRefundSession.id} matched no commerce or bundle order, skipping`,
          );
          break;
        }
        if (!reversedBundleOrder.refundedAt) {
          // Nothing to clear (Stripe redelivery, or refundedAt was never set) — idempotent.
          break;
        }
        try {
          await clearOrderRefunded(reversedRefundSession.id, WEBHOOK_CONVEX_PRIMARY);
          console.warn(
            `webhook: refund.updated ${refund.id} status=${refund.status} cleared bundle refunded flag for session ${reversedRefundSession.id} (leadSlug=${reversedBundleOrder.leadSlug}, tier=${reversedBundleOrder.tier})`,
          );
        } catch (e) {
          console.error(
            `Failed to clear bundle order refunded for session ${reversedRefundSession.id} after refund.updated ${refund.id}`,
            e,
          );
          const failure = webhookFulfillmentFailureResponse("bundle_order_refund_clear");
          return NextResponse.json(failure.body, { status: failure.status });
        }
        break;
      }
      if (!reversedCommerceOrder.refundedAt) {
        // Nothing to clear (Stripe redelivery, or refundedAt was never set) — idempotent.
        break;
      }
      try {
        await clearCommerceOrderRefunded(reversedRefundSession.id, WEBHOOK_CONVEX_PRIMARY);
        console.warn(
          `webhook: refund.updated ${refund.id} status=${refund.status} cleared refunded flag for session ${reversedRefundSession.id} (leadSlug=${reversedCommerceOrder.leadSlug}, skuId=${reversedCommerceOrder.skuId})`,
        );
      } catch (e) {
        console.error(
          `Failed to clear commerce order refunded for session ${reversedRefundSession.id} after refund.updated ${refund.id}`,
          e,
        );
        const failure = webhookFulfillmentFailureResponse("commerce_order_refund_clear");
        return NextResponse.json(failure.body, { status: failure.status });
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
