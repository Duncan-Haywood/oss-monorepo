---
title: "Why a work-type label hurt one permit forecast: demolition, not new construction"
seo_title: "Cross-city permit build-time forecasts: where a work-type label backfires"
date: 2026-11-12
description: "A work-type label hurt a cross-city forecast of Seattle build times in 2024. The cost sits in demolition permits, and it did not repeat in 2023."
tags: [research, build-data, construction]
---

# The work-type label's build-time cost was demolition, and only in one year

The build-data programme asks whether open building-permit records predict how long permits and builds take, and whether a model trained in some cities works in another. Seattle is the held-out city. [Last session](2026-11-11-build-data-paired-work-type.md) found that a work-type label read from the permit description helps a transferred model forecast Seattle's time-to-issue. The same label made its 0.9-quantile forecast of build time (issue to completion) worse by 2.2 days. The guess then was that San Francisco and Austin give *new construction* a long completion tail that Seattle doesn't share.

**This session** tested that guess, with predictions written in the log before any run, and repeated the comparison for a second test year.

## The guess was wrong twice over

- **Seattle's tails are the long ones.** Within new construction, the 90th-percentile build time in the source cities (2022 and earlier) is 484 days. In Seattle's 2024 permits it is 654 days: ratio 0.74, 95% interval 0.72 to 0.77. Seattle's median build time is about twice the sources' in every large class. The prediction (sources' tail longer) is refuted.
- **New construction is not where the cost sits.** Splitting the 2024 penalty by class (re-pulled feeds, so it is now 3.0 days) gives new construction 0.4 days of it. **Demolition** carries 1.7 days (56%), at +18 days per permit on Seattle's 398 demolition permits.

Demolition is the one class where the source cities' completion tail is *longer* than Seattle's (ratio 1.20 in 2024, 1.10 in 2023). A reading that fits both years, found after the fact and not yet tested: naming the class imports the source cities' tail for that class. At the 0.9 quantile that hurts only where the imported tail is too long.

## A second test year

| test year | target | quantile | label minus no label, days (95% interval) |
|---|---|---|---|
| 2024 | application to issue | 0.9 | -3.9 (-4.9 to -2.8) |
| 2023 | application to issue | 0.9 | **-5.6 (-6.5 to -4.6)** |
| 2024 | issue to completion | 0.9 | +3.0 (+1.6 to +4.4) |
| 2023 | issue to completion | 0.9 | **-1.6 (-3.4 to +0.1)** |

(Mean pinball loss of the model trained on the other cities; negative means the label helps. 3 seeds, week-block bootstrap.)

The time-to-issue gain repeats, as predicted. The build-time cost does not: in 2023 the interval spans zero. So "the label costs the build-time tail" holds in one test year out of two, and should not be reported as a general finding.

## A note on compute

The first attempt ran three jobs in parallel. The model code hardcodes four LightGBM threads, so twelve threads fought over four cores, and nothing finished in 100 minutes. Run one at a time, each job took 5 to 8 minutes. Thread oversubscription was the bottleneck, not the data.

## Limits and next step

One held-out city, two test years, 3 seeds; the per-class split has no intervals. Seattle's recent permits are right-truncated: a permit still open at the pull has no completion date, so Seattle's observed tails are, if anything, too short. The next run is the test the reading calls for: drop or reweight demolition in the source rows, predicting that the 2024 build-time penalty falls below one day.

Code, data manifest and the log: [`research/build-data`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/build-data). Live page: https://marisstella.app/research/build-data/

*AI-assisted research; numbers are from the code in the repository. Not engineering, legal or financial advice.*
