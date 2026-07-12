import { NextResponse } from "next/server";
import Stripe from "stripe";
import { markCheckoutSessionComplete, recordLeadPayment } from "@/lib/db";
import { stripeCustomerIdFromUnknown } from "@/lib/billing/portal";

/**
 * Stripe webhook receiver — verifies the signature, then acknowledges the
 * events the checkout flow can produce. See /docs/roadmap#phase-3-payments.
 */

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
        if (orderSlug) {
          try {
            const {
              getLeadBySlug,
              getCommerceCatalog,
              insertClientInquiry,
              insertCommerceOrder,
            } = await import("@/lib/db");
            const { commerceOrderPaidInquiryMessage } = await import("@/lib/commerce/catalog");
            const [lead, catalog] = await Promise.all([
              getLeadBySlug(orderSlug),
              getCommerceCatalog(orderSlug),
            ]);
            const skuName = catalog?.items.find((item) => item.id === skuId)?.name ?? "Catalog item";
            await Promise.all([
              insertClientInquiry({
                leadSlug: orderSlug,
                businessName: lead?.businessName || orderSlug,
                email: customerEmail || undefined,
                message: commerceOrderPaidInquiryMessage({
                  skuName,
                  amountTotalUsd: amountTotal,
                  stripeSessionId: session.id,
                  skuId,
                }),
                source: "commerce_checkout",
              }),
              skuId
                ? insertCommerceOrder({
                    leadSlug: orderSlug,
                    skuId,
                    skuName,
                    amountPaidUsd: amountTotal,
                    stripeSessionId: session.id,
                  })
                : Promise.resolve(),
            ]);
          } catch (e) {
            console.error(`Failed to record commerce order inquiry for ${orderSlug}`, e);
          }
        } else {
          console.warn("webhook: commerce_sku session missing slug metadata", session.id);
        }
        break;
      }

      try {
        await markCheckoutSessionComplete(session.id);
      } catch (e) {
        console.warn(`Failed to mark checkout session ${session.id} complete`, e);
      }

      if (slug && tier) {
        try {
          await recordLeadPayment({
            slug,
            stripeSessionId: session.id,
            customerEmail,
            tier,
            commerceAddon,
            amountTotal,
            stripeCustomerId,
          });
          console.log(`Payment successfully recorded in SQLite for lead ${slug}`);

          // Trigger receipt email
          const { getLeadBySlug } = await import("@/lib/db");
          const { sendReceiptEmail } = await import("@/lib/email/resend");
          const lead = await getLeadBySlug(slug);
          const businessName = lead?.businessName || slug;

          if (customerEmail) {
            await sendReceiptEmail(customerEmail, businessName, tier, amountTotal);
          }

          // Phase 5: queue production deploy + DNS handoff (stub when Vercel unset)
          const { enqueueProductionHandoff, formatDnsInstructionsForEmail } = await import(
            "@/lib/deploy/handoff"
          );
          const handoff = await enqueueProductionHandoff({
            leadSlug: slug,
            businessName,
            tier,
            commerceAddon,
            stripeSessionId: session.id,
            customerEmail,
          });
          console.log(
            `Production handoff queued for ${slug}: ${handoff.status} → ${handoff.suggestedHost}`,
          );

          if (customerEmail) {
            const { sendEmail } = await import("@/lib/email/resend");
            const { brand } = await import("@/lib/brand");
            await sendEmail({
              to: customerEmail,
              subject: `Next steps: go live with ${businessName} — ${brand.name}`,
              leadSlug: slug,
              html: `
                <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">Your site is ready to publish</h2>
                <p style="margin-bottom: 16px;">Payment received for <strong>${businessName}</strong>. Here is your production handoff:</p>
                ${formatDnsInstructionsForEmail(handoff)}
                <p style="margin-bottom: 8px;">Reply to this email if you want us to finish DNS for you.</p>
                <p style="font-weight: 500; margin-top: 0;">The ${brand.name} Team</p>
              `,
            });
          }
        } catch (dbError) {
          console.error(`Failed to record lead payment or send email for ${slug}:`, dbError);
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
