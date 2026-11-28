---
title: "Re-audit: Seller Books now costs every unit an order sold, and two of its tests were still missing"
seo_title: "Reseller COGS on Schedule C: matching each unit sold to inventory"
date: 2026-11-28
tags: [quality-audit, evaluation, seller-books, for-customers]
description: "Seller Books re-checked: both high cost-of-goods defects closed, every recomputed Schedule C line matches; one test short of the bar."
---

Seller Books turns an online reseller's marketplace reports and purchases into
a Schedule C worksheet. It is in development and not deployed yet. The
[2026-11-26 audit](../../portfolio/quality/audits/2026-11-26-seller-books.json)
found two high-severity defects, both in cost of goods sold. An eBay order for
two bowls was linked to one bowl, so half its cost was left out. And a January
sale could take an item bought in March, which moved that cost into the wrong
period. Both change Part III, lines 41 and 42.

This re-audit checked all nine earlier defects against the code as it is
today ([audit file](../../portfolio/quality/audits/2026-11-28-seller-books-reaudit.json)).

## What we recomputed

We imported the repository's own eBay report into a new account and worked the
worksheet by hand from the Schedule C instructions. The account held a pair of
jeans and two bowls.

| line | by hand | Seller Books |
|---|---|---|
| 1 gross receipts (items + shipping, eBay-collected tax left out) | $1,295.00 | $1,295.00 |
| 2 returns (refund net of the tax eBay sent back) | $45.00 | $45.00 |
| 10 fees, with the fee credit on the refund netted | $187.68 | $187.68 |
| 29 tentative profit | $1,014.17 | $1,014.17 |
| Part III 41 / 42 once the returned jeans are marked back in stock | $7.00 / $20.00 | $7.00 / $20.00 |

Mileage was priced trip by trip: 100 miles in December 2025, 40 in March 2026
and 25.5 in August 2026 come to $118.38. That matches the
[IRS table](https://www.irs.gov/tax-professionals/standard-mileage-rates) we
fetched today, including the mid-2026 change from 72.5 to 76 cents a mile. The
1099-K check summed the books three ways and picked the right basis.

## The verdict

Seven of the nine earlier defects were closed when we arrived, both highs
among them. The other two were not. The import query's two rules had no test:
only items still in stock, and oldest first. Removing either rule left all 641
tests green, just as it did two days ago. Without the first rule, an item
already sold or written off can be sold a second time. Without the second, a
newer and more expensive item can be taken first. The earlier tests never had
more than two candidate items, and both were in stock and added oldest first.
eBay's `--` placeholder was also still being stored as an order number.

So the score is the same as last time: **correctness 3, claims 3, verification
2**. That is one gate short of the bar. Correctness went up from 2. This
round's PR adds a test that catches both mutants: four bowls added out of date
order, one of them written off. The same PR fixes the order number. The score
stays at the "before" value, and a later re-audit will grade the fix. Fitness
is still 2 because no seller can use the app until it is deployed.
