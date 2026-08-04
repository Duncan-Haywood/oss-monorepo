import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/api-auth";
import {
  getStripeWebhookEnvStatus,
  processStripeConnectWebhookEvent,
  type StripeConnectWebhookEvent,
} from "@/lib/stripe-connect";
import { recordOrderFromPaymentWebhook } from "@/lib/orders";
import {
  queueGelatoFulfillmentFromOrder,
  recordGelatoFulfillmentSubmission,
} from "@/lib/gelato-orders";
import {
  queuePrintfulFulfillmentFromOrder,
  recordPrintfulFulfillmentSubmission,
} from "@/lib/printful-orders";
import { recordStripeWebhookToLedger } from "@/lib/stripe-ledger";
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
  const ledgerEntry = recordStripeWebhookToLedger(event.id, event.type, result);
  const paymentObject = event.data.object as Record<string, unknown>;
  const paymentMetadata =
    typeof paymentObject.metadata === "object" && paymentObject.metadata !== null
      ? (paymentObject.metadata as Record<string, unknown>)
      : {};

  const orderRecord = recordOrderFromPaymentWebhook(
    event.id,
    event.type,
    paymentObject,
    !event.livemode,
  );

  let fulfillmentSubmission = null;
  if (orderRecord) {
    if (orderRecord.fulfillmentPartnerId === "gelato") {
      fulfillmentSubmission = await queueGelatoFulfillmentFromOrder(
        orderRecord,
        paymentMetadata,
        {
          GELATO_API_KEY: process.env.GELATO_API_KEY,
          GELATO_STORE_ID: process.env.GELATO_STORE_ID,
        },
        process.env.GELATO_API_KEY && process.env.GELATO_STORE_ID ? fetch : undefined,
      );
      if (fulfillmentSubmission) {
        recordGelatoFulfillmentSubmission(fulfillmentSubmission);
      }
    } else {
      fulfillmentSubmission = await queuePrintfulFulfillmentFromOrder(
        orderRecord,
        paymentMetadata,
        {
          PRINTFUL_API_KEY: process.env.PRINTFUL_API_KEY,
          PRINTFUL_STORE_ID: process.env.PRINTFUL_STORE_ID,
        },
        process.env.PRINTFUL_API_KEY && process.env.PRINTFUL_STORE_ID ? fetch : undefined,
      );
      if (fulfillmentSubmission) {
        recordPrintfulFulfillmentSubmission(fulfillmentSubmission);
      }
    }
  }

  return NextResponse.json({
    received: true,
    ledgerRecorded: Boolean(ledgerEntry),
    ledgerId: ledgerEntry?.ledgerId ?? null,
    orderRecorded: Boolean(orderRecord),
    orderId: orderRecord?.orderId ?? null,
    fulfillmentQueued: Boolean(fulfillmentSubmission),
    fulfillmentPartner: fulfillmentSubmission?.partner ?? null,
    fulfillmentStatus: fulfillmentSubmission?.status ?? null,
    ...result,
  });
}

/**
 * Operator-only, unlike the POST above. Stripe never calls GET; this is the
 * diagnostic that reports which of `STRIPE_SECRET_KEY`,
 * `STRIPE_WEBHOOK_SECRET` and `STRIPE_CONNECT_CLIENT_ID` are configured. That
 * is a read of the server's secret configuration, and it answered anonymous
 * callers.
 */
export async function GET(request: Request) {
  const denied = requireOperator(request);
  if (denied) {
    return denied;
  }

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
