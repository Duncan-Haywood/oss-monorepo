---
title: "Quality fix: the sales tax inside a Square partial refund"
seo_title: "Square partial refund sales tax journal entry: take the tax out of the payable"
date: 2026-11-25
tags: [quality-audit, square-sales-to-journal, for-customers, bookkeeping, sales-tax]
description: "Square Sales To Journal now takes the sales tax in a partial refund back out of Sales Tax Payable, instead of booking the whole refund to Refunds and overstating the tax you owe."
---

A customer buys $100 of goods, pays $8 sales tax and a $5 tip, then brings
half the goods back. Square refunds $54: $50 of goods and the $4 of tax on
them. Square's Transactions export prints that as one number in the Partial
Refunds column. Until today
[Square Sales To Journal](../../ventures/square-sales-to-journal/) booked
all $54 to Square Refunds, which left **Sales Tax Payable at $8.00 when the
business owes $4.00**. The sales tax return would then be prepared from an
overstated liability, and Refunds would be overstated by the same $4.

The [quality audit of 2026-11-22](../../portfolio/quality/audits/2026-11-22-square-sales-to-journal.json)
found it with a CSV it wrote by hand (defect 1, medium). The README had since
told the reader to adjust the payable by hand. That is a stated limit, not a
fix, so this run fixed it.

## What changed

- **The tax in a partial refund comes out of Sales Tax Payable.** Square does
  not split a refund, so the tax inside it is apportioned at the row's own
  rate: tax divided by net sales plus service charges plus tax. Tips are left
  out, since a refund of goods does not usually refund the tip. On the
  example above that gives 54.00 × 8 / 108 = 4.00 exactly, so the journal now
  reads Cr Sales Tax Payable 4.00, Dr Square Refunds 50.00.
- **The amount is listed.** Every file with an apportioned refund gets an
  info finding with the total and one example row, so it can be checked
  against Square's Sales Summary (Taxes). If an item was refunded at a
  different rate from the rest of the sale (a taxed item returned from a
  mixed basket), the apportionment is an estimate, and the finding says so.
- **It can be turned off.** `validate(text, { refundTax: "none" })` keeps the
  old single-amount booking for anyone whose refunds are journalled
  elsewhere.
- **A month that nets to zero writes no journal.** A sale and its full refund
  in the same month used to produce a journal with one Square Clearing line
  of 0.00. In QuickBooks Desktop's IIF format that is a TRNS with no SPL,
  which importers can refuse. Now no journal is written and an info finding
  says why (audit defect 6, low).
- Copied code left over from a sibling Etsy tool (an unused date parser and
  its month table, a dead `(it.gift ? 0 : 0)`) was removed (defect 7, low).

## How we checked it

`node --test 'ventures/square-sales-to-journal/*.test.mjs'`: 37 tests pass,
up from 32. The new tests use a CSV written by hand, not the tool's own
sample builder, and cover the $54 refund above, the off switch, a refund on
an untaxed row (no tax moves) and the zero month. The sample report's $20
refund on a $64.95 sale now carries 20.00 × 4.95 / 64.95 = 1.52 of tax, and
the existing test's expectations moved by that amount.

Two bugs were seeded by hand with `platform/ci/quality_mutate.py` and both
were caught: dropping the tax adjustment, and adding the tip to the
apportionment base.

## What is still open

From the same audit, the low defect about untested paths (date order,
refund-status rows, positive-printed discounts) is still open. The column
names are still from memory of Square's help pages, not checked against a
real export, as the page says. A later quality round re-audits the tool; this
fix does not raise its score.

Not tax advice: how a refund's tax is reported depends on your state's rules,
so check the filing with whoever prepares your sales tax return.
