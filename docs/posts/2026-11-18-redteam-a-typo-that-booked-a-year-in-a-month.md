---
title: "One typo in an end date booked a whole year's revenue in January"
seo_title: "Revenue recognition CSV import: an unparseable period end read as a one-off charge"
date: 2026-11-18
tags: [redteam, testing, javascript, accounting]
description: "A red-team run seeded 16 faults into two tools, closed both real test gaps, and found a revenue schedule that put a full year in month one when an end date had a typo."
---

Today's red-team run seeded 16 small faults into two files and ran each file's own tests after
every one: the engine of the [S3 storage-class checker](https://marisstella.app/s3-storage-class-savings/)
and the schedule code of [Rev Rec](https://marisstella.app/rev-rec/). 11 broke a test. Of the 5
that got through, 3 could not change any output, and the other 2 now have tests that catch them.
Reading the CSV import the way a stranger might use it also turned up one real bug, now fixed.

## The bug: a typo read as "no end date"

Rev Rec's browser demo reads an invoice-line CSV: amount, billing date, period start and an
optional period end. A line with no end is a one-off charge, recognised on its start date. A line
with an end is spread evenly per day across the period.

The import treated "the end didn't parse" the same as "the end is blank". So a $1,200 annual
subscription with its end typed as `2027-13-01` (month 13) became a one-off. The schedule put all
$1,200 into January, showed nothing deferred, and listed nothing in the skipped rows. A bad
*start* date already gets the row skipped with a reason. A bad *end* date gave a confident wrong
schedule instead.

The fix keeps the blank-end case as it was and skips a row whose end is filled in but isn't a
date, with the reason "period end is not a date", which the page shows next to the line count. A
test pins both cases.

## What the tests missed

- **S3 checker, custom retrieval prices.** The engine merges your price overrides over the
  defaults. If the retrieval-price override had been silently dropped, the tests would have
  stayed green, because none of them passed a custom retrieval price. The new test sets Glacier
  retrieval to five times the default and checks the 12-month retrieval cost comes out five
  times larger, with the other classes left alone.
- **Rev Rec, credits on a positive line.** A credit note that names the invoice line it
  refunds is spread over that line's remaining term, so a mid-year refund stops the schedule
  instead of booking one day of negative revenue. That should happen only for negative lines.
  Nothing checked that a positive line with a `credits` value keeps its own date. Now a test does.

The three that changed nothing: a CSV line-ending check that only differs on a blank line (which
is dropped either way), a `<` turned into `<=` on two equal month strings, and a `>` turned into
`>=` one step after the zero case had already returned.

## The numbers

| | Seeded | Caught by the tests | Equivalent | Catch rate |
|---|---|---|---|---|
| Before | 16 | 11 | 3 | 11 of 13 (85%) |
| After the new tests | 16 | 13 | 3 | 13 of 13 (100%) |

Rev Rec and the S3 checker are free and MIT licensed. Their output is an estimate from the data
and assumptions you give them, not accounting, tax or financial advice.
