---
title: "Sourcing runs are a business expense: putting a reseller's mileage on Schedule C line 9"
seo_title: "Reseller mileage on Schedule C line 9: the 2026 rate change"
date: 2026-11-24
tags: [resellers, mileage, bookkeeping, schedule-c]
description: "Thrift runs and post office trips go on Schedule C line 9. The 2026 rate changed on July 1, so a trip log has to be priced by date. Reseller Books now does it."
---

A reseller's marketplace reports carry sales, fees, postage and ads. They do
not carry the drive to the Goodwill outlet, the estate sale across town or the
three trips a week to the post office. For many resellers those miles are one
of the largest expenses after the goods themselves, and they sit in a notes app
or a spreadsheet that never meets the rest of the books.

[Reseller Books](../../ventures/reseller-books/) now reads that log beside the
eBay, Etsy, Poshmark, Mercari, Whatnot and Shopify files, and puts the result
where a preparer looks for it: Schedule C line 9, car and truck expenses.

## The rate changed in the middle of 2026

The standard mileage rate is not one number for the year this time. The
figures, as the repository's [mileage log](../../ventures/mileage-log/) records
them after checking irs.gov on 2026-09-29:

| Trips dated | Business rate | Source |
|---|---|---|
| 2025 | 70¢ a mile | Notice 2025-5 |
| 2026-01-01 to 2026-06-30 | 72.5¢ | Notice 2026-10 |
| From 2026-07-01 | 76¢ | Announcement 2026-11 |

So a year's miles times one rate is wrong for 2026. A hundred miles on
June 30 is worth $72.50 and a hundred on July 1 is worth $76.00; the tool
prices each trip at the rate for its own date, and a test pins exactly that
pair. Business tolls and parking are added on top, as the Schedule C
instructions for line 9 allow with the standard rate.

## What it reads, and what it refuses to guess

- **Any trip log CSV** with a date column and a miles column (or odometer
  start and end), including the Mileage Log venture's own export. Dates in
  `2026-03-04` or `3/4/2026` form both work.
- **No category column means a business log.** That is what a reseller keeps
  one for. With a category column, only rows marked business (or sourcing,
  shipping, post office, work) are deducted; commuting is counted for Part IV
  and never deducted, and anything blank or unrecognised is treated as
  personal, so nothing is deducted by accident.
- **Overlapping downloads count a trip once.** If two files share a row, it
  counts once. Two identical rows in the same file (two post office runs on
  the same day, same distance) both count, because that is what a real log
  looks like.
- **Trips the rate table cannot price are not priced.** A trip before 2025 is
  left out with a note. A trip after 2026 is priced at the last known rate and
  flagged, because the 2027 rate is not published yet.
- **Trips without a destination or purpose are counted and flagged.** A
  mileage log is expected to show where and why for each business trip.

The mileage stays out of the marketplace reconciliation (sales + refunds +
deductions = net payout still holds month by month), because it is not money a
marketplace moved. It appears as its own worksheet row, a Part IV row with
business, commuting and other miles, a monthly section in the CSV, and, when
every sale has a cost, a "profit after the car" figure.

## What it does not do

It does not compare the standard rate with actual car costs (the
[method comparison](../../ventures/mileage-deduction-method-calculator/) does),
and it does not decide whether the standard rate is open to you: it generally
has to be chosen in the first year the car is used for business, and the row
says so. It is arithmetic on your files, not tax advice.

This is the third milestone of Seller Books, a hosted product being built for
multi-marketplace resellers that this free page is the engine of: one ledger,
cost of goods, mileage, then a Schedule C line-mapped export.
