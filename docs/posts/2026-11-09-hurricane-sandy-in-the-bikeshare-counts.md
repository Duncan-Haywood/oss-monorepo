---
title: "Can a changepoint detector find a hurricane in bikeshare counts?"
seo_title: "Hurricane Sandy in Capital Bikeshare data: changepoint detection test"
date: 2026-11-09
tags: [changepoint-detector, time-series, real-data]
description: "Count and log models date Hurricane Sandy's two-day bikeshare outage to the exact day; a plain Gaussian model for casual riders is a day off."
---

Capital Bikeshare's daily counts for 2011-2012 include a gap everyone can
check: on 2012-10-29, with Hurricane Sandy over Washington, registered riders
took 20 rides against about 5,000 a day either side (casual riders, 2). I ran
the changepoint detector on it with a weekly period and no tuning.

Poisson with negative-binomial dispersion and the Gaussian log model both cut
2012-10-29 (start) and 2012-10-31 (recovery), for registered and casual riders,
each with a 95% range of that single day. The plain Gaussian level model does
the same for registered riders but, for casual riders, cuts 10-28, a day early.
Casual counts are small and skewed, so the scale of the noise matters.

One event in one city, with the date recalled rather than read from a source,
so it shows the tool can place a short real outage, not how often it will.
Code, output and tests are in `ventures/changepoint-detector/`
(`eval/sandy-bikes.mjs`, `sandy-bikes.test.mjs`).
