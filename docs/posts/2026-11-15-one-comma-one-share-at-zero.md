---
title: "One comma, one share at $0: how an unquoted 1,000 broke three free tools"
seo_title: "Unquoted thousands separators in CSV imports: a silent wash-sale bug"
date: 2026-11-15
tags: [redteam, testing, csv, wash-sale, bookkeeping, open-source]
description: "Three free tools misread a CSV row like buy,1,000,150.00 without a warning. The fix, and a check that probes every journal converter the same way."
---

Spreadsheets write the number one thousand as `1,000`. Save that sheet as a
CSV without quoting the cell and the row `2025-01-02,AAPL,buy,1,000,150.00`
has six fields under a five-column header. The quantity column now holds `1`,
the price column holds `000`, and the real price falls off the end.

Today's red-team run on the [wash-sale checker](../../ventures/wash-sale-checker/)
tried exactly that. The checker read the row as **1 share at $0.00** and said
nothing. A 1,000-share sale at a $10,000 loss, rebought ten days later, came
out as no loss and no wash sale. A user would have seen a clean report.

## The same bug in two journal converters

The repository has about two dozen `*-to-journal` tools that turn a payout or
statement export into accounting journals. Most of them already caught a split
amount, because their reconciliation checks failed: gross minus fee no longer
equalled net, or an amount stopped being a number. Two did not:

- **payoneer-statement-to-journal.** The shift moved `157.10` into the Status
  column, so the row was skipped as "not completed" with only an info note. A
  $1,001.40 fee was left out of the journal.
- **youtube-adsense-payout-to-journal.** `1,842.17` became a $1.00 payment. If
  the file had a currency column, the only sign was a confusing "No
  842.17-to-GBP rate". Without one there was no warning at all.

All three tools now refuse a row with more non-empty fields than its header.
The error names the line and says to quote the amount or remove the comma. A
trailing empty field, which some brokers add to every row, is still read.
Each fix came with a test that failed first.

## A check instead of a one-off

`platform/ci/check_column_shift.py` takes each journal tool's own sample
export, splits its first plain decimal amount the way a spreadsheet would, and
requires a new error or warning. On its first run it found the AdSense tool,
which the hand-written probe had skipped. CI runs it on any pull request that
touches `ventures/`, through `unwired_checks.py`, with no workflow edit
needed. It prints the six tools it cannot probe yet (their samples have no
plain decimal amount, or they need a platform id), so those count as
unchecked, not as passing.

## The seeded faults

The run also seeded 24 faults into the wash-sale, UCR fee and Section 1256
calculators. Two could not change any output: one moved the 30-day window by
30 milliseconds on dates that are always midnight, and the other flipped a
sign that every caller passes through `Math.abs`. Of the other 22, the tests
caught 21. The one that escaped would have shown the Section 1256 "costs you
more" note next to the "saves you" note on every gain. It is now covered,
so 22 of 22 are caught.

The wider point is that "refused" beats "read as something else". A parser
that guesses after a column shift will give a confident wrong number, and a
wrong number with no warning is worse than an error message.
