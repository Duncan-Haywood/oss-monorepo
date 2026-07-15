import { NextResponse } from "next/server";
import Stripe from "stripe";
import { markCheckoutSessionComplete, recordLeadPayment } from "@/lib/db";
import { stripeCustomerIdFromUnknown } from "@/lib/billing/portal";
import { leadPreviewAbsoluteUrl } from "@/lib/leads/slug-path";
import { webhookFulfillmentFailureResponse } from "@/lib/payments/webhook-fulfillment";

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
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const slug = session.metadata?.slug;
      const tier = session.metadata?.tier;
      const commerceAddon = session.metadata?.commerceAddon === "true";
      const customerEmail = session.customer_details?.email ?? session.customer_email ?? "";
      const amountTotal = session.amount_total ? session.amount_total / 100 : 0;
      const stripeCustomerId = stripeCustomerIdFromUnknown(session.customer) ?? undefined;

      // Commerce catalog "Buy now" purchase (stripe-commerce-products-sync) —
      // a paid order for a client's shop item, not a Local Site Studio bundle
      // purchase. There is no lead payment/deploy-handoff to record here;
      // notify the operator through the existing inquiry inbox instead, the
      // same surface Request-order already uses for unsynced SKUs.
      if (session.metadata?.kind === "commerce_sku") {
        const orderSlug = session.metadata.slug;
        const skuId = session.metadata.skuId;
        try {
          await markCheckoutSessionComplete(session.id, WEBHOOK_CONVEX_PRIMARY);
        } catch (e) {
          console.error(`Failed to mark commerce checkout session ${session.id} complete`, e);
          const failure = webhookFulfillmentFailureResponse("checkout_session_mark_complete");
          return NextResponse.json(failure.body, { status: failure.status });
        }
        if (orderSlug) {
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
            const skuName = catalog?.items.find((item) => item.id === skuId)?.name ?? "Catalog item";
            const businessName = lead?.businessName || orderSlug;

            // Ledger first — commerceOrders is idempotent on stripeSessionId.
            // Inquiry + client receipt are NOT; recover them on Stripe
            // redelivery when missing (session id in inquiry message / receipt
            // sent-marker). skuId is required for the ledger gate — without it
            // we must not fire non-idempotent side effects on every Stripe retry.
            if (!skuId) {
              console.warn(
                `webhook: commerce_sku session ${session.id} for ${orderSlug} missing skuId — skipping inquiry/client receipt`,
              );
              break;
            }

            let alreadyRecorded: boolean;
            try {
              ({ alreadyRecorded } = await insertCommerceOrder(
                {
                  leadSlug: orderSlug,
                  skuId,
                  skuName,
                  amountPaidUsd: amountTotal,
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
                      amountTotalUsd: amountTotal,
                      stripeSessionId: session.id,
                      skuId,
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
                    amountTotalUsd: amountTotal,
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
        } else {
          console.warn("webhook: commerce_sku session missing slug metadata", session.id);
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

      if (slug && tier) {
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
              tier,
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
              tier,
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
              const sent = await sendReceiptEmail(customerEmail, businessName, tier, amountTotal);
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
      } else {
        console.warn("webhook: missing slug or tier in session metadata", session.id);
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
