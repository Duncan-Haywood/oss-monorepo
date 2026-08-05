import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  addArtworkToCheckoutCart,
  artworkToCheckoutLine,
  buildCheckoutReadiness,
  buildCheckoutSessionPayload,
  hasUsablePrintFile,
  sanitizeCheckoutLineItems,
  validateCheckoutLineItem,
} from "../src/lib/checkout";
import { catalogArtworks, type CatalogArtwork } from "../src/lib/marketplace";
import {
  FULFILLMENT_INPUT_METADATA_KEYS,
  resolvePrintFileUrl,
} from "../src/lib/fulfillment-order-inputs";
import { buildGelatoOrderPayload } from "../src/lib/gelato-orders";
import type { OrderRecord } from "../src/lib/orders";
import {
  buildPrintfulOrderPayload,
  queuePrintfulFulfillmentFromOrder,
  toPrintfulWirePayload,
} from "../src/lib/printful-orders";

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
const VENTURE_ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * The order both fulfillment adapters are exercised with below. Everything a
 * submission needs is present except the print file, so a refusal can only be
 * about the print file.
 */
const FULFILLABLE_ORDER: OrderRecord = {
  orderId: "ord_degenerate_url",
  stripeEventId: "evt_degenerate_url",
  paymentIntentId: "pi_degenerate_url",
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

const FULFILLABLE_METADATA = {
  catalogSlug: "midnight-coast",
  catalogSlug_0: "midnight-coast",
  lineItemName_0: "Midnight Coast — Maris Stella",
  lineItemQuantities: "1",
  lineItemUnitAmounts: "8500",
  shippingName: "Ada Lovelace",
  shippingAddress1: "1 Test Street",
  shippingCity: "Boston",
  shippingState: "MA",
  shippingZip: "02108",
  shippingCountry: "US",
  buyerEmail: "buyer@example.test",
};

/**
 * Values `startsWith("https://")` accepted at both ends until 2026-08-05, with
 * what each one would have done to an order.
 *
 * `"https://"` is the whole defect in one string: it is not a URL — `new URL()`
 * throws on it — yet it made a listing checkout-eligible with zero blockers and
 * travelled onto the wire as `files: [{ url: "https://" }]`.
 */
const DEGENERATE_PRINT_FILE_URLS: Array<{ url: string; why: string }> = [
  { url: "https://", why: "not a URL at all — no host, no path, nothing to fetch" },
  { url: "https:// ", why: "the same string with trailing whitespace" },
  {
    url: "https:///path",
    why: "an extra slash; the URL parser silently re-reads `path` as the hostname",
  },
  {
    url: "https:///path/a.tif",
    why: "the same typo with a file on the end — parses to the unresolvable host `path`",
  },
  {
    url: "https://host",
    why: "a single-label host a POD partner's fetcher cannot resolve",
  },
  { url: "https://host/", why: "the same single-label host with its root path spelled out" },
  {
    // Deliberately a *dotted* host, unlike the two above. `https://host` is
    // refused by the resolvable-host rule as well, so on its own it cannot tell
    // whether the bare-origin rule is still there — deleting that rule left every
    // test in this file green until this case existed.
    url: "https://files.example.test",
    why: "a bare origin names a site, not a print-ready file",
  },
  {
    url: "https://files.example.test/",
    why: "the same bare origin with its root path spelled out",
  },
  {
    url: "https://user:pw@files.example.test/a.tif",
    why: "hands a credential to the print partner and to their request logs",
  },
  {
    // Covers the scheme rule at the *fulfillment* end. The listing end has had a
    // plaintext case since the blocker was written; the adapter had none, so
    // deleting the scheme comparison broke exactly one test.
    url: "http://files.example.test/prints/midnight-coast.tif",
    why: "plaintext — a third party would fetch an artist's master in the clear",
  },
  {
    url: "/prints/midnight-coast.tif",
    why: "site-relative; a print partner has no base to resolve it against",
  },
  { url: "not a url", why: "does not parse" },
  { url: "   ", why: "whitespace only" },
];

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

// --- both ends accepted a non-URL, and agreed about it ----------------------

/**
 * `hasUsablePrintFile` and `resolvePrintFileUrl` each carried their own copy of
 * `startsWith("https://")`. Two copies that agree read as a verified rule, which
 * is why this went unnoticed: the storefront said sellable, the adapter said
 * fulfillable, and both were wrong about the same inputs.
 *
 * So every case below is asserted at *both* ends in the same test. A fix applied
 * to one end only leaves the other half of the money path open — this venture has
 * shipped exactly that shape before, with a route holding its own copy of a
 * classification the library had already fixed.
 */
for (const { url, why } of DEGENERATE_PRINT_FILE_URLS) {
  test(`a print file of ${JSON.stringify(url)} is refused at both ends (${why})`, () => {
    // The listing end: not sellable, and the blocker says so.
    const artwork = sellableArtwork({ printFileUrl: url });
    assert.equal(
      hasUsablePrintFile(artwork),
      false,
      `hasUsablePrintFile accepted ${JSON.stringify(url)} — ${why}`,
    );

    const eligibility = validateCheckoutLineItem(artwork);
    assert.equal(
      eligibility.eligible,
      false,
      `${JSON.stringify(url)} made the listing checkout-eligible with blockers: ${JSON.stringify(
        eligibility.blockers,
      )}`,
    );
    assert.ok(
      eligibility.blockerDetails.some((blocker) =>
        blocker.code === "print-file-missing" || blocker.code === "print-file-not-fetchable",
      ),
      `expected a print-file blocker code, got: ${eligibility.blockerDetails
        .map((b) => b.code)
        .join(", ")}`,
    );

    // The money boundary, which does not depend on the caller having checked.
    assert.throws(
      () =>
        buildCheckoutSessionPayload(
          [artworkToCheckoutLine(artwork)],
          "US",
          "https://printatelier.test",
          {},
          [artwork],
        ),
      /print file/i,
      `a Stripe session was priced for a listing whose print file is ${JSON.stringify(url)}`,
    );

    // The fulfillment end: the same string arriving as order metadata.
    const key = `${FULFILLMENT_INPUT_METADATA_KEYS.printFileUrl}_0`;
    const resolved = resolvePrintFileUrl({ [key]: url }, 0);
    assert.equal(resolved.ok, false, `resolvePrintFileUrl accepted ${JSON.stringify(url)}`);
    assert.equal(
      resolved.value,
      "",
      `an unresolved print file must carry no value — ${JSON.stringify(url)} leaked through`,
    );
    assert.deepEqual(resolved.missing, [key]);
  });
}

test("no degenerate print file URL reaches a print partner on the wire", () => {
  // The end the buyer's money is already spent at. `toPrintfulWirePayload` omits
  // `files` entirely when nothing resolved, so the assertion is that the key is
  // absent — not that it holds something harmless.
  const key = `${FULFILLMENT_INPUT_METADATA_KEYS.printFileUrl}_0`;

  for (const { url, why } of DEGENERATE_PRINT_FILE_URLS) {
    const metadata = { ...FULFILLABLE_METADATA, [key]: url };

    const wire = toPrintfulWirePayload(buildPrintfulOrderPayload(FULFILLABLE_ORDER, metadata));
    assert.equal(
      wire.items[0]?.files,
      undefined,
      `Printful would be sent files: ${JSON.stringify(wire.items[0]?.files)} for ${JSON.stringify(
        url,
      )} — ${why}`,
    );

    const gelato = buildGelatoOrderPayload(FULFILLABLE_ORDER, metadata);
    assert.equal(
      gelato.items[0]?.fileUrl,
      "",
      `Gelato would be sent fileUrl ${JSON.stringify(gelato.items[0]?.fileUrl)} for ${JSON.stringify(
        url,
      )} — ${why}`,
    );
  }
});

test("a submission is blocked, not queued, when the print file is a bare scheme", async () => {
  const key = `${FULFILLMENT_INPUT_METADATA_KEYS.printFileUrl}_0`;
  const submission = await queuePrintfulFulfillmentFromOrder(
    FULFILLABLE_ORDER,
    { ...FULFILLABLE_METADATA, [key]: "https://" },
    {},
  );

  assert.ok(submission, "expected a submission record");
  assert.equal(
    submission.status,
    "blocked",
    `an order whose only artwork URL is "https://" was queued as ${submission.status}`,
  );
  assert.match(submission.message ?? "", new RegExp(key));
});

// --- and refused a URL that was fine --------------------------------------

/**
 * RFC 3986 §3.1: the scheme is case-insensitive. `startsWith("https://")` is
 * not, so `HTTPS://host/a.tif` — a valid, fetchable https URL — was reported as
 * `print-file-not-fetchable` and the listing was refused. Harmless next to the
 * fail-open above, but it is the same line of code and it refuses real revenue.
 */
for (const url of [
  "HTTPS://files.example.test/prints/midnight-coast.tif",
  "Https://files.example.test/prints/midnight-coast.tif",
  "httpS://files.example.test/prints/midnight-coast.tif",
]) {
  test(`a print file URL with the scheme written ${JSON.stringify(
    url.slice(0, url.indexOf(":")),
  )} is accepted at both ends`, () => {
    const artwork = sellableArtwork({ printFileUrl: url });
    assert.equal(hasUsablePrintFile(artwork), true, `${url} rejected by the listing gate`);

    const eligibility = validateCheckoutLineItem(artwork);
    assert.deepEqual(eligibility.blockers, []);
    assert.equal(eligibility.eligible, true);

    const key = `${FULFILLMENT_INPUT_METADATA_KEYS.printFileUrl}_0`;
    const resolved = resolvePrintFileUrl({ [key]: url }, 0);
    assert.equal(resolved.ok, true, `${url} rejected by the fulfillment resolver`);
    // The recorded string, not a re-serialised one: a pre-signed URL's token can
    // cover the exact path and query, and normalising it can invalidate it.
    assert.equal(resolved.value, url);
  });
}

test("a signed download endpoint with no path but a query is accepted", () => {
  // Deliberately allowed by the "addresses a resource" rule: `https://host/?id=1`
  // does name one file, and refusing it would refuse revenue for no failure.
  const url = "https://dl.example.test/?id=midnight-coast-master";
  assert.equal(hasUsablePrintFile(sellableArtwork({ printFileUrl: url })), true);
  assert.equal(
    resolvePrintFileUrl({ [`${FULFILLMENT_INPUT_METADATA_KEYS.printFileUrl}_0`]: url }, 0).ok,
    true,
  );
});

test("a field holding only whitespace is reported as missing, not as unfetchable", () => {
  // "Replace the print file with an https URL" is not an instruction an operator
  // can follow when there is no URL on the listing to replace.
  const eligibility = validateCheckoutLineItem(sellableArtwork({ printFileUrl: "   " }));
  assert.deepEqual(
    eligibility.blockerDetails.filter((b) => b.code.startsWith("print-file")).map((b) => b.code),
    ["print-file-missing"],
  );
});

/**
 * A source contract, not a behaviour test.
 *
 * The defect was two copies of one rule, so the regression is *re-growing a
 * second copy* — and a behaviour test cannot see that: a fresh
 * `startsWith("https://")` in `checkout.ts` that happens to agree with the
 * shared validator on these inputs passes every assertion above. What has to
 * hold is that there is one definition and the storefront calls it.
 */
test("the checkout does not carry its own copy of the print file rule", () => {
  const source = readFileSync(`${VENTURE_ROOT}src/lib/checkout.ts`, "utf8");

  assert.match(
    source,
    /isUsablePrintFileUrl/,
    "checkout.ts no longer calls the shared print file validator",
  );
  // Comments are stripped first: the history of this defect is written down in
  // them, and quoting the old expression there must not fail its own contract.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(
    code,
    /startsWith\(\s*["'`]https/,
    "checkout.ts tests a URL scheme with startsWith again — that is the two-copies defect regrowing. The rule lives in parsePrintFileUrl in fulfillment-order-inputs.ts.",
  );
});
