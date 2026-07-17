import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  markCheckoutSessionComplete,
  markCheckoutSessionOpen,
  markCompleteOpenBundleCheckoutSessionsForLead,
  markCompleteOpenCommerceCheckoutSessionsForLeadSkuCustomer,
  markOrdersRecurringCanceledByCustomer,
  recordLeadPayment,
} from "@/lib/db";
import { normalizeCheckoutCustomerEmailForMatch } from "@/lib/checkout/abandoned-recovery";
import { stripeCustomerIdFromUnknown } from "@/lib/billing/portal";
import {
  parseCommerceCheckoutSkuId,
  parseCommerceCheckoutSlug,
} from "@/lib/commerce/checkout-fields";
import { parseLeadSlugLookup } from "@/lib/leads/slug";
import { leadPreviewAbsoluteUrl } from "@/lib/leads/slug-path";
import { isStripeCheckoutCurrencyUsd } from "@/lib/payments/checkout-currency";
import { isStripeCheckoutSessionPaid } from "@/lib/payments/checkout-payment-status";
import {
  bundleCatalogPriceIdsFromEnv,
  sessionLineItemsIncludePriceId,
  sessionLineItemsMatchBundleCatalogPrices,
} from "@/lib/payments/checkout-price-line-items";
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
 * before recordLeadPayment / handoff / receipt — a truthy metadata.slug /
 * tier / commerceAddon alone is not enough (Dashboard-minted or tampered
 * Checkout Sessions). Over-long slug (parseLeadSlugLookup), unknown tier,
 * missing catalog Prices on line items, non-USD currency, or amount mismatch
 * skips like missing slug/tier (session already marked complete; do not 5xx
 * forever). listLineItems failures return 500 so Stripe retries.
 *
 * Commerce Buy now create already hard-rejects over-long slug via
 * parseCommerceCheckoutSlug, 404s when skuId is not in the lead catalog, and
 * resolves Price from catalog.stripePriceId (never trusts a client amount;
 * stripe-sync Prices are currency:"usd"); the commerce_sku branch must mirror
 * that slug length gate, catalog membership gate (plus
 * parseCommerceCheckoutSkuId length), require catalog.stripePriceId on
 * listLineItems, require session.currency === "usd", AND require
 * session.amount_total (integer cents) === catalogItem.priceCents before
 * insertCommerceOrder / inquiry / client receipt — a truthy slug/skuId alone
 * is not enough (unknown ids must not fall back to "Catalog item"; a
 * mismatched Price/currency/amount must not skew payouts / client receipts;
 * an over-long slug must not burn getLeadBySlug / getCommerceCatalog).
 * Unknown/over-long slug/skuId, missing/unsynced stripePriceId, Price not on
 * line items, non-USD currency, or amount mismatch skips like missing skuId
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
 * When NEXT_PUBLIC_CONVEX_URL is set, fulfillment writes pass requireConvex so
 * a Convex failure does not silently land only in instance-local SQLite
 * (multi-instance split-brain). Dashboard paths keep the SQLite fallback.
 */

/** Webhook revenue path: fail closed when Convex is configured but unreachable. */
const WEBHOOK_CONVEX_PRIMARY = { requireConvex: true } as const;

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
            markCommerceOrderClientReceiptSent,
          } = await import("@/lib/db");
          const { commerceOrderPaidInquiryMessage } = await import("@/lib/commerce/catalog");
          const {
            hasCommerceClientReceiptSentMarker,
            planCommerceWebhookSideEffects,
          } = await import("@/lib/commerce/side-effect-recovery");
          const [lead, catalog] = await Promise.all([
            getLeadBySlug(orderSlug),
            getCommerceCatalog(orderSlug),
          ]);
          const catalogItem = catalog?.items.find((item) => item.id === knownSkuId);
          if (!catalogItem) {
            console.warn(
              `webhook: commerce_sku session ${session.id} for ${orderSlug} unknown skuId ${knownSkuId} — skipping ledger/inquiry/client receipt`,
            );
            break;
          }
          // Mirror Buy now create: charges catalog.stripePriceId (501 when
          // unsynced). Amount+currency gates alone do not prove which Price
          // was on the Session — require the catalog Price id on line items.
          const catalogPriceId = catalogItem.stripePriceId?.trim() ?? "";
          if (!catalogPriceId) {
            console.warn(
              `webhook: commerce_sku session ${session.id} for ${orderSlug} skuId ${knownSkuId} missing catalog stripePriceId — skipping ledger/inquiry/client receipt`,
            );
            break;
          }
          try {
            const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
              limit: 100,
            });
            const lineItemPriceIds = priceIdsFromStripeLineItems(lineItems.data);
            if (!sessionLineItemsIncludePriceId(lineItemPriceIds, catalogPriceId)) {
              console.warn(
                `webhook: commerce_sku session ${session.id} for ${orderSlug} skuId ${knownSkuId} catalog Price ${catalogPriceId} not on line items — skipping ledger/inquiry/client receipt`,
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
          // Mirror Buy now create: Price comes from catalog.stripePriceId, so
          // charged cents must equal catalogItem.priceCents. A Dashboard-minted
          // or tampered session with a valid skuId but a different Stripe Price
          // must not skew the Commerce ledger / client receipt.
          const amountCents = session.amount_total;
          if (
            typeof amountCents !== "number" ||
            !Number.isInteger(amountCents) ||
            amountCents !== catalogItem.priceCents
          ) {
            console.warn(
              `webhook: commerce_sku session ${session.id} for ${orderSlug} skuId ${knownSkuId} amount_total ${String(
                amountCents,
              )} !== catalog priceCents ${catalogItem.priceCents} — skipping ledger/inquiry/client receipt`,
            );
            break;
          }
          const amountPaidUsd = amountCents / 100;
          const skuName = catalogItem.name;
          const businessName = lead?.businessName || orderSlug;

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
                    await markCommerceOrderClientReceiptSent(
                      session.id,
                      new Date().toISOString(),
                      WEBHOOK_CONVEX_PRIMARY,
                    );
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
                  console.error(
                    `Commerce client receipt not sent for ${orderSlug} (${sent.reason ?? sent.error ?? "unknown"}) — leaving sent-marker unwritten so redelivery retries`,
                  );
                }
              } catch (emailError) {
                console.error(
                  `Failed to email commerce client receipt for ${orderSlug}`,
                  emailError,
                );
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

        const expectedCents = expectedBundleCheckoutAmountCents(bundle, commerceAddon);
        const amountCents = session.amount_total;
        if (
          typeof amountCents !== "number" ||
          !Number.isInteger(amountCents) ||
          amountCents !== expectedCents
        ) {
          console.warn(
            `webhook: bundle session ${session.id} for ${slug} tier ${knownTier} amount_total ${String(
              amountCents,
            )} !== catalog expectedCents ${expectedCents} (commerceAddon=${String(
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

        // Receipt / DNS emails — best-effort send; durable note marker after
        // each successful send so redelivery can skip only what already went out.
        // Marker write failure returns 5xx so Stripe retries (accept one possible
        // duplicate rather than unbounded re-sends with no marker).
        try {
          const { sendReceiptEmail, sendEmail } = await import("@/lib/email/resend");
          const { formatDnsInstructionsForEmail } = await import("@/lib/deploy/handoff");
          const { brand } = await import("@/lib/brand");
          const { escapeHtmlForEmail } = await import("@/lib/inquiries/reply");

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
                console.error(
                  `Receipt email not sent for ${slug} (${sent.reason ?? sent.error ?? "unknown"}) — leaving sent-marker unwritten so redelivery retries`,
                );
              }
            } catch (emailError) {
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
                console.error(
                  `DNS handoff email not sent for ${slug} (${sent.reason ?? sent.error ?? "unknown"}) — leaving sent-marker unwritten so redelivery retries`,
                );
              }
            } catch (emailError) {
              console.error(`Failed to send DNS handoff email for ${slug}:`, emailError);
            }
          }
        } catch (emailError) {
          console.error(`Failed to send receipt/DNS emails for ${slug}:`, emailError);
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
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
