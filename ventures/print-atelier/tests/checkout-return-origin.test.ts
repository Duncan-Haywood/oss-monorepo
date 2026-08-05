import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { resolveCheckoutBaseUrl } from "../src/lib/checkout-base-url";
import { buildCheckoutSessionPayload } from "../src/lib/checkout";
import { sellableCatalog } from "./support/print-files";

/**
 * Where a buyer lands after paying.
 *
 * `POST /api/stripe/checkout` takes no authentication, and the origin it used
 * was `${x-forwarded-proto ?? "http"}://${host}` — both request headers. The
 * caller therefore chose the `success_url` and `cancel_url` of the Stripe
 * session, which means a caller sending `Host: evil.example` obtained a real
 * `checkout.stripe.com` link that returns the buyer to their site the instant
 * the card is charged. The payment page is genuine, so nothing about the link
 * looks wrong to the person paying; only the trip home is redirected.
 *
 * The fix is a signature rather than a check: `resolveCheckoutBaseUrl` takes no
 * `Request`, so no header can reach the origin. The first test below is the one
 * that survives refactors — it asserts the function cannot be handed a request
 * at all, which a `Host`-matching implementation would fail.
 */

const ROUTE_SOURCE = fileURLToPath(
  new URL("../src/app/api/stripe/checkout/route.ts", import.meta.url),
);

function withSiteUrl<T>(value: string | undefined, run: () => T): T {
  const saved = process.env.NEXT_PUBLIC_SITE_URL;
  if (value === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = value;
  }
  try {
    return run();
  } finally {
    if (saved === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = saved;
    }
  }
}

test("the origin resolver cannot be given a request to read a header from", () => {
  assert.equal(
    resolveCheckoutBaseUrl.length,
    0,
    "resolveCheckoutBaseUrl must take no arguments — an implementation that accepts a Request " +
      "is one comparison away from trusting the Host header again",
  );
});

test("the buyer's return origin comes from configuration, not from the request", () => {
  const resolved = withSiteUrl("https://atelier.marisstella.dev", () => resolveCheckoutBaseUrl());
  assert.deepEqual(resolved, { ok: true, baseUrl: "https://atelier.marisstella.dev" });
});

test("an unconfigured origin refuses rather than falling back", () => {
  const resolved = withSiteUrl(undefined, () => resolveCheckoutBaseUrl());
  assert.deepEqual(
    resolved,
    { ok: false, reason: "unconfigured" },
    "the previous fallback was http://localhost:3000 — a paying customer sent to their own machine",
  );
});

test("a hostile origin cannot be smuggled in through NEXT_PUBLIC_SITE_URL either", () => {
  // `parseSiteUrl` is the single gate every origin in this venture passes
  // through. These are the shapes that would otherwise carry a payload into a
  // `${baseUrl}${path}` concatenation.
  for (const hostile of [
    "javascript:alert(1)",
    "not a url",
    "https://user:pass@evil.example",
    "https://evil.example/path",
    "//evil.example",
  ]) {
    assert.deepEqual(
      withSiteUrl(hostile, () => resolveCheckoutBaseUrl()),
      { ok: false, reason: "unconfigured" },
      `${hostile} must not become a checkout return origin`,
    );
  }
});

test("the resolved origin is what the Stripe session actually returns the buyer to", () => {
  // The route cannot reach this point against the real catalog today — no
  // seeded artwork carries a print file, so every cart is refused upstream. The
  // payload builder is therefore driven directly, with the same fixture the
  // other checkout tests use, so the origin is followed all the way to the
  // fields Stripe redirects on rather than only to the resolver's return value.
  const artwork = sellableCatalog()[0];
  const resolved = withSiteUrl("https://atelier.marisstella.dev", () => resolveCheckoutBaseUrl());
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;

  const payload = buildCheckoutSessionPayload(
    [
      {
        artworkSlug: artwork.slug,
        title: artwork.title,
        artistName: artwork.artistName,
        retailPrice: artwork.retailPrice,
        fulfillmentCost: artwork.fulfillmentCost,
        quantity: 1,
      },
    ],
    "US",
    resolved.baseUrl,
    { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_PUBLISHABLE_KEY: "pk_test_x" },
    sellableCatalog(),
  );

  for (const url of [payload.successUrl, payload.cancelUrl]) {
    assert.ok(
      url.startsWith("https://atelier.marisstella.dev/"),
      `a buyer must be returned to the configured origin, not ${url}`,
    );
  }
});

test("the route no longer reads an origin out of the request", () => {
  // A source contract, because the defect was the route reaching for headers
  // rather than any value it computed. Mocking the resolver would leave exactly
  // that gap.
  const source = readFileSync(ROUTE_SOURCE, "utf8");
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

  for (const forbidden of ['"host"', "'host'", "x-forwarded-proto", "localhost", "NEXT_PUBLIC_APP_URL"]) {
    assert.ok(
      !withoutComments.includes(forbidden),
      `${forbidden} is back in the checkout route — the buyer's return origin must come only ` +
        `from NEXT_PUBLIC_SITE_URL, via resolveCheckoutBaseUrl`,
    );
  }
});
