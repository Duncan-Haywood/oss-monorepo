import type Stripe from "stripe";
import { shippingAddressCollectionCountries } from "./buyer-shipping";
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
    // The order summary quotes shipping in the total the buyer agrees to, so
    // the session has to charge it. Without this the quoted shipping was
    // displayed, never collected, and absorbed out of the artist's margin.
    shipping_options:
      payload.shippingAmountCents > 0
        ? [
            {
              shipping_rate_data: {
                type: "fixed_amount",
                display_name: "Standard delivery",
                fixed_amount: {
                  amount: payload.shippingAmountCents,
                  currency: payload.currency,
                },
              },
            },
          ]
        : undefined,
    // Only when a deployment has a tax registration configured. Stripe rejects
    // a session that asks for automatic tax without one, so the default is off
    // and the order summary tells the buyer no tax is being charged.
    automatic_tax: payload.automaticTax ? { enabled: true } : undefined,
    success_url: payload.successUrl,
    cancel_url: payload.cancelUrl,
    metadata: payload.metadata,
    // The storefront promises prints "shipped directly to your door" and the
    // fulfillment partners need a real recipient. Without this, Stripe never
    // asks for one and every order reaches the print partner addressless.
    shipping_address_collection: {
      allowed_countries: shippingAddressCollectionCountries(
        payload.shippingRegion,
      ) as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
    },
    // Stripe copies the address collected above onto the PaymentIntent, which
    // is the object the fulfillment webhook receives.
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
