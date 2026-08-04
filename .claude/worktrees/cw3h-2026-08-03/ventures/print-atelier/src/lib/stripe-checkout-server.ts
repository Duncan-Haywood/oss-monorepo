import type Stripe from "stripe";
import type { CheckoutSessionPayload } from "./checkout";

export type StripeCheckoutCreateParams = Stripe.Checkout.SessionCreateParams;

export function buildStripeCheckoutCreateParams(
  payload: CheckoutSessionPayload,
): StripeCheckoutCreateParams {
  return {
    mode: payload.mode,
    currency: payload.currency,
    line_items: payload.lineItems.map((item) => ({
      price_data: {
        currency: payload.currency,
        product_data: {
          name: item.name,
        },
        unit_amount: item.unitAmountCents,
      },
      quantity: item.quantity,
    })),
    success_url: payload.successUrl,
    cancel_url: payload.cancelUrl,
    metadata: payload.metadata,
    payment_intent_data: {
      metadata: payload.metadata,
    },
  };
}

export type StripeCheckoutSessionResult = {
  sessionId: string;
  checkoutUrl: string;
  livemode: boolean;
};

export async function createStripeCheckoutSession(
  payload: CheckoutSessionPayload,
  secretKey: string,
): Promise<StripeCheckoutSessionResult> {
  const StripeSdk = (await import("stripe")).default;
  const stripe = new StripeSdk(secretKey, {
    apiVersion: "2025-02-24.acacia",
  });

  const params = buildStripeCheckoutCreateParams(payload);
  const session = await stripe.checkout.sessions.create(params);

  if (!session.url) {
    throw new Error("Stripe Checkout session created without redirect URL");
  }

  return {
    sessionId: session.id,
    checkoutUrl: session.url,
    livemode: session.livemode,
  };
}
