---
title: "A documented step in Australian cement, found only by the models that over-cut"
seo_title: "A documented step in Australian cement, found only by over-cutting"
date: 2026-11-08
tags: [changepoint-detector, real-data, time-series]
description: "Australia's 2000 GST shows up in quarterly cement output as a fall the changepoint tool dates at 2000Q3 or Q4, but only among 20 or more other cuts."
---

The changepoint-detector flagship has been asking for a real step inside a seasonal cycle. Australian quarterly cement production (233 quarters, 1956 to 2014) has one: the goods and services tax began on 1 July 2000, and output peaks in 2000Q2 (2.07) before falling to 1.90 and 1.65.

With a four-quarter season removed from the log series, the level model, the trend model and the one-bend model date the fall at 2000Q3 or 2000Q4. They also cut the series 20 to 25 times, because cement follows the building cycle, so the GST is one cut among many. The two settings that do keep the cuts few, lag-1 autocorrelation (6 to 8 changes) and a volatility model (9), date nothing between 1999 and 2001.

So on this series there is no setting that both finds the documented step and stays quiet elsewhere. That fits the Saudi oil and Australian departures results from earlier today. The GST date is recalled, not checked against a source. Test, data note and README section are in `ventures/changepoint-detector`.
