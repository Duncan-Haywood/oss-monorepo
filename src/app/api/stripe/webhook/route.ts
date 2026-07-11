import { NextResponse } from "next/server";
import Stripe from "stripe";

/**
 * Stripe webhook receiver — verifies the signature, then acknowledges the
 * events the checkout flow can produce. See /docs/roadmap#phase-3-payments.
 *
 * Fulfillment (persisting a paid order, triggering production deploy,
 * sending a receipt email) is intentionally not implemented here yet: it
 * depends on the "database" and "outbound-email" backlog items in
 * src/lib/process/prompt_process.tsx. Until those land, a successful
 * payment is only durably recorded in Stripe itself — check the Stripe
 * Dashboard, not this app, for the source of truth on paid orders.
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
      // TODO(database backlog item): persist { tier, commerceAddon, slug } from
      // session.metadata against a lead/order record instead of just logging.
      // TODO(outbound-email backlog item): send a receipt email via Resend.
      console.log("checkout.session.completed", {
        sessionId: session.id,
        customerEmail: session.customer_details?.email ?? session.customer_email,
        metadata: session.metadata,
        amountTotal: session.amount_total,
        mode: session.mode,
      });
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
