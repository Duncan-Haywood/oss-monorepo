import { NextResponse } from "next/server";
import {
  getStripeWebhookEnvStatus,
  processStripeConnectWebhookEvent,
  type StripeConnectWebhookEvent,
} from "@/lib/stripe-connect";
import { verifyStripeWebhookSignature } from "@/lib/stripe-webhook-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  const envStatus = getStripeWebhookEnvStatus({
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_CONNECT_CLIENT_ID: process.env.STRIPE_CONNECT_CLIENT_ID,
  });

  if (!envStatus.webhookSecretConfigured) {
    return NextResponse.json(
      {
        error: "Stripe webhook secret not configured",
        blockers: envStatus.blockers,
        hint: "Copy STRIPE_WEBHOOK_SECRET from `stripe listen` into .env.local for test mode",
      },
      { status: 503 },
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  if (!verifyStripeWebhookSignature(payload, signature, webhookSecret)) {
    return NextResponse.json({ error: "Invalid Stripe webhook signature" }, { status: 400 });
  }

  let event: StripeConnectWebhookEvent;
  try {
    event = JSON.parse(payload) as StripeConnectWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const result = processStripeConnectWebhookEvent(event);

  return NextResponse.json({
    received: true,
    ...result,
  });
}

export async function GET() {
  const envStatus = getStripeWebhookEnvStatus({
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_CONNECT_CLIENT_ID: process.env.STRIPE_CONNECT_CLIENT_ID,
  });

  return NextResponse.json({
    endpoint: "/api/stripe/webhook",
    methods: ["POST"],
    events: ["transfer.created", "payout.paid", "account.updated", "payment_intent.succeeded"],
    ...envStatus,
  });
}
