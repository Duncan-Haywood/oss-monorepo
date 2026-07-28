import assert from "node:assert/strict";
import test from "node:test";
import { buildSampleCheckoutCart, buildCheckoutSessionPayload } from "../src/lib/checkout.ts";
import { buildStripeCheckoutCreateParams } from "../src/lib/stripe-checkout-server.ts";

test("buildStripeCheckoutCreateParams maps session payload to Stripe line_items", () => {
  const cart = buildSampleCheckoutCart();
  const payload = buildCheckoutSessionPayload(cart, "US", "https://printatelier.com", {
    PRINTFUL_API_KEY: "pf_test",
    PRINTFUL_STORE_ID: "pf_store",
  });

  const params = buildStripeCheckoutCreateParams(payload);

  assert.equal(params.mode, "payment");
  assert.equal(params.currency, "usd");
  assert.equal(params.line_items?.length, cart.length);
  assert.equal(params.success_url, payload.successUrl);
  assert.equal(params.cancel_url, payload.cancelUrl);
  assert.equal(params.metadata?.fulfillmentPartnerId, "printful");
  assert.equal(params.payment_intent_data?.metadata?.shippingRegion, "US");
});
