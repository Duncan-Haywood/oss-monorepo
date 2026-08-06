# Can a paid print-atelier order actually ship? — end-to-end trace, 2026-08-06

Traced at `fd84e089` by reading `git show HEAD:<file>` throughout, because the
shared checkout makes another session's uncommitted work look landed.

**Answer: no, and it correctly refuses to try.** Every guard on the path is
fail-closed and every refusal names an operator action. The venture takes no
money today, and that is the honest outcome of a supply gap, not a bug.

Two defects were found *outside* the guarded path and are fixed on this branch.
The remaining blockers are all off-repo and are listed at the end with the file
each human step lands in.

---

## Hop-by-hop: is there a writer for every field the next hop reads?

| # | Hop | Writer for the next hop's fields? |
| - | --- | --- |
| 1 | Artwork/listing → cart | **Partial.** `printFileUrl` has **no writer** |
| 2 | Cart → checkout session | Yes |
| 3 | Session → Stripe metadata | Yes, except `buyerEmail` |
| 4 | Webhook → order record | Yes |
| 5 | Order → partner request | Yes, except `buyerEmail` |
| 6 | Order → artist payout | **No.** Reader reads a store nothing writes |

### 1. Listing definition — `printFileUrl` has no writer anywhere

`CatalogArtwork.printFileUrl` (`src/lib/marketplace.ts:34`) is declared optional
and set by **none** of the six seeded artworks. Every mechanism that could
populate it was checked and does not exist: no env var, no JSON/YAML seed, no
upload route (no `formData`/`multipart` handler under `src/app/api`), no
`public/` directory, no persistence module (all eight store consent, releases,
orders, CRM, payout exceptions, ledger and variant maps — none stores artwork),
and no asset vault (`src/lib/partner-credentials.ts` holds API keys only). The
capture flow is the closest thing and never produces a URL:
`src/lib/capture.ts:27-38` records `fileName`/`fileSizeBytes`/`mimeType` only,
and `src/app/capture/page.tsx:29` says in its own comment that the uploaded
`File` is never read.

The only way to populate the field is to hand-edit `marketplace.ts`, and doing
so deliberately fails `tests/catalog-print-file-provenance.test.ts:105-118`
until the artist's actual file is committed under `public/`.

**This is the root blocker, and refusing to invent a value for it was correct.**

### 2–3. Cart → checkout → Stripe

Sound, and the historical defects in this stretch are genuinely fixed.

- The `cartCount = 2` literal join is gone: `addSlugToCheckoutCart`
  (`src/lib/checkout-cart-client.ts:36`) resolves the slug against the catalog
  and refuses an unknown one; `countCheckoutCartItems` (`checkout.ts:740`) sums
  real quantities.
- `buildCheckoutSessionPayload` (`checkout.ts:513-621`) throws rather than
  pricing an off-catalog slug (`:538`) or one with no print file (`:527`).
- Metadata is written to both the Session and the PaymentIntent
  (`stripe-checkout-server.ts:47`, `:58-60`), so it survives to
  `payment_intent.succeeded`.
- Per-line `artworkUrl_N` is written per line rather than as one shared key
  (`checkout.ts:611`), so a multi-artwork cart cannot collapse onto one image.

Because `hasUsablePrintFile` refuses all six listings, `/api/stripe/checkout`
answers **422 on every real cart** (`route.ts:116`). The rest of the path is
unreachable from the storefront today.

### 4. Webhook → order record

`recordOrderFromPaymentWebhook` (`orders.ts:207-270`) is the only writer and
`route.ts:120` the only caller. The store is process-local and **refuses rather
than evicting**, which is the right choice for paid orders.

One literal fallback survives here: `orders.ts:243-246` defaults
`lineItemCount` to `1` twice, and both adapters then apply
`Math.max(order.lineItemCount, 1)`. A metadata-less order silently becomes a
one-line order. Contained today because the per-line resolvers block
afterwards, but it is the same shape `resolveLineItemQuantity` was written to
end. Not fixed here — see "not fixed, and why".

### 5. Order → Printful / Gelato

**The builders are not test-only.** `route.ts:154` and `:167` call
`queueGelatoFulfillmentFromOrder` / `queuePrintfulFulfillmentFromOrder` with the
real payment metadata.

The reader side is well guarded — nothing invented reaches the wire.
`printful-orders.ts:291` omits `files` entirely rather than fabricating a URL;
`:159` emits `""` rather than a price. `resolveBuyerShippingAddress` and the
resolvers in `fulfillment-order-inputs.ts` have no defaults, and
`queuePrintfulFulfillmentFromOrder:342` fails closed *before* the dry-run
branch so a blocked order never enters the queue looking submittable.

**`buyerEmail` is the sharpest break on this hop.** The writer exists —
`extractStripeBuyerEmail` (`buyer-shipping.ts:125-151`) — but cannot produce a
value from the event actually handled:

- `receipt_email` — `stripe-checkout-server.ts` never sets
  `payment_intent_data.receipt_email`;
- `customer_details.email` — a Checkout **Session** field, and `orders.ts:214`
  hard-returns on any event other than `payment_intent.succeeded`, so
  `checkout.session.completed` is never processed;
- `latest_charge.billing_details.email` — guarded by `isRecord`, but on an
  unexpanded webhook `latest_charge` is a string id, and `charges.data` is not
  present on the pinned API version (`2025-02-24.acacia`).

So even with print files uploaded, **every order would be recorded `blocked`**
with `canRetry: false` and a message naming `buyerEmail`. It is reported
correctly — it appears in the fulfillment submissions panel — but it is a hard
stop. The `collected_information.shipping_details` branch
(`buyer-shipping.ts:174-181`) is dead for the same reason.

### 6. Artist payout — severed twice

- **No writer.** `buildArtistPayoutReconciliation` reads
  `queryPersistedStripePayoutEvents` (`payout-reconciliation.ts:257`). The only
  writers into that array (`stripe-payout-persistence.ts:72`, reached via `:214`
  and `:234`) have **no caller outside their own test**. The webhook writes to
  `stripe-ledger.ts:32`, a different array, which additionally evicts silently
  at 100 entries (`:55-57`) where the order and fulfillment stores throw. Every
  artist therefore classifies `unpaid`, and
  `executeConnectPayoutBatchTransfer` (`stripe-connect.ts:350-352`) treats the
  entire expected payout as owed. Wiring a real transfer behind this would
  double-pay.
- **Nothing sends money.** `transfers.create` appears nowhere under `src/`.
  `executeConnectPayoutBatchTransfer` builds `instructions[]` and returns a
  plan despite its name. `docs/BACKLOG.md:13` documents this honestly.
- **The payout destination is fabricated.** `artistAccountId` falls back to
  `` `acct_${artistName.toLowerCase().replace(/[^a-z0-9]/g, "")}` `` at
  `checkout.ts:200-202`, `:547-551` and `:594-596`. **No catalog artwork sets
  `artistAccountId`**, so every order carries a Connect account id synthesized
  from a display string. Harmless only because nothing transfers yet.

Two stale claims found in passing: the comment at
`payout-reconciliation.ts:424-428` and `docs/BACKLOG.md:7` both say the checkout
does not stamp the artist account. It has since `checkout.ts:589`. The real
problem is not that it is missing but that it is invented.

---

## Fixed on this branch

### A. The paid channel advertised prints the storefront refuses to sell

`evaluateSeoPagePublishability` (`src/lib/seo.ts`) decided four money-bearing
things: the `robots` directive on `/prints/[slug]`
(`src/app/prints/[slug]/page.tsx:26`), whether a slug enters `sitemap.xml`
(`buildSitemapEntries`), whether the "Shop this print" CTA is enabled
(`src/components/PrintLandingPage.tsx:98`), and whether a row is pushed to Meta,
Google and Pinterest with `availability` and a price (`ad-catalog.ts:93`,
`:156`).

It derived all four from `buildBlockers` (`seo.ts:58-70`) — proof, room mockups,
SEO copy — a **second enumeration of listing readiness that never asked whether
the print could be bought**. This is exactly the drift `listing-sellability.ts`
was written to end, one surface further out.

Measured on the seeded catalog with an origin configured:

| | before | after |
| --- | --- | --- |
| catalog listings | 6 | 6 |
| sellable (`validateCheckoutLineItem`) | 0 | 0 |
| landing pages generated | 16 | 16 |
| **publishable** | **3** | **0** |
| ad feed rows | 48 | 48 |
| **rows offered as `in stock`** | **9** | **0** |

Nine rows carrying a price and `in stock` were ready to push for prints that
answer 422. That is ad spend on clicks that cannot convert, plus a misstatement
of availability to three ad platforms.

Sellability is now taken from `validateCheckoutLineItem`'s own
`blockerDetails` — the same list `listing-sellability.ts` reads — so no third
enumeration exists and a blocker added to the checkout reaches the ad feed
without anybody remembering the file. `getSeoPagesWithPublishState` now forwards
the caller's own `artworks`/`consentRecords` instead of letting them fall back
to the seeded catalog. Strictly narrowing: nothing becomes publishable that was
not before.

### B. The last invented fulfillment input: the catalog slug

Both adapters resolved the artwork as
`readMetadataString(paymentMetadata, "catalogSlug") ?? "sample-print"`
(`printful-orders.ts:122`, `:190`; `gelato-orders.ts:109`, `:160`).

It looked contained — `sample-print` is in neither default variant map, so the
lookup failed and the order was refused. But that refusal was a property of a
row being **absent from a seed file**, not of the code. Adding a `sample-print`
mapping is an ordinary thing to do while testing a partner integration, and
doing it turns every order carrying no slug into a real order for the sample
print, printed and posted to a buyer who paid for a different artwork.

It also misdirected the operator: the refusal read `product mapping for
"sample-print"`, which reads as "add a variant mapping" when the missing input
is the slug the mapping is keyed on.

`resolveLineCatalogSlug` now lives in `fulfillment-order-inputs.ts` beside the
other resolvers, has no default, returns the same `ResolvedValue` shape, and
reports `catalogSlug_<index>`. Both adapters report the slug before the mapping
and instead of it.

---

## Not fixed, and why

- **`buyerEmail` (hop 5).** The remedy is either subscribing to
  `checkout.session.completed` or expanding/retrieving the charge — both are
  design decisions with a double-recording hazard against a vendor payload this
  repository cannot verify from here. Guessing at the shape of a Stripe event
  and shipping it is the same class of error as inventing a fulfillment input.
  Specified below as a human step instead.
- **`artistAccountId` fabrication.** The correct fix is a new checkout blocker —
  do not sell a print you cannot pay the artist for — which changes the
  sellability count for all six listings and touches the payout metadata shape
  many tests assert on. Worth doing, larger than this branch.
- **`lineItemCount || 1` (`orders.ts:243-246`)** and **`stripe-ledger.ts`
  silent eviction (`:55-57`)**. Real, contained today, both smaller than the
  two above.

Nothing was weakened. No gate, cap, validator or baseline was relaxed, and no
fail-closed guard was removed.

---

## What a human must do, in order

Steps 1–3 are what stand between this venture and its first dollar. Nothing in
the repository can substitute for any of them.

1. **Obtain a print-ready master from each artist** (300+ DPI, the print
   dimensions the variant map declares — 18×24 in for four listings, 12×16 for
   `spring-bloom`). This is an artist-relations action, not a code change.

2. **Host each master at an `https` URL a POD partner can fetch**, then record
   it on the listing.
   - Lands in: `ventures/print-atelier/src/lib/marketplace.ts`, the
     `printFileUrl` field of each `catalogArtworks` entry.
   - `parsePrintFileUrl` (`src/lib/fulfillment-order-inputs.ts:128`) requires
     `https`, a dotted or bracketed host, no embedded credentials, and a path
     or query beyond `/`.
   - **Do not use `atelier.marisstella.dev`** until step 6 is done. It currently
     runs `nginxdemos/hello`, which answers any path with `200` and
     `content-type: image/tiff` over a 197-byte status body — a successful GET
     from it is not evidence a file exists.
   - Then update `tests/catalog-print-file-provenance.test.ts:105-118`, which
     asserts the set of artworks carrying a print file is empty, **in the same
     change**. If the files are served by this app, commit them under
     `ventures/print-atelier/public/` — that directory does not exist yet, and
     the test at `:83-101` requires it.

3. **Decide how the buyer's email reaches fulfillment.** Until this is done
   every order is recorded `blocked` with `canRetry: false`, even with masters
   uploaded. Two options:
   - subscribe to `checkout.session.completed` and record from it —
     `src/app/api/stripe/webhook/route.ts` and `src/lib/orders.ts:214`, which
     currently hard-returns on any other event type. Needs deduplication
     against `payment_intent.succeeded` so one purchase is not recorded twice;
   - or retrieve the charge in the webhook and read `billing_details.email` —
     `src/lib/buyer-shipping.ts:125-151` already handles that shape once the
     object is expanded.

4. **Create the Kubernetes Secret `print-atelier-secrets`** in the
   `web-services` namespace with all nine required keys.
   - Lands in: out-of-band `kubectl`, per
     `platform/k8s/apps/print-atelier/SECRETS.md`. Correctly not a manifest —
     `platform/ci/test/print-atelier-deployment-env-contract.test.mjs` fails the
     build if a literal `value:` appears.
   - The pod stays in `CreateContainerConfigError` until all nine are present.
     That is intended: with Stripe live and Printful/Gelato absent, a charge
     succeeds and the print queues to a process-local array nothing drains.

5. **Map every Live artwork to a real partner product id.** The seeds are
   placeholders (`printfulVariantId: "4011"`, `gelatoProductUid:
   "gel_poster_18x24_matte"`).
   - Lands in: `src/lib/printful-variant-map.ts` and
     `src/lib/gelato-variant-map.ts`, or per-order overrides via the
     `variantId_N` / `gelatoProductUid_N` metadata keys.

6. **Build and promote a real image.** `.gitea/workflows/print-atelier-image.yml`
   publishes only `git.marisstella.dev/giteaadmin/print-atelier:<sha>`, while
   `platform/k8s/apps/print-atelier/deployment.yaml` pins `:latest` — a tag that
   workflow never produces, which is why the host still serves the echo server.
   - Lands in: the `image:` line of
     `platform/k8s/apps/print-atelier/deployment.yaml`, moved to a specific sha,
     the same shape as the `deploy(pairwise): promote <sha>` commits.
   - `NEXT_PUBLIC_SITE_URL` is a **build arg**, not a Deployment env entry —
     already wired at `print-atelier-image.yml` and bound to the ingress host by
     `platform/ci/test/build-arg-supply.test.mjs`.

7. **Before enabling any paid channel**, re-run
   `buildListingSellabilityReport()`. With fix A on this branch, a listing that
   cannot be checked out can no longer be indexed, sitemapped or advertised, so
   `sellableCount` is now the honest upper bound on what the ad feed will offer.

Steps 8+ (artist payouts) are not on the path to a first shipped order, but no
artist can be paid until `stripe-payout-persistence.ts` gains a production
writer, `artistAccountId` stops being synthesized from the artist's name, and
something actually calls `transfers.create`.
