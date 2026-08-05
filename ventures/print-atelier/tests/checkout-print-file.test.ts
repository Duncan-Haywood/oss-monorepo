import assert from "node:assert/strict";
import test from "node:test";

import {
  addArtworkToCheckoutCart,
  artworkToCheckoutLine,
  buildCheckoutReadiness,
  buildCheckoutSessionPayload,
  sanitizeCheckoutLineItems,
  validateCheckoutLineItem,
} from "../src/lib/checkout";
import { catalogArtworks, type CatalogArtwork } from "../src/lib/marketplace";
import { FULFILLMENT_INPUT_METADATA_KEYS } from "../src/lib/fulfillment-order-inputs";
import type { OrderRecord } from "../src/lib/orders";
import { queuePrintfulFulfillmentFromOrder } from "../src/lib/printful-orders";

/**
 * The half of the funnel that was still open after the cart was wired up.
 *
 * `resolvePrintFileUrl` refuses an order carrying no `artworkUrl`, which is
 * correct — a print partner sent no artwork has nothing to print. But nothing in
 * this venture ever wrote that key: the catalog's only image field is
 * `imageClass`, a Tailwind gradient. So every eligibility check passed, Stripe
 * took the money, and the fulfillment adapter then refused the order the buyer
 * had already been charged for.
 *
 * A missing print file is a reason not to sell the print, not a reason to
 * refuse the order after payment. These tests pin both ends: the listing is
 * blocked before it can be bought, and a listing that *is* sellable carries its
 * file all the way onto the metadata the adapters read.
 */

const PRINT_FILE = "https://files.example.test/prints/midnight-coast.tif";

function sellableArtwork(overrides: Partial<CatalogArtwork> = {}): CatalogArtwork {
  const base = catalogArtworks.find((artwork) => artwork.slug === "midnight-coast");
  assert.ok(base, "expected midnight-coast in the seeded catalog");
  return { ...base, printFileUrl: PRINT_FILE, ...overrides };
}

test("an artwork with no print file cannot be checked out", () => {
  const { printFileUrl: _none, ...withoutFile } = sellableArtwork();
  const eligibility = validateCheckoutLineItem(withoutFile as CatalogArtwork);

  assert.equal(eligibility.eligible, false);
  assert.ok(
    eligibility.blockers.some((blocker) => /print file/i.test(blocker)),
    `expected a print-file blocker, got: ${eligibility.blockers.join(" | ")}`,
  );
});

test("an artwork with a print file is still eligible", () => {
  const eligibility = validateCheckoutLineItem(sellableArtwork());
  assert.deepEqual(eligibility.blockers, []);
  assert.equal(eligibility.eligible, true);
});

test("a plaintext print file URL is refused as firmly as a missing one", () => {
  // The partner fetches this from its own infrastructure. `resolvePrintFileUrl`
  // already refuses `http://` after payment; refusing it at the listing keeps
  // the two ends agreeing rather than selling something fulfillment will reject.
  const eligibility = validateCheckoutLineItem(
    sellableArtwork({ printFileUrl: "http://files.example.test/prints/midnight-coast.tif" }),
  );

  assert.equal(eligibility.eligible, false);
  assert.ok(eligibility.blockers.some((blocker) => /print file/i.test(blocker)));
});

test("the cart refuses an artwork that has no print file", () => {
  const { printFileUrl: _none, ...withoutFile } = sellableArtwork();
  const result = addArtworkToCheckoutCart([], withoutFile as CatalogArtwork);

  assert.equal(result.ok, false);
  assert.deepEqual(result.lineItems, []);
  assert.ok(result.blockers.some((blocker) => /print file/i.test(blocker)));
});

test("the checkout session carries the catalog's print file per line", () => {
  const artworks = [
    sellableArtwork(),
    sellableArtwork({
      id: 2,
      slug: "urban-geometry",
      title: "Urban Geometry",
      printFileUrl: "https://files.example.test/prints/urban-geometry.tif",
    }),
  ];

  const payload = buildCheckoutSessionPayload(
    [
      { ...artworkToCheckoutLine(artworks[0]!, 2) },
      { ...artworkToCheckoutLine(artworks[1]!, 1) },
    ],
    "US",
    "https://printatelier.test",
    {},
    artworks,
  );

  const shared = FULFILLMENT_INPUT_METADATA_KEYS.printFileUrl;
  assert.equal(payload.metadata[`${shared}_0`], PRINT_FILE);
  assert.equal(
    payload.metadata[`${shared}_1`],
    "https://files.example.test/prints/urban-geometry.tif",
  );
  // Per line, not one shared key: a two-artwork cart collapsed onto a single
  // image prints the wrong artwork twice rather than failing.
  assert.notEqual(payload.metadata[`${shared}_0`], payload.metadata[`${shared}_1`]);
});

test("the session builder refuses to price a catalog artwork with no print file", () => {
  // The money boundary does not depend on the caller having checked first —
  // the same rule `buildCheckoutSessionPayload` already applies to a slug that
  // is not in the catalog at all.
  const { printFileUrl: _none, ...withoutFile } = sellableArtwork();
  const artworks = [withoutFile as CatalogArtwork];

  assert.throws(
    () =>
      buildCheckoutSessionPayload(
        [artworkToCheckoutLine(artworks[0]!)],
        "US",
        "https://printatelier.test",
        {},
        artworks,
      ),
    /print file/i,
  );
});

test("a print file persisted in a stale cart is re-derived from the catalog", () => {
  const artworks = [sellableArtwork()];
  const stale = [
    {
      ...artworkToCheckoutLine(artworks[0]!),
      printFileUrl: "https://attacker.example.test/swapped.tif",
    },
  ];

  const [line] = sanitizeCheckoutLineItems(stale, artworks);
  assert.equal(line?.printFileUrl, PRINT_FILE);
});

test("readiness names the print file as the blocker when artwork is missing print file", () => {
  const { printFileUrl: _none, ...withoutFile } = sellableArtwork();
  const readiness = buildCheckoutReadiness(
    [artworkToCheckoutLine(withoutFile as CatalogArtwork)],
    [withoutFile as CatalogArtwork],
  );
  assert.ok(
    readiness.cartBlockers.some((blocker) => /print file/i.test(blocker)),
    `expected a print-file blocker, got: ${readiness.cartBlockers.join(" | ")}`,
  );
});

test("an order whose checkout wrote the print file is no longer refused for it", async () => {
  const artworks = [sellableArtwork()];
  const payload = buildCheckoutSessionPayload(
    [artworkToCheckoutLine(artworks[0]!, 1)],
    "US",
    "https://printatelier.test",
    {},
    artworks,
  );

  const order: OrderRecord = {
    orderId: "ord_print_file",
    stripeEventId: "evt_print_file",
    paymentIntentId: "pi_print_file",
    amountCents: 8500,
    currency: "usd",
    status: "fulfillment_queued",
    fulfillmentPartnerId: "printful",
    shippingRegion: "US",
    artistTransferTotal: 25,
    lineItemCount: 1,
    testMode: true,
    recordedAt: "2026-08-05T09:00:00.000Z",
  };

  const submission = await queuePrintfulFulfillmentFromOrder(
    order,
    {
      ...payload.metadata,
      shippingName: "Ada Lovelace",
      shippingAddress1: "1 Test Street",
      shippingCity: "Boston",
      shippingState: "MA",
      shippingZip: "02108",
      shippingCountry: "US",
      buyerEmail: "buyer@example.test",
    },
    {},
  );

  assert.ok(submission, "expected a submission record");
  assert.doesNotMatch(
    submission.message ?? "",
    new RegExp(`${FULFILLMENT_INPUT_METADATA_KEYS.printFileUrl}_0`),
    `print file still reported missing: ${submission.message}`,
  );
});
