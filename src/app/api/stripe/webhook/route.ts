import { NextResponse } from "next/server";
import Stripe from "stripe";
import { recordLeadPayment } from "@/lib/db";

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

      if (slug && tier) {
        try {
          await recordLeadPayment({
            slug,
            stripeSessionId: session.id,
            customerEmail,
            tier,
            commerceAddon,
            amountTotal,
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
