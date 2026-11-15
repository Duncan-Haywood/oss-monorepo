---
title: "When is an open building permit dead? Three years in San Francisco, five in Seattle"
seo_title: "When to treat an open building permit as abandoned"
date: 2026-11-15
description: "Sweeping a staleness cut for never-completed permits in a borrowed build-time model: 3 years suits SF, 5 suits Seattle, 8 brings back a 20-day tail error."
tags: [research, build-data, construction, censoring, quantile-regression, open-data]
---

# When is an open building permit dead? Three years in San Francisco, five in Seattle

The build-data programme forecasts how long a building takes from permit issue to completion. It trains on other cities' open permit feeds and is used in a city it has never seen. [The last session](2026-11-15-build-data-never-completed-permits.md) found that 39% of San Francisco's issued permits and 23% of Seattle's never get a completion date. Put back as "still open" rows, they wreck the model's 0.9 quantile. Dropping any permit open for more than five years fixed that on average, but the five years was a guess fixed before the run. It helped Seattle and cost San Francisco.

This session swept the cut. All models are LightGBM on the censored pinball loss, cascade2 work-type class, 3 seeds, test years 2021 and 2022.

## The sweep

Change in 0.9-quantile pinball loss on completed test-year permits, in days, against a model trained with hindsight labels (lower is better):

| held-out city, year | no never-completed | 2 years | 3 years | 5 years | 8 years | per-source 99th pct |
|---|---|---|---|---|---|---|
| San Francisco 2021 | +0.86 | +3.54 | +0.90 | +2.46 | +19.09 | −0.34 |
| San Francisco 2022 | +0.23 | +1.19 | +0.05 | +3.10 | +21.73 | +1.98 |
| Seattle 2021 | +2.94 | +5.53 | +1.50 | −3.95 | −0.98 | +0.66 |
| Seattle 2022 | +2.48 | +1.68 | +0.73 | −3.22 | −0.78 | +0.01 |
| mean | +1.63 | +2.99 | +0.80 | −0.41 | +9.77 | +0.58 |

The seed-to-seed spread is 0.1 to 1.9 days for every column except 8 years. So:

- **Eight years is too long.** San Francisco's tail error comes back at +19 to +22 days.
- **Three years is right for San Francisco** and five for Seattle, each by 2 to 5 days, more than the seed noise.
- **No single age works for both.** The best fixed cut is 3 years in both San Francisco cells and 5 years in both Seattle cells.

## Why the right age differs

The last column sets a separate cut for each source city at its own 99th-percentile build time, using only builds completed by the forecast date, so a deployment could compute it. That gives about 3.1 years for Austin, 3.3 for San Francisco and 6.4 for Seattle. Seattle's real builds run longer. A Seattle-like target needs those long, still-open builds kept, and San Francisco's never-closed records must go.

This rule gets the direction right. But it puts Seattle's cut where Seattle's own never-closed records still sit, and with San Francisco held out the model pays for that. On average it lands between the two fixed cuts.

One quirk of the design surfaced too. The model trains on years up to Y−4 plus Y−2, so the 2-year and 3-year cuts train on the same rows. They differ only in the early-stopping year, whose open permits are 2 to 3 years old. Taking those out of early stopping alone costs 2.2 days at q0.9.

## What the feeds say about their own dead permits

A SoQL group-by on each feed's status field, over permits with an issue date and no completion date:

| city | never completed | what their status says |
|---|---|---|
| San Francisco | 484,215 | since 2010, 84 to 92% of every issue year still reads "issued" |
| Seattle | 33,077 | 41% "expired", 31% "completed" (no date), 25% "issued" |
| Austin | 199,042 | 58% "expired", 26% "void", 14% "active" (0 to 2% of each year up to 2021) |

Austin and Seattle say which permits are dead. Seattle also holds thousands of finished builds whose completion date is missing, most of them issued 2010 to 2015. San Francisco's feed can't tell an abandoned permit from a running one. A status field is the status at the time of the pull, though, not on the forecast date. Training on it would leak the future unless the feed keeps a status history.

## Next

Next: weight each open permit by the chance it is a real build still running, estimated per source and class from Austin's and Seattle's settled statuses, instead of a hard cut. We'll also try to date Seattle's "completed" permits from another field, and run Austin as a held-out city.

Code, results and the full log: [`research/build-data`](../../research/build-data/) ([`LOG.md`](../../research/build-data/LOG.md), session 92). The predictions were written before any model ran. Four of five held; the one that failed said the per-source rule would set every cut between 2 and 5 years.
