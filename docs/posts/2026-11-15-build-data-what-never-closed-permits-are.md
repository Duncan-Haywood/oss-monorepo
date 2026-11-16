---
title: "Expired, void, or done with no date: what three cities' never-closed building permits really are"
seo_title: "What never-completed building permits are in SF, Seattle, Austin"
date: 2026-11-15
description: "Seattle and Austin label most permits that never get a completion date as expired or void; San Francisco's still read issued. Why a forecaster needs that."
tags: [research, build-data, construction, open-data, censoring, data-quality]
---

# Expired, void, or done with no date: what three cities' never-closed building permits really are

The build-data programme forecasts how long a building takes from permit issue to completion. It trains on other cities' open permit feeds and is used in a city it has never seen. A large share of permits in those feeds never get a completion date: 39% in San Francisco, 23% in Seattle and 8% in Austin. [Session 91](2026-11-15-build-data-never-completed-permits.md) showed that reading them all as "still being built" wrecks the model's 0.9 quantile. [Session 92](2026-11-15-build-data-a-censored-score-cannot-pick-the-staleness-cutoff.md) swept a cutoff that treats any permit open longer than *k* years as abandoned. Three years was best for San Francisco and five for Seattle, and a censored validation score couldn't choose between them.

This session asked two questions. Could a cutoff set per source city do better? And what do the feeds themselves say these permits are?

## The feeds' own status fields

A SoQL group-by on each feed's status field, over permits with an issue date and no completion date, queried 15 November 2026:

| city | never completed | what their status says |
|---|---|---|
| San Francisco | 484,215 | since 2010, 84 to 92% of every issue year still reads "issued" |
| Seattle | 33,077 | 41% "expired", 31% "completed" (no date), 25% "issued" |
| Austin | 199,042 | 58% "expired", 26% "void", 14% "active" |

In Austin "active" is 0 to 2% of each issue year up to 2021. It rises to 15% for 2024 and 92% for 2026, which is what real builds still running look like. Seattle's "completed with no date" is mostly 2010 to 2015 (56 to 84% of each of those years), about 10,000 finished builds whose completion date is simply missing. *(Correction, 16 November 2026: they are not. 71% of those issued 2010 to 2022 say "Closed as Incomplete" in their description, so they were closed at expiry, not finished; see [the label audit](2026-11-16-build-data-completion-dates-are-builds-not-closures.md).)* In San Francisco an abandoned permit and a running one look the same.

So two of the three feeds already say which open permits are dead, and one also holds finished builds that the data treats as open. There is a catch. The status is the status *today*, not on the forecast date, so a model trained on it learns from the future. It is safe only on permits old enough that their status would already have settled by the forecast date.

## A cutoff per source city

Session 92's sweep used one cutoff for every source city. Here each source got its own: the 99th percentile of its own build times, counting only builds completed by the forecast date, which a deployment can compute. That comes to about 3.1 years for Austin, 3.3 for San Francisco and 6.4 for Seattle.

Change in 0.9-quantile pinball loss on completed test-year permits, in days, against a model trained with hindsight labels (cascade2 work-type class, 3 seeds; lower is better):

| held-out city, year | 3 years | 5 years | per-source 99th pct |
|---|---|---|---|
| San Francisco 2021 | +0.90 | +2.46 | −0.34 |
| San Francisco 2022 | +0.05 | +3.10 | +1.98 |
| Seattle 2021 | +1.50 | −3.95 | +0.66 |
| Seattle 2022 | +0.73 | −3.22 | +0.01 |
| mean | +0.80 | −0.41 | +0.58 |

The per-source rule lands between the two fixed cutoffs and beats neither on average. The reason is in which cities are sources. With Seattle held out, both sources get a cut near 3 years, so the model behaves like the 3-year one and loses Seattle's 5-year gain. With San Francisco held out, Seattle as a source is cut at 6.5 years, which keeps Seattle's own never-closed records, and San Francisco pays a little for that. The prediction that every per-source cut would fall between 2 and 5 years failed on Seattle.

The lesson is that a cutoff set from the source cities can't know what the target city needs. A short-tailed target wants short tails and a long-tailed one wants the long builds kept. The status fields above are the more direct signal.

## A replication for free

This run and session 92 started the same sweep in the same few minutes, on separate machines. Session 92 landed first. This run's 2-, 3- and 8-year models reproduce session 92's 0.9-quantile test losses to every printed digit in all 12 cells. The predictions here were committed before any model ran. Four of five held.

## Next

Next: fit, per source city and work class, the chance that an open permit ever gets closed. Austin's and Seattle's settled statuses (expired and void against completed and final, on permits at least three years old) supply the labels. Then each open permit is weighted by that chance instead of cut at a fixed age. We'll also try to date Seattle's "completed" permits from another field and return them as finished builds.

Code, results and the full log: [`research/build-data`](../../research/build-data/) ([`LOG.md`](../../research/build-data/LOG.md), session 93).
