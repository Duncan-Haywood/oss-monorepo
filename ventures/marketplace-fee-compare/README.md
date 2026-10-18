# Marketplace fee comparison

**Which channel nets the most on this item?** Type one item once — price,
landed cost, category, monthly order volume — and see net profit side by side
on eBay, Etsy, Amazon, Walmart, TikTok Shop, Mercari, Depop, Facebook Marketplace, Poshmark, and your own Shopify store.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/marketplace-fee-compare/

Free, no signup, and nothing you type leaves the browser.

- `index.html` — the comparison
- `which-marketplace-has-the-lowest-fees.html` — the worked explainer
- `calc.mjs` — the fee models and the ranking
- `bulk.html` / `bulk.mjs` — paste a whole catalogue (CSV or spreadsheet rows), get the best buyer-bringing channel per item and the monthly cost of staying on one channel
- `share.mjs` — allowlisted encode/decode for the "Copy share link" URL fragment
- `usage.mjs` — anonymous, local, opt-out event counting

## Why this exists

This repo already ships a deep calculator for each of those channels. Each one
answers its channel thoroughly, and none of them answers the question a
multi-channel seller *starts* with: of the places I can list this, which leaves
the most in my pocket? Today that means opening six tabs, retyping the same
item six times, and comparing six numbers by hand — which is the point at which
most sellers stop and guess.

So this is a triage tool, not a seventh fee engine. It models each channel's
**headline** fee structure and then points at the deep calculator for the parts
a headline rate cannot carry.

## Price to match

Each row also shows the list price that channel needs for this item to net what
the best buyer-bringing channel nets. That turns the ranking into a repricing
answer ("charge $X on Walmart to keep what eBay leaves me") and leaves the
own-store row out as the yardstick, since it brings no buyers.

## What it models

| Channel | Rate | Fixed | Subscription |
| --- | --- | --- | --- |
| eBay | 13.6% final value (up to $7,500) | $0.40 over $10 ($0.30 at $10 or less) | — |
| Etsy | 6.5% transaction + 3% payment | $0.20 listing + $0.25 payment | — |
| Amazon (seller-fulfilled) | referral by category, 8–20% | — | $39.99/mo Professional |
| Walmart Marketplace | referral by category, 8–20% | — | — |
| TikTok Shop | 6% US referral | — | — |
| Mercari | 10% selling fee on item + buyer-paid shipping (current schedule) | — | — |
| Depop (US) | 0% selling fee; 3.3% payment processing on item + buyer-paid shipping | $0.45 | — |
| Facebook Marketplace (shipped) | 10% selling fee on the buyer-paid total, $0.80 minimum per shipped order (local pickup is free and not modelled) | — | — |
| Poshmark | flat $2.95 under $15.00, 20% of the sale price from $15.00 (buyer pays the prepaid label, so shipping is ignored on both sides) | — | — |
| Your own Shopify store | 2.9% payment processing | $0.30 | $39/mo Basic |

Every rate is an **editable default**, taken from the matching calculator in
this repo so the two agree by construction. None of them is a live fee
schedule; a seller's own statement wins, and the page says so.

Three modelling decisions worth knowing about:

- **Percentages are charged on the whole order**, item price plus any shipping
  the buyer paid. That is how every modelled channel actually bills, and it is the most common
  way a "free shipping" margin quietly goes negative.
- **Subscriptions are spread over the seller's own monthly order count**, not
  ignored. Ignoring them is what makes a $39.99 Amazon plan look free at three
  orders a month.
- **Marketplace fees are not counted as invested cash.** They come out of
  proceeds, not out of pocket, so counting them would understate ROI by a
  different amount on every channel and make the ranking meaningless.

## What it deliberately does not model

Each row names what its number leaves out and links to the tool that carries
it: Amazon FBA size tiers and storage, Etsy Offsite Ads, eBay Promoted
Listings, TikTok creator commission and the announced October 2026 schedule,
Shopify plan tiers, Walmart WFS.

**Faire is excluded from the ranking on purpose.** It is wholesale: the buyer is
a shop paying roughly half retail, and the economics turn on order size and
reorder rate rather than one retail order. Ranking it beside the ten retail
channels would produce a number that looks comparable and is not. It gets a
pointer instead of a row.

**Whatnot is excluded for the same reason in a different shape.** It is a
livestream auction: commission is on the hammer and processing is on the
checkout total (item plus buyer-paid shipping and tax), with published category
caps a flat retail referral rate cannot express. It gets a pointer to
`whatnot-seller-payout` instead of a row in the ranking. For trading cards it
appears in the specialist section (below) with the $1,500 commission cap modelled.

**StockX is excluded like Reverb, on category grounds.** It lists only sneakers,
streetwear and graded cards, the buyer pays StockX for delivery (so no postage
reaches you), and the fee rate falls with your own Seller Level. It gets a
pointer to `stockx-seller-payout-calculator` with price, cost basis, shipping
and other cost already filled in. For clothing and sneakers it also appears in
the specialist section, at the 9% + 3% default with the buyer's shipping kept
out of your revenue.

**The own-store row carries a caveat attached to the win, not to the footnotes.**
A Shopify checkout charges no referral fee and therefore tops the table on
almost any item — arithmetically true and operationally misleading, because it
also sends you no buyers. When it wins, the page names the best channel that
*does* bring demand and the gap between them, and calls that gap the
advertising budget.

## Bulk catalogue mode

`bulk.html` takes a header row plus up to 500 items (`price` and `cost`
required; `name`, `shipping_charged`, `shipping_cost`, `other_cost`,
`category`, `orders` optional), runs each through the same `compareChannels`
model, and reports the winner per item, how many items each channel wins, and
the monthly gain over the channel you list on today. Rows that fail to parse
are reported by line number without hiding the rest. Own store is never the
recommended channel (it sends no buyers). The monthly figure assumes each
item's full order volume moves, so it is an upper bound. The CSV export
prefixes cells that start with `=`, `+`, `-` or `@` so a spreadsheet will not
run them as formulas. Nothing is uploaded; the only counter is an anonymous
local `catalog_compared` event.

## Sharing a comparison

"Copy share link" encodes the item, category, orders-per-month, and any rate
overrides into the page's own URL, after a `#`. A browser never sends the
part of a URL after a `#` to a server, so this carries no price, cost, or
volume data anywhere it wasn't already — it's a private link, not a hosted
save. Opening the link pre-fills the form with the sender's inputs and
recomputes the same ranking, before the first (uncounted) paint. `share.mjs`
allowlists the exact fields it carries on both encode and decode, so a link
that predates a future field degrades to that field's default rather than
throwing, and an unrecognized key in a hand-edited fragment is dropped rather
than trusted.

## Usage measurement

Three anonymous counters in the visitor's own `localStorage`
(`marketplace-fee-compare-usage`): `comparison_run`, `comparison_copied`, and
`share_link_copied`. No prices, costs, categories, volumes, identities, IPs,
or cookies — and nothing leaves the device. Counting honors Do Not Track and
Global Privacy Control, and the page carries an opt-out checkbox.

The first render on page load is deliberately **not** counted, and keystroke
bursts settle into one event after 800 ms, so a visit that bounces off the
prefilled example logs nothing and typing "250" logs one comparison rather than
three.

## Tests

```
node --test "ventures/marketplace-fee-compare/*.test.mjs"
```

Run `node --test "ventures/marketplace-fee-compare/*.test.mjs"` for the current count. The files cover the fee arithmetic and ranking (`calc.test.mjs`),
the usage counter's privacy guarantees (`usage.test.mjs`), the share link's
round-trip and allowlist guarantees (`share.test.mjs`), the page's structure
and wiring (`page.test.mjs`), and the explainer article's worked numbers pinned
to the model so the two cannot drift apart (`article.test.mjs`).

The primary sharing journey was also exercised in headless Chromium: editing
the item, category, and an eBay rate override, copying the share link, opening
it as a fresh page, and confirming the recipient's form and verdict match the
sender's exactly, with no console errors on either page.

The primary customer journey was also exercised in headless Chromium: first
paint counts nothing, a category change re-ranks the table, a keystroke burst
records one event, a negative cost hides the stale table and recovers, and the
own-store caveat appears whenever that row wins.

## Disclaimers

The page carries the portfolio's standard no-warranty and no-SLA text, plus a
rate-specific one: fee rates change, the defaults here are inputs rather than a
schedule, and they should be confirmed against the seller's own statement
before a catalogue is priced against them. This is an arithmetic comparison,
not tax, financial, or business advice.

## Specialist marketplaces

Reverb (musical gear), Grailed (menswear and streetwear), StockX (sneakers and
streetwear), TCGplayer and Whatnot (trading cards) only take one kind of item, so they are not in the ten-row ranking.
When the category is *Musical instruments & gear*, *Clothing & accessories* or
*Trading cards & collectibles*, a separate section (`specialists.mjs`) shows
what the item nets there and how that compares with the best general channel.
Fee schedules match the sibling calculators, which a test asserts.
