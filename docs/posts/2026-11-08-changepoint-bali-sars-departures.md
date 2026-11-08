---
title: "A changepoint detector on 41 years of Australian travel: Bali and SARS are not found"
seo_title: "A changepoint detector on 41 years of Australian travel"
date: 2026-11-08
tags: [changepoint-detector, negative-result, time-series]
description: "Monthly Australian resident departures 1976-2017: no seasonal mean model cuts at the Bali bombing or SARS, and the trend model's nearest cut is a month early."
---

We ran the changepoint-detector on 498 months of short-term resident departures from Australia (`fpp2::departures`). Two shocks are documented: the Bali bombing in October 2002 and SARS in April to June 2003.

With a 12-month season, the seasonal mean model cuts 42 times and the AR(1) model 28. Neither has a cut between 2002-09 and 2003-07. The trend model cuts 21 times, one of them at 2003-03, a month before SARS began, which we read as a nearby trend break rather than a detection. The series grows about eightfold with a widening season, so most cuts are the staircase-on-drift over-fit the tool already warns about.

So a short dip inside a growing, widening season sits below what the penalty keeps. The test (`au-departures.test.mjs`) pins these counts. Still wanted: a documented real step inside a cycle.
