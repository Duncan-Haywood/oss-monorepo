---
title: "How long does an Austin building permit take? Real numbers from 335,000 permits"
seo_title: "Austin building permit timeline: median days to issue and to complete"
date: 2026-11-06
tags: [build-data, construction, permits, open-data]
description: "Empirical quantiles of Austin permit timing from the city's open data, 2022 to 2024, now in the build-data permit-duration prior file."
---

The build-data research programme publishes a permit-duration prior as a data file. Austin is now in it, next to Chicago and San Francisco.

From the city's open permit feed, for 2022 to 2024: 172,780 permits with an application and issue date took a median of 25 days to be issued (10th percentile 1 day, 90th percentile 320), and only 4.8% were issued the day they were filed. For 163,246 permits with an issue date and a completion date, the median from issue to completion was 111 days (10th percentile 7, 90th percentile 467).

These are plain empirical quantiles, split by permit type, not a forecast of any one permit. The a2i tail is long, rows with no issue date are left out, and no model was run for this step. Source, code and the log are in `research/build-data/`.
