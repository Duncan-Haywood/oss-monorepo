import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  clearCommerceOrderDisputed,
  clearCommerceOrderRefunded,
  clearOrderDisputed,
  clearOrderRefunded,
  clearOrdersRecurringCanceledByCustomer,
  getCommerceOrderByStripeSessionId,
  getLeads,
  getOrdersByStripeCustomerId,
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
  recordSubscriptionRenewalPayment,
  syncOrdersRecurringEntitlementByCustomer,
  updateLeadStripeConnectStatus,
} from "@/lib/db";
import { findLeadSlugByStripeConnectAccountId } from "@/lib/commerce/stripe-connect";
import { LEAD_STRIPE_CONNECT_STATUS_CONVEX_PRIMARY } from "@/lib/leads/stripe-connect-persist";
import { parseCheckoutAcquisitionSource } from "@/lib/checkout/acquisition-source";
import {
  normalizeCheckoutBusinessName,
  normalizeCheckoutBusinessPhone,
} from "@/lib/checkout/business-fields";
import { normalizeCheckoutCustomerEmailForMatch } from "@/lib/checkout/abandoned-recovery";
import { normalizeCheckoutCustomerEmail } from "@/lib/checkout/customer-email";
import { stripeCustomerIdFromUnknown } from "@/lib/billing/portal";
import type { OrderRecord } from "@/lib/orders/types";
import { orderHasFailedBillingNotice } from "@/lib/orders/types";
import {
  invoiceIsSubscriptionRenewalCharge,
  invoicePaidMayRestoreRecurringEntitlement,
  invoicePaymentFailedPausesRecurringEntitlement,
  orderEligibleForPauseNotice,
  orderGrantsSoldCapabilityEntitlement,
  orderHadRecurringEntitlement,
  otherLiveRecurringOrdersToSupersede,
  stripeSubscriptionBillingInterval,
  SUPERSEDED_SUBSCRIPTION_CANCELLATION_COMMENT,
  stripeSubscriptionCancellationWasInternalSupersede,
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
import { captureError } from "@/lib/observability/error-tracking";
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
  commerceSkuLineItemQuantity,
  sessionLineItemsIncludeMetadataKey,
  sessionLineItemsIncludePriceId,
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
  parseBundleBillingInterval,
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
 * both COMMERCE_ADDON Price IDs are on line_items, skips the one-time setup
 * fee entirely for a lead with a prior order (checkout-setup-fee-skip-on-
 * upgrade), and charges only catalog Stripe Price IDs from BUNDLES (+
 * optional COMMERCE_ADDON) in USD; this handler must mirror slug/tier gates,
 * derive commerceAddon from listLineItems Price IDs (never metadata),
 * independently re-derive whether the lead had a prior order via
 * listOrdersByLeadSlug (excluding this session's own order, so a redelivery
 * is not miscounted — webhook-setup-fee-skip-parity) to decide whether the
 * setup Price is required on listLineItems (sessionLineItemsMatchBundle-
 * CatalogPrices's requireSetupFee), require session.currency === "usd"
 * (isStripeCheckoutCurrencyUsd), AND require session.amount_total (integer
 * cents) === expectedBundleCheckoutAmountCents(bundle, derivedCommerceAddon,
 * billingInterval, chargedSetupFee) — chargedSetupFee itself derived from
 * whether the setup Price actually appears on listLineItems, never from the
 * prior-order lookup directly — minus session.total_details.amount_discount
 * (Stripe's own server-computed discount from a redeemed allow_promotion_codes
 * promo, never a client-supplied value) before recordLeadPayment / handoff /
 * receipt — a truthy metadata.slug / tier / commerceAddon alone is not enough
 * (Dashboard-minted or tampered Checkout Sessions), and a genuinely promo-
 * discounted session must still fulfill rather than being treated as
 * tampered (bundle-webhook-promotion-code-amount-parity). Over-long slug
 * (parseLeadSlugLookup), unknown tier, missing catalog Prices on line items,
 * a setup-fee omission with no prior order on record, non-USD currency, or
 * amount mismatch skips like missing slug/tier (session already marked
 * complete; do not 5xx forever). listLineItems / prior-order lookup failures
 * return 500 so Stripe retries.
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
 * session.amount_total (a non-negative integer cents — 0 is valid for a
 * 100%-off promo redemption, see the no_payment_required note below), never
 * from catalogItem.priceCents, so the ledger reflects what was really
 * charged. Unknown/over-long slug/skuId, missing lead,
 * !leadEligibleForCommerceCatalog, no line item Price carrying the expected
 * metadata key, non-USD currency, or a negative/non-integer amount_total
 * all skip like missing skuId (session already marked complete; do not 5xx
 * forever). listLineItems failures return 500 so Stripe retries.
 *
 * Async payment methods (ACH, bank transfer, etc.) fire
 * checkout.session.completed with payment_status "unpaid" while
 * amount_total/currency can still match catalog. Ledger / handoff / receipt
 * must wait for payment_status "paid" (same event when card settles
 * immediately, or checkout.session.async_payment_succeeded later). Unpaid
 * completed still markCheckoutSessionComplete so abandoned-recovery does
 * not nudge mid-clearing (webhook-checkout-payment-status-paid-gate).
 * "no_payment_required" (a 100%-off allow_promotion_codes redemption) is
 * terminal, not pending — no later event ever arrives to resolve it —
 * so isStripeCheckoutSessionPaid treats it as fulfillable alongside "paid"
 * (checkout-session-no-payment-required-fulfillment-gap); the bundle
 * amount check below already tolerates amount_total 0 via
 * Math.max(0, expectedCents - discountCents), and the commerce_sku amount
 * check above allows 0 explicitly for the same reason.
 * checkout.session.async_payment_failed must markCheckoutSessionOpen so a
 * failed ACH cart re-enters Finish-checkout / Buy now recovery (recovery
 * links mint a new Checkout Session — the Stripe Session is terminal).
 *
 * customer.subscription.deleted must markOrdersRecurringCanceledByCustomer by
 * stripeCustomerId (orders.recurringCanceledAt) so canceled Growth/Complete/
 * Commerce subscribers lose marketing/voice/catalog entitlement while keeping
 * stage=paid|live + Billing Portal. Write failures return 5xx
 * (orders_recurring_canceled). Also best-effort sends a customer-facing
 * win-back notice (sendSubscriptionCanceledNotice) — the one billing
 * transition that previously notified the customer of nothing at all — after
 * clearing any stale pre-cancellation billing-notice failure marker (must run
 * in that order; see the inline comment at the call site). See
 * subscription-canceled-win-back-notice.
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

/**
 * Resolve a Stripe Customer's currently-recurring-entitled bundle order
 * (tier=growth|complete or commerceAddon) — the renewal-cycle correlation
 * fallback shared by all four refund/dispute lifecycle handlers
 * (charge.refunded, charge.dispute.created, refund.updated,
 * charge.dispute.closed) when a `stripe.checkout.sessions.list({
 * payment_intent })` lookup misses. A subscription renewal invoice's
 * PaymentIntent is minted directly by Stripe's billing system and is never
 * attached to a Checkout Session, so every event tied to a renewal charge
 * (the original charge AND any later refund/dispute update on it) misses that
 * lookup the same way. Uses orderHadRecurringEntitlement (tier/commerceAddon
 * only), NOT orderGrantsSoldCapabilityEntitlement — see the paused-order-fix
 * note on that choice in ITERATIONS
 * (renewal-charge-refund-dispute-customer-correlation-paused-order-fix).
 * Callers resolve `customerId` themselves (Charge.customer directly for the
 * refund path; a PaymentIntent retrieve for the dispute path, since Dispute
 * carries no `.customer` of its own) and must catch/5xx on failure — this
 * gates the same required money-ledger write as the Session-based lookup it
 * substitutes for. See renewal-charge-refund-dispute-customer-correlation.
 */
async function findRecurringOrderByStripeCustomerId(
  customerId: string | null,
): Promise<OrderRecord | undefined> {
  if (!customerId) return undefined;
  const orders = await getOrdersByStripeCustomerId(customerId);
  return orders.find((order) => orderHadRecurringEntitlement(order));
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

  // Every expected/recoverable failure inside a case below is already caught
  // and console.error'd at its own call site (idempotency/redelivery
  // semantics documented throughout this file depend on exactly which
  // sub-step failed). This outer try/catch exists only for a genuinely
  // unexpected bug that escapes every inner catch — without it, that failure
  // was visible only via whatever the hosting platform's raw logs happen to
  // retain (observability-error-tracking-scaffold). Re-throwing preserves
  // the existing behavior exactly (Next.js turns an uncaught throw into a
  // 500, which is what keeps Stripe retrying) — this only adds a best-effort,
  // non-blocking capture before that happens.
  try {
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
            await captureError(e, {
              component: "stripe-webhook",
              eventType: event.type,
              eventId: event.id,
              failureKind: "checkout_session_mark_complete",
            });
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
      // Falls back to "monthly" for missing/tampered/pre-annual-feature
      // sessions — the original, more conservative cadence (see
      // parseBundleBillingInterval's own doc comment).
      const billingInterval = parseBundleBillingInterval(session.metadata?.billingInterval);
      const customerEmail = session.customer_details?.email ?? session.customer_email ?? "";
      const stripeCustomerId = stripeCustomerIdFromUnknown(session.customer) ?? undefined;
      // Re-validate against the fixed allowlist rather than trusting the
      // metadata value verbatim — same paranoia as every other metadata field
      // on this path (see acquisition-source-checkout-attribution).
      const acquisitionSource = parseCheckoutAcquisitionSource(session.metadata?.acquisitionSource);
      // Only ever set on the organic no-preexisting-lead path (CheckoutForm
      // only renders these fields when there's no CRM lead to prefill from) —
      // re-validated here the same as every other metadata field on this
      // path, never trusted verbatim (checkout-business-fields-capture).
      const metadataBusinessName = normalizeCheckoutBusinessName(session.metadata?.businessName);
      const metadataBusinessPhone = normalizeCheckoutBusinessPhone(session.metadata?.businessPhone);

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
          await captureError(e, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "checkout_session_mark_complete",
          });
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
          // Units actually charged (Stripe adjustable_quantity — see
          // commerce-checkout-adjustable-quantity), read from the matched
          // line item below — undefined when missing/invalid. Declared
          // outside the try block so it survives past the line-items fetch
          // for the ledger insert / inquiry / client receipt calls further down.
          let quantity: number | undefined;
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
            quantity = commerceSkuLineItemQuantity(lineItems.data, expectedMetadataKey);
          } catch (lineItemError) {
            console.error(
              `Failed to list line items for commerce_sku Price parity on ${session.id}`,
              lineItemError,
            );
            await captureError(lineItemError, {
              component: "stripe-webhook",
              eventType: event.type,
              eventId: event.id,
              failureKind: "commerce_sku_price_line_items",
            });
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
          // 0 is legitimate ONLY when Stripe itself marked this session
          // no_payment_required (a 100%-off allow_promotion_codes redemption
          // on an otherwise-real charged Price, isStripeCheckoutSessionPaid
          // above already let it through) — a "paid" session with
          // amount_total 0 is not a real Stripe outcome and stays rejected
          // as invalid/tampered (checkout-session-no-payment-required-
          // fulfillment-gap).
          const amountCents = session.amount_total;
          const isFreeCheckout = session.payment_status === "no_payment_required";
          if (
            typeof amountCents !== "number" ||
            !Number.isInteger(amountCents) ||
            (isFreeCheckout ? amountCents !== 0 : amountCents <= 0)
          ) {
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
                quantity,
                // Same soft-cap normalizer the checkout-create routes already
                // apply to this field on checkout_sessions.customerEmail —
                // belt-and-suspenders here since this copy is Stripe-derived
                // (session.customer_details.email) rather than client-
                // supplied at this point in the flow, but every persisted
                // copy of the same real-world value shares one bound
                // regardless of provenance (see
                // commerce-order-customer-email-size-bound-parity).
                customerEmail: normalizeCheckoutCustomerEmail(customerEmail),
              },
              WEBHOOK_CONVEX_PRIMARY,
            ));
          } catch (ledgerError) {
            console.error(
              `Failed to record commerce order ledger for ${orderSlug}`,
              ledgerError,
            );
            // This catch returns a response (a 5xx so Stripe retries) rather
            // than re-throwing, so it never reaches the outer try/catch's own
            // captureError call — that one only fires for a genuinely
            // unhandled exception escaping every inner catch like this one.
            // Wired directly here as the Commerce-side sibling of the bundle
            // payment ledger write (bundle_payment_or_handoff, above): a
            // failure here means a paying Buy now customer's order isn't
            // recorded and no operator inquiry/client receipt follows. See
            // commerce-order-ledger-write-capture-error in /docs/architecture
            // for why this is wired individually rather than sweeping all the
            // other webhookFulfillmentFailureResponse catch sites in this file.
            await captureError(ledgerError, {
              component: "stripe-webhook",
              eventType: event.type,
              eventId: event.id,
              failureKind: "commerce_order_ledger",
            });
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
              await captureError(e, {
                component: "stripe-webhook",
                eventType: event.type,
                eventId: event.id,
                failureKind: "checkout_session_orphan_commerce_cleanup",
              });
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
                    quantity,
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
              await captureError(inquiryError, {
                component: "stripe-webhook",
                eventType: event.type,
                eventId: event.id,
                failureKind: "commerce_order_inquiry",
              });
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
                  quantity,
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
                    await captureError(markerError, {
                      component: "stripe-webhook",
                      eventType: event.type,
                      eventId: event.id,
                      failureKind: "commerce_client_receipt_sent_marker",
                    });
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
                  // Capture at the origin, not the merged flag check below —
                  // a resolved success:false has no thrown Error to carry a
                  // real stack, but its reason/error field is real diagnostic
                  // signal a generic synthesized message at the merged check
                  // would otherwise discard.
                  await captureError(
                    new Error(
                      `Commerce client receipt send resolved failure: ${sent.reason ?? sent.error ?? "unknown"}`,
                    ),
                    {
                      component: "stripe-webhook",
                      eventType: event.type,
                      eventId: event.id,
                      failureKind: "commerce_client_receipt_send",
                    },
                  );
                }
              } catch (emailError) {
                clientReceiptSendFailed = true;
                console.error(
                  `Failed to email commerce client receipt for ${orderSlug}`,
                  emailError,
                );
                // Capture the real thrown error here (with its actual
                // message/stack) rather than at the merged flag check below,
                // which would otherwise discard it behind a generic
                // synthesized message.
                await captureError(emailError, {
                  component: "stripe-webhook",
                  eventType: event.type,
                  eventId: event.id,
                  failureKind: "commerce_client_receipt_send",
                });
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
          await captureError(e, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "commerce_order_inquiry",
          });
          const failure = webhookFulfillmentFailureResponse("commerce_order_inquiry");
          return NextResponse.json(failure.body, { status: failure.status });
        }
        break;
      }

      try {
        await markCheckoutSessionComplete(session.id, WEBHOOK_CONVEX_PRIMARY);
      } catch (e) {
        console.error(`Failed to mark checkout session ${session.id} complete`, e);
        await captureError(e, {
          component: "stripe-webhook",
          eventType: event.type,
          eventId: event.id,
          failureKind: "checkout_session_mark_complete",
        });
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
          await captureError(lineItemError, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "bundle_commerce_addon_line_items",
          });
          const failure = webhookFulfillmentFailureResponse("bundle_commerce_addon_line_items");
          return NextResponse.json(failure.body, { status: failure.status });
        }

        const catalogPrices = bundleCatalogPriceIdsFromEnv(bundle, billingInterval);
        if (!catalogPrices) {
          console.warn(
            `webhook: bundle session ${session.id} for ${slug} tier ${knownTier} catalog Price IDs not configured — skipping payment/handoff/receipt`,
          );
          break;
        }

        // Mirror POST /api/stripe/checkout's setup-fee skip for a tier-upgrade
        // checkout (checkout-setup-fee-skip-on-upgrade): that route omits the
        // one-time setup Price entirely when the lead already has a prior
        // order, so this gate must not blindly require it either, or every
        // legitimately fee-skipped session fails catalog-Price/amount parity
        // below and fulfillment is silently skipped for a customer who has
        // genuinely paid (webhook-setup-fee-skip-parity). Re-derive the same
        // "has a prior order" fact independently here (never trust metadata)
        // via listOrdersByLeadSlug, excluding THIS session's own order row —
        // a webhook redelivery may have already recorded it via
        // recordLeadPayment's idempotency, and counting it would wrongly
        // flip a brand-new customer's first-ever session into "had a prior
        // order" on redelivery, breaking amount parity for a normal retry.
        let hadPriorOrderBeforeThisSession = false;
        try {
          const { listOrdersByLeadSlug } = await import("@/lib/db");
          const existingOrders = await listOrdersByLeadSlug(slug);
          hadPriorOrderBeforeThisSession = existingOrders.some(
            (order) => order.stripeSessionId !== session.id,
          );
        } catch (e) {
          console.error(
            `Failed to list existing orders for ${slug} while checking setup-fee-skip eligibility on session ${session.id}`,
            e,
          );
          await captureError(e, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "bundle_existing_orders_lookup",
          });
          const failure = webhookFulfillmentFailureResponse("bundle_existing_orders_lookup");
          return NextResponse.json(failure.body, { status: failure.status });
        }

        // Ground truth for whether the setup fee was actually charged is the
        // Session's own line items, not the prior-order lookup above — that
        // lookup only gates whether omitting the setup Price is ALLOWED, per
        // sessionLineItemsMatchBundleCatalogPrices's requireSetupFee option.
        const chargedSetupFee = sessionLineItemsIncludePriceId(
          lineItemPriceIds,
          catalogPrices.setupId,
        );
        if (
          !sessionLineItemsMatchBundleCatalogPrices(lineItemPriceIds, catalogPrices, {
            requireSetupFee: !hadPriorOrderBeforeThisSession,
          })
        ) {
          console.warn(
            `webhook: bundle session ${session.id} for ${slug} tier ${knownTier} catalog Price IDs not on line items — skipping payment/handoff/receipt`,
          );
          break;
        }
        if (!chargedSetupFee && !hadPriorOrderBeforeThisSession) {
          // Belt-and-suspenders: the check above already fails this case via
          // requireSetupFee, but state it explicitly so a future refactor of
          // that helper can't silently reopen a setup-fee-skip bypass for a
          // lead with no prior order.
          console.warn(
            `webhook: bundle session ${session.id} for ${slug} tier ${knownTier} omitted the setup fee with no prior order on record — skipping payment/handoff/receipt`,
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
        const expectedCents = expectedBundleCheckoutAmountCents(
          bundle,
          commerceAddon,
          billingInterval,
          chargedSetupFee,
        );
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
              acquisitionSource,
              businessName: metadataBusinessName,
              businessPhone: metadataBusinessPhone,
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
          // This catch returns a response (a 5xx so Stripe retries) rather
          // than re-throwing, so it never reaches the outer try/catch's own
          // captureError call below — that one only fires for a genuinely
          // unhandled exception escaping every inner catch like this one.
          // Wired directly here since this is the single highest-stakes
          // write in the file: a failure means a paying customer's payment
          // isn't recorded and their site handoff didn't happen. See
          // stripe-webhook-payment-write-capture-error in /docs/architecture
          // for why this is wired individually rather than sweeping all the
          // other webhookFulfillmentFailureResponse catch sites in this file.
          await captureError(dbError, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "bundle_payment_or_handoff",
          });
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
          await captureError(e, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "checkout_session_orphan_bundle_cleanup",
          });
          const failure = webhookFulfillmentFailureResponse(
            "checkout_session_orphan_bundle_cleanup",
          );
          return NextResponse.json(failure.body, { status: failure.status });
        }

        // A recurring order for this lead can supersede an earlier
        // still-active recurring order for the SAME lead — e.g. the
        // Growth→Complete upsell email's checkout link.
        // existingRecurringStripeCustomerId (checkout route) reuses the
        // lead's existing Stripe Customer for that new session, so the OLD
        // and NEW order usually share one Customer id; a stray pre-fix
        // session or a two-tab race can still leave a genuinely different
        // Customer behind too. Cancel the superseded Subscription(s) so the
        // customer is not billed twice. Best-effort: a failure here is
        // captured but does not fail this response — the new order is
        // already correctly recorded above, and forcing a Stripe redelivery
        // would re-run the receipt/DNS emails below, a worse trade-off than
        // a rare missed cancellation surfacing only via captureError. See
        // stripe-checkout-recurring-upgrade-dedup and
        // stripe-checkout-recurring-upgrade-dedup-shared-customer-fix.
        if (Boolean(bundle.monthlyPriceIdEnv) || commerceAddon) {
          try {
            const { listOrdersByLeadSlug, markOrderRecurringCanceledBySessionId } =
              await import("@/lib/db");
            const leadOrders = await listOrdersByLeadSlug(slug);
            const supersededOrders = otherLiveRecurringOrdersToSupersede(leadOrders, session.id);
            // Present without expand on a subscription-mode Checkout
            // Session. Used to tell the just-created Subscription apart
            // from an old one sharing the SAME Customer id — Stripe never
            // cancels/replaces an existing Subscription just because a new
            // subscription-mode Checkout Session names that Customer; it
            // mints a second, independent Subscription.
            const newSubscriptionId =
              typeof session.subscription === "string"
                ? session.subscription
                : (session.subscription?.id ?? null);
            const supersededCustomerIds = [
              ...new Set(supersededOrders.map((o) => o.stripeCustomerId)),
            ];
            const skippedCustomerIds = new Set<string>();
            for (const supersededCustomerId of supersededCustomerIds) {
              const sharesNewCustomerId = supersededCustomerId === stripeCustomerId;
              if (sharesNewCustomerId && !newSubscriptionId) {
                // Can't safely distinguish the old Subscription from the
                // brand-new one on this shared Customer without
                // session.subscription (always present in subscription
                // mode in practice) — a blind cancel-all here would risk
                // canceling the Subscription the customer just paid for.
                // Skip cancellation AND the CRM mark below for this
                // Customer's order(s); surface for operator follow-up.
                console.error(
                  `webhook: recurring-upgrade supersede skipped for ${slug} after ${session.id} — shared Customer ${supersededCustomerId} but session.subscription missing`,
                );
                await captureError(
                  new Error(
                    "recurring-upgrade supersede: missing session.subscription on shared-Customer upgrade",
                  ),
                  {
                    component: "stripe-webhook",
                    eventType: event.type,
                    eventId: event.id,
                    failureKind: "supersede_recurring_subscription_missing_new_subscription_id",
                  },
                );
                skippedCustomerIds.add(supersededCustomerId);
                continue;
              }
              // No status filter (Stripe's own default excludes only
              // status=canceled) — a superseded Subscription mid-dunning
              // (past_due/unpaid) or paused is exactly as live a duplicate-
              // billing risk as one still reporting status=active, and must
              // still be found and canceled here. See
              // recurring-upgrade-dedup-past-due-customer-reuse-gap.
              const activeSubscriptions = await stripe.subscriptions.list({
                customer: supersededCustomerId,
              });
              for (const activeSubscription of activeSubscriptions.data) {
                // A reused (shared) Customer id can carry both the brand-new
                // Subscription just created above and the old superseded
                // one in this same list — never cancel the new one.
                if (newSubscriptionId && activeSubscription.id === newSubscriptionId) continue;
                // cancellation_details.comment survives onto the resulting
                // customer.subscription.deleted event so that handler's
                // win-back notice can tell this apart from a genuine
                // customer-initiated cancellation and skip it — see
                // stripeSubscriptionCancellationWasInternalSupersede.
                await stripe.subscriptions.cancel(activeSubscription.id, {
                  cancellation_details: {
                    comment: SUPERSEDED_SUBSCRIPTION_CANCELLATION_COMMENT,
                  },
                });
                console.log(
                  `webhook: canceled superseded subscription ${activeSubscription.id} (customer ${supersededCustomerId}) for ${slug} after ${session.id} recurring upgrade`,
                );
              }
            }
            // Mark each superseded ORDER individually by its own
            // stripeSessionId — never markOrdersRecurringCanceledByCustomer
            // here, since a reused (shared) Customer id would also patch
            // the brand-new order the customer just paid for. See
            // stripe-checkout-recurring-upgrade-dedup-shared-customer-fix.
            for (const supersededOrder of supersededOrders) {
              if (skippedCustomerIds.has(supersededOrder.stripeCustomerId)) continue;
              await markOrderRecurringCanceledBySessionId(
                supersededOrder.stripeSessionId,
                Date.now(),
                WEBHOOK_CONVEX_PRIMARY,
              );
            }
          } catch (e) {
            console.error(
              `Failed to cancel superseded recurring subscription(s) for ${slug} after ${session.id}`,
              e,
            );
            await captureError(e, {
              component: "stripe-webhook",
              eventType: event.type,
              eventId: event.id,
              failureKind: "supersede_recurring_subscription",
            });
          }
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
          const { sendReceiptEmail, sendBundleDnsHandoffEmail } = await import(
            "@/lib/email/resend"
          );

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
                  await captureError(markerError, {
                    component: "stripe-webhook",
                    eventType: event.type,
                    eventId: event.id,
                    failureKind: "bundle_email_sent_marker",
                  });
                  const failure = webhookFulfillmentFailureResponse("bundle_email_sent_marker");
                  return NextResponse.json(failure.body, { status: failure.status });
                }
              } else {
                emailSendFailed = true;
                console.error(
                  `Receipt email not sent for ${slug} (${sent.reason ?? sent.error ?? "unknown"}) — leaving sent-marker unwritten so redelivery retries`,
                );
                // Capture at the origin, not the merged flag check below — a
                // resolved success:false has no thrown Error to carry a real
                // stack, but its reason/error field is real diagnostic
                // signal a generic synthesized message at the merged check
                // would otherwise discard.
                await captureError(
                  new Error(
                    `Bundle receipt email send resolved failure: ${sent.reason ?? sent.error ?? "unknown"}`,
                  ),
                  {
                    component: "stripe-webhook",
                    eventType: event.type,
                    eventId: event.id,
                    failureKind: "bundle_email_send",
                  },
                );
              }
            } catch (emailError) {
              emailSendFailed = true;
              console.error(`Failed to send receipt email for ${slug}:`, emailError);
              // Capture the real thrown error here (with its actual
              // message/stack) rather than at the merged flag check below,
              // which would otherwise discard it behind a generic
              // synthesized message.
              await captureError(emailError, {
                component: "stripe-webhook",
                eventType: event.type,
                eventId: event.id,
                failureKind: "bundle_email_send",
              });
            }
          }

          if (sideEffects.runDnsHandoffEmail && customerEmail) {
            try {
              // Transactional post-payment handoff — do not honor marketing
              // suppression (cold-outreach unsubscribe must not block DNS).
              // sendBundleDnsHandoffEmail also backs the dashboard manual-
              // resend action (resendBundleBuyerEmailAction) — one template.
              const sent = await sendBundleDnsHandoffEmail({
                to: customerEmail,
                businessName,
                slug,
                handoff,
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
                  await captureError(markerError, {
                    component: "stripe-webhook",
                    eventType: event.type,
                    eventId: event.id,
                    failureKind: "bundle_email_sent_marker",
                  });
                  const failure = webhookFulfillmentFailureResponse("bundle_email_sent_marker");
                  return NextResponse.json(failure.body, { status: failure.status });
                }
              } else {
                emailSendFailed = true;
                console.error(
                  `DNS handoff email not sent for ${slug} (${sent.reason ?? sent.error ?? "unknown"}) — leaving sent-marker unwritten so redelivery retries`,
                );
                await captureError(
                  new Error(
                    `Bundle DNS handoff email send resolved failure: ${sent.reason ?? sent.error ?? "unknown"}`,
                  ),
                  {
                    component: "stripe-webhook",
                    eventType: event.type,
                    eventId: event.id,
                    failureKind: "bundle_email_send",
                  },
                );
              }
            } catch (emailError) {
              emailSendFailed = true;
              console.error(`Failed to send DNS handoff email for ${slug}:`, emailError);
              await captureError(emailError, {
                component: "stripe-webhook",
                eventType: event.type,
                eventId: event.id,
                failureKind: "bundle_email_send",
              });
            }
          }
          if (emailSendFailed) {
            const failure = webhookFulfillmentFailureResponse("bundle_email_send");
            return NextResponse.json(failure.body, { status: failure.status });
          }
        } catch (emailError) {
          console.error(`Failed to send receipt/DNS emails for ${slug}:`, emailError);
          await captureError(emailError, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "bundle_email_send",
          });
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
        await captureError(e, {
          component: "stripe-webhook",
          eventType: event.type,
          eventId: event.id,
          failureKind: "checkout_session_mark_open",
        });
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
        // Returns a response rather than re-throwing, so it never reaches the
        // outer try/catch's own captureError call. Wired directly here (and
        // at every other markOrdersRecurringCanceledByCustomer catch sharing
        // this failureKind) since a failure means a canceled/paused
        // subscriber keeps paid marketing-pack / voice-pack / commerce-
        // catalog entitlement forever with zero operator visibility until
        // Stripe's retry window (~3 days) also lapses. See
        // orders-recurring-canceled-capture-error in /docs/architecture.
        await captureError(e, {
          component: "stripe-webhook",
          eventType: event.type,
          eventId: event.id,
          failureKind: "orders_recurring_canceled",
        });
        const failure = webhookFulfillmentFailureResponse("orders_recurring_canceled");
        return NextResponse.json(failure.body, { status: failure.status });
      }

      // Clear any live payment_failed/subscription_paused billing-notice
      // failure marker for this customer's orders — a fully deleted
      // Subscription will never fire another subscription-lifecycle webhook
      // event, so a marker from a pre-cancellation dunning/pause-notice
      // failure would otherwise never get a success:true send to clear it,
      // surfacing on the billing-notice-failed due-queue forever (see
      // billing-notice-failed-pause-gate-terminal-clear). Reuses
      // recordBillingNoticeSendOutcome's existing success:true clear path —
      // no new mutation needed. Best-effort: never turn this cleanup into a
      // 5xx/retry loop, same as every other notify-only side effect here.
      try {
        const { getOrdersByStripeCustomerId, recordBillingNoticeSendOutcome } = await import(
          "@/lib/db"
        );
        const orders = await getOrdersByStripeCustomerId(customerId);
        for (const order of orders) {
          if (!orderHasFailedBillingNotice(order) || !order.lastBillingNoticeSendFailedType) {
            continue;
          }
          await recordBillingNoticeSendOutcome(
            order.stripeSessionId,
            order.lastBillingNoticeSendFailedType,
            true,
            canceledAt,
          );
        }
      } catch (e) {
        console.error(
          `Failed to clear stale billing-notice failure marker(s) for customer ${customerId} after subscription ${subscription.id} deleted`,
          e,
        );
      }

      // Customer-facing win-back notice — best-effort, run AFTER the stale-
      // marker clear above (never before it): that block unconditionally
      // clears ANY existing lastBillingNoticeSendFailedType for this
      // customer's orders, so a subscription_canceled failure recorded
      // ahead of it would be immediately wiped out by its own cancellation
      // event. The durable CRM cancel write already succeeded, so a notify
      // failure here must not turn it into a 5xx/retry loop (see
      // subscription-canceled-win-back-notice). orderEligibleForPauseNotice
      // is valid here for the same reason it is at the pause/dunning call
      // sites: markOrdersRecurringCanceledByCustomer above just set
      // recurringCanceledAt on the very order this notice is about, so the
      // narrower orderGrantsSoldCapabilityEntitlement would always reject it.
      //
      // Skip entirely when this Subscription was canceled by this app's own
      // recurring-upgrade-supersede cleanup (stripe-checkout-recurring-
      // upgrade-dedup), not the customer — that customer just upgraded, not
      // canceled, and must not get a "sorry to see you go" win-back email
      // for the internal dedup of their own superseded subscription.
      if (stripeSubscriptionCancellationWasInternalSupersede(subscription)) {
        break;
      }
      try {
        const { getOrdersByStripeCustomerId, getLeadBySlug, recordBillingNoticeSendOutcome } =
          await import("@/lib/db");
        const orders = await getOrdersByStripeCustomerId(customerId);
        const recurringOrder = orders.find((order) => orderEligibleForPauseNotice(order));
        if (recurringOrder) {
          const lead = await getLeadBySlug(recurringOrder.leadSlug);
          if (lead?.email) {
            const { sendSubscriptionCanceledNotice } = await import("@/lib/email/resend");
            const sent = await sendSubscriptionCanceledNotice({
              to: lead.email,
              businessName: lead.businessName,
              slug: recurringOrder.leadSlug,
              tier: recurringOrder.tier,
              commerceAddon: recurringOrder.commerceAddon,
              billingInterval: stripeSubscriptionBillingInterval(subscription),
            });
            if (!sent.success) {
              console.warn(
                `webhook: customer.subscription.deleted ${subscription.id} subscription-canceled notice not sent for ${recurringOrder.leadSlug} (${sent.reason ?? sent.error ?? "unknown"})`,
              );
            }
            await recordBillingNoticeSendOutcome(
              recurringOrder.stripeSessionId,
              "subscription_canceled",
              sent.success,
              canceledAt,
            );
          }
        }
      } catch (e) {
        console.error(
          `Failed to send subscription-canceled notice for customer ${customerId} after subscription ${subscription.id} deleted`,
          e,
        );
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
            // See orders-recurring-canceled-capture-error in /docs/architecture.
            await captureError(e, {
              component: "stripe-webhook",
              eventType: event.type,
              eventId: event.id,
              failureKind: "orders_recurring_canceled",
            });
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
          // See orders-recurring-canceled-capture-error in /docs/architecture.
          await captureError(e, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "orders_recurring_reactivated",
          });
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
            const { getOrdersByStripeCustomerId, getLeadBySlug, recordBillingNoticeSendOutcome } =
              await import("@/lib/db");
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
                await recordBillingNoticeSendOutcome(
                  recurringOrder.stripeSessionId,
                  "subscription_resumed",
                  sent.success,
                  Date.now(),
                );
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
        // See orders-recurring-canceled-capture-error in /docs/architecture.
        await captureError(e, {
          component: "stripe-webhook",
          eventType: event.type,
          eventId: event.id,
          failureKind: "orders_recurring_canceled",
        });
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
          const { getOrdersByStripeCustomerId, getLeadBySlug, recordBillingNoticeSendOutcome } =
            await import("@/lib/db");
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
              await recordBillingNoticeSendOutcome(
                recurringOrder.stripeSessionId,
                "subscription_paused",
                sent.success,
                Date.now(),
              );
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
        // See orders-recurring-canceled-capture-error in /docs/architecture.
        await captureError(e, {
          component: "stripe-webhook",
          eventType: event.type,
          eventId: event.id,
          failureKind: "subscription_retrieve",
        });
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
        // See orders-recurring-canceled-capture-error in /docs/architecture.
        await captureError(e, {
          component: "stripe-webhook",
          eventType: event.type,
          eventId: event.id,
          failureKind: "orders_recurring_canceled",
        });
        const failure = webhookFulfillmentFailureResponse("orders_recurring_canceled");
        return NextResponse.json(failure.body, { status: failure.status });
      }

      // Customer-facing dunning notice — best-effort. The durable CRM pause
      // above already succeeded, so a notify failure here must not turn it
      // into a 5xx/retry loop (see recurring-payment-failed-dunning-notice);
      // Stripe fires a new invoice.payment_failed per Smart Retry attempt, so
      // this naturally sends once per attempt without its own dedup marker.
      try {
        const { getOrdersByStripeCustomerId, getLeadBySlug, recordBillingNoticeSendOutcome } =
          await import("@/lib/db");
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
              billingInterval: stripeSubscriptionBillingInterval(subscription),
            });
            if (!sent.success) {
              console.warn(
                `webhook: invoice.payment_failed ${invoice.id} payment-failed notice not sent for ${recurringOrder.leadSlug} (${sent.reason ?? sent.error ?? "unknown"})`,
              );
            }
            await recordBillingNoticeSendOutcome(
              recurringOrder.stripeSessionId,
              "payment_failed",
              sent.success,
              Date.now(),
            );
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
        // See orders-recurring-canceled-capture-error in /docs/architecture.
        await captureError(e, {
          component: "stripe-webhook",
          eventType: event.type,
          eventId: event.id,
          failureKind: "subscription_retrieve",
        });
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
          // See orders-recurring-canceled-capture-error in /docs/architecture.
          await captureError(e, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "orders_recurring_canceled",
          });
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
        // See orders-recurring-canceled-capture-error in /docs/architecture.
        await captureError(e, {
          component: "stripe-webhook",
          eventType: event.type,
          eventId: event.id,
          failureKind: "orders_recurring_reactivated",
        });
        const failure = webhookFulfillmentFailureResponse("orders_recurring_reactivated");
        return NextResponse.json(failure.body, { status: failure.status });
      }

      // Revenue-total-usd-renewal-gap fix: checkout.session.completed only
      // ever records the first billing period's amount (OrderRecord.amountPaid),
      // so an ordinary healthy renewal (the common case — cleared is 0 here)
      // must still add its own invoice amount into lifetimeRevenueUsd, or
      // revenueTotalUsd never counts a single dollar past the first cycle.
      // billing_reason "subscription_cycle" excludes the subscription's first
      // invoice (already counted at order creation) so this never double-counts.
      if (invoiceIsSubscriptionRenewalCharge(invoice)) {
        const amountPaidUsd =
          typeof invoice.amount_paid === "number" ? invoice.amount_paid / 100 : 0;
        if (amountPaidUsd > 0 && invoice.id) {
          try {
            await recordSubscriptionRenewalPayment(
              customerId,
              invoice.id,
              amountPaidUsd,
              WEBHOOK_CONVEX_PRIMARY,
            );
          } catch (e) {
            console.error(
              `Failed to record subscription renewal payment for customer ${customerId} after invoice.paid ${invoice.id}`,
              e,
            );
            // See orders-recurring-canceled-capture-error in /docs/architecture.
            await captureError(e, {
              component: "stripe-webhook",
              eventType: event.type,
              eventId: event.id,
              failureKind: "subscription_renewal_revenue",
            });
            const failure = webhookFulfillmentFailureResponse("subscription_renewal_revenue");
            return NextResponse.json(failure.body, { status: failure.status });
          }
        }
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
          const { getOrdersByStripeCustomerId, getLeadBySlug, recordBillingNoticeSendOutcome } =
            await import("@/lib/db");
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
              await recordBillingNoticeSendOutcome(
                recurringOrder.stripeSessionId,
                "payment_recovered",
                sent.success,
                Date.now(),
              );
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
        await captureError(e, {
          component: "stripe-webhook",
          eventType: event.type,
          eventId: event.id,
          failureKind: "commerce_order_refund_session_lookup",
        });
        const failure = webhookFulfillmentFailureResponse(
          "commerce_order_refund_session_lookup",
        );
        return NextResponse.json(failure.body, { status: failure.status });
      }
      const session = sessions.data[0];
      if (!session) {
        // A subscription renewal charge's PaymentIntent is minted directly by
        // Stripe's billing system, never through a Checkout Session, so the
        // lookup above always misses it — fall back to correlating via the
        // charge's own Stripe Customer id. Use orderHadRecurringEntitlement
        // (tier/commerceAddon only), NOT orderGrantsSoldCapabilityEntitlement
        // — that predicate also requires recurringCanceledAt to be unset and
        // refundedAt/disputedAt to be absent, which would silently drop this
        // correlation for exactly the orders most likely to need it: a
        // subscription already paused (recurringCanceledAt set, e.g. from a
        // prior invoice.payment_failed — a card problem serious enough to
        // trigger a chargeback often also breaks the next renewal charge) or
        // a customer with more than one refund/dispute event on their
        // renewal charges over time. This is the exact bug class
        // orderEligibleForPauseNotice's own doc comment already documents
        // (billing-notice-pause-recipient-write-before-read-fix) — see
        // renewal-charge-refund-dispute-customer-correlation-paused-order-fix.
        // The explicit refundedAt idempotency check right below still
        // correctly no-ops a redelivery.
        const customerId = stripeCustomerIdFromUnknown(charge.customer);
        let recurringOrder: OrderRecord | undefined;
        try {
          recurringOrder = await findRecurringOrderByStripeCustomerId(customerId);
        } catch (e) {
          console.error(
            `Failed to look up orders for customer ${customerId} after charge.refunded ${charge.id}`,
            e,
          );
          await captureError(e, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "bundle_order_renewal_customer_lookup",
          });
          const failure = webhookFulfillmentFailureResponse(
            "bundle_order_renewal_customer_lookup",
          );
          return NextResponse.json(failure.body, { status: failure.status });
        }
        if (!recurringOrder) {
          console.warn(
            `webhook: charge.refunded ${charge.id} payment_intent=${paymentIntentId} matched no Checkout Session or renewal-cycle order — not one of our commerce orders, skipping`,
          );
          break;
        }
        if (recurringOrder.refundedAt) {
          // Already flagged (Stripe redelivery) — idempotent no-op.
          break;
        }
        try {
          await markOrderRefunded(
            recurringOrder.stripeSessionId,
            new Date().toISOString(),
            WEBHOOK_CONVEX_PRIMARY,
          );
          console.warn(
            `webhook: charge.refunded ${charge.id} flagged renewal-cycle order for customer ${customerId} (leadSlug=${recurringOrder.leadSlug}, tier=${recurringOrder.tier}) via Stripe Customer correlation — no Checkout Session exists for a renewal charge`,
          );
        } catch (e) {
          console.error(
            `Failed to mark renewal-cycle order refunded for customer ${customerId} after charge.refunded ${charge.id}`,
            e,
          );
          await captureError(e, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "bundle_order_refund",
          });
          const failure = webhookFulfillmentFailureResponse("bundle_order_refund");
          return NextResponse.json(failure.body, { status: failure.status });
        }
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
          await captureError(e, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "bundle_order_refund",
          });
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
        await captureError(e, {
          component: "stripe-webhook",
          eventType: event.type,
          eventId: event.id,
          failureKind: "commerce_order_refund",
        });
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
        await captureError(e, {
          component: "stripe-webhook",
          eventType: event.type,
          eventId: event.id,
          failureKind: "commerce_order_dispute_session_lookup",
        });
        const failure = webhookFulfillmentFailureResponse(
          "commerce_order_dispute_session_lookup",
        );
        return NextResponse.json(failure.body, { status: failure.status });
      }
      const disputeSession = disputeSessions.data[0];
      if (!disputeSession) {
        // Same renewal-cycle gap as charge.refunded above. Unlike Charge,
        // Dispute carries no `.customer` field of its own — retrieve the
        // PaymentIntent to read its Customer id, then correlate the same way
        // — including the same orderHadRecurringEntitlement (not
        // orderGrantsSoldCapabilityEntitlement) choice; see the doc comment
        // on the charge.refunded fallback above for why.
        let disputePaymentIntent: Stripe.PaymentIntent;
        try {
          disputePaymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        } catch (e) {
          console.error(
            `Failed to retrieve PaymentIntent ${paymentIntentId} for charge.dispute.created ${dispute.id}`,
            e,
          );
          await captureError(e, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "bundle_order_dispute_renewal_payment_intent_lookup",
          });
          const failure = webhookFulfillmentFailureResponse(
            "bundle_order_dispute_renewal_payment_intent_lookup",
          );
          return NextResponse.json(failure.body, { status: failure.status });
        }
        const disputeCustomerId = stripeCustomerIdFromUnknown(disputePaymentIntent.customer);
        let disputeRecurringOrder: OrderRecord | undefined;
        try {
          disputeRecurringOrder = await findRecurringOrderByStripeCustomerId(disputeCustomerId);
        } catch (e) {
          console.error(
            `Failed to look up orders for customer ${disputeCustomerId} after charge.dispute.created ${dispute.id}`,
            e,
          );
          await captureError(e, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "bundle_order_renewal_customer_lookup",
          });
          const failure = webhookFulfillmentFailureResponse(
            "bundle_order_renewal_customer_lookup",
          );
          return NextResponse.json(failure.body, { status: failure.status });
        }
        if (!disputeRecurringOrder) {
          console.warn(
            `webhook: charge.dispute.created ${dispute.id} payment_intent=${paymentIntentId} matched no Checkout Session or renewal-cycle order — not one of our commerce orders, skipping`,
          );
          break;
        }
        if (disputeRecurringOrder.disputedAt) {
          // Already flagged (Stripe redelivery) — idempotent no-op.
          break;
        }
        try {
          await markOrderDisputed(
            disputeRecurringOrder.stripeSessionId,
            new Date().toISOString(),
            WEBHOOK_CONVEX_PRIMARY,
          );
          console.warn(
            `webhook: charge.dispute.created ${dispute.id} flagged renewal-cycle order for customer ${disputeCustomerId} (leadSlug=${disputeRecurringOrder.leadSlug}, tier=${disputeRecurringOrder.tier}) via PaymentIntent Customer correlation — no Checkout Session exists for a renewal charge`,
          );
        } catch (e) {
          console.error(
            `Failed to mark renewal-cycle order disputed for customer ${disputeCustomerId} after charge.dispute.created ${dispute.id}`,
            e,
          );
          await captureError(e, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "bundle_order_dispute",
          });
          const failure = webhookFulfillmentFailureResponse("bundle_order_dispute");
          return NextResponse.json(failure.body, { status: failure.status });
        }
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
          await captureError(e, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "bundle_order_dispute",
          });
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
        await captureError(e, {
          component: "stripe-webhook",
          eventType: event.type,
          eventId: event.id,
          failureKind: "commerce_order_dispute",
        });
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
        await captureError(e, {
          component: "stripe-webhook",
          eventType: event.type,
          eventId: event.id,
          failureKind: "commerce_order_dispute_closed_session_lookup",
        });
        const failure = webhookFulfillmentFailureResponse(
          "commerce_order_dispute_closed_session_lookup",
        );
        return NextResponse.json(failure.body, { status: failure.status });
      }
      const closedDisputeSession = closedDisputeSessions.data[0];
      if (!closedDisputeSession) {
        // Same renewal-cycle gap as charge.dispute.created's own fallback
        // above: a renewal charge's PaymentIntent is never attached to a
        // Checkout Session, so this closed event misses the lookup the same
        // way the opened event does. Dispute carries no `.customer` field of
        // its own — retrieve the PaymentIntent to read its Customer id, same
        // as charge.dispute.created. See
        // renewal-charge-refund-dispute-customer-correlation and
        // commerce-order-dispute-closed-resolution.
        let closedDisputePaymentIntent: Stripe.PaymentIntent;
        try {
          closedDisputePaymentIntent = await stripe.paymentIntents.retrieve(
            closedPaymentIntentId,
          );
        } catch (e) {
          console.error(
            `Failed to retrieve PaymentIntent ${closedPaymentIntentId} for charge.dispute.closed ${closedDispute.id}`,
            e,
          );
          await captureError(e, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "bundle_order_dispute_renewal_payment_intent_lookup",
          });
          const failure = webhookFulfillmentFailureResponse(
            "bundle_order_dispute_renewal_payment_intent_lookup",
          );
          return NextResponse.json(failure.body, { status: failure.status });
        }
        const closedDisputeCustomerId = stripeCustomerIdFromUnknown(
          closedDisputePaymentIntent.customer,
        );
        let closedDisputeRecurringOrder: OrderRecord | undefined;
        try {
          closedDisputeRecurringOrder = await findRecurringOrderByStripeCustomerId(
            closedDisputeCustomerId,
          );
        } catch (e) {
          console.error(
            `Failed to look up orders for customer ${closedDisputeCustomerId} after charge.dispute.closed ${closedDispute.id}`,
            e,
          );
          await captureError(e, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "bundle_order_renewal_customer_lookup",
          });
          const failure = webhookFulfillmentFailureResponse(
            "bundle_order_renewal_customer_lookup",
          );
          return NextResponse.json(failure.body, { status: failure.status });
        }
        if (!closedDisputeRecurringOrder) {
          console.warn(
            `webhook: charge.dispute.closed ${closedDispute.id} payment_intent=${closedPaymentIntentId} matched no Checkout Session or renewal-cycle order — not one of our commerce orders, skipping`,
          );
          break;
        }
        if (disputeStatusClearsDisputeFlag(closedDispute.status)) {
          if (!closedDisputeRecurringOrder.disputedAt) {
            // Already clear (Stripe redelivery, or created never marked) — idempotent.
            break;
          }
          try {
            await clearOrderDisputed(
              closedDisputeRecurringOrder.stripeSessionId,
              WEBHOOK_CONVEX_PRIMARY,
            );
            console.warn(
              `webhook: charge.dispute.closed ${closedDispute.id} status=${closedDispute.status} cleared renewal-cycle order disputed flag for customer ${closedDisputeCustomerId} (leadSlug=${closedDisputeRecurringOrder.leadSlug}, tier=${closedDisputeRecurringOrder.tier}) via PaymentIntent Customer correlation — no Checkout Session exists for a renewal charge`,
            );
          } catch (e) {
            console.error(
              `Failed to clear renewal-cycle order disputed for customer ${closedDisputeCustomerId} after charge.dispute.closed ${closedDispute.id}`,
              e,
            );
            await captureError(e, {
              component: "stripe-webhook",
              eventType: event.type,
              eventId: event.id,
              failureKind: "bundle_order_dispute_clear",
            });
            const failure = webhookFulfillmentFailureResponse("bundle_order_dispute_clear");
            return NextResponse.json(failure.body, { status: failure.status });
          }
          break;
        }
        // lost (or any non-clearing closed status): ensure disputedAt is set —
        // created may have been missed (out-of-order delivery / prior handler gap).
        if (closedDisputeRecurringOrder.disputedAt) {
          break;
        }
        try {
          await markOrderDisputed(
            closedDisputeRecurringOrder.stripeSessionId,
            new Date().toISOString(),
            WEBHOOK_CONVEX_PRIMARY,
          );
          console.warn(
            `webhook: charge.dispute.closed ${closedDispute.id} status=${closedDispute.status} flagged renewal-cycle order disputed for customer ${closedDisputeCustomerId} (leadSlug=${closedDisputeRecurringOrder.leadSlug}, tier=${closedDisputeRecurringOrder.tier}) via PaymentIntent Customer correlation — no Checkout Session exists for a renewal charge`,
          );
        } catch (e) {
          console.error(
            `Failed to mark renewal-cycle order disputed for customer ${closedDisputeCustomerId} after charge.dispute.closed ${closedDispute.id}`,
            e,
          );
          await captureError(e, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "bundle_order_dispute",
          });
          const failure = webhookFulfillmentFailureResponse("bundle_order_dispute");
          return NextResponse.json(failure.body, { status: failure.status });
        }
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
            await captureError(e, {
              component: "stripe-webhook",
              eventType: event.type,
              eventId: event.id,
              failureKind: "bundle_order_dispute_clear",
            });
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
          await captureError(e, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "bundle_order_dispute",
          });
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
          await captureError(e, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "commerce_order_dispute_clear",
          });
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
        await captureError(e, {
          component: "stripe-webhook",
          eventType: event.type,
          eventId: event.id,
          failureKind: "commerce_order_dispute",
        });
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
        await captureError(e, {
          component: "stripe-webhook",
          eventType: event.type,
          eventId: event.id,
          failureKind: "commerce_order_refund_reversed_charge_lookup",
        });
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
        await captureError(e, {
          component: "stripe-webhook",
          eventType: event.type,
          eventId: event.id,
          failureKind: "commerce_order_refund_reversed_session_lookup",
        });
        const failure = webhookFulfillmentFailureResponse(
          "commerce_order_refund_reversed_session_lookup",
        );
        return NextResponse.json(failure.body, { status: failure.status });
      }
      const reversedRefundSession = reversedRefundSessions.data[0];
      if (!reversedRefundSession) {
        // Same renewal-cycle gap as charge.refunded's own fallback above: a
        // renewal charge's PaymentIntent is never attached to a Checkout
        // Session, so this reversal event misses the lookup the same way the
        // opened event does. refreshedRefundCharge was already re-fetched
        // above for the aggregate amount_refunded recheck — reuse its
        // .customer rather than a second Stripe API call. See
        // renewal-charge-refund-dispute-customer-correlation and
        // commerce-order-refund-reversal-tracking.
        const reversedRefundCustomerId = stripeCustomerIdFromUnknown(
          refreshedRefundCharge.customer,
        );
        let reversedRecurringOrder: OrderRecord | undefined;
        try {
          reversedRecurringOrder = await findRecurringOrderByStripeCustomerId(
            reversedRefundCustomerId,
          );
        } catch (e) {
          console.error(
            `Failed to look up orders for customer ${reversedRefundCustomerId} after refund.updated ${refund.id}`,
            e,
          );
          await captureError(e, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "bundle_order_renewal_customer_lookup",
          });
          const failure = webhookFulfillmentFailureResponse(
            "bundle_order_renewal_customer_lookup",
          );
          return NextResponse.json(failure.body, { status: failure.status });
        }
        if (!reversedRecurringOrder) {
          console.warn(
            `webhook: refund.updated ${refund.id} payment_intent=${refundPaymentIntentId} matched no Checkout Session or renewal-cycle order — not one of our commerce orders, skipping`,
          );
          break;
        }
        if (!reversedRecurringOrder.refundedAt) {
          // Nothing to clear (Stripe redelivery, or refundedAt was never set) — idempotent.
          break;
        }
        try {
          await clearOrderRefunded(
            reversedRecurringOrder.stripeSessionId,
            WEBHOOK_CONVEX_PRIMARY,
          );
          console.warn(
            `webhook: refund.updated ${refund.id} status=${refund.status} cleared renewal-cycle order refunded flag for customer ${reversedRefundCustomerId} (leadSlug=${reversedRecurringOrder.leadSlug}, tier=${reversedRecurringOrder.tier}) via Stripe Customer correlation — no Checkout Session exists for a renewal charge`,
          );
        } catch (e) {
          console.error(
            `Failed to clear renewal-cycle order refunded for customer ${reversedRefundCustomerId} after refund.updated ${refund.id}`,
            e,
          );
          await captureError(e, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "bundle_order_refund_clear",
          });
          const failure = webhookFulfillmentFailureResponse("bundle_order_refund_clear");
          return NextResponse.json(failure.body, { status: failure.status });
        }
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
          await captureError(e, {
            component: "stripe-webhook",
            eventType: event.type,
            eventId: event.id,
            failureKind: "bundle_order_refund_clear",
          });
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
        await captureError(e, {
          component: "stripe-webhook",
          eventType: event.type,
          eventId: event.id,
          failureKind: "commerce_order_refund_clear",
        });
        const failure = webhookFulfillmentFailureResponse("commerce_order_refund_clear");
        return NextResponse.json(failure.body, { status: failure.status });
      }
      break;
    }
    case "account.updated": {
      // Webhook-driven refresh for the Stripe Connect onboarding status cache
      // (account-updated-connect-status-refresh) — closes a gap where the
      // ONLY way stripeConnectChargesEnabled/PayoutsEnabled/DetailsSubmitted
      // ever got refreshed was an operator's manual "Check status" click
      // (checkStripeConnectAccountStatusAction); once an operator stopped
      // re-checking a lead, the "Stripe Connect onboarding incomplete"
      // due-queue signal could never self-correct even after the client
      // actually finished onboarding on Stripe's hosted page. Requires the
      // operator to enable "Listen to events on connected accounts" for this
      // webhook endpoint (or add a second Connect-scoped endpoint) in the
      // Stripe Dashboard — see /docs/launch-checklist; this event never
      // arrives otherwise. Status-cache refresh only, same class as the
      // manual check — never a required (5xx-on-failure) write, since this
      // caches a display value, not a ledger entry, and mirrors
      // checkStripeConnectAccountStatusAction's own swallow-and-continue
      // persistence-failure policy. No-op (not an error) when the account id
      // doesn't match any known lead — a Connect account created outside
      // this app, or one whose id was never successfully persisted here.
      const account = event.data.object as Stripe.Account;
      const leads = await getLeads();
      const matchedSlug = findLeadSlugByStripeConnectAccountId(leads, account.id);
      if (!matchedSlug) {
        console.warn(
          `webhook: account.updated ${account.id} matched no lead's stripeConnectAccountId, skipping`,
        );
        break;
      }
      try {
        await updateLeadStripeConnectStatus(
          matchedSlug,
          {
            chargesEnabled: account.charges_enabled ?? false,
            payoutsEnabled: account.payouts_enabled ?? false,
            detailsSubmitted: account.details_submitted ?? false,
          },
          new Date().toISOString(),
          LEAD_STRIPE_CONNECT_STATUS_CONVEX_PRIMARY,
        );
      } catch (e) {
        console.warn(
          `webhook: account.updated ${account.id} failed to persist Connect status cache for lead ${matchedSlug}`,
          e,
        );
        // A swallow-and-continue policy (never a 5xx/retry, see the doc
        // comment above) means this failure has no path back to the outer
        // per-event catch's own captureError call below — the same blind
        // spot orders-recurring-canceled-capture-error and the refund/
        // dispute cluster closed for their own catches, just for a
        // display-cache write instead of a ledger write. Silent here means
        // pipeline-health's connectOnboardingIncompleteCount and the daily
        // digest can both keep reading a stale cache indefinitely with zero
        // signal. See stripe-connect-status-cache-write-capture-error.
        await captureError(e, {
          component: "stripe-connect-status",
          failureKind: "account_updated_webhook",
          leadSlug: matchedSlug,
        });
      }
      break;
    }
    default:
      break;
    }
  } catch (error) {
    await captureError(error, {
      component: "stripe-webhook",
      eventType: event.type,
      eventId: event.id,
    });
    throw error;
  }

  return NextResponse.json({ received: true });
}
