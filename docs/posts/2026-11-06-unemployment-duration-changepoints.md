---
title: "Every changepoint setup finds the 2009 jump in joblessness, and none calls it one step"
seo_title: "Changepoint detection on US unemployment duration, four setups"
date: 2026-11-06
tags: [changepoint-detector, time-series, case-study]
description: "On 574 months of US median unemployment duration, four changepoint setups cut the 2009 rise two or three times, and the default adds 50 recession cuts."
---

US median unemployment duration swings between 4 and 12 weeks with each recession, then climbs to about 25 weeks in 2009-10 and stays there. It is a documented level shift, so I ran the changepoint detector on it with no tuning (574 months, FRED UEMPMED).

The default mean model gives 53 changes, mostly recession cycles. A bootstrap gives 48. The AR(1)-corrected setup gives 15 and the mean-and-variance model 27. All four find the 2009 rise, but each cuts the ramp from 10 to 25 weeks into two or three steps (AR(1): 2009-02, 2009-06, 2009-11) rather than reporting one.

The honest reading is that the detector is right that something changed and wrong about its shape. One series with one known event is a case study, not a calibration. The open item is a way to merge neighbouring cuts that belong to a single ramp.

Data, tests and table: `ventures/changepoint-detector/` (README, "US median unemployment duration").
