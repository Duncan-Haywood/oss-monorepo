import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCheckoutReadiness,
  buildCheckoutSessionPayload,
  sanitizeCheckoutLineItems,
  type CheckoutLineItem,
} from "../src/lib/checkout.ts";
import { catalogArtworks } from "../src/lib/marketplace.ts";

/**
 * Three tests already assert that a tampered price is replaced by the catalog
 * price, and all three buy `midnight-coast` — a slug the catalog holds. Every
 * money-bearing field in this checkout is re-derived from the catalog *only on
 * that path*. On the catalog-miss path the client's own numbers were carried
 * through untouched, and the route's eligibility gate decided whether to reject
 * them by substring-matching blocker strings that embed the client's slug.
 *
 * So the cart that got through was not a tampered catalogue item. It was an
 * item that is not in the catalogue at all, named so that the blocker it
 * produced — `Unknown artwork slug: <slug>` — contained one of the tokens the
 * route stripped before counting.
 */

const STRIPE_ENV = {
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_PUBLISHABLE_KEY: "pk_test_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
};

/** An off-catalog item with every money field chosen by the caller. */
function offCatalogItem(slug: string): CheckoutLineItem {
  return {
    artworkSlug: slug,
    title: "Free Print",
    artistName: "Attacker",
    artistAccountId: "acct_attacker",
    artistHandle: "@attacker",
    retailPrice: 0.01,
    // Negative cost inflates `netProfit`, and the artist share is 30% of it.
    fulfillmentCost: -100000,
    quantity: 1,
  } as CheckoutLineItem;
}

test("an off-catalog slug is reported as a cart blocker, not an environment one", () => {
  // Each of these slugs embeds a token the old route filter stripped
  // ("STRIPE", "PRINTFUL", "Gelato"), so the blocker naming it vanished.
  for (const slug of ["Gelato", "STRIPE", "PRINTFUL", "plain-unknown"]) {
    const readiness = buildCheckoutReadiness(
      sanitizeCheckoutLineItems([offCatalogItem(slug)]),
      undefined,
      undefined,
      STRIPE_ENV,
    );

    assert.ok(
      readiness.cartBlockers.some((blocker) => blocker.includes("Unknown artwork slug")),
      `cart blockers lost the unknown-slug rejection for ${slug}: ${JSON.stringify(
        readiness.cartBlockers,
      )}`,
    );
    assert.equal(
      readiness.cartEligible,
      false,
      `cart holding off-catalog slug ${slug} was reported eligible`,
    );
  }
});

test("cart blockers hold nothing that is merely an environment gap", () => {
  // The route rejects a cart on `cartBlockers`, so an unconfigured credential
  // must not land there: it would 422 every legitimate cart on a fresh
  // deployment. This is the property the substring filter was reaching for.
  const catalogCart = sanitizeCheckoutLineItems([
    {
      artworkSlug: catalogArtworks[0].slug,
      title: catalogArtworks[0].title,
      artistName: catalogArtworks[0].artistName,
      retailPrice: catalogArtworks[0].retailPrice,
      fulfillmentCost: catalogArtworks[0].fulfillmentCost,
      quantity: 1,
    } as CheckoutLineItem,
  ]);

  const readiness = buildCheckoutReadiness(catalogCart, undefined, undefined, {});

  assert.equal(readiness.envReady, false, "expected an env-incomplete fixture");
  assert.deepEqual(
    readiness.cartBlockers,
    [],
    `environment gaps leaked into cart blockers: ${JSON.stringify(readiness.cartBlockers)}`,
  );
});

test("an off-catalog item is never priced into a checkout session", () => {
  // The backstop behind the gate. Nothing may put a client-chosen amount on a
  // Stripe session, whatever decided to call this.
  for (const slug of ["Gelato", "plain-unknown"]) {
    assert.throws(
      () =>
        buildCheckoutSessionPayload(
          sanitizeCheckoutLineItems([offCatalogItem(slug)]),
          "US",
          "https://printatelier.com",
          STRIPE_ENV,
        ),
      /not in the catalog/i,
      `an off-catalog slug ${slug} was priced into a session payload`,
    );
  }
});

test("an off-catalog item cannot name the account a payout is routed to", () => {
  // `destinationConnectAccountId` and `artistTransferTotal` are read straight
  // off payment metadata by `processStripeConnectWebhookEvent` and are what the
  // payout reconciliation ledger is built from. The caller must not choose them.
  assert.throws(
    () =>
      buildCheckoutSessionPayload(
        sanitizeCheckoutLineItems([offCatalogItem("Gelato")]),
        "US",
        "https://printatelier.com",
        STRIPE_ENV,
      ),
    /not in the catalog/i,
  );
});

test("a catalog cart still prices and routes normally", () => {
  // The guard must not have closed the path it exists to protect.
  const artwork = catalogArtworks.find((art) => art.status === "Live") ?? catalogArtworks[0];
  const cart = sanitizeCheckoutLineItems([
    {
      artworkSlug: artwork.slug,
      title: artwork.title,
      artistName: artwork.artistName,
      retailPrice: 0.01,
      fulfillmentCost: 0,
      quantity: 1,
    } as CheckoutLineItem,
  ]);

  const payload = buildCheckoutSessionPayload(cart, "US", "https://printatelier.com", STRIPE_ENV);

  assert.equal(payload.lineItems[0].unitAmountCents, Math.round(artwork.retailPrice * 100));
  assert.notEqual(payload.metadata.destinationConnectAccountId, "acct_attacker");
});

/**
 * The three tests above exercise the library. The defect lived in the route,
 * which had its own copy of the classification as a filter over `blockers` — so
 * a library-only test leaves exactly the gap that produced the bug. These drive
 * `POST /api/stripe/checkout` itself.
 */
test("POST /api/stripe/checkout rejects an off-catalog cart", async () => {
  const { POST } = await import("../src/app/api/stripe/checkout/route.ts");

  for (const slug of ["Gelato", "STRIPE", "PRINTFUL", "plain-unknown"]) {
    const res = await POST(
      new Request("http://localhost:3000/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          region: "US",
          lineItems: [offCatalogItem(slug)],
        }),
      }),
    );

    assert.equal(res.status, 422, `an off-catalog cart named "${slug}" was not rejected`);
    const body = await res.json();
    assert.ok(
      (body.blockers ?? []).some((b: string) => b.includes("Unknown artwork slug")),
      `rejection did not name the unknown slug for "${slug}": ${JSON.stringify(body)}`,
    );
  }
});

test("POST /api/stripe/checkout still accepts a catalog cart", async () => {
  const { POST } = await import("../src/app/api/stripe/checkout/route.ts");
  const artwork = catalogArtworks.find((art) => art.status === "Live") ?? catalogArtworks[0];

  const res = await POST(
    new Request("http://localhost:3000/api/stripe/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        region: "US",
        lineItems: [
          {
            artworkSlug: artwork.slug,
            title: artwork.title,
            artistName: artwork.artistName,
            retailPrice: artwork.retailPrice,
            fulfillmentCost: artwork.fulfillmentCost,
            quantity: 1,
          },
        ],
      }),
    }),
  );

  assert.notEqual(res.status, 422, "the guard closed the path it exists to protect");
});
