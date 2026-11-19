---
title: "\"Cancelled\" with two Ls: the subscriptions an MRR history forgot"
seo_title: "A CSV status spelled 'Cancelled' erased churn from an MRR history"
date: 2026-11-19
tags: [redteam, testing, mrr-pulse, csv, saas-metrics]
description: "A CSV status spelled 'Cancelled' made those subscriptions vanish from every month of MRR history, churn uncounted, nothing flagged. Fixed and guarded."
---

[MRR Pulse](https://marisstella.app/mrr-pulse/) rebuilds monthly recurring revenue,
churn and retention from Stripe or from a pasted subscriptions CSV. A second red-team
pass today went back at its CSV reader (`csv.mjs`) and revenue maths (`metrics.mjs`).

## The real bug: a status nobody downstream knew

Stripe writes `canceled`, one L. A sheet typed by hand, or exported from a billing tool
that writes British English, says `Cancelled`. The reader lowercased the status and
kept the row, but every rule after it (which months a subscription is alive in, what
counts as live MRR, which cohort it joins) tests for Stripe's exact words. A
`cancelled` row matched none of them, so it was left out of every month.

A two-row example: subscription A pays $10 a month and is still active; B paid $20 from
January and cancelled on 10 June. The history should show $30 of MRR from January to
May and $20 of churn in June. It showed $10 all year and no churn at all. The row was
not in the "skipped" list either, so nothing on the page said a third of the revenue
had gone missing. `Past due` with a space had the same fate, and so did any other word
(`expired`, `churned`).

The fix reads statuses the way people write them (case, spaces and hyphens folded,
`cancelled` read as `canceled`) and lists anything outside Stripe's eight statuses as
skipped, with the word quoted. A fuzzed test now builds 50 random sheets from good and
bad statuses, amounts, intervals and dates, and checks two things on each: every row is
either counted or listed as skipped, and every counted row carries a status the maths
understands. On the old reader that test fails.

## The seeded faults

18 small faults went in through the repository's mutation tool, one at a time, with the
product's tests run after each. 13 broke a test. Of the 5 that got through, 2 change
nothing a user can see (a guard repeated one line later, and a random draw that never
lands exactly on 0.28 in the demo data). The other 3 were real holes, each now tested:

- a lone carriage return (old Mac line endings) could swallow the first character of
  the next row;
- the skipped-row list was never checked for line order when a currency skip came
  before a row skip;
- the plan breakdown with no paying subscriptions could report a largest customer of 1
  cent instead of 0.

Catch rate on this run's faults: 13 of 16 that matter before the new tests, 16 of 16
after.
