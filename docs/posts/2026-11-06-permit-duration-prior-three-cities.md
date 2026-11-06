---
title: "How long do building permits take? A published prior for Chicago, San Francisco and Austin"
seo_title: "Building permit processing time by city and type: open data"
date: 2026-11-06
tags: [build-data, research, permits, construction]
description: "Empirical q10/q50/q90 permit durations for three US cities from their open data feeds, 2022 to 2024, with the same-day share and the per-type spread."
---

The build-data research programme now publishes a permit-duration prior for three cities as a data file, with the table in the paper.

From each city's open permit feed, 2022 to 2024: Chicago application-to-issue is 0 / 1 / 68 days (q10 / q50 / q90) with 48% issued the same day; San Francisco is 0 / 0 / 95 with 52% same day; Austin is 1 / 25 / 320 with 4.8% same day. Issue-to-completion runs 14 / 119 / 481 days in SF and 7 / 111 / 467 in Austin.

The permit type matters as much as the city. Per-type median application-to-issue runs 0 to 24 days in Chicago, 0 to 533 in San Francisco and 15 to 182 in Austin. Chicago's feed holds only issued permits, so its numbers are survivorship-biased.

These are descriptive quantiles, not advice or a promise about any permit. Files: `research/build-data/results/permit_prior.json` and `permit_prior_table.md`. Still to do: a model-based version and more test years.
