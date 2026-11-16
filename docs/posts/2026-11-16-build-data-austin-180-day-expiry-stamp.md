---
title: "Austin's commonest permit build time, 180 days, is an expiry stamp, and removing it made our forecast worse"
seo_title: "Austin permit data: the 180-day completion date is an expiry stamp"
date: 2026-11-16
description: "143,212 Austin permits show exactly 180 days from issue to completion, mostly voids before 2000. Dropping them cost a borrowed build-time model up to 3.5 days."
tags: [research, build-data, construction, open-data, data-quality]
---

# Austin's commonest permit build time is a 180-day expiry stamp, and removing it made our forecast worse

The build-data programme forecasts how long construction takes, from permit issue to completion, using open permit feeds from San Francisco, Seattle and Austin. The [last post](2026-11-16-build-data-completion-dates-are-builds-not-closures.md) checked whether completion dates are real builds. It found that only 0.04 to 1.5% of them sit on permits the city calls dead (expired, void, withdrawn), counting permits issued from 2010 to 2022. This session removed those rows from the model's training data to see what they cost. We wrote five predictions down and committed them before any model ran.

## The 1.5% was really 9%

The models train on every year in the feed, back to the 1980s, not just 2010 onwards. Over that whole history the dead completions are 6.5 to 8.6% of the training rows, and 98 to 99.8% of them are Austin's. Among Austin permits issued before 2000, 16% are void or expired but still carry a completion date.

Then the build-time distribution showed something odd. Those old dead permits have a median build time of 180 days, and a 90th percentile of 180 days too.

| Austin, dated completions | rows | exactly 180 days |
|---|---|---|
| dead, issued before 2000 | 140,722 | 96.3% |
| dead, issued 2000 to 2009 | 18,326 | 20.0% |
| dead, issued 2010 to 2022 | 11,211 | 0.3% |
| done (any era) | 1.84 million | 0.2% |

180 days is the single most common build-time label in Austin's whole feed: 143,212 permits out of 2.18 million, more than twice the next one (1 day, 53,965). San Francisco's and Seattle's dead permits show no such spike. Until about 2005, Austin appears to have written a void or expired permit's expiry date into its completion field. We inferred that from the data. We did not find it in Austin's documentation. Anyone who reads Austin's open permit data as build times should drop these rows, or at least know they are there.

## Removing them made the forecast worse

We refit the borrowed model with the dead completions removed. The borrowed model is trained on two cities and predicts the third, using only what was known on 1 January of the test year. We scored it on the 0.9 quantile, the "how bad could it get" estimate, against the same model refit on the same pull with the dead rows kept.

| held-out city, year | change in 0.9-quantile loss (days) |
|---|---|
| San Francisco 2021 | +0.14 |
| San Francisco 2022 | −0.18 |
| Seattle 2021 | +3.51 |
| Seattle 2022 | +1.84 |

Seattle got worse in all six seeds. San Francisco did not move. We had predicted the opposite, that the change would be within a day and that predictions would come down. They went up: dropping a block of 180-day labels, far below the 0.9 quantile, moves the quantile up. The Seattle tail models also trained about twice as long.

Three of the five predictions were refuted. The two that held were a check that the unchanged model reproduces last week's numbers to the digit, which it did, and a prediction about permits that died during the test year, which tells us little because those years hold at most 33 such permits.

## What it means

The closures were not what was holding the forecast back. The stamped rows were wrong as labels, but they were working as a short-duration anchor in training. The model's other settings, such as when it treats an old open permit as abandoned, were tuned with that anchor in place. The next session reruns that tuning on the stamp-free data. It will also drop only the 180-day stamps, keeping the other dead permits, to separate the stamp's effect from the closures'.

Code, data pulls and every number: [`research/build-data`](../../research/build-data/), session 95 in its [`LOG.md`](../../research/build-data/LOG.md).
