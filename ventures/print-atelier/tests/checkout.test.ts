import assert from "node:assert/strict";
import test from "node:test";
import {
  addArtworkToCheckoutCart,
  buildCheckoutAddHref,
  buildCheckoutFunnelMetrics,
  buildCheckoutReadiness,
  buildCheckoutSessionPayload,
  buildFulfillmentRoute,
  buildSampleCheckoutCart,
  calculateCheckoutTotals,
  describeStorefrontCheckoutAction,
  getCheckoutEnvStatus,
  validateCheckoutLineItem,
} from "../src/lib/checkout.ts";
import { catalogArtworks, defaultListingConsentRecords } from "../src/lib/marketplace.ts";

test("validateCheckoutLineItem allows consent-cleared Live listings with proof", () => {
  const midnight = catalogArtworks.find((art) => art.slug === "midnight-coast");
  assert.ok(midnight);
  const result = validateCheckoutLineItem(midnight, defaultListingConsentRecords);
  assert.equal(result.eligible, true);
  assert.equal(result.blockers.length, 0);
});

test("validateCheckoutLineItem blocks listings missing storefront consent", () => {
  const spring = catalogArtworks.find((art) => art.slug === "spring-bloom");
  assert.ok(spring);
  const result = validateCheckoutLineItem(spring, defaultListingConsentRecords);
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes("Storefront consent")));
});

test("calculateCheckoutTotals includes shipping, tax, and artist split", () => {
  const cart = buildSampleCheckoutCart();
  assert.ok(cart.length > 0);
  const totals = calculateCheckoutTotals(cart, "US");
  assert.ok(totals.subtotal > 0);
  assert.ok(totals.shippingEstimate > 0);
  assert.ok(totals.taxEstimate > 0);
  assert.ok(totals.total > totals.subtotal);
  assert.ok(totals.artistTransfers > 0);
  assert.ok(totals.platformRetained > totals.artistTransfers);
});

test("buildFulfillmentRoute prefers Gelato for EU when credentials configured", () => {
  const cart = buildSampleCheckoutCart();
  const route = buildFulfillmentRoute(cart, "EU", {
    GELATO_API_KEY: "gelato_test",
    GELATO_STORE_ID: "store_1",
    PRINTFUL_API_KEY: "pf_test",
    PRINTFUL_STORE_ID: "pf_store",
  });
  assert.equal(route.partnerId, "gelato");
  assert.ok(route.marginSavingsVsPrintful >= 0);
});

test("buildCheckoutSessionPayload encodes line items and metadata", () => {
  const cart = buildSampleCheckoutCart();
  const payload = buildCheckoutSessionPayload(cart, "US", "https://printatelier.com", {
    PRINTFUL_API_KEY: "pf_test",
    PRINTFUL_STORE_ID: "pf_store",
  });
  assert.ok(payload.sessionId.startsWith("chk_"));
  assert.equal(payload.mode, "payment");
  assert.equal(payload.lineItems.length, cart.length);
  assert.equal(payload.metadata.fulfillmentPartnerId, "printful");
  assert.ok(payload.successUrl.includes("/checkout"));
});

test("getCheckoutEnvStatus requires publishable and secret keys", () => {
  const missing = getCheckoutEnvStatus({});
  assert.equal(missing.readyForTestCheckout, false);
  assert.ok(missing.blockers.length >= 3);

  const ready = getCheckoutEnvStatus({
    STRIPE_SECRET_KEY: "sk_test_abc",
    STRIPE_PUBLISHABLE_KEY: "pk_test_abc",
    STRIPE_WEBHOOK_SECRET: "whsec_abc",
    STRIPE_CONNECT_CLIENT_ID: "ca_abc",
  });
  assert.equal(ready.readyForTestCheckout, true);
});

test("buildCheckoutReadiness surfaces cart and env blockers", () => {
  const cart = buildSampleCheckoutCart();
  const readiness = buildCheckoutReadiness(cart, catalogArtworks, defaultListingConsentRecords, {});
  assert.equal(readiness.cartEligible, true);
  assert.equal(readiness.envReady, false);
  assert.equal(readiness.fulfillmentReady, false);
  assert.ok(readiness.blockers.length > 0);
  assert.ok(readiness.nextActions.length > 0);
});

test("buildCheckoutFunnelMetrics tracks cart-to-session readiness stages", () => {
  const funnel = buildCheckoutFunnelMetrics();
  assert.ok(funnel.eligibleListings > 0);
  assert.equal(funnel.stages.length, 5);
  assert.ok(funnel.overallReadiness >= 0 && funnel.overallReadiness <= 100);
  assert.equal(funnel.checkoutSessionReady, false);
});

test("buildCheckoutFunnelMetrics marks live checkout ready when env and POD configured", () => {
  const funnel = buildCheckoutFunnelMetrics(catalogArtworks, defaultListingConsentRecords, {
    STRIPE_SECRET_KEY: "sk_test_abc",
    STRIPE_PUBLISHABLE_KEY: "pk_test_abc",
    STRIPE_WEBHOOK_SECRET: "whsec_abc",
    STRIPE_CONNECT_CLIENT_ID: "ca_abc",
    PRINTFUL_API_KEY: "pf_test",
    PRINTFUL_STORE_ID: "pf_store",
  });
  assert.equal(funnel.stripeEnvReady, true);
  assert.equal(funnel.fulfillmentReady, true);
  assert.equal(funnel.checkoutSessionReady, true);
  assert.ok(funnel.overallReadiness >= 80);
});

test("addArtworkToCheckoutCart accepts a consent-cleared listing and rejects blocked ones", () => {
  const added = addArtworkToCheckoutCart([], "midnight-coast");
  assert.equal(added.added, true);
  assert.equal(added.alreadyInCart, false);
  assert.equal(added.cart[0]?.artworkSlug, "midnight-coast");
  assert.equal(buildCheckoutAddHref("midnight-coast"), "/checkout?add=midnight-coast");

  const duplicate = addArtworkToCheckoutCart(added.cart, "midnight-coast");
  assert.equal(duplicate.added, false);
  assert.equal(duplicate.alreadyInCart, true);
  assert.equal(duplicate.cart.length, 1);

  const blocked = addArtworkToCheckoutCart([], "spring-bloom");
  assert.equal(blocked.added, false);
  assert.ok(blocked.blockers.some((blocker) => blocker.includes("Storefront consent")));
  assert.equal(blocked.cart.length, 0);

  const unknown = addArtworkToCheckoutCart([], "not-a-print");
  assert.equal(unknown.added, false);
  assert.ok(unknown.blockers[0]?.includes("Unknown artwork slug"));
});

test("describeStorefrontCheckoutAction exposes checkout href only for eligible listings", () => {
  const midnight = catalogArtworks.find((art) => art.slug === "midnight-coast");
  const spring = catalogArtworks.find((art) => art.slug === "spring-bloom");
  assert.ok(midnight);
  assert.ok(spring);

  const ready = describeStorefrontCheckoutAction(midnight);
  assert.equal(ready.enabled, true);
  assert.equal(ready.checkoutHref, "/checkout?add=midnight-coast");
  assert.ok(ready.label.includes("$"));

  const preview = describeStorefrontCheckoutAction(spring);
  assert.equal(preview.enabled, false);
  assert.equal(preview.checkoutHref, null);
  assert.equal(preview.label, "Preview only");
  assert.ok(preview.blockers.length > 0);
});
