# Print Atelier checkout: an off-catalog slug sets its own price and payout account

Found 2026-08-04. Reported rather than fixed — see *Why this is a report* below.

Status: **open**. Reproduced against the working tree at
`84c3286f` plus the uncommitted changes present in it at the time.

## What happens

`POST /api/stripe/checkout` is anonymous by design — buyers check out. It takes
a `lineItems` array from the request body, and every money-bearing field on a
line item (`retailPrice`, `fulfillmentCost`, `artistAccountId`) is supposed to be
re-derived from the server-side catalog before it can reach Stripe.

It is re-derived **only when the slug matches a catalog artwork**:

```ts
// src/lib/checkout.ts — sanitizeCheckoutLineItems
const artwork = artworks.find((a) => a.slug === item.artworkSlug);
if (!artwork) {
  return item;          // client's own numbers, untouched
}
```

`buildCheckoutSessionPayload` has the same shape — `if (artwork) {...} return item;`.

The gate that is supposed to catch an off-catalog item does fire:
`buildCheckoutReadiness` pushes `` `Unknown artwork slug: ${line.artworkSlug}` ``.
But the route decides whether that blocker counts by matching substrings of it:

```ts
// src/app/api/stripe/checkout/route.ts
const cartBlockers = readiness.blockers.filter(
  (blocker) =>
    !blocker.includes("STRIPE") &&
    !blocker.includes("PRINTFUL") &&
    !blocker.includes("Gelato"),
);
if (cartBlockers.length > 0) { /* 422 */ }
```

The blocker string embeds the caller's own slug. So a cart whose
`artworkSlug` is `Gelato` produces the blocker `Unknown artwork slug: Gelato`,
which contains `"Gelato"`, which the filter strips. `cartBlockers` is empty and
the checkout proceeds.

`cartEligible` has the same defect independently:

```ts
cartEligible: lineItems.length > 0 &&
  blockers.filter((b) => !b.includes("STRIPE")).length === 0,
```

## Reproduction

```
POST /api/stripe/checkout
{"lineItems":[{"artworkSlug":"Gelato","title":"Free Print","artistName":"Attacker",
  "artistAccountId":"acct_attacker","artistHandle":"@attacker",
  "retailPrice":0.01,"fulfillmentCost":-100000,"quantity":1}],"region":"US"}
```

Observed, by calling the three library functions in the same order the route
does, with test-mode Stripe keys present:

```
after sanitize, retailPrice = 0.01
after sanitize, artistAccountId = acct_attacker
blockers = ["Unknown artwork slug: Gelato",
            "STRIPE_CONNECT_CLIENT_ID missing for artist transfer routing"]
cartBlockers after route filter = []
>>> CHECKOUT PROCEEDS
unitAmountCents = 1
metadata.destinationConnectAccountId = acct_attacker
metadata.artistTransferTotal = 29999.90
```

`STRIPE`, `PRINTFUL` and `Gelato` all work as slugs; the match is case-sensitive
and any slug containing one of those tokens will do.

`fulfillmentCost` is unbounded and negative values are accepted, which is where
the $29,999.90 comes from: `calculatePrintEconomics` computes
`netProfit = retailPrice - paymentFee - fulfillmentCost - aiComputeCost` and the
artist share is 30% of it.

## Impact

Two distinct losses, with different certainties. Stated separately because they
are not equally live.

**1. Price bypass — live.** With Stripe keys configured this path calls
`stripe.checkout.sessions.create` for real. The buyer pays one cent, the webhook
records a paid order, and fulfillment is queued to a print partner: a physical
print, shipped to the buyer's real address, against a fulfillment cost the
business pays. Loss per order is the full cost of goods and shipping, and the
order looks completely ordinary in the ledger.

**2. Payout redirection — poisons the ledger; not currently auto-executed.**
`processStripeConnectWebhookEvent` reads `destinationConnectAccountId` and
`artistTransferTotal` straight off payment metadata, and those become the order
record that `payout-reconciliation.ts` and the batch-transfer surface are built
from. I found **no** `stripe.transfers.create` or `/v1/transfers` call anywhere
in the venture, so nothing pays this out automatically today. What it does is
place an attacker-chosen destination and amount into the payout queue, where an
operator working the queue is the remaining control.

Neither depends on a Stripe Connect account existing: the metadata is written
regardless, and `STRIPE_CONNECT_CLIENT_ID missing` is one of the blockers the
filter strips.

## Why the existing tests did not catch it

Three tests assert exactly this protection:

- `tests/checkout.test.ts` — "blocks cart with manipulated retail price"
- `tests/checkout.test.ts` — "enforces canonical catalog price over client-supplied retailPrice"
- `tests/checkout-price-tampering.test.ts` — both cases

All four buy `midnight-coast`, a slug the catalog holds. Every one of them
exercises the `if (artwork)` branch. The `return item` branch — the one that
carries client input through — has no test at all. The protection is real on the
path that is tested and absent on the path that is not.

## Suggested fix

Three layers, in the order they matter:

1. **Stop classifying blockers by substring.** Add `cartBlockers: string[]` to
   `CheckoutReadiness`, populated at the point where the distinction is actually
   known (cart-derived checks vs. `getCheckoutEnvStatus`), and have the route and
   `cartEligible` read it. The existing `blockers` field can stay as-is for other
   consumers. No string matching against caller-controlled text anywhere.
2. **Refuse to price an off-catalog item.** `buildCheckoutSessionPayload` should
   throw rather than fall through to `return item`, so no caller can put a
   client-chosen amount on a Stripe session even if a gate is bypassed. This is
   the money boundary and should not depend on a route remembering to check.
3. **Note that `sanitizeCheckoutLineItems` is not a security boundary.** Its
   catalog-miss passthrough is deliberate (dropping items silently would turn an
   attack into a partial cart, which is worse) but it reads like a sanitizer.

A regression test that fails against current behaviour is written and available
at `docs/attachments/checkout-off-catalog-item.test.ts` — it covers all four
slug shapes, asserts env gaps stay out of `cartBlockers`, and asserts a catalog
cart still prices and routes normally.

## Why this is a report

`src/lib/checkout.ts`, `src/app/api/stripe/checkout/route.ts` and the webhook
route were all being actively edited by another agent in the shared working tree
during this run — `sanitizeCheckoutLineItems` and the canonical re-derivation in
`buildCheckoutSessionPayload` are that agent's uncommitted work in progress, and
the hole described here is a gap in a fix that is still being written. Editing
those files underneath it would corrupt both changes. The fulfillment fix this
run did land (`fulfillment-order-inputs.ts`) touches only files that agent is not
in.
