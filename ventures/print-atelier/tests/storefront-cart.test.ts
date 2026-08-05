import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  addArtworkToCheckoutCart,
  countCheckoutCartItems,
  type CheckoutLineItem,
} from "../src/lib/checkout.ts";
import { catalogArtworks, defaultListingConsentRecords } from "../src/lib/marketplace.ts";
import { withPrintFile } from "./support/print-files.ts";

/**
 * The storefront could not put anything in the cart.
 *
 * Every other piece of the purchase funnel was built and tested: the cart type,
 * localStorage persistence, the checkout page, and a server route that
 * re-derives every amount from the catalog. The first link was
 * `const cartCount = 2` — a literal basket badge on a page whose "Quick View"
 * button had no handler. `saveCheckoutCartToStorage` had exactly one caller,
 * `CheckoutLab`, which seeded `buildSampleCheckoutCart()` whenever storage was
 * empty. So a shopper could not buy the print they clicked, and a shopper who
 * opened /checkout directly was shown two priced prints they had never chosen
 * with a live pay button underneath.
 *
 * The behavioural tests below cover the cart helper. The source contracts at the
 * bottom cover the defect itself: the helper can be correct while the storefront
 * still renders a literal and the checkout still seeds a sample, which is the
 * state this venture shipped in.
 */

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

function eligibleArtwork() {
  // `withPrintFile`, not the raw catalog entry: a listing with no print file
  // cannot be sold at all, and these tests are about pricing and increment
  // rather than about that rule. See tests/support/print-files.ts.
  const artwork = catalogArtworks.find((art) => art.slug === "midnight-coast");
  assert.ok(artwork, "expected midnight-coast in the catalog");
  return withPrintFile(artwork);
}

function consentBlockedArtwork() {
  const artwork = catalogArtworks.find((art) => art.slug === "spring-bloom");
  assert.ok(artwork, "expected spring-bloom in the catalog");
  return withPrintFile(artwork);
}

test("addArtworkToCheckoutCart prices a new line from the catalog, not the caller", () => {
  const artwork = eligibleArtwork();
  const result = addArtworkToCheckoutCart([], artwork, 1, defaultListingConsentRecords);

  assert.equal(result.ok, true);
  assert.equal(result.lineItems.length, 1);
  assert.equal(result.lineItems[0]?.artworkSlug, "midnight-coast");
  assert.equal(result.lineItems[0]?.retailPrice, artwork.retailPrice);
  assert.equal(result.lineItems[0]?.fulfillmentCost, artwork.fulfillmentCost);
  assert.equal(result.lineItems[0]?.quantity, 1);
});

test("addArtworkToCheckoutCart increments the existing line rather than duplicating it", () => {
  const artwork = eligibleArtwork();
  const once = addArtworkToCheckoutCart([], artwork, 1, defaultListingConsentRecords);
  const twice = addArtworkToCheckoutCart(
    once.lineItems,
    artwork,
    2,
    defaultListingConsentRecords,
  );

  assert.equal(twice.ok, true);
  assert.equal(twice.lineItems.length, 1);
  assert.equal(twice.lineItems[0]?.quantity, 3);
});

test("addArtworkToCheckoutCart re-derives price on increment, dropping a stale stored amount", () => {
  const artwork = eligibleArtwork();
  // What a cart persisted in localStorage before a catalog price change looks
  // like. Carrying it forward would quote the buyer the old amount while Stripe
  // charged the catalog's.
  const stale: CheckoutLineItem[] = [
    {
      artworkSlug: artwork.slug,
      title: artwork.title,
      artistName: artwork.artistName,
      retailPrice: 1,
      fulfillmentCost: 1,
      quantity: 1,
    },
  ];

  const result = addArtworkToCheckoutCart(stale, artwork, 1, defaultListingConsentRecords);

  assert.equal(result.lineItems[0]?.retailPrice, artwork.retailPrice);
  assert.equal(result.lineItems[0]?.fulfillmentCost, artwork.fulfillmentCost);
  assert.equal(result.lineItems[0]?.quantity, 2);
});

test("addArtworkToCheckoutCart refuses a listing the artist has not cleared, leaving the cart untouched", () => {
  const artwork = consentBlockedArtwork();
  const existing = addArtworkToCheckoutCart(
    [],
    eligibleArtwork(),
    1,
    defaultListingConsentRecords,
  ).lineItems;

  const result = addArtworkToCheckoutCart(existing, artwork, 1, defaultListingConsentRecords);

  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes("Storefront consent")));
  assert.deepEqual(result.lineItems, existing);
});

test("countCheckoutCartItems counts prints, not lines", () => {
  const artwork = eligibleArtwork();
  const cart = addArtworkToCheckoutCart([], artwork, 3, defaultListingConsentRecords).lineItems;

  assert.equal(cart.length, 1);
  assert.equal(countCheckoutCartItems(cart), 3);
  assert.equal(countCheckoutCartItems([]), 0);
});

test("the storefront renders a real basket count and a real add control", () => {
  const source = readSource("../src/app/storefront/page.tsx");

  // The literal this whole file exists because of.
  assert.doesNotMatch(
    source,
    /const\s+cartCount\s*=\s*\d/,
    "storefront must not hardcode a cart count",
  );
  assert.match(source, /StorefrontCartBadge/, "storefront must render the live basket badge");
  assert.match(source, /AddToCartButton/, "storefront must render an add-to-cart control");
  assert.match(
    source,
    /validateCheckoutLineItem/,
    "storefront must gate the add control on listing eligibility",
  );
});

test("the checkout does not seed a cart the shopper never filled", () => {
  const source = readSource("../src/components/CheckoutLab.tsx");

  // Matched on the shape rather than on a slice between two markers: both
  // markers also occur in the import list, so an `indexOf`-delimited window
  // silently came out empty and the assertion below never ran on anything.
  assert.match(
    source,
    /setCart\(loadCheckoutCartFromStorage\(\)\)/,
    "the mount effect must hydrate the cart from storage verbatim",
  );
  assert.doesNotMatch(
    source,
    /setCart\([^;]*buildSampleCheckoutCart/,
    "an empty stored cart must stay empty; the sample has to be asked for",
  );
});

test("the checkout persists an emptied cart instead of skipping the write", () => {
  const source = readSource("../src/components/CheckoutLab.tsx");

  // `if (cart.length > 0) saveCheckoutCartToStorage(cart)` meant removing the
  // last line never reached storage, so the print came back on the next visit.
  assert.doesNotMatch(
    source,
    /if\s*\(\s*cart\.length\s*>\s*0\s*\)\s*\{?\s*\n?\s*saveCheckoutCartToStorage/,
    "the cart write must not be gated on the cart being non-empty",
  );
});
