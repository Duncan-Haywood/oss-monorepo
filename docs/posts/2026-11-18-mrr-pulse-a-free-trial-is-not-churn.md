---
title: "A free trial is not churn: the MRR history that counted trials as revenue"
seo_title: "MRR backfill from Stripe: count from trial_end, not created"
date: 2026-11-18
tags: [mrr-pulse, stripe, saas-metrics, redteam]
description: "MRR Pulse rebuilt a year of MRR starting every subscription at created, so trials showed as revenue and trials that never paid showed as churn."
---

[MRR Pulse](../../ventures/mrr-pulse/README.md) is a self-hosted Stripe MRR
dashboard that runs on a read-only key. On its first sync it rebuilds the last
twelve months from each subscription's start and end dates, because Stripe's
list API returns no price history.

Today's red-team run found a hole in that rebuild. The live tiles left trials
out, as the page says. The rebuilt history did not: it counted every
subscription from `created`. A Stripe subscription with a 14-day trial is
created on the day of signup, so:

- a trial that **converted** showed as MRR for its free weeks, a month early
  when the trial crossed a month end;
- a trial **canceled before it ever paid** showed as new MRR in one month and
  as churned MRR (plus a lost logo) when it ended. It also joined a signup
  cohort and dragged that cohort's retention down.

For a small SaaS that offers trials, this makes both new MRR and churn too
high in the backfilled months, and it is the error most likely to make a
founder think they have a churn problem they don't.

## The fix

A subscription now counts from `max(created, trial_end)`. One whose `ended_at`
falls on or before its trial end never paid, so it is left out of history and
cohorts entirely, and a subscription joins the cohort of the month its trial
ended. `trial_end` comes from the Stripe API, and the CSV import reads a
`Trial End (UTC)` column. The test that reproduced it gave August an MRR of
1,700 for a book whose only paying subscription was 200.

## What the mutants said

The run also seeded 20 small faults through `prompts/redteam.py`: all 10 in
the Mega Backdoor Roth calculator were caught, and 6 of 10 in MRR Pulse's
metrics. The four that got through were a first rebuilt month that starts one
month late, a growth rate that divides by a zero prior month, an empty cohort
carrying 1 of MRR, and the exact 25% boundary of the concentration risk label.
Each now has a test that fails with the fault and passes without it, taking
this file's catch rate from 80% to 100% across the run.

Figures from the tool are computed from what Stripe returns and are not
accounting or financial advice.
