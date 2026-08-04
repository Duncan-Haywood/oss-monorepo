import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  BUYER_SHIPPING_METADATA_KEYS,
  extractStripeShippingMetadata,
  resolveBuyerShippingAddress,
  shippingAddressCollectionCountries,
} from "../src/lib/buyer-shipping";
import { buildStripeCheckoutCreateParams } from "../src/lib/stripe-checkout-server";
import { buildCheckoutSessionPayload, buildSampleCheckoutCart } from "../src/lib/checkout";
import {
  buildPrintfulOrderPayload,
  queuePrintfulFulfillmentFromOrder,
  retryPrintfulFulfillmentSubmission,
} from "../src/lib/printful-orders";
import { buildGelatoOrderPayload, queueGelatoFulfillmentFromOrder } from "../src/lib/gelato-orders";
import type { OrderRecord } from "../src/lib/orders";

/**
 * The storefront says prints are "shipped directly to your door". Before this
 * suite the Stripe session never asked for a door, and both print partners
 * filled the gap with a hardcoded one — Printful with `123 Market St, San
 * Francisco`, Gelato with `10 Market Street, London`. With partner credentials
 * configured, every paid order would have been printed and posted to that
 * address.
 *
 * Each test below fails against the pre-fix code; the placeholder-substitution
 * tests are the mutation check for the guard.
 */

function orderRecord(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    orderId: "ord_test_1",
    paymentIntentId: "pi_test_1",
    eventId: "evt_test_1",
    amountCents: 8500,
    currency: "usd",
    fulfillmentPartnerId: "printful",
    shippingRegion: "US",
    lineItemCount: 1,
    testMode: true,
    ...overrides,
  } as OrderRecord;
}

const completeUsMetadata = {
  [BUYER_SHIPPING_METADATA_KEYS.name]: "Ada Lovelace",
  [BUYER_SHIPPING_METADATA_KEYS.address1]: "12 Analytical Way",
  [BUYER_SHIPPING_METADATA_KEYS.city]: "Portland",
  [BUYER_SHIPPING_METADATA_KEYS.state]: "OR",
  [BUYER_SHIPPING_METADATA_KEYS.postalCode]: "97205",
  [BUYER_SHIPPING_METADATA_KEYS.countryCode]: "us",
};

test("an address missing any required field does not resolve", () => {
  for (const field of ["name", "address1", "city", "postalCode", "countryCode"] as const) {
    const metadata = { ...completeUsMetadata };
    delete (metadata as Record<string, string>)[BUYER_SHIPPING_METADATA_KEYS[field]];
    const resolution = resolveBuyerShippingAddress(metadata);
    assert.equal(resolution.ok, false, `${field} should be required`);
    assert.ok(
      !resolution.ok && resolution.missing.includes(BUYER_SHIPPING_METADATA_KEYS[field]),
      `${field} should be named as missing`,
    );
  }
});

test("a complete address resolves and is normalised, never invented", () => {
  const resolution = resolveBuyerShippingAddress(completeUsMetadata);
  assert.equal(resolution.ok, true);
  assert.deepEqual(resolution.address, {
    name: "Ada Lovelace",
    address1: "12 Analytical Way",
    city: "Portland",
    state: "OR",
    postalCode: "97205",
    countryCode: "US",
  });
});

test("a US address with no state does not resolve, but a German one does", () => {
  const noState = { ...completeUsMetadata };
  delete (noState as Record<string, string>)[BUYER_SHIPPING_METADATA_KEYS.state];
  assert.equal(resolveBuyerShippingAddress(noState).ok, false);

  const german = {
    ...completeUsMetadata,
    [BUYER_SHIPPING_METADATA_KEYS.countryCode]: "DE",
    [BUYER_SHIPPING_METADATA_KEYS.state]: "",
  };
  assert.equal(resolveBuyerShippingAddress(german).ok, true);
});

test("a country code that is not two letters does not resolve", () => {
  // `region.slice(0, 2)` used to produce "EU" for the EU region and "AP" for
  // APAC. "EU" passes the shape check and is caught by the partner; "APAC" is
  // rejected here.
  const resolution = resolveBuyerShippingAddress({
    ...completeUsMetadata,
    [BUYER_SHIPPING_METADATA_KEYS.countryCode]: "APAC",
  });
  assert.equal(resolution.ok, false);
});

test("Printful fulfillment is blocked, not addressed to San Francisco, when the buyer address is absent", async () => {
  const submission = await queuePrintfulFulfillmentFromOrder(
    orderRecord({ orderId: "ord_no_address_pf" }),
    { catalogSlug: "harbour-light" },
    { PRINTFUL_API_KEY: "key", PRINTFUL_STORE_ID: "store" },
    async () => {
      throw new Error("must not reach the Printful API without a buyer address");
    },
  );

  assert.ok(submission);
  assert.equal(submission.status, "blocked");
  assert.equal(submission.canRetry, false);
  assert.match(submission.message, /Buyer shipping address incomplete/);
  assert.equal(submission.payload.recipient.city, "");
  assert.equal(submission.payload.recipient.address1, "");
});

test("Gelato fulfillment is blocked, not addressed to London, when the buyer address is absent", async () => {
  const submission = await queueGelatoFulfillmentFromOrder(
    orderRecord({ orderId: "ord_no_address_gl", fulfillmentPartnerId: "gelato", shippingRegion: "EU" }),
    { catalogSlug: "harbour-light" },
    { GELATO_API_KEY: "key", GELATO_STORE_ID: "store" },
    async () => {
      throw new Error("must not reach the Gelato API without a buyer address");
    },
  );

  assert.ok(submission);
  assert.equal(submission.status, "blocked");
  assert.match(submission.message, /Buyer shipping address incomplete/);
  assert.equal(submission.payload.shippingAddress.addressLine1, "");
  assert.equal(submission.payload.shippingAddress.city, "");
});

test("no fulfillment payload builder substitutes an address of its own", () => {
  const printful = buildPrintfulOrderPayload(orderRecord(), {});
  assert.deepEqual(printful.recipient, {
    name: "",
    address1: "",
    city: "",
    stateCode: "",
    countryCode: "",
    zip: "",
  });

  const gelato = buildGelatoOrderPayload(
    orderRecord({ fulfillmentPartnerId: "gelato", shippingRegion: "EU" }),
    {},
  );
  assert.equal(gelato.shippingAddress.addressLine1, "");
  assert.equal(gelato.shippingAddress.city, "");
  assert.equal(gelato.shippingAddress.postCode, "");
  assert.equal(gelato.shippingAddress.country, "");
  assert.equal(gelato.shippingAddress.firstName, "");
});

test("a resolved buyer address reaches the partner payload unchanged", async () => {
  const submission = await queuePrintfulFulfillmentFromOrder(
    orderRecord({ orderId: "ord_with_address_pf" }),
    {
      ...completeUsMetadata,
      // The address is what this case is about, so the rest of the order has to
      // be complete too — `fulfillment-order-inputs.ts` blocks on a missing
      // buyer email or an unmapped artwork before the address can be observed
      // reaching the payload, and `harbour-light` has no variant mapping.
      catalogSlug: "midnight-coast",
      buyerEmail: "ada@example.com",
      // Quantity and unit price for the same reason as the email and the slug:
      // the order has to be complete before the address can be seen arriving.
      lineItemQuantities: "1",
      lineItemUnitAmounts: "8500",
      // And the artwork, for the same reason: a line with no print file is
      // refused before the address can be observed reaching the payload.
      artworkUrl: "https://files.example.com/prints/midnight-coast.tif",
    },
    {},
  );

  assert.ok(submission);
  assert.equal(submission.status, "queued");
  assert.deepEqual(submission.payload.recipient, {
    name: "Ada Lovelace",
    address1: "12 Analytical Way",
    city: "Portland",
    stateCode: "OR",
    countryCode: "US",
    zip: "97205",
  });
});

test("a blocked-for-address submission cannot be retried into a live submit", async () => {
  await queuePrintfulFulfillmentFromOrder(
    orderRecord({ orderId: "ord_retry_guard" }),
    { catalogSlug: "harbour-light" },
    { PRINTFUL_API_KEY: "key", PRINTFUL_STORE_ID: "store" },
    async () => {
      throw new Error("must not submit");
    },
  );

  const retried = await retryPrintfulFulfillmentSubmission(
    "ord_retry_guard",
    { PRINTFUL_API_KEY: "key", PRINTFUL_STORE_ID: "store" },
    async () => {
      throw new Error("retry must not reach the Printful API");
    },
  );

  assert.ok(retried);
  assert.equal(retried.status, "blocked");
  assert.equal(retried.retryCount ?? 0, 0);
});

test("the Stripe checkout session asks the buyer for a shipping address", () => {
  const payload = buildCheckoutSessionPayload(
    buildSampleCheckoutCart(),
    "US",
    "https://printatelier.test",
  );
  const params = buildStripeCheckoutCreateParams(payload);

  assert.ok(
    params.shipping_address_collection,
    "a storefront promising delivery must collect an address",
  );
  assert.ok(
    (params.shipping_address_collection?.allowed_countries ?? []).length > 0,
    "Stripe rejects an empty allowed_countries list",
  );
});

test("every shipping region offers at least one country the checkout can serve", () => {
  for (const region of ["US", "EU", "UK", "APAC"] as const) {
    const countries = shippingAddressCollectionCountries(region);
    assert.ok(countries.length > 0, `${region} has no allowed country`);
    for (const country of countries) {
      assert.match(country, /^[A-Z]{2}$/, `${region} offers a non-ISO country ${country}`);
    }
  }
});

test("the address Stripe collects is lifted out of the PaymentIntent shape", () => {
  const lifted = extractStripeShippingMetadata({
    shipping: {
      name: "Grace Hopper",
      address: {
        line1: "1 Compiler Court",
        city: "Arlington",
        state: "VA",
        postal_code: "22201",
        country: "us",
      },
    },
  });

  assert.equal(resolveBuyerShippingAddress(lifted).ok, true);
  assert.equal(lifted[BUYER_SHIPPING_METADATA_KEYS.countryCode], "US");

  // The Checkout Session shape carries the same address under a different key.
  const fromSession = extractStripeShippingMetadata({
    collected_information: {
      shipping_details: {
        name: "Grace Hopper",
        address: {
          line1: "1 Compiler Court",
          city: "Arlington",
          state: "VA",
          postal_code: "22201",
          country: "US",
        },
      },
    },
  });
  assert.equal(resolveBuyerShippingAddress(fromSession).ok, true);

  assert.deepEqual(extractStripeShippingMetadata({}), {});
  assert.deepEqual(extractStripeShippingMetadata(null), {});
});

test("the webhook lifts the collected address before routing fulfillment", () => {
  // A source contract rather than a mock: the handler reads `metadata` and the
  // address does not live there, so the lift has to happen in this file. A test
  // that stubbed the adapters would stay green with the lift removed.
  const source = readFileSync(
    join(import.meta.dirname, "../src/app/api/stripe/webhook/route.ts"),
    "utf8",
  );
  assert.match(source, /extractStripeShippingMetadata\(paymentObject\)/);
  const spread = source.indexOf("...extractStripeShippingMetadata(paymentObject)");
  const rawSpread = source.indexOf("...rawMetadata");
  assert.ok(spread > -1 && rawSpread > spread, "explicit metadata must win over the lifted address");
});

test("no fulfillment source carries a placeholder street address", () => {
  for (const file of ["printful-orders.ts", "gelato-orders.ts"]) {
    const source = readFileSync(join(import.meta.dirname, "../src/lib", file), "utf8");
    const code = source
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
      .join("\n");
    for (const placeholder of [
      "123 Market St",
      "10 Market Street",
      "San Francisco",
      "EC1A 1BB",
      "94105",
      "Print Atelier Buyer",
    ]) {
      assert.ok(
        !code.includes(placeholder),
        `${file} still substitutes the placeholder ${placeholder}`,
      );
    }
  }
});
