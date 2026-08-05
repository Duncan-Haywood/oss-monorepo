import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/api-auth";
import { extractStripeShippingMetadata } from "@/lib/buyer-shipping";
import {
  getStripeWebhookEnvStatus,
  processStripeConnectWebhookEvent,
  type StripeConnectWebhookEvent,
} from "@/lib/stripe-connect";
import {
  OrderStoreCapacityExceededError,
  getOrderStoreDescriptor,
  recordOrderFromPaymentWebhook,
  type OrderRecord,
} from "@/lib/orders";
import { FulfillmentSubmissionStoreCapacityExceededError } from "@/lib/fulfillment-submission-store";
import {
  queueGelatoFulfillmentFromOrder,
  recordGelatoFulfillmentSubmission,
} from "@/lib/gelato-orders";
import {
  queuePrintfulFulfillmentFromOrder,
  recordPrintfulFulfillmentSubmission,
} from "@/lib/printful-orders";
import { recordStripeWebhookToLedger } from "@/lib/stripe-ledger";
import {
  STRIPE_WEBHOOK_MAX_AGE_SECONDS,
  verifyStripeWebhookSignature,
} from "@/lib/stripe-webhook-server";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The subset of the event shape this handler dereferences before use. */
function isWebhookEventShape(value: unknown): boolean {
  return isRecord(value) && isRecord(value.data) && isRecord(value.data.object);
}

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
  // The tolerance is passed explicitly even though it is also the default, so
  // this line states the replay window money arrives under. Dropping the
  // argument is now safe (it resolves to the same 300s); widening it is not
  // possible — the verifier refuses anything above the constant.
  if (
    !verifyStripeWebhookSignature(
      payload,
      signature,
      webhookSecret,
      STRIPE_WEBHOOK_MAX_AGE_SECONDS,
    )
  ) {
    return NextResponse.json({ error: "Invalid Stripe webhook signature" }, { status: 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  // A signature only proves the payload came from Stripe, not that it has the
  // shape this handler dereferences. `event.data.object` on an event without
  // `data` threw a TypeError, which Next surfaces as a 500 — and Stripe retries
  // 5xx, so one malformed event would be redelivered indefinitely. Reject the
  // shape explicitly instead.
  if (!isWebhookEventShape(parsed)) {
    return NextResponse.json(
      { error: "Malformed Stripe event: expected an object with `data.object`" },
      { status: 400 },
    );
  }
  const event = parsed as StripeConnectWebhookEvent;

  const result = processStripeConnectWebhookEvent(event);
  const ledgerEntry = recordStripeWebhookToLedger(event.id, event.type, result);
  const paymentObject = event.data.object as Record<string, unknown>;
  const rawMetadata =
    typeof paymentObject.metadata === "object" && paymentObject.metadata !== null
      ? (paymentObject.metadata as Record<string, unknown>)
      : {};
  // Stripe does not put a collected shipping address in `metadata` — it hangs
  // it off the PaymentIntent as `shipping`. The fulfillment adapters read
  // metadata, so lift it across here rather than teaching each adapter the
  // event shape. Explicit metadata wins, so a manually corrected address is not
  // overwritten by the one the buyer first typed.
  const paymentMetadata: Record<string, unknown> = {
    ...extractStripeShippingMetadata(paymentObject),
    ...rawMetadata,
  };

  // A 200 on this endpoint tells Stripe the order is safely written down and
  // stops redelivery. If the store refused the record, that acknowledgement
  // would be false and the only copy of a paid order would be gone. Return 5xx
  // instead and let Stripe retry.
  let orderRecord: OrderRecord | null = null;
  try {
    orderRecord = recordOrderFromPaymentWebhook(
      event.id,
      event.type,
      paymentObject,
      !event.livemode,
    );
  } catch (error) {
    if (error instanceof OrderStoreCapacityExceededError) {
      return NextResponse.json(
        {
          error: "Order store refused the record; payment not acknowledged",
          reason: error.message,
          storeKind: error.storeKind,
          capacity: error.capacity,
          orderRecorded: false,
          hint:
            "Configure a durable order store. Stripe will retry this event; it has not been " +
            "acknowledged.",
        },
        { status: 503 },
      );
    }
    throw error;
  }

  // Same rule as the order record above, for the same reason. The submission is
  // the only record that this paid order's fulfillment was attempted — and, when
  // it is blocked, the only thing that will ever tell an operator so. A 200 over
  // a refused submission stops Stripe redelivering the one event that could
  // recreate it.
  let fulfillmentSubmission = null;
  try {
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
  } catch (error) {
    if (error instanceof FulfillmentSubmissionStoreCapacityExceededError) {
      return NextResponse.json(
        {
          error: "Fulfillment submission store refused the record; payment not acknowledged",
          reason: error.message,
          storeKind: error.storeKind,
          capacity: error.capacity,
          partner: error.partner,
          orderRecorded: Boolean(orderRecord),
          orderId: orderRecord?.orderId ?? null,
          fulfillmentRecorded: false,
          hint:
            "Configure a durable fulfillment submission store. Stripe will retry this event; " +
            "it has not been acknowledged.",
        },
        { status: 503 },
      );
    }
    throw error;
  }

  return NextResponse.json({
    received: true,
    ledgerRecorded: Boolean(ledgerEntry),
    ledgerId: ledgerEntry?.ledgerId ?? null,
    orderRecorded: Boolean(orderRecord),
    orderId: orderRecord?.orderId ?? null,
    // `orderRecorded` only means the record was accepted by whatever store is
    // configured. Whether it survives this process is a separate question, and
    // the answer is currently no.
    orderDurable: getOrderStoreDescriptor().durable,
    orderStoreKind: getOrderStoreDescriptor().kind,
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
