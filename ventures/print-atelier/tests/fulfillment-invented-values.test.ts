import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPrintfulOrderPayload,
  clearPrintfulFulfillmentForTests,
  queuePrintfulFulfillmentFromOrder,
} from "../src/lib/printful-orders.ts";
import {
  buildGelatoOrderPayload,
  clearGelatoFulfillmentForTests,
  queueGelatoFulfillmentFromOrder,
} from "../src/lib/gelato-orders.ts";
import { extractStripeShippingMetadata } from "../src/lib/buyer-shipping.ts";
import type { OrderRecord } from "../src/lib/orders.ts";

/**
 * `buyer-shipping.ts` settled the rule for this checkout — a missing field is a
 * reason to refuse an order, never a reason to invent one — and applied it to
 * the address. Three values in the same two payload builders kept their
 * defaults, and no code in this repository writes any of the metadata keys they
 * read, so each default was taken on every order rather than in an edge case:
 *
 *   - `buyerEmail` → `buyer@printatelier.com`, a studio inbox. Gelato sends
 *     shipment notifications to it and Printful prints it on the packing slip.
 *   - Gelato's `fileUrl` → `https://printatelier.com/prints/<slug>`, assembled
 *     from the catalog slug. `CatalogArtwork` carries an `imageClass` — a CSS
 *     class — and no print file at all, so that URL never named artwork.
 *   - An unmapped product → `gel_<slug>` / `pf_<slug>`. Real identifiers look
 *     like `gel_poster_18x24_matte`.
 *
 * These tests fail against the previous behaviour: each one asserted below was
 * a value the adapter supplied for itself.
 */

const buyerAddress = {
  shippingName: "Elena Buyer",
  shippingAddress1: "4 Rue des Arts",
  shippingCity: "Lyon",
  shippingZip: "69001",
  shippingCountry: "FR",
};

function orderRecord(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    orderId: "ord_invented_1",
    stripeEventId: "evt_1",
    paymentIntentId: "pi_1",
    amountCents: 8500,
    currency: "usd",
    status: "fulfillment_queued",
    fulfillmentPartnerId: "printful",
    shippingRegion: "US",
    artistTransferTotal: 12.5,
    lineItemCount: 1,
    testMode: true,
    recordedAt: "2026-06-12T11:00:00.000Z",
    ...overrides,
  };
}

test("no partner payload carries the studio's own inbox as the buyer", () => {
  const printful = buildPrintfulOrderPayload(orderRecord(), {
    ...buyerAddress,
    catalogSlug: "midnight-coast",
  });
  const gelato = buildGelatoOrderPayload(
    orderRecord({ fulfillmentPartnerId: "gelato" }),
    { ...buyerAddress, catalogSlug: "midnight-coast" },
  );

  assert.notEqual(printful.packingSlip?.email, "buyer@printatelier.com");
  assert.notEqual(gelato.shippingAddress.email, "buyer@printatelier.com");
  assert.equal(printful.packingSlip?.email, "");
  assert.equal(gelato.shippingAddress.email, "");
});

test("an order with no buyer email is refused rather than submitted", async () => {
  clearPrintfulFulfillmentForTests();
  clearGelatoFulfillmentForTests();

  const printful = await queuePrintfulFulfillmentFromOrder(
    orderRecord(),
    { ...buyerAddress, catalogSlug: "midnight-coast" },
    { PRINTFUL_API_KEY: "key", PRINTFUL_STORE_ID: "store" },
    async () => {
      throw new Error("must not submit an order with no buyer email");
    },
  );

  assert.equal(printful?.status, "blocked");
  assert.match(printful?.message ?? "", /buyerEmail/);
  // The retry path holds the payload but not the metadata, so it could not
  // supply what the guard is missing.
  assert.equal(printful?.canRetry, false);

  const gelato = await queueGelatoFulfillmentFromOrder(
    orderRecord({ fulfillmentPartnerId: "gelato" }),
    {
      ...buyerAddress,
      catalogSlug: "midnight-coast",
      artworkUrl: "https://cdn.printatelier.com/midnight-coast.jpg",
    },
    { GELATO_API_KEY: "key", GELATO_STORE_ID: "store" },
    async () => {
      throw new Error("must not submit an order with no buyer email");
    },
  );

  assert.equal(gelato?.status, "blocked");
  assert.match(gelato?.message ?? "", /buyerEmail/);
});

test("Gelato is never told to print a URL assembled from a slug", async () => {
  clearGelatoFulfillmentForTests();

  const payload = buildGelatoOrderPayload(
    orderRecord({ fulfillmentPartnerId: "gelato" }),
    { ...buyerAddress, catalogSlug: "midnight-coast", buyerEmail: "elena@example.com" },
  );

  assert.equal(
    payload.items[0]?.fileUrl,
    "",
    "an artwork URL was assembled from the catalog slug",
  );

  const submission = await queueGelatoFulfillmentFromOrder(
    orderRecord({ fulfillmentPartnerId: "gelato" }),
    { ...buyerAddress, catalogSlug: "midnight-coast", buyerEmail: "elena@example.com" },
    { GELATO_API_KEY: "key", GELATO_STORE_ID: "store" },
    async () => {
      throw new Error("must not submit an order with no print file");
    },
  );

  assert.equal(submission?.status, "blocked");
  assert.match(submission?.message ?? "", /artworkUrl_0/);
});

test("a print file must be fetched over https", async () => {
  clearGelatoFulfillmentForTests();

  const submission = await queueGelatoFulfillmentFromOrder(
    orderRecord({ fulfillmentPartnerId: "gelato" }),
    {
      ...buyerAddress,
      catalogSlug: "midnight-coast",
      buyerEmail: "elena@example.com",
      artworkUrl: "http://cdn.printatelier.com/midnight-coast.jpg",
    },
    { GELATO_API_KEY: "key", GELATO_STORE_ID: "store" },
    async () => {
      throw new Error("must not hand a plaintext artwork URL to a partner");
    },
  );

  assert.equal(submission?.status, "blocked");
});

test("an unmapped artwork is refused rather than given an invented product id", async () => {
  clearPrintfulFulfillmentForTests();
  clearGelatoFulfillmentForTests();

  const unmapped = "not-a-catalog-artwork";

  const printfulPayload = buildPrintfulOrderPayload(orderRecord(), {
    ...buyerAddress,
    catalogSlug: unmapped,
    buyerEmail: "elena@example.com",
  });
  assert.notEqual(printfulPayload.items[0]?.variantId, `pf_${unmapped}`);
  assert.equal(printfulPayload.items[0]?.variantId, "");

  const submission = await queuePrintfulFulfillmentFromOrder(
    orderRecord(),
    { ...buyerAddress, catalogSlug: unmapped, buyerEmail: "elena@example.com" },
    { PRINTFUL_API_KEY: "key", PRINTFUL_STORE_ID: "store" },
    async () => {
      throw new Error("must not submit an order with an invented variant");
    },
  );

  assert.equal(submission?.status, "blocked");
  assert.match(submission?.message ?? "", /product mapping/);
});

test("Printful is not told shipping and tax were zero when nothing measured them", () => {
  const payload = buildPrintfulOrderPayload(orderRecord(), {
    ...buyerAddress,
    catalogSlug: "midnight-coast",
    buyerEmail: "elena@example.com",
  });

  // These are the retail values a customs declaration is built from. Absent is
  // honest; "0.00" is a claim that the buyer paid neither.
  assert.equal(payload.retailCosts.shipping, undefined);
  assert.equal(payload.retailCosts.tax, undefined);
});

test("the buyer's email is lifted off whichever Stripe object triggered the webhook", () => {
  // A PaymentIntent carries it as `receipt_email`...
  assert.equal(
    extractStripeShippingMetadata({ receipt_email: "buyer@example.com" }).buyerEmail,
    "buyer@example.com",
  );

  // ...a Checkout Session as `customer_details.email`...
  assert.equal(
    extractStripeShippingMetadata({ customer_details: { email: "session@example.com" } })
      .buyerEmail,
    "session@example.com",
  );

  // ...and a charge as `billing_details.email`.
  assert.equal(
    extractStripeShippingMetadata({
      charges: { data: [{ billing_details: { email: "charge@example.com" } }] },
    }).buyerEmail,
    "charge@example.com",
  );

  // An address and no email must still yield the address, and vice versa.
  const addressOnly = extractStripeShippingMetadata({
    shipping: { name: "Ada", address: { line1: "12 Analytical Way", country: "us" } },
  });
  assert.equal(addressOnly.buyerEmail, undefined);
  assert.equal(addressOnly.shippingName, "Ada");
  assert.equal(addressOnly.shippingCountry, "US");

  assert.equal(
    extractStripeShippingMetadata({ receipt_email: "only@example.com" }).shippingName,
    undefined,
  );
});

test("an order carrying every input still reaches the partner", async () => {
  clearPrintfulFulfillmentForTests();
  let submitted = false;

  const submission = await queuePrintfulFulfillmentFromOrder(
    orderRecord(),
    { ...buyerAddress, catalogSlug: "midnight-coast", buyerEmail: "elena@example.com" },
    { PRINTFUL_API_KEY: "key", PRINTFUL_STORE_ID: "store" },
    async () => {
      submitted = true;
      return { ok: true, status: 200, text: async () => '{"result":{"id":1}}' };
    },
  );

  assert.equal(submitted, true, "the guard closed the path it exists to protect");
  assert.equal(submission?.status, "submitted");
});
