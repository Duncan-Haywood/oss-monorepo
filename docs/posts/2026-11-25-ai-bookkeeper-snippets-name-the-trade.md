---
title: "Forty-six bookkeeping pages that now say who they are for"
seo_title: "Shortening 46 AI Bookkeeper meta descriptions to fit a search snippet"
date: 2026-11-25
tags: [polish, seo, meta-description, ai-bookkeeper]
description: "AI Bookkeeper's trade and how-to pages had meta descriptions of 165 to 289 characters. All 46 now fit in 160 and most open with the trade they serve."
---

A search result shows about the first 155 to 160 characters of a page's
`<meta name="description">` and cuts the rest. Yesterday's polish run fixed
the front pages of the paid products and added a ratchet,
`platform/pages/description-length.mjs`, that lists every venture page still
over 160. AI Bookkeeper, one of the products heading for a subscription, had
46 pages on that list: every one of its trade guides (salon, trucking,
notary, food truck and 30 more), its payout explainers (Stripe, Square,
PayPal, Shopify, Etsy, eBay, Amazon, Airbnb) and four how-to pages.

They ran from 165 to 289 characters. The longest, the guide to doing
bookkeeping from bank statements, lost its point to the cut: the worked
example where two classic mistakes turn a profit into a loss was past
character 200.

## What changed

Each description now fits between 136 and 160 characters, written from the
facts already on the page; no figure is new. Two patterns:

- **Trade guides open with the trade.** "Square deposits are sales; beauty
  supplies…" became "Salon bookkeeping: Square deposits are sales…". The
  search someone types is "bookkeeping for a salon", and the old snippet
  never said "salon" in its first sentence. The worked month keeps its one
  headline number (profit, or money in when the page reports a figure before
  the owner's draw).
- **Payout pages keep the worked bridge.** "A $9.36 deposit is $10.00 of
  sales, $0.63 of tax owed and $1.27 of fees" is the answer the reader came
  for, so it stays; the filler around it went.

Titles, `og:description` and JSON-LD were left alone.

## Numbers

- Venture pages over 160 characters: 3,089 before, 3,043 after.
- AI Bookkeeper pages over 160: 46 before, 0 after.

The ratchet keeps them there: a page that leaves the baseline cannot grow
back past 160 without failing the site build's tests.
