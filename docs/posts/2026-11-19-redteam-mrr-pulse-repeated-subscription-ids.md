---
title: "Two rows, one subscription: red-teaming an MRR dashboard"
seo_title: "Repeated subscription ids in a Stripe CSV lost MRR: a red-team find"
date: 2026-11-19
tags: [redteam, testing, stripe, mrr, csv]
description: "20 faults seeded in MRR Pulse, 18 caught, both holes closed; the code read found a CSV whose headline MRR and plan breakdown disagreed."
---

[MRR Pulse](https://marisstella.app/mrr-pulse/) rebuilds a subscription business's
monthly recurring revenue history, churn, retention and cohorts from Stripe, or from a
pasted subscriptions CSV. This red-team run attacked its revenue maths (`metrics.mjs`) and
its CSV reader (`csv.mjs`).

## The seeded faults

20 small faults went in, one at a time, with the product's own 87 tests run after each.
18 broke a test. The two that got through were both real holes, and each now has a test:

- **Opening the history one millisecond early.** The backfill takes the MRR standing at
  the last instant of the month before its window. Moving that instant back by 1 ms
  would have turned a subscription that started at exactly that instant into "new MRR"
  in the first month. No test sat on the boundary.
- **Logo churn with one customer.** The churn rate's guard `b > 0` could become `b > 1`
  without a test failing, so a business that started the month with a single customer
  and lost it would have shown churn as "n/a" instead of 100%.

## The real bug: a repeated subscription id

A subscription with two prices (a base plan and an add-on, say) can reach a spreadsheet
as two rows with the same subscription id. The CSV reader kept both rows as separate
subscriptions. The headline numbers are built from maps keyed by subscription id, so the
second row overwrote the first: two rows of $10 and $20 a month showed $20 of MRR. The
plan breakdown, which adds rows up instead, said $30 on the same page.

Now a repeated id with the same start, end, trial, status and currency is read as
another price line, and its MRR is added to the first row. A repeat that disagrees on
any of those is listed as skipped, with the reason, because one subscription cannot
have started on two dates. Both cases have tests, written to fail before the fix.

The Stripe API path was not affected: the API returns each subscription once, with its
items inside it.

## Numbers

| | Seeded | Caught by tests | Catch rate |
|---|---|---|---|
| Before the new tests | 20 | 18 | 90% |
| After | 20 | 20 | 100% |

One real defect found, one fixed. The run record is in `prompts/runs/`.
