---
title: "Shipping counted as list-price sales. Red-teaming a Shopify discount analyzer"
seo_title: "Shopify discount analyzer stops counting shipping as list-price sales"
date: 2026-11-16
tags: [testing, mutation-testing, shopify, csv, redteam]
description: "24 faults seeded in three analyzers, 9 caught, every non-equivalent one after new tests. One real defect, plus one contract test over 32 copied functions."
---

This red-team run seeded eight faults each into three report analyzers: the
[rent-roll delinquency analyzer](https://marisstella.app/rent-roll-delinquency-analyzer/),
the [Postgres index auditor](https://marisstella.app/postgres-index-auditor/)
and the
[Shopify discount-leakage analyzer](https://marisstella.app/shopify-discount-leakage-analyzer/),
which reads a Shopify orders export and shows how much each discount code gave
away and whether it paid for itself.

The repository's own tests caught 9 of the 24. The Shopify suite caught none
of its eight.

## The real defect: Total is not list price

The Shopify page says an export needs "Name, Total (or Subtotal)". When the
Subtotal column was missing, the analyzer worked out each order's list price
as Total plus the discount. But Shopify's Total also includes shipping and
tax. An order with a $100 list price, a $10 code and $6 shipping (Total $96)
was read as $106 of list-price sales, so the discount rate came out at 9.4%
instead of 10%. An order with $6 shipping and $12 tax and no code was read as $118 of list-price sales instead of $100.

The code already looked up the Shipping and Taxes columns. It never used
them. It now takes them back out of Total when they are present, with a test
that fails on the old code. Full exports, which carry Subtotal, were never
affected.

## What the tests missed

The Shopify suite tested the break-even formula and the sample store, but no
test computed contribution per order to the cent, so turning
`paid * feePct` into `paid / feePct` passed. None decoded a UTF-16 file
(Excel's "Unicode text" save), so breaking the byte-order check passed. And
one fault flagged every discount code as needing 60% new customers to pay for
itself once a product cost was typed in. The first test written for it checked
the case with no cost, which the fault does not touch; re-running the mutant
showed it still escaping, and the second test checks the right case.

The rent-roll suite missed a time with seconds losing its PM ("10:30:15 PM"
read as 10:30 in the morning), a payment dated on the as-of day being treated
as not yet made, and day-first date detection.

The two Postgres escapes could not change anything a user sees: one moves the
line number of a header row that is never reported.

## One test for 32 copies

Three of the escaped faults were in `detectDecimalComma`, the function that
decides whether "12,50" in an upload is twelve and a half or twelve hundred
and fifty. It is copied, byte for byte, into 32 analyzers. Thirty of them had
no test that called it.

Rather than add 30 tests, `platform/ci/decimal_comma_contract.mjs` now
imports every copy and runs it against one table of 20 cases. It runs on
every pull request, and each of this run's three seeded faults fails it.

## Numbers

| | Seeded | Caught before | Caught after |
|---|---|---|---|
| rent-roll-delinquency-analyzer | 8 | 3 | 8 |
| postgres-index-auditor | 8 | 6 | 6 (2 equivalent) |
| shopify-discount-leakage-analyzer | 8 | 0 | 7 (1 equivalent) |

The analyzers run in your browser and give estimates from your own export,
not financial advice.
