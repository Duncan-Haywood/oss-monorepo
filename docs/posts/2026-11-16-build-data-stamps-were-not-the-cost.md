---
title: "Austin's 180-day permit stamps were not what cost our Seattle forecast; its withdrawn permits were"
seo_title: "Austin permit stamps vs closures: what moves a build-time forecast"
date: 2026-11-16
description: "The 180-day expiry stamps are 83% of Austin's dead permit rows, but the long withdrawn closures move a borrowed Seattle build-time forecast."
tags: [research, build-data, construction, open-data, data-quality]
---

# Austin's 180-day permit stamps were not what cost our Seattle forecast; its withdrawn permits were

The build-data programme forecasts how long a construction permit takes from issue to completion, using open permit feeds from San Francisco, Seattle and Austin. A model trained on two cities forecasts the third. The [last post](2026-11-16-build-data-austin-180-day-expiry-stamp.md) found that 6.5 to 8.6% of the training rows belong to permits the city calls dead (void, expired, withdrawn) but that still carry a completion date. Most of them are Austin permits from before 2000 stamped exactly 180 days after issue: an expiry date written into the completion field. Dropping every dead row made the forecast of the slowest tenth of Seattle's builds (the 0.9 quantile) 1.8 to 3.5 days worse.

Two kinds of rows were dropped together there: the stamps, and the other dead close-outs. This session separated them. As before, we committed five predictions before any model ran.

## Stamps are most of the rows, not most of the cost

| Held-out city, year | keep all | drop stamps only | drop all dead |
|---|---|---|---|
| San Francisco 2021 | 72.35 | 72.77 | 72.49 |
| San Francisco 2022 | 61.21 | 62.28 | 61.03 |
| Seattle 2021 | 85.61 | 86.60 | 89.12 |
| Seattle 2022 | 69.91 | 70.00 | 71.75 |

*Mean pinball loss at the 0.9 quantile in days, lower is better, 3 seeds, completed test permits. The model trains on the other two cities and drops any source permit open more than five years.*

The 180-day stamps make up 82 to 83% of the dead rows (about 139,000 of 167,000 to 170,000). Dropping only them changes the loss by +0.64 days on average, within the spread between seeds in three of the four city-years. Seattle's cost comes from the remaining fifth: real-looking close-outs, mostly Austin permits marked withdrawn, whose durations run long (their 90th percentile is about 1,080 days, nearly three times a finished permit's). Without them Seattle is worse in all six seed-by-year runs, by 0.4 to 3.8 days. San Francisco improves without them in five of six.

So the closures are not noise to scrub out. Seattle's builds run long, and Austin's long withdrawn permits apparently look enough like Seattle's own slow tail to help predict it. San Francisco's builds are shorter, and the same rows pull its forecast the wrong way.

## The staleness cut does not care

An earlier session found that the best rule for dropping stale open permits depends on the city: cut at 3 years for San Francisco, 5 for Seattle. We refit the 3-year cut on cleaned sources. The pattern holds: 3 years still wins in San Francisco (71.02 against 72.49, 58.95 against 61.03) and loses in Seattle (91.76 against 89.12, 74.89 against 71.75). Cleaning costs the 3-year model 0.68 days on average, worse in 11 of 12 seeds.

## Predictions

Three of the five held: the stamps' share of the dropped rows (T1), the city pattern of the cut (C1) and the size of cleaning's effect at 3 years (C2). Two were refuted: that the stamps carry Seattle's cost (T2), and that the other closures barely matter (T3). Our previous explanation, that the stamps were a short-duration anchor holding the tail model down, does not survive for Seattle.

## What a practitioner can take from it

If you train build-time models on Austin's permit feed, drop the 180-day completion stamps on void and expired permits from before about 2005. They are a labelling artefact, and removing them costs little. Keep the other dead close-outs, and check what they do for each target city rather than assuming they are noise. Choose the staleness cut per city whether or not you clean.

Limits: 0.9 quantile only, 3 seeds (per-cell differences under about a day are inside seed spread), San Francisco and Seattle held out, Austin not. The stamp is inferred from the label distribution, not from Austin's documentation. The models we compare against were reused from earlier sessions on identical feed counts; one was refit to check, and it matched to every digit.

Code, data pull and results: [`research/build-data`](../../research/build-data/README.md), session 96 in [`LOG.md`](../../research/build-data/LOG.md), numbers in [`rounds_score_stamp_i2c_summary.json`](../../research/build-data/results/rounds_score_stamp_i2c_summary.json).
