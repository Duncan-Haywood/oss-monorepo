---
title: "Quality fix: every Etsy sale renews the listing for $0.20"
seo_title: "Etsy auto-renew fee on each sale: what a listing really costs"
date: 2026-11-27
tags: [quality-audit, etsy-profit-calculator, for-customers, online-sellers]
description: "Our Etsy listing-renewal page split one $0.20 fee across every sale in a four-month window. Etsy auto-renews a listing on each sale, so each sale pays its own $0.20. Fixed."
---

The [Etsy Profit Calculator](../../ventures/etsy-profit-calculator/) has a
page for one question: does auto-renew still pay on a listing that sells
slowly? The answer it gave was wrong.

The page said Etsy charges the $0.20 listing fee "when a listing publishes
or auto-renews, not once per sale". So it took one $0.20 fee, split it
across the sales you expected in the four-month window, and said charging
$0.20 on every order "overstates listing cost". At two sales it showed
$0.10 of listing cost per sale.

Etsy's own help pages say otherwise. "Fees and Listing Multiple
Quantities" gives the example of a listing of three bowls: when one sells,
the listing auto-renews because two are left, and the seller pays another
$0.20. Each further unit sold is another $0.20. A quantity-1 listing that
sells out has to be renewed, for $0.20, to sell again. "How to Renew or
Hide Your Listings" adds the timer: a listing that reaches four months
unsold renews for $0.20 if auto-renew is on. So every sale carries its own
listing fee. The timer only adds a fee when a listing goes four months
without selling. The quality audit of 2026-11-26
([audit file](../../portfolio/quality/audits/2026-11-26-etsy-profit-calculator.json),
defect 1, high) caught it.

## What the page says now

On the page's default order ($30 item, $5 shipping charged, 6.5%
transaction fee, 3% + $0.25 payment processing, $6 postage, $4 materials,
$1 other cost), each sale leaves $20.43 before the listing fee. By hand:
$35 revenue, minus $2.28 transaction, $1.30 processing and $11 of costs.

| sales in 4 months | listing fees, before | listing fees, now | leftover, now |
|---|---|---|---|
| 0 | $0.20 | $0.20 | −$0.20 |
| 1 | $0.20 | $0.20 | $20.23 |
| 2 | $0.20 | $0.40 | $40.45 |
| 5 | $0.20 | $1.00 | $101.13 |
| 0.5 (one sale every 8 months) | not modelled | $0.20 ($0.40 a sale) | $10.01 |

For a listing that sells at least once every four months, the main
calculator's flat $0.20 per order was right all along. What it misses is
the window with no sale: the renewal still costs $0.20, and a listing that
sells once every eight months pays $0.40 a sale. The page now shows the
listing fees for the window, says whether each sale covers its own
renewal, and names only the renewals the per-order view leaves out.

## Tests that would have caught it

The new tests pin the published example ($0.40 of fees and $40.45 left
over at two sales, checked by hand above) and the eight-month case. They
also stop the page from saying "not once per sale" again. Two seeded
mutants, one putting back the single fee split across sales and one
dropping the expiry renewals, now fail the suite (before the fix, the
tests asserted the wrong $0.10 figure). The same PR also adds the
boundary test the audit asked for on the Offsite Ads ceiling (defect 5).

## Still not at the bar

The audit's other gaps are still open and listed in the calculator's
README under "Known gaps". There is no sales-tax field, so payment
processing on taxed US orders is low by 3% of the tax. The page doesn't
model the $0.20 per extra unit in a multi-unit order, the regulatory
operating fee, currency conversion or gift wrap either. A later round
re-audits the subject. This post does not raise its score.

This calculator is arithmetic from your own inputs, not Etsy's live fee
schedule and not tax or business advice. Check your Etsy payment account
for the fees you were actually charged.
