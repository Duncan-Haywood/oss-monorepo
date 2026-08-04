/**
 * The order the buyer paid for is the order the partner is told to make.
 *
 * `checkout-charges-what-it-quotes.test.ts` pins the money side: the card is
 * charged what the cart quotes. Nothing pinned the other half. Both POD adapters
 * hardcoded `quantity: 1` while `buildCheckoutSessionPayload` put the real
 * quantity on the Stripe line item, so a cart of three copies of an $85 print
 * charged $261.95 and ordered **one**. The number was never missing — the
 * checkout had it and wrote only `lineItemCount`, which is how many *distinct*
 * lines there are, into the metadata the fulfillment side reads.
 *
 * Printful's `retail_price` is per item and is what the customs declaration is
 * built from; it was the whole PaymentIntent amount, shipping included, stamped
 * on every line. Correcting the quantity without correcting that would have
 * multiplied the error rather than left it, so the two are tested together.
 *
 * The assertions below are written against the *charge*, not against a literal.
 * A test that says `quantity === 3` passes just as well when the checkout stops
 * charging for three.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCheckoutSessionPayload,
  validateCheckoutLineItem,
  type CheckoutLineItem,
  type CheckoutShippingRegion,
} from "../src/lib/checkout";
import { buildPrintfulOrderPayload, resolvePrintfulOrderInputs } from "../src/lib/printful-orders";
import { buildGelatoOrderPayload, resolveGelatoOrderInputs } from "../src/lib/gelato-orders";
import { recordOrderFromPaymentWebhook } from "../src/lib/orders";
import {
  catalogArtworks,
  defaultListingConsentRecords,
  type CatalogArtwork,
} from "../src/lib/marketplace";

const ENV = {
  NEXT_PUBLIC_SITE_URL: "https://printatelier.test",
  STRIPE_SECRET_KEY: "sk_test_x",
};

/** The catalog's own definition of what may be sold, not a guess at one. */
function sellableArtworks(): CatalogArtwork[] {
  return catalogArtworks.filter(
    (artwork) => validateCheckoutLineItem(artwork, defaultListingConsentRecords).eligible,
  );
}

/** A cart the buyer would recognise: one line bought three times, one bought once. */
function multiQuantityCart(): CheckoutLineItem[] {
  const [first, second] = sellableArtworks();
  assert.ok(first && second, "the catalog needs two available artworks for this test");
  return [
    {
      artworkSlug: first.slug,
      title: first.title,
      artistName: first.artistName,
      retailPrice: first.retailPrice,
      fulfillmentCost: first.fulfillmentCost,
      quantity: 3,
    },
    {
      artworkSlug: second.slug,
      title: second.title,
      artistName: second.artistName,
      retailPrice: second.retailPrice,
      fulfillmentCost: second.fulfillmentCost,
      quantity: 1,
    },
  ];
}

/**
 * The metadata a real order carries: what the checkout wrote, plus the buyer
 * inputs Stripe supplies and the operator mappings, so the order is *complete*
 * and the adapters are exercised on the submit path rather than the refuse path.
 */
function paidOrderMetadata(cart: CheckoutLineItem[], region: CheckoutShippingRegion = "US") {
  const payload = buildCheckoutSessionPayload(cart, region, ENV.NEXT_PUBLIC_SITE_URL, ENV);
  return {
    payload,
    metadata: {
      ...payload.metadata,
      buyerEmail: "buyer@example.test",
      recipientName: "A Buyer",
      shippingAddressLine1: "1 Real Street",
      shippingCity: "Denver",
      shippingState: "CO",
      shippingPostalCode: "80202",
      shippingCountry: "US",
      artworkUrl_0: "https://files.example.test/first.png",
      artworkUrl_1: "https://files.example.test/second.png",
      variantId_0: "4011",
      variantId_1: "4012",
      gelatoProductUid_0: "gel_poster_18x24_matte",
      gelatoProductUid_1: "gel_poster_12x16_matte",
    } as Record<string, unknown>,
  };
}

let eventCounter = 0;

function orderFrom(metadata: Record<string, unknown>, amountCents: number, partnerId: string) {
  eventCounter += 1;
  const order = recordOrderFromPaymentWebhook(
    `evt_${partnerId}_${eventCounter}`,
    "payment_intent.succeeded",
    {
      id: `pi_${eventCounter}`,
      amount: amountCents,
      currency: "usd",
      metadata: { ...metadata, fulfillmentPartnerId: partnerId },
    },
    true,
    "2026-08-04T00:00:00.000Z",
  );
  assert.ok(order, "the webhook should record an order");
  return order;
}

test("the units ordered are the units charged for", () => {
  const cart = multiQuantityCart();
  const { payload, metadata } = paidOrderMetadata(cart);

  // What the buyer's card is charged against, straight off the Stripe payload.
  const chargedUnits = payload.lineItems.reduce((sum, item) => sum + item.quantity, 0);
  const chargedCents = payload.lineItems.reduce(
    (sum, item) => sum + item.unitAmountCents * item.quantity,
    0,
  );
  assert.ok(chargedUnits > payload.lineItems.length, "this cart must have a multi-quantity line");

  const amountCents = chargedCents + payload.shippingAmountCents;

  const printful = buildPrintfulOrderPayload(
    orderFrom(metadata, amountCents, "printful"),
    metadata,
  );
  const gelato = buildGelatoOrderPayload(orderFrom(metadata, amountCents, "gelato"), metadata);

  const printfulUnits = printful.items.reduce((sum, item) => sum + item.quantity, 0);
  const gelatoUnits = gelato.items.reduce((sum, item) => sum + item.quantity, 0);

  assert.equal(printfulUnits, chargedUnits, "Printful must print what the buyer paid for");
  assert.equal(gelatoUnits, chargedUnits, "Gelato must print what the buyer paid for");

  // Line for line, not just in total: a cart of 3+1 and one of 1+3 are different
  // orders and a summed assertion cannot tell them apart.
  payload.lineItems.forEach((line, index) => {
    assert.equal(printful.items[index]?.quantity, line.quantity, `printful line ${index}`);
    assert.equal(gelato.items[index]?.quantity, line.quantity, `gelato line ${index}`);
  });
});

test("the declared customs value is the item's own price, not the whole order", () => {
  // International on purpose: domestic shipping is 0, and "shipping is not
  // folded into the goods" is not a claim a zero can support.
  const cart = multiQuantityCart();
  const { payload, metadata } = paidOrderMetadata(cart, "EU");
  assert.ok(payload.shippingAmountCents > 0, "this test needs a region that charges shipping");
  const chargedCents = payload.lineItems.reduce(
    (sum, item) => sum + item.unitAmountCents * item.quantity,
    0,
  );
  const amountCents = chargedCents + payload.shippingAmountCents;

  const printful = buildPrintfulOrderPayload(
    orderFrom(metadata, amountCents, "printful"),
    metadata,
  );

  payload.lineItems.forEach((line, index) => {
    assert.equal(
      printful.items[index]?.retailPrice,
      (line.unitAmountCents / 100).toFixed(2),
      `printful line ${index} retail price`,
    );
  });

  // Printful multiplies `retail_price` by `quantity`. The declaration it adds up
  // to must be the goods the buyer bought — shipping is declared separately and
  // must not be folded into any item.
  const declaredCents = printful.items.reduce(
    (sum, item) => sum + Math.round(Number.parseFloat(item.retailPrice) * 100) * item.quantity,
    0,
  );
  assert.equal(declaredCents, chargedCents);
  assert.ok(
    declaredCents < amountCents,
    "shipping must not be declared as the value of the goods",
  );
});

test("an order carrying no quantity is refused, not silently reduced to one", () => {
  // The regression this whole file exists for: before the checkout carried the
  // numbers, every order looked exactly like this one to the adapters, and both
  // of them shipped a single print for it.
  const cart = multiQuantityCart();
  const { metadata } = paidOrderMetadata(cart);
  const { lineItemQuantities, lineItemUnitAmounts, ...withoutQuantities } = metadata as Record<
    string,
    unknown
  >;
  assert.ok(lineItemQuantities, "the checkout must write lineItemQuantities for this to be a test");
  assert.ok(lineItemUnitAmounts, "the checkout must write lineItemUnitAmounts too");

  const order = orderFrom(withoutQuantities, 26195, "printful");

  const printfulInputs = resolvePrintfulOrderInputs(order, withoutQuantities);
  const gelatoInputs = resolveGelatoOrderInputs(order, withoutQuantities);

  assert.equal(printfulInputs.ok, false, "Printful must refuse an order with no quantity");
  assert.equal(gelatoInputs.ok, false, "Gelato must refuse an order with no quantity");
  assert.ok(
    printfulInputs.missing.some((entry) => entry.startsWith("lineItemQuantities")),
    `expected a quantity blocker, got ${printfulInputs.missing.join(", ")}`,
  );
  assert.ok(
    printfulInputs.missing.some((entry) => entry.startsWith("lineItemUnitAmounts")),
    `expected a unit-price blocker, got ${printfulInputs.missing.join(", ")}`,
  );

  // And the payload it would have built carries no invented number.
  const printful = buildPrintfulOrderPayload(order, withoutQuantities);
  assert.equal(printful.items[0]?.quantity, 0);
  assert.equal(printful.items[0]?.retailPrice, "");
});

test("a complete order passes the input gate both adapters read", () => {
  // Without this the three tests above would still pass if the gate refused
  // *everything* — a refusal that never lets a real order through is not a fix.
  const cart = multiQuantityCart();
  const { metadata } = paidOrderMetadata(cart);
  const order = orderFrom(metadata, 26195, "gelato");

  assert.deepEqual(resolvePrintfulOrderInputs(order, metadata).missing, []);
  assert.deepEqual(resolveGelatoOrderInputs(order, metadata).missing, []);
});

test("the checkout stays inside Stripe's 50-key metadata limit", () => {
  // The quantities are one comma-separated key each rather than one key per
  // line, because Stripe rejects a session with more than 50 metadata keys and
  // two more per-line keys would have lowered the largest sellable cart from
  // ten lines to eight. This pins that reasoning to a number.
  const cart: CheckoutLineItem[] = sellableArtworks().map((artwork) => ({
    artworkSlug: artwork.slug,
    title: artwork.title,
    artistName: artwork.artistName,
    retailPrice: artwork.retailPrice,
    fulfillmentCost: artwork.fulfillmentCost,
    quantity: 2,
  }));

  const payload = buildCheckoutSessionPayload(cart, "US", ENV.NEXT_PUBLIC_SITE_URL, ENV);
  const keys = Object.keys(payload.metadata).length;
  assert.ok(
    keys <= 50,
    `a cart of every available artwork writes ${keys} metadata keys; Stripe accepts 50`,
  );
});
